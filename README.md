# AI Automated Trading Bot

A sophisticated AI-powered automated trading system built for Solana blockchain, featuring arbitrage detection, liquidation monitoring, and intelligent risk management.

## 🚀 Features

### 🤖 AI-Powered Trading
- **OpenAI Integration**: Advanced AI analysis for market predictions and trading decisions
- **Risk Analysis**: Intelligent risk assessment using machine learning models
- **Market Sentiment Analysis**: AI-driven market sentiment evaluation

### 💰 Arbitrage Bot
- **Multi-DEX Support**: Jupiter, Raydium, and other Solana DEXes
- **Path Finding**: Advanced arbitrage path discovery algorithms
- **Real-time Monitoring**: Continuous market surveillance for opportunities
- **Risk Management**: Built-in risk assessment and position sizing

### 🏦 Liquidation Bot
- **Solend Protocol Integration**: Automated liquidation detection and execution
- **Volatility Analysis**: Market volatility monitoring and analysis
- **Oracle Price Checking**: Real-time price feed validation
- **Position Management**: Automated position creation and management

### 🔧 Technical Features
- **Solana Devnet Support**: Full devnet testing environment
- **Anchor Framework**: Smart contract integration using Anchor
- **Real-time Data**: Historical data collection and analysis
- **Configurable Parameters**: Flexible configuration via TOML files

## 📁 Project Structure

```
bot/
├── src/
│   ├── arbitrage-bot/          # Arbitrage detection and execution
│   │   ├── index.js            # Main arbitrage bot entry point
│   │   ├── index2_ai.js        # AI-enhanced arbitrage bot
│   │   ├── api-ai-module.js    # OpenAI API integration
│   │   ├── path-finder.js      # Arbitrage path discovery
│   │   └── risk-analyzer.js    # Risk assessment engine
│   ├── liquidation-bot/        # Liquidation monitoring and execution
│   │   ├── liquidation-bot.js  # Main liquidation bot
│   │   ├── check-oracle.js     # Price oracle validation
│   │   ├── analyze-volatility.js # Volatility analysis
│   │   └── client/             # Solend client integration
│   ├── utils/                  # Utility functions
│   │   ├── calc-utils.js       # Calculation utilities
│   │   └── dex-utils.js        # DEX interaction utilities
│   └── data/                   # Data collection and storage
├── models/                     # AI/ML models
├── data/                       # Historical data storage
├── test-liquidation/           # Liquidation testing environment
├── config.toml                 # Configuration file
└── package.json                # Dependencies and scripts
```

## 🛠️ Installation

### Prerequisites
- Node.js (v16 or higher)
- Solana CLI tools
- Anchor Framework

### Setup
1. Clone the repository:
```bash
git clone https://github.com/xodn348/AI_automated_trading.git
cd AI_automated_trading
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment:
```bash
cp config.toml.example config.toml
# Edit config.toml with your settings
```

4. Set up your wallet:
```bash
# Add your Solana wallet keypair
cp wallet.json.example wallet.json
# Edit wallet.json with your private key
```

## ⚙️ Configuration

### Main Configuration (`config.toml`)
- **Network Settings**: Solana RPC endpoints
- **Trading Parameters**: Slippage tolerance, position sizes
- **AI Settings**: OpenAI API configuration
- **Risk Management**: Stop-loss, take-profit levels

### Environment Variables
```bash
# Required environment variables
SOLANA_PRIVATE_KEY=your_private_key
OPENAI_API_KEY=your_openai_api_key
SOLANA_RPC_URL=your_rpc_endpoint
```

**⚠️ Important: API Key Security**
- Create a `.env` file in the `src/arbitrage-bot/` directory
- Never commit your `.env` file to Git (it's already in .gitignore)
- Example `.env` file structure:
```bash
# src/arbitrage-bot/.env
OPENAI_API_KEY=your_actual_openai_api_key_here
SOLANA_PRIVATE_KEY=your_actual_solana_private_key_here
SOLANA_RPC_URL=https://api.devnet.solana.com
```

## 🚀 Usage

### Starting the Arbitrage Bot
```bash
# Start the main arbitrage bot
npm start

# Start the AI-enhanced version
node src/arbitrage-bot/index2_ai.js
```

### Running the Liquidation Bot
```bash
# Start liquidation monitoring
node src/liquidation-bot/liquidation-bot.js

# Create test positions
node src/liquidation-bot/create-test-position.js
```

### Testing
```bash
# Run liquidation tests
cd test-liquidation
npm test
```

## 🔐 Security Features

- **Private Key Management**: Secure wallet key handling
- **Risk Limits**: Configurable trading limits and stop-losses
- **Oracle Validation**: Price feed verification
- **Slippage Protection**: Built-in slippage tolerance

## 📊 Data Collection

The bot automatically collects and stores:
- Historical price data
- Trading performance metrics
- Market volatility data
- Arbitrage opportunity logs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is for educational and research purposes. Trading cryptocurrencies involves significant risk. Use at your own risk and never invest more than you can afford to lose.

## 🆘 Support

For questions and support:
- Create an issue on GitHub
- Check the documentation in each module
- Review the configuration examples

## 🔄 Updates

The bot includes an automatic upgrade system:
```bash
./upgrade.sh
```

---

**Built with ❤️ for the Solana ecosystem**