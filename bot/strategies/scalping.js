/**
 * Scalping Strategy
 * Quick small profits on tight spreads. High frequency, Aggressive.
 */
class ScalpingStrategy {
    constructor() {
        this.id = 'scalping';
        this.name = 'Scalping';
        this.description = 'Quick small profits on tight spreads. High frequency trading.';
        this.winRate = 52;
        this.timeframe = '1m - 5m';
        this.riskLevel = 'Aggressive';
        this.lookback = 10;
        this.momentumThreshold = 0.05; // 0.05% minimum momentum
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    analyze(marketData) {
        const { closes, volumes, bid, ask } = marketData;
        if (!closes || closes.length < this.lookback + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data' };
        }

        const recent = closes.slice(-this.lookback);
        const current = closes[closes.length - 1];
        const prev = closes[closes.length - 2];

        // Calculate short-term momentum
        const momentum = ((current - prev) / prev) * 100;
        const avgPrice = recent.reduce((a, b) => a + b, 0) / recent.length;
        const deviation = ((current - avgPrice) / avgPrice) * 100;

        // Calculate micro-trend (last 5 candles)
        let upCandles = 0, downCandles = 0;
        for (let i = closes.length - 5; i < closes.length; i++) {
            if (closes[i] > closes[i - 1]) upCandles++;
            else downCandles++;
        }

        // Check volume spike
        let volumeSpike = false;
        if (volumes && volumes.length >= this.lookback) {
            const recentVol = volumes[volumes.length - 1];
            const avgVol = volumes.slice(-this.lookback).reduce((a, b) => a + b, 0) / this.lookback;
            volumeSpike = recentVol > avgVol * 1.3;
        }

        // Scalp Buy: Quick dip with volume and recovery signs
        if (momentum > this.momentumThreshold && deviation < -0.1 && (volumeSpike || upCandles >= 3)) {
            const confidence = Math.min(85, 45 + Math.abs(momentum) * 30 + (volumeSpike ? 15 : 0));
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `Scalp buy: momentum ${momentum.toFixed(3)}%, ${upCandles}/5 up candles${volumeSpike ? ', volume spike' : ''}`,
                indicator: { momentum: momentum.toFixed(3) + '%', deviation: deviation.toFixed(3) + '%', upCandles, volumeSpike }
            };
        }

        // Scalp Sell: Quick peak with reversal signs
        if (momentum < -this.momentumThreshold && deviation > 0.1 && (volumeSpike || downCandles >= 3)) {
            const confidence = Math.min(85, 45 + Math.abs(momentum) * 30 + (volumeSpike ? 15 : 0));
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `Scalp sell: momentum ${momentum.toFixed(3)}%, ${downCandles}/5 down candles${volumeSpike ? ', volume spike' : ''}`,
                indicator: { momentum: momentum.toFixed(3) + '%', deviation: deviation.toFixed(3) + '%', downCandles, volumeSpike }
            };
        }

        return { signal: 'none', confidence: 0, reason: `No scalp opportunity (momentum: ${momentum.toFixed(3)}%)` };
    }
}

module.exports = ScalpingStrategy;
