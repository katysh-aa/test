const CACHE_NAME = 'family-budget-v2.0';
const API_CACHE_NAME = 'family-budget-api-v2.0';

// URLs to cache during install
const STATIC_URLS = [
  '/',
  '/index.html',
  '/style.css',
  '/config.js',
  '/app.js',
  '/sw-register.js',
  '/icons/favicon.ico',
  '/manifest.json'
];

// External resources to cache
const EXTERNAL_URLS = [
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// API endpoints that should use network-first strategy
const API_ENDPOINTS = [
  '/api/',
  'https://www.cbr-xml-daily.ru/'
];

// Install event - cache static assets
self.addEventListener('install', event => {
  console.log('🔄 Service Worker installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('✅ Opened cache');
        return cache.addAll([...STATIC_URLS, ...EXTERNAL_URLS]);
      })
      .then(() => {
        console.log('✅ All resources cached');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(error => {
        console.error('❌ Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  console.log('🔄 Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Delete old caches
          if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
            console.log('🗑️ Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('✅ Service Worker activated');
      return self.clients.claim(); // Take control of all clients
    })
  );
});

// Fetch event with advanced strategies
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests with different strategies
  if (isStaticAsset(request)) {
    event.respondWith(staticCacheStrategy(request));
  } else if (isApiRequest(request)) {
    event.respondWith(apiCacheStrategy(request));
  } else if (isExternalResource(request)) {
    event.respondWith(externalResourceStrategy(request));
  } else {
    event.respondWith(networkFirstStrategy(request));
  }
});

// Strategy for static assets (CSS, JS, HTML)
async function staticCacheStrategy(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Update cache in background
      updateCache(request);
      return cachedResponse;
    }

    // If not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Cache the new response
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('❌ Static cache strategy failed:', error);
    
    // If both cache and network fail, return offline page
    const cached = await caches.match('/index.html');
    return cached || new Response('Network error', { status: 408 });
  }
}

// Strategy for API requests
async function apiCacheStrategy(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      await cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('🌐 Network failed, trying cache for API:', request.url);
    
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // If no cache, return error
    return new Response(JSON.stringify({ 
      error: 'Network unavailable and no cached data' 
    }), {
      status: 408,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Strategy for external resources
async function externalResourceStrategy(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Update cache in background for external resources
      updateCache(request);
      return cachedResponse;
    }

    // If not in cache, fetch from network
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.error('❌ External resource strategy failed:', error);
    
    // Return generic error for external resources
    return new Response('External resource unavailable', { status: 408 });
  }
}

// Network first strategy for other requests
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('🌐 Network failed, trying cache:', request.url);
    
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('Network error', { status: 408 });
  }
}

// Background cache update
async function updateCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response);
    }
  } catch (error) {
    // Silent fail - we don't want to break anything
    console.log('⚠️ Background cache update failed:', error);
  }
}

// Helper functions to categorize requests
function isStaticAsset(request) {
  const url = new URL(request.url);
  return (
    url.origin === self.location.origin &&
    (request.url.includes('.css') ||
     request.url.includes('.js') ||
     request.url.includes('.html') ||
     request.url.includes('/icons/'))
  );
}

function isApiRequest(request) {
  return API_ENDPOINTS.some(endpoint => request.url.includes(endpoint));
}

function isExternalResource(request) {
  const url = new URL(request.url);
  return url.origin !== self.location.origin && EXTERNAL_URLS.some(extUrl => 
    request.url.includes(new URL(extUrl).hostname)
  );
}

// Background sync for offline operations
self.addEventListener('sync', event => {
  console.log('🔄 Background sync:', event.tag);
  
  if (event.tag === 'background-sync') {
    event.waitUntil(
      syncPendingOperations()
        .then(() => console.log('✅ Background sync completed'))
        .catch(error => console.error('❌ Background sync failed:', error))
    );
  }
});

// Periodic sync for data updates
self.addEventListener('periodicsync', event => {
  if (event.tag === 'data-update') {
    console.log('🔄 Periodic data update');
    event.waitUntil(updateCachedData());
  }
});

// Sync pending operations (for future offline functionality)
async function syncPendingOperations() {
  // This would sync any operations that were performed offline
  // For now, it's a placeholder for future functionality
  console.log('📡 Syncing pending operations...');
  
  // In a real implementation, you would:
  // 1. Get pending operations from IndexedDB
  // 2. Send them to the server
  // 3. Clear them from IndexedDB on success
  
  return Promise.resolve();
}

// Update cached data periodically
async function updateCachedData() {
  try {
    // Update USD rate cache
    const usdRateResponse = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
    if (usdRateResponse.ok) {
      const cache = await caches.open(API_CACHE_NAME);
      cache.put('https://www.cbr-xml-daily.ru/daily_json.js', usdRateResponse);
      console.log('✅ USD rate cache updated');
    }
  } catch (error) {
    console.error('❌ Periodic data update failed:', error);
  }
}

// Push notifications (for future features)
self.addEventListener('push', event => {
  if (!event.data) return;
  
  const data = event.data.json();
  const options = {
    body: data.body || 'Новое уведомление от Семейного бюджета',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-72x72.png',
    tag: 'budget-notification',
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Открыть'
      },
      {
        action: 'close',
        title: 'Закрыть'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Семейный бюджет', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  if (event.action === 'open') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        // Focus existing window or open new one
        for (const client of windowClients) {
          if (client.url === self.location.origin && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
    );
  }
});

// Handle notification close
self.addEventListener('notificationclose', event => {
  console.log('📱 Notification closed:', event.notification.tag);
});
