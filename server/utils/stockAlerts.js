import Products from "../model/Products.js";
import Users from "../model/Users.js";
import Notifications from "../model/Notifications.js";
import { PendingCheckout } from "../model/Orders.js";
import { recordAuditLog } from "../model/AuditLogs.js";

export const LOW_STOCK_THRESHOLD = 10;
export const CHECKOUT_RESERVATION_WINDOW_MS = 5 * 60 * 1000; // 5-minute active checkout hold

/**
 * Returns a Map<product_id, reservedQty> of quantities currently held in active
 * unexpired Stripe checkout sessions started by OTHER shoppers within the last 5 minutes.
 */
export const getActiveCheckoutReservations = async (
    productIds = [],
    excludeCheckoutTokenId = null
) => {
    const reservedMap = new Map();
    const cutoff = new Date(Date.now() - CHECKOUT_RESERVATION_WINDOW_MS);

    const query = {
        created_at: { $gte: cutoff },
    };
    if (excludeCheckoutTokenId) {
        query.checkout_token_id = { $ne: excludeCheckoutTokenId };
    }

    const activePending = await PendingCheckout.find(query);
    const filterSet =
        Array.isArray(productIds) && productIds.length > 0 ? new Set(productIds) : null;

    for (const pending of activePending) {
        const items = Array.isArray(pending?.payload?.products) ? pending.payload.products : [];
        for (const item of items) {
            if (!item?.product_id) continue;
            if (filterSet && !filterSet.has(item.product_id)) continue;
            const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
            reservedMap.set(item.product_id, (reservedMap.get(item.product_id) || 0) + qty);
        }
    }

    return reservedMap;
};

/**
 * Checks live MongoDB stock minus active checkout holds by other users.
 * Throws a 409 error with detailed product info if any requested item cannot be fulfilled.
 */
export const verifyLiveAvailableStock = async (products, excludeCheckoutTokenId = null) => {
    const qtyByProductId = new Map();
    for (const item of products || []) {
        if (!item?.product_id) continue;
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        qtyByProductId.set(item.product_id, (qtyByProductId.get(item.product_id) || 0) + qty);
    }

    const productIds = Array.from(qtyByProductId.keys());
    if (productIds.length === 0) return;

    const [dbProducts, reservedMap] = await Promise.all([
        Products.find({ product_id: { $in: productIds } }),
        getActiveCheckoutReservations(productIds, excludeCheckoutTokenId),
    ]);
    const dbMap = new Map(dbProducts.map((p) => [p.product_id, p]));

    for (const [productId, requestedQty] of qtyByProductId.entries()) {
        const dbProduct = dbMap.get(productId);
        if (!dbProduct || dbProduct.is_deleted) {
            const err = new Error(`Product "${productId}" is no longer available.`);
            err.statusCode = 404;
            err.code = "PRODUCT_NOT_FOUND";
            err.product_id = productId;
            throw err;
        }

        const totalStock = Math.max(0, Number(dbProduct.stock || 0));
        const reservedByOthers = reservedMap.get(productId) || 0;
        const effectiveAvailable = Math.max(0, totalStock - reservedByOthers);

        if (totalStock <= 0) {
            const err = new Error(
                `"${dbProduct.name}" just sold out (0 left in stock). Please remove it from your cart before checking out.`
            );
            err.statusCode = 409;
            err.code = "OUT_OF_STOCK";
            err.product_id = productId;
            err.available_stock = 0;
            throw err;
        }

        if (effectiveAvailable <= 0 && reservedByOthers > 0) {
            const err = new Error(
                `The last remaining unit(s) of "${dbProduct.name}" are currently reserved in another shopper's active checkout. Please try again shortly or remove it from your cart.`
            );
            err.statusCode = 409;
            err.code = "RESERVED_IN_CHECKOUT";
            err.product_id = productId;
            err.available_stock = 0;
            err.reserved_stock = reservedByOthers;
            throw err;
        }

        if (effectiveAvailable < requestedQty) {
            const err = new Error(
                `Only ${effectiveAvailable} unit(s) of "${dbProduct.name}" available right now (you requested ${requestedQty}). Please reduce the quantity in your cart.`
            );
            err.statusCode = 409;
            err.code = "INSUFFICIENT_STOCK";
            err.product_id = productId;
            err.available_stock = effectiveAvailable;
            err.reserved_stock = reservedByOthers;
            throw err;
        }
    }
};

/**
 * Synchronizes LOW_STOCK (<= 10) and OUT_OF_STOCK (0) notifications for all ADMIN users,
 * and auto-clears notifications once a product has been restocked above the threshold.
 */
export const syncAdminStockNotificationsForProducts = async (
    productIds = null,
    { logAudit = false } = {}
) => {
    try {
        const admins = await Users.find(
            { role: "ADMIN", is_deleted: { $ne: true }, account_status: { $ne: "SUSPENDED" } },
            { _id: 1, email: 1 }
        );
        if (!admins.length) return;

        const targetProducts =
            Array.isArray(productIds) && productIds.length > 0
                ? await Products.find({ product_id: { $in: productIds } })
                : await Products.find({
                      stock: { $lte: LOW_STOCK_THRESHOLD },
                      is_deleted: { $ne: true },
                  });

        // If running a full scan (productIds === null), clean up any existing stock alerts for products now > LOW_STOCK_THRESHOLD or trashed
        if (!productIds) {
            const alertIds = new Set(targetProducts.map((p) => p.product_id));
            const existingAlerts = await Notifications.find(
                { type: { $in: ["LOW_STOCK", "OUT_OF_STOCK"] } },
                { _id: 1, product_id: 1 }
            );
            const resolvedIds = existingAlerts
                .filter((n) => n.product_id && !alertIds.has(n.product_id))
                .map((n) => n._id);
            if (resolvedIds.length > 0) {
                await Notifications.deleteMany({ _id: { $in: resolvedIds } });
            }
        }

        for (const prod of targetProducts) {
            const stock = Math.max(0, Number(prod.stock || 0));

            if (prod.is_deleted || stock > LOW_STOCK_THRESHOLD) {
                // Product trashed or restocked — remove stale low/out-of-stock notifications
                await Notifications.deleteMany({
                    product_id: prod.product_id,
                    type: { $in: ["LOW_STOCK", "OUT_OF_STOCK"] },
                });
                continue;
            }

            const isOut = stock <= 0;
            const alertType = isOut ? "OUT_OF_STOCK" : "LOW_STOCK";
            const oppositeType = isOut ? "LOW_STOCK" : "OUT_OF_STOCK";

            // Remove opposite severity alert for this product
            await Notifications.deleteMany({
                product_id: prod.product_id,
                type: oppositeType,
            });

            const title = isOut
                ? `🚨 Sold Out: ${prod.name}`
                : `⚠️ Low Stock: ${prod.name} (${stock} left)`;
            const message = isOut
                ? `"${prod.name}" (#${prod.product_id}) is now OUT OF STOCK (0 units left). Restock immediately in Inventory Manager.`
                : `"${prod.name}" (#${prod.product_id}) has only ${stock} unit${
                      stock === 1 ? "" : "s"
                  } remaining in stock. Restock soon.`;
            const link = isOut ? "/admin?tab=inventory&stock=OUT" : "/admin?tab=inventory&stock=LOW";

            for (const admin of admins) {
                const adminId = String(admin._id);
                const existing = await Notifications.findOne({
                    user_id: adminId,
                    product_id: prod.product_id,
                    type: alertType,
                });

                if (existing) {
                    // Only re-mark unread if the stock number changed (e.g. dropped from 5 -> 1)
                    if (existing.title !== title || existing.message !== message) {
                        existing.title = title;
                        existing.message = message;
                        existing.link = link;
                        existing.read = false;
                        existing.created_at = new Date();
                        await existing.save();
                    }
                } else {
                    await Notifications.create({
                        user_id: adminId,
                        user_email: admin.email,
                        product_id: prod.product_id,
                        type: alertType,
                        title,
                        message,
                        link,
                        read: false,
                        dismissed_popup: true,
                    });
                }
            }

            if (logAudit) {
                await recordAuditLog({
                    action: isOut ? "INVENTORY_OUT_OF_STOCK" : "INVENTORY_LOW_STOCK",
                    category: "INVENTORY",
                    severity: isOut ? "DANGER" : "WARNING",
                    actor_email: "system@freshmart.co.ke",
                    actor_name: "Inventory Monitor",
                    target_id: prod.product_id,
                    details: message,
                });
            }
        }

        // Also keep seller-specific low-stock alerts synced ONLY for each seller's own APPROVED products
        await syncSellerStockNotificationsForProducts(productIds);
    } catch (err) {
        console.warn("Admin stock notification sync warning:", err.message);
    }
};

/**
 * Synchronizes SELLER_LOW_STOCK (<= 10) and SELLER_OUT_OF_STOCK (0) notifications strictly
 * for the owning seller of APPROVED (published) seller products only.
 * Unpublished (PENDING_APPROVAL / REJECTED) or restocked (> 10) products automatically clear stale alerts.
 */
export const syncSellerStockNotificationsForProducts = async (
    productIds = null,
    sellerIdFilter = null
) => {
    try {
        const baseQuery = {
            "seller.seller_id": sellerIdFilter
                ? String(sellerIdFilter)
                : { $exists: true, $ne: "" },
        };

        const targetProducts =
            Array.isArray(productIds) && productIds.length > 0
                ? await Products.find({ ...baseQuery, product_id: { $in: productIds } })
                : await Products.find(baseQuery);

        const sellerIds = Array.from(
            new Set(targetProducts.map((p) => p.seller?.seller_id).filter(Boolean))
        );
        const sellerUsers =
            sellerIds.length > 0
                ? await Users.find({ _id: { $in: sellerIds } }, { _id: 1, email: 1 })
                : [];
        const sellerMap = new Map(sellerUsers.map((u) => [String(u._id), u]));

        const activeApprovedLowIds = new Set();

        for (const prod of targetProducts) {
            const ownerId = prod.seller?.seller_id;
            if (!ownerId) continue;

            const isApproved =
                !prod.is_deleted &&
                (!prod.approval_status || prod.approval_status === "APPROVED");
            const stock = Math.max(0, Number(prod.stock || 0));

            // Only alert sellers for their own APPROVED products that are at or below threshold
            if (!isApproved || stock > LOW_STOCK_THRESHOLD) {
                await Notifications.deleteMany({
                    user_id: String(ownerId),
                    product_id: prod.product_id,
                    type: { $in: ["SELLER_LOW_STOCK", "SELLER_OUT_OF_STOCK"] },
                });
                continue;
            }

            activeApprovedLowIds.add(prod.product_id);
            const ownerUser = sellerMap.get(String(ownerId));
            const ownerEmail = ownerUser?.email || prod.seller?.email || "";

            const isOut = stock <= 0;
            const alertType = isOut ? "SELLER_OUT_OF_STOCK" : "SELLER_LOW_STOCK";
            const oppositeType = isOut ? "SELLER_LOW_STOCK" : "SELLER_OUT_OF_STOCK";

            await Notifications.deleteMany({
                user_id: String(ownerId),
                product_id: prod.product_id,
                type: oppositeType,
            });

            const title = isOut
                ? `🚨 Your Product Sold Out: ${prod.name}`
                : `⚠️ Low Stock on Your Product: ${prod.name} (${stock} left)`;
            const message = isOut
                ? `Your published product "${prod.name}" (#${prod.product_id}) is out of stock (0 units left). Submit a stock update in My Products for Admin approval.`
                : `Your published product "${prod.name}" (#${prod.product_id}) has only ${stock} unit${
                      stock === 1 ? "" : "s"
                  } left. Restock soon so you don't miss orders.`;
            const link = "/seller?tab=products";

            const existing = await Notifications.findOne({
                user_id: String(ownerId),
                product_id: prod.product_id,
                type: alertType,
            });

            if (existing) {
                if (existing.title !== title || existing.message !== message) {
                    existing.title = title;
                    existing.message = message;
                    existing.link = link;
                    existing.read = false;
                    existing.created_at = new Date();
                    await existing.save();
                }
            } else {
                await Notifications.create({
                    user_id: String(ownerId),
                    user_email: ownerEmail,
                    product_id: prod.product_id,
                    type: alertType,
                    title,
                    message,
                    link,
                    read: false,
                    dismissed_popup: true,
                });
            }
        }

        // On full sweep, remove any orphaned seller stock alerts for deleted products
        if (!productIds) {
            const cleanupQuery = {
                type: { $in: ["SELLER_LOW_STOCK", "SELLER_OUT_OF_STOCK"] },
                ...(sellerIdFilter ? { user_id: String(sellerIdFilter) } : {}),
            };
            const existingSellerAlerts = await Notifications.find(cleanupQuery, {
                _id: 1,
                product_id: 1,
            });
            const toDelete = existingSellerAlerts
                .filter((n) => n.product_id && !activeApprovedLowIds.has(n.product_id))
                .map((n) => n._id);
            if (toDelete.length > 0) {
                await Notifications.deleteMany({ _id: { $in: toDelete } });
            }
        }
    } catch (err) {
        console.warn("Seller stock notification sync warning:", err.message);
    }
};
