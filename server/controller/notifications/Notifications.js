import Notifications from "../../model/Notifications.js";
import Users from "../../model/Users.js";
import Order, { PendingCheckout } from "../../model/Orders.js";
import Shipments from "../../model/Shipments.js";
import Products from "../../model/Products.js";
import sendEmail from "../../utils/sendEmail.js";
import {
    orderConfirmationTemplate,
    deliveryReviewEmailTemplate,
} from "../../templates/index.js";
import { WEBSITE_BASE_URL } from "../../services/BaseURLs.js";
import { stripe } from "../../index.js";
import { rollbackOrderData } from "../orders/Orders.js";
import { generatePosReceiptPdfBuffer } from "../../utils/posReceiptPdf.js";

/**
 * Helper to create a delivery review notification and send the review email
 * when an order/shipment is delivered. Idempotent per order_id.
 */
export const triggerDeliveryReviewNotification = async (order_id, originUrl) => {
    const order = await Order.findOne({ order_id });
    if (!order) return null;

    const existing = await Notifications.findOne({
        order_id,
        type: "DELIVERY_REVIEW",
    });
    if (existing) return existing;

    const user = order.email
        ? await Users.findOne({ email: { $regex: `^${order.email}$`, $options: "i" } })
        : null;

    const productIds = (order.products || []).map((p) => p.product_id).filter(Boolean);
    const dbProducts = await Products.find({ product_id: { $in: productIds } });
    const productMap = new Map(dbProducts.map((p) => [p.product_id, p]));

    const enrichedProducts = (order.products || []).map((item) => {
        const dbItem = productMap.get(item.product_id);
        return {
            product_id: item.product_id,
            name: dbItem?.name || item.name || "Grocery Item",
            image:
                dbItem?.image ||
                "https://www.themealdb.com/images/ingredients/Kale.png",
            seller_name: dbItem?.seller?.name || "KijaniMart Verified Farm",
            reviewed: false,
        };
    });

    const firstProdId = enrichedProducts[0]?.product_id || "";
    const notification = await Notifications.create({
        user_id: user?._id ? String(user._id) : undefined,
        user_email: order.email,
        order_id: order.order_id,
        type: "DELIVERY_REVIEW",
        title: `Order #${order.order_id} Delivered! Rate Your Groceries ⭐`,
        message: `Your order #${order.order_id} has been delivered! Please rate the products and seller.`,
        products: enrichedProducts,
        link: firstProdId
            ? `/products/${firstProdId}?review=true&order=${order.order_id}`
            : "/products",
        read: false,
        dismissed_popup: false,
    });

    if (order.email && process.env.USER && process.env.PASS) {
        const baseUrl = originUrl || process.env.WEBSITE_BASE_URL || WEBSITE_BASE_URL;
        const emailItems = enrichedProducts.map((ep, idx) => {
            const rawItem = order.products?.[idx] || {};
            const dbItem = productMap.get(ep.product_id);
            return {
                ...ep,
                quantity: Math.max(1, Number(rawItem.quantity || 1)),
                ordered_price: Number(
                    rawItem.price ?? dbItem?.discounted_price ?? dbItem?.price ?? 0
                ),
                weight: dbItem?.weight || "",
                measurement: dbItem?.measurement || "",
            };
        });

        let attachments = [];
        try {
            const pdfBuffer = generatePosReceiptPdfBuffer(
                { ...(order._doc || order), status: "DELIVERED" },
                emailItems
            );
            const safeOrderId = String(order.order_id || "order").replace(/[^a-zA-Z0-9_-]/g, "");
            attachments = [
                {
                    filename: `KijaniMart-Receipt-${safeOrderId}.pdf`,
                    content: pdfBuffer,
                    contentType: "application/pdf",
                },
            ];
        } catch (pdfErr) {
            console.warn("Delivered email POS PDF attachment skipped:", pdfErr.message);
        }

        sendEmail({
            to: order.email,
            subject: `Order #${order.order_id} Delivered! Your POS Receipt & Review Request ⭐`,
            html: deliveryReviewEmailTemplate({
                name: order.name?.first || user?.first_name || "Customer",
                order_id: order.order_id,
                products: emailItems,
                total: order.total,
                hasPdfAttachment: attachments.length > 0,
                baseUrl,
            }),
            attachments,
        }).catch((err) => console.warn("Delivery review email skipped:", err.message));
    }

    return notification;
};

const ADMIN_BROADCAST_TYPES = new Set([
    "LOW_STOCK",
    "OUT_OF_STOCK",
    "SELLER_APPLICATION",
    "SELLER_ORDER_UPDATE",
    "PRODUCT_APPROVAL_REQUEST",
    "PRODUCT_EDIT_REQUEST",
]);

const cleanAccidentalUndefined = (text) =>
    String(text || "")
        .replace(/\bundefined\b/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s+\(/g, " (")
        .trim();

const formatDisplayName = (u, fallbackEmail, fallbackOrder) => {
    const fromUser = [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim();
    if (fromUser) return fromUser;
    const fromOrder = [fallbackOrder?.name?.first, fallbackOrder?.name?.last]
        .filter(Boolean)
        .join(" ")
        .trim();
    if (fromOrder) return fromOrder;
    if (fallbackEmail) {
        return String(fallbackEmail).split("@")[0];
    }
    return "A user";
};

const formatNotificationForAdmin = (doc, { isMine, actorName, actorUser, matchedOrder }) => {
    const base = doc._doc ? { ...doc._doc } : { ...doc };
    const cleanTitle = cleanAccidentalUndefined(base.title);
    const cleanMessage = cleanAccidentalUndefined(base.message);

    // If the notification belongs to the admin themselves, keep it normal!
    if (isMine) {
        return {
            ...base,
            title: cleanTitle,
            message: cleanMessage,
            is_mine: true,
            recipient_name: actorName,
            recipient_email: base.user_email || actorUser?.email || "",
            recipient_role: actorUser?.role || "ADMIN",
        };
    }

    // For another user's notification, rewrite clearly in third person ("Meshack placed Order #...")
    let adminTitle = `${actorName} — ${cleanTitle}`;
    let adminMessage = cleanMessage
        .replace(/\bYour\b/g, `${actorName}'s`)
        .replace(/\byour\b/g, `${actorName}'s`)
        .replace(/\bWe have received\b/gi, `${actorName} placed`);
    let adminLink = base.link || "/admin";

    if (base.type === "ORDER_CONFIRMED") {
        const isSellerOrderNotif = /new seller order/i.test(cleanTitle);
        if (isSellerOrderNotif) {
            const storeLabel = actorUser?.seller_profile?.store_name || actorName;
            adminTitle = `🛒 ${actorName} (${storeLabel}) received Order #${base.order_id || ""}`.trim();
            adminMessage = cleanMessage
                .replace(/\byour store\b/gi, `${storeLabel}`)
                .replace(/\bOpen Seller Portal to prepare dispatch\./i, `View details in Admin Orders.`);
            adminLink = base.order_id ? `/admin/orders/${base.order_id}` : "/admin/orders";
        } else {
            const totalPart = matchedOrder?.total ? ` (${Number(matchedOrder.total).toFixed(2)} KES)` : "";
            adminTitle = `🛍️ ${actorName} placed Order #${base.order_id || ""}`.trim();
            adminMessage = `${actorName} placed order #${base.order_id || ""}${totalPart}.`;
            adminLink = base.order_id ? `/admin/orders/${base.order_id}` : "/admin/orders";
        }
    } else if (base.type === "DELIVERY_REVIEW") {
        adminTitle = `⭐ ${actorName}'s Order #${base.order_id || ""} was delivered`.trim();
        adminMessage = `${actorName}'s order #${base.order_id || ""} was delivered and is awaiting their product & seller review.`;
        adminLink = base.order_id ? `/admin/orders/${base.order_id}` : "/admin/orders";
    } else if (base.type === "SHIPMENT_UPDATE") {
        adminTitle = `🚚 ${actorName}'s Shipment #${base.order_id || ""} updated`.trim();
        adminMessage = `${actorName}: ${adminMessage}`;
        adminLink = base.order_id ? `/admin/orders/${base.order_id}` : "/admin/shipping";
    } else if (base.type === "SELLER_APPROVAL") {
        adminTitle = `🏪 ${actorName} — ${cleanTitle}`;
        adminMessage = `${actorName}: ${adminMessage}`;
        adminLink = "/admin?tab=sellers";
    } else if (base.type === "PRODUCT_APPROVAL_RESULT") {
        adminTitle = `✅ ${actorName} — ${cleanTitle}`;
        adminMessage = `${actorName}: ${adminMessage}`;
        adminLink = "/admin?tab=inventory";
    } else if (base.type === "SELLER_LOW_STOCK" || base.type === "SELLER_OUT_OF_STOCK") {
        const storeLabel = actorUser?.seller_profile?.store_name || actorName;
        adminTitle =
            base.type === "SELLER_OUT_OF_STOCK"
                ? `🚨 ${actorName}'s (${storeLabel}) product sold out`
                : `⚠️ ${actorName}'s (${storeLabel}) product is low on stock`;
        adminMessage = `${actorName} (${storeLabel}): ${adminMessage}`;
        adminLink =
            base.type === "SELLER_OUT_OF_STOCK"
                ? "/admin?tab=inventory&stock=OUT"
                : "/admin?tab=inventory&stock=LOW";
    } else {
        adminTitle = `${actorName} — ${cleanTitle}`;
        adminMessage = `${actorName}: ${adminMessage}`;
    }

    return {
        ...base,
        title: cleanAccidentalUndefined(adminTitle),
        message: cleanAccidentalUndefined(adminMessage),
        link: adminLink,
        is_mine: false,
        recipient_name: actorName,
        recipient_email: base.user_email || actorUser?.email || "",
        recipient_role: actorUser?.role || "USER",
    };
};

// In-memory throttles & tiny projected caches to keep GET /notifications ultra-fast (<150ms)
const BG_SYNC_COOLDOWN_MS = 5 * 60 * 1000; // Run background Stripe/delivered safety check at most once per 5 min per user
const userBgSyncTimestamps = new Map();

const USER_DIR_CACHE_TTL_MS = 30 * 1000; // 30s cache for tiny projected user directory (no avatars/carts)
let adminUserDirCache = { expiresAt: 0, userById: new Map(), userByEmail: new Map() };

const getProjectedUserDirectory = async () => {
    if (Date.now() < adminUserDirCache.expiresAt && adminUserDirCache.userById.size > 0) {
        return adminUserDirCache;
    }
    const allUsers = await Users.find(
        {},
        {
            _id: 1,
            email: 1,
            first_name: 1,
            last_name: 1,
            role: 1,
            "seller_profile.store_name": 1,
        }
    ).lean();

    const userById = new Map(allUsers.map((u) => [String(u._id), u]));
    const userByEmail = new Map(
        allUsers
            .filter((u) => u.email)
            .map((u) => [String(u.email).toLowerCase(), u])
    );

    adminUserDirCache = {
        expiresAt: Date.now() + USER_DIR_CACHE_TTL_MS,
        userById,
        userByEmail,
    };
    return adminUserDirCache;
};

/**
 * Non-blocking background safety check for legacy unpaid Stripe orders or missed delivery-review notifications.
 * Throttled per user so GET /notifications NEVER stalls waiting on external Stripe HTTPS calls or N+1 DB loops.
 */
const scheduleBackgroundOrderNotificationSync = (user) => {
    const key = String(user?._id || user?.email || "");
    if (!key || !user?.email) return;
    const lastRun = userBgSyncTimestamps.get(key) || 0;
    if (Date.now() - lastRun < BG_SYNC_COOLDOWN_MS) return;
    userBgSyncTimestamps.set(key, Date.now());

    setImmediate(async () => {
        try {
            const userOrders = await Order.find(
                { email: { $regex: `^${user.email}$`, $options: "i" } },
                {
                    order_id: 1,
                    status: 1,
                    stripe_session_id: 1,
                    stripe_session_url: 1,
                    checkout_token_id: 1,
                    name: 1,
                    email: 1,
                    phone_number: 1,
                    address: 1,
                    products: 1,
                    total: 1,
                }
            )
                .sort({ ordered_at: -1 })
                .limit(20)
                .lean();

            if (userOrders.length === 0) return;

            const orderIds = userOrders.map((o) => o.order_id);
            const shipments = await Shipments.find(
                { order_id: { $in: orderIds } },
                { order_id: 1, status: 1 }
            ).lean();
            const shipMap = new Map(shipments.map((s) => [s.order_id, s]));

            for (const ord of userOrders) {
                if (
                    ord.stripe_session_id &&
                    ["CREATED", "ORDER_PLACED", "PENDING_CONFIRMATION"].includes(ord.status)
                ) {
                    try {
                        const stripeSession = await stripe.checkout.sessions.retrieve(
                            ord.stripe_session_id
                        );
                        if (stripeSession && stripeSession.payment_status !== "paid") {
                            await PendingCheckout.findOneAndUpdate(
                                { order_id: ord.order_id },
                                {
                                    order_id: ord.order_id,
                                    checkout_token_id: ord.checkout_token_id,
                                    stripe_session_id: ord.stripe_session_id,
                                    stripe_session_url: ord.stripe_session_url,
                                    payload: {
                                        order_id: ord.order_id,
                                        checkout_token_id: ord.checkout_token_id,
                                        firstName: ord.name?.first || "",
                                        lastName: ord.name?.last || "",
                                        email: ord.email || "",
                                        phone_number: ord.phone_number || "",
                                        address: ord.address,
                                        products: ord.products,
                                        total: String(ord.total || 0),
                                    },
                                    created_at: new Date(),
                                },
                                { upsert: true }
                            );
                            await rollbackOrderData(ord.order_id);
                            continue;
                        }
                    } catch {
                        // ignore Stripe lookup issues in background
                    }
                }

                const shipment = shipMap.get(ord.order_id);
                if (
                    shipment?.status === "DELIVERED" ||
                    shipment?.status === "FULFILLED" ||
                    ord.status === "DELIVERED" ||
                    ord.status === "FULFILLED"
                ) {
                    await triggerDeliveryReviewNotification(ord.order_id);
                }
            }
        } catch {
            // ignore background sync warnings
        }
    });
};

export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.userId || req.body.id;
        const user = await Users.findById(userId, {
            _id: 1,
            email: 1,
            first_name: 1,
            last_name: 1,
            role: 1,
        }).lean();
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isAdmin = user.role === "ADMIN";
        const requestedScope = String(req.query.scope || (isAdmin ? "all" : "mine")).toLowerCase();
        const scope = isAdmin && requestedScope === "all" ? "all" : "mine";
        const requestedLimit = Math.min(200, Math.max(10, Number(req.query.limit) || 40));

        // Fire-and-forget background check (throttled every 5 min) — never blocks this HTTP request
        scheduleBackgroundOrderNotificationSync(user);

        const userIdStr = String(user._id);
        const userEmailLower = String(user.email || "").toLowerCase();
        const mineMatch = (n) =>
            (n.user_id && String(n.user_id) === userIdStr) ||
            (n.user_email && String(n.user_email).toLowerCase() === userEmailLower);

        const rawQuery = isAdmin
            ? {}
            : {
                  $or: [
                      { user_id: userIdStr },
                      { user_email: { $regex: `^${user.email}$`, $options: "i" } },
                  ],
              };

        const fetchLimit = isAdmin
            ? Math.min(220, Math.max(80, requestedLimit + 40))
            : Math.min(120, Math.max(40, requestedLimit + 15));

        const [rawNotifications, userDir] = await Promise.all([
            Notifications.find(rawQuery).sort({ created_at: -1 }).limit(fetchLimit).lean(),
            isAdmin ? getProjectedUserDirectory() : Promise.resolve(null),
        ]);

        // Single batched Order lookup only if notifications reference any orders
        const notifOrderIds = Array.from(
            new Set(rawNotifications.map((n) => n.order_id).filter(Boolean))
        );
        const existingOrdersForNotifs =
            notifOrderIds.length > 0
                ? await Order.find(
                      { order_id: { $in: notifOrderIds } },
                      { order_id: 1, name: 1, total: 1, email: 1 }
                  ).lean()
                : [];
        const orderByIdMap = new Map(existingOrdersForNotifs.map((o) => [o.order_id, o]));

        // Clean up any orphaned order notifications asynchronously so cleanup doesn't add latency
        const orphanedNotifIds = rawNotifications
            .filter((n) => n.order_id && !orderByIdMap.has(n.order_id))
            .map((n) => n._id);
        if (orphanedNotifIds.length > 0) {
            Notifications.deleteMany({ _id: { $in: orphanedNotifIds } }).catch(() => {});
        }

        const validRaw = rawNotifications.filter(
            (n) => !n.order_id || orderByIdMap.has(n.order_id)
        );

        let allFormatted = [];
        if (isAdmin && userDir) {
            const { userById, userByEmail } = userDir;

            // Deduplicate multi-admin copies of admin-broadcast notifications (keep only current admin's own copy)
            const dedupedForAdmin = validRaw.filter((n) => {
                const isMine = mineMatch(n);
                if (!isMine && ADMIN_BROADCAST_TYPES.has(n.type)) {
                    const targetUser =
                        (n.user_id && userById.get(String(n.user_id))) ||
                        (n.user_email && userByEmail.get(String(n.user_email).toLowerCase()));
                    if (targetUser?.role === "ADMIN") {
                        return false;
                    }
                }
                return true;
            });

            allFormatted = dedupedForAdmin.map((n) => {
                const isMine = mineMatch(n);
                const actorUser =
                    (n.user_id && userById.get(String(n.user_id))) ||
                    (n.user_email && userByEmail.get(String(n.user_email).toLowerCase())) ||
                    null;
                const matchedOrder = n.order_id ? orderByIdMap.get(n.order_id) : null;
                const actorName = formatDisplayName(actorUser, n.user_email, matchedOrder);
                return formatNotificationForAdmin(n, {
                    isMine,
                    actorName,
                    actorUser,
                    matchedOrder,
                });
            });
        } else {
            const selfName = formatDisplayName(user, user.email, null);
            allFormatted = validRaw.map((n) => ({
                ...n,
                title: cleanAccidentalUndefined(n.title),
                message: cleanAccidentalUndefined(n.message),
                is_mine: true,
                recipient_name: selfName,
                recipient_email: user.email,
                recipient_role: user.role || "USER",
            }));
        }

        const mineFormatted = allFormatted.filter((n) => n.is_mine);
        const scopedList = (scope === "all" ? allFormatted : mineFormatted).slice(0, requestedLimit);

        const mine_unread_count = mineFormatted.filter((n) => !n.read).length;
        const all_unread_count = allFormatted.filter((n) => !n.read).length;
        const unread_count = scope === "all" ? all_unread_count : mine_unread_count;

        // Only pop up the Delivery Review Modal for the logged-in user's OWN delivered orders!
        const pending_review_notification =
            mineFormatted.find(
                (n) =>
                    n.type === "DELIVERY_REVIEW" &&
                    !n.dismissed_popup &&
                    n.products?.some((p) => !p.reviewed)
            ) || null;

        return res.status(200).json({
            notifications: scopedList,
            unread_count,
            mine_unread_count,
            all_unread_count,
            mine_count: mineFormatted.length,
            all_count: allFormatted.length,
            scope,
            is_admin: isAdmin,
            pending_review_notification,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const markNotificationRead = async (req, res) => {
    try {
        const { id } = req.params;
        const { dismissed_popup } = req.body;

        const update = { read: true };
        if (dismissed_popup !== undefined) {
            update.dismissed_popup = Boolean(dismissed_popup);
        }

        const updated = await Notifications.findByIdAndUpdate(id, update, { new: true });
        return res.status(200).json(updated);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const markAllNotificationsRead = async (req, res) => {
    try {
        const userId = req.userId || req.body.id;
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const scope = String(req.query.scope || req.body?.scope || "mine").toLowerCase();
        const isAdmin = user.role === "ADMIN";

        if (isAdmin && scope === "all") {
            await Notifications.updateMany({}, { read: true });
        } else {
            await Notifications.updateMany(
                {
                    $or: [
                        { user_id: String(user._id) },
                        { user_email: { $regex: `^${user.email}$`, $options: "i" } },
                    ],
                },
                { read: true }
            );
        }

        return res.status(200).json({ message: "Notifications marked as read", scope });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const orderConfirmation = async (req, res) => {
    const { to, order } = req.body;

    try {
        let enrichedOrder = order;
        const prodIds = (order?.products || []).map((p) => p.product_id).filter(Boolean);
        if (prodIds.length > 0) {
            const dbProducts = await Products.find(
                { product_id: { $in: prodIds } },
                { product_id: 1, name: 1, image: 1, category: 1, weight: 1, measurement: 1, price: 1, discounted_price: 1, seller: 1 }
            ).lean();
            const prodMap = new Map(dbProducts.map((p) => [p.product_id, p]));
            enrichedOrder = {
                ...order,
                products: (order.products || []).map((item) => {
                    const db = prodMap.get(item.product_id) || {};
                    return {
                        ...item,
                        name: db.name || item.name || "Grocery Item",
                        image: db.image || item.image || "",
                        category: db.category || item.category || "",
                        weight: db.weight || item.weight || "",
                        measurement: db.measurement || item.measurement || "",
                        price: Number(item.price ?? db.discounted_price ?? db.price ?? 0),
                        seller_name: item.seller_name || db.seller?.name || "",
                    };
                }),
            };
        }

        await sendEmail({
            to,
            subject: `KijaniMart Order Confirmation #${order?.order_id || ""}`,
            text: `Your order #${order?.order_id} has been placed successfully. Your grand total is ${order?.total} KES.`,
            html: orderConfirmationTemplate(enrichedOrder, req.headers.origin),
        });
        res.status(200).json({ to, result: "Sent Successfully" });
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
};
