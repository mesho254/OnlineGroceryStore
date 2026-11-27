import {PRODUCTS_BASEURL} from "../api/BaseURLs";

const SESSION_STORAGE_KEY = 'freshmart_session_id';
export const COOKIE_CONSENT_STORAGE_KEY = 'freshmart_cookie_consent_v1';
export const COOKIE_CONSENT_NAME = 'freshmart_cookie_consent';

export const getCookieConsent = () => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.status) return parsed;
        }
        // Fallback: check document.cookie
        const match = document.cookie
            .split('; ')
            .find((row) => row.startsWith(`${COOKIE_CONSENT_NAME}=`));
        if (match) {
            const val = decodeURIComponent(match.split('=')[1] || '');
            if (val === 'accepted' || val === 'essential_only') {
                return {
                    status: val,
                    essential: true,
                    personalization: val === 'accepted',
                    performance: val === 'accepted',
                    updatedAt: new Date().toISOString(),
                };
            }
        }
        return null;
    } catch {
        return null;
    }
};

export const saveCookieConsent = ({
    status = 'accepted',
    personalization = true,
    performance = true,
} = {}) => {
    if (typeof window === 'undefined') return null;
    const payload = {
        status,
        essential: true,
        personalization: Boolean(personalization),
        performance: Boolean(performance),
        updatedAt: new Date().toISOString(),
    };
    try {
        localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(payload));
        const maxAge = 365 * 24 * 60 * 60; // 1 year
        document.cookie = `${COOKIE_CONSENT_NAME}=${encodeURIComponent(
            status
        )}; max-age=${maxAge}; path=/; SameSite=Lax`;
    } catch {
        // Ignore storage restrictions
    }
    window.dispatchEvent(new CustomEvent('freshmart:cookie-consent-updated', {detail: payload}));
    return payload;
};

export const resetCookieConsent = () => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem(COOKIE_CONSENT_STORAGE_KEY);
        document.cookie = `${COOKIE_CONSENT_NAME}=; max-age=0; path=/; SameSite=Lax`;
    } catch {
        // Ignore storage errors
    }
    window.dispatchEvent(new CustomEvent('freshmart:cookie-consent-updated', {detail: null}));
};

export const hasPersonalizationConsent = () => {
    const consent = getCookieConsent();
    // Default to true until explicitly disabled in Privacy & Cookie settings
    if (!consent) return true;
    return consent.personalization !== false;
};

export const getTrackerSessionId = () => {
    try {
        let sid = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!sid) {
            sid =
                typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(SESSION_STORAGE_KEY, sid);
        }
        return sid;
    } catch {
        return null;
    }
};

const getAuthToken = () => {
    try {
        const profile = JSON.parse(localStorage.getItem('profile'));
        return profile?.accessToken || profile?.token || null;
    } catch {
        return null;
    }
};

const sendInteraction = (payload, {keepalive = false} = {}) => {
    if (!hasPersonalizationConsent()) return;

    const session_id = getTrackerSessionId();
    const token = getAuthToken();
    const body = JSON.stringify({
        ...payload,
        session_id,
    });

    const headers = {
        'Content-Type': 'application/json',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (session_id) headers['X-Session-Id'] = session_id;

    fetch(`${PRODUCTS_BASEURL}/interactions`, {
        method: 'POST',
        headers,
        body,
        keepalive,
    }).catch(() => {
        // Non-blocking telemetry: silently ignore network errors
    });
};

export const trackProductClick = (product) => {
    if (!product?.product_id) return;
    sendInteraction({
        event_type: 'CLICK',
        product_id: product.product_id,
        category: product.category || '',
    });
};

export const trackProductView = (product) => {
    if (!product?.product_id) return;
    sendInteraction({
        event_type: 'VIEW',
        product_id: product.product_id,
        category: product.category || '',
    });
};

export const trackProductDwell = (product, dwellMs) => {
    if (!product?.product_id) return;
    const ms = Math.round(Number(dwellMs) || 0);
    if (ms < 2000) return;
    sendInteraction(
        {
            event_type: 'DWELL',
            product_id: product.product_id,
            category: product.category || '',
            dwell_ms: Math.min(300000, ms),
        },
        {keepalive: true}
    );
};

export const trackCartAdd = (product, quantity = 1) => {
    if (!product?.product_id) return;
    sendInteraction({
        event_type: 'CART_ADD',
        product_id: product.product_id,
        category: product.category || '',
        quantity: Math.max(1, Number(quantity) || 1),
    });
};

export const trackWishlistAdd = (product) => {
    if (!product?.product_id) return;
    sendInteraction({
        event_type: 'WISHLIST_ADD',
        product_id: product.product_id,
        category: product.category || '',
    });
};

export const trackSearchQuery = (query) => {
    const cleaned = String(query || '').trim();
    if (cleaned.length < 2) return;
    sendInteraction({
        event_type: 'SEARCH',
        search_query: cleaned,
    });
};
