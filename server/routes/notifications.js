import express from "express";
import auth from "../middleware/auth.js";
import {
    orderConfirmation,
    getUserNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} from "../controller/notifications/Notifications.js";

const router = express.Router();

router.get("/", auth, getUserNotifications);
router.patch("/read-all", auth, markAllNotificationsRead);
router.patch("/:id/read", auth, markNotificationRead);
router.post("/order-confirmation", orderConfirmation);

export default router;
