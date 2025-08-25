# AI Automated Trading Bot

**Linux-only automated trading system** for Solana blockchain with arbitrage detection, liquidation monitoring, and risk management.

> ⚠️ **Important**: This bot is designed and tested for Linux environments only. It may not work properly on macOS or Windows.

## Features

- **AI Trading**: OpenAI integration for market analysis
- **Arbitrage Bot**: Multi-DEX support with path discovery
- **Liquidation Bot**: Solend protocol integration
- **Risk Management**: Built-in risk assessment and limits
- **Devnet Testing**: Safe testing environment on Solana devnet only
- **Real-time Monitoring**: Continuous price monitoring and opportunity detection

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
- **Operating System**: Linux (Ubuntu 18.04+, CentOS 7+, or similar)
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

3. **Important: Fix wallet path issue**
```bash
# Copy wallet.json to src/ directory (required for bot to start)
cp wallet.json src/wallet.json

# Or modify config.toml to use correct path
# Comment out: private_key_path = "/home/jnnj92/bot/wallet.json"
```

## Linux Deployment

### Quick Setup
```bash
# Make deployment script executable
chmod +x deploy-linux.sh

# Run deployment script
./deploy-linux.sh
```

### Docker Deployment
```bash
# Build and run with Docker
docker-compose up -d

# Or build manually
docker build -t ai-trading-bot .
docker run -d --name ai-trading-bot ai-trading-bot
```

### Systemd Service
```bash
# Start as system service
sudo systemctl start ai-trading-bot

# Enable auto-start
sudo systemctl enable ai-trading-bot

# Check status
sudo systemctl status ai-trading-bot

# View logs
sudo journalctl -u ai-trading-bot -f
```

## Usage

### Start Arbitrage Bot
```bash
# Main bot (requires wallet.json in src/ directory)
npm start

# AI-enhanced version
node src/arbitrage-bot/index2_ai.js

# Test bot startup (recommended first)
node -e "try { require('./src/arbitrage-bot/index.js'); console.log('Bot loaded successfully!'); } catch(e) { console.error('Error:', e.message); }"
```

### Important Notes
- **Wallet Setup**: Ensure `wallet.json` exists in `src/` directory
- **Devnet Only**: Bot currently works only on Solana devnet for safety
- **Test Mode**: Bot runs in monitoring mode without executing real trades
- **API Keys**: OpenAI API key required for AI features to work

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

### Current Settings
- **Network**: Solana devnet only (`https://api.devnet.solana.com`)
- **Trading**: Test mode (no real transactions executed)
- **Monitoring**: 30-second intervals for arbitrage opportunities
- **Safety**: 1% minimum profit threshold before execution

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