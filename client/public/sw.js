// Self-unregistering cleanup Service Worker to evict any stale localhost:3000 sw.js
// that causes "TypeError: Failed to execute 'clone' on 'Response': Response body is already used"
self.addEventListener("install", () => {
    self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            try {
                const keys = await caches.keys();
                await Promise.all(keys.map((key) => caches.delete(key)));
            } catch {
                // ignore cache cleanup errors
            }
            try {
                await self.registration.unregister();
            } catch {
                // ignore unregister errors
            }
            try {
                const clientList = await self.clients.matchAll({ type: "window" });
                for (const client of clientList) {
                    client.navigate(client.url);
                }
            } catch {
                // ignore client refresh errors
            }
        })()
    );
});
