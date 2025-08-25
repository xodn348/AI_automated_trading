// src/utils/calc-utils.js

// Gas cost estimation function
function estimateGasCost(amount) {
    // Solana gas costs are calculated in fixed lamports, not as a percentage of SOL
    // But we can convert to a percentage of transaction amount
    
    // Approximate transaction gas cost: 0.00045 SOL (450,000 lamports)
    // SOL -> USDC -> SOL trade costs about 0.0009 SOL
    const gasCostInSOL = 0.0009;
    
    // Calculate gas cost as percentage of transaction amount
    const amountInSOL = amount / 1e9; // lamports -> SOL
    const gasCostPercentage = (gasCostInSOL / amountInSOL) * 100;
    
    return gasCostPercentage;
  }
  
  // Slippage estimation function (base implementation)
  function estimateSlippage(amount, dexName) {
    // Estimate slippage based on transaction volume
    // DEXes with more liquidity have less slippage
    const baseSlippage = 0.1; // Base 0.1%
    
    // DEX liquidity weights (1 is base, lower means higher slippage)
    const liquidityFactor = {
      'Raydium': 1.2,  // High liquidity
      'Orca': 1.0,     // Normal liquidity
      'Lifinity': 0.7, // Low liquidity
      'Meteora': 0.8,  // Medium liquidity
      'Jupiter': 1.0   // Normal liquidity
    };
    
    // Adjust slippage based on transaction volume
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
  
  // Calculate trade details function
  function calculateTradeDetails(opportunity, DEX_FEE_MAP) {
    // SOL amount
    const inputAmountSOL = opportunity.inputAmount / 1e9;
    
    // Buy DEX conversion to USDC (before fees)
    const rawBuyAmountUSDC = inputAmountSOL * opportunity.buyPrice;
    
    // Calculate buy DEX fees
    const buyDexFee = DEX_FEE_MAP[opportunity.buyDex] || DEX_FEE_MAP.Jupiter;
    const buyFeeUSDC = rawBuyAmountUSDC * (buyDexFee / 100);
    
    // Actual USDC amount after buy (after fees)
    const actualBuyAmountUSDC = rawBuyAmountUSDC - buyFeeUSDC;
    
    // Sell DEX conversion to SOL (before fees)
    const rawSellAmountSOL = actualBuyAmountUSDC / opportunity.sellPrice;
    
    // Calculate sell DEX fees
    const sellDexFee = DEX_FEE_MAP[opportunity.sellDex] || DEX_FEE_MAP.Jupiter;
    const sellFeeSOL = rawSellAmountSOL * (sellDexFee / 100);
    
    // Gas cost (in SOL)
    const gasCostSOL = 0.0009; // About 900,000 lamports
    
    // Loss due to slippage
    const slippageLossSOL = inputAmountSOL * (opportunity.costs.slippage / 100);
    
    // Sum of all costs (in SOL)
    const totalCostsSOL = sellFeeSOL + gasCostSOL + slippageLossSOL;
    const totalCostsUSDC = totalCostsSOL * opportunity.sellPrice;
    
    // Final SOL amount (after all costs)
    const finalAmountSOL = rawSellAmountSOL - sellFeeSOL - gasCostSOL - slippageLossSOL;
    
    // Calculate profit
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
        fee: sellFeeSOL * opportunity.sellPrice, // Convert to USDC
        result: rawSellAmountSOL * opportunity.sellPrice // In USDC
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
  
  // Display trade details function
  function displayTradeDetails(opportunity, DEX_FEE_MAP) {
    const details = calculateTradeDetails(opportunity, DEX_FEE_MAP);
    
    console.log('\n========== ARBITRAGE TRADE DETAILS ==========');
    console.log(`Input: ${details.input.sol.toFixed(4)} SOL (${details.input.usdc.toFixed(2)} USDC)`);
    
    // Add AI market analysis information
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
    
    // Add AI recommendation information
    if (opportunity.recommendedSize) {
      console.log('\n----- AI RECOMMENDATION -----');
      console.log(`AI recommended size: ${(opportunity.recommendedSize / 1e9).toFixed(4)} SOL`);
      console.log(`Confidence score: ${opportunity.confidenceScore || 'N/A'}`);
    }
    
    console.log('==============================================\n');
    
    return details;
  }
  
  module.exports = {
    estimateGasCost,
    estimateSlippage,
    calculateTradeDetails,
    displayTradeDetails
  };