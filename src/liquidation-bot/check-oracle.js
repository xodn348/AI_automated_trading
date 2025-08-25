const { 
  Connection,
  PublicKey,
  clusterApiUrl
} = require('@solana/web3.js');
const { SolendMarket } = require('@solendprotocol/solend-sdk');

// Devnet addresses from docs
const ADDRESSES = {
  PROGRAM_ID: 'ALend7Ketfx5bxh6ghsCDXAoDrhvEmsXT3cynB6aPLgx',
  MARKET: 'GvjoVKNjBvQcFaSKUW1gTE7DxhSpjHbE69umVR5nPuQp',
  SOL_RESERVE: '5VVLD7BQp8y3bTgyF5ezm1ResyMTR3PhYsT4iHFU8Sxz',
  USDC_RESERVE: 'FNNkz4RCQezSSS71rW27zh3ZgqHVZgQYTNwNfqgD5DZ',
  USDT_RESERVE: '5sjkv6HD8wycocJ4tC4U36HHbvgcXYqwFHcALQJ9tjgY',
};

// Map of reserve addresses to asset names
const RESERVE_TO_ASSET = {
  '5VVLD7BQp8y3bTgyF5ezm1ResyMTR3PhYsT4iHFU8Sxz': 'SOL',
  'FNNkz4RCQezSSS71rW2tvqZH1LCkTzaiG7Nd1LeA5x5y': 'USDC',
  'ERm3jhg8J94hxr7KmhkRvnuYbKZgNFEL4hXzBMeb1rQ8': 'USDT',
};

async function checkOraclePrices() {
  try {
    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');

    // Initialize the market
    console.log('Initializing Solend market...');
    const market = await SolendMarket.initialize(
      connection,
      'devnet',
      ADDRESSES.MARKET
    );

    // Load reserves
    console.log('Loading reserves...');
    await market.loadReserves();
    
    console.log('\nMarket Address:', ADDRESSES.MARKET);
    console.log('Program ID:', ADDRESSES.PROGRAM_ID);
    
    console.log('\nMain Reserves:');
    for (const reserve of market.reserves) {
      const assetName = RESERVE_TO_ASSET[reserve.config.address] || 'Unknown';
      
      // Only show main assets we're interested in
      if (assetName === 'SOL' || assetName === 'USDC' || assetName === 'USDT') {
        console.log(`\n${assetName}:`);
        console.log('Reserve Address:', reserve.config.address);
        console.log('Oracle Price:', reserve.stats?.assetPriceUSD ? `$${reserve.stats.assetPriceUSD}` : 'Stale');
        
        // Calculate utilization
        const available = BigInt(reserve.stats?.totalDepositsWads?.toString() || '0');
        const borrowed = BigInt(reserve.stats?.totalBorrowsWads?.toString() || '0');
        const utilization = borrowed * BigInt(100) / available;
        
        console.log('Available:', available.toString());
        console.log('Borrowed:', borrowed.toString());
        console.log('Utilization:', `${utilization}%`);
        
        if (assetName === 'SOL') {
            console.log('\nSOL price is active:', reserve.stats?.assetPriceUSD ? 'Yes' : 'No');
            console.log('Current SOL price:', `$${reserve.stats?.assetPriceUSD}`);
        }
      }
    }

  } catch (error) {
    console.error('Error checking oracle prices:', error);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
  }
}

checkOraclePrices().catch(console.error); 