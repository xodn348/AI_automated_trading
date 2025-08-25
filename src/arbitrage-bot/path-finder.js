// src/path-finder.js
const OpenAI = require("openai");
const { PublicKey } = require('@solana/web3.js');
const fetch = require('cross-fetch');
const dotenv = require('dotenv');

dotenv.config();

// 주요 토큰 주소들
const TOKEN_ADDRESSES = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  SRM: 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
};

class PathFinder {
  constructor(jupiterApiBase) {
    this.jupiterApiBase = jupiterApiBase || 'https://quote-api.jup.ag/v6';
    
    this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    
    // API 호출 사이의 딜레이 (rate limit 방지)
    this.apiDelay = 500; // 500ms
  }
  
  // Helper for waiting between API calls
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // Jupiter API를 사용하여 실제 가격 견적 가져오기
  async getQuote(inputMint, outputMint, amount) {
    try {
      const params = new URLSearchParams({
        inputMint: inputMint,
        outputMint: outputMint,
        amount: amount.toString(),
        slippageBps: 50
      });
      
      const url = `${this.jupiterApiBase}/quote?${params.toString()}`;
      console.log(`Getting quote from: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      
      return {
        outAmount: data.outAmount,
        inAmount: amount,
        price: Number(data.outAmount) / Number(amount),
        routes: data.routePlan || []
      };
    } catch (error) {
      console.error(`Error getting quote for ${inputMint} to ${outputMint}:`, error);
      return null;
    }
  }
  
  // AI를 사용하여 잠재적 경로 추천 받기
  async suggestArbitragePaths(startToken = 'SOL', maxPathLength = 3) {
    try {
      // 토큰 리스트
      const tokenSymbols = Object.keys(TOKEN_ADDRESSES);
      
      console.log(`Getting AI suggestions for arbitrage paths starting with ${startToken}...`);
      
      // OpenAI API 호출
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a cryptocurrency arbitrage expert. Find potential arbitrage paths."
          },
          {
            role: "user",
            content: `Find 5 potential arbitrage paths on Solana starting with ${startToken} and returning to ${startToken}.
            Available tokens: ${tokenSymbols.join(', ')}
            Maximum path length: ${maxPathLength} tokens (including start/end)
            
            Consider current DeFi market dynamics and liquidity. Focus on paths that are likely to be profitable based on
            common price differences between DEXes. Include both simple paths (e.g. SOL->USDC->SOL) 
            and more complex paths that might capture more inefficiencies.
            
            Provide a JSON array of paths, each represented as an array of token symbols.
            For example: [["SOL", "USDC", "SOL"], ["SOL", "USDT", "SOL"], ["SOL", "USDC", "RAY", "SOL"]]`
          }
        ],
        temperature: 0.5,
        max_tokens: 500
      });
      
      try {
        const content = response.choices[0].message.content;
        const jsonStart = content.indexOf('[');
        const jsonEnd = content.lastIndexOf(']');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = content.substring(jsonStart, jsonEnd + 1);
          const paths = JSON.parse(jsonString);
          
          // 유효한 경로만 필터링
          return paths.filter(path => {
            return Array.isArray(path) && 
                  path.length >= 3 && 
                  path.length <= maxPathLength + 1 &&
                  path[0] === startToken && 
                  path[path.length-1] === startToken;
          });
        }
      } catch (parseError) {
        console.warn('Error parsing AI path suggestions:', parseError);
      }
      
      // 기본 경로 반환
      return [
        [startToken, 'USDC', startToken],
        [startToken, 'USDT', startToken],
        [startToken, 'RAY', startToken],
        [startToken, 'USDC', 'RAY', startToken],
        [startToken, 'USDC', 'USDT', startToken]
      ];
    } catch (error) {
      console.error('Error getting AI path suggestions:', error);
      // 기본 경로 반환
      return [
        [startToken, 'USDC', startToken],
        [startToken, 'USDT', startToken]
      ];
    }
  }
  
  // 거래 경로의 실제 수익성 계산
  async evaluatePathProfitability(path, startAmount = 100000000) { // 0.1 SOL
    console.log(`Evaluating path: ${path.join(' -> ')}`);
    let currentToken = path[0];
    let currentAmount = startAmount;
    const steps = [];
    
    try {
      // 각 경로 단계별로 실제 견적 가져오기
      for (let i = 0; i < path.length - 1; i++) {
        const fromToken = path[i];
        const toToken = path[i+1];
        
        // 토큰 주소 가져오기
        const fromMint = TOKEN_ADDRESSES[fromToken];
        const toMint = TOKEN_ADDRESSES[toToken];
        
        if (!fromMint || !toMint) {
          throw new Error(`Unknown token: ${!fromMint ? fromToken : toToken}`);
        }
        
        console.log(`Step ${i+1}: ${fromToken}(${currentAmount}) -> ${toToken}`);
        
        // Jupiter API에서 실제 견적 가져오기
        const quote = await this.getQuote(fromMint, toMint, currentAmount);
        
        if (!quote) {
          throw new Error(`Failed to get quote for ${fromToken} to ${toToken}`);
        }
        
        // 다음 단계의 금액 갱신
        const prevAmount = currentAmount;
        currentAmount = Number(quote.outAmount);
        
        steps.push({
          from: fromToken,
          to: toToken,
          inAmount: prevAmount,
          outAmount: currentAmount,
          rate: quote.price
        });
        
        // API 호출 사이 딜레이
        await this.sleep(this.apiDelay);
      }
      
      // 최종 수익 계산
      const initialAmount = startAmount;
      const finalAmount = currentAmount;
      const profit = finalAmount - initialAmount;
      const profitPercentage = (profit / initialAmount) * 100;
      
      const result = {
        path,
        pathString: path.join(' -> '),
        initialAmount,
        finalAmount,
        profit,
        profitPercentage,
        steps,
        evaluated: true
      };
      
      console.log(`Path evaluation complete: ${result.pathString}, Profit: ${result.profitPercentage.toFixed(4)}%`);
      return result;
    } catch (error) {
      console.error(`Error evaluating path ${path.join(' -> ')}:`, error);
      return {
        path,
        pathString: path.join(' -> '),
        error: error.message,
        evaluated: false
      };
    }
  }
  
  // 메인 함수: 경로 찾기 및 평가
  async findArbitragePaths(startToken = 'SOL', maxPathLength = 3) {
    console.log(`Finding arbitrage paths starting with ${startToken}...`);
    
    try {
      // AI로 가능한 경로 추천 받기
      const potentialPaths = await this.suggestArbitragePaths(startToken, maxPathLength);
      console.log(`AI suggested ${potentialPaths.length} potential arbitrage paths`);
      
      // 각 경로 실제 평가
      const results = [];
      for (const path of potentialPaths) {
        const result = await this.evaluatePathProfitability(path);
        results.push(result);
      }
      
      // 수익 기준으로 정렬
      const evaluatedPaths = results.filter(r => r.evaluated);
      evaluatedPaths.sort((a, b) => b.profitPercentage - a.profitPercentage);
      
      console.log("\n----- ARBITRAGE PATH RESULTS -----");
      for (const path of evaluatedPaths) {
        console.log(`${path.pathString}: ${path.profitPercentage.toFixed(4)}%`);
      }
      console.log("---------------------------------\n");
      
      return evaluatedPaths;
    } catch (error) {
      console.error('Error finding arbitrage paths:', error);
      return [];
    }
  }
}

module.exports = { PathFinder };