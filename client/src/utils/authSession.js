const PROFILE_STORAGE_KEY = 'profile';

/**
 * Safely decodes a JWT payload and returns its `exp` claim in milliseconds (or null).
 */
export const decodeJwtExpMs = (token) => {
    if (!token || typeof token !== 'string') return null;
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
        const jsonPayload = decodeURIComponent(
            window
                .atob(padded)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        const payload = JSON.parse(jsonPayload);
        return typeof payload?.exp === 'number' ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
};

/**
 * Normalizes any auth payload (from login, signup, refresh-token, or localStorage)
 * into a consistent session object with explicit access/refresh tokens and expiry timestamps.
 */
export const normalizeAuthSession = (data, existingProfile = null) => {
    if (!data && !existingProfile) return null;
    const src = data || {};
    const prev = existingProfile || {};

    const user = src.user || src.data?.user || prev.user || null;
    const accessToken =
        src.accessToken || src.token || prev.accessToken || prev.token || null;
    const refreshToken =
        src.refreshToken !== undefined ? src.refreshToken : prev.refreshToken || null;

    if (!accessToken) return null;

    const accessTokenExpiresAt =
        Number(src.accessTokenExpiresAt) ||
        decodeJwtExpMs(accessToken) ||
        Number(prev.accessTokenExpiresAt) ||
        null;

    const refreshTokenExpiresAt =
        Number(src.refreshTokenExpiresAt) ||
        decodeJwtExpMs(refreshToken) ||
        Number(prev.refreshTokenExpiresAt) ||
        null;

    return {
        user,
        token: accessToken,
        accessToken,
        refreshToken: refreshToken || null,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
    };
};

export const isAccessTokenExpired = (profile, skewMs = 15000) => {
    if (!profile) return true;
    const token = profile.accessToken || profile.token;
    if (!token) return true;
    const expMs = Number(profile.accessTokenExpiresAt) || decodeJwtExpMs(token);
    if (!expMs) return false;
    return Date.now() + skewMs >= expMs;
};

export const isRefreshTokenExpired = (profile, skewMs = 5000) => {
    if (!profile || !profile.refreshToken) return true;
    const expMs =
        Number(profile.refreshTokenExpiresAt) || decodeJwtExpMs(profile.refreshToken);
    if (!expMs) return false;
    return Date.now() + skewMs >= expMs;
};

/**
 * Returns true when the access token has expired AND no valid refresh token can renew it.
 */
export const isSessionCompletelyExpired = (profile) => {
    if (!profile || !(profile.accessToken || profile.token)) return true;
    if (isAccessTokenExpired(profile, 0)) {
        if (!profile.refreshToken || isRefreshTokenExpired(profile, 0)) {
            return true;
        }
    }
    return false;
};

export const readStoredProfile = () => {
    try {
        const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        const normalized = normalizeAuthSession(parsed);
        if (!normalized || !normalized.user || isSessionCompletelyExpired(normalized)) {
            localStorage.removeItem(PROFILE_STORAGE_KEY);
            return null;
        }
        return normalized;
    } catch {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
        return null;
    }
};

export const writeStoredProfile = (data, { notify = true } = {}) => {
    try {
        const current = (() => {
            try {
                const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
                return raw ? JSON.parse(raw) : null;
            } catch {
                return null;
            }
        })();
        const normalized = normalizeAuthSession(data, current);
        if (!normalized || !normalized.token) return null;
        localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
        if (notify && typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('auth:session-updated', { detail: normalized })
            );
        }
        return normalized;
    } catch {
        return null;
    }
};

export const clearStoredProfile = ({ notify = true, reason = 'expired' } = {}) => {
    try {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
    } catch {
        // ignore storage errors
    }
    if (notify && typeof window !== 'undefined') {
        window.dispatchEvent(
            new CustomEvent('auth:session-expired', { detail: { reason } })
        );
    }
};
