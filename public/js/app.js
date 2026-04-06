/**
 * App Controller - Main application logic
 */
const App = {
    currentPage: 'dashboard',
    botRunning: false,

    async init() {
        // Initialize WebSocket
        WS.init();

        // Initialize all modules
        await Dashboard.init();
        Market.init();
        Trades.init();
        Settings.init();

        // Load initial bot status
        this.loadBotStatus();

        // Setup WebSocket events
        WS.on('connected', () => {
            console.log('✅ Real-time updates active');
        });

        WS.on('botStatus', (data) => {
            this.botRunning = data.running;
            Dashboard.updateBotStatus(data);
        });

        console.log('🤖 CryptoBOT Delta initialized');
    },

    navigate(page) {
        // Update pages
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`page-${page}`).classList.add('active');

        // Update nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-item[data-page="${page}"]`).classList.add('active');

        this.currentPage = page;

        // Load data for page
        switch (page) {
            case 'dashboard':
                Dashboard.loadDashboard();
                break;
            case 'market':
                Market.loadTickers();
                break;
            case 'trades':
                Trades.loadTrades();
                break;
            case 'settings':
                Settings.loadSettings();
                break;
        }
    },

    async toggleBot() {
        const btn = document.getElementById('btnBotToggle');
        const btnText = document.getElementById('btnBotText');

        try {
            if (this.botRunning) {
                // Stop bot
                btn.disabled = true;
                btnText.textContent = 'Stopping...';

                const res = await fetch('/api/bot/stop', { method: 'POST' });
                const data = await res.json();

                this.botRunning = false;
                Dashboard.updateBotStatus({ running: false });
                this.showToast('Bot stopped', 'info');
            } else {
                // Start bot
                btn.disabled = true;
                btnText.textContent = 'Starting...';

                const res = await fetch('/api/bot/start', { method: 'POST' });
                const data = await res.json();

                if (data.success) {
                    this.botRunning = true;
                    Dashboard.updateBotStatus({ running: true });
                    this.showToast('🚀 Bot started!', 'success');
                } else {
                    this.showToast(`Failed to start: ${data.error || 'Unknown error'}`, 'error');
                }
            }
        } catch (error) {
            this.showToast('Failed to toggle bot', 'error');
        } finally {
            btn.disabled = false;
        }
    },

    async loadBotStatus() {
        try {
            const res = await fetch('/api/bot/status');
            const status = await res.json();
            this.botRunning = status.running;
            Dashboard.updateBotStatus(status);
        } catch (e) {
            // Server might not be up yet
        }
    },

    showToast(message, type = 'info') {
        // Remove existing toasts
        document.querySelectorAll('.toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
