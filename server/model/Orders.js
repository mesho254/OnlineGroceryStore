import mongoose from "mongoose";

export const ORDER_STATUS_ENUM = [
    "ORDER_PLACED",
    "PENDING_CONFIRMATION",
    "WAITING_TO_BE_SHIPPED",
    "SHIPPED",
    "AVAILABLE_FOR_PICKUP",
    "DELIVERED",
    "RETURN_IN_PROGRESS",
    "RETURNED",
    "REFUNDED",
    "FAILED_DELIVERY",
    "CANCELLED",
    "CANCELLED_PAYMENT_UNSUCCESSFUL",
    // Legacy statuses for backward compatibility
    "CREATED",
    "PROCESSING",
    "FULFILLED",
];

const statusHistoryItemSchema = new mongoose.Schema(
    {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
    },
    { _id: false }
);

const sellerOrderUpdateSchema = new mongoose.Schema(
    {
        seller_id: { type: String, required: true },
        seller_name: { type: String, default: "Seller" },
        proposed_status: { type: String, enum: ORDER_STATUS_ENUM, required: true },
        note: { type: String, default: "" },
        updated_at: { type: Date, default: Date.now },
        admin_acknowledged: { type: Boolean, default: false },
        admin_applied_at: { type: Date },
        admin_applied_by: { type: String, default: "" },
    },
    { _id: false }
);

const orderSchema = mongoose.Schema({
    order_id: {
        type: String,
        required: true,
        unique: true,
    },
    checkout_token_id: {
        type: String,
        unique: true,
        sparse: true,
    },
    stripe_session_id: {
        type: String,
    },
    stripe_session_url: {
        type: String,
    },
    name: {
        first: String,
        last: String,
    },
    email: { type: String, required: false },
    phone_number: { type: String, required: false },
    address: {
        delivery_method: {
            type: String,
            enum: ["DOORSTEP", "PICKUP_STATION"],
            default: "DOORSTEP",
        },
        country: String,
        city: String,
        area: String,
        street: String,
        building_number: String,
        floor: String,
        apartment_number: String,
        formatted_address: String,
        google_maps_url: String,
        coordinates: {
            lat: Number,
            lng: Number,
        },
        pickup_station: {
            station_id: String,
            name: String,
            landmark: String,
            opening_hours: String,
            phone: String,
        },
    },
    ordered_at: {
        type: Date,
    },
    status: {
        type: String,
        enum: ORDER_STATUS_ENUM,
        default: "ORDER_PLACED",
    },
    status_history: {
        type: [statusHistoryItemSchema],
        default: [],
    },
    seller_updates: {
        type: [sellerOrderUpdateSchema],
        default: [],
    },
    stock_restored: {
        type: Boolean,
        default: false,
    },
    products: { type: Array, required: true },
    total: { type: Number, required: true },
});

const pendingCheckoutSchema = mongoose.Schema({
    order_id: {
        type: String,
        required: true,
        unique: true,
    },
    checkout_token_id: {
        type: String,
        index: true,
    },
    stripe_session_id: {
        type: String,
        index: true,
    },
    stripe_session_url: {
        type: String,
    },
    payload: {
        type: Object,
        required: true,
    },
    created_at: {
        type: Date,
        default: Date.now,
        expires: 86400, // Auto-expire abandoned pending checkouts after 24h
    },
});

export const PendingCheckout = mongoose.model("PendingCheckout", pendingCheckoutSchema);

const Order = mongoose.model("Order", orderSchema);

export default Order;
