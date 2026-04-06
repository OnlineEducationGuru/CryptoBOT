/**
 * WebSocket Client - Real-time connection to bot server
 */
const WS = {
    socket: null,
    connected: false,
    callbacks: {},

    init() {
        try {
            this.socket = io(window.location.origin, {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: Infinity
            });

            this.socket.on('connect', () => {
                this.connected = true;
                console.log('🔌 WebSocket connected');
                this.trigger('connected');
            });

            this.socket.on('disconnect', () => {
                this.connected = false;
                console.log('🔌 WebSocket disconnected');
                this.trigger('disconnected');
            });

            // Bot events
            this.socket.on('bot:status', (data) => this.trigger('botStatus', data));
            this.socket.on('bot:log', (data) => this.trigger('botLog', data));
            this.socket.on('bot:logs', (data) => this.trigger('botLogs', data));
            this.socket.on('bot:balance', (data) => this.trigger('botBalance', data));
            this.socket.on('bot:trade', (data) => this.trigger('botTrade', data));
            this.socket.on('bot:strategy', (data) => this.trigger('botStrategy', data));
            this.socket.on('bot:refresh', (data) => this.trigger('botRefresh', data));

        } catch (e) {
            console.error('WebSocket init failed:', e);
        }
    },

    on(event, callback) {
        if (!this.callbacks[event]) this.callbacks[event] = [];
        this.callbacks[event].push(callback);
    },

    trigger(event, data) {
        if (this.callbacks[event]) {
            this.callbacks[event].forEach(cb => cb(data));
        }
    }
};
