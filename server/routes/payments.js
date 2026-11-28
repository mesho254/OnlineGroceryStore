import express from "express";
import {
    createCheckoutSession,
    verifyCheckoutSession,
    cancelPendingCheckout,
    handleMobileCheckoutReturn,
    webhook,
} from "../controller/payments/Payments.js";

const router = express.Router();

router.post("/", createCheckoutSession);
router.get("/mobile-return", handleMobileCheckoutReturn);
router.get("/session/:sessionId", verifyCheckoutSession);
router.delete("/pending/:orderId", cancelPendingCheckout);
router.post("/webhook", webhook);

export default router;
