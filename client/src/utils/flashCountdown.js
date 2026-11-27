import {useEffect, useState} from "react";

// Single shared 1-second ticker so rendering many flash-sale cards uses only one interval
const listeners = new Set();
let sharedTimer = null;

const subscribeTick = (fn) => {
    listeners.add(fn);
    if (!sharedTimer && typeof window !== "undefined") {
        sharedTimer = window.setInterval(() => {
            const now = Date.now();
            listeners.forEach((cb) => cb(now));
        }, 1000);
    }
    return () => {
        listeners.delete(fn);
        if (listeners.size === 0 && sharedTimer) {
            window.clearInterval(sharedTimer);
            sharedTimer = null;
        }
    };
};

export const useLiveClock = (enabled = true) => {
    const [nowMs, setNowMs] = useState(() => Date.now());
    useEffect(() => {
        if (!enabled) return undefined;
        setNowMs(Date.now());
        return subscribeTick(setNowMs);
    }, [enabled]);
    return nowMs;
};

/**
 * Resolves the target end timestamp (ms) for a specific product's flash sale.
 * Uses the product's own `flash_sale_ends_at` when set in the future; otherwise
 * falls back to the end of today's deal cycle (local midnight).
 */
export const getFlashSaleEndMs = (product, nowMs = Date.now()) => {
    if (product?.flash_sale_ends_at) {
        const parsed = new Date(product.flash_sale_ends_at).getTime();
        if (Number.isFinite(parsed) && parsed > nowMs) {
            return parsed;
        }
    }
    const midnight = new Date(nowMs);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
};

export const getSoonestFlashSaleEndMs = (products = [], nowMs = Date.now()) => {
    if (!Array.isArray(products) || products.length === 0) {
        return getFlashSaleEndMs(null, nowMs);
    }

    let minEndMs = Infinity;
    for (const prod of products) {
        if (!prod) continue;
        const endMs = getFlashSaleEndMs(prod, nowMs);
        if (endMs < minEndMs) {
            minEndMs = endMs;
        }
    }

    return Number.isFinite(minEndMs) ? minEndMs : getFlashSaleEndMs(null, nowMs);
};

export const formatRemainingTime = (targetMs, nowMs = Date.now()) => {
    const totalSeconds = Math.max(0, Math.floor((targetMs - nowMs) / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hrs = Math.floor((totalSeconds % 86400) / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    return {
        totalSeconds,
        days,
        hrs: String(hrs).padStart(2, "0"),
        mins: String(mins).padStart(2, "0"),
        secs: String(secs).padStart(2, "0"),
    };
};
