/**
 * Settings Module - Settings page logic with live exchange rate
 * v2.3: Position sync, manual refresh, auto-refresh interval
 */
const Settings = {
    settings: {},
    balanceData: null,
    exchangeRates: { USD_INR: 94 },

    async init() {
        await this.loadSettings();
        await this.fetchBalance();
        await this.loadSyncStatus();
    },

    async loadSettings() {
        try {
            const res = await fetch('/api/settings');
            this.settings = await res.json();
            if (this.settings.exchangeRates) {
                this.exchangeRates = this.settings.exchangeRates;
            }
            this.populateFields();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    },

    async fetchBalance(currency) {
        try {
            if (currency) {
                await fetch('/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ key: 'currency', value: currency })
                });
            }
            const cur = currency || document.getElementById('settingCurrency')?.value || 'INR';
            const res = await fetch(`/api/balance?currency=${cur}`);
            this.balanceData = await res.json();
            if (this.balanceData.exchangeRates) {
                this.exchangeRates = this.balanceData.exchangeRates;
            }
            this.updateBudgetDisplay();
        } catch (error) {
            console.error('Failed to fetch balance:', error);
        }
    },

    updateBudgetDisplay() {
        const currency = document.getElementById('settingCurrency')?.value || 'INR';
        const sym = currency === 'INR' ? '₹' : (currency === 'BTC' ? '₿' : '$');

        if (!this.balanceData || this.balanceData.balance === undefined) {
            document.getElementById('budgetTotalBalance').textContent = `${sym}--`;
            document.getElementById('budgetTradingAmount').textContent = `${sym}--`;
            document.getElementById('budgetMinReserved').textContent = `${sym}--`;
            document.getElementById('budgetEffective').textContent = `${sym}--`;
            return;
        }

        // === USE walletBalance (available_balance) — the ACTUAL Delta app wallet balance ===
        const walletBalance = this.balanceData.walletBalance || this.balanceData.available || 0;
        const equity = this.balanceData.equity || this.balanceData.balance || walletBalance;
        const marginUsed = this.balanceData.marginUsed || this.balanceData.locked || 0;
        const unrealizedPnl = this.balanceData.unrealizedPnl || 0;
        const budgetPercent = parseFloat(document.getElementById('settingBudget')?.value || 50);
        const minBalance = parseFloat(document.getElementById('settingMinBalance')?.value || 0);

        const tradingBudget = (walletBalance * budgetPercent) / 100;
        const effective = Math.max(0, tradingBudget - minBalance);

        const displaySym = this.balanceData.assetSymbol
            ? (this.balanceData.assetSymbol === 'INR' ? '₹' : (this.balanceData.assetSymbol === 'BTC' ? '₿' : '$'))
            : sym;
        const assetName = this.balanceData.assetSymbol || currency;
        const rate = this.exchangeRates.USD_INR || 94;

        // Show wallet balance (available_balance) with INR equivalent
        let balanceText = `${displaySym}${walletBalance.toFixed(2)}`;
        if (assetName === 'USD' || assetName === 'USDT' || assetName === 'USDC') {
            balanceText += ` (₹${(walletBalance * rate).toFixed(0)})`;
        }

        // Show equity separately if different from wallet balance
        if (equity > 0 && Math.abs(equity - walletBalance) > 0.01) {
            balanceText += ` | Equity: ${displaySym}${equity.toFixed(2)}`;
        }

        document.getElementById('budgetTotalBalance').textContent = balanceText;

        // Show margin/locked info if available
        const marginEl = document.getElementById('budgetMarginUsed');
        if (marginEl) {
            marginEl.textContent = `${displaySym}${marginUsed.toFixed(2)}`;
        }
        const unrealizedEl = document.getElementById('budgetUnrealizedPnl');
        if (unrealizedEl) {
            unrealizedEl.textContent = `${unrealizedPnl >= 0 ? '+' : ''}${displaySym}${unrealizedPnl.toFixed(2)}`;
            unrealizedEl.className = `value ${unrealizedPnl >= 0 ? 'text-green' : 'text-red'}`;
        }

        document.getElementById('budgetTradingAmount').textContent = `${displaySym}${tradingBudget.toFixed(2)}`;
        document.getElementById('budgetMinReserved').textContent = `${displaySym}${minBalance.toFixed(2)}`;
        document.getElementById('budgetEffective').textContent = `${displaySym}${effective.toFixed(2)}`;
        document.getElementById('budgetBarFill').style.width = `${budgetPercent}%`;

        // Debug info in console
        if (this.balanceData._raw) {
            console.log('[Settings] Balance Debug:', this.balanceData._raw);
        }
    },

    populateFields() {
        const s = this.settings;

        if (s.api_key && s.api_key !== '••••••••' && s.api_key.length > 5) {
            document.getElementById('settingApiKey').value = s.api_key;
        }
        if (s.api_secret && s.api_secret !== '••••••••' && s.api_secret.length > 5) {
            document.getElementById('settingApiSecret').value = s.api_secret;
        }

        this.updateApiStatus(s.apiConnected);

        if (s.currency) document.getElementById('settingCurrency').value = s.currency;
        if (s.budget_percent) {
            document.getElementById('settingBudget').value = s.budget_percent;
            document.getElementById('budgetValue').textContent = s.budget_percent + '%';
        }
        if (s.min_balance !== undefined) document.getElementById('settingMinBalance').value = s.min_balance;
        if (s.min_price !== undefined) document.getElementById('settingMinPrice').value = s.min_price;
        if (s.max_price !== undefined) document.getElementById('settingMaxPrice').value = s.max_price;

        if (s.stop_loss_percent) document.getElementById('settingStopLoss').value = s.stop_loss_percent;
        if (s.profit_percent) document.getElementById('settingProfit').value = s.profit_percent;
        if (s.max_daily_trades) document.getElementById('settingMaxDailyTrades').value = s.max_daily_trades;
        if (s.max_daily_loss) document.getElementById('settingMaxDailyLoss').value = s.max_daily_loss;
        if (s.max_open_positions) document.getElementById('settingMaxPositions').value = s.max_open_positions;

        if (s.trade_qty_mode) {
            document.getElementById('settingQtyMode').value = s.trade_qty_mode;
            this.toggleQtyMode(s.trade_qty_mode, false);
        }
        if (s.manual_qty) document.getElementById('settingManualQty').value = s.manual_qty;

        if (s.leverage) {
            document.getElementById('settingLeverage').value = s.leverage;
            document.getElementById('leverageValue').textContent = s.leverage + 'x';
        }

        if (s.cooldown_minutes) document.getElementById('settingCooldown').value = s.cooldown_minutes;
        if (s.auto_refresh_minutes) document.getElementById('settingAutoRefresh').value = s.auto_refresh_minutes;

        document.getElementById('infoBotVersion').textContent = 'v' + (s.botVersion || '2.0.0');
        document.getElementById('infoStrategyCount').textContent = s.strategyCount || 15;

        // Exchange rate display
        const rateEl = document.getElementById('infoExchangeRate');
        if (rateEl && s.exchangeRates) {
            rateEl.textContent = `$1 = ₹${s.exchangeRates.USD_INR?.toFixed(2) || '94.00'}`;
        }

        document.getElementById('infoIpv6').textContent = s.ipv6 || 'Not available';
    },

    updateApiStatus(connected) {
        const elements = [
            document.getElementById('settingApiStatus'),
            document.getElementById('infoApiStatus')
        ];

        elements.forEach(el => {
            if (!el) return;
            if (connected) {
                el.className = 'api-status connected';
                el.innerHTML = '<span class="dot" style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span> Connected';
            } else {
                el.className = 'api-status disconnected';
                el.innerHTML = '<span class="dot" style="width:6px;height:6px;border-radius:50%;background:currentColor;display:inline-block"></span> Not Connected';
            }
        });
    },

    async saveApi() {
        const apiKey = document.getElementById('settingApiKey').value.trim();
        const apiSecret = document.getElementById('settingApiSecret').value.trim();

        if (!apiKey || !apiSecret) {
            App.showToast('Please enter both API Key and Secret', 'error');
            return;
        }

        try {
            await fetch('/api/settings/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey, api_secret: apiSecret })
            });
            App.showToast('API credentials saved (encrypted)', 'success');
            await this.testConnection();
        } catch (error) {
            App.showToast('Failed to save API credentials', 'error');
        }
    },

    async saveAllSettings() {
        const settings = {
            currency: document.getElementById('settingCurrency').value,
            budget_percent: document.getElementById('settingBudget').value,
            min_balance: document.getElementById('settingMinBalance').value,
            min_price: document.getElementById('settingMinPrice').value,
            max_price: document.getElementById('settingMaxPrice').value,
            stop_loss_percent: document.getElementById('settingStopLoss').value,
            profit_percent: document.getElementById('settingProfit').value,
            max_daily_trades: document.getElementById('settingMaxDailyTrades').value,
            max_daily_loss: document.getElementById('settingMaxDailyLoss').value,
            max_open_positions: document.getElementById('settingMaxPositions').value,
            trade_qty_mode: document.getElementById('settingQtyMode').value,
            manual_qty: document.getElementById('settingManualQty').value,
            leverage: document.getElementById('settingLeverage').value,
            cooldown_minutes: document.getElementById('settingCooldown').value,
            auto_refresh_minutes: document.getElementById('settingAutoRefresh').value
        };

        const apiKey = document.getElementById('settingApiKey').value.trim();
        const apiSecret = document.getElementById('settingApiSecret').value.trim();
        if (apiKey) settings.api_key = apiKey;
        if (apiSecret) settings.api_secret = apiSecret;

        try {
            const res = await fetch('/api/settings/save-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            const result = await res.json();
            if (result.success) {
                App.showToast(`✅ All settings saved (${result.saved} items)`, 'success');
                await this.fetchBalance();
            }
        } catch (error) {
            App.showToast('Failed to save settings', 'error');
        }
    },

    async testConnection() {
        try {
            App.showToast('Testing connection...', 'info');
            const res = await fetch('/api/settings/test-connection', { method: 'POST' });
            const result = await res.json();

            if (result.connected) {
                this.updateApiStatus(true);
                App.showToast('✅ Connected to Delta Exchange!', 'success');
                await this.fetchBalance();
            } else {
                this.updateApiStatus(false);
                App.showToast(`❌ Connection failed: ${result.error}`, 'error');
            }
        } catch (error) {
            this.updateApiStatus(false);
            App.showToast('Connection test failed', 'error');
        }
    },

    toggleQtyMode(mode, save = true) {
        const row = document.getElementById('manualQtyRow');
        if (mode === 'manual') {
            row.classList.remove('hidden');
        } else {
            row.classList.add('hidden');
        }
    },

    updateBudget(value) {
        document.getElementById('budgetValue').textContent = value + '%';
        document.getElementById('budgetBarFill').style.width = value + '%';
        this.updateBudgetDisplay();
    },

    updateLeverage(value) {
        document.getElementById('leverageValue').textContent = value + 'x';
    },

    async copyIpv6() {
        const ipv6 = document.getElementById('infoIpv6').textContent;
        if (ipv6 === 'Not available' || ipv6 === 'Loading...') {
            App.showToast('No IPv6 address to copy', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(ipv6);
            const btn = document.getElementById('btnCopyIpv6');
            btn.textContent = '✅ Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = '📋 Copy';
                btn.classList.remove('copied');
            }, 2000);
        } catch (error) {
            const input = document.createElement('input');
            input.value = ipv6;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            App.showToast('IPv6 copied!', 'success');
        }
    },

    // === Position Sync ===

    async loadSyncStatus() {
        try {
            const res = await fetch('/api/bot/status');
            const status = await res.json();
            document.getElementById('syncOpenCount').textContent = status.openTrades || 0;
            if (status.lastRefresh) {
                document.getElementById('syncLastRefresh').textContent = new Date(status.lastRefresh).toLocaleString('en-IN');
            }
        } catch (e) { /* ignore */ }
    },

    /**
     * Render Delta Exchange positions list
     */
    renderDeltaPositions(positions) {
        const container = document.getElementById('syncDeltaPositions');
        const countBadge = document.getElementById('syncDeltaCount');

        countBadge.textContent = positions.length;

        if (!positions || positions.length === 0) {
            container.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">✅ No active positions on Delta Exchange</div>';
            return;
        }

        container.innerHTML = positions.map(p => {
            const pnlColor = p.unrealized_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
            const pnlSign = p.unrealized_pnl >= 0 ? '+' : '';
            const sideColor = p.side === 'buy' ? 'var(--accent-green)' : 'var(--accent-red)';
            const shortSymbol = (p.symbol || '').replace(/USDT$|USD$|INR$/, '');

            return `
                <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; padding:8px 10px; margin:4px 0; background:rgba(255,255,255,0.03); border-radius:8px; font-size:12px; gap:4px;">
                    <span style="color:var(--accent-cyan);font-weight:700; min-width:70px;">${shortSymbol}</span>
                    <span style="color:${sideColor}; font-weight:600;">${p.side.toUpperCase()} × ${Math.abs(p.size)}</span>
                    <span style="color:var(--text-muted);">Entry: $${p.entry_price.toFixed(2)}</span>
                    <span style="color:var(--text-muted);">Mark: $${p.mark_price.toFixed(2)}</span>
                    <span style="color:${pnlColor}; font-weight:700;">${pnlSign}$${p.unrealized_pnl.toFixed(2)}</span>
                </div>`;
        }).join('');
    },

    /**
     * Render Bot DB positions list
     */
    renderBotPositions(trades) {
        const container = document.getElementById('syncTradesList');
        const countBadge = document.getElementById('syncOpenCount');

        countBadge.textContent = trades.length;

        if (!trades || trades.length === 0) {
            container.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);font-size:12px;">✅ No open bot positions — All sold/closed</div>';
            return;
        }

        container.innerHTML = trades.map(t => {
            const sideColor = t.side === 'buy' ? 'var(--accent-green)' : 'var(--accent-red)';
            const shortSymbol = (t.symbol || '').replace(/USDT$|USD$|INR$/, '');
            const time = t.entry_time ? new Date(t.entry_time).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

            return `
                <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; padding:8px 10px; margin:4px 0; background:rgba(255,255,255,0.03); border-radius:8px; font-size:12px; gap:4px;">
                    <span style="color:var(--accent-yellow);font-weight:700; min-width:70px;">${shortSymbol}</span>
                    <span style="color:${sideColor}; font-weight:600;">${t.side.toUpperCase()} × ${t.quantity}</span>
                    <span style="color:var(--text-muted);">@ $${parseFloat(t.price).toFixed(2)}</span>
                    <span style="color:var(--text-muted);font-size:10px;">${t.strategy || ''}</span>
                    <span style="color:var(--text-muted);font-size:10px;">${time}</span>
                </div>`;
        }).join('');
    },

    /**
     * Render account balance info
     */
    renderBalanceInfo(balance) {
        const container = document.getElementById('syncBalanceInfo');
        const details = document.getElementById('syncBalanceDetails');

        if (!balance) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        const sym = (balance.assetSymbol === 'INR') ? '₹' : '$';

        details.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px;">
                <div style="padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:6px;">
                    <div style="color:var(--text-muted);font-size:10px;">Available</div>
                    <div style="color:var(--accent-green);font-weight:700;">${sym}${(balance.available || 0).toFixed(2)}</div>
                </div>
                <div style="padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:6px;">
                    <div style="color:var(--text-muted);font-size:10px;">Equity</div>
                    <div style="color:var(--accent-cyan);font-weight:700;">${sym}${(balance.equity || 0).toFixed(2)}</div>
                </div>
                <div style="padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:6px;">
                    <div style="color:var(--text-muted);font-size:10px;">Margin Used</div>
                    <div style="font-weight:600;">${sym}${(balance.marginUsed || 0).toFixed(2)}</div>
                </div>
                <div style="padding:6px 8px; background:rgba(255,255,255,0.03); border-radius:6px;">
                    <div style="color:var(--text-muted);font-size:10px;">Unrealized P&L</div>
                    <div style="color:${(balance.unrealizedPnl || 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'};font-weight:700;">${(balance.unrealizedPnl || 0) >= 0 ? '+' : ''}${sym}${(balance.unrealizedPnl || 0).toFixed(2)}</div>
                </div>
            </div>`;
    },

    async refreshPositions() {
        const btn = document.getElementById('btnRefreshPositions');
        const resultDiv = document.getElementById('syncResult');
        btn.disabled = true;
        btn.textContent = '⏳ Syncing with Delta...';
        resultDiv.style.display = 'none';

        try {
            const res = await fetch('/api/bot/refresh-positions', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                // === Render Delta Exchange Positions ===
                this.renderDeltaPositions(data.deltaPositions || []);

                // === Render Bot DB Positions ===
                this.renderBotPositions(data.openTradesList || []);

                // === Render Balance Info ===
                this.renderBalanceInfo(data.balance);

                // === Update last refresh time ===
                document.getElementById('syncLastRefresh').textContent = new Date(data.lastRefresh).toLocaleString('en-IN');

                // Build status message
                let statusParts = [];
                statusParts.push(`Delta: ${(data.deltaPositions || []).length} position(s)`);
                statusParts.push(`Bot: ${data.openTrades}/${data.maxPositions} open`);
                if (data.slotsFreed > 0) statusParts.push(`🆓 ${data.slotsFreed} freed`);
                statusParts.push(`${data.slotsAvailable} slot(s) available`);
                if (data.scanTriggered) statusParts.push('🚀 Scan triggered!');
                else if (data.botRunning) statusParts.push('⏳ Next scan will trade');
                else statusParts.push('⏹️ Bot stopped');

                // Show result summary
                resultDiv.style.display = 'block';
                resultDiv.style.background = data.scanTriggered ? 'rgba(0,255,136,0.12)' : 'rgba(0,255,136,0.06)';
                resultDiv.style.color = 'var(--accent-green)';
                resultDiv.innerHTML = `✅ ${statusParts.join(' | ')}`;

                // Also refresh the budget/balance display on settings page
                await this.fetchBalance();

                const toastMsg = data.scanTriggered
                    ? `🚀 ${data.slotsFreed} slot(s) freed — Bot scanning now!`
                    : `🔄 Synced! Delta: ${(data.deltaPositions || []).length} | Bot: ${data.openTrades}/${data.maxPositions}`;
                App.showToast(toastMsg, 'success');
            } else {
                resultDiv.style.display = 'block';
                resultDiv.style.background = 'rgba(255,68,68,0.08)';
                resultDiv.style.color = 'var(--accent-red)';
                resultDiv.innerHTML = `❌ ${data.error || 'Sync failed'}`;
                App.showToast('Sync failed', 'error');
            }
        } catch (error) {
            resultDiv.style.display = 'block';
            resultDiv.style.background = 'rgba(255,68,68,0.08)';
            resultDiv.style.color = 'var(--accent-red)';
            resultDiv.innerHTML = `❌ Error: ${error.message}`;
            App.showToast('Failed to sync positions', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = '🔄 Refresh Now';
        }
    }
};
