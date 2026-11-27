import express from "express";
import auth from "../middleware/auth.js";
import upload from "../middleware/cloudinaryConfig.js";
import {
    registerSeller,
    applyAsSeller,
    getSellerStatus,
    getSellerOverview,
    getSellerProducts,
    createSellerProduct,
    updateSellerProduct,
    deleteSellerProduct,
    getSellerOrders,
    proposeSellerOrderStatus,
    getSellerReviews,
    updateSellerProfile,
    getSellerNotifications,
    markSellerNotificationsRead,
} from "../controller/seller/Seller.js";

const router = express.Router();

// Public registration for new sellers (starts as PENDING admin approval)
router.post("/register", registerSeller);

// Authenticated seller onboarding, approval status & profile update
router.post("/apply", auth, applyAsSeller);
router.get("/status", auth, getSellerStatus);
router.patch("/profile", auth, updateSellerProfile);

// Approved Seller Portal endpoints
router.get("/overview", auth, getSellerOverview);
router.get("/products", auth, getSellerProducts);
router.post(
    "/products",
    auth,
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "images", maxCount: 8 },
    ]),
    createSellerProduct
);
router.patch(
    "/products/:productId",
    auth,
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "images", maxCount: 8 },
    ]),
    updateSellerProduct
);
router.delete("/products/:productId", auth, deleteSellerProduct);

router.get("/orders", auth, getSellerOrders);
router.patch("/orders/:orderId/status", auth, proposeSellerOrderStatus);

router.get("/reviews", auth, getSellerReviews);
router.get("/notifications", auth, getSellerNotifications);
router.patch("/notifications/read-all", auth, markSellerNotificationsRead);

export default router;
