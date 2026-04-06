/**
 * Strategy Manager - Loads and manages all trading strategies
 */
const RSIReversalStrategy = require('./rsi-reversal');
const EMACrossoverStrategy = require('./ema-crossover');
const MACDMomentumStrategy = require('./macd-momentum');
const BollingerBreakoutStrategy = require('./bollinger-breakout');
const VWAPStrategy = require('./vwap-strategy');
const ScalpingStrategy = require('./scalping');
const SmartMoneyStrategy = require('./smart-money');
const IchimokuStrategy = require('./ichimoku');
const MultiAIStrategy = require('./multi-ai');

class StrategyManager {
    constructor() {
        this.strategies = new Map();
        this.activeStrategy = null;
        this.loadStrategies();
    }

    loadStrategies() {
        const rsi = new RSIReversalStrategy();
        const ema = new EMACrossoverStrategy();
        const macd = new MACDMomentumStrategy();
        const bollinger = new BollingerBreakoutStrategy();
        const vwap = new VWAPStrategy();
        const scalping = new ScalpingStrategy();
        const smartMoney = new SmartMoneyStrategy();
        const ichimoku = new IchimokuStrategy();

        // Individual strategies
        this.strategies.set(rsi.id, rsi);
        this.strategies.set(ema.id, ema);
        this.strategies.set(macd.id, macd);
        this.strategies.set(bollinger.id, bollinger);
        this.strategies.set(vwap.id, vwap);
        this.strategies.set(scalping.id, scalping);
        this.strategies.set(smartMoney.id, smartMoney);
        this.strategies.set(ichimoku.id, ichimoku);

        // Multi AI strategy (combine ALL strategies including new ones)
        const multiAI = new MultiAIStrategy([rsi, ema, macd, bollinger, vwap, scalping, smartMoney, ichimoku]);
        this.strategies.set(multiAI.id, multiAI);

        // Default to Multi AI
        this.activeStrategy = multiAI;
    }

    getStrategy(id) {
        return this.strategies.get(id) || null;
    }

    setActiveStrategy(id) {
        const strategy = this.strategies.get(id);
        if (!strategy) throw new Error(`Strategy '${id}' not found`);
        this.activeStrategy = strategy;
        return strategy.getInfo();
    }

    getActiveStrategy() {
        return this.activeStrategy;
    }

    getAllStrategies() {
        const list = [];
        for (const [id, strategy] of this.strategies) {
            list.push({
                ...strategy.getInfo(),
                active: this.activeStrategy && this.activeStrategy.id === id
            });
        }
        return list;
    }

    analyze(marketData) {
        if (!this.activeStrategy) {
            throw new Error('No active strategy selected');
        }
        return this.activeStrategy.analyze(marketData);
    }

    getCount() {
        return this.strategies.size;
    }
}

module.exports = new StrategyManager();
