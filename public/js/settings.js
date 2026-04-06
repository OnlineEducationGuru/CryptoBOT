/**
 * Settings Module - Settings page logic
 */
const Settings = {
    settings: {},
    balanceData: null,

    async init() {
        await this.loadSettings();
        await this.fetchBalance();
    },

    async loadSettings() {
        try {
            const res = await fetch('/api/settings');
            this.settings = await res.json();
            this.populateFields();
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    },

    async fetchBalance(currency) {
        try {
            // Save currency first if provided
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
            this.updateBudgetDisplay();
        } catch (error) {
            console.error('Failed to fetch balance:', error);
        }
    },

    updateBudgetDisplay() {
        const currency = document.getElementById('settingCurrency')?.value || 'INR';
        const sym = currency === 'INR' ? '₹' : (currency === 'BTC' ? '₿' : '$');

        // If no balance data yet, show loading
        if (!this.balanceData || this.balanceData.balance === undefined) {
            document.getElementById('budgetTotalBalance').textContent = `${sym}--`;
            document.getElementById('budgetTradingAmount').textContent = `${sym}--`;
            document.getElementById('budgetMinReserved').textContent = `${sym}--`;
            document.getElementById('budgetEffective').textContent = `${sym}--`;
            return;
        }

        const totalBalance = this.balanceData.balance || 0;
        const budgetPercent = parseFloat(document.getElementById('settingBudget')?.value || 50);
        const minBalance = parseFloat(document.getElementById('settingMinBalance')?.value || 0);

        const tradingBudget = (totalBalance * budgetPercent) / 100;
        const effective = Math.max(0, tradingBudget - minBalance);

        // Show actual asset symbol returned by API
        const displaySym = this.balanceData.assetSymbol 
            ? (this.balanceData.assetSymbol === 'INR' ? '₹' : (this.balanceData.assetSymbol === 'BTC' ? '₿' : '$'))
            : sym;

        document.getElementById('budgetTotalBalance').textContent = `${displaySym}${totalBalance.toFixed(2)}`;
        document.getElementById('budgetTradingAmount').textContent = `${displaySym}${tradingBudget.toFixed(2)}`;
        document.getElementById('budgetMinReserved').textContent = `${displaySym}${minBalance.toFixed(2)}`;
        document.getElementById('budgetEffective').textContent = `${displaySym}${effective.toFixed(2)}`;
        document.getElementById('budgetBarFill').style.width = `${budgetPercent}%`;

        // Show actual asset name if different
        if (this.balanceData.assetSymbol && this.balanceData.assetSymbol !== currency) {
            document.getElementById('budgetTotalBalance').textContent += ` (${this.balanceData.assetSymbol})`;
        }
    },

    populateFields() {
        const s = this.settings;

        // API fields - don't populate passwords if masked
        if (s.api_key && s.api_key !== '••••••••' && s.api_key.length > 5) {
            document.getElementById('settingApiKey').value = s.api_key;
        }
        if (s.api_secret && s.api_secret !== '••••••••' && s.api_secret.length > 5) {
            document.getElementById('settingApiSecret').value = s.api_secret;
        }

        // Update API status indicators
        this.updateApiStatus(s.apiConnected);

        // Trading config
        if (s.currency) document.getElementById('settingCurrency').value = s.currency;
        if (s.budget_percent) {
            document.getElementById('settingBudget').value = s.budget_percent;
            document.getElementById('budgetValue').textContent = s.budget_percent + '%';
        }
        if (s.min_balance !== undefined) document.getElementById('settingMinBalance').value = s.min_balance;
        if (s.min_price !== undefined) document.getElementById('settingMinPrice').value = s.min_price;
        if (s.max_price !== undefined) document.getElementById('settingMaxPrice').value = s.max_price;

        // Risk management
        if (s.stop_loss_percent) document.getElementById('settingStopLoss').value = s.stop_loss_percent;
        if (s.profit_percent) document.getElementById('settingProfit').value = s.profit_percent;
        if (s.max_daily_trades) document.getElementById('settingMaxDailyTrades').value = s.max_daily_trades;
        if (s.max_daily_loss) document.getElementById('settingMaxDailyLoss').value = s.max_daily_loss;
        if (s.max_open_positions) document.getElementById('settingMaxPositions').value = s.max_open_positions;

        // Trade qty mode
        if (s.trade_qty_mode) {
            document.getElementById('settingQtyMode').value = s.trade_qty_mode;
            this.toggleQtyMode(s.trade_qty_mode, false);
        }
        if (s.manual_qty) document.getElementById('settingManualQty').value = s.manual_qty;

        // Leverage
        if (s.leverage) {
            document.getElementById('settingLeverage').value = s.leverage;
            document.getElementById('leverageValue').textContent = s.leverage + 'x';
        }

        if (s.cooldown_minutes) document.getElementById('settingCooldown').value = s.cooldown_minutes;

        // Bot info
        document.getElementById('infoBotVersion').textContent = 'v' + (s.botVersion || '1.0.0');
        document.getElementById('infoStrategyCount').textContent = s.strategyCount || 7;

        // IPv6
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
            
            // Test connection
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
            cooldown_minutes: document.getElementById('settingCooldown').value
        };

        // Also save API keys if filled
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
                // Refresh balance display
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
                // Refresh balance
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
            // Fallback
            const input = document.createElement('input');
            input.value = ipv6;
            document.body.appendChild(input);
            input.select();
            document.execCommand('copy');
            document.body.removeChild(input);
            App.showToast('IPv6 copied!', 'success');
        }
    }
};
