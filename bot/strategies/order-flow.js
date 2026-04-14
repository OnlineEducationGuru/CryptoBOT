/**
 * Order Flow Imbalance Strategy
 * Analyzes bid/ask imbalance and volume delta to detect aggressive buying/selling
 * Uses volume analysis with price action confirmation
 */
class OrderFlowStrategy {
    constructor() {
        this.id = 'order-flow';
        this.name = 'Order Flow Imbalance';
        this.description = 'Detects aggressive buying/selling via volume delta, bid/ask imbalance, and absorption patterns.';
        this.winRate = 65;
        this.timeframe = '5m - 15m';
        this.riskLevel = 'Moderate';
    }

    getInfo() {
        return {
            id: this.id, name: this.name, description: this.description,
            winRate: this.winRate, timeframe: this.timeframe, riskLevel: this.riskLevel
        };
    }

    // Calculate volume delta (buying vs selling volume approximation)
    calculateVolumeDelta(opens, closes, highs, lows, volumes) {
        const deltas = [];
        for (let i = 0; i < closes.length; i++) {
            const range = highs[i] - lows[i];
            if (range <= 0) { deltas.push(0); continue; }
            // Approximate: if close > open, more volume is buying
            const buyRatio = (closes[i] - lows[i]) / range;
            const buyVol = volumes[i] * buyRatio;
            const sellVol = volumes[i] * (1 - buyRatio);
            deltas.push(buyVol - sellVol);
        }
        return deltas;
    }

    // Detect cumulative volume delta trend
    calculateCVD(deltas, period = 14) {
        if (deltas.length < period) return null;
        const recent = deltas.slice(-period);
        const cvd = recent.reduce((sum, d) => sum + d, 0);
        const prevCVD = deltas.slice(-period - 1, -1).reduce((sum, d) => sum + d, 0);
        return { current: cvd, previous: prevCVD, slope: cvd - prevCVD };
    }

    // Detect absorption (large volume but small price move)
    detectAbsorption(closes, volumes, lookback = 5) {
        if (closes.length < lookback + 1) return null;
        const recentVol = volumes.slice(-lookback);
        const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, volumes.length);
        const priceChange = Math.abs(closes[closes.length - 1] - closes[closes.length - lookback]) / closes[closes.length - lookback] * 100;
        const volRatio = recentVol.reduce((a, b) => a + b, 0) / (avgVol * lookback);

        // High volume + small price change = absorption
        if (volRatio > 1.5 && priceChange < 0.5) {
            return { detected: true, volRatio: volRatio.toFixed(2), priceChange: priceChange.toFixed(3) };
        }
        return { detected: false };
    }

    analyze(marketData) {
        const { closes, opens, highs, lows, volumes, bid, ask } = marketData;
        if (!closes || closes.length < 30 || !volumes || volumes.length < 30) {
            return { signal: 'none', confidence: 0, reason: 'Insufficient data for order flow analysis' };
        }

        // 1. Volume Delta Analysis
        const deltas = this.calculateVolumeDelta(opens, closes, highs, lows, volumes);
        const cvd = this.calculateCVD(deltas);
        if (!cvd) return { signal: 'none', confidence: 0, reason: 'Cannot compute CVD' };

        // 2. Bid/Ask spread analysis
        let spreadScore = 0;
        if (bid > 0 && ask > 0) {
            const spread = ((ask - bid) / bid) * 100;
            spreadScore = spread < 0.05 ? 15 : (spread < 0.1 ? 10 : 5);
        }

        // 3. Recent volume trend
        const recentVol = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        const avgVol = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
        const volTrend = recentVol / avgVol;

        // 4. Absorption detection
        const absorption = this.detectAbsorption(closes, volumes);

        // 5. Price momentum
        const priceMomentum = (closes[closes.length - 1] - closes[closes.length - 5]) / closes[closes.length - 5] * 100;

        // === Signal Logic ===
        // BUY: Positive CVD slope + increasing volume + price rising or absorbed at support
        if (cvd.slope > 0 && cvd.current > 0) {
            let confidence = 45;
            let reasons = [`CVD positive & rising (${cvd.current.toFixed(0)})`];

            if (volTrend > 1.2) { confidence += 15; reasons.push(`Volume increasing (${volTrend.toFixed(1)}x avg)`); }
            if (priceMomentum > 0) { confidence += 10; reasons.push(`Price momentum +${priceMomentum.toFixed(2)}%`); }
            if (absorption?.detected) { confidence += 10; reasons.push(`Absorption detected (${absorption.volRatio}x vol, ${absorption.priceChange}% move)`); }
            confidence += spreadScore;

            if (confidence >= 60) {
                return {
                    signal: 'buy', side: 'buy',
                    confidence: Math.min(92, confidence),
                    reason: `Order Flow BUY: ${reasons.join(' + ')}`,
                    indicator: { cvd: cvd.current.toFixed(0), volTrend: volTrend.toFixed(2), absorption: absorption?.detected }
                };
            }
        }

        // SELL: Negative CVD slope + increasing volume + price falling or absorbed at resistance
        if (cvd.slope < 0 && cvd.current < 0) {
            let confidence = 45;
            let reasons = [`CVD negative & falling (${cvd.current.toFixed(0)})`];

            if (volTrend > 1.2) { confidence += 15; reasons.push(`Volume increasing (${volTrend.toFixed(1)}x avg)`); }
            if (priceMomentum < 0) { confidence += 10; reasons.push(`Price momentum ${priceMomentum.toFixed(2)}%`); }
            if (absorption?.detected) { confidence += 10; reasons.push(`Absorption detected`); }
            confidence += spreadScore;

            if (confidence >= 60) {
                return {
                    signal: 'sell', side: 'sell',
                    confidence: Math.min(92, confidence),
                    reason: `Order Flow SELL: ${reasons.join(' + ')}`,
                    indicator: { cvd: cvd.current.toFixed(0), volTrend: volTrend.toFixed(2), absorption: absorption?.detected }
                };
            }
        }

        return { signal: 'none', confidence: 0, reason: `Order flow neutral (CVD: ${cvd.current.toFixed(0)}, slope: ${cvd.slope.toFixed(0)})` };
    }
}

module.exports = OrderFlowStrategy;
