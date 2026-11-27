import jwt from "jsonwebtoken";
import Products from "../model/Products.js";
import Users from "../model/Users.js";
import Order from "../model/Orders.js";
import UserInteractions, { INTERACTION_EVENT_TYPES } from "../model/UserInteractions.js";

// Exponential decay half-life = 14 days (lambda = ln(2) / 14)
const DECAY_LAMBDA = Math.LN2 / 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const EVENT_WEIGHTS = {
    CLICK: 1.8,
    VIEW: 2.5,
    CART_ADD: 6.5,
    WISHLIST_ADD: 6.0,
    PURCHASE: 10.0,
    SEARCH: 3.0,
};

const computeTimeDecay = (dateVal) => {
    if (!dateVal) return 0.7;
    const ageMs = Math.max(0, Date.now() - new Date(dateVal).getTime());
    const ageDays = ageMs / MS_PER_DAY;
    return Math.exp(-DECAY_LAMBDA * ageDays);
};

/**
 * Logarithmic dwell engagement score:
 * - < 3s bounce = 0
 * - 15s ~ 1.87, 45s ~ 3.01, 120s ~ 4.12, capped at 180s (~4.60)
 */
const computeDwellWeight = (dwellMs) => {
    const secs = Math.min(180, Math.max(0, Number(dwellMs || 0) / 1000));
    if (secs < 3) return 0;
    return 1.2 * Math.log(1 + secs / 4);
};

const tokenize = (text) =>
    String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((t) => t.length >= 2);

const normalizeMap = (map) => {
    let maxVal = 0;
    for (const v of map.values()) {
        if (v > maxVal) maxVal = v;
    }
    const out = new Map();
    if (maxVal <= 0) return out;
    for (const [k, v] of map.entries()) {
        out.set(k, v / maxVal);
    }
    return out;
};

/**
 * Optional auth resolver: extracts logged-in MongoDB User if Bearer token is valid,
 * plus persistent guest session_id from headers/query/body.
 */
export const resolveOptionalUserContext = async (req) => {
    let user = null;
    const authHeader = req.headers?.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const token = authHeader.split(" ")[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
            if (decoded?.id && decoded?.type !== "refresh") {
                user = await Users.findById(decoded.id, { password: 0 });
            }
        } catch {
            // Guest or expired token — fall back smoothly to session_id
        }
    }

    const rawSession =
        req.headers?.["x-session-id"] ||
        req.query?.session_id ||
        req.body?.session_id ||
        "";
    const sessionId = String(rawSession || "").trim().slice(0, 120) || null;

    return { user, sessionId };
};

const GLOBAL_GRAPH_CACHE_TTL_MS = 45 * 1000;
const USER_SCORE_CACHE_TTL_MS = 25 * 1000;

let globalContextCache = {
    expiresAt: 0,
    data: null,
    inFlight: null,
};

const userScoreCache = new Map();

export const invalidateRecommendationCache = (userId = null, sessionId = null) => {
    if (!userId && !sessionId) {
        globalContextCache.expiresAt = 0;
        globalContextCache.data = null;
        userScoreCache.clear();
        return;
    }
    for (const key of userScoreCache.keys()) {
        if (
            (userId && key.startsWith(`${userId}::`)) ||
            (sessionId && key.endsWith(`::${sessionId}`))
        ) {
            userScoreCache.delete(key);
        }
    }
};

/**
 * Persists a single user interaction signal (CLICK, VIEW, DWELL, CART_ADD, WISHLIST_ADD, PURCHASE, SEARCH).
 */
export const recordUserInteraction = async ({
    user = null,
    session_id = null,
    event_type,
    product_id = null,
    category = "",
    dwell_ms = 0,
    search_query = "",
    quantity = 1,
}) => {
    if (!INTERACTION_EVENT_TYPES.includes(event_type)) return null;
    if (!user && !session_id) return null;

    const clampedDwell = Math.min(300000, Math.max(0, Math.round(Number(dwell_ms) || 0)));
    if (event_type === "DWELL" && clampedDwell < 2000) {
        return null; // Ignore sub-2s accidental bounces
    }

    let resolvedCategory = String(category || "").trim();
    if (!resolvedCategory && product_id) {
        const cachedProd = globalContextCache.data?.productById?.get(product_id);
        if (cachedProd?.category) {
            resolvedCategory = cachedProd.category;
        } else {
            const prod = await Products.findOne({ product_id }, { category: 1 }).lean();
            resolvedCategory = prod?.category || "";
        }
    }

    invalidateRecommendationCache(
        user?._id ? String(user._id) : null,
        session_id || null
    );

    return UserInteractions.create({
        user_id: user?._id ? String(user._id) : null,
        user_email: user?.email ? String(user.email).toLowerCase() : null,
        session_id: session_id || null,
        product_id: product_id || null,
        category: resolvedCategory,
        event_type,
        dwell_ms: clampedDwell,
        search_query: String(search_query || "").trim().slice(0, 120),
        quantity: Math.max(1, Math.floor(Number(quantity) || 1)),
        created_at: new Date(),
    });
};

/**
 * Builds item-to-item cosine similarity matrix + global popularity counts from
 * cross-user orders and high-intent behavioral interactions.
 */
const buildCollaborativeGraph = (allOrders, recentGlobalInteractions) => {
    // Map<actorKey, Set<product_id>>
    const actorBaskets = new Map();
    const globalPopularity = new Map();

    const addActorItem = (actorKey, productId, popWeight) => {
        if (!actorKey || !productId) return;
        if (!actorBaskets.has(actorKey)) {
            actorBaskets.set(actorKey, new Set());
        }
        actorBaskets.get(actorKey).add(productId);
        globalPopularity.set(productId, (globalPopularity.get(productId) || 0) + popWeight);
    };

    for (const ord of allOrders) {
        if (
            ["CANCELLED", "CANCELLED_PAYMENT_UNSUCCESSFUL", "FAILED_DELIVERY"].includes(ord.status)
        ) {
            continue;
        }
        const actor = ord.email
            ? `u:${String(ord.email).toLowerCase()}`
            : `o:${ord.order_id}`;
        const decay = computeTimeDecay(ord.ordered_at);
        for (const item of ord.products || []) {
            if (!item?.product_id) continue;
            addActorItem(actor, item.product_id, 4.0 * decay);
        }
    }

    for (const ev of recentGlobalInteractions) {
        if (!ev.product_id) continue;
        const actor = ev.user_id
            ? `id:${ev.user_id}`
            : ev.session_id
            ? `s:${ev.session_id}`
            : null;
        if (!actor) continue;

        const w =
            ev.event_type === "PURCHASE"
                ? 3.0
                : ev.event_type === "CART_ADD" || ev.event_type === "WISHLIST_ADD"
                ? 2.0
                : ev.event_type === "DWELL"
                ? 1.2
                : 0.7;
        addActorItem(actor, ev.product_id, w * computeTimeDecay(ev.created_at));
    }

    // Compute co-occurrence counts & item degrees for cosine similarity
    const itemDegree = new Map();
    const coOccurrence = new Map(); // Map<prodA, Map<prodB, count>>

    for (const itemsSet of actorBaskets.values()) {
        const items = Array.from(itemsSet);
        for (const a of items) {
            itemDegree.set(a, (itemDegree.get(a) || 0) + 1);
        }
        if (items.length < 2) continue;
        // Cap single basket expansion for safety
        const capped = items.slice(0, 25);
        for (let i = 0; i < capped.length; i++) {
            const a = capped[i];
            if (!coOccurrence.has(a)) coOccurrence.set(a, new Map());
            const rowA = coOccurrence.get(a);
            for (let j = 0; j < capped.length; j++) {
                if (i === j) continue;
                const b = capped[j];
                rowA.set(b, (rowA.get(b) || 0) + 1);
            }
        }
    }

    return { itemDegree, coOccurrence, globalPopularity };
};

const getGlobalRecommendationContext = async () => {
    const now = Date.now();
    if (globalContextCache.data && now < globalContextCache.expiresAt) {
        return globalContextCache.data;
    }
    if (globalContextCache.inFlight) {
        return globalContextCache.inFlight;
    }

    const sixtyDaysAgo = new Date(now - 60 * MS_PER_DAY);

    globalContextCache.inFlight = Promise.all([
        Products.find(
            {
                stock: { $gt: 0 },
                is_deleted: { $ne: true },
                approval_status: { $nin: ["PENDING_APPROVAL", "REJECTED"] },
            },
            { pending_changes: 0 }
        ).lean(),
        Order.find({}, { order_id: 1, email: 1, status: 1, ordered_at: 1, products: 1 })
            .sort({ ordered_at: -1 })
            .limit(250)
            .lean(),
        UserInteractions.find(
            {
                event_type: { $in: ["PURCHASE", "CART_ADD", "WISHLIST_ADD", "VIEW", "DWELL"] },
                created_at: { $gte: sixtyDaysAgo },
            },
            { user_id: 1, session_id: 1, product_id: 1, event_type: 1, created_at: 1 }
        )
            .sort({ created_at: -1 })
            .limit(1000)
            .lean(),
    ])
        .then(([allProducts, recentAllOrders, recentGlobalInteractions]) => {
            const productById = new Map(allProducts.map((p) => [p.product_id, p]));
            const { itemDegree, coOccurrence, globalPopularity } = buildCollaborativeGraph(
                recentAllOrders,
                recentGlobalInteractions
            );
            const result = {
                allProducts,
                productById,
                itemDegree,
                coOccurrence,
                globalPopularity,
            };
            globalContextCache.data = result;
            globalContextCache.expiresAt = Date.now() + GLOBAL_GRAPH_CACHE_TTL_MS;
            return result;
        })
        .finally(() => {
            globalContextCache.inFlight = null;
        });

    return globalContextCache.inFlight;
};

/**
 * Core Hybrid Recommendation Scorer:
 * Combines Direct User Signals (clicks, views, dwell time, wishlist, cart, purchases, reviews),
 * Content-Based Profile Similarity (category, brand, seller, tags, organic, price tier, search intent),
 * Item-to-Item Collaborative Filtering, and Bayesian Quality + Popularity Prior.
 */
const scoreProductsForUser = async ({ user, sessionId }) => {
    const cacheKey = `${user?._id ? String(user._id) : "guest"}::${sessionId || "nosess"}`;
    const cachedUserScore = userScoreCache.get(cacheKey);
    if (cachedUserScore && Date.now() < cachedUserScore.expiresAt) {
        return cachedUserScore.value;
    }

    const sixtyDaysAgo = new Date(Date.now() - 60 * MS_PER_DAY);

    const interactionOrClauses = [];
    if (user?._id) interactionOrClauses.push({ user_id: String(user._id) });
    if (user?.email) interactionOrClauses.push({ user_email: String(user.email).toLowerCase() });
    if (sessionId) interactionOrClauses.push({ session_id: sessionId });

    const [globalCtx, userInteractions, userOrders] = await Promise.all([
        getGlobalRecommendationContext(),
        interactionOrClauses.length > 0
            ? UserInteractions.find({
                  $or: interactionOrClauses,
                  created_at: { $gte: sixtyDaysAgo },
              })
                  .sort({ created_at: -1 })
                  .limit(300)
                  .lean()
            : Promise.resolve([]),
        user?.email
            ? Order.find(
                  {
                      email: { $regex: `^${user.email}$`, $options: "i" },
                  },
                  { status: 1, ordered_at: 1, products: 1 }
              )
                  .sort({ ordered_at: -1 })
                  .limit(40)
                  .lean()
            : Promise.resolve([]),
    ]);

    const { allProducts, productById, itemDegree, coOccurrence, globalPopularity } = globalCtx;

    // User signal accumulators
    const directScore = new Map();
    const directMeta = new Map(); // tracks rich evidence per product for explanation tags
    const categoryAffinity = new Map();
    const brandAffinity = new Map();
    const sellerAffinity = new Map();
    const tagAffinity = new Map();
    const searchTokens = new Map(); // token -> decayed weight
    const seedProductWeights = new Map(); // strong seeds for collaborative filtering

    let priceWeightedSum = 0;
    let priceTotalWeight = 0;
    let organicWeightedSum = 0;
    let organicTotalWeight = 0;
    let totalUserSignalStrength = 0;
    const signalTypesUsed = new Set();

    const getMeta = (pid) => {
        if (!directMeta.has(pid)) {
            directMeta.set(pid, {
                clicks: 0,
                views: 0,
                dwellSec: 0,
                wishlisted: false,
                inCart: false,
                purchasedCount: 0,
                lastPurchasedAgeDays: Infinity,
                userRating: null,
            });
        }
        return directMeta.get(pid);
    };

    const applyAttributeAffinity = (product, weight) => {
        if (!product || weight === 0) return;
        if (product.category) {
            categoryAffinity.set(
                product.category,
                (categoryAffinity.get(product.category) || 0) + weight
            );
        }
        if (product.brand) {
            brandAffinity.set(product.brand, (brandAffinity.get(product.brand) || 0) + weight * 0.8);
        }
        if (product.seller?.name) {
            sellerAffinity.set(
                product.seller.name,
                (sellerAffinity.get(product.seller.name) || 0) + weight * 0.65
            );
        }
        for (const tag of product.tags || []) {
            const normTag = String(tag).toLowerCase().trim();
            if (normTag) {
                tagAffinity.set(normTag, (tagAffinity.get(normTag) || 0) + weight * 0.5);
            }
        }
        if (weight > 0) {
            const effectivePrice = Number(product.discounted_price || product.price || 0);
            if (effectivePrice > 0) {
                priceWeightedSum += effectivePrice * weight;
                priceTotalWeight += weight;
            }
            organicWeightedSum += (product.is_organic ? 1 : 0) * weight;
            organicTotalWeight += weight;
        }
    };

    // 1. Ingest explicit UserInteractions telemetry (clicks, views, dwell time, cart adds, wishlist adds, searches)
    for (const ev of userInteractions) {
        const decay = computeTimeDecay(ev.created_at);

        if (ev.event_type === "SEARCH" && ev.search_query) {
            signalTypesUsed.add("searches");
            const tokens = tokenize(ev.search_query);
            for (const tok of tokens) {
                searchTokens.set(tok, (searchTokens.get(tok) || 0) + EVENT_WEIGHTS.SEARCH * decay);
            }
            totalUserSignalStrength += EVENT_WEIGHTS.SEARCH * decay;
            continue;
        }

        if (!ev.product_id) continue;
        const prod = productById.get(ev.product_id);
        const meta = getMeta(ev.product_id);
        let weight = 0;

        if (ev.event_type === "DWELL") {
            const dw = computeDwellWeight(ev.dwell_ms);
            weight = dw * decay;
            meta.dwellSec += Math.round(Number(ev.dwell_ms || 0) / 1000);
            if (dw > 0) signalTypesUsed.add("time spent viewing");
        } else if (ev.event_type === "CLICK") {
            weight = EVENT_WEIGHTS.CLICK * decay;
            meta.clicks += 1;
            signalTypesUsed.add("clicks");
        } else if (ev.event_type === "VIEW") {
            weight = EVENT_WEIGHTS.VIEW * decay;
            meta.views += 1;
            signalTypesUsed.add("views");
        } else if (ev.event_type === "CART_ADD") {
            weight = EVENT_WEIGHTS.CART_ADD * decay;
            meta.inCart = true;
            signalTypesUsed.add("cart");
        } else if (ev.event_type === "WISHLIST_ADD") {
            weight = EVENT_WEIGHTS.WISHLIST_ADD * decay;
            meta.wishlisted = true;
            signalTypesUsed.add("wishlist");
        } else if (ev.event_type === "PURCHASE") {
            weight = EVENT_WEIGHTS.PURCHASE * Math.log2(1 + Number(ev.quantity || 1)) * decay;
            signalTypesUsed.add("purchases");
        }

        if (weight > 0) {
            directScore.set(ev.product_id, (directScore.get(ev.product_id) || 0) + weight);
            seedProductWeights.set(
                ev.product_id,
                (seedProductWeights.get(ev.product_id) || 0) + weight
            );
            totalUserSignalStrength += weight;
            if (prod) {
                applyAttributeAffinity(prod, weight);
            } else if (ev.category) {
                categoryAffinity.set(
                    ev.category,
                    (categoryAffinity.get(ev.category) || 0) + weight
                );
            }
        }
    }

    // 2. Ingest current MongoDB User Wishlist & Active Cart (instant personalization even before telemetry builds up)
    if (Array.isArray(user?.wishlist)) {
        for (const pid of user.wishlist) {
            const prod = productById.get(pid);
            if (!prod) continue;
            signalTypesUsed.add("wishlist");
            const meta = getMeta(pid);
            meta.wishlisted = true;
            const w = EVENT_WEIGHTS.WISHLIST_ADD;
            directScore.set(pid, (directScore.get(pid) || 0) + w);
            seedProductWeights.set(pid, (seedProductWeights.get(pid) || 0) + w);
            totalUserSignalStrength += w;
            applyAttributeAffinity(prod, w);
        }
    }

    if (Array.isArray(user?.cart)) {
        for (const cItem of user.cart) {
            const pid = cItem?.product_id;
            const prod = productById.get(pid);
            if (!prod) continue;
            signalTypesUsed.add("cart");
            const meta = getMeta(pid);
            meta.inCart = true;
            const w = EVENT_WEIGHTS.CART_ADD;
            seedProductWeights.set(pid, (seedProductWeights.get(pid) || 0) + w);
            totalUserSignalStrength += w;
            applyAttributeAffinity(prod, w);
        }
    }

    // 3. Ingest Historical Orders (Purchases + Grocery Replenishment timing)
    for (const ord of userOrders) {
        if (
            ["CANCELLED", "CANCELLED_PAYMENT_UNSUCCESSFUL", "FAILED_DELIVERY"].includes(ord.status)
        ) {
            continue;
        }
        const ageDays = Math.max(0, (Date.now() - new Date(ord.ordered_at || Date.now()).getTime()) / MS_PER_DAY);
        const decay = computeTimeDecay(ord.ordered_at);
        for (const item of ord.products || []) {
            if (!item?.product_id) continue;
            const prod = productById.get(item.product_id);
            const meta = getMeta(item.product_id);
            meta.purchasedCount += Number(item.quantity || 1);
            if (ageDays < meta.lastPurchasedAgeDays) {
                meta.lastPurchasedAgeDays = ageDays;
            }
            signalTypesUsed.add("purchases");

            const basePurchaseWeight =
                EVENT_WEIGHTS.PURCHASE * Math.log2(1 + Number(item.quantity || 1)) * decay;

            // Strong seed for content & collaborative recommendations
            seedProductWeights.set(
                item.product_id,
                (seedProductWeights.get(item.product_id) || 0) + basePurchaseWeight
            );
            totalUserSignalStrength += basePurchaseWeight;
            if (prod) applyAttributeAffinity(prod, basePurchaseWeight);

            // Grocery replenishment curve:
            // - Bought < 2 days ago: dampen direct repeat score so discovery items surface above it
            // - Bought >= 3 days ago: boost as a consumable "Buy Again" replenishment pick
            const directPurchaseFactor = ageDays < 2 ? 0.35 : ageDays <= 21 ? 0.9 : 0.75;
            directScore.set(
                item.product_id,
                (directScore.get(item.product_id) || 0) + basePurchaseWeight * directPurchaseFactor
            );
        }
    }

    // 4. Ingest User's Own Product Reviews (Positive 4-5★ boosts, Negative 1-2★ down-ranks)
    if (user) {
        const uidStr = String(user._id);
        const uEmail = String(user.email || "").toLowerCase();
        for (const prod of allProducts) {
            const myRev = (prod.reviews || []).find(
                (r) =>
                    r.user_id === uidStr ||
                    (r.user_email && String(r.user_email).toLowerCase() === uEmail)
            );
            if (!myRev) continue;
            const rating = Number(myRev.product_rating || 5);
            const meta = getMeta(prod.product_id);
            meta.userRating = rating;
            signalTypesUsed.add("reviews");

            if (rating >= 4) {
                const boost = rating === 5 ? 4.5 : 2.5;
                directScore.set(prod.product_id, (directScore.get(prod.product_id) || 0) + boost);
                seedProductWeights.set(
                    prod.product_id,
                    (seedProductWeights.get(prod.product_id) || 0) + boost
                );
                applyAttributeAffinity(prod, boost);
                totalUserSignalStrength += boost;
            } else if (rating <= 2) {
                // Strong negative feedback — avoid pushing products they rated poorly
                directScore.set(prod.product_id, (directScore.get(prod.product_id) || 0) - 8.0);
                applyAttributeAffinity(prod, -2.0);
            }
        }
    }

    // 5. High-intent unpurchased conversion boost (wishlisted or spent >= 15s viewing without recent purchase)
    for (const [pid, meta] of directMeta.entries()) {
        const notRecentlyBought = meta.lastPurchasedAgeDays > 7;
        if (notRecentlyBought && (meta.wishlisted || meta.dwellSec >= 15)) {
            directScore.set(pid, (directScore.get(pid) || 0) + 3.5);
        }
    }

    // Normalize preference vectors
    const normCat = normalizeMap(categoryAffinity);
    const normBrand = normalizeMap(brandAffinity);
    const normSeller = normalizeMap(sellerAffinity);
    const normTags = normalizeMap(tagAffinity);
    const avgUserPrice = priceTotalWeight > 0 ? priceWeightedSum / priceTotalWeight : null;
    const organicRatio = organicTotalWeight > 0 ? organicWeightedSum / organicTotalWeight : 0.5;
    const maxGlobalPop = Math.max(1, ...Array.from(globalPopularity.values(), (v) => Math.log1p(v)));

    // Compute raw component scores for all candidate in-stock products
    const rawDirect = new Map();
    const rawContent = new Map();
    const rawCollab = new Map();
    const rawQuality = new Map();
    const searchMatchScore = new Map();

    // Top 15 seeds for collaborative filtering
    const topSeeds = Array.from(seedProductWeights.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15);

    for (const prod of allProducts) {
        const pid = prod.product_id;

        // A. Direct Score
        rawDirect.set(pid, Math.max(0, directScore.get(pid) || 0));

        // B. Content-Based Similarity Score
        let cScore = 0;
        cScore += (normCat.get(prod.category) || 0) * 0.45;
        cScore += (normBrand.get(prod.brand) || 0) * 0.2;
        cScore += (normSeller.get(prod.seller?.name) || 0) * 0.12;

        const pTags = (prod.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
        if (pTags.length > 0 && normTags.size > 0) {
            const tagSum = pTags.reduce((s, t) => s + (normTags.get(t) || 0), 0) / pTags.length;
            cScore += tagSum * 0.13;
        }

        if (avgUserPrice !== null) {
            const effPrice = Number(prod.discounted_price || prod.price || 0);
            const sigma = Math.max(250, avgUserPrice * 0.65);
            const priceSim = Math.exp(-Math.pow(effPrice - avgUserPrice, 2) / (2 * sigma * sigma));
            cScore += priceSim * 0.06;
        }

        if (organicTotalWeight > 0) {
            const orgMatch = prod.is_organic ? organicRatio : 1 - organicRatio;
            cScore += orgMatch * 0.04;
        }

        // Search query keyword intent match
        let sMatch = 0;
        if (searchTokens.size > 0) {
            const haystackTokens = new Set([
                ...tokenize(prod.name),
                ...tokenize(prod.category),
                ...tokenize(prod.brand),
                ...pTags.flatMap(tokenize),
            ]);
            for (const [tok, w] of searchTokens.entries()) {
                if (haystackTokens.has(tok)) {
                    sMatch += w;
                }
            }
            if (sMatch > 0) {
                cScore += Math.min(0.6, sMatch * 0.12);
            }
        }
        searchMatchScore.set(pid, sMatch);
        rawContent.set(pid, cScore);

        // C. Collaborative Filtering Score (Cosine item-item similarity from user's top seeds)
        let cfScore = 0;
        const degTarget = itemDegree.get(pid) || 0;
        if (degTarget > 0 && topSeeds.length > 0) {
            for (const [seedPid, seedWeight] of topSeeds) {
                if (seedPid === pid) continue;
                const coCount = coOccurrence.get(seedPid)?.get(pid) || 0;
                if (coCount <= 0) continue;
                const degSeed = itemDegree.get(seedPid) || 1;
                const cosineSim = coCount / Math.sqrt(degSeed * degTarget);
                cfScore += cosineSim * Math.log1p(seedWeight);
            }
        }
        rawCollab.set(pid, cfScore);

        // D. Quality, Popularity & Deal Prior (Bayesian rating + popularity + flash/discount)
        const rating = Number(prod.rating || 4.7);
        const revCount = Number(prod.reviews_count || prod.reviews?.length || 0);
        const bayesianRating = (rating * revCount + 4.5 * 5) / (revCount + 5); // ~ 1..5
        const normRating = (bayesianRating - 1) / 4; // 0..1
        const normPop = Math.log1p(globalPopularity.get(pid) || 0) / maxGlobalPop;
        const dealBonus = prod.flash_sale ? 0.22 : Number(prod.discount || 0) > 0 ? 0.14 : 0;
        rawQuality.set(pid, normRating * 0.55 + normPop * 0.35 + dealBonus);
    }

    const normDirect = normalizeMap(rawDirect);
    const normContent = normalizeMap(rawContent);
    const normCollab = normalizeMap(rawCollab);
    const normQuality = normalizeMap(rawQuality);

    const isPersonalized = totalUserSignalStrength >= 1.5;

    // Combine weights (cold-start smoothly shifts weight to quality/popularity)
    const wDirect = isPersonalized ? 0.34 : 0.0;
    const wContent = isPersonalized ? 0.32 : 0.0;
    const wCollab = isPersonalized ? 0.22 : 0.0;
    const wQuality = isPersonalized ? 0.12 : 1.0;

    const scoredProducts = allProducts.map((prod) => {
        const pid = prod.product_id;
        const meta = directMeta.get(pid);
        const dPart = normDirect.get(pid) || 0;
        const cPart = normContent.get(pid) || 0;
        const cfPart = normCollab.get(pid) || 0;
        const qPart = normQuality.get(pid) || 0;

        let finalScore = wDirect * dPart + wContent * cPart + wCollab * cfPart + wQuality * qPart;

        // Penalize poorly rated products directly
        if (meta?.userRating !== null && meta?.userRating !== undefined && meta.userRating <= 2) {
            finalScore *= 0.15;
        }

        // Determine clear, honest recommendation reason badge
        let reason = "Popular Fresh Pick";
        if (isPersonalized) {
            if (meta?.wishlisted && meta.lastPurchasedAgeDays > 7) {
                reason = "Saved in your wishlist";
            } else if (meta?.purchasedCount > 0 && meta.lastPurchasedAgeDays >= 3) {
                reason = "Buy again";
            } else if (meta?.dwellSec >= 15) {
                reason = `Viewed for ${meta.dwellSec}s`;
            } else if (meta?.views > 0 || meta?.clicks > 0) {
                reason = "Recently viewed";
            } else if ((searchMatchScore.get(pid) || 0) > 0) {
                reason = "Matches your recent search";
            } else if (cfPart >= 0.35 && cfPart >= cPart) {
                reason = "Shoppers like you also bought";
            } else if ((normCat.get(prod.category) || 0) >= 0.3) {
                reason = `Because you like ${prod.category}`;
            } else if (prod.flash_sale || Number(prod.discount || 0) > 0) {
                reason = "Top-rated deal for you";
            } else {
                reason = "Picked for your taste";
            }
        } else if (prod.flash_sale || Number(prod.discount || 0) > 0) {
            reason = "Trending deal";
        } else if (Number(prod.rating || 0) >= 4.8) {
            reason = "Top rated";
        }

        const { reviews, pending_changes, ...slimProd } = prod;

        return {
            ...slimProd,
            reviews_count: Number(prod.reviews_count ?? prod.reviews?.length ?? 0),
            recommendation_score: Number(finalScore.toFixed(4)),
            recommendation_reason: reason,
        };
    });

    scoredProducts.sort((a, b) => b.recommendation_score - a.recommendation_score);

    const result = {
        scoredProducts,
        categoryAffinity,
        isPersonalized,
        signalsUsed: Array.from(signalTypesUsed),
        itemDegree,
        coOccurrence,
    };

    if (userScoreCache.size > 200) {
        userScoreCache.clear();
    }
    userScoreCache.set(cacheKey, {
        expiresAt: Date.now() + USER_SCORE_CACHE_TTL_MS,
        value: result,
    });

    return result;
};

/**
 * Builds Home Page personalized recommendation shelves:
 * 1. "Picked Just For You" (diverse top-8 personalized shelf, max 2 per category)
 * 2. Top 2 highest-affinity category shelves sorted by personalized score
 */
export const buildHomeRecommendations = async ({ user, sessionId }) => {
    const { scoredProducts, categoryAffinity, isPersonalized, signalsUsed } =
        await scoreProductsForUser({ user, sessionId });

    if (scoredProducts.length === 0) {
        return [];
    }

    const shelves = [];

    // Shelf 1: Top Personalized Picks with category diversity cap (max 2 per category)
    const topPicks = [];
    const catUsage = new Map();
    for (const prod of scoredProducts) {
        if (topPicks.length >= 8) break;
        const c = prod.category || "Other";
        const used = catUsage.get(c) || 0;
        if (used >= 2) continue;
        topPicks.push(prod);
        catUsage.set(c, used + 1);
    }

    // Backfill if catalog has fewer categories
    if (topPicks.length < 4) {
        const usedIds = new Set(topPicks.map((p) => p.product_id));
        for (const prod of scoredProducts) {
            if (topPicks.length >= 8) break;
            if (!usedIds.has(prod.product_id)) {
                topPicks.push(prod);
                usedIds.add(prod.product_id);
            }
        }
    }

    const subtitleSignals =
        signalsUsed.length > 0
            ? `Tailored from your ${signalsUsed.slice(0, 4).join(", ")}`
            : "Highest-rated farm-fresh favorites & daily deals";

    shelves.push({
        category: isPersonalized ? "Picked Just For You" : "Trending Fresh Picks",
        is_personalized_shelf: true,
        personalized: isPersonalized,
        subtitle: subtitleSignals,
        signals_used: signalsUsed,
        products: topPicks,
    });

    // Shelf 2 & 3: Top 2 affinity categories (or top-scoring diverse categories for cold start)
    const distinctCategories = Array.from(
        new Set(scoredProducts.map((p) => p.category).filter(Boolean))
    );

    const rankedCategories = distinctCategories.sort((catA, catB) => {
        const affA = categoryAffinity.get(catA) || 0;
        const affB = categoryAffinity.get(catB) || 0;
        if (affB !== affA) return affB - affA;
        // Cold-start fallback: average score of top 4 products in that category
        const avgA =
            scoredProducts
                .filter((p) => p.category === catA)
                .slice(0, 4)
                .reduce((s, p) => s + p.recommendation_score, 0) / 4;
        const avgB =
            scoredProducts
                .filter((p) => p.category === catB)
                .slice(0, 4)
                .reduce((s, p) => s + p.recommendation_score, 0) / 4;
        return avgB - avgA;
    });

    for (const cat of rankedCategories.slice(0, 2)) {
        const catProducts = scoredProducts.filter((p) => p.category === cat).slice(0, 5);
        if (catProducts.length > 0) {
            shelves.push({
                category: cat,
                is_personalized_shelf: false,
                personalized: isPersonalized && (categoryAffinity.get(cat) || 0) > 0,
                subtitle:
                    isPersonalized && (categoryAffinity.get(cat) || 0) > 0
                        ? `Top matches in ${cat} based on your activity`
                        : `Best-selling picks in ${cat}`,
                products: catProducts,
            });
        }
    }

    return shelves;
};

/**
 * Builds personalized "Related / You May Also Like" items for a Product Details page,
 * blending item-to-item co-purchase/co-view similarity, attribute similarity, and user affinity.
 */
export const buildRelatedProductsForUser = async ({ product, user, sessionId, limit = 4 }) => {
    const { scoredProducts, itemDegree, coOccurrence } = await scoreProductsForUser({
        user,
        sessionId,
    });

    const targetId = product.product_id;
    const targetDeg = itemDegree.get(targetId) || 0;
    const targetTags = new Set(
        (product.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean)
    );
    const targetPrice = Number(product.discounted_price || product.price || 0);

    const candidates = scoredProducts
        .filter((p) => p.product_id !== targetId)
        .map((cand) => {
            let sim = 0;
            if (cand.category === product.category) sim += 0.42;
            if (cand.brand && cand.brand === product.brand) sim += 0.14;
            if (cand.seller?.name && cand.seller.name === product.seller?.name) sim += 0.08;

            const candTags = (cand.tags || [])
                .map((t) => String(t).toLowerCase().trim())
                .filter(Boolean);
            const sharedTags = candTags.filter((t) => targetTags.has(t)).length;
            if (sharedTags > 0) sim += Math.min(0.16, sharedTags * 0.06);

            if (targetPrice > 0) {
                const candPrice = Number(cand.discounted_price || cand.price || 0);
                const sigma = Math.max(200, targetPrice * 0.6);
                sim += 0.08 * Math.exp(-Math.pow(candPrice - targetPrice, 2) / (2 * sigma * sigma));
            }

            // Collaborative co-purchase/co-view boost with the viewed product
            if (targetDeg > 0) {
                const coCount = coOccurrence.get(targetId)?.get(cand.product_id) || 0;
                const candDeg = itemDegree.get(cand.product_id) || 0;
                if (coCount > 0 && candDeg > 0) {
                    sim += 0.45 * (coCount / Math.sqrt(targetDeg * candDeg));
                }
            }

            const blended = sim * 0.65 + (cand.recommendation_score || 0) * 0.35;
            return {
                ...cand,
                related_score: Number(blended.toFixed(4)),
            };
        })
        .sort((a, b) => b.related_score - a.related_score);

    return candidates.slice(0, limit);
};
