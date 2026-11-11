// Service worker d'Estacasino : rend le site installable comme une application et reçoit les notifications.
// Volontairement sans cache : chaque ouverture charge la dernière version du site.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* réseau d'abord : on laisse le navigateur faire */
});

// Notification reçue du serveur : { titre, texte, url, tag }.
self.addEventListener("push", (e) => {
  let n = { titre: "Estacasino", texte: "", url: "/" };
  try {
    n = { ...n, ...e.data.json() };
  } catch {
    /* message vide ou illisible : notification générique */
  }
  e.waitUntil(
    self.registration.showNotification(n.titre, {
      body: n.texte,
      icon: "/icones/icone-192.png",
      badge: "/icones/icone-192.png",
      tag: n.tag,
      data: { url: n.url || "/" },
      lang: "fr",
    }),
  );
});

// Toucher la notification : on revient sur l'application ouverte, ou on l'ouvre.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if (new URL(f.url).origin === self.location.origin && "focus" in f) {
          f.navigate?.(url);
          return f.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
