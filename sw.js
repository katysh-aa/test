const CACHE_NAME = 'family-budget-v1.1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/icons/favicon.ico',
  '/icons/icon-72x72.png',
  '/icons/icon-96x96.png',
  '/icons/icon-128x128.png',
  '/icons/icon-144x144.png',
  '/icons/icon-152x152.png',
  '/icons/icon-180x180.png',
  '/icons/icon-192x192.png',
  '/icons/icon-384x384.png',
  '/icons/icon-512x512.png',
  '/icons/home-icon.png',
  '/icons/plan-icon.png',
  '/icons/add-icon.png',
  '/icons/analytics-icon.png',
  '/icons/list-icon.png',
  '/icons/theme-icon.png',
  '/icons/logout-icon.png',
  '/icons/edit.png',
  '/icons/delete.png'
];

// Стратегия кэширования для разных типов ресурсов
const CACHE_STRATEGIES = {
  // Статические ресурсы - Cache First
  STATIC: ['style.css', 'app.js', 'favicon.ico'],
  // Иконки - Cache First
  ICONS: ['/icons/'],
  // HTML - Network First для актуальности
  HTML: ['index.html', '/'],
  // API и внешние библиотеки - Network First с fallback на кэш
  EXTERNAL: [
    'firebase',
    'xlsx',
    'chart.js'
  ]
};

// Install event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Кэшируем только статические ресурсы при установке
        const staticResources = urlsToCache.filter(url => 
          CACHE_STRATEGIES.STATIC.some(static => url.includes(static)) ||
          CACHE_STRATEGIES.ICONS.some(icon => url.includes(icon))
        );
        return cache.addAll(staticResources);
      })
  );
  self.skipWaiting(); // Активировать новый SW сразу
});

// Fetch event
self.addEventListener('fetch', event => {
  // Пропускаем cross-origin запросы и не-GET запросы
  if (!event.request.url.startsWith(self.location.origin) || 
      event.request.method !== 'GET') {
    return;
  }

  const url = event.request.url;

  // Определяем стратегию кэширования
  if (CACHE_STRATEGIES.EXTERNAL.some(external => url.includes(external))) {
    // Network First для внешних библиотек
    event.respondWith(networkFirst(event.request));
  } else if (CACHE_STRATEGIES.HTML.some(html => url.includes(html))) {
    // Network First для HTML
    event.respondWith(networkFirst(event.request));
  } else {
    // Cache First для всего остального
    event.respondWith(cacheFirst(event.request));
  }
});

// Cache First стратегия
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    // Кэшируем только успешные ответы
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Fetch failed:', error);
    // Возвращаем fallback для изображений
    if (request.destination === 'image') {
      return new Response('', { status: 404 });
    }
    throw error;
  }
}

// Network First стратегия
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // Кэшируем только успешные ответы
    if (networkResponse && networkResponse.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // При ошибке сети возвращаем из кэша
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Для HTML возвращаем базовую страницу
    if (request.headers.get('accept').includes('text/html')) {
      return caches.match('/index.html');
    }
    
    return new Response('Network error', { status: 408 });
  }
}

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Получаем контроль над всеми clients
      return self.clients.claim();
    })
  );
});
