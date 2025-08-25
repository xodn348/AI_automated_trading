const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL
} = require('@solana/web3.js');
const { AnchorProvider, Program, BN } = require('@project-serum/anchor');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');
const crypto = require('crypto');

// Helper function to compute account discriminator
function getAccountDiscriminator(name) {
  // Following Anchor's discriminator computation
  const preimage = `account:${name}`;
  return Buffer.from(
    crypto.createHash('sha256')
      .update(preimage)
      .digest()
  ).slice(0, 8);
}

// Dynamic fetch import
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Solend program IDs
const SOLEND_PROGRAM_ID = new PublicKey('So1endDq2YkqhipRh3WViPa8hdiSpxWy6z3Z6tMCpAo'); // Devnet
const LENDING_MARKET_MAINNET = new PublicKey('4UpD2fh7xH3VP9QQaXtsS1YY3bxzWhtfpks7FatyKvdY');
const LENDING_MARKET_DEVNET = new PublicKey('DnTQJYJZGHPKzjM46ZxXgW1E2e5JQcQvG9J3wKDB2dSk');

// Reserve structure - will be used for health factor calculation
const RESERVE_LAYOUT = {
  version: 0,
  lastUpdate: {
    slot: 0,
    stale: false
  },
  lendingMarket: LENDING_MARKET_DEVNET,
  liquidity: {
    mintPubkey: null,
    mintDecimals: 0,
    supplyPubkey: null,
    feeReceiver: null,
    oraclePubkey: null,
    availableAmount: new BN(0),
    borrowedAmountWads: new BN(0),
    marketPrice: new BN(0)
  }
};

class SolendLiquidationBot {
  constructor(config) {
    // Devnet RPC configuration
    this.rpcUrl = 'https://api.devnet.solana.com';
    this.connection = new Connection(this.rpcUrl, 'confirmed');
    
    // Load wallet from validator keypair
    this.wallet = this.loadWallet(config.validatorKeyPath);
    
    // Solend program setup
    this.provider = new AnchorProvider(
      this.connection, 
      { 
        publicKey: this.wallet.publicKey, 
        signTransaction: async (tx) => {
          tx.sign(this.wallet);
          return tx;
        }
      },
      { 
        preflightCommitment: 'confirmed',
        commitment: 'confirmed' 
      }
    );
    
    try {
      // Load IDL from file
      const idlPath = path.join(__dirname, 'solend_devnet_idl.json');
      const idlFile = fs.readFileSync(idlPath, 'utf8');
      const idl = JSON.parse(idlFile);
      
      // Initialize program
      this.solendProgram = new Program(idl, SOLEND_PROGRAM_ID, this.provider);
      console.log('Solend program initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Solend program:', error);
      throw error;
    }
    
    // Token mint addresses for common assets
    this.TOKEN_MINTS = {
      SOL: new PublicKey('So11111111111111111111111111111111111111112'),
      USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v')
    };
    
    // Bot configuration
    this.checkInterval = config.checkInterval || 5000;
    this.minProfitThreshold = config.minProfitThreshold || 0.01;
    
    // Bot statistics
    this.stats = {
      startTime: new Date(),
      liquidationAttempts: 0,
      successfulLiquidations: 0,
      failedLiquidations: 0,
      lastScanTime: null,
      totalProfitUSD: 0,
      totalOpportunitiesFound: 0
    };

    // Initialize reserves map
    this.reserves = new Map();
  }

  // Load wallet from raw byte array or file
  loadWallet(validatorKeyPath) {
    try {
      console.log(`Loading wallet from: ${validatorKeyPath}`);
      
      // Read file contents
      const keyfileContent = fs.readFileSync(validatorKeyPath, 'utf8').trim();
      
      let secretKey;
      
      // Check if content looks like a JSON array or raw byte array string
      if (keyfileContent.startsWith('[') && keyfileContent.endsWith(']')) {
        // Parse as JSON array
        secretKey = Uint8Array.from(JSON.parse(keyfileContent));
      } else {
        // Attempt to parse as raw bytes (comma-separated)
        secretKey = Uint8Array.from(keyfileContent.split(',').map(Number));
      }

      // Validate key length (Solana keypair is 64 bytes)
      if (secretKey.length !== 64) {
        throw new Error(`Invalid secret key length. Expected 64, got ${secretKey.length}`);
      }

      // Create Keypair
      const keypair = Keypair.fromSecretKey(secretKey);
      
      console.log(`Wallet loaded successfully. Public Key: ${keypair.publicKey.toString()}`);
      return keypair;
    } catch (error) {
      console.error('Wallet loading failed:');
      console.error('Error details:', error);
      console.error('Possible issues:');
      console.error('1. Incorrect file format');
      console.error('2. Corrupted key file');
      console.error('3. Invalid byte array');
      throw error;
    }
  }

  // Debugging method to print wallet details
  async debugWalletInfo() {
    try {
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      console.log('Wallet Debug Information:');
      console.log(`Public Key: ${this.wallet.publicKey.toString()}`);
      console.log(`Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (error) {
      console.error('Wallet debug failed:', error);
    }
  }

  // Utility function for delay
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async fetchTokenPrices(tokens = ['SOL', 'USDC']) {
    try {
      const tokenMints = tokens.map(token => this.TOKEN_MINTS[token].toString());
      const queryString = `ids=${tokenMints.join(',')}`;
      
      // Use correct Jupiter lite API endpoint format
      const response = await fetch(`https://lite-api.jup.ag/price/v2?${queryString}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const priceData = await response.json();
      
      const prices = {};
      tokens.forEach(token => {
        const mint = this.TOKEN_MINTS[token].toString();
        if (priceData.data && priceData.data[mint]) {
          prices[token] = priceData.data[mint].price;
        } else {
          console.warn(`No price data found for token: ${token}`);
          prices[token] = 0;
        }
      });
      
      return prices;
    } catch (error) {
      console.error('Price fetching failed:', error);
      return tokens.reduce((acc, token) => {
        acc[token] = 0;
        return acc;
      }, {});
    }
  }

  // Calculate health factor for an obligation
  async calculateHealthFactor(obligation) {
    try {
      // Fetch current market prices
      const prices = await this.fetchTokenPrices();
      if (!prices) return Infinity;

      let totalCollateralValue = 0;
      let totalBorrowValue = 0;

      // Safely handle deposits
      if (obligation && obligation.deposits && Array.isArray(obligation.deposits)) {
        for (const deposit of obligation.deposits) {
          const reserve = this.reserves.get(deposit.depositReserve.toString());
          if (!reserve) continue;

          const tokenPrice = prices[reserve.liquidity.mintPubkey.toString()] || 0;
          const depositValue = new BN(deposit.depositedAmount).mul(new BN(tokenPrice))
            .div(new BN(10 ** reserve.liquidity.mintDecimals));
          
          const ltv = reserve.config?.loanToValueRatio || 0.8;
          totalCollateralValue += depositValue.toNumber() * ltv;
        }
      }

      // Safely handle borrows
      if (obligation && obligation.borrows && Array.isArray(obligation.borrows)) {
        for (const borrow of obligation.borrows) {
          const reserve = this.reserves.get(borrow.borrowReserve.toString());
          if (!reserve) continue;

          const tokenPrice = prices[reserve.liquidity.mintPubkey.toString()] || 0;
          const borrowValue = new BN(borrow.borrowedAmount).mul(new BN(tokenPrice))
            .div(new BN(10 ** reserve.liquidity.mintDecimals));
          
          totalBorrowValue += borrowValue.toNumber();
        }
      }

      // Calculate health factor
      if (totalBorrowValue === 0) return Infinity;
      const healthFactor = totalCollateralValue / totalBorrowValue;

      console.log(`Health Factor Calculation:
        Total Collateral Value: ${totalCollateralValue}
        Total Borrow Value: ${totalBorrowValue}
        Health Factor: ${healthFactor.toFixed(4)}
      `);

      return healthFactor;
    } catch (error) {
      console.error('Health factor calculation failed:', error);
      return Infinity;
    }
  }

  // Find liquidatable obligations
  async findLiquidatableObligations() {
    try {
      // Get the account discriminator for Obligation
      const discriminator = getAccountDiscriminator('Obligation');
      const discriminatorBase58 = bs58.encode(discriminator);

      // Get all program accounts with proper filtering
      const obligationAccounts = await this.connection.getProgramAccounts(
        this.solendProgram.programId,
        {
          commitment: 'confirmed',
          filters: [
            {
              memcmp: {
                offset: 0,
                bytes: discriminatorBase58
              }
            }
          ]
        }
      );

      const liquidatableObligations = [];

      for (const account of obligationAccounts) {
        try {
          // Decode the obligation data using Anchor's coder
          const decodedObligation = this.solendProgram.coder.accounts.decode(
            'Obligation',
            account.account.data
          );
          
          // Skip if owner is missing
          if (!decodedObligation || !decodedObligation.owner) {
            continue;
          }

          // Calculate health factor for the obligation
          const healthFactor = await this.calculateHealthFactor(decodedObligation);
          
          if (healthFactor < 1.0) {
            console.log(`Found liquidatable obligation with health factor: ${healthFactor}`);
            liquidatableObligations.push({
              pubkey: account.pubkey,
              obligation: decodedObligation,
              healthFactor
            });
          }
        } catch (decodeError) {
          // Skip failed decodes silently
          continue;
        }
      }

      if (liquidatableObligations.length > 0) {
        console.log(`Found ${liquidatableObligations.length} liquidatable obligations`);
      }

      return liquidatableObligations;
    } catch (error) {
      console.error('Finding liquidatable obligations failed:', error);
      return [];
    }
  }

  // Execute liquidation transaction
  async executeLiquidation(obligation) {
    try {
      // Create liquidation transaction
      const transaction = new Transaction();

      // Compute budget for complex transactions
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: 300000 }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 })
      );

      // Placeholder liquidation instruction
      const liquidationInstruction = SystemProgram.transfer({
        fromPubkey: this.wallet.publicKey,
        toPubkey: this.wallet.publicKey,
        lamports: 1000000 // Minimal transfer for testing
      });

      transaction.add(liquidationInstruction);

      // Set recent blockhash and fee payer
      transaction.recentBlockhash = (await this.connection.getRecentBlockhash('confirmed')).blockhash;
      transaction.feePayer = this.wallet.publicKey;

      // Sign transaction
      transaction.sign(this.wallet);

      // Send and confirm transaction
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { 
          skipPreflight: false, 
          maxRetries: 3 
        }
      );

      const confirmation = await this.connection.confirmTransaction(signature, 'confirmed');

      if (confirmation.value.err) {
        throw new Error('Liquidation transaction failed');
      }

      // Update bot stats
      this.stats.liquidationAttempts++;
      this.stats.successfulLiquidations++;

      console.log(`Successful liquidation: ${signature}`);
      return { success: true, signature };

    } catch (error) {
      this.stats.failedLiquidations++;
      console.error('Liquidation execution failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Display bot status
  displayBotStatus() {
    const runTime = Math.floor((new Date() - this.stats.startTime) / 1000);
    const hours = Math.floor(runTime / 3600);
    const minutes = Math.floor((runTime % 3600) / 60);
    const seconds = runTime % 60;

    console.log('\n==== Solana Liquidation Bot Status ====');
    console.log(`Runtime: ${hours}h ${minutes}m ${seconds}s`);
    console.log(`Total Liquidation Opportunities Found: ${this.stats.totalOpportunitiesFound}`);
    if (this.stats.liquidationAttempts > 0) {
      console.log(`Liquidation Attempts: ${this.stats.liquidationAttempts}`);
      console.log(`Successful Liquidations: ${this.stats.successfulLiquidations}`);
      console.log(`Failed Liquidations: ${this.stats.failedLiquidations}`);
    }
    console.log('=====================================\n');
  }

  // Main liquidation cycle
  async runLiquidationCycle() {
    try {
      // Check wallet balance
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      
      if (balance < 0.1 * LAMPORTS_PER_SOL) {
        console.warn('Low SOL balance. Please fund the wallet.');
        return;
      }

      // Fetch current token prices
      const prices = await this.fetchTokenPrices();
      
      // Find liquidatable obligations
      const liquidatableObligations = await this.findLiquidatableObligations();

      if (liquidatableObligations.length > 0) {
        this.stats.totalOpportunitiesFound += liquidatableObligations.length;
        console.log(`Found ${liquidatableObligations.length} new liquidation opportunities (Total: ${this.stats.totalOpportunitiesFound})`);

        // Sort by health factor (most unhealthy first)
        liquidatableObligations.sort((a, b) => a.healthFactor - b.healthFactor);

        // Select top liquidatable obligation
        const topObligation = liquidatableObligations[0];
        console.log(`Targeting obligation with health factor: ${topObligation.healthFactor.toFixed(4)}`);

        // Execute liquidation
        const liquidationResult = await this.executeLiquidation(topObligation);
        
        if (liquidationResult.success) {
          console.log('Liquidation successful');
        } else {
          console.error('Liquidation failed:', liquidationResult.error);
        }
      }

      // Show status every time
      this.displayBotStatus();
      this.stats.lastScanTime = new Date();

    } catch (error) {
      console.error('Liquidation cycle error:', error);
    }
  }

  // Start the liquidation bot
  async start() {
    console.log('==== Solana Liquidation Bot Starting ====');
    console.log(`Network: ${this.rpcUrl}`);
    console.log(`Wallet: ${this.wallet.publicKey.toString()}`);

    // Validate wallet and connections
    try {
      // Check network connection
      const version = await this.connection.getVersion();
      console.log('Solana Network Version:', version);

      // Check wallet balance
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      console.log(`Initial Wallet Balance: ${balance / LAMPORTS_PER_SOL} SOL`);
    } catch (connectionError) {
      console.error('Network connection failed:', connectionError);
      process.exit(1);
    }

    // Initial run
    await this.runLiquidationCycle();

    // Set up periodic monitoring
    const liquidationInterval = setInterval(
      () => this.runLiquidationCycle().catch(console.error), 
      this.checkInterval
    );

    // Graceful shutdown handler
    process.on('SIGINT', () => {
      console.log('\nShutting down Liquidation Bot...');
      clearInterval(liquidationInterval);
      this.displayBotStatus();
      process.exit(0);
    });
  }

  // Static method to initialize and run the bot
  static async main() {
    const config = {
      validatorKeyPath: path.resolve(__dirname, '../../wallet.json'), 
      checkInterval: 10000,
      minProfitThreshold: 0.01
    };

    try {
      const bot = new SolendLiquidationBot(config);
      await bot.debugWalletInfo(); // Add debug information
      await bot.start();
    } catch (error) {
      console.error('Bot initialization failed:', error);
      process.exit(1);
    }
  }
}

// Run the bot if this file is the main module
if (require.main === module) {
  SolendLiquidationBot.main().catch(console.error);
}

module.exports = SolendLiquidationBot;