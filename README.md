# AI Automated Trading Bot

AI-powered automated trading system for Solana blockchain with arbitrage detection, liquidation monitoring, and risk management.

## Features

### AI-Powered Trading
- OpenAI integration for market analysis and trading decisions
- Intelligent risk assessment using machine learning
- Market sentiment analysis

### Arbitrage Bot
- Multi-DEX support (Jupiter, Raydium, etc.)
- Advanced arbitrage path discovery
- Real-time market monitoring
- Built-in risk management

### Liquidation Bot
- Solend protocol integration
- Market volatility monitoring
- Oracle price validation
- Automated position management

### Technical Features
- Solana devnet support
- Anchor framework integration
- Real-time data collection
- Configurable parameters via TOML

## Project Structure

```
bot/
├── src/
│   ├── arbitrage-bot/          # Arbitrage detection and execution
│   │   ├── index.js            # Main arbitrage bot
│   │   ├── index2_ai.js        # AI-enhanced version
│   │   ├── api-ai-module.js    # OpenAI integration
│   │   ├── path-finder.js      # Path discovery
│   │   └── risk-analyzer.js    # Risk assessment
│   ├── liquidation-bot/        # Liquidation monitoring
│   │   ├── liquidation-bot.js  # Main liquidation bot
│   │   ├── check-oracle.js     # Price validation
│   │   └── analyze-volatility.js
│   ├── utils/                  # Utility functions
│   └── data/                   # Data storage
├── models/                     # AI/ML models
├── config.toml                 # Configuration
└── package.json                # Dependencies
```

## Installation

### Prerequisites
- Node.js (v16+)
- Solana CLI tools
- Anchor Framework

### Setup
1. Clone and install:
```bash
git clone https://github.com/xodn348/AI_automated_trading.git
cd AI_automated_trading
npm install
```

2. Configure environment:
```bash
# Create .env file in src/arbitrage-bot/
OPENAI_API_KEY=your_openai_api_key
SOLANA_PRIVATE_KEY=your_solana_private_key
SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Usage

### Start Arbitrage Bot
```bash
# Main bot
npm start

# AI-enhanced version
node src/arbitrage-bot/index2_ai.js
```

### Start Liquidation Bot
```bash
# Liquidation monitoring
node src/liquidation-bot/liquidation-bot.js

# Create test positions
node src/liquidation-bot/create-test-position.js
```

### Testing
```bash
cd test-liquidation
npm test
```

## Configuration

Edit `config.toml` for:
- Network settings (RPC endpoints)
- Trading parameters (slippage, position sizes)
- AI settings (OpenAI configuration)
- Risk management (stop-loss, take-profit)

## Security

- API keys stored in `.env` (not committed to Git)
- Configurable trading limits
- Oracle price validation
- Slippage protection

## Data Collection

Automatically collects:
- Historical price data
- Trading performance metrics
- Market volatility data
- Arbitrage opportunity logs

## License

MIT License - see LICENSE file for details.

## Disclaimer

For educational and research purposes only. Cryptocurrency trading involves significant risk. Use at your own risk.