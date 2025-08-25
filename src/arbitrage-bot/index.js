// src/index.js - Solana Arbitrage Bot with Jupiter API

const { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  SystemProgram,
  ComputeBudgetProgram
} = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const fs = require('fs');
const path = require('path');
const toml = require('toml');
const bs58 = require('bs58');
const { Wallet } = require('@project-serum/anchor');
const fetch = require('cross-fetch');

// Load configuration file
console.log('Loading configuration file...');
const CONFIG_PATH = path.resolve(__dirname, '../../config.toml');
let config;
try {
  config = toml.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log('Configuration file loaded successfully');
} catch (error) {
  console.error('Failed to load configuration file:', error);
  process.exit(1);
}

// Wallet setup
console.log('Setting up wallet...');
let walletKeyPair;

try {
  if (config.wallet && config.wallet.private_key) {
    // Use private key directly from config.toml
    console.log('Loading private key from config file...');
    const privateKeyBytes = bs58.decode(config.wallet.private_key);
    walletKeyPair = Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));
  } else if (config.wallet && config.wallet.private_key_path) {
    // Load from key file path
    console.log(`Loading from key file path: ${config.wallet.private_key_path}`);
    const keyFileData = fs.readFileSync(config.wallet.private_key_path, 'utf-8');
    walletKeyPair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keyFileData)));
  } else {
    // Load from default path
    console.log('Loading key file from default path...');
    const WALLET_PATH = path.resolve(__dirname, '../wallet.json');
    walletKeyPair = Keypair.fromSecretKey(
      Uint8Array.from(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')))
    );
  }
  
  const wallet = new Wallet(walletKeyPair);
  console.log(`Bot wallet address: ${wallet.publicKey.toString()}`);
} catch (error) {
  console.error('Wallet loading failed:', error);
  process.exit(1);
}

// For test transactions, still connect to devnet
console.log('Connecting to Solana network for transactions...');
const connection = new Connection(
  config.rpc?.url || 'https://api.devnet.solana.com', 
  'confirmed'
);

// Jupiter API base URL
const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';

// Mainnet token addresses
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // Mainnet USDC

// Helper for waiting between API calls to respect rate limits
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// DEX별 수수료 정보 설정
const DEX_FEE_MAP = {
  'Raydium': 0.25, // Raydium 수수료: 0.25%
  'Orca': 0.3,     // Orca 수수료: 0.3%
  'Lifinity': 0.2, // Lifinity 수수료: 0.2%
  'Meteora': 0.25, // Meteora 수수료: 0.25%
  'Jupiter': 0.3,  // 기본 수수료: 0.3%
};

// 가스비 추정 함수 추가
function estimateGasCost(amount) {
  // 솔라나에서 가스비는 SOL 기준이 아닌 fixed lamports로 계산됨
  // 하지만 거래 금액 대비 비율로 변환하여 계산 가능
  
  // 대략적인 트랜잭션 가스비: 0.00045 SOL (450,000 lamports)
  // SOL -> USDC -> SOL 거래 시 약 0.0009 SOL 소요
  const gasCostInSOL = 0.0009;
  
  // 거래 금액 대비 가스비 비율 계산 (%)
  const amountInSOL = amount / 1e9; // lamports -> SOL
  const gasCostPercentage = (gasCostInSOL / amountInSOL) * 100;
  
  return gasCostPercentage;
}

// 슬리피지 추정 함수 추가
function estimateSlippage(amount, dexName) {
  // 거래량에 따른 슬리피지 추정
  // 유동성이 많은 DEX는 슬리피지가 적음
  const baseSlippage = 0.1; // 기본 0.1%
  
  // DEX별 유동성 가중치 (1이 기본, 낮을수록 슬리피지 증가)
  const liquidityFactor = {
    'Raydium': 1.2,  // 유동성 높음
    'Orca': 1.0,     // 기본 유동성
    'Lifinity': 0.7, // 유동성 낮음
    'Meteora': 0.8,  // 유동성 중간
    'Jupiter': 1.0   // 기본 유동성
  };
  
  // 거래량에 따른 슬리피지 조정
  const amountInSOL = amount / 1e9;
  let volumeFactor = 1.0;
  
  if (amountInSOL > 10) {
    volumeFactor = 2.0; // 10 SOL 초과 거래는 슬리피지 2배
  } else if (amountInSOL > 1) {
    volumeFactor = 1.5; // 1 SOL 초과 거래는 슬리피지 1.5배
  }
  
  const dexFactor = liquidityFactor[dexName] || 1.0;
  return (baseSlippage * volumeFactor) / dexFactor;
}

// Function to get price from Jupiter API with specific routing
async function getJupiterQuote(inputMint, outputMint, amount, routingOptions = {}) {
  try {
    // Build query parameters
    const params = new URLSearchParams({
      inputMint: inputMint.toString(),
      outputMint: outputMint.toString(),
      amount: amount.toString(),
      slippageBps: 50
    });
    
    // Add routing options if provided
    if (routingOptions.excludeDexes) {
      params.append('excludeDexes', routingOptions.excludeDexes);
    }
    
    if (routingOptions.includeDexes) {
      params.append('includeDexes', routingOptions.includeDexes);
    }
    
    if (routingOptions.onlyDirectRoutes) {
      params.append('onlyDirectRoutes', 'true');
    }
    
    const url = `${JUPITER_API_BASE}/quote?${params.toString()}`;
    console.log(`Fetching quote from: ${url}`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Extract DEX info from route
    let dexName = 'Jupiter';
    if (data.routePlan && data.routePlan.length > 0 && data.routePlan[0].swapInfo) {
      dexName = data.routePlan[0].swapInfo.label || 'Jupiter';
    }
    
    return {
      dexName,
      outAmount: data.outAmount,
      inAmount: amount,
      price: Number(data.outAmount) / Math.pow(10, 6) / (amount / Math.pow(10, 9)), // USDC per SOL
      routePlan: data.routePlan || []
    };
  } catch (error) {
    console.error('Error fetching Jupiter quote:', error);
    return null;
  }
}

// Function to get prices from different DEXes
async function getPricesFromDEXes() {
  console.log('Getting prices from different DEXes...');
  
  // Amount we want to swap (e.g., 0.1 SOL in lamports)
  const amount = 100000000; // 0.1 SOL
  
  try {
    // 여러 DEX를 확인하기 위한 배열
    const dexesToCheck = [
      { name: 'Raydium', excludeDexes: 'Orca,Lifinity,Meteora,Serum,GooseFX,Aldrin,Crema' },
      { name: 'Orca', excludeDexes: 'Raydium,Lifinity,Meteora,Serum,GooseFX,Aldrin,Crema' },
      { name: 'Meteora', excludeDexes: 'Raydium,Orca,Lifinity,Serum,GooseFX,Aldrin,Crema' },
      { name: 'Lifinity', excludeDexes: 'Raydium,Orca,Meteora,Serum,GooseFX,Aldrin,Crema' }
    ];
    
    // 모든 DEX의 가격 데이터 저장
    const dexPrices = [];
    
    // 각 DEX별로 가격 조회
    for (const dex of dexesToCheck) {
      try {
        const quote = await getJupiterQuote(SOL_MINT, USDC_MINT, amount, {
          excludeDexes: dex.excludeDexes,
          includeDexes: dex.name
        });
        
        if (quote) {
          console.log(`${quote.dexName} price: ${quote.price.toFixed(6)} USDC per SOL`);
          dexPrices.push({
            name: quote.dexName,
            price: quote.price
          });
          
          // API 속도 제한 준수
          await sleep(200);
        }
      } catch (err) {
        console.log(`Error getting quote for ${dex.name}: ${err.message}`);
      }
    }
    
    // 최소 2개의 DEX 가격이 필요
    if (dexPrices.length < 2) {
      console.log('Could not get prices from at least 2 DEXes');
      return null;
    }
    
    // 가장 큰 가격 차이를 찾기 위해 모든 DEX 페어 비교
    let bestPair = null;
    let maxPriceDiff = 0;
    
    for (let i = 0; i < dexPrices.length; i++) {
      for (let j = i + 1; j < dexPrices.length; j++) {
        const dex1 = dexPrices[i];
        const dex2 = dexPrices[j];
        
        const priceDiff = Math.abs(dex1.price - dex2.price);
        const priceDiffPercentage = (priceDiff / Math.min(dex1.price, dex2.price)) * 100;
        
        if (priceDiffPercentage > maxPriceDiff) {
          maxPriceDiff = priceDiffPercentage;
          bestPair = { dex1, dex2, priceDifferencePercent: priceDiffPercentage };
        }
      }
    }
    
    if (!bestPair) {
      console.log('No price differences found between DEXes');
      return null;
    }
    
    console.log(`Best price difference: ${bestPair.priceDifferencePercent.toFixed(4)}% between ${bestPair.dex1.name} and ${bestPair.dex2.name}`);
    
    return {
      dex1: bestPair.dex1,
      dex2: bestPair.dex2,
      priceDifferencePercent: bestPair.priceDifferencePercent,
      inputAmount: amount
    };
  } catch (error) {
    console.error('Error getting DEX prices:', error);
    return null;
  }
}

// 거래 상세 정보를 계산하고 표시하는 함수 추가
function calculateTradeDetails(opportunity) {
  // SOL 금액
  const inputAmountSOL = opportunity.inputAmount / 1e9;
  
  // 구매 DEX에서 USDC로 전환된 금액 (수수료 적용 전)
  const rawBuyAmountUSDC = inputAmountSOL * opportunity.buyPrice;
  
  // 구매 DEX 수수료 계산
  const buyDexFee = DEX_FEE_MAP[opportunity.buyDex] || DEX_FEE_MAP.Jupiter;
  const buyFeeUSDC = rawBuyAmountUSDC * (buyDexFee / 100);
  
  // 구매 후 실제 USDC 금액 (수수료 차감 후)
  const actualBuyAmountUSDC = rawBuyAmountUSDC - buyFeeUSDC;
  
  // 판매 DEX에서 SOL로 전환된 금액 (수수료 적용 전)
  const rawSellAmountSOL = actualBuyAmountUSDC / opportunity.sellPrice;
  
  // 판매 DEX 수수료 계산
  const sellDexFee = DEX_FEE_MAP[opportunity.sellDex] || DEX_FEE_MAP.Jupiter;
  const sellFeeSOL = rawSellAmountSOL * (sellDexFee / 100);
  
  // 가스비 (SOL 기준)
  const gasCostSOL = 0.0009; // 약 900,000 lamports
  
  // 슬리피지로 인한 손실 계산
  const slippageLossSOL = inputAmountSOL * (opportunity.costs.slippage / 100);
  
  // 모든 비용 합산 (SOL 기준)
  const totalCostsSOL = sellFeeSOL + gasCostSOL + slippageLossSOL;
  const totalCostsUSDC = totalCostsSOL * opportunity.sellPrice;
  
  // 최종 SOL 금액 (모든 비용 차감)
  const finalAmountSOL = rawSellAmountSOL - sellFeeSOL - gasCostSOL - slippageLossSOL;
  
  // 순이익 계산
  const profitSOL = finalAmountSOL - inputAmountSOL;
  const profitUSDC = profitSOL * opportunity.sellPrice;
  const profitPercentage = (profitSOL / inputAmountSOL) * 100;
  
  return {
    input: {
      sol: inputAmountSOL,
      usdc: inputAmountSOL * opportunity.buyPrice
    },
    buyPhase: {
      rate: opportunity.buyPrice,
      fee: buyFeeUSDC,
      result: actualBuyAmountUSDC
    },
    sellPhase: {
      rate: opportunity.sellPrice,
      fee: sellFeeSOL * opportunity.sellPrice, // USDC 기준으로 변환
      result: rawSellAmountSOL * opportunity.sellPrice // USDC 기준
    },
    costs: {
      buyFee: buyFeeUSDC,
      sellFee: sellFeeSOL * opportunity.sellPrice,
      gas: gasCostSOL * opportunity.sellPrice,
      slippage: slippageLossSOL * opportunity.sellPrice,
      total: totalCostsUSDC
    },
    result: {
      finalSol: finalAmountSOL,
      finalUsdc: finalAmountSOL * opportunity.sellPrice,
      profitSol: profitSOL,
      profitUsdc: profitUSDC,
      profitPercentage: profitPercentage
    }
  };
}

// 거래 결과를 표시하는 함수
function displayTradeDetails(opportunity) {
  const details = calculateTradeDetails(opportunity);
  
  console.log('\n========== ARBITRAGE TRADE DETAILS ==========');
  console.log(`Input: ${details.input.sol.toFixed(4)} SOL (${details.input.usdc.toFixed(2)} USDC)`);
  
  console.log('\n----- BUY PHASE -----');
  console.log(`Buy at ${opportunity.buyDex}: ${opportunity.buyPrice.toFixed(4)} USDC per SOL`);
  console.log(`Fee: ${details.buyPhase.fee.toFixed(4)} USDC (${DEX_FEE_MAP[opportunity.buyDex] || DEX_FEE_MAP.Jupiter}%)`);
  console.log(`Received: ${details.buyPhase.result.toFixed(4)} USDC`);
  
  console.log('\n----- SELL PHASE -----');
  console.log(`Sell at ${opportunity.sellDex}: ${opportunity.sellPrice.toFixed(4)} USDC per SOL`);
  console.log(`Fee: ${details.sellPhase.fee.toFixed(4)} USDC (${DEX_FEE_MAP[opportunity.sellDex] || DEX_FEE_MAP.Jupiter}%)`);
  console.log(`Expected return: ${details.sellPhase.result.toFixed(4)} USDC`);
  
  console.log('\n----- COSTS BREAKDOWN -----');
  console.log(`Buy DEX fee: ${details.costs.buyFee.toFixed(4)} USDC`);
  console.log(`Sell DEX fee: ${details.costs.sellFee.toFixed(4)} USDC`);
  console.log(`Gas cost: ${details.costs.gas.toFixed(4)} USDC`);
  console.log(`Slippage: ${details.costs.slippage.toFixed(4)} USDC`);
  console.log(`Total costs: ${details.costs.total.toFixed(4)} USDC`);
  
  console.log('\n----- FINAL RESULT -----');
  console.log(`Final amount: ${details.result.finalSol.toFixed(6)} SOL (${details.result.finalUsdc.toFixed(4)} USDC)`);
  console.log(`Profit/Loss: ${details.result.profitSol.toFixed(6)} SOL (${details.result.profitUsdc.toFixed(4)} USDC)`);
  console.log(`Profit percentage: ${details.result.profitPercentage.toFixed(4)}%`);
  console.log('==============================================\n');
  
  return details;
}

// Check for arbitrage opportunities
async function checkArbitrageOpportunity() {
  console.log('Checking for arbitrage opportunities...');
  
  try {
    // 1. Check SOL balance
    const balance = await connection.getBalance(walletKeyPair.publicKey);
    console.log(`Current SOL balance: ${balance / 1e9} SOL`);
    
    // Ensure we have enough SOL for testing
    if (balance < 0.1 * 1e9) {
      console.warn('WARNING: SOL balance is less than 0.1 SOL. Please request an airdrop.');
      return null;
    }
    
    // 2. Get prices from DEXes
    const priceData = await getPricesFromDEXes();
    
    if (!priceData) {
      console.log('Failed to get price data from DEXes');
      return null;
    }
    
    // 3. 실제 비용 계산
    // 거래 금액
    const amountInLamports = priceData.inputAmount; // 예: 100,000,000 lamports (0.1 SOL)
    
    // 수수료 계산
    const buyDexFee = DEX_FEE_MAP[priceData.dex1.name] || DEX_FEE_MAP.Jupiter;
    const sellDexFee = DEX_FEE_MAP[priceData.dex2.name] || DEX_FEE_MAP.Jupiter;
    const totalDexFee = buyDexFee + sellDexFee;
    
    // 가스비 계산
    const gasCost = estimateGasCost(amountInLamports);
    
    // 슬리피지 계산
    const buySlippage = estimateSlippage(amountInLamports, priceData.dex1.name);
    const sellSlippage = estimateSlippage(amountInLamports, priceData.dex2.name);
    const totalSlippage = buySlippage + sellSlippage;
    
    // 총 비용
    const totalCosts = totalDexFee + gasCost + totalSlippage;
    
    // 조정된 임계값 (최소 1%)
    const profitThreshold = 1.0;
    
    console.log(`Price difference: ${priceData.priceDifferencePercent.toFixed(4)}%`);
    console.log(`DEX fees: ${totalDexFee.toFixed(4)}%`);
    console.log(`Gas cost: ${gasCost.toFixed(4)}%`);
    console.log(`Slippage: ${totalSlippage.toFixed(4)}%`);
    console.log(`Total costs: ${totalCosts.toFixed(4)}%`);
    
    // 예상 순이익 계산
    const estimatedNetProfit = priceData.priceDifferencePercent - totalCosts;
    console.log(`Estimated net profit: ${estimatedNetProfit.toFixed(4)}%`);
    
    if (estimatedNetProfit > profitThreshold) {
      console.log(`Potentially profitable arbitrage opportunity found! Net profit: ${estimatedNetProfit.toFixed(4)}%`);
      
      // Determine which DEX has better buy/sell prices
      const buyDex = priceData.dex1.price > priceData.dex2.price ? priceData.dex2 : priceData.dex1;
      const sellDex = priceData.dex1.price > priceData.dex2.price ? priceData.dex1 : priceData.dex2;
      
      return {
        buyDex: buyDex.name,
        sellDex: sellDex.name,
        buyPrice: buyDex.price,
        sellPrice: sellDex.price,
        priceDifference: priceData.priceDifferencePercent,
        costs: {
          dexFees: totalDexFee,
          gasCost: gasCost,
          slippage: totalSlippage,
          total: totalCosts
        },
        estimatedProfit: estimatedNetProfit,
        inputAmount: priceData.inputAmount
      };
    } else {
      console.log(`No profitable arbitrage opportunity found. Net profit (${estimatedNetProfit.toFixed(4)}%) below threshold (${profitThreshold}%)`);
      return null;
    }
  } catch (error) {
    console.error('Error checking arbitrage opportunity:', error);
    return null;
  }
}

// Execute test transaction (for testing only, not actual arbitrage)
async function executeTestTransaction(opportunity) {
  console.log('Executing test transaction...');
  
  try {
    // On devnet, we'll do a test transaction rather than real swaps
    const transaction = new Transaction();
    
    // Set compute unit limit
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: config.bot?.compute_unit_limit || 200000
      })
    );
    
    // Test transfer (send 0.001 SOL to self)
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: walletKeyPair.publicKey,
        toPubkey: walletKeyPair.publicKey,
        lamports: 1000000 // 0.001 SOL (for testing)
      })
    );
    
    // Add recent blockhash to transaction
    transaction.recentBlockhash = (await connection.getRecentBlockhash()).blockhash;
    transaction.feePayer = walletKeyPair.publicKey;
    
    // Sign transaction
    transaction.sign(walletKeyPair);
    
    // Submit transaction
    console.log('Submitting transaction...');
    const signature = await connection.sendRawTransaction(transaction.serialize());
    console.log(`Transaction signature: ${signature}`);
    
    // Confirm transaction
    console.log('Confirming transaction...');
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    console.log('Transaction confirmed:', confirmation.value.err ? 'Failed' : 'Success');
    
    if (confirmation.value.err) {
      console.error('Transaction error:', confirmation.value.err);
      return { success: false, error: confirmation.value.err };
    }
    
    console.log('Test transaction successful!');
    console.log(`In a real arbitrage: Would buy on ${opportunity.buyDex} at ${opportunity.buyPrice} and sell on ${opportunity.sellDex} at ${opportunity.sellPrice}`);
    
    return { success: true, signature };
  } catch (error) {
    console.error('Error executing transaction:', error);
    return { success: false, error: error.message };
  }
}

// Bot statistics and status
const botStats = {
  startTime: new Date(),
  opportunitiesDetected: 0,
  transactionsExecuted: 0,
  successfulTransactions: 0,
  failedTransactions: 0,
  totalProfitEstimated: 0,
};

// Display bot status
function displayBotStatus() {
  const runTime = Math.floor((new Date() - botStats.startTime) / 1000);
  const hours = Math.floor(runTime / 3600);
  const minutes = Math.floor((runTime % 3600) / 60);
  const seconds = runTime % 60;
  
  console.log('\n==================================');
  console.log('Solana Arbitrage Bot Status');
  console.log('==================================');
  console.log(`Runtime: ${hours}h ${minutes}m ${seconds}s`);
  console.log(`Opportunities detected: ${botStats.opportunitiesDetected}`);
  console.log(`Transactions executed: ${botStats.transactionsExecuted}`);
  console.log(`Successful transactions: ${botStats.successfulTransactions}`);
  console.log(`Failed transactions: ${botStats.failedTransactions}`);
  console.log(`Estimated cumulative profit: ${botStats.totalProfitEstimated.toFixed(4)}%`);
  console.log('==================================\n');
}

// Function to run a single arbitrage check cycle
async function runArbitrageCheck() {
  console.log('\n-- Starting new monitoring cycle --');
  displayBotStatus();
  
  // Check for arbitrage opportunities
  const opportunity = await checkArbitrageOpportunity();
  
  if (opportunity) {
    botStats.opportunitiesDetected++;
    
    // 상세 거래 정보 표시
    const tradeDetails = displayTradeDetails(opportunity);
    
    // 실제 순이익률로 botStats 업데이트
    botStats.totalProfitEstimated += tradeDetails.result.profitPercentage;
    
    console.log('Arbitrage opportunity details:');
    console.log(`- Buy DEX: ${opportunity.buyDex}`);
    console.log(`- Sell DEX: ${opportunity.sellDex}`);
    console.log(`- Buy price: ${opportunity.buyPrice.toFixed(6)} USDC per SOL`);
    console.log(`- Sell price: ${opportunity.sellPrice.toFixed(6)} USDC per SOL`);
    console.log(`- Price difference: ${opportunity.priceDifference.toFixed(4)}%`);
    console.log(`- Total costs: ${opportunity.costs.total.toFixed(4)}%`);
    console.log(`- Net profit: ${tradeDetails.result.profitPercentage.toFixed(4)}%`);
    console.log(`- Transaction amount: ${opportunity.inputAmount / 1e9} SOL`);
    
    // 순이익이 실제로 양수인 경우에만 트랜잭션 실행
    if (tradeDetails.result.profitPercentage > 0) {
      console.log('Executing transaction for positive profit opportunity...');
      
      // Execute transaction
      botStats.transactionsExecuted++;
      const result = await executeTestTransaction(opportunity);
      
      if (result.success) {
        botStats.successfulTransactions++;
      } else {
        botStats.failedTransactions++;
      }
    } else {
      console.log('Transaction not executed: Calculated actual profit is negative.');
    }
  }
  
  console.log('-- Monitoring cycle completed --\n');
}

// Main bot execution function
async function startBot() {
  try {
    console.log('============================================');
    console.log('Solana Arbitrage Bot Starting (Jupiter API)');
    console.log('============================================');
    console.log('Price data source: Jupiter API v6');
    console.log(`Transaction network: ${config.rpc?.url || 'https://api.devnet.solana.com'}`);
    console.log(`Wallet address: ${walletKeyPair.publicKey.toString()}`);
    
    // Check SOL balance
    const balance = await connection.getBalance(walletKeyPair.publicKey);
    console.log(`Current SOL balance: ${balance / 1e9} SOL`);
    
    if (balance < 0.1 * 1e9) {
      console.warn('Warning: Low SOL balance. Request an airdrop with:');
      console.warn(`solana airdrop 2 ${walletKeyPair.publicKey.toString()} --url https://api.devnet.solana.com`);
    }
    
    console.log('Bot started successfully.');
    console.log('============================================');
    
    // 10초마다 체크하도록 설정
    const checkInterval = 10000; // 10초
    
    console.log(`Monitoring interval: ${checkInterval / 1000} seconds`);
    
    // Initial check
    await runArbitrageCheck();
    
    // Setup periodic execution
    setInterval(runArbitrageCheck, checkInterval);
    
  } catch (error) {
    console.error('Error starting bot:', error);
  }
}

// Start the bot
startBot().catch(error => {
  console.error('Fatal error occurred:', error);
  process.exit(1);
});
