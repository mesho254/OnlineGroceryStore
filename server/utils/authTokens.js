import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import Users from "../model/Users.js";

export const ACCESS_TOKEN_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
export const REFRESH_TOKEN_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

// Max concurrent device/tab refresh tokens kept per user
const MAX_ACTIVE_REFRESH_TOKENS = 5;
// Short grace window (ms) so simultaneous requests from multiple open tabs don't race on rotation
const ROTATION_GRACE_WINDOW_MS = 20 * 1000;

export const getAccessSecret = () => process.env.JWT_SECRET_KEY;
export const getRefreshSecret = () =>
    process.env.JWT_REFRESH_SECRET_KEY || process.env.JWT_SECRET_KEY;

export const hashToken = (rawToken) =>
    crypto.createHash("sha256").update(String(rawToken || "")).digest("hex");

/**
 * Decodes a signed JWT to inspect its `exp` claim (in milliseconds).
 */
export const getTokenExpiryMs = (token, fallbackDurationMs) => {
    try {
        const decoded = jwt.decode(token);
        if (decoded && typeof decoded.exp === "number") {
            return decoded.exp * 1000;
        }
    } catch {
        // fall through
    }
    return Date.now() + fallbackDurationMs;
};

export const signAccessToken = (user) => {
    const payload = {
        id: String(user._id),
        email: user.email,
        role: user.role || "USER",
        type: "access",
    };
    const accessToken = jwt.sign(payload, getAccessSecret(), {
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });
    const accessTokenExpiresAt = getTokenExpiryMs(accessToken, 15 * 60 * 1000);
    const expiresIn = Math.max(1, Math.round((accessTokenExpiresAt - Date.now()) / 1000));

    return {
        accessToken,
        accessTokenExpiresAt,
        expiresIn,
    };
};

export const signRefreshToken = (user) => {
    const jti = crypto.randomUUID();
    const payload = {
        id: String(user._id),
        email: user.email,
        jti,
        type: "refresh",
    };
    const refreshToken = jwt.sign(payload, getRefreshSecret(), {
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });
    const refreshTokenExpiresAt = getTokenExpiryMs(refreshToken, 7 * 24 * 60 * 60 * 1000);

    return {
        refreshToken,
        refreshTokenExpiresAt,
        jti,
    };
};

/**
 * Issues a new access + refresh token pair for `user`, persists the hashed
 * refresh token on the user's MongoDB document (pruning expired/excess tokens),
 * and returns the normalized token payload.
 */
export const issueAuthTokens = async (user, { replacedTokenHash = null } = {}) => {
    const { accessToken, accessTokenExpiresAt, expiresIn } = signAccessToken(user);
    const { refreshToken, refreshTokenExpiresAt } = signRefreshToken(user);
    const newHash = hashToken(refreshToken);
    const now = new Date();
    const nowMs = now.getTime();

    const existingList = Array.isArray(user.refresh_tokens) ? user.refresh_tokens : [];

    // Keep only non-expired tokens; if rotating, give the replaced token a brief grace expiry
    const cleaned = existingList
        .map((entry) => {
            if (!entry || !entry.token_hash) return null;
            const expMs = entry.expires_at ? new Date(entry.expires_at).getTime() : 0;
            if (expMs <= nowMs) return null;

            if (replacedTokenHash && entry.token_hash === replacedTokenHash) {
                const graceExp = new Date(Math.min(expMs, nowMs + ROTATION_GRACE_WINDOW_MS));
                return {
                    token_hash: entry.token_hash,
                    created_at: entry.created_at || now,
                    expires_at: graceExp,
                    rotated_at: now,
                };
            }
            return {
                token_hash: entry.token_hash,
                created_at: entry.created_at || now,
                expires_at: new Date(expMs),
                ...(entry.rotated_at ? { rotated_at: entry.rotated_at } : {}),
            };
        })
        .filter(Boolean);

    cleaned.push({
        token_hash: newHash,
        created_at: now,
        expires_at: new Date(refreshTokenExpiresAt),
    });

    // Keep the most recent active tokens (plus any short-lived grace tokens)
    const activeTokens = cleaned.slice(-MAX_ACTIVE_REFRESH_TOKENS - 2);

    await Users.updateOne(
        { _id: user._id },
        { $set: { refresh_tokens: activeTokens } }
    );

    return {
        token: accessToken,
        accessToken,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
        expiresIn,
    };
};

export const revokeRefreshToken = async (userId, rawRefreshToken = null, { allDevices = false } = {}) => {
    if (!userId) return;
    if (allDevices || !rawRefreshToken) {
        await Users.updateOne({ _id: userId }, { $set: { refresh_tokens: [] } });
        return;
    }
    const targetHash = hashToken(rawRefreshToken);
    await Users.updateOne(
        { _id: userId },
        { $pull: { refresh_tokens: { token_hash: targetHash } } }
    );
};

export const verifyRefreshTokenJwt = (rawRefreshToken) => {
    const decoded = jwt.verify(rawRefreshToken, getRefreshSecret());
    if (!decoded || decoded.type !== "refresh" || !decoded.id) {
        const err = new Error("Invalid refresh token payload");
        err.name = "JsonWebTokenError";
        throw err;
    }
    return decoded;
};
