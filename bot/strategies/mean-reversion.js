/**
 * Mean Reversion Strategy
 * Trades when price deviates significantly from moving average (z-score based)
 */
class MeanReversionStrategy {
    constructor() {
        this.id = 'mean-reversion';
        this.name = 'Mean Reversion';
        this.description = 'Trades when price deviates from moving average. Z-score based.';
        this.winRate = 61;
        this.timeframe = '15m - 1h';
        this.riskLevel = 'Conservative';
        this.maPeriod = 20;
        this.zScoreThreshold = 2.0; // Standard deviations from mean
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    analyze(marketData) {
        const { closes, volumes } = marketData;
        if (!closes || closes.length < this.maPeriod + 5) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for Mean Reversion' };
        }

        const recent = closes.slice(-this.maPeriod);
        const mean = recent.reduce((a, b) => a + b, 0) / this.maPeriod;
        const variance = recent.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / this.maPeriod;
        const stdDev = Math.sqrt(variance);

        if (stdDev === 0) return { signal: 'none', confidence: 0, reason: 'No price variation' };

        const price = closes[closes.length - 1];
        const prevPrice = closes[closes.length - 2];
        const zScore = (price - mean) / stdDev;
        const prevZScore = (prevPrice - mean) / stdDev;

        // Volume confirmation
        let volumeConfirmed = true;
        if (volumes && volumes.length >= 10) {
            const recentVol = volumes[volumes.length - 1];
            const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
            volumeConfirmed = recentVol > avgVol * 0.8;
        }

        // Buy: price significantly below mean (z-score < -threshold) + starting to recover
        if (zScore < -this.zScoreThreshold && price > prevPrice) {
            if (!volumeConfirmed) {
                return { signal: 'none', confidence: 15, reason: `Below mean (z:${zScore.toFixed(2)}) but low volume` };
            }

            const confidence = Math.min(85, 55 + Math.abs(zScore) * 10);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `Mean reversion BUY: price ${Math.abs(zScore).toFixed(1)}σ below mean (${mean.toFixed(2)}) + recovering`,
                indicator: { zScore: zScore.toFixed(2), mean: mean.toFixed(2), stdDev: stdDev.toFixed(4), price: price.toFixed(2) }
            };
        }

        // Sell: price significantly above mean + starting to fall
        if (zScore > this.zScoreThreshold && price < prevPrice) {
            if (!volumeConfirmed) {
                return { signal: 'none', confidence: 15, reason: `Above mean (z:${zScore.toFixed(2)}) but low volume` };
            }

            const confidence = Math.min(85, 55 + Math.abs(zScore) * 10);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `Mean reversion SELL: price ${zScore.toFixed(1)}σ above mean (${mean.toFixed(2)}) + declining`,
                indicator: { zScore: zScore.toFixed(2), mean: mean.toFixed(2), stdDev: stdDev.toFixed(4), price: price.toFixed(2) }
            };
        }

        return { signal: 'none', confidence: 0, reason: `Price within normal range (z-score: ${zScore.toFixed(2)})` };
    }
}

module.exports = MeanReversionStrategy;
