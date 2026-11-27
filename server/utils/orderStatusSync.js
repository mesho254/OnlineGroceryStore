import mongoose from "mongoose";
import Order, { ORDER_STATUS_ENUM } from "../model/Orders.js";
import Shipments from "../model/Shipments.js";
import Products from "../model/Products.js";
import Users from "../model/Users.js";
import Notifications from "../model/Notifications.js";
import { recordAuditLog } from "../model/AuditLogs.js";
import { syncAdminStockNotificationsForProducts } from "./stockAlerts.js";
import sendEmail from "./sendEmail.js";
import {
    orderStatusUpdateTemplate,
    STATUS_EMAIL_META,
} from "../templates/orderStatusUpdateTemplate.js";
import { WEBSITE_BASE_URL } from "../services/BaseURLs.js";

export const FORWARD_PIPELINE = [
    "ORDER_PLACED",
    "PENDING_CONFIRMATION",
    "WAITING_TO_BE_SHIPPED",
    "SHIPPED",
    "AVAILABLE_FOR_PICKUP",
    "DELIVERED",
];

export const RETURN_PIPELINE = ["RETURN_IN_PROGRESS", "RETURNED", "REFUNDED"];

export const STOCK_RESTORE_STATUSES = [
    "CANCELLED",
    "CANCELLED_PAYMENT_UNSUCCESSFUL",
    "FAILED_DELIVERY",
    "RETURNED",
    "REFUNDED",
];

const STATUS_PROGRESSION_RANK = {
    ORDER_PLACED: 1,
    PENDING_CONFIRMATION: 2,
    WAITING_TO_BE_SHIPPED: 3,
    SHIPPED: 4,
    AVAILABLE_FOR_PICKUP: 5,
    DELIVERED: 6,
    RETURN_IN_PROGRESS: 7,
    RETURNED: 8,
    REFUNDED: 9,
    FAILED_DELIVERY: 10,
    CANCELLED: 10,
    CANCELLED_PAYMENT_UNSUCCESSFUL: 10,
};

const isTransactionUnsupportedError = (err) => {
    const msg = String(err?.message || "");
    return (
        msg.includes("Transaction numbers are only allowed on a replica set") ||
        msg.includes("This MongoDB deployment does not support retryable writes")
    );
};

export const normalizeStatusKey = (st) => {
    if (!st) return "ORDER_PLACED";
    if (st === "CREATED") return "ORDER_PLACED";
    if (st === "PROCESSING") return "WAITING_TO_BE_SHIPPED";
    if (st === "FULFILLED") return "DELIVERED";
    return st;
};

export const buildUpdatedStatusHistory = (existingHistory = [], orderedAt, nextStatus) => {
    const baseDate = orderedAt ? new Date(orderedAt) : new Date();
    const now = new Date();
    const normalizedNext = normalizeStatusKey(nextStatus);

    const existingMap = new Map();
    for (const item of existingHistory || []) {
        if (!item?.status) continue;
        const norm = normalizeStatusKey(item.status);
        if (!existingMap.has(norm)) {
            existingMap.set(norm, {
                status: norm,
                timestamp: item.timestamp || baseDate,
                note: item.note || "",
            });
        }
    }

    const pickEntry = (stepKey, fallbackTime) => {
        if (existingMap.has(stepKey)) {
            return existingMap.get(stepKey);
        }
        return { status: stepKey, timestamp: fallbackTime, note: "" };
    };

    const result = [];

    const forwardIdx = FORWARD_PIPELINE.indexOf(normalizedNext);
    if (forwardIdx >= 0) {
        for (let i = 0; i <= forwardIdx; i++) {
            const stepKey = FORWARD_PIPELINE[i];
            const entry = pickEntry(stepKey, i === forwardIdx ? now : baseDate);
            result.push(i === forwardIdx ? { ...entry, timestamp: now } : entry);
        }
        return result;
    }

    const returnIdx = RETURN_PIPELINE.indexOf(normalizedNext);
    if (returnIdx >= 0) {
        for (const stepKey of FORWARD_PIPELINE) {
            result.push(pickEntry(stepKey, baseDate));
        }
        for (let i = 0; i <= returnIdx; i++) {
            const rStep = RETURN_PIPELINE[i];
            const entry = pickEntry(rStep, now);
            result.push(i === returnIdx ? { ...entry, timestamp: now } : entry);
        }
        return result;
    }

    if (normalizedNext === "FAILED_DELIVERY") {
        for (const stepKey of FORWARD_PIPELINE.slice(0, 5)) {
            result.push(pickEntry(stepKey, baseDate));
        }
        result.push({ status: "FAILED_DELIVERY", timestamp: now, note: "" });
        return result;
    }

    if (normalizedNext === "CANCELLED_PAYMENT_UNSUCCESSFUL") {
        result.push(pickEntry("ORDER_PLACED", baseDate));
        result.push(pickEntry("PENDING_CONFIRMATION", baseDate));
        result.push({ status: "CANCELLED_PAYMENT_UNSUCCESSFUL", timestamp: now, note: "" });
        return result;
    }

    if (normalizedNext === "CANCELLED") {
        result.push(pickEntry("ORDER_PLACED", baseDate));
        result.push(pickEntry("PENDING_CONFIRMATION", baseDate));
        for (const stepKey of FORWARD_PIPELINE.slice(2)) {
            if (existingMap.has(stepKey)) {
                result.push(existingMap.get(stepKey));
            }
        }
        result.push({ status: "CANCELLED", timestamp: now, note: "" });
        return result;
    }

    result.push(pickEntry("ORDER_PLACED", baseDate));
    if (normalizedNext !== "ORDER_PLACED") {
        result.push({ status: normalizedNext, timestamp: now, note: "" });
    }
    return result;
};

const getLatestHistoryTimeForStatus = (history, normalizedStatus) => {
    if (!Array.isArray(history) || history.length === 0) return 0;
    const match = [...history]
        .reverse()
        .find((h) => normalizeStatusKey(h?.status) === normalizedStatus);
    if (!match?.timestamp) return 0;
    const ts = new Date(match.timestamp).getTime();
    return Number.isFinite(ts) ? ts : 0;
};

/**
 * Resolves the single canonical status & status_history for an Order + Shipment pair.
 * If legacy records drifted apart (e.g. Order="PROCESSING" while Shipment="DELIVERED"),
 * automatically reconciles both documents in MongoDB to the authoritative canonical status.
 */
export const reconcileOrderAndShipment = async (order, shipment) => {
    if (!order && !shipment) {
        return { status: "ORDER_PLACED", status_history: [], healed: false };
    }

    const orderRaw = order?.status || null;
    const shipRaw = shipment?.status || null;
    const orderNorm = orderRaw ? normalizeStatusKey(orderRaw) : null;
    const shipNorm = shipRaw ? normalizeStatusKey(shipRaw) : null;

    let canonicalStatus = orderNorm || shipNorm || "ORDER_PLACED";

    if (orderNorm && shipNorm && orderNorm !== shipNorm) {
        const orderHistTs = getLatestHistoryTimeForStatus(order?.status_history, orderNorm);
        const shipHistTs = getLatestHistoryTimeForStatus(shipment?.status_history, shipNorm);

        if (orderHistTs > 0 && shipHistTs > 0 && orderHistTs !== shipHistTs) {
            canonicalStatus = shipHistTs > orderHistTs ? shipNorm : orderNorm;
        } else {
            const orderRank = STATUS_PROGRESSION_RANK[orderNorm] || 0;
            const shipRank = STATUS_PROGRESSION_RANK[shipNorm] || 0;
            canonicalStatus = shipRank >= orderRank ? shipNorm : orderNorm;
        }
    }

    const combinedHistory = [
        ...(Array.isArray(order?.status_history) ? order.status_history : []),
        ...(Array.isArray(shipment?.status_history) ? shipment.status_history : []),
    ];
    const orderedAt = order?.ordered_at || shipment?.ordered_at || new Date();

    const orderNeedsSave =
        Boolean(order) &&
        (order.status !== canonicalStatus ||
            !Array.isArray(order.status_history) ||
            order.status_history.length === 0);

    const shipNeedsSave =
        Boolean(shipment) &&
        (shipment.status !== canonicalStatus ||
            !Array.isArray(shipment.status_history) ||
            shipment.status_history.length === 0);

    let canonicalHistory =
        (order?.status_history?.length ? order.status_history : shipment?.status_history) || [];

    if (orderNeedsSave || shipNeedsSave || canonicalHistory.length === 0) {
        canonicalHistory = buildUpdatedStatusHistory(
            combinedHistory,
            orderedAt,
            canonicalStatus
        );

        const writes = [];
        if (orderNeedsSave) {
            order.status = canonicalStatus;
            order.status_history = canonicalHistory;
            writes.push(
                Order.updateOne(
                    { order_id: order.order_id },
                    { $set: { status: canonicalStatus, status_history: canonicalHistory } }
                )
            );
        }
        if (shipNeedsSave) {
            shipment.status = canonicalStatus;
            shipment.status_history = canonicalHistory;
            writes.push(
                Shipments.updateOne(
                    { order_id: shipment.order_id },
                    { $set: { status: canonicalStatus, status_history: canonicalHistory } }
                )
            );
        }

        if (writes.length > 0) {
            await Promise.all(writes).catch((err) =>
                console.warn("Order/Shipment status reconciliation warning:", err.message)
            );
        }
        return { status: canonicalStatus, status_history: canonicalHistory, healed: true };
    }

    return { status: canonicalStatus, status_history: canonicalHistory, healed: false };
};

/**
 * Reconciles all existing Order & Shipment records on startup so no legacy
 * records ever show conflicting statuses between Order Receipt and Track Shipment.
 */
export const reconcileAllOrderShipmentStatuses = async () => {
    try {
        const [orders, shipments] = await Promise.all([Order.find(), Shipments.find()]);
        const orderMap = new Map(orders.map((o) => [o.order_id, o]));
        const shipMap = new Map(shipments.map((s) => [s.order_id, s]));
        const allIds = new Set([...orderMap.keys(), ...shipMap.keys()]);

        let healedCount = 0;
        for (const orderId of allIds) {
            const res = await reconcileOrderAndShipment(
                orderMap.get(orderId) || null,
                shipMap.get(orderId) || null
            );
            if (res.healed) healedCount++;
        }

        if (healedCount > 0) {
            console.log(
                `Reconciled ${healedCount} Order/Shipment record(s) to unified canonical status.`
            );
        }
    } catch (err) {
        console.warn("Startup order/shipment status reconciliation skipped:", err.message);
    }
};

/**
 * Single atomic unified status transition for BOTH Order and Shipment documents.
 * Called by both PATCH /orders/:id and PATCH /shipping/:id so Order & Shipment
 * can never drift out of sync, stock restoration is atomic & idempotent,
 * and delivery review notifications always fire on DELIVERED.
 */
export const transitionOrderAndShipmentStatus = async ({
    order_id,
    nextStatus,
    actorUser,
    source = "ORDERS",
    origin = "",
}) => {
    if (!ORDER_STATUS_ENUM.includes(nextStatus)) {
        const err = new Error(
            `Invalid status "${nextStatus}". Allowed: ${ORDER_STATUS_ENUM.join(", ")}`
        );
        err.statusCode = 400;
        throw err;
    }

    const canonicalStatus = normalizeStatusKey(nextStatus);
    const shouldRestoreStock = STOCK_RESTORE_STATUSES.includes(canonicalStatus);

    let updatedOrder = null;
    let updatedShipment = null;
    let previousCanonicalStatus = null;

    const executeTransition = async (session = null) => {
        const qOpts = session ? { session } : {};
        const existingOrder = await Order.findOne({ order_id }, null, qOpts);
        const existingShipment = await Shipments.findOne({ order_id }, null, qOpts);

        if (!existingOrder && !existingShipment) {
            return;
        }

        previousCanonicalStatus = normalizeStatusKey(
            existingOrder?.status || existingShipment?.status
        );

        // Atomically restore stock once when transitioning to a cancelled/failed/returned/refunded state
        if (existingOrder && shouldRestoreStock && !existingOrder.stock_restored) {
            for (const item of existingOrder.products || []) {
                if (!item?.product_id) continue;
                const qty = Math.max(1, Number(item.quantity) || 1);
                await Products.findOneAndUpdate(
                    { product_id: item.product_id },
                    { $inc: { stock: qty } },
                    qOpts
                );
            }
            existingOrder.stock_restored = true;
        }

        const baseHistory = [
            ...(Array.isArray(existingOrder?.status_history) ? existingOrder.status_history : []),
            ...(Array.isArray(existingShipment?.status_history)
                ? existingShipment.status_history
                : []),
        ];
        const orderedAt = existingOrder?.ordered_at || existingShipment?.ordered_at || new Date();
        const nextHistory = buildUpdatedStatusHistory(baseHistory, orderedAt, canonicalStatus);

        if (existingOrder) {
            existingOrder.status = canonicalStatus;
            existingOrder.status_history = nextHistory;
            if (Array.isArray(existingOrder.seller_updates) && existingOrder.seller_updates.length > 0) {
                const nowAck = new Date();
                existingOrder.seller_updates = existingOrder.seller_updates.map((su) => {
                    const plain = su.toObject ? su.toObject() : { ...su };
                    if (!plain.admin_acknowledged) {
                        return {
                            ...plain,
                            admin_acknowledged: true,
                            admin_applied_at: nowAck,
                            admin_applied_by: actorUser?.email || "Admin",
                        };
                    }
                    return plain;
                });
            }
            updatedOrder = await existingOrder.save(qOpts);
        }

        if (existingShipment) {
            existingShipment.status = canonicalStatus;
            existingShipment.status_history = nextHistory;
            updatedShipment = await existingShipment.save(qOpts);
        } else if (existingOrder) {
            const created = await Shipments.create(
                [
                    {
                        order_id: existingOrder.order_id,
                        total: existingOrder.total,
                        ordered_at: existingOrder.ordered_at,
                        address: existingOrder.address,
                        status: canonicalStatus,
                        status_history: nextHistory,
                    },
                ],
                qOpts
            );
            updatedShipment = created[0];
        }
    };

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await executeTransition(session);
        });
    } catch (txErr) {
        if (isTransactionUnsupportedError(txErr)) {
            await executeTransition(null);
        } else {
            throw txErr;
        }
    } finally {
        await session.endSession();
    }

    if (!updatedOrder && !updatedShipment) {
        return { notFound: true };
    }

    if (canonicalStatus === "DELIVERED") {
        const { triggerDeliveryReviewNotification } = await import(
            "../controller/notifications/Notifications.js"
        );
        await triggerDeliveryReviewNotification(order_id, origin);
    } else if (updatedOrder?.email && previousCanonicalStatus !== canonicalStatus) {
        // Send both an in-app customer notification AND a rich product-image email for every status transition
        try {
            const prodIds = (updatedOrder.products || [])
                .map((p) => p.product_id)
                .filter(Boolean);
            const [customerUser, dbProducts] = await Promise.all([
                Users.findOne(
                    { email: { $regex: `^${updatedOrder.email}$`, $options: "i" } },
                    { _id: 1, email: 1, first_name: 1, last_name: 1 }
                ).lean(),
                prodIds.length > 0
                    ? Products.find(
                          { product_id: { $in: prodIds } },
                          {
                              product_id: 1,
                              name: 1,
                              image: 1,
                              category: 1,
                              weight: 1,
                              measurement: 1,
                              price: 1,
                              discounted_price: 1,
                              seller: 1,
                          }
                      ).lean()
                    : Promise.resolve([]),
            ]);

            const prodMap = new Map(dbProducts.map((p) => [p.product_id, p]));
            const enrichedProducts = (updatedOrder.products || []).map((item) => {
                const db = prodMap.get(item.product_id) || {};
                return {
                    product_id: item.product_id,
                    name: db.name || item.name || "Grocery Item",
                    image: db.image || item.image || "",
                    category: db.category || "",
                    weight: db.weight || "",
                    measurement: db.measurement || "",
                    quantity: Math.max(1, Number(item.quantity || 1)),
                    price: Number(item.price ?? db.discounted_price ?? db.price ?? 0),
                    seller_name: item.seller_name || db.seller?.name || "",
                };
            });

            const meta = STATUS_EMAIL_META[canonicalStatus] || {
                badge: canonicalStatus.replace(/_/g, " "),
                emoji: "📦",
                headline: `Order #${order_id} Status Updated`,
                summary: `Your order #${order_id} status is now ${canonicalStatus.replace(/_/g, " ")}.`,
            };

            await Notifications.create({
                user_id: customerUser?._id ? String(customerUser._id) : undefined,
                user_email: updatedOrder.email,
                order_id: updatedOrder.order_id,
                type: "SHIPMENT_UPDATE",
                title: `${meta.emoji} Order #${updatedOrder.order_id}: ${meta.badge}`,
                message: meta.summary,
                products: enrichedProducts.map((ep) => ({
                    product_id: ep.product_id,
                    name: ep.name,
                    image: ep.image,
                    seller_name: ep.seller_name,
                    reviewed: false,
                })),
                link: `/shipping/${updatedOrder.order_id}`,
                read: false,
                dismissed_popup: true,
            }).catch((nErr) =>
                console.warn("Customer status-update notification skipped:", nErr.message)
            );

            if (process.env.USER && process.env.PASS) {
                const baseUrl = origin || process.env.WEBSITE_BASE_URL || WEBSITE_BASE_URL;
                const html = orderStatusUpdateTemplate({
                    order: updatedOrder._doc || updatedOrder,
                    status: canonicalStatus,
                    products: enrichedProducts,
                    baseUrl,
                });
                // Fire-and-forget so Admin status clicks respond instantly while customer email dispatches
                sendEmail({
                    to: updatedOrder.email,
                    subject: `${meta.emoji} FreshMart Order #${updatedOrder.order_id} — ${meta.badge}`,
                    text: `${meta.headline} (Order #${updatedOrder.order_id}). ${meta.summary}`,
                    html,
                }).catch((eErr) =>
                    console.warn("Customer status-update email skipped:", eErr.message)
                );
            }
        } catch (notifyErr) {
            console.warn("Order status customer alert skipped:", notifyErr.message);
        }
    }

    if (shouldRestoreStock && updatedOrder?.products?.length) {
        await syncAdminStockNotificationsForProducts(
            updatedOrder.products.map((p) => p.product_id).filter(Boolean),
            { logAudit: false }
        );
    }

    await recordAuditLog({
        action: `${source === "SHIPPING" ? "SHIPMENT" : "ORDER"}_STATUS_${canonicalStatus}`,
        category: source === "SHIPPING" ? "SHIPPING" : "ORDERS",
        severity: STOCK_RESTORE_STATUSES.includes(canonicalStatus)
            ? "DANGER"
            : canonicalStatus === "DELIVERED"
            ? "SUCCESS"
            : "INFO",
        actor_email: actorUser?.email || "",
        actor_name:
            [actorUser?.first_name, actorUser?.last_name].filter(Boolean).join(" ") || "Admin",
        target_id: order_id,
        details: `Order & Shipment #${order_id} unified status synced to ${canonicalStatus}.`,
    });

    return {
        notFound: false,
        order: updatedOrder,
        shipment: updatedShipment,
        status: canonicalStatus,
    };
};
