import crypto from "crypto";
import { issueAuthTokens } from "../../utils/authTokens.js";
import { v2 as cloudinary } from "cloudinary";
import Users from "../../model/Users.js";
import Products from "../../model/Products.js";
import Order, { ORDER_STATUS_ENUM } from "../../model/Orders.js";
import Shipments from "../../model/Shipments.js";
import Notifications from "../../model/Notifications.js";
import { recordAuditLog } from "../../model/AuditLogs.js";
import { calculateEffectivePrice } from "../products/Products.js";
import { normalizeStatusKey, reconcileOrderAndShipment } from "../../utils/orderStatusSync.js";
import {
    syncAdminStockNotificationsForProducts,
    syncSellerStockNotificationsForProducts,
} from "../../utils/stockAlerts.js";
import {
    computeProductPurgeDate,
    PRODUCT_TRASH_RETENTION_DAYS,
} from "../../jobs/trashPurgeCron.js";

const RETURNED_STATUSES = new Set([
    "RETURN_IN_PROGRESS",
    "RETURNED",
    "REFUNDED",
    "FAILED_DELIVERY",
]);
const CANCELLED_STATUSES = new Set([
    "CANCELLED",
    "CANCELLED_PAYMENT_UNSUCCESSFUL",
]);
const NON_EARNING_STATUSES = new Set([...RETURNED_STATUSES, ...CANCELLED_STATUSES]);

const formatUserSafe = (u) => ({
    _id: u._id,
    email: u.email,
    first_name: u.first_name,
    last_name: u.last_name,
    phone: u.phone || "",
    avatar: u.avatar || "",
    bio: u.bio || "",
    address: u.address || {},
    role: u.role,
    seller_profile: u.seller_profile || { status: "NONE" },
    wishlist: u.wishlist || [],
    cart: u.cart || [],
});

const notifyAllAdmins = async ({ type, title, message, link, order_id }) => {
    try {
        const admins = await Users.find({ role: "ADMIN" }, { _id: 1, email: 1 });
        for (const admin of admins) {
            await Notifications.create({
                user_id: String(admin._id),
                user_email: admin.email,
                ...(order_id ? { order_id } : {}),
                type,
                title,
                message,
                link,
                read: false,
                dismissed_popup: true,
            });
        }
    } catch (err) {
        console.warn("Admin notification dispatch skipped:", err.message);
    }
};

const getAuthUserId = (req) => req.userId || req.body?.id;

const ensureApprovedSeller = async (userId) => {
    if (!userId) return { error: { status: 401, message: "Authentication required." } };
    const user = await Users.findById(userId, { password: 0 });
    if (!user) return { error: { status: 404, message: "User account not found." } };
    if (user.is_deleted || user.account_status === "SUSPENDED") {
        return {
            error: {
                status: 403,
                message:
                    "Your account is currently suspended and archived in GDPR Trash. Contact an administrator to restore access.",
            },
        };
    }

    const sellerStatus = user.seller_profile?.status || "NONE";
    if (sellerStatus !== "APPROVED") {
        const msgMap = {
            PENDING:
                "Your seller application is pending admin approval. You will gain portal access once an administrator approves your store.",
            REJECTED:
                user.seller_profile?.rejection_reason
                    ? `Your seller application was rejected: ${user.seller_profile.rejection_reason}`
                    : "Your seller application was rejected by an administrator.",
            SUSPENDED:
                "Your seller store has been suspended by an administrator. Please contact support.",
            NONE: "You have not registered a seller store yet.",
        };
        return {
            error: {
                status: 403,
                seller_status: sellerStatus,
                message: msgMap[sellerStatus] || "Seller approval required.",
            },
        };
    }

    return { seller: user };
};

const extractSellerOrdersAndMetrics = async (sellerUser) => {
    const sellerId = String(sellerUser._id);
    const sellerProducts = await Products.find({
        "seller.seller_id": sellerId,
        is_deleted: { $ne: true },
    }).sort({
        created_at: -1,
        _id: -1,
    });
    const sellerProductMap = new Map(sellerProducts.map((p) => [p.product_id, p]));
    const sellerProductIds = new Set(sellerProducts.map((p) => p.product_id));

    const allOrders = await Order.find().sort({ ordered_at: -1 });
    const matchedOrders = allOrders.filter((ord) =>
        (ord.products || []).some(
            (item) => item?.seller_id === sellerId || sellerProductIds.has(item?.product_id)
        )
    );

    const matchedIds = matchedOrders.map((o) => o.order_id);
    const shipments =
        matchedIds.length > 0 ? await Shipments.find({ order_id: { $in: matchedIds } }) : [];
    const shipMap = new Map(shipments.map((s) => [s.order_id, s]));

    const perProductStats = new Map();
    for (const prod of sellerProducts) {
        perProductStats.set(prod.product_id, {
            product_id: prod.product_id,
            name: prod.name,
            category: prod.category,
            image: prod.image,
            stock: Number(prod.stock || 0),
            price: Number(prod.price || 0),
            discount: Number(prod.discount || 0),
            discounted_price: calculateEffectivePrice(prod),
            units_sold: 0,
            returned_units: 0,
            earnings: 0,
            orders_count: 0,
        });
    }

    let totalEarnings = 0;
    let deliveredEarnings = 0;
    let pendingEarnings = 0;
    let returnedAmount = 0;
    let totalUnitsSold = 0;
    let returnedUnitsCount = 0;
    let deliveredOrdersCount = 0;
    let returnedOrdersCount = 0;
    let cancelledOrdersCount = 0;
    let activeOrdersCount = 0;

    // 7-day earnings chart buckets
    const days = [];
    const dayMap = new Map();
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const entry = {
            dateKey: key,
            day: d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric" }),
            earnings: 0,
            units: 0,
            orders: 0,
        };
        days.push(entry);
        dayMap.set(key, entry);
    }

    const scopedOrders = [];

    for (const ord of matchedOrders) {
        const synced = await reconcileOrderAndShipment(ord, shipMap.get(ord.order_id) || null);
        const canonicalStatus = normalizeStatusKey(synced.status);

        const sellerItems = (ord.products || [])
            .filter(
                (item) => item?.seller_id === sellerId || sellerProductIds.has(item?.product_id)
            )
            .map((item) => {
                const dbProd = sellerProductMap.get(item.product_id);
                const qty = Math.max(1, Number(item.quantity || 1));
                const unitPrice = Number(
                    item.price ?? (dbProd ? calculateEffectivePrice(dbProd) : 0)
                );
                const lineTotal = Number((unitPrice * qty).toFixed(2));
                return {
                    product_id: item.product_id,
                    name: dbProd?.name || item.name || "Product",
                    image: dbProd?.image || "",
                    category: dbProd?.category || "",
                    quantity: qty,
                    unit_price: unitPrice,
                    line_total: lineTotal,
                };
            });

        const orderSellerSubtotal = Number(
            sellerItems.reduce((sum, it) => sum + it.line_total, 0).toFixed(2)
        );
        const orderSellerUnits = sellerItems.reduce((sum, it) => sum + it.quantity, 0);

        const isReturned = RETURNED_STATUSES.has(canonicalStatus);
        const isCancelled = CANCELLED_STATUSES.has(canonicalStatus);
        const isDelivered = canonicalStatus === "DELIVERED";

        if (isReturned) {
            returnedOrdersCount += 1;
            returnedUnitsCount += orderSellerUnits;
            returnedAmount = Number((returnedAmount + orderSellerSubtotal).toFixed(2));
        } else if (isCancelled) {
            cancelledOrdersCount += 1;
        } else {
            totalEarnings = Number((totalEarnings + orderSellerSubtotal).toFixed(2));
            totalUnitsSold += orderSellerUnits;
            if (isDelivered) {
                deliveredOrdersCount += 1;
                deliveredEarnings = Number((deliveredEarnings + orderSellerSubtotal).toFixed(2));
            } else {
                activeOrdersCount += 1;
                pendingEarnings = Number((pendingEarnings + orderSellerSubtotal).toFixed(2));
            }

            if (ord.ordered_at) {
                const dKey = new Date(ord.ordered_at).toISOString().slice(0, 10);
                const bucket = dayMap.get(dKey);
                if (bucket) {
                    bucket.earnings = Number((bucket.earnings + orderSellerSubtotal).toFixed(2));
                    bucket.units += orderSellerUnits;
                    bucket.orders += 1;
                }
            }
        }

        for (const it of sellerItems) {
            const stat = perProductStats.get(it.product_id);
            if (!stat) continue;
            stat.orders_count += 1;
            if (isReturned) {
                stat.returned_units += it.quantity;
            } else if (!isCancelled) {
                stat.units_sold += it.quantity;
                stat.earnings = Number((stat.earnings + it.line_total).toFixed(2));
            }
        }

        const myUpdate =
            [...(ord.seller_updates || [])]
                .reverse()
                .find((u) => u.seller_id === sellerId) || null;

        scopedOrders.push({
            order_id: ord.order_id,
            ordered_at: ord.ordered_at,
            customer_name:
                [ord.name?.first, ord.name?.last].filter(Boolean).join(" ") || "Customer",
            delivery_method: ord.address?.delivery_method || "DOORSTEP",
            destination_city: ord.address?.city || "Nairobi",
            destination_area: ord.address?.area || ord.address?.pickup_station?.name || "",
            customer_status: canonicalStatus,
            seller_items: sellerItems,
            seller_units_count: orderSellerUnits,
            seller_order_earnings: orderSellerSubtotal,
            seller_update: myUpdate,
        });
    }

    // Aggregate all verified customer reviews across this seller's products
    const allReviews = [];
    const perProductRatings = [];
    for (const prod of sellerProducts) {
        const prodReviews = Array.isArray(prod.reviews) ? prod.reviews : [];
        const pCount = prodReviews.length;
        const avgProd =
            pCount > 0
                ? Number(
                      (
                          prodReviews.reduce((s, r) => s + Number(r.product_rating || 5), 0) /
                          pCount
                      ).toFixed(2)
                  )
                : Number(prod.rating || 0);
        const avgSel =
            pCount > 0
                ? Number(
                      (
                          prodReviews.reduce((s, r) => s + Number(r.seller_rating || 5), 0) /
                          pCount
                      ).toFixed(2)
                  )
                : Number(prod.seller?.rating || 0);

        perProductRatings.push({
            product_id: prod.product_id,
            name: prod.name,
            image: prod.image,
            category: prod.category,
            product_rating: avgProd,
            seller_rating: avgSel,
            reviews_count: pCount,
        });

        for (const rev of prodReviews) {
            allReviews.push({
                _id: rev._id,
                product_id: prod.product_id,
                product_name: prod.name,
                product_image: prod.image,
                order_id: rev.order_id || "",
                user_name: rev.user_name || "Verified Buyer",
                product_rating: Number(rev.product_rating || 5),
                seller_rating: Number(rev.seller_rating || 5),
                comment: rev.comment || "",
                created_at: rev.created_at,
            });
        }
    }

    allReviews.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

    const totalReviews = allReviews.length;
    const overallSellerRating =
        totalReviews > 0
            ? Number(
                  (
                      allReviews.reduce((s, r) => s + r.seller_rating, 0) / totalReviews
                  ).toFixed(2)
              )
            : 0;
    const overallProductRating =
        totalReviews > 0
            ? Number(
                  (
                      allReviews.reduce((s, r) => s + r.product_rating, 0) / totalReviews
                  ).toFixed(2)
              )
            : 0;

    const starDistribution = [5, 4, 3, 2, 1].map((star) => {
        const count = allReviews.filter((r) => Math.round(r.seller_rating) === star).length;
        return {
            star,
            count,
            pct: totalReviews > 0 ? Math.round((count / totalReviews) * 100) : 0,
        };
    });

    return {
        sellerProducts,
        perProductStats,
        scopedOrders,
        allReviews,
        perProductRatings,
        starDistribution,
        earningsTrend: days,
        kpis: {
            total_products: sellerProducts.length,
            published_products: sellerProducts.filter(
                (p) => !p.approval_status || p.approval_status === "APPROVED"
            ).length,
            pending_approval_products: sellerProducts.filter(
                (p) => p.approval_status === "PENDING_APPROVAL"
            ).length,
            pending_edits_products: sellerProducts.filter((p) => Boolean(p.pending_changes)).length,
            rejected_products: sellerProducts.filter(
                (p) => p.approval_status === "REJECTED"
            ).length,
            low_stock_products: sellerProducts.filter(
                (p) => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= 10
            ).length,
            out_of_stock_products: sellerProducts.filter((p) => Number(p.stock || 0) <= 0).length,
            total_orders_received: scopedOrders.length,
            active_orders_count: activeOrdersCount,
            delivered_orders_count: deliveredOrdersCount,
            returned_orders_count: returnedOrdersCount,
            cancelled_orders_count: cancelledOrdersCount,
            total_units_sold: totalUnitsSold,
            returned_units_count: returnedUnitsCount,
            total_earnings: totalEarnings,
            delivered_earnings: deliveredEarnings,
            pending_earnings: pendingEarnings,
            returned_amount: returnedAmount,
            overall_seller_rating: overallSellerRating,
            overall_product_rating: overallProductRating,
            total_reviews_count: totalReviews,
        },
    };
};

/**
 * Public seller registration — creates account with seller_profile.status = "PENDING".
 * Admin must approve before seller can access the Seller Portal.
 */
export const registerSeller = async (req, res) => {
    try {
        const {
            first_name,
            last_name = "",
            email,
            password,
            phone = "",
            store_name,
            business_location = "Nairobi, Kenya",
            business_description = "",
            category_focus = "General Groceries",
        } = req.body || {};

        if (!first_name?.trim() || !email?.trim() || !password || !store_name?.trim()) {
            return res.status(400).json({
                message: "First name, email, password, and store name are required.",
            });
        }
        if (String(password).length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters long.",
            });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const existing = await Users.findOne({
            email: { $regex: `^${normalizedEmail}$`, $options: "i" },
        });
        if (existing) {
            return res.status(409).json({
                message:
                    "An account with this email already exists. Please sign in on the Seller Portal and submit your seller application.",
            });
        }

        const newSeller = await Users.create({
            first_name: String(first_name).trim(),
            last_name: String(last_name).trim(),
            email: normalizedEmail,
            password,
            phone: String(phone).trim(),
            role: "SELLER",
            seller_profile: {
                store_name: String(store_name).trim(),
                business_phone: String(phone).trim(),
                business_location: String(business_location).trim() || "Nairobi, Kenya",
                business_description: String(business_description).trim(),
                category_focus: String(category_focus).trim() || "General Groceries",
                status: "PENDING",
                applied_at: new Date(),
            },
        });

        const tokens = await issueAuthTokens(newSeller);

        const sellerDisplayName =
            [newSeller.first_name, newSeller.last_name].filter(Boolean).join(" ") ||
            newSeller.email;

        await notifyAllAdmins({
            type: "SELLER_APPLICATION",
            title: `🏪 New Seller Application: ${newSeller.seller_profile.store_name}`,
            message: `${sellerDisplayName} (${newSeller.email}) applied to sell on KijaniMart. Review & approve in Admin → Sellers.`,
            link: "/admin?tab=sellers",
        });

        await recordAuditLog({
            action: "SELLER_APPLICATION_SUBMITTED",
            category: "SELLERS",
            severity: "WARNING",
            actor_email: newSeller.email,
            actor_name: sellerDisplayName,
            target_id: String(newSeller._id),
            details: `New seller registration "${newSeller.seller_profile.store_name}" awaiting admin approval.`,
        });

        return res.status(201).json({
            message:
                "Seller registration submitted! An administrator will review and approve your store shortly.",
            user: formatUserSafe(newSeller),
            ...tokens,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

/**
 * Allows an existing signed-in user (or a previously rejected applicant) to apply for Seller status.
 */
export const applyAsSeller = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        if (user.seller_profile?.status === "APPROVED") {
            return res.status(400).json({
                message: "Your seller store is already approved!",
                user: formatUserSafe(user),
            });
        }

        const {
            store_name,
            business_phone = user.phone || "",
            business_location = user.address?.city || "Nairobi, Kenya",
            business_description = "",
            category_focus = "General Groceries",
        } = req.body || {};

        if (!store_name?.trim()) {
            return res.status(400).json({ message: "Please provide your Store / Farm Name." });
        }

        user.seller_profile = {
            store_name: String(store_name).trim(),
            business_phone: String(business_phone).trim(),
            business_location: String(business_location).trim() || "Nairobi, Kenya",
            business_description: String(business_description).trim(),
            category_focus: String(category_focus).trim() || "General Groceries",
            status: "PENDING",
            rejection_reason: "",
            applied_at: new Date(),
        };
        if (user.role !== "ADMIN") {
            user.role = "SELLER";
        }
        await user.save();

        const applicantName =
            [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

        await notifyAllAdmins({
            type: "SELLER_APPLICATION",
            title: `🏪 New Seller Application: ${user.seller_profile.store_name}`,
            message: `${applicantName} (${user.email}) requested Seller Portal access. Review in Admin → Sellers.`,
            link: "/admin?tab=sellers",
        });

        await recordAuditLog({
            action: "SELLER_APPLICATION_SUBMITTED",
            category: "SELLERS",
            severity: "WARNING",
            actor_email: user.email,
            actor_name: applicantName,
            target_id: String(user._id),
            details: `User applied for Seller store "${user.seller_profile.store_name}" (awaiting approval).`,
        });

        return res.status(200).json({
            message: "Seller application submitted! Awaiting admin approval.",
            user: formatUserSafe(user),
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const getSellerStatus = async (req, res) => {
    try {
        const user = await Users.findById(getAuthUserId(req), { password: 0 });
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        return res.status(200).json({
            user: formatUserSafe(user),
            seller_profile: user.seller_profile || { status: "NONE" },
            approved: user.seller_profile?.status === "APPROVED",
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getSellerOverview = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const data = await extractSellerOrdersAndMetrics(seller);
        const topProducts = Array.from(data.perProductStats.values())
            .sort((a, b) => b.earnings - a.earnings || b.units_sold - a.units_sold)
            .slice(0, 8);

        return res.status(200).json({
            seller: formatUserSafe(seller),
            kpis: data.kpis,
            earnings_trend: data.earningsTrend,
            top_products: topProducts,
            recent_orders: data.scopedOrders.slice(0, 6),
            recent_reviews: data.allReviews.slice(0, 5),
            star_distribution: data.starDistribution,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getSellerProducts = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const data = await extractSellerOrdersAndMetrics(seller);
        const enriched = data.sellerProducts.map((p) => {
            const st = data.perProductStats.get(p.product_id);
            return {
                ...(p._doc || p),
                discounted_price: calculateEffectivePrice(p),
                units_sold: st?.units_sold || 0,
                returned_units: st?.returned_units || 0,
                earnings: st?.earnings || 0,
                orders_count: st?.orders_count || 0,
            };
        });

        return res.status(200).json(enriched);
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

const parseJsonSafe = (raw, fallback = null) => {
    if (raw === undefined || raw === null || raw === "") return fallback;
    if (typeof raw === "object") return raw;
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
};

const parseDateSafe = (raw) => {
    if (!raw || !String(raw).trim()) return undefined;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? undefined : d;
};

const uploadImagesFromReq = async (req) => {
    const primaryFile = req.files?.image?.[0] || null;
    const galleryFiles = req.files?.images || [];
    const orderedUrls = [];

    // 1. Primary cover image (either uploaded file #0 or req.body.image URL)
    if (primaryFile) {
        try {
            const result = await cloudinary.uploader.upload(primaryFile.path);
            if (result?.secure_url) orderedUrls.push(result.secure_url);
        } catch (err) {
            console.warn("Seller Cloudinary primary image upload skipped:", err.message);
        }
    } else if (typeof req.body?.image === "string" && req.body.image.trim()) {
        orderedUrls.push(req.body.image.trim());
    }

    // 2. Additional uploaded gallery files
    for (const file of galleryFiles) {
        try {
            const result = await cloudinary.uploader.upload(file.path);
            if (result?.secure_url) orderedUrls.push(result.secure_url);
        } catch (err) {
            console.warn("Seller Cloudinary gallery image upload skipped:", err.message);
        }
    }

    // 3. Single image_url or JSON/CSV image_urls list
    if (req.body?.image_url && String(req.body.image_url).trim()) {
        orderedUrls.push(String(req.body.image_url).trim());
    }
    if (req.body?.image_urls) {
        const parsedJson = parseJsonSafe(req.body.image_urls, null);
        if (Array.isArray(parsedJson)) {
            parsedJson.forEach((u) => {
                if (typeof u === "string" && u.trim()) orderedUrls.push(u.trim());
            });
        } else {
            String(req.body.image_urls)
                .split(/[\n,]/)
                .map((s) => s.trim())
                .filter(Boolean)
                .forEach((u) => orderedUrls.push(u));
        }
    }

    return Array.from(new Set(orderedUrls.filter(Boolean)));
};

export const createSellerProduct = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const {
            name,
            description = "",
            price,
            discount = 0,
            flash_sale = false,
            flash_sale_ends_at = "",
            weight = 1,
            measurement = "kg",
            category,
            stock = 10,
            brand = "",
            sku = "",
            origin = seller.seller_profile?.business_location || "Kenyan Highlands",
            seller_location = seller.seller_profile?.business_location || "Nairobi, Kenya",
            shelf_life = "5–7 Days",
            storage_tips = "",
            harvest_date = "",
            expiry_date = "",
            is_organic = true,
            tags = "",
            nutrition = "",
        } = req.body || {};

        if (!name?.trim() || !category?.trim() || Number(price) <= 0) {
            return res.status(400).json({
                message: "Product name, category, and a valid price greater than 0 are required.",
            });
        }

        const allImages = await uploadImagesFromReq(req);
        const primaryImage =
            allImages[0] ||
            "https://www.themealdb.com/images/ingredients/Kale.png";

        const parsedTags = Array.isArray(tags)
            ? tags.filter(Boolean)
            : String(tags || "")
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean);

        const parsedNutrition = parseJsonSafe(nutrition, null);
        const product_id = `SEL-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

        const parsedFlashEnds = parseDateSafe(flash_sale_ends_at);
        const parsedHarvest = parseDateSafe(harvest_date);
        const parsedExpiry = parseDateSafe(expiry_date);

        const newProduct = new Products({
            product_id,
            name: String(name).trim(),
            description:
                String(description).trim() ||
                `Freshly supplied by ${seller.seller_profile.store_name}.`,
            price: Number(price),
            discount: Math.min(95, Math.max(0, Number(discount) || 0)),
            flash_sale: flash_sale === true || flash_sale === "true",
            ...(parsedFlashEnds ? { flash_sale_ends_at: parsedFlashEnds } : {}),
            weight: Number(weight) || 1,
            measurement: String(measurement).trim() || "g",
            category: String(category).trim(),
            stock: Math.max(0, Math.floor(Number(stock) || 0)),
            brand: String(brand).trim() || seller.seller_profile.store_name,
            ...(String(sku || "").trim() ? { sku: String(sku).trim() } : {}),
            origin: String(origin).trim() || "Kenyan Highlands",
            shelf_life: String(shelf_life).trim() || "5–7 Days",
            storage_tips:
                String(storage_tips).trim() ||
                "Keep refrigerated at 2°C–6°C or store in a cool, dry place.",
            ...(parsedHarvest ? { harvest_date: parsedHarvest } : {}),
            ...(parsedExpiry ? { expiry_date: parsedExpiry } : {}),
            ...(parsedNutrition
                ? {
                      nutrition: {
                          calories: String(parsedNutrition.calories || "110 kcal / 100g"),
                          protein: String(parsedNutrition.protein || "3.5g"),
                          carbs: String(parsedNutrition.carbs || "12.0g"),
                          fat: String(parsedNutrition.fat || "1.5g"),
                          fiber: String(parsedNutrition.fiber || "3.0g"),
                          vitamins: Array.isArray(parsedNutrition.vitamins)
                              ? parsedNutrition.vitamins.filter(Boolean)
                              : [],
                      },
                  }
                : {}),
            is_organic: is_organic === true || is_organic === "true",
            tags: parsedTags.length > 0 ? parsedTags : ["Farm Fresh", "Verified Seller"],
            image: primaryImage,
            images: allImages.length > 0 ? allImages : [primaryImage],
            approval_status: "PENDING_APPROVAL",
            rejection_reason: "",
            rating: 0,
            reviews_count: 0,
            reviews: [],
            seller: {
                seller_id: String(seller._id),
                name: seller.seller_profile.store_name,
                email: seller.email,
                verified: true,
                rating: 5.0,
                location:
                    String(seller_location || "").trim() ||
                    seller.seller_profile.business_location ||
                    "Nairobi, Kenya",
            },
        });

        await newProduct.save();

        await notifyAllAdmins({
            type: "PRODUCT_APPROVAL_REQUEST",
            title: `📝 Seller Product Pending Approval: ${newProduct.name}`,
            message: `${seller.seller_profile.store_name} submitted "${newProduct.name}" (${newProduct.price} KES, ${newProduct.category}) for review before publishing to the storefront.`,
            link: "/admin?tab=inventory&stock=PENDING_APPROVAL",
        });

        await recordAuditLog({
            action: "SELLER_PRODUCT_SUBMITTED",
            category: "SELLERS",
            severity: "WARNING",
            actor_email: seller.email,
            actor_name: seller.seller_profile.store_name,
            target_id: newProduct.product_id,
            details: `Seller "${seller.seller_profile.store_name}" submitted product "${newProduct.name}" (${newProduct.price} KES, stock ${newProduct.stock}) — pending Admin approval before publishing.`,
        });

        return res.status(201).json({
            ...(newProduct._doc || newProduct),
            message:
                "Product submitted! It is currently being reviewed by an Admin and will appear on the storefront once approved.",
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const updateSellerProduct = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const { productId } = req.params;
        const existing = await Products.findOne({ product_id: productId });
        if (!existing) {
            return res.status(404).json({ message: "Product not found." });
        }
        if (existing.seller?.seller_id !== String(seller._id)) {
            return res.status(403).json({
                message: "You can only edit products belonging to your own store.",
            });
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
            seller_location,
            shelf_life,
            storage_tips,
            harvest_date,
            expiry_date,
            is_organic,
            tags,
            nutrition,
            media_updated,
        } = req.body || {};

        const newImages = await uploadImagesFromReq(req);

        // Normalize all proposed values cleanly
        const proposed = {};
        if (name !== undefined && String(name).trim()) proposed.name = String(name).trim();
        if (description !== undefined) proposed.description = String(description).trim();
        if (price !== undefined && Number(price) > 0) proposed.price = Number(price);
        if (discount !== undefined)
            proposed.discount = Math.min(95, Math.max(0, Number(discount) || 0));
        if (flash_sale !== undefined)
            proposed.flash_sale = flash_sale === true || flash_sale === "true";
        if (flash_sale_ends_at !== undefined) {
            proposed.flash_sale_ends_at = parseDateSafe(flash_sale_ends_at) || null;
        }
        if (weight !== undefined && Number(weight) > 0) proposed.weight = Number(weight);
        if (measurement !== undefined && String(measurement).trim())
            proposed.measurement = String(measurement).trim();
        if (category !== undefined && String(category).trim())
            proposed.category = String(category).trim();
        if (stock !== undefined) proposed.stock = Math.max(0, Math.floor(Number(stock) || 0));
        if (brand !== undefined) proposed.brand = String(brand).trim();
        if (sku !== undefined) proposed.sku = String(sku).trim();
        if (origin !== undefined) proposed.origin = String(origin).trim();
        if (seller_location !== undefined && String(seller_location).trim()) {
            proposed.seller_location = String(seller_location).trim();
        }
        if (shelf_life !== undefined) proposed.shelf_life = String(shelf_life).trim();
        if (storage_tips !== undefined) proposed.storage_tips = String(storage_tips).trim();
        if (harvest_date !== undefined) {
            const parsedHarvest = parseDateSafe(harvest_date);
            if (parsedHarvest) proposed.harvest_date = parsedHarvest;
        }
        if (expiry_date !== undefined) {
            proposed.expiry_date = parseDateSafe(expiry_date) || null;
        }
        if (is_organic !== undefined)
            proposed.is_organic = is_organic === true || is_organic === "true";
        if (tags !== undefined) {
            const parsedTags = Array.isArray(tags)
                ? tags.filter(Boolean)
                : String(tags)
                      .split(",")
                      .map((t) => t.trim())
                      .filter(Boolean);
            if (parsedTags.length > 0) proposed.tags = parsedTags;
        }
        if (nutrition !== undefined) {
            const parsedNutrition = parseJsonSafe(nutrition, null);
            if (parsedNutrition) {
                proposed.nutrition = {
                    calories: String(parsedNutrition.calories || existing.nutrition?.calories || ""),
                    protein: String(parsedNutrition.protein || existing.nutrition?.protein || ""),
                    carbs: String(parsedNutrition.carbs || existing.nutrition?.carbs || ""),
                    fat: String(parsedNutrition.fat || existing.nutrition?.fat || ""),
                    fiber: String(parsedNutrition.fiber || existing.nutrition?.fiber || ""),
                    vitamins: Array.isArray(parsedNutrition.vitamins)
                        ? parsedNutrition.vitamins.filter(Boolean)
                        : existing.nutrition?.vitamins || [],
                };
            }
        }
        if (newImages.length > 0) {
            proposed.image = newImages[0];
            proposed.images =
                media_updated === true || media_updated === "true"
                    ? newImages
                    : Array.from(new Set([...newImages, ...(existing.images || [])]));
        }

        const isPublished =
            !existing.approval_status || existing.approval_status === "APPROVED";

        // IMPORTANT: If the product is ALREADY published live, DO NOT modify live fields directly!
        // Stage all changes in `pending_changes` so live storefront keeps previous details until Admin approves.
        if (isPublished) {
            const diffSummary = [];
            const pushDiff = (label, fromVal, toVal) => {
                if (String(fromVal ?? "") !== String(toVal ?? "")) {
                    diffSummary.push({
                        field: label,
                        from: String(fromVal ?? "—"),
                        to: String(toVal ?? "—"),
                    });
                }
            };

            if (proposed.name !== undefined) pushDiff("Name", existing.name, proposed.name);
            if (proposed.category !== undefined)
                pushDiff("Category", existing.category, proposed.category);
            if (proposed.price !== undefined && Number(proposed.price) !== Number(existing.price))
                pushDiff("Price", `${existing.price} KES`, `${proposed.price} KES`);
            if (
                proposed.discount !== undefined &&
                Number(proposed.discount) !== Number(existing.discount || 0)
            )
                pushDiff("Discount", `${existing.discount || 0}%`, `${proposed.discount}%`);
            if (proposed.stock !== undefined && Number(proposed.stock) !== Number(existing.stock))
                pushDiff("Stock", `${existing.stock} units`, `${proposed.stock} units`);
            if (
                (proposed.weight !== undefined && Number(proposed.weight) !== Number(existing.weight)) ||
                (proposed.measurement !== undefined && proposed.measurement !== existing.measurement)
            ) {
                pushDiff(
                    "Pack Size",
                    `${existing.weight} ${existing.measurement}`,
                    `${proposed.weight ?? existing.weight} ${proposed.measurement ?? existing.measurement}`
                );
            }
            if (proposed.brand !== undefined) pushDiff("Brand", existing.brand, proposed.brand);
            if (proposed.sku !== undefined) pushDiff("SKU", existing.sku || "—", proposed.sku || "—");
            if (proposed.origin !== undefined) pushDiff("Origin", existing.origin, proposed.origin);
            if (proposed.seller_location !== undefined)
                pushDiff("Dispatch Location", existing.seller?.location, proposed.seller_location);
            if (proposed.shelf_life !== undefined)
                pushDiff("Shelf Life", existing.shelf_life, proposed.shelf_life);
            if (proposed.storage_tips !== undefined)
                pushDiff("Storage Tips", existing.storage_tips, proposed.storage_tips);
            if (proposed.description !== undefined)
                pushDiff("Description", existing.description, proposed.description);
            if (
                proposed.flash_sale !== undefined &&
                Boolean(proposed.flash_sale) !== Boolean(existing.flash_sale)
            )
                pushDiff(
                    "Flash Sale",
                    existing.flash_sale ? "Active" : "Off",
                    proposed.flash_sale ? "Active" : "Off"
                );
            if (
                proposed.is_organic !== undefined &&
                Boolean(proposed.is_organic) !== Boolean(existing.is_organic)
            )
                pushDiff(
                    "Organic",
                    existing.is_organic ? "Yes" : "No",
                    proposed.is_organic ? "Yes" : "No"
                );
            if (
                proposed.tags !== undefined &&
                JSON.stringify(proposed.tags) !== JSON.stringify(existing.tags || [])
            )
                pushDiff("Tags", (existing.tags || []).join(", "), proposed.tags.join(", "));
            if (
                proposed.images !== undefined &&
                JSON.stringify(proposed.images) !== JSON.stringify(existing.images || [])
            )
                pushDiff(
                    "Gallery Images",
                    `${(existing.images || []).length} image(s)`,
                    `${proposed.images.length} image(s)`
                );
            if (
                proposed.nutrition !== undefined &&
                JSON.stringify(proposed.nutrition) !==
                    JSON.stringify({
                        calories: existing.nutrition?.calories || "",
                        protein: existing.nutrition?.protein || "",
                        carbs: existing.nutrition?.carbs || "",
                        fat: existing.nutrition?.fat || "",
                        fiber: existing.nutrition?.fiber || "",
                        vitamins: existing.nutrition?.vitamins || [],
                    })
            )
                pushDiff("Nutrition Facts", "Previous values", "Updated macros");

            if (diffSummary.length === 0) {
                return res.status(200).json({
                    ...(existing._doc || existing),
                    message: "No changes were detected on this product.",
                });
            }

            existing.pending_changes = {
                ...proposed,
                diff_summary: diffSummary,
            };
            existing.pending_changes_submitted_at = new Date();
            existing.pending_changes_note = "";
            existing.markModified("pending_changes");
            await existing.save();

            const shortDiff = diffSummary
                .slice(0, 3)
                .map((d) => `${d.field}: ${d.from} → ${d.to}`)
                .join(", ");

            await notifyAllAdmins({
                type: "PRODUCT_EDIT_REQUEST",
                product_id: existing.product_id,
                title: `✏️ Seller Edit Pending Approval: ${existing.name}`,
                message: `${seller.seller_profile.store_name} submitted changes to "${existing.name}" (${shortDiff}${
                    diffSummary.length > 3 ? ` +${diffSummary.length - 3} more` : ""
                }). Live product remains unchanged until you approve.`,
                link: "/admin?tab=inventory&stock=PENDING_EDITS",
            });

            await recordAuditLog({
                action: "SELLER_PRODUCT_EDIT_SUBMITTED",
                category: "SELLERS",
                severity: "WARNING",
                actor_email: seller.email,
                actor_name: seller.seller_profile.store_name,
                target_id: existing.product_id,
                details: `Seller "${seller.seller_profile.store_name}" submitted staged edits for published product "${existing.name}" (${shortDiff}). Awaiting Admin approval.`,
            });

            return res.status(200).json({
                ...(existing._doc || existing),
                pending_approval_for_edits: true,
                message:
                    "Your changes were submitted for Admin approval! Your product remains live with its previous details until an Admin approves the update.",
            });
        }

        // Unpublished product (PENDING_APPROVAL or REJECTED) — update draft directly
        if (proposed.name !== undefined) existing.name = proposed.name;
        if (proposed.description !== undefined) existing.description = proposed.description;
        if (proposed.price !== undefined) existing.price = proposed.price;
        if (proposed.discount !== undefined) existing.discount = proposed.discount;
        if (proposed.flash_sale !== undefined) existing.flash_sale = proposed.flash_sale;
        if (proposed.flash_sale_ends_at !== undefined)
            existing.flash_sale_ends_at = proposed.flash_sale_ends_at || undefined;
        if (proposed.weight !== undefined) existing.weight = proposed.weight;
        if (proposed.measurement !== undefined) existing.measurement = proposed.measurement;
        if (proposed.category !== undefined) existing.category = proposed.category;
        if (proposed.stock !== undefined) existing.stock = proposed.stock;
        if (proposed.brand !== undefined) existing.brand = proposed.brand;
        if (proposed.sku !== undefined) existing.sku = proposed.sku;
        if (proposed.origin !== undefined) existing.origin = proposed.origin;
        if (proposed.seller_location !== undefined) {
            existing.seller = {
                ...(existing.seller?.toObject ? existing.seller.toObject() : existing.seller || {}),
                seller_id: String(seller._id),
                name: seller.seller_profile.store_name,
                email: seller.email,
                verified: true,
                location: proposed.seller_location,
            };
        }
        if (proposed.shelf_life !== undefined) existing.shelf_life = proposed.shelf_life;
        if (proposed.storage_tips !== undefined) existing.storage_tips = proposed.storage_tips;
        if (proposed.harvest_date !== undefined) existing.harvest_date = proposed.harvest_date;
        if (proposed.expiry_date !== undefined)
            existing.expiry_date = proposed.expiry_date || undefined;
        if (proposed.is_organic !== undefined) existing.is_organic = proposed.is_organic;
        if (proposed.tags !== undefined) existing.tags = proposed.tags;
        if (proposed.nutrition !== undefined) existing.nutrition = proposed.nutrition;
        if (proposed.image !== undefined) {
            existing.image = proposed.image;
            existing.images = proposed.images;
        }

        const wasRejected = existing.approval_status === "REJECTED";
        if (wasRejected) {
            existing.approval_status = "PENDING_APPROVAL";
            existing.rejection_reason = "";
        }

        await existing.save();

        if (wasRejected) {
            await notifyAllAdmins({
                type: "PRODUCT_APPROVAL_REQUEST",
                product_id: existing.product_id,
                title: `📝 Revised Seller Product Ready for Review: ${existing.name}`,
                message: `${seller.seller_profile.store_name} updated and resubmitted "${existing.name}" for publishing approval.`,
                link: "/admin?tab=inventory&stock=PENDING_APPROVAL",
            });
        }

        await recordAuditLog({
            action: "SELLER_PRODUCT_DRAFT_UPDATED",
            category: "SELLERS",
            severity: "INFO",
            actor_email: seller.email,
            actor_name: seller.seller_profile.store_name,
            target_id: existing.product_id,
            details: `Seller "${seller.seller_profile.store_name}" updated unpublished draft "${existing.name}" (still pending Admin approval).`,
        });

        return res.status(200).json({
            ...(existing._doc || existing),
            message: wasRejected
                ? "Product updated and resubmitted for Admin review before publishing!"
                : "Draft updated! Still awaiting Admin approval before publishing to shoppers.",
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const deleteSellerProduct = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const { productId } = req.params;
        const { reason = "" } = req.body || {};
        const existing = await Products.findOne({ product_id: productId, is_deleted: { $ne: true } });
        if (!existing) {
            return res.status(404).json({ message: "Product not found." });
        }
        if (existing.seller?.seller_id !== String(seller._id)) {
            return res.status(403).json({
                message: "You can only delete products belonging to your own store.",
            });
        }

        const now = new Date();
        const purgeAfter = computeProductPurgeDate(now);
        existing.is_deleted = true;
        existing.deleted_at = now;
        existing.deleted_by = seller.email;
        existing.delete_reason =
            String(reason || "").trim() || `Deleted by seller (${seller.seller_profile.store_name})`;
        existing.purge_after = purgeAfter;
        await existing.save();

        await syncAdminStockNotificationsForProducts([productId], { logAudit: false });

        await recordAuditLog({
            action: "SELLER_PRODUCT_MOVED_TO_TRASH",
            category: "TRASH",
            severity: "WARNING",
            actor_email: seller.email,
            actor_name: seller.seller_profile.store_name,
            target_id: productId,
            details: `Seller "${seller.seller_profile.store_name}" moved product "${existing.name}" to Trash (auto-deletes in ${PRODUCT_TRASH_RETENTION_DAYS} days on ${purgeAfter.toISOString().slice(0, 10)}).`,
        });

        return res.status(200).json({
            message: `"${existing.name}" moved to Trash. It will be auto-deleted after ${PRODUCT_TRASH_RETENTION_DAYS} days unless restored by an Admin.`,
            product_id: productId,
            purge_after: purgeAfter,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const getSellerOrders = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const data = await extractSellerOrdersAndMetrics(seller);
        return res.status(200).json({
            orders: data.scopedOrders,
            kpis: data.kpis,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/**
 * Seller submits an order status update (e.g. WAITING_TO_BE_SHIPPED, SHIPPED, AVAILABLE_FOR_PICKUP).
 * IMPORTANT: This NEVER updates the customer-visible Order.status or Shipments.status directly!
 * Instead it records the update in Order.seller_updates and alerts Admins so an Admin
 * reviews and publishes the official status update to the customer.
 */
export const proposeSellerOrderStatus = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const { orderId } = req.params;
        const { status, note = "" } = req.body || {};

        if (!status || !ORDER_STATUS_ENUM.includes(status)) {
            return res.status(400).json({
                message: `Invalid order status "${status}".`,
            });
        }

        const order = await Order.findOne({ order_id: orderId });
        if (!order) {
            return res.status(404).json({ message: `Order #${orderId} not found.` });
        }

        const sellerId = String(seller._id);
        const sellerProducts = await Products.find(
            { "seller.seller_id": sellerId },
            { product_id: 1 }
        );
        const sellerProdSet = new Set(sellerProducts.map((p) => p.product_id));

        const ownsItemInOrder = (order.products || []).some(
            (item) => item?.seller_id === sellerId || sellerProdSet.has(item?.product_id)
        );
        if (!ownsItemInOrder) {
            return res.status(403).json({
                message: "This order does not contain any products from your store.",
            });
        }

        const canonicalProposal = normalizeStatusKey(status);
        const sellerStoreName = seller.seller_profile?.store_name || seller.first_name || "Seller";

        const existingUpdates = Array.isArray(order.seller_updates)
            ? order.seller_updates.map((u) => (u.toObject ? u.toObject() : { ...u }))
            : [];

        const newEntry = {
            seller_id: sellerId,
            seller_name: sellerStoreName,
            proposed_status: canonicalProposal,
            note: String(note || "").trim().slice(0, 300),
            updated_at: new Date(),
            admin_acknowledged: false,
        };

        const idx = existingUpdates.findIndex((u) => u.seller_id === sellerId);
        if (idx >= 0) {
            existingUpdates[idx] = newEntry;
        } else {
            existingUpdates.push(newEntry);
        }

        // Deliberately update ONLY seller_updates — leave Order.status & Shipments.status untouched for customer!
        order.seller_updates = existingUpdates;
        await order.save();

        await notifyAllAdmins({
            type: "SELLER_ORDER_UPDATE",
            order_id: order.order_id,
            title: `📦 Seller Update on Order #${order.order_id}: ${canonicalProposal.replace(/_/g, " ")}`,
            message: `${sellerStoreName} reported Order #${order.order_id} as "${canonicalProposal.replace(/_/g, " ")}"${
                newEntry.note ? ` ("${newEntry.note}")` : ""
            }. Customer status is unchanged until you apply it in Admin Orders.`,
            link: `/admin/orders/update?id=${order.order_id}`,
        });

        await recordAuditLog({
            action: `SELLER_PROPOSED_${canonicalProposal}`,
            category: "SELLERS",
            severity: "INFO",
            actor_email: seller.email,
            actor_name: sellerStoreName,
            target_id: order.order_id,
            details: `Seller "${sellerStoreName}" submitted status update "${canonicalProposal}" for Order #${order.order_id} (pending admin confirmation before customer sees it).`,
        });

        return res.status(200).json({
            message:
                "Status update sent to Admin for review! The customer will see this update once Admin confirms and applies it.",
            order_id: order.order_id,
            customer_status: normalizeStatusKey(order.status),
            seller_update: newEntry,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

export const getSellerReviews = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        const data = await extractSellerOrdersAndMetrics(seller);
        return res.status(200).json({
            overall_seller_rating: data.kpis.overall_seller_rating,
            overall_product_rating: data.kpis.overall_product_rating,
            total_reviews_count: data.kpis.total_reviews_count,
            star_distribution: data.starDistribution,
            per_product_ratings: data.perProductRatings,
            reviews: data.allReviews,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateSellerProfile = async (req, res) => {
    try {
        const userId = getAuthUserId(req);
        if (!userId) return res.status(401).json({ message: "Authentication required." });

        const user = await Users.findById(userId);
        if (!user) return res.status(404).json({ message: "User account not found." });

        const {
            first_name,
            last_name,
            phone,
            bio,
            avatar,
            store_name,
            business_phone,
            business_location,
            category_focus,
            business_description,
        } = req.body || {};

        if (first_name !== undefined && String(first_name).trim()) {
            user.first_name = String(first_name).trim();
        }
        if (last_name !== undefined) {
            user.last_name = String(last_name).trim();
        }
        if (phone !== undefined) {
            user.phone = String(phone).trim();
        }
        if (bio !== undefined) {
            user.bio = String(bio).trim().slice(0, 400);
        }
        if (avatar !== undefined) {
            user.avatar = String(avatar || "").trim();
        }

        const prevStore = user.seller_profile?.toObject
            ? user.seller_profile.toObject()
            : user.seller_profile || { status: "NONE" };

        const nextStoreName =
            store_name !== undefined && String(store_name).trim()
                ? String(store_name).trim()
                : prevStore.store_name || "";
        const nextLocation =
            business_location !== undefined && String(business_location).trim()
                ? String(business_location).trim()
                : prevStore.business_location || "Nairobi, Kenya";

        user.seller_profile = {
            ...prevStore,
            store_name: nextStoreName,
            business_phone:
                business_phone !== undefined
                    ? String(business_phone).trim()
                    : prevStore.business_phone || user.phone || "",
            business_location: nextLocation,
            category_focus:
                category_focus !== undefined && String(category_focus).trim()
                    ? String(category_focus).trim()
                    : prevStore.category_focus || "Fruits and Vegetables",
            business_description:
                business_description !== undefined
                    ? String(business_description).trim().slice(0, 600)
                    : prevStore.business_description || "",
        };

        await user.save();

        // Keep seller's listed products synced with updated store name / location
        if (nextStoreName || nextLocation) {
            const productSellerUpdate = {};
            if (nextStoreName) productSellerUpdate["seller.name"] = nextStoreName;
            if (nextLocation) productSellerUpdate["seller.location"] = nextLocation;
            await Products.updateMany(
                { "seller.seller_id": String(user._id) },
                { $set: productSellerUpdate }
            ).catch(() => {});
        }

        await recordAuditLog({
            action: "SELLER_PROFILE_UPDATED",
            category: "SELLERS",
            severity: "INFO",
            actor_email: user.email,
            actor_name: `${user.first_name} ${user.last_name}`.trim() || user.email,
            target_id: String(user._id),
            details: `Seller "${nextStoreName || user.email}" updated personal & store profile details.`,
        });

        return res.status(200).json({
            message: "Seller profile & store details saved successfully!",
            user: formatUserSafe(user),
            seller_profile: user.seller_profile,
        });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};

const SELLER_PORTAL_NOTIF_TYPES = [
    "SELLER_LOW_STOCK",
    "SELLER_OUT_OF_STOCK",
    "SELLER_APPROVAL",
    "PRODUCT_APPROVAL_RESULT",
    "ORDER_CONFIRMED",
];

const SELLER_STOCK_SYNC_COOLDOWN_MS = 60 * 1000;
const sellerStockSyncMap = new Map();

/**
 * Returns notifications scoped strictly to this seller's store:
 * - Low stock / sold out alerts ONLY for this seller's own APPROVED products
 * - New orders containing this seller's products
 * - Admin product publishing & edit-approval outcomes
 * - Seller store approval status updates
 */
export const getSellerNotifications = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        // Background-sync this seller's approved-product low-stock alerts at most once per 60s
        // (checkout, product approval & 5-min cron already sync immediately) so reads stay ultra-fast
        const sid = String(seller._id);
        const lastSync = sellerStockSyncMap.get(sid) || 0;
        if (Date.now() - lastSync >= SELLER_STOCK_SYNC_COOLDOWN_MS) {
            sellerStockSyncMap.set(sid, Date.now());
            setImmediate(() => {
                syncSellerStockNotificationsForProducts(null, seller._id).catch(() => {});
            });
        }

        const raw = await Notifications.find({
            $or: [
                { user_id: sid },
                { user_email: { $regex: `^${seller.email}$`, $options: "i" } },
            ],
            type: { $in: SELLER_PORTAL_NOTIF_TYPES },
        })
            .sort({ created_at: -1 })
            .limit(80)
            .lean();

        // For ORDER_CONFIRMED, include only Seller-store incoming order alerts (not personal customer checkout receipts)
        const sellerNotifications = raw.filter((n) => {
            if (n.type === "ORDER_CONFIRMED") {
                return (
                    String(n.link || "").startsWith("/seller") ||
                    /seller order/i.test(String(n.title || ""))
                );
            }
            return true;
        });

        const unread_count = sellerNotifications.filter((n) => !n.read).length;
        const low_stock_alerts_count = sellerNotifications.filter(
            (n) => n.type === "SELLER_LOW_STOCK" || n.type === "SELLER_OUT_OF_STOCK"
        ).length;

        return res.status(200).json({
            notifications: sellerNotifications,
            unread_count,
            low_stock_alerts_count,
            total_count: sellerNotifications.length,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const markSellerNotificationsRead = async (req, res) => {
    try {
        const { seller, error } = await ensureApprovedSeller(getAuthUserId(req));
        if (error) return res.status(error.status).json(error);

        await Notifications.updateMany(
            {
                $or: [
                    { user_id: String(seller._id) },
                    { user_email: { $regex: `^${seller.email}$`, $options: "i" } },
                ],
                type: { $in: SELLER_PORTAL_NOTIF_TYPES },
            },
            { read: true }
        );

        return res.status(200).json({ message: "All seller notifications marked as read." });
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
};
