import express from "express";

import {
    PostProducts,
    ShowProductsPerPage,
    productsSearch,
    validateCart,
    adminUpdateProducts,
    ProductsRecommendations,
    getProductsArr,
    updateQuantity,
    getProductById,
    getFlashSaleProducts,
    addProductReview,
    checkReviewEligibility,
    getPendingReviews,
    checkProductsStock,
    trackProductInteraction,
} from "../controller/products/Products.js";
import auth from "../middleware/auth.js";
import upload from "../middleware/cloudinaryConfig.js";

const router = express.Router();

router.get("/", ShowProductsPerPage);
router.get("/recommendations", ProductsRecommendations);
router.post("/interactions", trackProductInteraction);
router.get("/flash-sales", getFlashSaleProducts);
router.get("/search", productsSearch);
router.get("/pending-reviews", auth, getPendingReviews);
router.get("/:id/review-eligibility", auth, checkReviewEligibility);
router.get("/:id", getProductById);
router.post("/:id/reviews", auth, addProductReview);
router.post(
    "/",
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "images", maxCount: 10 },
    ]),
    PostProducts
);
router.patch("/", auth, adminUpdateProducts);
router.post("/cart", validateCart);
router.post("/stock-check", checkProductsStock);
router.post("/arr", getProductsArr);
router.patch("/updateQuantity", updateQuantity);

export default router;
