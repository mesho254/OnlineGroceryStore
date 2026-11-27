import mongoose from "mongoose";

const { Schema } = mongoose;

const notificationSchema = new Schema({
    user_id: { type: String, index: true },
    user_email: { type: String, index: true },
    order_id: { type: String },
    product_id: { type: String, index: true },
    type: {
        type: String,
        enum: [
            "DELIVERY_REVIEW",
            "ORDER_CONFIRMED",
            "SHIPMENT_UPDATE",
            "LOW_STOCK",
            "OUT_OF_STOCK",
            "SELLER_LOW_STOCK",
            "SELLER_OUT_OF_STOCK",
            "SELLER_APPLICATION",
            "SELLER_APPROVAL",
            "SELLER_ORDER_UPDATE",
            "PRODUCT_APPROVAL_REQUEST",
            "PRODUCT_EDIT_REQUEST",
            "PRODUCT_APPROVAL_RESULT",
            "SYSTEM",
        ],
        default: "DELIVERY_REVIEW",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    products: {
        type: [
            {
                product_id: String,
                name: String,
                image: String,
                seller_name: String,
                reviewed: { type: Boolean, default: false },
            },
        ],
        default: [],
    },
    link: { type: String, default: "/products" },
    read: { type: Boolean, default: false },
    dismissed_popup: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now, index: true },
});

notificationSchema.index({ created_at: -1 });
notificationSchema.index({ user_id: 1, created_at: -1 });
notificationSchema.index({ user_email: 1, created_at: -1 });
notificationSchema.index({ user_id: 1, type: 1, created_at: -1 });

const Notifications = mongoose.model("Notifications", notificationSchema);
export default Notifications;
