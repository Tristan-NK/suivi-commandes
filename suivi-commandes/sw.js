/* ==========================================================================
   Service Worker - Suivi des Livraisons Gabon
   Support Hors-Ligne & Notifications en Temps Réel Arrière-Plan
   ========================================================================== */

const CACHE_NAME = 'suivi-commandes-gabon-v3';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon.svg'
];

let scheduledOrders = [];
let alarmTimers = [];

// Installation : mise en cache des fichiers
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activation : nettoyage anciens caches et prise de contrôle immédiate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Gestion du cache hors-ligne
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Mise à jour discrète en arrière-plan
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ==========================================================================
// GESTION DES ALARMES ET NOTIFICATIONS EN ARRIÈRE-PLAN (APP FERMÉE)
// ==========================================================================

function clearAllAlarmTimers() {
  alarmTimers.forEach((t) => clearTimeout(t));
  alarmTimers = [];
}

function triggerOrderNotification(o) {
  const title = `⏰ ALARME LIVRAISON : #${o.num}`;
  const options = {
    body: `Client : ${o.client}\nLieu : ${o.city || 'Libreville'} · ${o.quarter}\nArticles : ${o.articles}`,
    icon: './icon.svg',
    badge: './icon.svg',
    vibrate: [300, 100, 300, 100, 500],
    tag: `order-${o.id}`,
    renotify: true,
    requireInteraction: true, // Reste affichée jusqu'à interaction de l'utilisateur
    data: {
      url: './index.html',
      orderId: o.id
    },
    actions: [
      { action: 'open', title: 'Ouvrir l\'application' }
    ]
  };

  self.registration.showNotification(title, options);
}

function scheduleAlarms() {
  clearAllAlarmTimers();
  const now = Date.now();

  scheduledOrders.forEach((o) => {
    if (o.done) return;
    const delay = o.due - now;

    if (delay <= 0) {
      // Échéance déjà atteinte ou dépassée récemment (dans les 30 min)
      if (delay > -1800000) {
        triggerOrderNotification(o);
      }
    } else {
      // Programmer l'alarme pour l'heure exacte
      const timer = setTimeout(() => {
        triggerOrderNotification(o);
      }, delay);
      alarmTimers.push(timer);
    }
  });
}

// Réception des commandes synchronisées depuis l'application
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_ALARMS') {
    scheduledOrders = event.data.orders || [];
    scheduleAlarms();
  }
});

// Clic sur une notification système : réouvre l'application
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Si une fenêtre est déjà ouverte, la ramener au premier plan
      for (let client of windowClients) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // Sinon, ouvrir une nouvelle fenêtre
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});
