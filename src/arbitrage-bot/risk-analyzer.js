// src/risk-analyzer.js
const OpenAI = require("openai");
const dotenv = require('dotenv');

dotenv.config();

class RiskAnalyzer {
  constructor() {
    this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
  }

  // 거래 기회에 대한 종합적인 위험 평가
  async analyzeRisk(opportunity, marketData) {
    try {
      // 기본적인 위험 요소들 계산
      const liquidityRisk = this.calculateLiquidityRisk(opportunity, marketData);
      const volatilityRisk = this.calculateVolatilityRisk(marketData);
      const executionRisk = this.calculateExecutionRisk(opportunity);
      
      // OpenAI API를 사용한 고급 위험 분석
      const advancedRiskAnalysis = await this.getAIRiskAnalysis(opportunity, marketData, {
        liquidityRisk,
        volatilityRisk,
        executionRisk
      });
      
      // 종합 위험 점수 계산 (0-100, 낮을수록 안전)
      let compositeRiskScore = 0;
      
      if (advancedRiskAnalysis && advancedRiskAnalysis.riskScore) {
        compositeRiskScore = advancedRiskAnalysis.riskScore;
      } else {
        // AI 분석 실패 시 기본 계산 사용
        compositeRiskScore = (liquidityRisk * 0.4) + (volatilityRisk * 0.3) + (executionRisk * 0.3);
      }
      
      // 위험 수준 분류
      let riskLevel = 'low';
      if (compositeRiskScore > 70) riskLevel = 'very high';
      else if (compositeRiskScore > 50) riskLevel = 'high';
      else if (compositeRiskScore > 30) riskLevel = 'medium';
      
      return {
        riskScore: compositeRiskScore,
        riskLevel,
        details: {
          liquidityRisk,
          volatilityRisk,
          executionRisk
        },
        aiAnalysis: advancedRiskAnalysis,
        recommendation: advancedRiskAnalysis?.recommendation || this.getDefaultRecommendation(compositeRiskScore)
      };
    } catch (error) {
      console.error('Error analyzing risk:', error);
      return {
        riskScore: 50, // 오류 시 중간값 반환
        riskLevel: 'unknown',
        error: error.message
      };
    }
  }

  // 유동성 위험 계산
  calculateLiquidityRisk(opportunity, marketData) {
    // 거래 크기와 풀 유동성의 비율로 위험 계산
    const tradeSize = opportunity.inputAmount / 1e9; // SOL
    const poolLiquidity = marketData?.poolLiquidity || 10000; // 기본값 10000 SOL
    
    // 거래 크기가 풀 유동성의 1% 이상이면 위험 증가
    const liquidityRatio = (tradeSize / poolLiquidity) * 100;
    
    // 0-100 사이의 위험 점수 계산 (높을수록 위험)
    let risk = Math.min(liquidityRatio * 25, 100);
    
    return Math.max(0, Math.min(100, risk));
  }

  // 시장 변동성 위험 계산
  calculateVolatilityRisk(marketData) {
    const volatility = marketData?.volatility || 0.5; // 기본값 0.5%
    
    // 변동성에 따른 위험 계산 (0-100)
    let risk = volatility * 20; // 변동성 5%면 위험도 100
    
    return Math.max(0, Math.min(100, risk));
  }

  // 실행 위험 계산 (트랜잭션 실패 가능성)
  calculateExecutionRisk(opportunity) {
    // 네트워크 혼잡도, 슬리피지, 가격 변동 속도 등 고려
    const slippage = opportunity.costs?.slippage || 0.2;
    const priceDifference = opportunity.priceDifference || 0.1;
    
    // 슬리피지가 가격 차이에 가까울수록 위험 증가
    const slippageToPriceDiffRatio = (slippage / priceDifference) * 100;
    
    // 기본 실행 위험 (네트워크 상태에 따라 조정 가능)
    let risk = 10 + slippageToPriceDiffRatio;
    
    return Math.max(0, Math.min(100, risk));
  }

  // OpenAI API를 사용한 고급 위험 분석
  async getAIRiskAnalysis(opportunity, marketData, baseRisks) {
    try {
      const details = {
        opportunity: {
          buyDex: opportunity.buyDex,
          sellDex: opportunity.sellDex,
          priceDifference: opportunity.priceDifference,
          estimatedProfit: opportunity.estimatedProfit,
          tradeSize: opportunity.inputAmount / 1e9, // SOL
        },
        market: {
          volatility: marketData?.volatility || 0.5,
          condition: marketData?.marketCondition || 'normal',
          poolLiquidity: marketData?.poolLiquidity || 'unknown'
        },
        baseRisks
      };
      
      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "You are a cryptocurrency trading risk analyst. Assess the risk of arbitrage opportunities."
          },
          {
            role: "user",
            content: `Analyze the risk of this arbitrage opportunity:
            Buy DEX: ${details.opportunity.buyDex}
            Sell DEX: ${details.opportunity.sellDex}
            Price difference: ${details.opportunity.priceDifference.toFixed(4)}%
            Estimated profit: ${details.opportunity.estimatedProfit.toFixed(4)}%
            Trade size: ${details.opportunity.tradeSize.toFixed(4)} SOL
            Market volatility: ${details.market.volatility.toFixed(4)}%
            Market condition: ${details.market.condition}
            
            Base risk assessments:
            Liquidity risk: ${baseRisks.liquidityRisk.toFixed(2)}/100
            Volatility risk: ${baseRisks.volatilityRisk.toFixed(2)}/100
            Execution risk: ${baseRisks.executionRisk.toFixed(2)}/100
            
            Provide a JSON response with the following fields:
            1. riskScore (0-100, higher means more risky)
            2. riskFactors (array of risk factors identified)
            3. recommendation (action to take)
            4. reasoning (brief explanation)`
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });
      
      // Parse JSON response
      try {
        const content = response.data.choices[0].message.content;
        const jsonStart = content.indexOf('{');
        const jsonEnd = content.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
          const jsonString = content.substring(jsonStart, jsonEnd + 1);
          return JSON.parse(jsonString);
        }
        
        // If not valid JSON, try to extract key information
        const riskScoreMatch = content.match(/riskScore["\s:]+(\d+)/i);
        const recommendationMatch = content.match(/recommendation["\s:]+["'](.+?)["']/i);
        
        return {
          riskScore: riskScoreMatch ? parseInt(riskScoreMatch[1]) : 50,
          recommendation: recommendationMatch ? recommendationMatch[1] : 'Proceed with caution',
          rawResponse: content
        };
      } catch (parseError) {
        console.warn('Error parsing AI risk analysis:', parseError);
        return {
          riskScore: 50,
          recommendation: 'Proceed with caution (parsing error)',
          rawResponse: response.data.choices[0].message.content
        };
      }
    } catch (error) {
      console.error('Error getting AI risk analysis:', error);
      return null;
    }
  }
  
  // 위험 점수에 따른 기본 추천 사항
  getDefaultRecommendation(riskScore) {
    if (riskScore > 70) return 'Avoid this trade';
    if (riskScore > 50) return 'Reduce trade size and proceed with caution';
    if (riskScore > 30) return 'Proceed with standard risk management';
    return 'Safe to proceed with normal trade size';
  }
}

module.exports = { RiskAnalyzer };