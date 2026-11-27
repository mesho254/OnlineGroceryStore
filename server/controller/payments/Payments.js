import crypto from "crypto";
import { stripe } from "../../index.js";
import jwt from "jsonwebtoken";
import Order, { PendingCheckout } from "../../model/Orders.js";
import Products from "../../model/Products.js";
import Notifications from "../../model/Notifications.js";
import Shipments from "../../model/Shipments.js";
import generateId from "../../utils/generateId.js";
import { WEBSITE_BASE_URL } from "../../services/BaseURLs.js";
import {
    fulfillOrderData,
    rollbackOrderData,
} from "../orders/Orders.js";
import { verifyLiveAvailableStock } from "../../utils/stockAlerts.js";
import { recordAuditLog } from "../../model/AuditLogs.js";

// In-flight payment locks keyed by checkout_token_id to prevent double-click race conditions
const inFlightPaymentLocks = new Map();

const deriveCheckoutTokenId = (req, decodedToken, products, email) => {
    if (req.body.idempotency_key && typeof req.body.idempotency_key === "string") {
        return crypto
            .createHash("sha256")
            .update(`idem:${req.body.idempotency_key.trim()}`)
            .digest("hex");
    }
    if (decodedToken?.jti) {
        return String(decodedToken.jti);
    }
    if (req.body.token && typeof req.body.token === "string") {
        return crypto
            .createHash("sha256")
            .update(`jwt:${req.body.token.trim()}`)
            .digest("hex");
    }
    const bucket = Math.floor(Date.now() / 15000);
    const sig = JSON.stringify({
        email: email || "",
        items: (products || []).map((p) => ({
            id: p.product_id,
            q: Number(p.quantity) || 1,
        })),
        bucket,
    });
    return crypto.createHash("sha256").update(sig).digest("hex");
};

/**
 * Verify that all products in the cart currently have enough unreserved stock in MongoDB
 * before redirecting the user to Stripe Checkout.
 */
const verifyLiveStockAvailability = async (products, excludeCheckoutTokenId = null) => {
    await verifyLiveAvailableStock(products, excludeCheckoutTokenId);
};

export const createCheckoutSession = async (req, res) => {
    try {
        let products = req.body.products;
        let total = req.body.total;
        let decodedToken = null;

        if (req.body.token) {
            try {
                decodedToken = jwt.verify(req.body.token, process.env.JWT_SECRET_KEY);
                products = decodedToken.products;
                total = decodedToken.total;
            } catch {
                return res.status(401).json({
                    message: "Your checkout session expired. Please return to your cart and proceed to checkout again.",
                });
            }
        }

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({
                message: "No cart products or valid checkout token provided",
            });
        }

        if (total === undefined || total === null) {
            total = products.reduce(
                (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
                0
            );
        }

        const data = req.body.data || {};
        const checkout_token_id = deriveCheckoutTokenId(req, decodedToken, products, data.email);

        // 1. If a concurrent request with the same checkout_token_id is already in-flight, await and deduplicate
        if (inFlightPaymentLocks.has(checkout_token_id)) {
            const existingResult = await inFlightPaymentLocks.get(checkout_token_id);
            return res.status(200).json({
                ...existingResult,
                deduplicated: true,
            });
        }

        // 2. Check if this checkout token has ALREADY been paid & fulfilled in Order
        const existingFulfilledOrder = await Order.findOne({ checkout_token_id });
        if (existingFulfilledOrder) {
            // Check with Stripe if that order's session was actually paid; if it was an old unpaid order from before, clean it up!
            let wasActuallyPaid = false;
            if (existingFulfilledOrder.stripe_session_id) {
                try {
                    const prevSession = await stripe.checkout.sessions.retrieve(
                        existingFulfilledOrder.stripe_session_id
                    );
                    wasActuallyPaid = prevSession?.payment_status === "paid";
                } catch {
                    wasActuallyPaid = false;
                }
            }

            if (wasActuallyPaid) {
                return res.status(409).json({
                    message: `Order #${existingFulfilledOrder.order_id} has already been paid and confirmed.`,
                    order_id: existingFulfilledOrder.order_id,
                });
            } else {
                // Clean up any legacy pre-payment order that wasn't paid yet
                await rollbackOrderData(existingFulfilledOrder.order_id);
            }
        }

        const checkoutPromise = (async () => {
            // 3. Verify live stock availability (minus active holds by other shoppers) BEFORE creating a Stripe session
            await verifyLiveStockAvailability(products, checkout_token_id);

            // Reuse existing pending order_id if user clicked Back from Stripe and is retrying the same checkout token
            const existingPending = await PendingCheckout.findOne({ checkout_token_id });
            const order_id = existingPending?.order_id || generateId();

            const addressPayload = {
                delivery_method: data.address?.delivery_method || "DOORSTEP",
                country: data.address?.country || "Kenya",
                city: data.address?.city || "",
                area: data.address?.area || "",
                street: data.address?.street || "",
                building_number: data.address?.building_number || "",
                floor: data.floor ?? data.address?.floor ?? "",
                apartment_number: data.address?.apartment_number || "",
                formatted_address: data.address?.formatted_address || "",
                google_maps_url: data.address?.google_maps_url || "",
                coordinates: data.address?.coordinates || null,
                pickup_station: data.address?.pickup_station || null,
            };

            const fullOrderData = {
                order_id,
                checkout_token_id,
                firstName: data.name?.first || "",
                lastName: data.name?.last || "",
                email: data.email || "",
                phone_number: data.phone_number || "",
                address: addressPayload,
                products: products.map((product) => ({
                    product_id: product.product_id,
                    name: product.name,
                    quantity: Number(product.quantity) || 1,
                })),
                total: String(total),
            };

            // Stripe requires every metadata value to be <= 500 characters.
            const compactItemsSummary = products
                .map((p) => `${p.product_id}:${Number(p.quantity) || 1}`)
                .join(",")
                .slice(0, 450);

            const stripeMetadata = {
                order_id: String(order_id),
                checkout_token_id: String(checkout_token_id).slice(0, 120),
                customer_name: `${data.name?.first || ""} ${data.name?.last || ""}`
                    .trim()
                    .slice(0, 120),
                email: String(data.email || "").slice(0, 120),
                phone_number: String(data.phone_number || "").slice(0, 60),
                delivery_method: String(addressPayload.delivery_method || "DOORSTEP").slice(0, 40),
                city: String(addressPayload.city || "").slice(0, 80),
                items_count: String(products.length),
                items_summary: compactItemsSummary,
                total: String(total),
            };

            const baseUrl =
                req.headers.origin || process.env.WEBSITE_BASE_URL || WEBSITE_BASE_URL;

            const session = await stripe.checkout.sessions.create({
                mode: "payment",
                customer_email: data.email || undefined,
                client_reference_id: order_id,
                line_items: products.map((product) => ({
                    price_data: {
                        currency: "kes",
                        product_data: {
                            name: product.name || "Grocery Item",
                        },
                        unit_amount: Math.round(Number(product.price) * 100),
                    },
                    quantity: Number(product.quantity) || 1,
                })),
                metadata: stripeMetadata,
                payment_intent_data: {
                    metadata: stripeMetadata,
                },
                success_url: `${baseUrl}/checkout/success?order=${order_id}&session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${baseUrl}/cart?canceled_order=${order_id}`,
            });

            // 4. Stage as a PendingCheckout ONLY — DO NOT create the Order, deduct stock,
            // create notifications, or send confirmation emails until payment succeeds on Stripe!
            await PendingCheckout.findOneAndUpdate(
                { order_id },
                {
                    order_id,
                    checkout_token_id,
                    stripe_session_id: session.id,
                    stripe_session_url: session.url,
                    payload: fullOrderData,
                    created_at: new Date(),
                },
                { upsert: true, new: true }
            );

            return {
                url: session.url,
                sessionId: session.id,
                order_id,
            };
        })();

        inFlightPaymentLocks.set(checkout_token_id, checkoutPromise);

        try {
            const result = await checkoutPromise;
            return res.status(201).json(result);
        } finally {
            inFlightPaymentLocks.delete(checkout_token_id);
        }
    } catch (error) {
        console.log(error);
        const statusCode = error.statusCode || 500;
        return res.status(statusCode).json({
            message: error.message,
            code: error.code || "CHECKOUT_ERROR",
            product_id: error.product_id,
        });
    }
};

export const verifyCheckoutSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (!session) {
            return res.status(404).json({ message: "Stripe checkout session not found" });
        }

        const order_id = session.metadata?.order_id || session.client_reference_id;

        // Strictly require payment_status === "paid" before confirming the order, deducting stock, or sending email
        if (session.payment_status !== "paid") {
            return res.status(402).json({
                id: session.id,
                status: session.status,
                payment_status: session.payment_status,
                order_id,
                message: "Payment has not been completed. Order was not confirmed.",
            });
        }

        let fulfilledOrder = await Order.findOne({ order_id });

        if (!fulfilledOrder) {
            const pending = await PendingCheckout.findOne({
                $or: [{ stripe_session_id: session.id }, { order_id }],
            });

            try {
                if (pending?.payload) {
                    fulfilledOrder = await fulfillOrderData({
                        ...pending.payload,
                        stripe_session_id: session.id,
                        stripe_session_url: pending.stripe_session_url,
                    });
                    await PendingCheckout.deleteOne({ _id: pending._id }).catch(() => {});
                } else if (order_id) {
                    fulfilledOrder = await fulfillOrderData(session.metadata);
                }
            } catch (fulfillErr) {
                // Last-line-of-defense race guard: if another buyer purchased the last unit milliseconds earlier
                // while both shoppers were simultaneously paying on Stripe, automatically refund this payment!
                if (fulfillErr?.code === "OUT_OF_STOCK" || fulfillErr?.statusCode === 409) {
                    let refunded = false;
                    if (session.payment_intent) {
                        try {
                            await stripe.refunds.create({
                                payment_intent:
                                    typeof session.payment_intent === "string"
                                        ? session.payment_intent
                                        : session.payment_intent.id,
                                reason: "requested_by_customer",
                            });
                            refunded = true;
                        } catch (refundErr) {
                            console.error("Automatic out-of-stock Stripe refund failed:", refundErr.message);
                        }
                    }

                    if (pending?._id) {
                        await PendingCheckout.deleteOne({ _id: pending._id }).catch(() => {});
                    }

                    const customerEmail =
                        session.customer_details?.email ||
                        session.customer_email ||
                        pending?.payload?.email ||
                        "";
                    if (customerEmail) {
                        await Notifications.create({
                            user_email: customerEmail,
                            type: "SYSTEM",
                            title: refunded
                                ? "Item Sold Out — Automatic Refund Issued"
                                : "Item Sold Out During Checkout",
                            message: refunded
                                ? `${fulfillErr.message} Your payment has been automatically refunded to your original payment method.`
                                : `${fulfillErr.message} Please contact support if you were charged.`,
                            link: "/cart",
                            read: false,
                            dismissed_popup: true,
                        }).catch(() => {});
                    }

                    await recordAuditLog({
                        action: "CHECKOUT_OUT_OF_STOCK_RACE_REFUND",
                        category: "ORDERS",
                        severity: "DANGER",
                        actor_email: customerEmail || "customer",
                        actor_name: "Concurrency Guard",
                        target_id: order_id || session.id,
                        details: `${fulfillErr.message} Auto-refund status: ${
                            refunded ? "REFUNDED" : "MANUAL_REVIEW"
                        }.`,
                    });

                    return res.status(409).json({
                        code: refunded ? "OUT_OF_STOCK_REFUNDED" : "OUT_OF_STOCK",
                        refunded,
                        product_id: fulfillErr.product_id,
                        message: refunded
                            ? `${fulfillErr.message} Another shopper completed checkout first — your Stripe payment has been automatically refunded.`
                            : `${fulfillErr.message} Another shopper completed checkout first.`,
                    });
                }
                throw fulfillErr;
            }
        }

        return res.status(200).json({
            id: session.id,
            status: session.status,
            payment_status: session.payment_status,
            order_id: fulfilledOrder?.order_id || order_id,
            customer_email: session.customer_details?.email || session.customer_email,
            amount_total: session.amount_total,
            currency: session.currency,
        });
    } catch (error) {
        const statusCode = error.statusCode || 400;
        return res.status(statusCode).json({
            message: error.message,
            code: error.code || "VERIFY_ERROR",
        });
    }
};

/**
 * Immediately releases a PendingCheckout stock reservation when a shopper clicks
 * Back / Cancel on Stripe Checkout so other shoppers can purchase the item right away.
 */
export const cancelPendingCheckout = async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({ message: "Missing orderId" });
        }
        const existingOrder = await Order.findOne({ order_id: orderId });
        if (existingOrder) {
            return res.status(200).json({ released: false, reason: "ALREADY_CONFIRMED" });
        }
        const deleted = await PendingCheckout.findOneAndDelete({ order_id: orderId });
        return res.status(200).json({ released: Boolean(deleted), order_id: orderId });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const webhook = async (req, res) => {
    const eventType = req.body?.type;
    const obj = req.body?.data?.object;
    const metadata = obj?.metadata;
    try {
        const isPaidSession =
            eventType === "checkout.session.completed" && obj?.payment_status === "paid";
        const isPaidChargeOrIntent =
            eventType === "charge.succeeded" || eventType === "payment_intent.succeeded";

        if ((isPaidSession || isPaidChargeOrIntent) && metadata?.order_id) {
            const pending = await PendingCheckout.findOne({ order_id: metadata.order_id });
            if (pending?.payload) {
                await fulfillOrderData({
                    ...pending.payload,
                    stripe_session_id: pending.stripe_session_id,
                    stripe_session_url: pending.stripe_session_url,
                });
                await PendingCheckout.deleteOne({ _id: pending._id }).catch(() => {});
            } else {
                await fulfillOrderData(metadata);
            }
        }
        res.status(200).json(metadata || { received: true });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};
