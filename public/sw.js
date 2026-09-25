// Minimal service worker: its presence (with a fetch handler) makes Roamly installable as a PWA.
// No offline caching by design — itineraries are generated server-side and are personal.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* default network handling */ });
