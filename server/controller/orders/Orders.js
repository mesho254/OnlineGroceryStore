import mongoose from "mongoose";
import Order, { PendingCheckout, ORDER_STATUS_ENUM } from "../../model/Orders.js";
import Products from "../../model/Products.js";
import Shipments from "../../model/Shipments.js";
import Users from "../../model/Users.js";
import Notifications from "../../model/Notifications.js";
import Pagination from "../../utils/pagination.js";
import sendEmail from "../../utils/sendEmail.js";
import { orderConfirmationTemplate } from "../../templates/index.js";
import { triggerDeliveryReviewNotification } from "../notifications/Notifications.js";
import { recordAuditLog } from "../../model/AuditLogs.js";
import { stripe } from "../../index.js";
import {
    buildUpdatedStatusHistory,
    normalizeStatusKey,
    reconcileOrderAndShipment,
    transitionOrderAndShipmentStatus,
} from "../../utils/orderStatusSync.js";
import { syncAdminStockNotificationsForProducts } from "../../utils/stockAlerts.js";
import { recordUserInteraction } from "../../utils/recommendationEngine.js";
import { generatePosReceiptPdfBuffer } from "../../utils/posReceiptPdf.js";

export { buildUpdatedStatusHistory, normalizeStatusKey };

// In-process concurrency locks to prevent duplicate concurrent fulfillment of the same order or checkout token
const inFlightOrderLocks = new Map();

const isTransactionUnsupportedError = (err) => {
    const msg = String(err?.message || "");
    return (
        msg.includes("Transaction numbers are only allowed on a replica set") ||
        msg.includes("This MongoDB deployment does not support retryable writes")
    );
};

const normalizeAndAggregateProducts = (rawProducts) => {
    const map = new Map();
    for (const item of rawProducts || []) {
        if (!item?.product_id) continue;
        const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));
        const existing = map.get(item.product_id);
        if (existing) {
            existing.quantity += qty;
        } else {
            map.set(item.product_id, {
                ...item,
                product_id: item.product_id,
                name: item.name || item.product_id,
                quantity: qty,
            });
        }
    }
    return Array.from(map.values());
};

const executeTransactionalOrderFulfillment = async ({
    order_id,
    checkout_token_id,
    stripe_session_id,
    stripe_session_url,
    firstName,
    lastName,
    email,
    phone_number,
    parsedAddress,
    aggregatedProducts,
    total,
}) => {
    // Fast-path idempotency check before starting a session
    const duplicateQuery = checkout_token_id
        ? { $or: [{ order_id }, { checkout_token_id }] }
        : { order_id };
    const existingBeforeSession = await Order.findOne(duplicateQuery);
    if (existingBeforeSession) {
        return { order: existingBeforeSession, newlyCreated: false };
    }

    const session = await mongoose.startSession();
    let createdOrder = null;
    let newlyCreated = false;

    try {
        await session.withTransaction(
            async () => {
                // Re-check inside transaction snapshot for strict Isolation
                const existingInTx = await Order.findOne(duplicateQuery).session(session);
                if (existingInTx) {
                    createdOrder = existingInTx;
                    newlyCreated = false;
                    return;
                }

                // 1. Atomically verify and decrement stock for every product using conditional $gte guard
                for (const item of aggregatedProducts) {
                    const updatedProduct = await Products.findOneAndUpdate(
                        {
                            product_id: item.product_id,
                            stock: { $gte: item.quantity },
                        },
                        {
                            $inc: { stock: -item.quantity },
                        },
                        { new: true, session }
                    );

                    if (!updatedProduct) {
                        const currentProduct = await Products.findOne({
                            product_id: item.product_id,
                        }).session(session);

                        const stockErr = new Error(
                            !currentProduct
                                ? `Product "${item.name}" was not found.`
                                : currentProduct.stock <= 0
                                ? `"${currentProduct.name}" is now out of stock.`
                                : `Insufficient stock for "${currentProduct.name}". Only ${currentProduct.stock} left in stock (requested ${item.quantity}).`
                        );
                        stockErr.statusCode = 409;
                        stockErr.code = "OUT_OF_STOCK";
                        stockErr.product_id = item.product_id;
                        throw stockErr;
                    }

                    // Snapshot effective price & seller metadata onto order item for accurate seller earnings & attribution
                    item.price = Number(
                        item.price ?? updatedProduct.discounted_price ?? updatedProduct.price ?? 0
                    );
                    item.seller_id = updatedProduct.seller?.seller_id || "";
                    item.seller_name = updatedProduct.seller?.name || "";
                }

                const nowDate = new Date();
                const initialHistory = [
                    { status: "ORDER_PLACED", timestamp: nowDate, note: "" },
                    { status: "PENDING_CONFIRMATION", timestamp: nowDate, note: "" },
                ];

                // 2. Create the Order document atomically within the same transaction
                const orderPayload = {
                    order_id,
                    ...(checkout_token_id ? { checkout_token_id } : {}),
                    ...(stripe_session_id ? { stripe_session_id } : {}),
                    ...(stripe_session_url ? { stripe_session_url } : {}),
                    name: {
                        first: firstName,
                        last: lastName,
                    },
                    email,
                    phone_number,
                    address: parsedAddress,
                    ordered_at: nowDate,
                    status: "PENDING_CONFIRMATION",
                    status_history: initialHistory,
                    products: aggregatedProducts,
                    total,
                };

                const [savedOrder] = await Order.create([orderPayload], { session });

                // 3. Create the corresponding Shipment document atomically within the same transaction
                const existingShipment = await Shipments.findOne({
                    order_id: savedOrder.order_id,
                }).session(session);

                if (!existingShipment) {
                    await Shipments.create(
                        [
                            {
                                total: savedOrder.total,
                                ordered_at: savedOrder.ordered_at,
                                address: savedOrder.address,
                                order_id: savedOrder.order_id,
                                status: "PENDING_CONFIRMATION",
                                status_history: initialHistory,
                            },
                        ],
                        { session }
                    );
                }

                createdOrder = savedOrder;
                newlyCreated = true;
            },
            {
                readPreference: "primary",
                readConcern: { level: "local" },
                writeConcern: { w: "majority" },
            }
        );

        return { order: createdOrder, newlyCreated };
    } catch (txError) {
        // If duplicate key error (E11000) occurred due to a concurrent transaction committing first,
        // the transaction automatically rolled back our stock deduction; return the winning order idempotently.
        if (txError?.code === 11000) {
            const winningOrder = await Order.findOne(duplicateQuery);
            if (winningOrder) {
                return { order: winningOrder, newlyCreated: false };
            }
        }

        // Fallback with manual compensating rollback only if connected to a standalone non-replica-set Mongo instance
        if (isTransactionUnsupportedError(txError)) {
            return await executeCompensatingOrderFulfillment({
                order_id,
                checkout_token_id,
                firstName,
                lastName,
                email,
                phone_number,
                parsedAddress,
                aggregatedProducts,
                total,
                duplicateQuery,
            });
        }

        throw txError;
    } finally {
        await session.endSession();
    }
};

const executeCompensatingOrderFulfillment = async ({
    order_id,
    checkout_token_id,
    firstName,
    lastName,
    email,
    phone_number,
    parsedAddress,
    aggregatedProducts,
    total,
    duplicateQuery,
}) => {
    const existing = await Order.findOne(duplicateQuery);
    if (existing) {
        return { order: existing, newlyCreated: false };
    }

    const deductedItems = [];
    try {
        for (const item of aggregatedProducts) {
            const updatedProduct = await Products.findOneAndUpdate(
                {
                    product_id: item.product_id,
                    stock: { $gte: item.quantity },
                },
                {
                    $inc: { stock: -item.quantity },
                },
                { new: true }
            );

            if (!updatedProduct) {
                const currentProduct = await Products.findOne({ product_id: item.product_id });
                const stockErr = new Error(
                    !currentProduct
                        ? `Product "${item.name}" was not found.`
                        : currentProduct.stock <= 0
                        ? `"${currentProduct.name}" is now out of stock.`
                        : `Insufficient stock for "${currentProduct.name}". Only ${currentProduct.stock} left in stock (requested ${item.quantity}).`
                );
                stockErr.statusCode = 409;
                stockErr.code = "OUT_OF_STOCK";
                stockErr.product_id = item.product_id;
                throw stockErr;
            }

            deductedItems.push(item);
        }

        const order = new Order({
            order_id,
            ...(checkout_token_id ? { checkout_token_id } : {}),
            name: { first: firstName, last: lastName },
            email,
            phone_number,
            address: parsedAddress,
            ordered_at: new Date(),
            products: aggregatedProducts,
            total,
        });

        await order.save();

        await Shipments.updateOne(
            { order_id: order.order_id },
            {
                $setOnInsert: {
                    total: order.total,
                    ordered_at: order.ordered_at,
                    address: order.address,
                    order_id: order.order_id,
                },
            },
            { upsert: true }
        );

        return { order, newlyCreated: true };
    } catch (err) {
        // Compensating rollback: restore any stock decremented before the failure
        for (const deducted of deductedItems) {
            await Products.findOneAndUpdate(
                { product_id: deducted.product_id },
                { $inc: { stock: deducted.quantity } }
            ).catch(() => {});
        }

        if (err?.code === 11000) {
            const winningOrder = await Order.findOne(duplicateQuery);
            if (winningOrder) {
                return { order: winningOrder, newlyCreated: false };
            }
        }
        throw err;
    }
};

export const rollbackOrderData = async (order_id) => {
    if (!order_id) return;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const order = await Order.findOneAndDelete({ order_id }).session(session);
            if (!order) return;

            for (const item of order.products || []) {
                if (!item?.product_id) continue;
                const qty = Math.max(1, Number(item.quantity) || 1);
                await Products.findOneAndUpdate(
                    { product_id: item.product_id },
                    { $inc: { stock: qty } },
                    { session }
                );
            }

            await Shipments.deleteOne({ order_id }).session(session);
            await Notifications.deleteMany({ order_id }).session(session);
        });
    } catch {
        // Best-effort non-transactional fallback if needed
        const order = await Order.findOneAndDelete({ order_id });
        if (order) {
            for (const item of order.products || []) {
                if (!item?.product_id) continue;
                const qty = Math.max(1, Number(item.quantity) || 1);
                await Products.findOneAndUpdate(
                    { product_id: item.product_id },
                    { $inc: { stock: qty } }
                ).catch(() => {});
            }
            await Shipments.deleteOne({ order_id }).catch(() => {});
        }
        await Notifications.deleteMany({ order_id }).catch(() => {});
    } finally {
        await session.endSession();
    }
};

export const triggerOrderConfirmationSideEffects = async (order) => {
    if (!order?.order_id) return;

    // Verify the order still exists in the database (was not rolled back)
    const persistedOrder = await Order.findOne({ order_id: order.order_id });
    if (!persistedOrder) return;

    // Idempotency guard: only create ORDER_CONFIRMED notification and send email once per order_id
    const existingNotif = await Notifications.findOne({
        order_id: persistedOrder.order_id,
        type: "ORDER_CONFIRMED",
    });
    if (existingNotif) return;

    if (persistedOrder.email) {
        try {
            const matchedUser = await Users.findOne({
                email: { $regex: `^${persistedOrder.email}$`, $options: "i" },
            });
            await Notifications.create({
                user_id: matchedUser?._id ? String(matchedUser._id) : undefined,
                user_email: persistedOrder.email,
                order_id: persistedOrder.order_id,
                type: "ORDER_CONFIRMED",
                title: `Order #${persistedOrder.order_id} Confirmed! 🛍️`,
                message: `We have received your order #${persistedOrder.order_id} (${persistedOrder.total} KES) and our riders are preparing it.`,
                link: `/orders/${persistedOrder.order_id}`,
                read: false,
                dismissed_popup: true,
            });
        } catch (notifErr) {
            console.warn("Order notification creation skipped:", notifErr.message);
        }
    }

    if (persistedOrder.email && process.env.USER && process.env.PASS) {
        try {
            // Enrich ordered products with live product images, pack size, category, and seller name for email rendering
            const prodIds = (persistedOrder.products || [])
                .map((p) => p.product_id)
                .filter(Boolean);
            const dbProducts =
                prodIds.length > 0
                    ? await Products.find(
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
                    : [];
            const prodMap = new Map(dbProducts.map((p) => [p.product_id, p]));
            const enrichedProducts = (persistedOrder.products || []).map((item) => {
                const db = prodMap.get(item.product_id) || {};
                return {
                    product_id: item.product_id,
                    name: db.name || item.name || "Grocery Item",
                    image: db.image || item.image || "",
                    category: db.category || "",
                    weight: db.weight || "",
                    measurement: db.measurement || "",
                    quantity: Number(item.quantity || 1),
                    price: Number(item.price ?? db.discounted_price ?? db.price ?? 0),
                    seller_name: item.seller_name || db.seller?.name || "",
                };
            });

            await sendEmail({
                to: persistedOrder.email,
                subject: `KijaniMart Order Confirmation #${persistedOrder.order_id}`,
                text: `Your order #${persistedOrder.order_id} has been placed successfully. Your grand total is ${persistedOrder.total} KES.`,
                html: orderConfirmationTemplate({
                    ...(persistedOrder._doc || persistedOrder),
                    products: enrichedProducts,
                }),
            });
        } catch (emailErr) {
            console.warn("Order confirmation email skipped:", emailErr.message);
        }
    }
};

export const fulfillOrderData = async (data, options = {}) => {
    if (!data?.order_id) {
        throw new Error("Missing order_id for order fulfillment");
    }

    const { deferNotifications = false } = options;

    // If only compact Stripe metadata was passed (e.g. from webhook/verify), look up existing order first
    if (!data.products) {
        const existingById = await Order.findOne({ order_id: data.order_id });
        if (existingById) {
            if (!deferNotifications) {
                await triggerOrderConfirmationSideEffects(existingById);
            }
            return existingById;
        }
    }

    const lockKey = data.checkout_token_id
        ? `token:${data.checkout_token_id}`
        : `order:${data.order_id}`;

    // If a concurrent request for the same order_id or checkout_token_id is already in flight, await it
    if (inFlightOrderLocks.has(lockKey)) {
        return await inFlightOrderLocks.get(lockKey);
    }
    if (inFlightOrderLocks.has(`order:${data.order_id}`)) {
        return await inFlightOrderLocks.get(`order:${data.order_id}`);
    }

    const fulfillmentPromise = (async () => {
        const parsedAddress =
            typeof data.address === "string" ? JSON.parse(data.address) : data.address || {};
        const parsedProducts =
            typeof data.products === "string" ? JSON.parse(data.products) : data.products || [];
        const aggregatedProducts = normalizeAndAggregateProducts(parsedProducts);

        if (aggregatedProducts.length === 0) {
            const emptyErr = new Error("Order must contain at least one valid product.");
            emptyErr.statusCode = 400;
            throw emptyErr;
        }

        const { order, newlyCreated } = await executeTransactionalOrderFulfillment({
            order_id: data.order_id,
            checkout_token_id: data.checkout_token_id || undefined,
            stripe_session_id: data.stripe_session_id || undefined,
            stripe_session_url: data.stripe_session_url || undefined,
            firstName: data.firstName || data.name?.first || "",
            lastName: data.lastName || data.name?.last || "",
            email: data.email,
            phone_number: data.phone_number,
            parsedAddress,
            aggregatedProducts,
            total: Number(data.total) || 0,
        });

        // Only trigger notifications/emails immediately if not deferred until Stripe session creation succeeds
        if (newlyCreated && order && !deferNotifications) {
            await triggerOrderConfirmationSideEffects(order);
        }

        // Notify admins immediately if any purchased product dropped to low stock (<= 10) or sold out (0)
        if (newlyCreated && aggregatedProducts.length > 0) {
            await syncAdminStockNotificationsForProducts(
                aggregatedProducts.map((p) => p.product_id),
                { logAudit: true }
            );

            // Record PURCHASE behavioral telemetry for personalized recommendations
            const buyer = order?.email
                ? await Users.findOne(
                      { email: { $regex: `^${order.email}$`, $options: "i" } },
                      { _id: 1, email: 1 }
                  ).catch(() => null)
                : null;
            if (buyer) {
                await Promise.all(
                    aggregatedProducts.map((item) =>
                        recordUserInteraction({
                            user: buyer,
                            event_type: "PURCHASE",
                            product_id: item.product_id,
                            quantity: item.quantity,
                        }).catch(() => {})
                    )
                );
            }

            // Notify any seller whose products were purchased in this order
            const sellerIdsInOrder = Array.from(
                new Set(aggregatedProducts.map((i) => i.seller_id).filter(Boolean))
            );
            for (const sid of sellerIdsInOrder) {
                const sellerItems = aggregatedProducts.filter((i) => i.seller_id === sid);
                const units = sellerItems.reduce((s, i) => s + Number(i.quantity || 1), 0);
                const sellerUser = await Users.findById(sid, { email: 1 }).catch(() => null);
                if (sellerUser) {
                    await Notifications.create({
                        user_id: String(sid),
                        user_email: sellerUser.email,
                        order_id: order.order_id,
                        type: "ORDER_CONFIRMED",
                        title: `🛒 New Seller Order #${order.order_id} (${units} item${units === 1 ? "" : "s"})`,
                        message: `A customer ordered ${units} unit(s) from your store in Order #${order.order_id}. Open Seller Portal to prepare dispatch.`,
                        link: "/seller?tab=orders",
                        read: false,
                        dismissed_popup: true,
                    }).catch(() => {});
                }
            }
        }

        return order;
    })();

    inFlightOrderLocks.set(lockKey, fulfillmentPromise);
    inFlightOrderLocks.set(`order:${data.order_id}`, fulfillmentPromise);

    try {
        return await fulfillmentPromise;
    } finally {
        inFlightOrderLocks.delete(lockKey);
        inFlightOrderLocks.delete(`order:${data.order_id}`);
    }
};

export const createOrder = async (req, res) => {
    try {
        const { data } = req.body;
        const order = await fulfillOrderData(data);
        res.status(200).json({ order_id: order.order_id });
    } catch (error) {
        console.log(error);
        const status = error.statusCode || 400;
        res.status(status).json({ error: error.message, message: error.message });
    }
};

export const getOrder = async (req, res) => {
    try {
        let requiredOrder = await Order.findOne({ order_id: req.params.id });

        // If the order isn't in Order yet, check if there is a PendingCheckout whose Stripe session is now PAID
        if (!requiredOrder) {
            const pending = await PendingCheckout.findOne({ order_id: req.params.id });
            if (pending?.stripe_session_id) {
                try {
                    const session = await stripe.checkout.sessions.retrieve(
                        pending.stripe_session_id
                    );
                    if (session?.payment_status === "paid") {
                        requiredOrder = await fulfillOrderData({
                            ...pending.payload,
                            stripe_session_id: session.id,
                            stripe_session_url: pending.stripe_session_url,
                        });
                        await PendingCheckout.deleteOne({ _id: pending._id }).catch(() => {});
                    } else {
                        return res.status(402).json({
                            message: "Payment for this order has not been completed yet.",
                        });
                    }
                } catch (stripeErr) {
                    console.warn("Stripe session check in getOrder failed:", stripeErr.message);
                }
            }
        }

        if (!requiredOrder) {
            return res.status(404).json({ message: "Order does not exist" });
        }

        const productIds = (requiredOrder.products || []).map((pr) => pr.product_id).filter(Boolean);
        const productsData = await Products.find({ product_id: { $in: productIds } });
        const productMap = new Map(productsData.map((p) => [p.product_id, p._doc || p]));

        const enrichedProducts = (requiredOrder.products || []).map((item) => {
            const dbProd = productMap.get(item.product_id) || {};
            return {
                ...dbProd,
                product_id: item.product_id,
                name: dbProd.name || item.name || "Grocery Item",
                quantity: Number(item.quantity) || 1,
                ordered_price: item.price ?? dbProd.discounted_price ?? dbProd.price ?? 0,
            };
        });

        const shipment = await Shipments.findOne({ order_id: requiredOrder.order_id });
        const synced = await reconcileOrderAndShipment(requiredOrder, shipment);

        res.status(200).json({
            ...requiredOrder._doc,
            status: synced.status,
            status_history: synced.status_history,
            products: enrichedProducts,
            shipment_status: synced.status,
            shipment: shipment
                ? { ...shipment._doc, status: synced.status, status_history: synced.status_history }
                : null,
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getUserOrders = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const orders = await Order.find({
            email: { $regex: `^${user.email}$`, $options: "i" },
        }).sort({ ordered_at: -1 });

        const orderIds = orders.map((o) => o.order_id);
        const shipments = await Shipments.find({ order_id: { $in: orderIds } });
        const shipmentMap = new Map(shipments.map((s) => [s.order_id, s]));

        const allProductIds = Array.from(
            new Set(
                orders.flatMap((o) => (o.products || []).map((p) => p.product_id).filter(Boolean))
            )
        );
        const dbProducts = await Products.find({ product_id: { $in: allProductIds } });
        const productMap = new Map(dbProducts.map((p) => [p.product_id, p._doc || p]));

        const enrichedOrders = await Promise.all(
            orders.map(async (ord) => {
                const shipment = shipmentMap.get(ord.order_id);
                const synced = await reconcileOrderAndShipment(ord, shipment);
                const enrichedProducts = (ord.products || []).map((item) => {
                    const dbProd = productMap.get(item.product_id) || {};
                    return {
                        product_id: item.product_id,
                        name: dbProd.name || item.name || "Grocery Item",
                        image: dbProd.image || "",
                        category: dbProd.category || "",
                        price: dbProd.price || 0,
                        discount: dbProd.discount || 0,
                        weight: dbProd.weight || "",
                        measurement: dbProd.measurement || "",
                        seller: dbProd.seller || null,
                        quantity: Number(item.quantity) || 1,
                    };
                });

                return {
                    ...ord._doc,
                    status: synced.status,
                    status_history: synced.status_history,
                    products: enrichedProducts,
                    order_status: synced.status,
                    shipment_status: synced.status,
                };
            })
        );

        return res.status(200).json(enrichedOrders);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getAllOrders = async (req, res) => {
    try {
        const id = req.body.id;
        const user = await Users.findById(id, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: `User ${id} was not found` });
        }
        if (user.role !== "ADMIN") {
            return res.status(401).json({ message: "Unauthorized user" });
        }

        const orders = await Order.find().sort({ ordered_at: -1 });
        const orderIds = orders.map((o) => o.order_id);
        const shipments = await Shipments.find({ order_id: { $in: orderIds } });
        const shipmentMap = new Map(shipments.map((s) => [s.order_id, s]));

        await Promise.all(
            orders.map((ord) => reconcileOrderAndShipment(ord, shipmentMap.get(ord.order_id)))
        );

        const ordersPaged = Pagination(req.query.page, orders);

        const total_pages = Math.ceil((await Order.countDocuments()) / 20);

        res.status(200).json({ total_pages, orders: ordersPaged });
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

export const updateOrder = async (req, res) => {
    try {
        const orderStatus = req.body.status;
        const id = req.body.id;

        const user = await Users.findById(id, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: `User ${id} was not found` });
        }
        if (user.role !== "ADMIN") {
            return res.status(401).json({ message: "Unauthorized user" });
        }

        if (!ORDER_STATUS_ENUM.includes(orderStatus)) {
            return res.status(400).json({
                message: `Invalid status "${orderStatus}". Allowed: ${ORDER_STATUS_ENUM.join(", ")}`,
            });
        }

        const result = await transitionOrderAndShipmentStatus({
            order_id: req.params.id,
            nextStatus: orderStatus,
            actorUser: user,
            source: "ORDERS",
            origin: req.headers.origin,
        });

        if (result.notFound || !result.order) {
            return res.status(404).json({ message: "Order does not exist" });
        }

        res.status(200).json({
            ...result.order._doc,
            shipment_status: result.status,
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({ message: error.message });
    }
};

export const downloadOrderReceiptPdf = async (req, res) => {
    try {
        const orderId = String(req.params.id || "").trim();
        if (!orderId) {
            return res.status(400).json({ message: "Order ID is required." });
        }

        const order = await Order.findOne({ order_id: orderId });
        if (!order) {
            return res.status(404).json({ message: "Order receipt not found." });
        }

        const productIds = (order.products || []).map((pr) => pr.product_id).filter(Boolean);
        const [productsData, shipment] = await Promise.all([
            productIds.length > 0
                ? Products.find({ product_id: { $in: productIds } }).lean()
                : Promise.resolve([]),
            Shipments.findOne({ order_id: order.order_id }),
        ]);

        const synced = await reconcileOrderAndShipment(order, shipment);
        const productMap = new Map(productsData.map((p) => [p.product_id, p]));

        const enrichedProducts = (order.products || []).map((item) => {
            const dbProd = productMap.get(item.product_id) || {};
            return {
                ...dbProd,
                product_id: item.product_id,
                name: dbProd.name || item.name || "Grocery Item",
                quantity: Math.max(1, Number(item.quantity) || 1),
                ordered_price: Number(item.price ?? dbProd.discounted_price ?? dbProd.price ?? 0),
                seller_name: item.seller_name || dbProd.seller?.name || "",
            };
        });

        const pdfBuffer = generatePosReceiptPdfBuffer(
            {
                ...(order._doc || order),
                status: synced.status,
            },
            enrichedProducts
        );

        const safeOrderId = order.order_id.replace(/[^a-zA-Z0-9_-]/g, "");
        const disposition = req.query.inline === "1" ? "inline" : "attachment";

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader(
            "Content-Disposition",
            `${disposition}; filename="KijaniMart-Receipt-${safeOrderId}.pdf"`
        );
        res.setHeader("Content-Length", pdfBuffer.length);
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(pdfBuffer);
    } catch (error) {
        return res.status(500).json({ message: error.message || "Failed to generate PDF receipt." });
    }
};
