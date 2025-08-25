const fs = require('fs');
const path = require('path');

function findHighestVolatilityPeriods(historicalDataPath = path.join(__dirname, '../data/historical'), topN = 5) {
    try {
        // Read all files in the historical data directory
        const files = fs.readdirSync(historicalDataPath)
            .filter(file => file.endsWith('.json'));

        // Process each file and collect volatility data
        const volatilityData = files.map(file => {
            const filePath = path.join(historicalDataPath, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            
            return {
                timestamp: data.analysis.timestamp,
                volatility: data.analysis.volatility,
                avgPrice: data.analysis.avgPrice,
                marketCondition: data.analysis.marketCondition,
                priceGapPercent: data.analysis.priceGapPercent,
                maxPrice: data.analysis.maxPrice,
                minPrice: data.analysis.minPrice
            };
        });

        // Sort by volatility in descending order
        volatilityData.sort((a, b) => b.volatility - a.volatility);

        // Get top N periods with highest volatility
        const topPeriods = volatilityData.slice(0, topN);

        console.log('\n=== Highest Volatility Periods ===');
        topPeriods.forEach((period, index) => {
            console.log(`\n#${index + 1} - ${new Date(period.timestamp).toLocaleString()}`);
            console.log(`Volatility: ${period.volatility.toFixed(4)}%`);
            console.log(`Market Condition: ${period.marketCondition}`);
            console.log(`Average Price: ${period.avgPrice.toFixed(4)} USDC`);
            console.log(`Price Range: ${period.minPrice.toFixed(4)} - ${period.maxPrice.toFixed(4)} USDC`);
            console.log(`Price Gap: ${period.priceGapPercent.toFixed(4)}%`);
        });

        // Calculate some statistics
        const avgVolatility = volatilityData.reduce((sum, data) => sum + data.volatility, 0) / volatilityData.length;
        const medianVolatility = volatilityData[Math.floor(volatilityData.length / 2)].volatility;

        console.log('\n=== Overall Statistics ===');
        console.log(`Total Periods Analyzed: ${volatilityData.length}`);
        console.log(`Average Volatility: ${avgVolatility.toFixed(4)}%`);
        console.log(`Median Volatility: ${medianVolatility.toFixed(4)}%`);
        
        return topPeriods;
    } catch (error) {
        console.error('Error analyzing historical data:', error);
        return null;
    }
}

// Run the analysis if this file is run directly
if (require.main === module) {
    findHighestVolatilityPeriods();
}

module.exports = { findHighestVolatilityPeriods };