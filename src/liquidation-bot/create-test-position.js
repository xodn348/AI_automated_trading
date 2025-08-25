const { 
  Connection, 
  PublicKey, 
  Keypair,
  LAMPORTS_PER_SOL,
  clusterApiUrl
} = require('@solana/web3.js');
const { SolendMarket, SolendAction } = require('@solendprotocol/solend-sdk');
const fs = require('fs');
const path = require('path');

// Devnet addresses (verified from oracle check)
const ADDRESSES = {
  PROGRAM_ID: new PublicKey('ALend7Ketfx5bxh6ghsCDXAoDrhvEmsXT3cynB6aPLgx'),
  MARKET: new PublicKey('GvjoVKNjBvQcFaSKUW1gTE7DxhSpjHbE69umVR5nPuQp'),
  SOL_RESERVE: new PublicKey('5VVLD7BQp8y3bTgyF5ezm1ResyMTR3PhYsT4iHFU8Sxz'),
  USDC_RESERVE: new PublicKey('FNNkz4RCQezSSS71rW2tvqZH1LCkTzaiG7Nd1LeA5x5y')
};

async function createTestPosition() {
  try {
    const connection = new Connection(clusterApiUrl('devnet'), {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000
    });
    
    // Load wallet
    const keyfileContent = fs.readFileSync(path.resolve(__dirname, '../../wallet.json'), 'utf8');
    const secretKey = Uint8Array.from(JSON.parse(keyfileContent));
    const wallet = Keypair.fromSecretKey(secretKey);

    console.log('Creating test position with wallet:', wallet.publicKey.toString());

    // Initialize Solend market
    const market = await SolendMarket.initialize(
      connection,
      'devnet',
      ADDRESSES.MARKET
    );

    // Load reserves
    await market.loadReserves();

    // Check wallet balance
    const balance = await connection.getBalance(wallet.publicKey);
    console.log(`Current balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    // Get SOL reserve
    const solReserve = market.reserves.find(r => r.config.address === ADDRESSES.SOL_RESERVE.toString());
    const solPrice = solReserve.stats.assetPriceUSD;
    console.log(`Current SOL price: $${solPrice}`);

    // Deposit 0.1 SOL as collateral
    const depositAmount = '100000000'; // 0.1 SOL
    console.log(`Depositing ${depositAmount / LAMPORTS_PER_SOL} SOL as collateral...`);
    const depositAction = await SolendAction.buildDepositTxns(
      connection,
      depositAmount,
      'SOL',
      wallet.publicKey,
      'devnet',
      ADDRESSES.MARKET
    );
    
    const depositTxn = await depositAction.sendTransactions(async (transaction) => {
      transaction.sign(wallet);
      const txid = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(txid, 'confirmed');
      return txid;
    });
    console.log('Deposit successful:', depositTxn);

    // Calculate borrow amount (50% of deposit value)
    const depositValueUSD = (depositAmount / LAMPORTS_PER_SOL) * solPrice;
    const borrowValueUSD = depositValueUSD * 0.5; // 50% LTV
    const borrowAmount = Math.floor(borrowValueUSD * 1000000); // Convert to USDC (6 decimals)

    // Borrow USDC
    console.log(`Borrowing ${borrowAmount/1000000} USDC...`);
    const borrowAction = await SolendAction.buildBorrowTxns(
      connection,
      borrowAmount.toString(),
      'USDC',
      wallet.publicKey,
      'devnet',
      ADDRESSES.MARKET
    );

    const borrowTxn = await borrowAction.sendTransactions(async (transaction) => {
      transaction.sign(wallet);
      const txid = await connection.sendRawTransaction(transaction.serialize());
      await connection.confirmTransaction(txid, 'confirmed');
      return txid;
    });
    console.log('Borrow successful:', borrowTxn);

    console.log('\nTest position created successfully!');
    console.log(`Deposited: ${depositAmount / LAMPORTS_PER_SOL} SOL (value: $${depositValueUSD.toFixed(2)})`);
    console.log(`Borrowed: ${borrowAmount/1000000} USDC`);
    console.log(`LTV: 50%`);

  } catch (error) {
    console.error('Error creating test position:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
  }
}

// Run the script
createTestPosition().catch(console.error); 