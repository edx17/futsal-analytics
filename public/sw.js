// Service Worker de Virtual.Club — a propósito NO cachea nada (cero riesgo de
// servir datos viejos/de otro club). Solo existe para recibir push y abrir
// la app al tocar la notificación.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch (e) {
    datos = { title: 'Virtual.Club', body: event.data ? event.data.text() : '' };
  }

  const titulo = datos.title || 'Virtual.Club';
  const opciones = {
    body: datos.body || '',
    icon: datos.icon || '/android-chrome-192x192.png',
    badge: datos.badge || '/android-chrome-192x192.png',
    tag: datos.tag || 'virtualclub',
    renotify: !!datos.tag,
    data: { url: (datos.data && datos.data.url) || '/' },
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      // Si ya hay una pestaña de la app abierta, la enfoca y navega ahí en vez de abrir otra
      for (const cliente of listaClientes) {
        if ('focus' in cliente) {
          cliente.postMessage({ tipo: 'navegar', url });
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});