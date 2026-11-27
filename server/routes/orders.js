import express from "express";

import {
    createOrder,
    getOrder,
    getUserOrders,
    getAllOrders,
    updateOrder,
    downloadOrderReceiptPdf,
} from "../controller/orders/Orders.js";
import auth from "../middleware/auth.js";

const router = express.Router();

router.post("/", createOrder);
router.get("/my-orders", auth, getUserOrders);
router.get("/:id/receipt.pdf", downloadOrderReceiptPdf);
router.get("/:id", getOrder);
router.get("/", auth, getAllOrders);
router.patch("/:id", auth, updateOrder);

export default router;
