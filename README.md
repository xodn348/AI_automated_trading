# AI Automated Trading Bot

AI-powered automated trading system for Solana blockchain with arbitrage detection, liquidation monitoring, and risk management.

## Features

- **AI Trading**: OpenAI integration for market analysis
- **Arbitrage Bot**: Multi-DEX support with path discovery
- **Liquidation Bot**: Solend protocol integration
- **Risk Management**: Built-in risk assessment and limits

## Project Structure

```
bot/
├── src/
│   ├── arbitrage-bot/          # Arbitrage detection
│   ├── liquidation-bot/        # Liquidation monitoring
│   └── utils/                  # Utility functions
├── models/                     # AI models
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