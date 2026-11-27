import mongoose from "mongoose";
import crypto from "crypto";
import Products from "../../model/Products.js";
import Users from "../../model/Users.js";
import Order from "../../model/Orders.js";
import Shipments from "../../model/Shipments.js";
import Notifications from "../../model/Notifications.js";
import jwt from "jsonwebtoken";
import Pagination from "../../utils/pagination.js";
import CSVtoJSON from "../../utils/CSVtoJSON.js";
import { reconcileOrderAndShipment } from "../../utils/orderStatusSync.js";
import { getActiveCheckoutReservations } from "../../utils/stockAlerts.js";
import {
    buildHomeRecommendations,
    buildRelatedProductsForUser,
    invalidateRecommendationCache,
    recordUserInteraction,
    resolveOptionalUserContext,
} from "../../utils/recommendationEngine.js";
import { v2 as cloudinary } from "cloudinary";
import dotenv from "dotenv";

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const PUBLISHED_PRODUCT_FILTER = {
    is_deleted: { $ne: true },
    approval_status: { $nin: ["PENDING_APPROVAL", "REJECTED"] },
};

export const calculateEffectivePrice = (product) => {
    const basePrice = Number(product?.price || 0);
    const discount = Math.min(95, Math.max(0, Number(product?.discount || 0)));
    if (discount > 0) {
        return Number((basePrice * (1 - discount / 100)).toFixed(2));
    }
    return Number(basePrice.toFixed(2));
};

export const getProductById = async (req, res) => {
    try {
        const { id } = req.params;
        const [product, { user, sessionId }] = await Promise.all([
            Products.findOne({ product_id: id }).lean(),
            resolveOptionalUserContext(req),
        ]);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        if (product.is_deleted && user?.role !== "ADMIN") {
            return res.status(404).json({
                message: "This product is no longer available.",
            });
        }
        if (
            product.approval_status === "PENDING_APPROVAL" ||
            product.approval_status === "REJECTED"
        ) {
            const isAdmin = user?.role === "ADMIN";
            const isOwningSeller =
                user?._id &&
                product.seller?.seller_id &&
                String(user._id) === String(product.seller.seller_id);
            if (!isAdmin && !isOwningSeller) {
                return res.status(404).json({
                    message: "This product is currently pending admin approval and is not published yet.",
                });
            }
        }
        const relatedProducts = await buildRelatedProductsForUser({
            product,
            user,
            sessionId,
            limit: 4,
        });

        const effectivePrice = calculateEffectivePrice(product);
        const savingsAmount = Number((Number(product.price || 0) - effectivePrice).toFixed(2));

        return res.status(200).json({
            ...product,
            discounted_price: effectivePrice,
            savings_amount: savingsAmount,
            related_products: relatedProducts,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const findDeliveredOrderForUserProduct = async (userEmail, productId, requestedOrderId) => {
    const userOrders = await Order.find({
        email: { $regex: `^${userEmail}$`, $options: "i" },
    }).sort({ ordered_at: -1 });

    for (const ord of userOrders) {
        if (requestedOrderId && ord.order_id !== requestedOrderId) continue;
        const hasItem = (ord.products || []).some((p) => p.product_id === productId);
        if (!hasItem) continue;

        const ship = await Shipments.findOne({ order_id: ord.order_id });
        if (
            ship?.status === "DELIVERED" ||
            ship?.status === "FULFILLED" ||
            ord.status === "DELIVERED" ||
            ord.status === "FULFILLED"
        ) {
            return ord.order_id;
        }
    }
    return null;
};

export const checkReviewEligibility = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.body.id;

        const user = await Users.findById(userId);
        if (!user) {
            return res.status(200).json({ canReview: false, reason: "NOT_AUTHENTICATED" });
        }

        const product = await Products.findOne({ product_id: id });
        if (!product) {
            return res.status(404).json({ canReview: false, reason: "PRODUCT_NOT_FOUND" });
        }

        const deliveredOrderId = await findDeliveredOrderForUserProduct(
            user.email,
            id,
            req.query.order
        );

        if (!deliveredOrderId) {
            return res.status(200).json({
                canReview: false,
                eligibleOrderId: null,
                alreadyReviewed: false,
                reason: "NO_DELIVERED_ORDER",
            });
        }

        const matchedReview =
            (product.reviews || []).find((r) => {
                const sameUser =
                    r.user_id === String(user._id) ||
                    (r.user_email && r.user_email.toLowerCase() === user.email.toLowerCase());
                if (!sameUser) return false;
                return !r.order_id || r.order_id === deliveredOrderId;
            }) || null;

        const alreadyReviewed = Boolean(matchedReview);

        return res.status(200).json({
            canReview: true,
            eligibleOrderId: deliveredOrderId,
            alreadyReviewed,
            existingReview: matchedReview,
            reason: alreadyReviewed ? "ALREADY_REVIEWED" : "ELIGIBLE",
        });
    } catch (error) {
        return res.status(500).json({ canReview: false, message: error.message });
    }
};

export const addProductReview = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.body.id;
        const { product_rating, seller_rating = 5, comment = "", order_id } = req.body;

        const pRating = Number(product_rating);
        const sRating = Number(seller_rating || 5);

        if (!pRating || pRating < 1 || pRating > 5) {
            return res.status(400).json({ message: "Product rating must be between 1 and 5 stars." });
        }

        const product = await Products.findOne({ product_id: id });
        if (!product) {
            return res.status(404).json({ message: "Product not found." });
        }

        const user = await Users.findById(userId);
        if (!user) {
            return res.status(401).json({ message: "User not found." });
        }

        // Strictly verify that the user has ordered this product AND the shipment has been DELIVERED
        const verifiedOrderId = await findDeliveredOrderForUserProduct(
            user.email,
            id,
            order_id
        );

        if (!verifiedOrderId) {
            return res.status(403).json({
                message:
                    "You can only rate this product and seller after you have ordered it and your shipment has been delivered.",
            });
        }

        const newReview = {
            user_id: String(user._id),
            user_name:
                [user.first_name, user.last_name].filter(Boolean).join(" ") ||
                user.email.split("@")[0],
            user_email: user.email,
            order_id: verifiedOrderId,
            product_rating: pRating,
            seller_rating: Math.min(5, Math.max(1, sRating)),
            comment: String(comment || "").trim(),
            verified_purchase: true,
            created_at: new Date(),
        };

        const existingReviews = Array.isArray(product.reviews) ? [...product.reviews] : [];
        const existingIdx = existingReviews.findIndex(
            (r) =>
                r.user_id === String(user._id) &&
                (!verifiedOrderId || r.order_id === verifiedOrderId)
        );

        if (existingIdx >= 0) {
            existingReviews[existingIdx] = newReview;
        } else {
            existingReviews.unshift(newReview);
        }

        const totalReviews = existingReviews.length;
        const avgProductRating = Number(
            (
                existingReviews.reduce((sum, r) => sum + Number(r.product_rating || 5), 0) /
                totalReviews
            ).toFixed(1)
        );
        const avgSellerRating = Number(
            (
                existingReviews.reduce((sum, r) => sum + Number(r.seller_rating || 5), 0) /
                totalReviews
            ).toFixed(1)
        );

        product.reviews = existingReviews;
        product.rating = avgProductRating;
        product.reviews_count = totalReviews;
        if (product.seller) {
            product.seller.rating = avgSellerRating;
        } else {
            product.seller = {
                name: "FreshMart Verified Farm Partner",
                verified: true,
                rating: avgSellerRating,
                location: "Nairobi, Kenya",
            };
        }

        await product.save();
        invalidateRecommendationCache();

        await Notifications.updateMany(
            {
                type: "DELIVERY_REVIEW",
                $or: [
                    { user_id: String(user._id) },
                    { user_email: { $regex: `^${user.email}$`, $options: "i" } },
                ],
                "products.product_id": id,
            },
            {
                $set: { "products.$.reviewed": true },
            }
        );

        return res.status(201).json({
            message: "Thank you! Your product and seller rating has been submitted.",
            review: newReview,
            rating: product.rating,
            reviews_count: product.reviews_count,
            seller_rating: product.seller?.rating,
            reviews: product.reviews,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getPendingReviews = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId, { email: 1 }).lean();
        if (!user) {
            return res.status(401).json({ message: "User not found." });
        }

        const userOrders = await Order.find({
            email: { $regex: `^${user.email}$`, $options: "i" },
        })
            .sort({ ordered_at: -1 })
            .lean();

        const orderIds = userOrders.map((o) => o.order_id);
        const shipments =
            orderIds.length > 0
                ? await Shipments.find({ order_id: { $in: orderIds } }).lean()
                : [];
        const shipMap = new Map(shipments.map((s) => [s.order_id, s]));

        const deliveredOrders = [];
        for (const ord of userOrders) {
            const ship = shipMap.get(ord.order_id) || null;
            const isDelivered =
                ord.status === "DELIVERED" ||
                ord.status === "FULFILLED" ||
                ship?.status === "DELIVERED" ||
                ship?.status === "FULFILLED";

            if (isDelivered) {
                const history = ship?.status_history || ord?.status_history || [];
                const deliveredStep = [...history]
                    .reverse()
                    .find((h) => h?.status === "DELIVERED");
                deliveredOrders.push({
                    order: ord,
                    delivered_at: deliveredStep?.timestamp || ord.ordered_at,
                });
            }
        }

        const allProductIds = Array.from(
            new Set(
                deliveredOrders.flatMap(({ order }) =>
                    (order.products || []).map((p) => p.product_id).filter(Boolean)
                )
            )
        );

        const dbProducts =
            allProductIds.length > 0
                ? await Products.find(
                      { product_id: { $in: allProductIds } },
                      {
                          product_id: 1,
                          name: 1,
                          image: 1,
                          category: 1,
                          price: 1,
                          weight: 1,
                          measurement: 1,
                          seller: 1,
                          rating: 1,
                          reviews_count: 1,
                          reviews: 1,
                      }
                  ).lean()
                : [];
        const productMap = new Map(dbProducts.map((p) => [p.product_id, p]));

        const pending = [];
        const reviewed = [];
        const seenKeys = new Set();

        for (const { order, delivered_at } of deliveredOrders) {
            for (const item of order.products || []) {
                if (!item?.product_id) continue;
                const dedupeKey = `${order.order_id}::${item.product_id}`;
                if (seenKeys.has(dedupeKey)) continue;
                seenKeys.add(dedupeKey);

                const dbProd = productMap.get(item.product_id);
                const prodReviews = Array.isArray(dbProd?.reviews) ? dbProd.reviews : [];
                const matchedReview = prodReviews.find((r) => {
                    const sameUser =
                        r.user_id === String(user._id) ||
                        (r.user_email && r.user_email.toLowerCase() === user.email.toLowerCase());
                    if (!sameUser) return false;
                    return !r.order_id || r.order_id === order.order_id;
                });

                const entry = {
                    order_id: order.order_id,
                    ordered_at: order.ordered_at,
                    delivered_at,
                    product_id: item.product_id,
                    name: dbProd?.name || item.name || "Grocery Item",
                    image: dbProd?.image || "",
                    category: dbProd?.category || "",
                    price: Number(item.price ?? dbProd?.price ?? 0),
                    weight: dbProd?.weight || "",
                    measurement: dbProd?.measurement || "",
                    quantity: Number(item.quantity) || 1,
                    seller_name: dbProd?.seller?.name || "FreshMart Verified Farm Partner",
                    product_rating: Number(dbProd?.rating || 0),
                    reviews_count: Number(dbProd?.reviews_count || 0),
                };

                if (matchedReview) {
                    reviewed.push({
                        ...entry,
                        review: matchedReview,
                    });
                } else {
                    pending.push(entry);
                }
            }
        }

        return res.status(200).json({
            pending,
            reviewed,
            pending_count: pending.length,
            reviewed_count: reviewed.length,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getFlashSaleProducts = async (req, res) => {
    try {
        const flashProducts = await Products.find(
            {
                ...PUBLISHED_PRODUCT_FILTER,
                $or: [{ flash_sale: true }, { discount: { $gt: 0 } }],
                stock: { $gt: 0 },
            },
            { reviews: 0, pending_changes: 0 }
        )
            .sort({ flash_sale: -1, discount: -1 })
            .limit(8)
            .lean();

        return res.status(200).json(flashProducts);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const productsSearch = async (req, res) => {
    try {
        const itemsPerPage = 12;
        const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
        const filter = {
            ...PUBLISHED_PRODUCT_FILTER,
            name: { $regex: req.query.search, $options: "i" },
        };

        const [totalCount, productsPaged] = await Promise.all([
            Products.countDocuments(filter),
            Products.find(filter, { reviews: 0, pending_changes: 0 })
                .sort({ created_at: -1, _id: -1 })
                .skip((pageNum - 1) * itemsPerPage)
                .limit(itemsPerPage)
                .lean(),
        ]);

        const numberOfPages = Math.ceil(totalCount / itemsPerPage);
        res.status(200).json({ total_pages: numberOfPages, products: productsPaged });
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

export const updateQuantity = async (req, res) => {
    const { products } = req.body;
    if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: "No products provided for stock update" });
    }

    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            for (const item of products) {
                if (!item?.product_id) continue;
                const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));

                const updated = await Products.findOneAndUpdate(
                    {
                        product_id: item.product_id,
                        stock: { $gte: qty },
                    },
                    {
                        $inc: { stock: -qty },
                    },
                    { new: true, session }
                );

                if (!updated) {
                    const current = await Products.findOne({
                        product_id: item.product_id,
                    }).session(session);
                    const err = new Error(
                        !current
                            ? `Product ${item.product_id} was not found.`
                            : current.stock <= 0
                            ? `${current.name} is out of stock.`
                            : `Insufficient stock for ${current.name}. Available: ${current.stock}, requested: ${qty}.`
                    );
                    err.statusCode = 409;
                    throw err;
                }
            }
        });
        return res.status(200).json({ message: "updated" });
    } catch (error) {
        return res.status(error.statusCode || 500).json({ message: error.message });
    } finally {
        await session.endSession();
    }
};

export const ShowProductsPerPage = async (req, res) => {
    try {
        const itemsPerPage = 12;
        const pageNum = Math.max(1, parseInt(req.query.page, 10) || 1);
        const isFlash = String(req.query.flash || "").toLowerCase() === "true";
        const filter = { ...PUBLISHED_PRODUCT_FILTER };

        if (req.query.category && req.query.category !== "All") {
            filter.category = { $regex: req.query.category, $options: "i" };
        }
        if (isFlash) {
            filter.$or = [{ flash_sale: true }, { discount: { $gt: 0 } }];
        }

        const sortSpec = isFlash
            ? { flash_sale: -1, discount: -1, created_at: -1, _id: -1 }
            : { created_at: -1, _id: -1 };

        const [totalCount, products] = await Promise.all([
            Products.countDocuments(filter),
            Products.find(filter, { reviews: 0, pending_changes: 0 })
                .sort(sortSpec)
                .skip((pageNum - 1) * itemsPerPage)
                .limit(itemsPerPage)
                .lean(),
        ]);

        const numberOfPages = Math.ceil(totalCount / itemsPerPage);
        res.status(200).json({ total_pages: numberOfPages, products });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const PostProducts = async (req, res) => {
    try {
        const {
            name,
            description,
            price,
            discount = 0,
            flash_sale = false,
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
        } = req.body;

        const uploadedUrls = [];

        // Support both upload.single('image') and upload.fields([{ name: 'image' }, { name: 'images' }])
        const primaryFiles = req.files?.image || (req.file ? [req.file] : []);
        const galleryFiles = req.files?.images || [];
        const allFiles = [...primaryFiles, ...galleryFiles];

        for (const file of allFiles) {
            const result = await cloudinary.uploader.upload(file.path, {
                folder: "products",
            });
            if (result?.secure_url) {
                uploadedUrls.push(result.secure_url);
            }
        }

        // Also support direct image URLs passed in body
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

        if (req.body.image && typeof req.body.image === "string") {
            extraUrls.unshift(req.body.image.trim());
        }

        const allImages = Array.from(new Set([...uploadedUrls, ...extraUrls].filter(Boolean)));
        const primaryImage = allImages[0] || undefined;

        const isFlash = flash_sale === true || flash_sale === "true";

        const newProduct = new Products({
            name,
            description,
            price: Number(price),
            discount: Number(discount || 0),
            flash_sale: isFlash,
            flash_sale_ends_at: flash_sale_ends_at
                ? new Date(flash_sale_ends_at)
                : isFlash
                ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                : undefined,
            weight: Number(weight),
            measurement,
            category,
            stock: Number(stock || 0),
            brand: brand || "FreshMart Organics",
            sku: sku || undefined,
            origin: origin || "Kenyan Highlands",
            is_organic: is_organic === undefined ? true : is_organic === true || is_organic === "true",
            storage_tips: storage_tips || undefined,
            shelf_life: shelf_life || undefined,
            harvest_date: harvest_date ? new Date(harvest_date) : new Date(),
            expiry_date: expiry_date ? new Date(expiry_date) : undefined,
            seller: typeof seller === "string" ? JSON.parse(seller) : seller,
            nutrition: typeof nutrition === "string" ? JSON.parse(nutrition) : nutrition,
            tags: Array.isArray(tags)
                ? tags
                : tags
                ? String(tags)
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean)
                : undefined,
            image: primaryImage,
            images: allImages,
        });

        await newProduct.save();
        res.status(201).send(newProduct);
    } catch (error) {
        res.status(409).json({ message: error.message });
    }
};

export const trackProductInteraction = async (req, res) => {
    try {
        const { user, sessionId } = await resolveOptionalUserContext(req);
        const {
            event_type,
            product_id = null,
            category = "",
            dwell_ms = 0,
            search_query = "",
            quantity = 1,
        } = req.body || {};

        if (!event_type) {
            return res.status(400).json({ message: "Missing event_type" });
        }

        const saved = await recordUserInteraction({
            user,
            session_id: sessionId,
            event_type,
            product_id,
            category,
            dwell_ms,
            search_query,
            quantity,
        });

        return res.status(201).json({ recorded: Boolean(saved) });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const ProductsRecommendations = async (req, res) => {
    try {
        const { user, sessionId } = await resolveOptionalUserContext(req);
        const shelves = await buildHomeRecommendations({ user, sessionId });

        res.set("Cache-control", "no-store");
        return res.status(200).json(shelves);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getProductsArr = async (req, res) => {
    try {
        const { arr } = req.body;
        const products = await Products.find({
            product_id: { $in: arr },
            is_deleted: { $ne: true },
        });
        res.status(200).json(products);
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
};

/**
 * Returns live MongoDB stock & active checkout holds for a list of product IDs
 * so Cart and Checkout pages can warn and block checkout in real time when
 * another customer buys or reserves the last item.
 */
export const checkProductsStock = async (req, res) => {
    try {
        const { product_ids = [], exclude_checkout_token_id = null } = req.body || {};
        const ids = Array.isArray(product_ids) ? product_ids.filter(Boolean) : [];
        if (ids.length === 0) {
            return res.status(200).json({ products: [] });
        }

        const [dbProducts, reservedMap] = await Promise.all([
            Products.find({ product_id: { $in: ids } }),
            getActiveCheckoutReservations(ids, exclude_checkout_token_id),
        ]);

        const payload = dbProducts.map((p) => {
            const totalStock = Math.max(0, Number(p.stock || 0));
            const reservedStock = reservedMap.get(p.product_id) || 0;
            const availableStock = Math.max(0, totalStock - reservedStock);
            return {
                product_id: p.product_id,
                name: p.name,
                stock: totalStock,
                reserved_stock: reservedStock,
                available_stock: availableStock,
                price: Number(p.price || 0),
                discount: Number(p.discount || 0),
                discounted_price: calculateEffectivePrice(p),
            };
        });

        res.set("Cache-control", "no-store");
        return res.status(200).json({ products: payload });
    } catch (e) {
        return res.status(500).json({ message: e.message });
    }
};

/**
 * Validates cart products before processing to purchasing (applying product discounts)
 */
export const validateCart = async (req, res) => {
    const { cart } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
        return res.status(400).json({
            message: "Your cart is empty.",
        });
    }

    let totalPrice = 0;
    let originalTotal = 0;
    const products = [];

    // Aggregate duplicate product_ids in the request payload to prevent split-line stock bypass
    const aggregatedMap = new Map();
    for (const item of cart) {
        if (!item?.product_id) continue;
        const qty = Math.floor(Number(item.quantity) || 0);
        if (qty <= 0) {
            return res.status(400).json({
                message: `Invalid quantity for ${item.name || item.product_id}.`,
                product_id: item.product_id,
            });
        }
        const existing = aggregatedMap.get(item.product_id);
        if (existing) {
            existing.quantity += qty;
        } else {
            aggregatedMap.set(item.product_id, {
                ...item,
                quantity: qty,
            });
        }
    }

    const normalizedCart = Array.from(aggregatedMap.values());

    try {
        const productIds = normalizedCart.map((c) => c.product_id);
        const [dbProducts, reservedMap] = await Promise.all([
            Products.find({ product_id: { $in: productIds } }),
            getActiveCheckoutReservations(productIds),
        ]);
        const dbMap = new Map(dbProducts.map((p) => [p.product_id, p]));

        for (const cartProduct of normalizedCart) {
            const product = dbMap.get(cartProduct.product_id);

            if (!product || product.is_deleted)
                return res.status(404).json({
                    message: `"${cartProduct.name}" is no longer available in the store. Please remove it from your cart.`,
                    code: "PRODUCT_REMOVED",
                    product_id: cartProduct.product_id,
                });

            if (
                product.approval_status === "PENDING_APPROVAL" ||
                product.approval_status === "REJECTED"
            )
                return res.status(409).json({
                    message: `"${product.name}" is currently not published on the storefront. Please remove it from your cart.`,
                    code: "UNPUBLISHED_PRODUCT",
                    product_id: product.product_id,
                });

            const totalStock = Math.max(0, Number(product.stock || 0));
            const reservedByOthers = reservedMap.get(product.product_id) || 0;
            const availableStock = Math.max(0, totalStock - reservedByOthers);

            if (totalStock <= 0)
                return res.status(409).json({
                    message: `"${product.name}" just sold out (0 in stock). Someone else purchased the last item — please remove it from your cart.`,
                    code: "OUT_OF_STOCK",
                    product_id: product.product_id,
                    available_stock: 0,
                });

            if (availableStock <= 0 && reservedByOthers > 0)
                return res.status(409).json({
                    message: `The last remaining unit(s) of "${product.name}" are currently reserved in another shopper's active checkout. Please try again in a few minutes.`,
                    code: "RESERVED_IN_CHECKOUT",
                    product_id: product.product_id,
                    available_stock: 0,
                    reserved_stock: reservedByOthers,
                });

            if (availableStock < cartProduct.quantity)
                return res.status(409).json({
                    message: `Only ${availableStock} unit(s) of "${product.name}" available right now (you have ${cartProduct.quantity} in your cart). Please adjust the quantity.`,
                    code: "INSUFFICIENT_STOCK",
                    product_id: product.product_id,
                    available_stock: availableStock,
                    reserved_stock: reservedByOthers,
                });

            const effectiveUnitPrice = calculateEffectivePrice(product);
            originalTotal += Number(product.price) * Number(cartProduct.quantity);
            totalPrice += effectiveUnitPrice * Number(cartProduct.quantity);

            products.push({
                product_id: product.product_id,
                name: product.name,
                price: effectiveUnitPrice,
                original_price: product.price,
                discount: product.discount || 0,
                quantity: cartProduct.quantity,
            });
        }

        totalPrice = Number(totalPrice.toFixed(2));
        originalTotal = Number(originalTotal.toFixed(2));
        const totalSavings = Number((originalTotal - totalPrice).toFixed(2));

        // Unique checkout token identifier (jti) for strict idempotency and double-checkout prevention
        const checkoutTokenId = crypto.randomUUID();

        const token = jwt.sign(
            {
                jti: checkoutTokenId,
                products: products,
                total: totalPrice.toFixed(2),
                original_total: originalTotal.toFixed(2),
                savings: totalSavings.toFixed(2),
            },
            process.env.JWT_SECRET_KEY,
            { expiresIn: "1d" }
        );

        return res.status(200).json({
            checkout_token_id: checkoutTokenId,
            total: totalPrice.toFixed(2),
            original_total: originalTotal.toFixed(2),
            savings: totalSavings.toFixed(2),
            cart: normalizedCart,
            token: token,
        });
    } catch (e) {
        return res.status(500).json({
            message: e.message,
        });
    }
};

export const adminUpdateProducts = async (req, res) => {
    const { csv, mode } = req.body;

    if (!["UPDATE", "REGENERATE"].includes(mode))
        return res.status(400).json({ message: " Unknown mode" });

    const productsJson = CSVtoJSON(csv);

    try {
        if (mode === "UPDATE") {
            const updatedProducts = await updateProducts(productsJson);
            return res.status(200).json(updatedProducts);
        }

        if (mode === "REGENERATE") {
            const updatedProducts = await regenerateDatabase(productsJson);
            return res.status(200).json(updatedProducts);
        }
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
};

const updateProducts = async (products) => {
    const updated = [];

    for (const product of products) {
        const res = await Products.updateOne({ product_id: product.product_id }, product);

        if (res.modifiedCount !== 0) updated.push(product);
        else if (res.matchedCount === 0) {
            await Products.create(product);
            updated.push(product);
        }
    }

    return updated;
};

const regenerateDatabase = async (products) => {
    await Products.deleteMany();
    await Products.insertMany(products);
    return products;
};
