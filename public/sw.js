// Service worker d'Estacasino : rend le site installable comme une application.
// Volontairement sans cache : chaque ouverture charge la dernière version du site.
// Il accueillera aussi les notifications quand elles seront activées.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* réseau d'abord : on laisse le navigateur faire */
});
