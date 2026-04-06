/**
 * Risk Manager - Enforces all risk management rules
 */
const db = require('../database');

class RiskManager {
    constructor() {
        this.defaults = {
            stopLossPercent: 2,
            profitPercent: 3,
            maxDailyTrades: 50,
            maxDailyLoss: 500,
            maxOpenPositions: 5,
            budgetPercent: 50,
            minBalance: 200,
            minPrice: 0,
            maxPrice: 9999999,
            tradeQtyMode: 'auto',
            manualQty: 1,
            leverage: 1,
            cooldownMinutes: 5
        };

        this.cooldowns = new Map(); // symbol -> last trade timestamp
    }

    getSettings() {
        return {
            stopLossPercent: parseFloat(db.getSetting('stop_loss_percent', this.defaults.stopLossPercent)),
            profitPercent: parseFloat(db.getSetting('profit_percent', this.defaults.profitPercent)),
            maxDailyTrades: parseInt(db.getSetting('max_daily_trades', this.defaults.maxDailyTrades)),
            maxDailyLoss: parseFloat(db.getSetting('max_daily_loss', this.defaults.maxDailyLoss)),
            maxOpenPositions: parseInt(db.getSetting('max_open_positions', this.defaults.maxOpenPositions)),
            budgetPercent: parseFloat(db.getSetting('budget_percent', this.defaults.budgetPercent)),
            minBalance: parseFloat(db.getSetting('min_balance', this.defaults.minBalance)),
            minPrice: parseFloat(db.getSetting('min_price', this.defaults.minPrice)),
            maxPrice: parseFloat(db.getSetting('max_price', this.defaults.maxPrice)),
            tradeQtyMode: db.getSetting('trade_qty_mode', this.defaults.tradeQtyMode),
            manualQty: parseFloat(db.getSetting('manual_qty', this.defaults.manualQty)),
            leverage: parseFloat(db.getSetting('leverage', this.defaults.leverage)),
            cooldownMinutes: parseInt(db.getSetting('cooldown_minutes', this.defaults.cooldownMinutes)),
            currency: db.getSetting('currency', 'INR')
        };
    }

    /**
     * Check if a trade is allowed based on all risk rules
     * @param {Object} params - { symbol, price, availableBalance, side }
     * @returns {Object} { allowed: boolean, reason: string }
     */
    canTrade(params) {
        const settings = this.getSettings();
        const { symbol, price, availableBalance } = params;

        // 1. Check minimum balance
        const tradingBudget = (availableBalance * settings.budgetPercent) / 100;
        const effectiveBalance = tradingBudget - settings.minBalance;

        if (availableBalance <= settings.minBalance) {
            return { allowed: false, reason: `Balance (${availableBalance}) is at or below minimum (${settings.minBalance})` };
        }

        if (effectiveBalance <= 0) {
            return { allowed: false, reason: `No tradable budget after reserving minimum balance of ${settings.minBalance}` };
        }

        // 2. Check price range
        if (price < settings.minPrice) {
            return { allowed: false, reason: `Price ${price} is below minimum ${settings.minPrice}` };
        }
        if (price > settings.maxPrice) {
            return { allowed: false, reason: `Price ${price} is above maximum ${settings.maxPrice}` };
        }

        // 3. Check daily trade limit
        const dailyStats = db.getTodayStats();
        if (dailyStats.total_trades >= settings.maxDailyTrades) {
            return { allowed: false, reason: `Daily trade limit reached (${settings.maxDailyTrades})` };
        }

        // 4. Check daily loss limit
        if (Math.abs(dailyStats.total_loss) >= settings.maxDailyLoss) {
            return { allowed: false, reason: `Daily loss limit reached (${settings.maxDailyLoss})` };
        }

        // 5. Check open positions limit
        const openTrades = db.getOpenTrades();
        if (openTrades.length >= settings.maxOpenPositions) {
            return { allowed: false, reason: `Max open positions reached (${settings.maxOpenPositions})` };
        }

        // 6. Check cooldown period
        if (this.isInCooldown(symbol)) {
            const remaining = this.getCooldownRemaining(symbol);
            return { allowed: false, reason: `Cooldown active for ${symbol} (${remaining}m remaining)` };
        }

        return { allowed: true, reason: 'All risk checks passed' };
    }

    /**
     * Calculate trade quantity
     */
    calculateQuantity(price, availableBalance) {
        const settings = this.getSettings();

        if (settings.tradeQtyMode === 'manual') {
            return settings.manualQty;
        }

        // Auto calculation: use budget percentage minus minimum balance
        const tradingBudget = (availableBalance * settings.budgetPercent) / 100;
        const effectiveBalance = Math.max(0, tradingBudget - settings.minBalance);

        // Use a portion of effective balance per trade (divide by max positions for diversification)
        const perTradeAmount = effectiveBalance / settings.maxOpenPositions;
        let qty = (perTradeAmount * settings.leverage) / price;

        // Round to whole number
        qty = Math.max(1, Math.floor(qty));
        return qty;
    }

    /**
     * Calculate stop loss and take profit prices
     */
    calculateExitPrices(entryPrice, side) {
        const settings = this.getSettings();

        let stopLoss, takeProfit;

        if (side === 'buy') {
            stopLoss = entryPrice * (1 - settings.stopLossPercent / 100);
            takeProfit = entryPrice * (1 + settings.profitPercent / 100);
        } else {
            stopLoss = entryPrice * (1 + settings.stopLossPercent / 100);
            takeProfit = entryPrice * (1 - settings.profitPercent / 100);
        }

        return {
            stopLoss: parseFloat(stopLoss.toFixed(2)),
            takeProfit: parseFloat(takeProfit.toFixed(2))
        };
    }

    /**
     * Set cooldown for a symbol after trade
     */
    setCooldown(symbol) {
        this.cooldowns.set(symbol, Date.now());
    }

    isInCooldown(symbol) {
        if (!this.cooldowns.has(symbol)) return false;
        const settings = this.getSettings();
        const lastTrade = this.cooldowns.get(symbol);
        const cooldownMs = settings.cooldownMinutes * 60 * 1000;
        return (Date.now() - lastTrade) < cooldownMs;
    }

    getCooldownRemaining(symbol) {
        if (!this.cooldowns.has(symbol)) return 0;
        const settings = this.getSettings();
        const lastTrade = this.cooldowns.get(symbol);
        const cooldownMs = settings.cooldownMinutes * 60 * 1000;
        const remaining = cooldownMs - (Date.now() - lastTrade);
        return Math.max(0, Math.ceil(remaining / 60000));
    }

    /**
     * Get trading budget info for display
     */
    getBudgetInfo(availableBalance) {
        const settings = this.getSettings();
        const tradingBudget = (availableBalance * settings.budgetPercent) / 100;
        const effectiveBalance = Math.max(0, tradingBudget - settings.minBalance);

        return {
            availableBalance,
            budgetPercent: settings.budgetPercent,
            tradingBudget,
            minBalance: settings.minBalance,
            effectiveTradingBalance: effectiveBalance,
            currency: settings.currency
        };
    }
}

module.exports = new RiskManager();
