// index2_ai.js - Solana Arbitrage Bot with Jupiter API & OpenAI API Integration

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
  const dotenv = require('dotenv');

  const { PathFinder } = require('./path-finder');
  const { RiskAnalyzer } = require('./risk-analyzer');
  // Load environment variables
  dotenv.config();
  
  // DEX별 수수료 정보 설정
  const DEX_FEE_MAP = {
    'Raydium': 0.25, // Raydium 수수료: 0.25%
    'Orca': 0.3,     // Orca 수수료: 0.3%
    'Lifinity': 0.2, // Lifinity 수수료: 0.2%
    'Meteora': 0.25, // Meteora 수수료: 0.25%
    'Jupiter': 0.3,  // 기본 수수료: 0.3%
  };
  
  // Jupiter API base URL
  const JUPITER_API_BASE = 'https://quote-api.jup.ag/v6';
  
  // Mainnet token addresses
  const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
  const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // Mainnet USDC
  
  // Helper for waiting between API calls to respect rate limits
  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  
  // Import API-based AI module
  const OpenAI = require("openai");
  
  // API-based AI class
  class ApiArbitrageAI {
    constructor(config) {
      this.config = config;
      this.historicalDataPath = path.resolve(__dirname, '../data/historical');
      
      // 수정할 코드
        this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        });
      
      console.log('API-based AI module initialized');
      
      // 데이터 디렉토리 생성
      if (!fs.existsSync(this.historicalDataPath)) {
        fs.mkdirSync(this.historicalDataPath, { recursive: true });
      }
    }
    
    // 슬리피지 예측 - API 기반
    async predictSlippage(amount, dexName, marketData = {}) {
      try {
        // 기본 휴리스틱 계산
        const baseSlippage = this.calculateBaseSlippage(amount, dexName);
        
        // 복잡한 상황에서만 API 호출 (비용 절감)
        if (marketData?.volatility > 0.5 || amount > 1e9) {
          const slippageData = {
            amount_in_sol: amount / 1e9,
            dex_name: dexName,
            market_volatility: marketData?.volatility || 0,
            price: marketData?.avgPrice || 0
          };
          
          // OpenAI API 호출
          const completion = await this.openai.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system", 
                content: "You are a crypto trading assistant. Predict slippage for a Solana DEX trade based on provided data."
              },
              {
                role: "user",
                content: `Predict slippage percentage for a trade with the following parameters: 
                  Amount: ${slippageData.amount_in_sol} SOL, 
                  DEX: ${slippageData.dex_name}, 
                  Market volatility: ${slippageData.market_volatility}%, 
                  Current price: ${slippageData.price} USDC/SOL. 
                  Respond with only a number representing the percentage.`
              }
            ],
            temperature: 0.3,
            max_tokens: 10
          });
          
          const predictedSlippage = parseFloat(completion.data.choices[0].message.content.trim());
          
          // 유효한 값인지 확인
          if (!isNaN(predictedSlippage) && predictedSlippage > 0) {
            console.log(`AI predicted slippage: ${predictedSlippage}%`);
            return predictedSlippage;
          }
        }
        
        // API 호출 실패 또는 간단한 상황에서는 기본 계산 사용
        return baseSlippage;
      } catch (error) {
        console.error('Error predicting slippage via API:', error);
        return this.calculateBaseSlippage(amount, dexName);
      }
    }
    
    // 기본 슬리피지 계산 (API 호출 없이)
    calculateBaseSlippage(amount, dexName) {
      const baseSlippage = 0.1; // 기본 0.1%
      const liquidityFactor = {
        'Raydium': 1.2, 'Orca': 1.0, 'Lifinity': 0.7, 
        'Meteora': 0.8, 'Jupiter': 1.0
      };
      
      const amountInSOL = amount / 1e9;
      let volumeFactor = 1.0;
      
      if (amountInSOL > 10) volumeFactor = 2.0;
      else if (amountInSOL > 1) volumeFactor = 1.5;
      
      const dexFactor = liquidityFactor[dexName] || 1.0;
      return (baseSlippage * volumeFactor) / dexFactor;
    }
    
    // 시장 분석
    analyzeMarketCondition(priceData) {
      // 기본적인 통계 분석 (API 호출 없이)
      const prices = priceData.map(dex => dex.price);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const volatility = ((maxPrice - minPrice) / avgPrice) * 100;
      
      let marketCondition = 'normal';
      if (volatility > 1.0) marketCondition = 'volatile';
      else if (volatility < 0.1) marketCondition = 'stable';
      
      return {
        avgPrice, volatility, marketCondition,
        maxPrice, minPrice,
        priceGap: maxPrice - minPrice,
        priceGapPercent: ((maxPrice - minPrice) / minPrice) * 100,
        timestamp: new Date().toISOString()
      };
    }
    
    // 데이터 저장
    saveHistoricalData(pairData) {
      try {
        const timestamp = new Date().toISOString();
        const fileName = `${timestamp.replace(/:/g, '-')}.json`;
        const filePath = path.join(this.historicalDataPath, fileName);
        
        fs.writeFileSync(filePath, JSON.stringify(pairData, null, 2));
        console.log(`Data saved: ${fileName}`);
      } catch (error) {
        console.error('Error saving data:', error);
      }
    }
    
    // 최적 거래 크기 추천
    async recommendTradeSize(opportunity, balance) {
      // 간단한 경우는 API 호출 없이 빠르게 계산
      const defaultSize = balance * 0.1;
      
      // 복잡한 상황에서만 API 호출
      if (opportunity.priceDifference > 0.5) {
        try {
          const data = {
            opportunity: {
              price_difference: opportunity.priceDifference,
              buy_price: opportunity.buyPrice,
              sell_price: opportunity.sellPrice,
              estimated_profit: opportunity.estimatedProfit,
              market_condition: opportunity.marketAnalysis?.marketCondition
            },
            balance: balance / 1e9, // SOL 단위
            dexes: [opportunity.buyDex, opportunity.sellDex]
          };
          
          // API 호출
          const completion = await this.openai.create({
            model: "gpt-3.5-turbo",
            messages: [
              {
                role: "system", 
                content: "You are a crypto trading assistant. Recommend optimal trade size in SOL for arbitrage opportunities."
              },
              {
                role: "user",
                content: `Recommend optimal trade size in SOL for an arbitrage opportunity:
                  Available balance: ${data.balance} SOL
                  Price difference: ${data.opportunity.price_difference}%
                  Buy price: ${data.opportunity.buy_price} USDC/SOL (${data.dexes[0]})
                  Sell price: ${data.opportunity.sell_price} USDC/SOL (${data.dexes[1]})
                  Estimated profit: ${data.opportunity.estimated_profit}%
                  Market condition: ${data.opportunity.market_condition || 'unknown'}
                  Respond with only a number representing SOL amount.`
              }
            ],
            temperature: 0.3,
            max_tokens: 10
          });
          
          const recommendedSize = parseFloat(completion.data.choices[0].message.content.trim());
          
          // 유효한 값인지 확인
          if (!isNaN(recommendedSize) && recommendedSize > 0) {
            console.log(`AI recommended trade size: ${recommendedSize} SOL`);
            return recommendedSize * 1e9; // lamports로 변환
          }
        } catch (error) {
          console.error('Error recommending trade size via API:', error);
        }
      }
      
      // 기본 계산 (API 호출 실패 시)
      if (opportunity.estimatedProfit > 3) {
        return Math.min(balance * 0.25, defaultSize * 2.5);
      } else if (opportunity.estimatedProfit > 1.5) {
        return Math.min(balance * 0.15, defaultSize * 1.5);
      }
      return Math.min(defaultSize, 100000000); // 최대 0.1 SOL
    }
  }
  
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
  
  // Initialize API-based AI module
  let arbitrageAI;
  try {
    console.log('Initializing API-based AI module...');
    arbitrageAI = new ApiArbitrageAI(config);
    console.log('API-based AI module initialized successfully');
  } catch (error) {
    console.warn('AI module initialization failed:', error.message);
  }

    // 초기화 섹션에 추가
  let riskAnalyzer;
  let pathFinder;

  try {
    console.log('Initializing Risk Analyzer...');
    riskAnalyzer = new RiskAnalyzer();
    console.log('Risk Analyzer initialized successfully');
    console.log('Initializing Path Finder...');
    pathFinder = new PathFinder(JUPITER_API_BASE);
    console.log('Path Finder initialized successfully');
  } catch (error) {
    console.error('Error initializing advanced AI modules:', error);
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
        inputAmount: amount,
        dexPrices: dexPrices
      };
    } catch (error) {
      console.error('Error getting DEX prices:', error);
      return null;
    }
  }
  
  // 가스비 추정 함수
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
  
  // Enhanced slippage estimation function with API if available
  async function enhancedEstimateSlippage(amount, dexName, marketData = {}) {
    // Use AI module if available
    if (arbitrageAI) {
      return await arbitrageAI.predictSlippage(amount, dexName, marketData);
    }
    
    // Basic slippage calculation (fallback)
    const baseSlippage = 0.1; // 기본 0.1%
    const liquidityFactor = {
      'Raydium': 1.2, 'Orca': 1.0, 'Lifinity': 0.7, 
      'Meteora': 0.8, 'Jupiter': 1.0
    };
    
    const amountInSOL = amount / 1e9;
    let volumeFactor = 1.0;
    
    if (amountInSOL > 10) volumeFactor = 2.0;
    else if (amountInSOL > 1) volumeFactor = 1.5;
    
    const dexFactor = liquidityFactor[dexName] || 1.0;
    return (baseSlippage * volumeFactor) / dexFactor;
  }
  
  // 거래 상세 정보를 계산하고 표시하는 함수
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
    
    // Add AI market analysis information if available
    if (opportunity.marketAnalysis) {
      console.log('\n----- AI MARKET ANALYSIS -----');
      console.log(`Market condition: ${opportunity.marketAnalysis.marketCondition}`);
      console.log(`Market volatility: ${opportunity.marketAnalysis.volatility.toFixed(4)}%`);
      console.log(`Avg price across DEXes: ${opportunity.marketAnalysis.avgPrice.toFixed(4)} USDC/SOL`);
    }
    
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
    
    // Add AI recommendation information if available
    if (opportunity.recommendedSize) {
      console.log('\n----- AI RECOMMENDATION -----');
      console.log(`AI recommended size: ${(opportunity.recommendedSize / 1e9).toFixed(4)} SOL`);
      console.log(`Confidence score: ${opportunity.confidenceScore || 'N/A'}`);
    }
    
    console.log('==============================================\n');
    
    return details;
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
    aiPredictions: 0,      // AI 예측 횟수 추적
    aiAccuracy: 0          // AI 예측 정확도 추적
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
    
    // Display AI stats if available
    if (arbitrageAI) {
      console.log(`AI predictions made: ${botStats.aiPredictions}`);
      if (botStats.aiPredictions > 0) {
        console.log(`AI prediction accuracy: ${botStats.aiAccuracy.toFixed(2)}%`);
      }
    }
    
    console.log('==================================\n');
  }
  
  // Check for arbitrage opportunities with API-based AI enhancement
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
      
      // 3. AI market analysis (if available)
      let marketAnalysis = null;
      if (arbitrageAI && priceData.dexPrices && priceData.dexPrices.length >= 2) {
        marketAnalysis = arbitrageAI.analyzeMarketCondition(priceData.dexPrices);
        console.log('AI market analysis:');
        console.log(`- Market condition: ${marketAnalysis.marketCondition}`);
        console.log(`- Volatility: ${marketAnalysis.volatility.toFixed(4)}%`);
        console.log(`- Avg price: ${marketAnalysis.avgPrice.toFixed(4)} USDC/SOL`);
        
        // Save historical data for training
        arbitrageAI.saveHistoricalData({
          timestamp: new Date().toISOString(),
          prices: priceData.dexPrices,
          analysis: marketAnalysis
        });
        
        // Update AI prediction counter
        botStats.aiPredictions++;
      }
      
      // 4. Calculate actual costs with AI-enhanced estimates
      // Transaction amount (adjust based on market condition if AI is available)
      let amountInLamports = priceData.inputAmount; // Default 0.1 SOL
      
      if (arbitrageAI && marketAnalysis) {
        // Adjust trade size based on volatility
        if (marketAnalysis.marketCondition === 'volatile') {
          // Reduce trade size in volatile markets
          amountInLamports = Math.floor(amountInLamports * 0.7);
          console.log(`Market volatility high: Adjusted trade size to ${amountInLamports / 1e9} SOL`);
        } else if (marketAnalysis.marketCondition === 'stable') {
          // Increase trade size in stable markets
          amountInLamports = Math.floor(amountInLamports * 1.3);
          console.log(`Market stable: Increased trade size to ${amountInLamports / 1e9} SOL`);
        }
      }
      
      // Calculate fees
      const buyDexFee = DEX_FEE_MAP[priceData.dex1.name] || DEX_FEE_MAP.Jupiter;
      const sellDexFee = DEX_FEE_MAP[priceData.dex2.name] || DEX_FEE_MAP.Jupiter;
      const totalDexFee = buyDexFee + sellDexFee;
      
      // Calculate gas cost
      const gasCost = estimateGasCost(amountInLamports);
      
      // Calculate slippage with AI enhancement if available
      const buySlippage = await enhancedEstimateSlippage(amountInLamports, priceData.dex1.name, marketAnalysis);
      const sellSlippage = await enhancedEstimateSlippage(amountInLamports, priceData.dex2.name, marketAnalysis);
      const totalSlippage = buySlippage + sellSlippage;
      
      // Calculate total costs
      const totalCosts = totalDexFee + gasCost + totalSlippage;
      
      // Minimum profit threshold (1%)
      const profitThreshold = 1.0;
      
      console.log(`Price difference: ${priceData.priceDifferencePercent.toFixed(4)}%`);
      console.log(`DEX fees: ${totalDexFee.toFixed(4)}%`);
      console.log(`Gas cost: ${gasCost.toFixed(4)}%`);
      console.log(`Slippage: ${totalSlippage.toFixed(4)}%`);
      console.log(`Total costs: ${totalCosts.toFixed(4)}%`);
      
      // Calculate estimated net profit
      const estimatedNetProfit = priceData.priceDifferencePercent - totalCosts;
      console.log(`Estimated net profit: ${estimatedNetProfit.toFixed(4)}%`);
      
      if (estimatedNetProfit > profitThreshold) {
        console.log(`Potentially profitable arbitrage opportunity found! Net profit: ${estimatedNetProfit.toFixed(4)}%`);
        
        // Determine which DEX has better buy/sell prices
        const buyDex = priceData.dex1.price > priceData.dex2.price ? priceData.dex2 : priceData.dex1;
        const sellDex = priceData.dex1.price > priceData.dex2.price ? priceData.dex1 : priceData.dex2;
        
        // Create opportunity object
        const opportunity = {
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
          inputAmount: amountInLamports,
          marketAnalysis: marketAnalysis // Add AI analysis data
        };
        
        // Use AI to recommend optimal trade size
        if (arbitrageAI) {
          const recommendedSize = await arbitrageAI.recommendTradeSize(opportunity, balance);
          opportunity.recommendedSize = recommendedSize;
          opportunity.inputAmount = Math.floor(recommendedSize);
          console.log(`AI recommended trade size: ${recommendedSize / 1e9} SOL`);
        }
        
        if (opportunity) {
            // 위험 분석 실행
            if (riskAnalyzer) {
              try {
                console.log('Analyzing risk for arbitrage opportunity...');
                const riskAnalysis = await riskAnalyzer.analyzeRisk(opportunity, marketAnalysis || {});
                
                opportunity.riskAnalysis = riskAnalysis;
                console.log(`Risk score: ${riskAnalysis.riskScore}/100 (${riskAnalysis.riskLevel} risk)`);
                console.log(`Risk recommendation: ${riskAnalysis.recommendation}`);
                
                // 위험도에 따라 거래 크기 조정
                if (riskAnalysis.riskLevel === 'high' || riskAnalysis.riskLevel === 'very high') {
                  // 위험도가 높으면 거래 크기 50% 감소
                  opportunity.inputAmount = Math.floor(opportunity.inputAmount * 0.5);
                  console.log(`High risk detected: Reduced trade size to ${opportunity.inputAmount / 1e9} SOL`);
                }
              } catch (riskError) {
                console.error('Error performing risk analysis:', riskError);
              }
            }
            
            // 더 나은 경로 찾기 시도
            if (pathFinder) {
              try {
                console.log('Searching for better arbitrage paths...');
                const alternatePaths = await pathFinder.findArbitragePaths('SOL', 3);
                
                // 더 수익성 높은 경로가 있는지 확인
                const betterPaths = alternatePaths.filter(path => 
                  path.estimatedProfit > opportunity.estimatedProfit + 0.5 // 최소 0.5% 이상 더 수익성이 있어야 함
                );
                
                if (betterPaths.length > 0) {
                  const bestPath = betterPaths[0];
                  console.log(`Found better arbitrage path: ${bestPath.path.join(' -> ')}`);
                  console.log(`Estimated profit: ${bestPath.estimatedProfit.toFixed(4)}% (vs ${opportunity.estimatedProfit.toFixed(4)}%)`);
                  
                  // 더 나은 경로 정보 추가
                  opportunity.alternatePaths = betterPaths;
                  opportunity.bestAlternatePath = bestPath;
                } else {
                  console.log('No better arbitrage paths found.');
                }
              } catch (pathError) {
                console.error('Error finding alternate paths:', pathError);
              }
            }
          }

        return opportunity;
      } else {
        console.log(`No profitable arbitrage opportunity found. Net profit (${estimatedNetProfit.toFixed(4)}%) below threshold (${profitThreshold}%)`);
        return null;
      }
    } catch (error) {
      console.error('Error checking arbitrage opportunity:', error);
      return null;
    }
  }
  
  // Function to run a single arbitrage check cycle
  async function runArbitrageCheck() {
    console.log('\n-- Starting new monitoring cycle --');
    displayBotStatus();
    
    // Check for arbitrage opportunities
    const opportunity = await checkArbitrageOpportunity();
    
    // 경로 찾기 실행 (수익성에 관계없이)
    if (pathFinder) {
        console.log('Searching for alternate arbitrage paths...');
        const alternatePaths = await pathFinder.findArbitragePaths('SOL', 3);
    
        // 수익성 있는 경로가 있는지 확인
        const profitablePaths = alternatePaths.filter(path => path.profitPercentage > 1.0);
        
        if (profitablePaths.length > 0) {
            console.log('\n----- PROFITABLE ALTERNATE PATHS FOUND -----');
            profitablePaths.forEach(path => {
                console.log(`Path: ${path.pathString}, Profit: ${path.profitPercentage.toFixed(4)}%`);
            });
            console.log('-------------------------------------------\n');
        }
    }
  


    if (opportunity) {
      botStats.opportunitiesDetected++;
      
      // Display detailed trade information
      const tradeDetails = displayTradeDetails(opportunity);
      
      // Update bot stats with actual profit percentage
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
      
      // Only execute transaction if actual profit is positive
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
        
        // Update AI accuracy
        if (arbitrageAI && opportunity.estimatedProfit > 0 && tradeDetails.result.profitPercentage > 0) {
          // Predicted profitable and was profitable
          const accuracyTotal = botStats.aiAccuracy * (botStats.aiPredictions - 1);
          botStats.aiAccuracy = (accuracyTotal + 100) / botStats.aiPredictions;
        } else if (arbitrageAI && opportunity.estimatedProfit > 0 && tradeDetails.result.profitPercentage <= 0) {
          // Predicted profitable but wasn't profitable
          const accuracyTotal = botStats.aiAccuracy * (botStats.aiPredictions - 1);
          botStats.aiAccuracy = accuracyTotal / botStats.aiPredictions;
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
      console.log('Solana Arbitrage Bot Starting (with OpenAI API)');
      console.log('============================================');
      console.log('Price data source: Jupiter API v6');
      console.log(`Transaction network: ${config.rpc?.url || 'https://api.devnet.solana.com'}`);
      console.log(`Wallet address: ${walletKeyPair.publicKey.toString()}`);
      console.log(`AI module: ${arbitrageAI ? 'Enabled (OpenAI API)' : 'Disabled'}`);
      
      // Check SOL balance
      const balance = await connection.getBalance(walletKeyPair.publicKey);
      console.log(`Current SOL balance: ${balance / 1e9} SOL`);
      
      if (balance < 0.1 * 1e9) {
        console.warn('Warning: Low SOL balance. Request an airdrop with:');
        console.warn(`solana airdrop 2 ${walletKeyPair.publicKey.toString()} --url https://api.devnet.solana.com`);
      }
      
      console.log('Bot started successfully.');
      console.log('============================================');
      
      // Check interval (10 seconds)
      const checkInterval = 10000; // 10 seconds
      
      console.log(`Monitoring interval: ${checkInterval / 1000} seconds`);
      
      // Initial check
      await runArbitrageCheck();
      
      // Setup periodic execution
      setInterval(runArbitrageCheck, checkInterval);
      
    } catch (error) {
      console.error('Error starting bot:', error);
    }
  }
    console.log('AI modules loaded:', !!riskAnalyzer, !!pathFinder);
    console.log('API key loaded:', !!process.env.OPENAI_API_KEY);
  
    // Start the bot
  startBot().catch(error => {
    console.error('Fatal error occurred:', error);
    process.exit(1);
  });

// Add this at the bottom of src/index2_ai.js, before the startBot() call
if (require.main === module) {
  (async () => {
    const { PathFinder } = require('./path-finder');
    const pf = new PathFinder('https://quote-api.jup.ag/v6');
    const results = await pf.findArbitragePaths('SOL', 3);
    console.log('Test PathFinder Results:', results);
    process.exit(0);
  })();
}