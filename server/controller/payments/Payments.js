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
            const hasLocalLoopbackOrigin =
                typeof req.headers.origin === "string" &&
                /^http:\/\/(127\.0\.0\.1|localhost):\d+$/i.test(req.headers.origin.trim());
            const isMobileApp =
                !hasLocalLoopbackOrigin &&
                (req.body?.platform === "mobile" ||
                    req.headers["x-client-platform"] === "mobile");
            const forwardedProto = (req.headers["x-forwarded-proto"] || "")
                .toString()
                .split(",")[0]
                .trim();
            const proto = forwardedProto || req.protocol || "https";
            const host = req.get("host");
            const apiOrigin = host ? `${proto}://${host}` : baseUrl;

            const successUrl = isMobileApp
                ? `${apiOrigin}/payments/mobile-return?status=success&order=${encodeURIComponent(order_id)}&session_id={CHECKOUT_SESSION_ID}`
                : `${baseUrl}/checkout/success?order=${order_id}&session_id={CHECKOUT_SESSION_ID}`;
            const cancelUrl = isMobileApp
                ? `${apiOrigin}/payments/mobile-return?status=cancel&order=${encodeURIComponent(order_id)}`
                : `${baseUrl}/cart?canceled_order=${order_id}`;

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
                success_url: successUrl,
                cancel_url: cancelUrl,
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

/**
 * Mobile In-App Browser return bridge (`GET /payments/mobile-return`).
 * Verifies the Stripe session on the server, fulfills the order in MongoDB immediately,
 * and deep-links back into the KijaniMart Flutter app (`kijanimart://checkout`),
 * automatically closing the Android Custom Tab / In-App Browser.
 */
export const handleMobileCheckoutReturn = async (req, res) => {
    const status = (req.query.status || "success").toString();
    const orderId = (req.query.order || "").toString();
    const sessionId = (req.query.session_id || "").toString();

    let verifiedPaid = false;
    let resolvedOrderId = orderId;

    if (status === "success" && sessionId) {
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (session && session.payment_status === "paid") {
                verifiedPaid = true;
                resolvedOrderId =
                    session.metadata?.order_id || session.client_reference_id || orderId;
                let existing = await Order.findOne({ order_id: resolvedOrderId });
                if (!existing) {
                    const pending = await PendingCheckout.findOne({
                        $or: [{ stripe_session_id: session.id }, { order_id: resolvedOrderId }],
                    });
                    if (pending?.payload) {
                        await fulfillOrderData({
                            ...pending.payload,
                            stripe_session_id: session.id,
                            stripe_session_url: pending.stripe_session_url,
                        });
                        await PendingCheckout.deleteOne({ _id: pending._id }).catch(() => {});
                    } else if (session.metadata?.order_id) {
                        await fulfillOrderData(session.metadata);
                    }
                }
            }
        } catch (err) {
            console.error("Mobile return session verification error:", err.message);
        }
    } else if (status === "cancel" && orderId) {
        try {
            const existing = await Order.findOne({ order_id: orderId });
            if (!existing) {
                await PendingCheckout.findOneAndDelete({ order_id: orderId });
            }
        } catch {}
    }

    const deepLinkUrl = `kijanimart://checkout?status=${encodeURIComponent(
        verifiedPaid ? "success" : status
    )}&order=${encodeURIComponent(resolvedOrderId)}&session_id=${encodeURIComponent(sessionId)}`;
    const androidIntentUrl = `intent://checkout?status=${encodeURIComponent(
        verifiedPaid ? "success" : status
    )}&order=${encodeURIComponent(resolvedOrderId)}&session_id=${encodeURIComponent(
        sessionId
    )}#Intent;scheme=kijanimart;package=com.example.kijanimart_mobile;end`;

    const isSuccess = status === "success";
    const title = isSuccess
        ? "Payment Confirmed! Returning to KijaniMart..."
        : "Checkout Canceled — Returning to KijaniMart...";
    const subtitle = isSuccess
        ? `Order #${resolvedOrderId} has been confirmed. Redirecting back to the KijaniMart mobile app...`
        : "Your cart items are still saved. Tap below to return to the KijaniMart app.";

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#064E3B; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; padding:20px; box-sizing:border-box; }
    .card { background:#fff; color:#0F172A; max-width:380px; width:100%; border-radius:24px; padding:28px 22px; text-align:center; box-shadow:0 20px 40px rgba(0,0,0,0.28); }
    .badge { width:64px; height:64px; border-radius:50%; margin:0 auto 16px; display:flex; align-items:center; justify-content:center; font-size:30px; background:${isSuccess ? "#ECFDF5" : "#FEF3C7"}; color:${isSuccess ? "#059669" : "#D97706"}; }
    h1 { font-size:20px; font-weight:900; margin:0 0 8px; }
    p { font-size:13.5px; color:#475569; line-height:1.5; margin:0 0 20px; }
    .btn { display:block; width:100%; box-sizing:border-box; padding:14px 18px; border-radius:999px; background:#059669; color:#fff; font-weight:800; font-size:14px; text-decoration:none; }
  </style>
  <script>
    window.onload = function() {
      window.location.replace(${JSON.stringify(deepLinkUrl)});
      setTimeout(function() {
        window.location.replace(${JSON.stringify(androidIntentUrl)});
      }, 350);
    };
  </script>
</head>
<body>
  <div class="card">
    <div class="badge">${isSuccess ? "✓" : "↩"}</div>
    <h1>${title}</h1>
    <p>${subtitle}</p>
    <a class="btn" href="${deepLinkUrl}">Return to KijaniMart App</a>
  </div>
</body>
</html>`);
};
