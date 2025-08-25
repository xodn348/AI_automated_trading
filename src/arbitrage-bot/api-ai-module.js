// src/api-ai-module.js
const OpenAI = require("openai");
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// 환경 변수 로드
dotenv.config();

class ApiArbitrageAI {
  constructor(config) {
    this.config = config;
    this.historicalDataPath = path.resolve(__dirname, '../data/historical');
    
    // OpenAI API 설정
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
        const completion = await this.openai.createChatCompletion({
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
        const completion = await this.openai.createChatCompletion({
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

module.exports = { ApiArbitrageAI };