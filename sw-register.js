// Service Worker Registration and Network Status
class ServiceWorkerManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.init();
    }

    async init() {
        await this.registerServiceWorker();
        this.setupNetworkListeners();
        this.setupAppVisibility();
    }

    // Register Service Worker
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('✅ ServiceWorker registered successfully:', registration);

                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('🔄 ServiceWorker update found:', newWorker);
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('🆕 New content is available; please refresh.');
                            this.showUpdateNotification();
                        }
                    });
                });

                // Track service worker state
                if (registration.waiting) {
                    console.log('⚠️ ServiceWorker is waiting');
                    this.showUpdateNotification();
                }

            } catch (error) {
                console.error('❌ ServiceWorker registration failed:', error);
            }
        }
    }

    // Setup network status listeners
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.updateOnlineStatus(true);
            console.log('🌐 App is online');
            
            // Try to sync data when coming online
            this.syncData();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.updateOnlineStatus(false);
            console.log('🔴 App is offline');
        });

        // Initial status update
        this.updateOnlineStatus(this.isOnline);
    }

    // Setup app visibility listeners for background sync
    setupAppVisibility() {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.isOnline) {
                // App became visible and we're online - sync data
                this.syncData();
            }
        });
    }

    // Update online/offline UI
    updateOnlineStatus(online) {
        const indicator = document.getElementById('offline-indicator');
        if (!indicator) return;

        if (online) {
            indicator.style.display = 'none';
            indicator.innerHTML = '<span>🔴 Оффлайн режим</span>';
        } else {
            indicator.style.display = 'block';
            indicator.innerHTML = '<span>🔴 Оффлайн режим - данные могут быть не актуальны</span>';
        }
    }

    // Show update notification
    showUpdateNotification() {
        // In future, this could show a custom notification
        // For now, we'll just log and potentially reload
        if (confirm('Доступна новая версия приложения. Обновить?')) {
            window.location.reload();
        }
    }

    // Sync data when coming online
    async syncData() {
        try {
            // This would be expanded to sync any pending offline transactions
            console.log('🔄 Syncing data...');
            
            // For now, we'll just reload the data
            if (typeof loadFromFirebase === 'function') {
                loadFromFirebase();
            }
            if (typeof loadGoalFromFirebase === 'function') {
                loadGoalFromFirebase();
            }
            
        } catch (error) {
            console.error('❌ Data sync failed:', error);
        }
    }

    // Check for updates
    async checkForUpdates() {
        if ('serviceWorker' in navigator) {
            const registration = await navigator.serviceWorker.ready;
            await registration.update();
            console.log('🔍 Checked for Service Worker updates');
        }
    }
}

// Initialize when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        new ServiceWorkerManager();
    });
} else {
    new ServiceWorkerManager();
}

// Export for testing and other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ServiceWorkerManager;
}
