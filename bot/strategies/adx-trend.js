/**
 * ADX Trend Strength Strategy
 * Only trades when ADX > 25 (strong trend) combined with +DI/-DI crossovers
 */
class ADXTrendStrategy {
    constructor() {
        this.id = 'adx-trend';
        this.name = 'ADX Trend Strength';
        this.description = 'Trades only in strong trends (ADX>25) with +DI/-DI crossovers.';
        this.winRate = 66;
        this.timeframe = '30m - 4h';
        this.riskLevel = 'Moderate';
        this.period = 14;
        this.adxThreshold = 25;
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    calculateADX(highs, lows, closes) {
        const len = closes.length;
        if (len < this.period * 2 + 1) return null;

        const plusDM = [], minusDM = [], TR = [];

        for (let i = 1; i < len; i++) {
            const upMove = highs[i] - highs[i - 1];
            const downMove = lows[i - 1] - lows[i];

            plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
            minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);

            TR.push(Math.max(
                highs[i] - lows[i],
                Math.abs(highs[i] - closes[i - 1]),
                Math.abs(lows[i] - closes[i - 1])
            ));
        }

        // Smoothed averages
        const smooth = (arr) => {
            const result = [arr.slice(0, this.period).reduce((a, b) => a + b, 0)];
            for (let i = this.period; i < arr.length; i++) {
                result.push(result[result.length - 1] - (result[result.length - 1] / this.period) + arr[i]);
            }
            return result;
        };

        const smoothTR = smooth(TR);
        const smoothPlusDM = smooth(plusDM);
        const smoothMinusDM = smooth(minusDM);

        const plusDI = [], minusDI = [], DX = [];

        for (let i = 0; i < smoothTR.length; i++) {
            const pdi = smoothTR[i] > 0 ? (smoothPlusDM[i] / smoothTR[i]) * 100 : 0;
            const mdi = smoothTR[i] > 0 ? (smoothMinusDM[i] / smoothTR[i]) * 100 : 0;
            plusDI.push(pdi);
            minusDI.push(mdi);
            const diSum = pdi + mdi;
            DX.push(diSum > 0 ? (Math.abs(pdi - mdi) / diSum) * 100 : 0);
        }

        // ADX = smoothed DX
        if (DX.length < this.period) return null;
        let adx = DX.slice(0, this.period).reduce((a, b) => a + b, 0) / this.period;
        const adxSeries = [adx];
        for (let i = this.period; i < DX.length; i++) {
            adx = ((adx * (this.period - 1)) + DX[i]) / this.period;
            adxSeries.push(adx);
        }

        return {
            adx: adxSeries[adxSeries.length - 1],
            prevAdx: adxSeries.length > 1 ? adxSeries[adxSeries.length - 2] : adx,
            plusDI: plusDI[plusDI.length - 1],
            minusDI: minusDI[minusDI.length - 1],
            prevPlusDI: plusDI.length > 1 ? plusDI[plusDI.length - 2] : plusDI[0],
            prevMinusDI: minusDI.length > 1 ? minusDI[minusDI.length - 2] : minusDI[0]
        };
    }

    analyze(marketData) {
        const { closes, highs, lows } = marketData;
        if (!closes || !highs || !lows || closes.length < this.period * 3) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for ADX' };
        }

        const adx = this.calculateADX(highs, lows, closes);
        if (!adx) return { signal: 'none', confidence: 0, reason: 'Cannot calculate ADX' };

        // ADX must be above threshold (strong trend)
        if (adx.adx < this.adxThreshold) {
            return { signal: 'none', confidence: 0, reason: `ADX ${adx.adx.toFixed(1)} < ${this.adxThreshold} — no strong trend` };
        }

        const adxRising = adx.adx > adx.prevAdx;

        // +DI crosses above -DI = bullish
        if (adx.prevPlusDI <= adx.prevMinusDI && adx.plusDI > adx.minusDI) {
            let confidence = Math.min(88, 55 + (adx.adx - this.adxThreshold) * 1.5);
            if (adxRising) confidence = Math.min(90, confidence + 5);
            return {
                signal: 'buy', side: 'buy', confidence,
                reason: `+DI crossed above -DI (ADX: ${adx.adx.toFixed(1)} — strong trend${adxRising ? ', rising' : ''})`,
                indicator: { adx: adx.adx.toFixed(1), plusDI: adx.plusDI.toFixed(1), minusDI: adx.minusDI.toFixed(1), adxRising }
            };
        }

        // -DI crosses above +DI = bearish
        if (adx.prevMinusDI <= adx.prevPlusDI && adx.minusDI > adx.plusDI) {
            let confidence = Math.min(88, 55 + (adx.adx - this.adxThreshold) * 1.5);
            if (adxRising) confidence = Math.min(90, confidence + 5);
            return {
                signal: 'sell', side: 'sell', confidence,
                reason: `-DI crossed above +DI (ADX: ${adx.adx.toFixed(1)} — strong trend${adxRising ? ', rising' : ''})`,
                indicator: { adx: adx.adx.toFixed(1), plusDI: adx.plusDI.toFixed(1), minusDI: adx.minusDI.toFixed(1), adxRising }
            };
        }

        return { signal: 'none', confidence: 0, reason: `ADX: ${adx.adx.toFixed(1)} — strong trend but no DI crossover` };
    }
}

module.exports = ADXTrendStrategy;
