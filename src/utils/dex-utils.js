// src/ai-module.js
const tf = require('@tensorflow/tfjs-node');
const fs = require('fs');
const path = require('path');

class ArbitrageAI {
  constructor(config) {
    this.config = config;
    this.modelPath = path.resolve(__dirname, '../models/price_prediction');
    this.historicalDataPath = path.resolve(__dirname, '../data/historical');
    this.model = null;
    this.isModelLoaded = false;
    
    // Initialize
    this.init();
  }
  
  async init() {
    try {
      // Check and create model directory if needed
      if (!fs.existsSync(this.modelPath)) {
        fs.mkdirSync(this.modelPath, { recursive: true });
        console.log(`Model directory created: ${this.modelPath}`);
      }
      
      // Check and create data directory if needed
      if (!fs.existsSync(this.historicalDataPath)) {
        fs.mkdirSync(this.historicalDataPath, { recursive: true });
        console.log(`Historical data directory created: ${this.historicalDataPath}`);
      }
      
      // Try to load the model
      await this.loadModel();
    } catch (error) {
      console.log('Error initializing AI module:', error.message);
      console.log('Using default prediction logic.');
    }
  }
  
  async loadModel() {
    try {
      const modelJsonPath = path.join(this.modelPath, 'model.json');
      if (fs.existsSync(modelJsonPath)) {
        this.model = await tf.loadLayersModel(`file://${modelJsonPath}`);
        this.isModelLoaded = true;
        console.log('AI model successfully loaded.');
      } else {
        console.log('No saved AI model found. Using default logic.');
      }
    } catch (error) {
      console.error('Error loading model:', error);
    }
  }
  
  // Save price data for training
  saveHistoricalData(pairData) {
    try {
      const timestamp = new Date().toISOString();
      const fileName = `${timestamp.replace(/:/g, '-')}.json`;
      const filePath = path.join(this.historicalDataPath, fileName);
      
      fs.writeFileSync(filePath, JSON.stringify(pairData, null, 2));
      console.log(`Data saved: ${fileName}`);
    } catch (error) {
      console.error('Error saving historical data:', error);
    }
  }
  
  // Improved slippage prediction
  predictSlippage(amount, dexName, marketData = {}) {
    // Base slippage calculation
    const baseSlippage = 0.1; // Base 0.1%
    
    // DEX liquidity weights (1 is base, lower means higher slippage)
    const liquidityFactor = {
      'Raydium': 1.2,  // High liquidity
      'Orca': 1.0,     // Normal liquidity
      'Lifinity': 0.7, // Low liquidity
      'Meteora': 0.8,  // Medium liquidity
      'Jupiter': 1.0   // Normal liquidity
    };
    
    // Use existing logic if AI model is not loaded
    if (!this.isModelLoaded) {
      const amountInSOL = amount / 1e9;
      let volumeFactor = 1.0;
      
      if (amountInSOL > 10) {
        volumeFactor = 2.0; // Double slippage for trades > 10 SOL
      } else if (amountInSOL > 1) {
        volumeFactor = 1.5; // 1.5x slippage for trades > 1 SOL
      }
      
      const dexFactor = liquidityFactor[dexName] || 1.0;
      return (baseSlippage * volumeFactor) / dexFactor;
    }
    
    // Consider additional factors when using AI model:
    // - Current market volatility
    // - Recent trading volume
    // - Liquidity pool depth
    try {
      // Prepare data for slippage prediction
      const features = [
        amount / 1e9, // Trade size (SOL)
        marketData?.volatility || 0.01, // Volatility (default if missing)
        marketData?.volume24h || 1000, // 24h volume
        liquidityFactor[dexName] || 1.0, // DEX liquidity factor
      ];
      
      // Convert to tensor
      const inputTensor = tf.tensor2d([features], [1, features.length]);
      
      // Make prediction
      const prediction = this.model.predict(inputTensor);
      const predictedSlippage = prediction.dataSync()[0];
      
      // Return predicted slippage (ensure minimum threshold)
      return Math.max(predictedSlippage, baseSlippage * 0.5);
    } catch (error) {
      console.error('Error predicting slippage:', error);
      
      // Fall back to existing logic on error
      const amountInSOL = amount / 1e9;
      let volumeFactor = 1.0;
      
      if (amountInSOL > 10) {
        volumeFactor = 2.0;
      } else if (amountInSOL > 1) {
        volumeFactor = 1.5;
      }
      
      const dexFactor = liquidityFactor[dexName] || 1.0;
      return (baseSlippage * volumeFactor) / dexFactor;
    }
  }
  
  // Recommend optimal trade size
  recommendTradeSize(opportunity, balance) {
    // Default trade size (10% of available balance)
    const defaultSize = balance * 0.1;
    
    if (!this.isModelLoaded) {
      return Math.min(defaultSize, 100000000); // Max 0.1 SOL (default)
    }
    
    try {
      // Factors affecting trade size decision
      const profitPercentage = opportunity.estimatedProfit;
      const volatility = opportunity.marketAnalysis?.volatility || 0.01;
      const priceDifference = opportunity.priceDifference;
      
      // Simple heuristic logic (can be replaced with AI)
      if (profitPercentage > 3) {
        // High profit opportunity - up to 25% of balance
        return Math.min(balance * 0.25, defaultSize * 2.5);
      } else if (profitPercentage > 1.5) {
        // Medium profit - up to 15% of balance
        return Math.min(balance * 0.15, defaultSize * 1.5);
      }
      
      // Return default trade size
      return Math.min(defaultSize, 100000000); // Max 0.1 SOL
    } catch (error) {
      console.error('Error calculating optimal trade size:', error);
      return Math.min(defaultSize, 100000000); // Max 0.1 SOL (on error)
    }
  }
  
  // Market condition analysis
  analyzeMarketCondition(priceData) {
    try {
      // Calculate price volatility across DEXes
      const prices = priceData.map(dex => dex.price);
      const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
      
      // Calculate standard deviation
      const variance = prices.reduce((sum, price) => sum + Math.pow(price - avgPrice, 2), 0) / prices.length;
      const stdDev = Math.sqrt(variance);
      
      // Volatility (stdDev / avgPrice)
      const volatility = (stdDev / avgPrice) * 100;
      
      // Assess market condition
      let marketCondition = 'normal';
      if (volatility > 1.0) {
        marketCondition = 'volatile';
      } else if (volatility < 0.1) {
        marketCondition = 'stable';
      }
      
      // Calculate price gap between highest and lowest
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);
      const priceGap = maxPrice - minPrice;
      const priceGapPercent = (priceGap / minPrice) * 100;
      
      // Return result
      return {
        avgPrice,
        volatility,
        marketCondition,
        priceGap,
        priceGapPercent,
        maxPrice,
        minPrice,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error analyzing market condition:', error);
      return {
        avgPrice: 0,
        volatility: 0,
        marketCondition: 'unknown',
        priceGap: 0,
        priceGapPercent: 0,
        maxPrice: 0,
        minPrice: 0,
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }
  
  // Predict future opportunities (experimental)
  predictFutureOpportunities(historicalData) {
    // Not yet implemented - for future expansion
    return {
      prediction: 'No prediction available yet',
      confidence: 0,
      nextCheckRecommendation: 10 // Recommend default 10s interval
    };
  }
}

module.exports = { ArbitrageAI };