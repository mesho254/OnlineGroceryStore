import { v2 as cloudinary } from "cloudinary";
import Order from "../../model/Orders.js";
import Products from "../../model/Products.js";
import Shipments from "../../model/Shipments.js";
import Users from "../../model/Users.js";
import PickupStations from "../../model/PickupStations.js";
import Notifications from "../../model/Notifications.js";
import UserInteractions from "../../model/UserInteractions.js";
import AuditLogs, { recordAuditLog } from "../../model/AuditLogs.js";
import { calculateEffectivePrice } from "../products/Products.js";
import { reconcileOrderAndShipment } from "../../utils/orderStatusSync.js";
import {
    LOW_STOCK_THRESHOLD,
    syncAdminStockNotificationsForProducts,
    syncSellerStockNotificationsForProducts,
} from "../../utils/stockAlerts.js";
import {
    getLowStockCronStatus,
    runLowStockMonitorSweep,
} from "../../jobs/stockMonitorCron.js";
import {
    PRODUCT_TRASH_RETENTION_DAYS,
    USER_GDPR_RETENTION_DAYS,
    computeProductPurgeDate,
    computeUserGdprRetainDate,
    getTrashPurgeCronStatus,
    runTrashPurgeSweep,
} from "../../jobs/trashPurgeCron.js";

const ACTIVE_USER_FILTER = {
    is_deleted: { $ne: true },
    account_status: { $ne: "SUSPENDED" },
};

const ACTIVE_PRODUCT_FILTER = {
    is_deleted: { $ne: true },
};

const ensureAdminUser = async (userId) => {
    if (!userId) return null;
    const user = await Users.findById(userId, { password: 0 });
    if (!user || user.role !== "ADMIN" || user.is_deleted || user.account_status === "SUSPENDED")
        return null;
    return user;
};

const seedInitialAuditLogsIfNeeded = async (orders, shipments, products, adminUser) => {
    const count = await AuditLogs.countDocuments();
    if (count > 0) return;

    const actorEmail = adminUser?.email || "admin@freshmart.co.ke";
    const actorName =
        [adminUser?.first_name, adminUser?.last_name].filter(Boolean).join(" ") || "Store Admin";

    const entries = [
        {
            action: "CATALOG_INITIALIZED",
            category: "INVENTORY",
            severity: "SUCCESS",
            actor_email: actorEmail,
            actor_name: actorName,
            target_id: "CATALOG-50",
            details: `Active supermarket catalog verified with ${products.length} grocery items across 8 categories.`,
            created_at: new Date(Date.now() - 3600 * 1000 * 12),
        },
        {
            action: "ACID_TRANSACTION_GUARD_ACTIVE",
            category: "SYSTEM",
            severity: "INFO",
            actor_email: "system@freshmart.co.ke",
            actor_name: "MongoDB Transaction Engine",
            target_id: "REPLICA-SET",
            details: "Multi-document ACID transactions and conditional stock concurrency locks enabled for checkout.",
            created_at: new Date(Date.now() - 3600 * 1000 * 6),
        },
    ];

    for (const ord of orders.slice(0, 6)) {
        entries.push({
            action: `ORDER_${ord.status || "CREATED"}`,
            category: "ORDERS",
            severity: ord.status === "CANCELLED" ? "DANGER" : "SUCCESS",
            actor_email: ord.email || actorEmail,
            actor_name:
                [ord.name?.first, ord.name?.last].filter(Boolean).join(" ") || "Customer",
            target_id: ord.order_id,
            details: `Order #${ord.order_id} (${ord.total} KES) status is ${ord.status || "CREATED"}.`,
            created_at: ord.ordered_at || new Date(),
        });
    }

    for (const sh of shipments.slice(0, 5)) {
        entries.push({
            action: `SHIPMENT_${sh.status || "CREATED"}`,
            category: "SHIPPING",
            severity: sh.status === "DELIVERED" ? "SUCCESS" : "INFO",
            actor_email: actorEmail,
            actor_name: "Dispatch Hub",
            target_id: sh.order_id,
            details: `Shipment #${sh.order_id} dispatch status is ${sh.status || "CREATED"} (${
                sh.address?.delivery_method === "PICKUP_STATION" ? "Pickup Hub" : "Doorstep"
            }).`,
            created_at: sh.ordered_at || new Date(),
        });
    }

    await AuditLogs.insertMany(entries).catch(() => {});
};

export const getAdminOverview = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const [
            orders,
            products,
            shipments,
            users,
            pickupStations,
            trashedProductsCount,
            trashedUsersCount,
        ] = await Promise.all([
            Order.find().sort({ ordered_at: -1 }),
            Products.find(ACTIVE_PRODUCT_FILTER).sort({ stock: 1 }),
            Shipments.find().sort({ ordered_at: -1 }),
            Users.find(ACTIVE_USER_FILTER, { password: 0 }),
            PickupStations.find(),
            Products.countDocuments({ is_deleted: true }),
            Users.countDocuments({
                $or: [{ is_deleted: true }, { account_status: "SUSPENDED" }],
            }),
        ]);

        const shipByOrderId = new Map(shipments.map((s) => [s.order_id, s]));
        await Promise.all(
            orders.map((ord) => reconcileOrderAndShipment(ord, shipByOrderId.get(ord.order_id)))
        );

        await seedInitialAuditLogsIfNeeded(orders, shipments, products, adminUser);
        const recentLogs = await AuditLogs.find().sort({ created_at: -1 }).limit(12);

        const CANCELLED_SET = new Set([
            "CANCELLED",
            "CANCELLED_PAYMENT_UNSUCCESSFUL",
            "FAILED_DELIVERY",
            "RETURNED",
            "REFUNDED",
        ]);
        const FULFILLED_SET = new Set(["FULFILLED", "DELIVERED"]);
        const PROCESSING_SET = new Set([
            "PROCESSING",
            "WAITING_TO_BE_SHIPPED",
            "SHIPPED",
            "AVAILABLE_FOR_PICKUP",
            "RETURN_IN_PROGRESS",
        ]);

        const validOrders = orders.filter((o) => !CANCELLED_SET.has(o.status));
        const totalRevenue = Number(
            validOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(2)
        );
        const avgOrderValue =
            validOrders.length > 0
                ? Number((totalRevenue / validOrders.length).toFixed(2))
                : 0;

        const ordersSummary = {
            CREATED: 0,
            PROCESSING: 0,
            FULFILLED: 0,
            CANCELLED: 0,
        };
        const deliveryMethodSplit = {
            DOORSTEP: 0,
            PICKUP_STATION: 0,
        };

        for (const o of orders) {
            const st = o.status || "ORDER_PLACED";
            if (FULFILLED_SET.has(st)) ordersSummary.FULFILLED += 1;
            else if (CANCELLED_SET.has(st)) ordersSummary.CANCELLED += 1;
            else if (PROCESSING_SET.has(st)) ordersSummary.PROCESSING += 1;
            else ordersSummary.CREATED += 1;

            const dm =
                o.address?.delivery_method === "PICKUP_STATION"
                    ? "PICKUP_STATION"
                    : "DOORSTEP";
            deliveryMethodSplit[dm] += 1;
        }

        const shipmentsSummary = {
            CREATED: 0,
            SHIPPED: 0,
            DELIVERED: 0,
            RETURNED: 0,
        };
        const shipmentMap = new Map();
        for (const s of shipments) {
            const st = s.status || "ORDER_PLACED";
            if (FULFILLED_SET.has(st)) shipmentsSummary.DELIVERED += 1;
            else if (CANCELLED_SET.has(st)) shipmentsSummary.RETURNED += 1;
            else if (st === "SHIPPED" || st === "AVAILABLE_FOR_PICKUP")
                shipmentsSummary.SHIPPED += 1;
            else shipmentsSummary.CREATED += 1;
            shipmentMap.set(s.order_id, s);
        }

        // Build 7-day revenue & orders trend series for Recharts
        const days = [];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(now.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString("en-KE", {
                weekday: "short",
                day: "numeric",
                month: "short",
            });
            days.push({
                dateKey: key,
                day: label,
                revenue: 0,
                orders: 0,
                items_sold: 0,
            });
        }
        const dayMap = new Map(days.map((d) => [d.dateKey, d]));

        for (const ord of validOrders) {
            if (!ord.ordered_at) continue;
            const dKey = new Date(ord.ordered_at).toISOString().slice(0, 10);
            const bucket = dayMap.get(dKey);
            if (bucket) {
                bucket.revenue = Number((bucket.revenue + (Number(ord.total) || 0)).toFixed(2));
                bucket.orders += 1;
                const itemCount = (ord.products || []).reduce(
                    (s, p) => s + (Number(p.quantity) || 1),
                    0
                );
                bucket.items_sold += itemCount;
            }
        }

        // Category breakdown for Recharts BarChart & PieChart
        const categoryMap = new Map();
        let lowStockCount = 0;
        let outOfStockCount = 0;
        let flashSaleCount = 0;
        let totalInventoryValue = 0;
        let totalStockUnits = 0;

        for (const p of products) {
            const cat = p.category || "Uncategorized";
            const stock = Number(p.stock || 0);
            const effectivePrice = calculateEffectivePrice(p);
            const stockVal = Number((stock * effectivePrice).toFixed(2));

            if (stock <= 0) outOfStockCount += 1;
            else if (stock <= LOW_STOCK_THRESHOLD) lowStockCount += 1;
            if (p.flash_sale) flashSaleCount += 1;

            totalInventoryValue += stockVal;
            totalStockUnits += stock;

            if (!categoryMap.has(cat)) {
                categoryMap.set(cat, {
                    category: cat,
                    short_name: cat.split(" ").slice(0, 2).join(" "),
                    products_count: 0,
                    total_stock: 0,
                    inventory_value: 0,
                    avg_price: 0,
                    price_sum: 0,
                });
            }
            const entry = categoryMap.get(cat);
            entry.products_count += 1;
            entry.total_stock += stock;
            entry.inventory_value = Number((entry.inventory_value + stockVal).toFixed(2));
            entry.price_sum += effectivePrice;
            entry.avg_price = Number((entry.price_sum / entry.products_count).toFixed(2));
        }

        const categoryDistribution = Array.from(categoryMap.values()).map(
            ({ price_sum, ...rest }) => rest
        );

        const orderStatusChart = [
            { name: "Created", value: ordersSummary.CREATED, color: "#3b82f6" },
            { name: "Processing", value: ordersSummary.PROCESSING, color: "#f59e0b" },
            { name: "Fulfilled", value: ordersSummary.FULFILLED, color: "#10b981" },
            { name: "Cancelled", value: ordersSummary.CANCELLED, color: "#ef4444" },
        ];

        const shipmentStatusChart = [
            { name: "Created", value: shipmentsSummary.CREATED, color: "#6366f1" },
            { name: "Shipped", value: shipmentsSummary.SHIPPED, color: "#f59e0b" },
            { name: "Delivered", value: shipmentsSummary.DELIVERED, color: "#10b981" },
            { name: "Returned", value: shipmentsSummary.RETURNED, color: "#ef4444" },
        ];

        const lowStockProducts = products
            .filter((p) => Number(p.stock || 0) <= 25)
            .slice(0, 12)
            .map((p) => ({
                product_id: p.product_id,
                name: p.name,
                category: p.category,
                image: p.image,
                stock: Number(p.stock || 0),
                price: p.price,
                discount: p.discount || 0,
            }));

        const criticalStockAlerts = products
            .filter((p) => Number(p.stock || 0) <= LOW_STOCK_THRESHOLD)
            .map((p) => ({
                product_id: p.product_id,
                name: p.name,
                category: p.category,
                image: p.image,
                stock: Number(p.stock || 0),
                severity: Number(p.stock || 0) <= 0 ? "OUT_OF_STOCK" : "LOW_STOCK",
            }));

        const topRatedProducts = [...products]
            .sort(
                (a, b) =>
                    (Number(b.reviews_count) || 0) * (Number(b.rating) || 4.8) -
                    (Number(a.reviews_count) || 0) * (Number(a.rating) || 4.8)
            )
            .slice(0, 6)
            .map((p) => ({
                product_id: p.product_id,
                name: p.name,
                category: p.category,
                image: p.image,
                rating: p.rating || 4.8,
                reviews_count: p.reviews_count || (p.reviews?.length ?? 0),
                price: p.price,
                stock: p.stock,
            }));

        const recentOrders = orders.slice(0, 8).map((o) => {
            const sh = shipmentMap.get(o.order_id);
            return {
                order_id: o.order_id,
                customer_name:
                    [o.name?.first, o.name?.last].filter(Boolean).join(" ") ||
                    o.email ||
                    "Customer",
                email: o.email,
                total: o.total,
                items_count: (o.products || []).reduce(
                    (s, p) => s + (Number(p.quantity) || 1),
                    0
                ),
                status: o.status || "CREATED",
                shipment_status: sh?.status || "CREATED",
                delivery_method: o.address?.delivery_method || "DOORSTEP",
                ordered_at: o.ordered_at,
            };
        });

        return res.status(200).json({
            kpis: {
                total_revenue: totalRevenue,
                total_orders: orders.length,
                avg_order_value: avgOrderValue,
                fulfilled_orders: ordersSummary.FULFILLED,
                pending_orders: ordersSummary.CREATED + ordersSummary.PROCESSING,
                cancelled_orders: ordersSummary.CANCELLED,
                total_products: products.length,
                total_stock_units: totalStockUnits,
                total_inventory_value: Number(totalInventoryValue.toFixed(2)),
                low_stock_count: lowStockCount,
                out_of_stock_count: outOfStockCount,
                flash_sale_count: flashSaleCount,
                total_users: users.length,
                admin_users_count: users.filter((u) => u.role === "ADMIN").length,
                customer_users_count: users.filter((u) => u.role === "USER").length,
                approved_sellers_count: users.filter(
                    (u) => u.seller_profile?.status === "APPROVED"
                ).length,
                pending_sellers_count: users.filter(
                    (u) => u.seller_profile?.status === "PENDING"
                ).length,
                pending_seller_order_updates: orders.filter((o) =>
                    (o.seller_updates || []).some((u) => !u.admin_acknowledged)
                ).length,
                pending_products_count: products.filter(
                    (p) => p.approval_status === "PENDING_APPROVAL"
                ).length,
                pending_product_edits_count: products.filter((p) => Boolean(p.pending_changes))
                    .length,
                trashed_products_count: trashedProductsCount,
                trashed_users_count: trashedUsersCount,
                pickup_stations_count: pickupStations.length,
                delivered_shipments: shipmentsSummary.DELIVERED,
                in_transit_shipments: shipmentsSummary.SHIPPED,
            },
            orders_summary: ordersSummary,
            shipments_summary: shipmentsSummary,
            delivery_method_split: deliveryMethodSplit,
            charts: {
                revenue_trend: days,
                category_distribution: categoryDistribution,
                order_status_distribution: orderStatusChart,
                shipment_status_distribution: shipmentStatusChart,
            },
            low_stock_products: lowStockProducts,
            critical_stock_alerts: criticalStockAlerts,
            low_stock_threshold: LOW_STOCK_THRESHOLD,
            stock_monitor_cron: getLowStockCronStatus(),
            trash_purge_cron: getTrashPurgeCronStatus(),
            top_rated_products: topRatedProducts,
            recent_orders: recentOrders,
            recent_logs: recentLogs,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAdminUsers = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const [users, orders] = await Promise.all([
            Users.find(ACTIVE_USER_FILTER, { password: 0 }).sort({ _id: -1 }),
            Order.find(),
        ]);

        const statsByEmail = new Map();
        for (const ord of orders) {
            const em = String(ord.email || "").toLowerCase();
            if (!em) continue;
            if (!statsByEmail.has(em)) {
                statsByEmail.set(em, { orders_count: 0, total_spent: 0, last_order_at: null });
            }
            const st = statsByEmail.get(em);
            st.orders_count += 1;
            if (ord.status !== "CANCELLED") {
                st.total_spent = Number((st.total_spent + (Number(ord.total) || 0)).toFixed(2));
            }
            if (!st.last_order_at || new Date(ord.ordered_at) > new Date(st.last_order_at)) {
                st.last_order_at = ord.ordered_at;
            }
        }

        const enrichedUsers = users.map((u) => {
            const em = String(u.email || "").toLowerCase();
            const ordStats = statsByEmail.get(em) || {
                orders_count: 0,
                total_spent: 0,
                last_order_at: null,
            };
            return {
                _id: u._id,
                first_name: u.first_name,
                last_name: u.last_name,
                email: u.email,
                phone: u.phone || "",
                avatar: u.avatar || "",
                role: u.role || "USER",
                wishlist_count: Array.isArray(u.wishlist) ? u.wishlist.length : 0,
                cart_count: Array.isArray(u.cart)
                    ? u.cart.reduce((s, c) => s + (Number(c.quantity) || 1), 0)
                    : 0,
                orders_count: ordStats.orders_count,
                total_spent: ordStats.total_spent,
                last_order_at: ordStats.last_order_at,
            };
        });

        return res.status(200).json(enrichedUsers);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateAdminUserRole = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { userId } = req.params;
        const { role } = req.body;

        if (!["USER", "ADMIN"].includes(role)) {
            return res.status(400).json({ message: "Role must be USER or ADMIN" });
        }

        if (String(adminUser._id) === String(userId) && role !== "ADMIN") {
            return res.status(400).json({
                message: "You cannot demote your own currently logged-in admin account.",
            });
        }

        const updatedUser = await Users.findByIdAndUpdate(
            userId,
            { role },
            { new: true, projection: { password: 0 } }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: "User not found" });
        }

        await recordAuditLog({
            action: "USER_ROLE_CHANGED",
            category: "USERS",
            severity: role === "ADMIN" ? "WARNING" : "INFO",
            actor_email: adminUser.email,
            actor_name: `${adminUser.first_name} ${adminUser.last_name}`,
            target_id: updatedUser.email,
            details: `Changed role for ${updatedUser.first_name} ${updatedUser.last_name} (${updatedUser.email}) to ${role}.`,
        });

        return res.status(200).json(updatedUser);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const deleteAdminUser = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { userId } = req.params;
        const { reason = "" } = req.body || {};

        if (String(adminUser._id) === String(userId)) {
            return res.status(400).json({
                message: "You cannot suspend your own currently logged-in admin account from here.",
            });
        }

        const targetUser = await Users.findById(userId);
        if (!targetUser) {
            return res.status(404).json({ message: "User not found" });
        }

        const now = new Date();
        const retainUntil = computeUserGdprRetainDate(now);
        const cleanReason =
            String(reason || "").trim() || `Account suspended by Admin (${adminUser.email})`;

        targetUser.account_status = "SUSPENDED";
        targetUser.is_deleted = true;
        targetUser.deleted_at = now;
        targetUser.deleted_by = adminUser.email;
        targetUser.suspension_reason = cleanReason;
        targetUser.gdpr_retain_until = retainUntil;
        targetUser.refresh_tokens = [];

        if (targetUser.seller_profile?.status && targetUser.seller_profile.status !== "NONE") {
            targetUser.previous_seller_status = targetUser.seller_profile.status;
            targetUser.seller_profile.status = "SUSPENDED";
        }

        await targetUser.save();

        const targetName =
            [targetUser.first_name, targetUser.last_name].filter(Boolean).join(" ") ||
            targetUser.email;
        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "USER_SUSPENDED_TO_TRASH",
            category: "TRASH",
            severity: "DANGER",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: targetUser.email,
            details: `Suspended user "${targetName}" (${targetUser.email}) to GDPR Trash (retained ${USER_GDPR_RETENTION_DAYS} days until ${retainUntil.toISOString().slice(0, 10)}). Reason: ${cleanReason}.`,
        });

        return res.status(200).json({
            message: `Account "${targetName}" suspended and moved to GDPR Trash (retained ${USER_GDPR_RETENTION_DAYS} days for GDPR compliance; restorable anytime).`,
            _id: userId,
            gdpr_retain_until: retainUntil,
            retention_days: USER_GDPR_RETENTION_DAYS,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAdminInventory = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const products = await Products.find(ACTIVE_PRODUCT_FILTER).sort({
            created_at: -1,
            _id: -1,
        });
        // Surface PENDING_APPROVAL first, then published products with pending seller edits, then REJECTED, then clean APPROVED (newest first within each group)
        const getPriority = (p) => {
            if (p.approval_status === "PENDING_APPROVAL") return 0;
            if (p.pending_changes) return 1;
            if (p.approval_status === "REJECTED") return 2;
            return 3;
        };
        products.sort((a, b) => {
            const ra = getPriority(a);
            const rb = getPriority(b);
            if (ra !== rb) return ra - rb;
            const timeDiff =
                new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
            if (timeDiff !== 0) return timeDiff;
            return String(b._id || "").localeCompare(String(a._id || ""));
        });
        return res.status(200).json(products);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateAdminProductApproval = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const { approval_status, rejection_reason = "" } = req.body || {};

        if (!["APPROVED", "REJECTED", "PENDING_APPROVAL"].includes(approval_status)) {
            return res.status(400).json({
                message: "approval_status must be APPROVED, REJECTED, or PENDING_APPROVAL.",
            });
        }

        const product = await Products.findOne({ product_id: productId });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        product.approval_status = approval_status;
        product.rejection_reason =
            approval_status === "REJECTED" ? String(rejection_reason || "").trim() : "";
        product.approved_at = approval_status === "APPROVED" ? new Date() : product.approved_at;
        product.approved_by = adminUser.email;
        await product.save();

        if (approval_status === "APPROVED") {
            await syncAdminStockNotificationsForProducts([product.product_id], { logAudit: false });
        } else {
            // Unpublished / rejected products must clear any seller-specific low-stock notifications
            await syncSellerStockNotificationsForProducts([product.product_id]);
        }

        // Notify the owning seller of the publishing decision
        if (product.seller?.seller_id) {
            const sellerUser = await Users.findById(product.seller.seller_id, { email: 1 }).catch(
                () => null
            );
            if (sellerUser) {
                await Notifications.create({
                    user_id: String(sellerUser._id),
                    user_email: sellerUser.email,
                    product_id: product.product_id,
                    type: "PRODUCT_APPROVAL_RESULT",
                    title:
                        approval_status === "APPROVED"
                            ? `✅ Product Published Live: ${product.name}`
                            : approval_status === "REJECTED"
                            ? `Product Not Approved: ${product.name}`
                            : `Product Moved to Pending Review: ${product.name}`,
                    message:
                        approval_status === "APPROVED"
                            ? `Great news! Your product "${product.name}" was approved by Admin and is now live on the FreshMart storefront.`
                            : approval_status === "REJECTED"
                            ? `Your product "${product.name}" was not approved for publishing${
                                  product.rejection_reason
                                      ? `: ${product.rejection_reason}`
                                      : "."
                              } You can edit and resubmit it in your Seller Portal.`
                            : `Your product "${product.name}" was moved back to Pending Publishing review by Admin.`,
                    link: "/seller?tab=products",
                    read: false,
                    dismissed_popup: true,
                }).catch(() => {});
            }
        }

        await recordAuditLog({
            action:
                approval_status === "APPROVED"
                    ? "PRODUCT_APPROVED_PUBLISHED"
                    : approval_status === "REJECTED"
                    ? "PRODUCT_REJECTED"
                    : "PRODUCT_UNPUBLISHED",
            category: "INVENTORY",
            severity: approval_status === "APPROVED" ? "SUCCESS" : "WARNING",
            actor_email: adminUser.email,
            actor_name: `${adminUser.first_name} ${adminUser.last_name}`,
            target_id: product.product_id,
            details: `Admin set "${product.name}" (${product.seller?.name || "Store"}) to ${approval_status}${
                product.rejection_reason ? ` — Reason: ${product.rejection_reason}` : ""
            }.`,
        });

        return res.status(200).json({
            message:
                approval_status === "APPROVED"
                    ? `"${product.name}" approved and published live to customers!`
                    : approval_status === "REJECTED"
                    ? `"${product.name}" marked as rejected (hidden from customers).`
                    : `"${product.name}" set to Pending Publishing (hidden from customers).`,
            product,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const reviewAdminProductPendingChanges = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const { action, rejection_reason = "" } = req.body || {};

        if (!["APPROVE", "REJECT"].includes(action)) {
            return res.status(400).json({ message: "action must be APPROVE or REJECT." });
        }

        const product = await Products.findOne({ product_id: productId });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }
        if (!product.pending_changes) {
            return res.status(400).json({
                message: "This product has no pending seller edits to review.",
            });
        }

        const staged = product.pending_changes;
        const prevName = product.name;

        if (action === "APPROVE") {
            if (staged.name !== undefined) product.name = staged.name;
            if (staged.description !== undefined) product.description = staged.description;
            if (staged.price !== undefined) product.price = Number(staged.price);
            if (staged.discount !== undefined) product.discount = Number(staged.discount);
            if (staged.flash_sale !== undefined) product.flash_sale = Boolean(staged.flash_sale);
            if (staged.flash_sale_ends_at !== undefined) {
                product.flash_sale_ends_at = staged.flash_sale_ends_at
                    ? new Date(staged.flash_sale_ends_at)
                    : undefined;
            }
            if (staged.weight !== undefined) product.weight = Number(staged.weight);
            if (staged.measurement !== undefined) product.measurement = staged.measurement;
            if (staged.category !== undefined) product.category = staged.category;
            if (staged.stock !== undefined) product.stock = Math.max(0, Math.floor(Number(staged.stock)));
            if (staged.brand !== undefined) product.brand = staged.brand;
            if (staged.sku !== undefined) product.sku = staged.sku;
            if (staged.origin !== undefined) product.origin = staged.origin;
            if (staged.seller_location !== undefined && staged.seller_location) {
                product.seller = {
                    ...(product.seller?.toObject ? product.seller.toObject() : product.seller || {}),
                    location: staged.seller_location,
                };
            }
            if (staged.shelf_life !== undefined) product.shelf_life = staged.shelf_life;
            if (staged.storage_tips !== undefined) product.storage_tips = staged.storage_tips;
            if (staged.harvest_date !== undefined && staged.harvest_date) {
                product.harvest_date = new Date(staged.harvest_date);
            }
            if (staged.expiry_date !== undefined) {
                product.expiry_date = staged.expiry_date ? new Date(staged.expiry_date) : undefined;
            }
            if (staged.is_organic !== undefined) product.is_organic = Boolean(staged.is_organic);
            if (Array.isArray(staged.tags)) product.tags = staged.tags;
            if (staged.nutrition && typeof staged.nutrition === "object") {
                product.nutrition = staged.nutrition;
            }
            if (staged.image) product.image = staged.image;
            if (Array.isArray(staged.images) && staged.images.length > 0) {
                product.images = staged.images;
            }

            product.pending_changes = null;
            product.pending_changes_submitted_at = null;
            product.pending_changes_note = "";
            product.approved_at = new Date();
            product.approved_by = adminUser.email;
            product.markModified("pending_changes");
            await product.save();

            // Re-sync both Admin & Seller low-stock notifications against updated live stock
            await syncAdminStockNotificationsForProducts([product.product_id], { logAudit: true });
        } else {
            // REJECT: discard staged changes and keep previous published details completely intact
            product.pending_changes = null;
            product.pending_changes_submitted_at = null;
            product.pending_changes_note = String(rejection_reason || "").trim();
            product.markModified("pending_changes");
            await product.save();
        }

        // Notify owning seller of edit review decision
        if (product.seller?.seller_id) {
            const sellerUser = await Users.findById(product.seller.seller_id, { email: 1 }).catch(
                () => null
            );
            if (sellerUser) {
                await Notifications.create({
                    user_id: String(sellerUser._id),
                    user_email: sellerUser.email,
                    product_id: product.product_id,
                    type: "PRODUCT_APPROVAL_RESULT",
                    title:
                        action === "APPROVE"
                            ? `✅ Product Edits Approved & Live: ${product.name}`
                            : `Product Edits Not Approved: ${prevName}`,
                    message:
                        action === "APPROVE"
                            ? `Admin approved your submitted updates for "${product.name}". The new details are now live on the FreshMart storefront.`
                            : `Admin did not approve your proposed edits for "${prevName}"${
                                  rejection_reason ? `: ${rejection_reason}` : "."
                              } Your product remains live with its previous details.`,
                    link: "/seller?tab=products",
                    read: false,
                    dismissed_popup: true,
                }).catch(() => {});
            }
        }

        await recordAuditLog({
            action: action === "APPROVE" ? "PRODUCT_EDITS_APPROVED" : "PRODUCT_EDITS_REJECTED",
            category: "INVENTORY",
            severity: action === "APPROVE" ? "SUCCESS" : "WARNING",
            actor_email: adminUser.email,
            actor_name: `${adminUser.first_name} ${adminUser.last_name}`.trim() || adminUser.email,
            target_id: product.product_id,
            details:
                action === "APPROVE"
                    ? `Admin approved and published seller edits for "${product.name}" (Stock: ${product.stock}, Price: ${product.price} KES).`
                    : `Admin rejected seller edits for "${prevName}"${
                          rejection_reason ? ` — Reason: ${rejection_reason}` : ""
                      }. Live product retained previous details.`,
        });

        return res.status(200).json({
            message:
                action === "APPROVE"
                    ? `✓ Approved & published updated details for "${product.name}"!`
                    : `Rejected proposed edits for "${prevName}". Previous live details remain active.`,
            product,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateAdminProductQuick = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const { name, price, stock, discount, flash_sale, category } = req.body;

        const updatePayload = {};
        if (name !== undefined) updatePayload.name = String(name).trim();
        if (category !== undefined) updatePayload.category = String(category).trim();
        if (price !== undefined) updatePayload.price = Math.max(0, Number(price) || 0);
        if (stock !== undefined) updatePayload.stock = Math.max(0, Math.floor(Number(stock) || 0));
        if (discount !== undefined)
            updatePayload.discount = Math.min(90, Math.max(0, Number(discount) || 0));
        if (flash_sale !== undefined) updatePayload.flash_sale = Boolean(flash_sale);

        if (updatePayload.price !== undefined || updatePayload.discount !== undefined) {
            const existing = await Products.findOne({ product_id: productId });
            const basePrice = updatePayload.price ?? existing?.price ?? 0;
            const disc = updatePayload.discount ?? existing?.discount ?? 0;
            updatePayload.discounted_price = Number((basePrice * (1 - disc / 100)).toFixed(2));
        }

        const updated = await Products.findOneAndUpdate(
            { product_id: productId },
            updatePayload,
            { new: true }
        );

        if (!updated) {
            return res.status(404).json({ message: "Product not found" });
        }

        await recordAuditLog({
            action: "PRODUCT_QUICK_UPDATED",
            category: "INVENTORY",
            severity: "SUCCESS",
            actor_email: adminUser.email,
            actor_name: `${adminUser.first_name} ${adminUser.last_name}`,
            target_id: updated.product_id,
            details: `Updated "${updated.name}" (#${updated.product_id}): Stock=${updated.stock}, Price=${updated.price} KES, Discount=${updated.discount || 0}%, Flash=${Boolean(updated.flash_sale)}.`,
        });

        await syncAdminStockNotificationsForProducts([updated.product_id], { logAudit: true });

        return res.status(200).json(updated);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateAdminProductFull = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const product = await Products.findOne({ product_id: productId });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        const {
            name,
            description,
            price,
            discount,
            flash_sale,
            flash_sale_ends_at,
            weight,
            measurement,
            category,
            stock,
            brand,
            sku,
            origin,
            is_organic,
            storage_tips,
            shelf_life,
            harvest_date,
            expiry_date,
            seller,
            nutrition,
            tags,
            image_urls,
            media_order,
        } = req.body || {};

        if (name !== undefined && String(name).trim()) product.name = String(name).trim();
        if (description !== undefined) product.description = String(description).trim();
        if (category !== undefined && String(category).trim())
            product.category = String(category).trim();
        if (brand !== undefined) product.brand = String(brand).trim() || "FreshMart Organics";
        if (sku !== undefined) product.sku = String(sku).trim();
        if (origin !== undefined) product.origin = String(origin).trim() || "Kenyan Highlands";
        if (is_organic !== undefined)
            product.is_organic = is_organic === true || is_organic === "true";

        if (price !== undefined && Number(price) > 0) product.price = Number(price);
        if (discount !== undefined)
            product.discount = Math.min(95, Math.max(0, Number(discount) || 0));
        if (flash_sale !== undefined)
            product.flash_sale = flash_sale === true || flash_sale === "true";
        if (flash_sale_ends_at !== undefined) {
            if (flash_sale_ends_at && String(flash_sale_ends_at).trim()) {
                const d = new Date(flash_sale_ends_at);
                if (!isNaN(d.getTime())) product.flash_sale_ends_at = d;
            } else {
                product.flash_sale_ends_at = undefined;
            }
        }
        if (weight !== undefined && Number(weight) > 0) product.weight = Number(weight);
        if (measurement !== undefined && String(measurement).trim())
            product.measurement = String(measurement).trim();
        if (stock !== undefined) product.stock = Math.max(0, Math.floor(Number(stock) || 0));

        if (shelf_life !== undefined) product.shelf_life = String(shelf_life).trim();
        if (storage_tips !== undefined) product.storage_tips = String(storage_tips).trim();
        if (harvest_date !== undefined) {
            if (harvest_date && String(harvest_date).trim()) {
                const d = new Date(harvest_date);
                if (!isNaN(d.getTime())) product.harvest_date = d;
            }
        }
        if (expiry_date !== undefined) {
            if (expiry_date && String(expiry_date).trim()) {
                const d = new Date(expiry_date);
                if (!isNaN(d.getTime())) product.expiry_date = d;
            } else {
                product.expiry_date = undefined;
            }
        }

        if (tags !== undefined) {
            const parsedTags = Array.isArray(tags)
                ? tags.filter(Boolean)
                : String(tags)
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean);
            product.tags = parsedTags;
        }

        if (seller !== undefined) {
            let parsedSeller = seller;
            if (typeof seller === "string") {
                try {
                    parsedSeller = JSON.parse(seller);
                } catch {
                    parsedSeller = null;
                }
            }
            if (parsedSeller && typeof parsedSeller === "object") {
                const existingSeller = product.seller?.toObject
                    ? product.seller.toObject()
                    : product.seller || {};
                product.seller = {
                    ...existingSeller,
                    name: String(parsedSeller.name || existingSeller.name || "FreshMart Farm Partner").trim(),
                    location: String(parsedSeller.location || existingSeller.location || "Nairobi, Kenya").trim(),
                    verified:
                        parsedSeller.verified !== undefined
                            ? Boolean(parsedSeller.verified)
                            : existingSeller.verified !== false,
                };
            }
        }

        if (nutrition !== undefined) {
            let parsedNutrition = nutrition;
            if (typeof nutrition === "string") {
                try {
                    parsedNutrition = JSON.parse(nutrition);
                } catch {
                    parsedNutrition = null;
                }
            }
            if (parsedNutrition && typeof parsedNutrition === "object") {
                product.nutrition = {
                    calories: String(parsedNutrition.calories || product.nutrition?.calories || ""),
                    protein: String(parsedNutrition.protein || product.nutrition?.protein || ""),
                    carbs: String(parsedNutrition.carbs || product.nutrition?.carbs || ""),
                    fat: String(parsedNutrition.fat || product.nutrition?.fat || ""),
                    fiber: String(parsedNutrition.fiber || product.nutrition?.fiber || ""),
                    vitamins: Array.isArray(parsedNutrition.vitamins)
                        ? parsedNutrition.vitamins.filter(Boolean)
                        : product.nutrition?.vitamins || [],
                };
            }
        }

        // Upload any new files via Cloudinary and reconstruct ordered gallery
        const primaryFiles = req.files?.image || [];
        const galleryFiles = req.files?.images || [];
        const allFiles = [...primaryFiles, ...galleryFiles];

        const uploadedUrls = [];
        for (const file of allFiles) {
            try {
                const result = await cloudinary.uploader.upload(file.path, { folder: "products" });
                if (result?.secure_url) uploadedUrls.push(result.secure_url);
            } catch (err) {
                console.warn("Admin full edit Cloudinary upload warning:", err.message);
            }
        }

        let orderedImages = [];
        if (media_order) {
            let orderArr = [];
            try {
                orderArr = typeof media_order === "string" ? JSON.parse(media_order) : media_order;
            } catch {
                orderArr = [];
            }
            if (Array.isArray(orderArr) && orderArr.length > 0) {
                let fileCursor = 0;
                for (const token of orderArr) {
                    if (token === "__FILE__") {
                        if (uploadedUrls[fileCursor]) {
                            orderedImages.push(uploadedUrls[fileCursor]);
                        }
                        fileCursor += 1;
                    } else if (typeof token === "string" && token.trim()) {
                        orderedImages.push(token.trim());
                    }
                }
            }
        }

        if (orderedImages.length === 0) {
            let extraUrls = [];
            if (Array.isArray(image_urls)) {
                extraUrls = image_urls;
            } else if (typeof image_urls === "string" && image_urls.trim()) {
                try {
                    const parsed = JSON.parse(image_urls);
                    extraUrls = Array.isArray(parsed) ? parsed : [image_urls.trim()];
                } catch {
                    extraUrls = image_urls
                        .split(/[\n,]+/)
                        .map((u) => u.trim())
                        .filter(Boolean);
                }
            }
            if (req.body?.image && typeof req.body.image === "string") {
                extraUrls.unshift(req.body.image.trim());
            }
            orderedImages = [...uploadedUrls, ...extraUrls];
        }

        const cleanImages = Array.from(new Set(orderedImages.filter(Boolean)));
        if (cleanImages.length > 0) {
            product.image = cleanImages[0];
            product.images = cleanImages;
        }

        await product.save();
        await syncAdminStockNotificationsForProducts([product.product_id], { logAudit: true });

        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "PRODUCT_FULL_UPDATED",
            category: "INVENTORY",
            severity: "SUCCESS",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: product.product_id,
            details: `Full edit saved for "${product.name}" (#${product.product_id}): Price=${product.price} KES (-${product.discount || 0}%), Stock=${product.stock}, Gallery=${(product.images || []).length} img(s).`,
        });

        return res.status(200).json({
            message: `"${product.name}" updated successfully!`,
            product,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const deleteAdminProduct = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const { reason = "" } = req.body || {};

        const product = await Products.findOne({
            product_id: productId,
            is_deleted: { $ne: true },
        });
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const now = new Date();
        const purgeAfter = computeProductPurgeDate(now);
        const cleanReason =
            String(reason || "").trim() || `Moved to Trash by Admin (${adminUser.email})`;

        product.is_deleted = true;
        product.deleted_at = now;
        product.deleted_by = adminUser.email;
        product.delete_reason = cleanReason;
        product.purge_after = purgeAfter;
        await product.save();

        // Clear any stale low-stock alerts for this trashed product
        await syncAdminStockNotificationsForProducts([product.product_id], { logAudit: false });

        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "PRODUCT_MOVED_TO_TRASH",
            category: "TRASH",
            severity: "WARNING",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: product.product_id,
            details: `Moved product "${product.name}" (#${product.product_id}) to Trash (auto-deletes after ${PRODUCT_TRASH_RETENTION_DAYS} days on ${purgeAfter.toISOString().slice(0, 10)}). Reason: ${cleanReason}.`,
        });

        return res.status(200).json({
            message: `"${product.name}" moved to Trash. It can be restored within ${PRODUCT_TRASH_RETENTION_DAYS} days before automatic deletion.`,
            product_id: productId,
            purge_after: purgeAfter,
            retention_days: PRODUCT_TRASH_RETENTION_DAYS,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAdminTrash = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const nowMs = Date.now();
        const MS_PER_DAY = 24 * 60 * 60 * 1000;

        const [trashedProducts, trashedUsers] = await Promise.all([
            Products.find({ is_deleted: true }).sort({ deleted_at: -1 }).lean(),
            Users.find(
                { $or: [{ is_deleted: true }, { account_status: "SUSPENDED" }] },
                { password: 0 }
            )
                .sort({ deleted_at: -1 })
                .lean(),
        ]);

        const productsPayload = trashedProducts.map((p) => {
            const purgeDate = p.purge_after
                ? new Date(p.purge_after)
                : computeProductPurgeDate(p.deleted_at || new Date());
            const daysRemaining = Math.max(
                0,
                Math.ceil((purgeDate.getTime() - nowMs) / MS_PER_DAY)
            );
            return {
                ...p,
                purge_after: purgeDate,
                days_remaining: daysRemaining,
            };
        });

        const usersPayload = trashedUsers.map((u) => {
            const retainUntil = u.gdpr_retain_until
                ? new Date(u.gdpr_retain_until)
                : computeUserGdprRetainDate(u.deleted_at || new Date());
            const daysRemaining = Math.max(
                0,
                Math.ceil((retainUntil.getTime() - nowMs) / MS_PER_DAY)
            );
            return {
                ...u,
                gdpr_retain_until: retainUntil,
                days_remaining: daysRemaining,
            };
        });

        return res.status(200).json({
            products: productsPayload,
            users: usersPayload,
            retention: {
                product_days: PRODUCT_TRASH_RETENTION_DAYS,
                user_gdpr_days: USER_GDPR_RETENTION_DAYS,
            },
            cron_status: getTrashPurgeCronStatus(),
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const restoreTrashedProduct = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const product = await Products.findOne({ product_id: productId, is_deleted: true });
        if (!product) {
            return res.status(404).json({ message: "Trashed product not found." });
        }

        product.is_deleted = false;
        product.deleted_at = null;
        product.deleted_by = "";
        product.delete_reason = "";
        product.purge_after = null;
        await product.save();

        await syncAdminStockNotificationsForProducts([product.product_id], { logAudit: false });

        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "PRODUCT_RESTORED_FROM_TRASH",
            category: "TRASH",
            severity: "SUCCESS",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: product.product_id,
            details: `Restored product "${product.name}" (#${product.product_id}) from Trash back into active Inventory.`,
        });

        return res.status(200).json({
            message: `"${product.name}" restored back to active Inventory!`,
            product,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const permanentDeleteTrashedProduct = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { productId } = req.params;
        const deleted = await Products.findOneAndDelete({
            product_id: productId,
            is_deleted: true,
        });
        if (!deleted) {
            return res.status(404).json({ message: "Trashed product not found." });
        }

        await Notifications.deleteMany({ product_id: productId }).catch(() => {});

        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "PRODUCT_PERMANENTLY_DELETED",
            category: "TRASH",
            severity: "DANGER",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: deleted.product_id,
            details: `Permanently deleted trashed product "${deleted.name}" (#${deleted.product_id}) from MongoDB.`,
        });

        return res.status(200).json({
            message: `"${deleted.name}" permanently deleted.`,
            product_id: productId,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const restoreTrashedUser = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { userId } = req.params;
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "Suspended user not found." });
        }

        user.account_status = "ACTIVE";
        user.is_deleted = false;
        user.deleted_at = null;
        user.deleted_by = "";
        user.suspension_reason = "";
        user.gdpr_retain_until = null;

        if (user.previous_seller_status && user.seller_profile) {
            user.seller_profile.status = user.previous_seller_status;
            user.previous_seller_status = "";
        }

        await user.save();

        const targetName =
            [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;
        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "USER_RESTORED_FROM_TRASH",
            category: "TRASH",
            severity: "SUCCESS",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: user.email,
            details: `Restored suspended user account "${targetName}" (${user.email}) from GDPR Trash to ACTIVE status.`,
        });

        return res.status(200).json({
            message: `Account "${targetName}" restored! They can sign in again immediately.`,
            _id: userId,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const permanentDeleteTrashedUser = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { userId } = req.params;
        const targetUser = await Users.findOneAndDelete({
            _id: userId,
            $or: [{ is_deleted: true }, { account_status: "SUSPENDED" }],
        });
        if (!targetUser) {
            return res.status(404).json({ message: "Suspended user not found in GDPR Trash." });
        }

        const uidStr = String(targetUser._id);
        const uEmail = String(targetUser.email || "").toLowerCase();

        await Promise.all([
            Notifications.deleteMany({
                $or: [{ user_id: uidStr }, { user_email: { $regex: `^${uEmail}$`, $options: "i" } }],
            }).catch(() => {}),
            UserInteractions.deleteMany({
                $or: [{ user_id: uidStr }, { user_email: uEmail }],
            }).catch(() => {}),
        ]);

        const targetName =
            [targetUser.first_name, targetUser.last_name].filter(Boolean).join(" ") ||
            targetUser.email;
        const adminName =
            [adminUser.first_name, adminUser.last_name].filter(Boolean).join(" ") ||
            adminUser.email;

        await recordAuditLog({
            action: "USER_GDPR_PERMANENTLY_ERASED",
            category: "TRASH",
            severity: "DANGER",
            actor_email: adminUser.email,
            actor_name: adminName,
            target_id: targetUser.email,
            details: `GDPR Permanent Erasure executed for "${targetName}" (${targetUser.email}): removed user profile, notifications, and tracking telemetry.`,
        });

        return res.status(200).json({
            message: `GDPR permanent erasure completed for "${targetName}".`,
            _id: userId,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const triggerTrashPurgeCronNow = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.userId || req.body?.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const result = await runTrashPurgeSweep({ source: "MANUAL" });
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAdminSellers = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const [sellerUsers, allProducts, allOrders] = await Promise.all([
            Users.find(
                {
                    ...ACTIVE_USER_FILTER,
                    $or: [
                        { role: "SELLER" },
                        { "seller_profile.status": { $in: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"] } },
                    ],
                },
                { password: 0 }
            ).sort({ "seller_profile.applied_at": -1, _id: -1 }),
            Products.find(ACTIVE_PRODUCT_FILTER),
            Order.find(),
        ]);

        const NON_EARNING = new Set([
            "CANCELLED",
            "CANCELLED_PAYMENT_UNSUCCESSFUL",
            "FAILED_DELIVERY",
            "RETURN_IN_PROGRESS",
            "RETURNED",
            "REFUNDED",
        ]);
        const RETURNED_SET = new Set([
            "RETURN_IN_PROGRESS",
            "RETURNED",
            "REFUNDED",
            "FAILED_DELIVERY",
        ]);

        const enriched = sellerUsers.map((u) => {
            const sid = String(u._id);
            const prods = allProducts.filter((p) => p.seller?.seller_id === sid);
            const prodIds = new Set(prods.map((p) => p.product_id));
            const prodMap = new Map(prods.map((p) => [p.product_id, p]));

            let ordersCount = 0;
            let unitsSold = 0;
            let returnedUnits = 0;
            let totalEarnings = 0;

            for (const ord of allOrders) {
                const items = (ord.products || []).filter(
                    (it) => it?.seller_id === sid || prodIds.has(it?.product_id)
                );
                if (items.length === 0) continue;
                ordersCount += 1;

                const subUnits = items.reduce((s, it) => s + Math.max(1, Number(it.quantity || 1)), 0);
                const subTotal = items.reduce((s, it) => {
                    const p = prodMap.get(it.product_id);
                    const price = Number(it.price ?? (p ? calculateEffectivePrice(p) : 0));
                    return s + price * Math.max(1, Number(it.quantity || 1));
                }, 0);

                if (RETURNED_SET.has(ord.status)) {
                    returnedUnits += subUnits;
                } else if (!NON_EARNING.has(ord.status)) {
                    unitsSold += subUnits;
                    totalEarnings += subTotal;
                }
            }

            const allRevs = prods.flatMap((p) => (Array.isArray(p.reviews) ? p.reviews : []));
            const avgRating =
                allRevs.length > 0
                    ? Number(
                          (
                              allRevs.reduce((s, r) => s + Number(r.seller_rating || 5), 0) /
                              allRevs.length
                          ).toFixed(2)
                      )
                    : 0;

            return {
                _id: u._id,
                first_name: u.first_name,
                last_name: u.last_name,
                email: u.email,
                phone: u.phone || u.seller_profile?.business_phone || "",
                avatar: u.avatar || "",
                role: u.role,
                seller_profile: u.seller_profile || { status: "PENDING" },
                stats: {
                    products_count: prods.length,
                    orders_count: ordersCount,
                    units_sold: unitsSold,
                    returned_units: returnedUnits,
                    total_earnings: Number(totalEarnings.toFixed(2)),
                    seller_rating: avgRating,
                    reviews_count: allRevs.length,
                },
            };
        });

        return res.status(200).json(enriched);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateAdminSellerStatus = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { sellerId } = req.params;
        const { status, rejection_reason = "" } = req.body || {};

        if (!["APPROVED", "REJECTED", "SUSPENDED", "PENDING"].includes(status)) {
            return res.status(400).json({
                message: "Status must be APPROVED, REJECTED, SUSPENDED, or PENDING.",
            });
        }

        const targetUser = await Users.findById(sellerId);
        if (!targetUser) {
            return res.status(404).json({ message: "Seller user not found." });
        }

        targetUser.seller_profile = {
            ...(targetUser.seller_profile?.toObject
                ? targetUser.seller_profile.toObject()
                : targetUser.seller_profile || {}),
            status,
            rejection_reason:
                status === "REJECTED" || status === "SUSPENDED"
                    ? String(rejection_reason || "").trim()
                    : "",
            reviewed_at: new Date(),
            reviewed_by: adminUser.email,
        };

        if (status === "APPROVED" && targetUser.role !== "ADMIN") {
            targetUser.role = "SELLER";
        }
        await targetUser.save();

        const storeName = targetUser.seller_profile?.store_name || targetUser.first_name;

        if (status === "APPROVED") {
            await Products.updateMany(
                { "seller.seller_id": String(targetUser._id) },
                { $set: { "seller.verified": true } }
            );
        }

        await Notifications.create({
            user_id: String(targetUser._id),
            user_email: targetUser.email,
            type: "SELLER_APPROVAL",
            title:
                status === "APPROVED"
                    ? `🎉 Seller Store Approved: ${storeName}`
                    : status === "REJECTED"
                    ? `Seller Application Update: ${storeName}`
                    : `Seller Store ${status}: ${storeName}`,
            message:
                status === "APPROVED"
                    ? `Congratulations! Your seller store "${storeName}" has been approved. Open the Seller Portal to list products and manage incoming orders.`
                    : status === "REJECTED"
                    ? `Your seller request for "${storeName}" was not approved${
                          rejection_reason ? `: ${rejection_reason}` : "."
                      }`
                    : `Your seller store "${storeName}" status has been updated to ${status}.`,
            link: "/seller",
            read: false,
            dismissed_popup: true,
        }).catch(() => {});

        await recordAuditLog({
            action: `SELLER_${status}`,
            category: "SELLERS",
            severity:
                status === "APPROVED" ? "SUCCESS" : status === "PENDING" ? "INFO" : "DANGER",
            actor_email: adminUser.email,
            actor_name: `${adminUser.first_name} ${adminUser.last_name}`,
            target_id: targetUser.email,
            details: `Admin set seller "${storeName}" (${targetUser.email}) status to ${status}${
                rejection_reason ? ` (${rejection_reason})` : ""
            }.`,
        });

        return res.status(200).json({
            message: `Seller "${storeName}" marked as ${status}.`,
            _id: targetUser._id,
            seller_profile: targetUser.seller_profile,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const triggerLowStockCronNow = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const result = await runLowStockMonitorSweep({
            source: "MANUAL",
            forceEmail: Boolean(req.body?.force_email),
            originUrl: req.headers.origin || "",
        });

        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAdminAuditLogs = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { category, severity, limit = 100 } = req.query;
        const filter = {};
        if (category && category !== "ALL") filter.category = category;
        if (severity && severity !== "ALL") filter.severity = severity;

        const logs = await AuditLogs.find(filter)
            .sort({ created_at: -1 })
            .limit(Math.min(250, Number(limit) || 100));

        return res.status(200).json(logs);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const createCustomAuditLog = async (req, res) => {
    try {
        const adminUser = await ensureAdminUser(req.body.id);
        if (!adminUser) {
            return res.status(401).json({ message: "Unauthorized admin access" });
        }

        const { action, category, severity, target_id, details } = req.body;
        const created = await recordAuditLog({
            action: action || "ADMIN_NOTE",
            category: category || "SYSTEM",
            severity: severity || "INFO",
            actor_email: adminUser.email,
            actor_name: `${adminUser.first_name} ${adminUser.last_name}`,
            target_id: target_id || "",
            details: details || "Admin operational note logged.",
        });

        return res.status(201).json(created);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
