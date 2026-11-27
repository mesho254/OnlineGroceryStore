import {getCookieConsent} from "./tracker";

const CACHE_STORAGE_KEY = 'freshmart_rq_cache_v1';
// Persist cached snapshots for up to 24 hours so initial site load renders immediately (0ms)
const MAX_PERSIST_AGE_MS = 24 * 60 * 60 * 1000;

const isPerformanceCacheAllowed = () => {
    const consent = getCookieConsent();
    if (!consent) return true;
    return consent.performance !== false;
};

const PERSISTED_ROOT_KEYS = new Set([
    'recommendations',
    'flashSales',
    'homeNewestProducts',
    'homePickupStations',
    'products',
    'pickupStations',
]);

const shouldPersistQuery = (queryKey) => {
    if (!Array.isArray(queryKey) || queryKey.length === 0) return false;
    return PERSISTED_ROOT_KEYS.has(String(queryKey[0]));
};

export const hydratePersistedQueryCache = (queryClient) => {
    if (typeof window === 'undefined' || !isPerformanceCacheAllowed()) return;
    try {
        const raw = localStorage.getItem(CACHE_STORAGE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;

        const now = Date.now();
        for (const entry of parsed) {
            if (!entry || !Array.isArray(entry.queryKey) || entry.data === undefined) continue;
            if (!shouldPersistQuery(entry.queryKey)) continue;
            const updatedAt = Number(entry.dataUpdatedAt || 0);
            if (!updatedAt || now - updatedAt > MAX_PERSIST_AGE_MS) continue;

            queryClient.setQueryData(entry.queryKey, entry.data, {
                updatedAt,
            });
        }
    } catch {
        // Ignore corrupt or unavailable localStorage
    }
};

export const subscribePersistQueryCache = (queryClient) => {
    if (typeof window === 'undefined') return () => {};
    let saveTimer = null;

    const flushToStorage = () => {
        if (!isPerformanceCacheAllowed()) {
            try {
                localStorage.removeItem(CACHE_STORAGE_KEY);
            } catch {
                // ignore
            }
            return;
        }
        try {
            const queries = queryClient.getQueryCache().getAll();
            const serializable = [];

            for (const q of queries) {
                if (!shouldPersistQuery(q.queryKey)) continue;
                if (q.state.status !== 'success' || q.state.data === undefined) continue;
                serializable.push({
                    queryKey: q.queryKey,
                    data: q.state.data,
                    dataUpdatedAt: q.state.dataUpdatedAt || Date.now(),
                });
            }

            // Cap to 25 most recent query snapshots to keep localStorage lightweight
            serializable.sort((a, b) => b.dataUpdatedAt - a.dataUpdatedAt);
            localStorage.setItem(
                CACHE_STORAGE_KEY,
                JSON.stringify(serializable.slice(0, 25))
            );
        } catch {
            // Ignore quota errors
        }
    };

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        if (!event?.query || !shouldPersistQuery(event.query.queryKey)) return;
        if (event.type === 'updated' && event.query.state.status === 'success') {
            if (saveTimer) window.clearTimeout(saveTimer);
            saveTimer = window.setTimeout(flushToStorage, 400);
        }
    });

    return () => {
        if (saveTimer) window.clearTimeout(saveTimer);
        unsubscribe();
    };
};
