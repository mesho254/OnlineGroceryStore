import mongoose from "mongoose";
import { ORDER_STATUS_ENUM } from "./Orders.js";

const { Schema } = mongoose;

const statusHistoryItemSchema = new Schema(
    {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
    },
    { _id: false }
);

const ShipmentsSchema = new Schema({
    order_id: { type: String, unique: true, required: true },
    total: Number,
    address: Object,
    status: {
        type: String,
        enum: ORDER_STATUS_ENUM,
        default: "ORDER_PLACED",
    },
    status_history: {
        type: [statusHistoryItemSchema],
        default: [],
    },
    ordered_at: Date,
});

const Shipments = mongoose.model("Shipments", ShipmentsSchema);
export default Shipments;
