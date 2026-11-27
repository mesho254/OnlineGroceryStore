import express from "express";
import {
    createCheckoutSession,
    verifyCheckoutSession,
    cancelPendingCheckout,
    webhook,
} from "../controller/payments/Payments.js";

const router = express.Router();

router.post("/", createCheckoutSession);
router.get("/session/:sessionId", verifyCheckoutSession);
router.delete("/pending/:orderId", cancelPendingCheckout);
router.post("/webhook", webhook);

export default router;
