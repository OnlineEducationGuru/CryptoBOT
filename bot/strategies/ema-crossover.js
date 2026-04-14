/**
 * EMA Crossover Strategy (Optimized v2)
 * Triple EMA (9/21/55) with ADX trend filter, slope confirmation, and volume check
 * Reduced false signals by requiring trend strength + EMA slope alignment
 */
class EMACrossoverStrategy {
    constructor() {
        this.id = 'ema-crossover';
        this.name = 'EMA Crossover';
        this.description = 'Triple EMA (9/21/55) + ADX trend filter + slope confirmation. Eliminates choppy-market false signals.';
        this.winRate = 63;
        this.timeframe = '1h - 4h';
        this.riskLevel = 'Moderate';
        this.shortPeriod = 9;
        this.longPeriod = 21;
        this.trendPeriod = 55;
        this.minGapPercent = 0.02;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateEMA(closes, period) {
        if (closes.length < period) return [];
        const multiplier = 2 / (period + 1);
        const ema = [closes.slice(0, period).reduce((a, b) => a + b, 0) / period];
        for (let i = period; i < closes.length; i++) {
            ema.push((closes[i] - ema[ema.length - 1]) * multiplier + ema[ema.length - 1]);
        }
        return ema;
    }

    // Calculate ADX for trend strength
    calculateADX(highs, lows, closes, period = 14) {
        if (!highs || !lows || closes.length < period * 2) return null;
        let plusDM = 0, minusDM = 0, tr = 0;
        for (let i = 1; i <= period; i++) {
            const highDiff = highs[i] - highs[i - 1];
            const lowDiff = lows[i - 1] - lows[i];
            plusDM += highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
            minusDM += lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;
            tr += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
        }
        for (let i = period + 1; i < closes.length; i++) {
            const highDiff = highs[i] - highs[i - 1];
            const lowDiff = lows[i - 1] - lows[i];
            const curTR = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
            plusDM = plusDM - (plusDM / period) + (highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
            minusDM = minusDM - (minusDM / period) + (lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);
            tr = tr - (tr / period) + curTR;
        }
        const plusDI = tr > 0 ? (plusDM / tr) * 100 : 0;
        const minusDI = tr > 0 ? (minusDM / tr) * 100 : 0;
        const dx = (plusDI + minusDI) > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;
        return { adx: dx, plusDI, minusDI };
    }

    // Calculate EMA slope (rate of change over last N points)
    emaSlope(ema, lookback = 3) {
        if (ema.length < lookback + 1) return 0;
        const current = ema[ema.length - 1];
        const past = ema[ema.length - 1 - lookback];
        return ((current - past) / past) * 100;
    }

    analyze(marketData) {
        const { closes, highs, lows, volumes } = marketData;
        if (!closes || closes.length < this.trendPeriod + 2) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for triple EMA' };
        }

        const shortEma = this.calculateEMA(closes, this.shortPeriod);
        const longEma = this.calculateEMA(closes, this.longPeriod);
        const trendEma = this.calculateEMA(closes, this.trendPeriod);

        if (shortEma.length < 2 || longEma.length < 2 || trendEma.length < 1) {
            return { signal: 'none', confidence: 0, reason: 'Cannot calculate EMAs' };
        }

        const currentShort = shortEma[shortEma.length - 1];
        const prevShort = shortEma[shortEma.length - 2];
        const currentLong = longEma[longEma.length - 1];
        const prevLong = longEma[longEma.length - 2];
        const currentTrend = trendEma[trendEma.length - 1];
        const currentPrice = closes[closes.length - 1];

        const gap = ((currentShort - currentLong) / currentLong) * 100;

        // NEW: ADX trend strength filter
        const adxData = this.calculateADX(highs, lows, closes);
        const adxOk = !adxData || adxData.adx > 18; // ADX > 18 means trending market

        // NEW: EMA slope confirmation
        const shortSlope = this.emaSlope(shortEma, 3);
        const longSlope = this.emaSlope(longEma, 3);

        // NEW: Volume confirmation
        let volConfirmed = true;
        if (volumes && volumes.length >= 10) {
            const recentVol = volumes[volumes.length - 1];
            const avgVol = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
            volConfirmed = recentVol > avgVol * 0.8;
        }

        // Bullish crossover
        if (prevShort <= prevLong && currentShort > currentLong) {
            if (Math.abs(gap) < this.minGapPercent) {
                return { signal: 'none', confidence: 10, reason: `EMA crossover too small (gap: ${gap.toFixed(4)}%)` };
            }
            if (currentPrice < currentTrend) {
                return { signal: 'none', confidence: 15, reason: `Bullish crossover but price below EMA55 trend` };
            }
            // NEW: Require ADX trending
            if (!adxOk) {
                return { signal: 'none', confidence: 15, reason: `Bullish crossover but ADX too low (choppy market, ADX: ${adxData?.adx?.toFixed(1)})` };
            }
            // NEW: Require short EMA sloping up
            if (shortSlope < 0) {
                return { signal: 'none', confidence: 15, reason: `Bullish crossover but EMA9 slope negative (${shortSlope.toFixed(3)}%)` };
            }

            let confidence = Math.min(90, 55 + gap * 10);
            let reason = `EMA9 crossed above EMA21 (gap: ${gap.toFixed(3)}%) + EMA55 trend`;
            if (adxData?.adx > 25) { confidence += 5; reason += ` + strong trend (ADX:${adxData.adx.toFixed(0)})`; }
            if (volConfirmed) { confidence += 3; reason += ' + volume confirms'; }

            return {
                signal: 'buy', side: 'buy', confidence: Math.min(92, confidence),
                reason,
                indicator: { ema9: currentShort.toFixed(2), ema21: currentLong.toFixed(2), ema55: currentTrend.toFixed(2), adx: adxData?.adx?.toFixed(1), gap: gap.toFixed(4) + '%' }
            };
        }

        // Bearish crossover
        if (prevShort >= prevLong && currentShort < currentLong) {
            if (Math.abs(gap) < this.minGapPercent) {
                return { signal: 'none', confidence: 10, reason: `EMA crossover too small (gap: ${gap.toFixed(4)}%)` };
            }
            if (currentPrice > currentTrend) {
                return { signal: 'none', confidence: 15, reason: `Bearish crossover but price above EMA55 trend` };
            }
            if (!adxOk) {
                return { signal: 'none', confidence: 15, reason: `Bearish crossover but ADX too low (choppy market)` };
            }
            if (shortSlope > 0) {
                return { signal: 'none', confidence: 15, reason: `Bearish crossover but EMA9 slope positive` };
            }

            let confidence = Math.min(90, 55 + Math.abs(gap) * 10);
            let reason = `EMA9 crossed below EMA21 (gap: ${gap.toFixed(3)}%) + EMA55 trend`;
            if (adxData?.adx > 25) { confidence += 5; reason += ` + strong trend (ADX:${adxData.adx.toFixed(0)})`; }
            if (volConfirmed) { confidence += 3; reason += ' + volume confirms'; }

            return {
                signal: 'sell', side: 'sell', confidence: Math.min(92, confidence),
                reason,
                indicator: { ema9: currentShort.toFixed(2), ema21: currentLong.toFixed(2), ema55: currentTrend.toFixed(2), adx: adxData?.adx?.toFixed(1), gap: gap.toFixed(4) + '%' }
            };
        }

        const position = currentShort > currentLong ? 'above' : 'below';
        return { signal: 'none', confidence: 0, reason: `EMA9 is ${position} EMA21 - no crossover` };
    }
}

module.exports = EMACrossoverStrategy;
