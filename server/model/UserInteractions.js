import mongoose from "mongoose";

const { Schema } = mongoose;

export const INTERACTION_EVENT_TYPES = [
    "CLICK",
    "VIEW",
    "DWELL",
    "CART_ADD",
    "WISHLIST_ADD",
    "PURCHASE",
    "SEARCH",
];

const userInteractionSchema = new Schema({
    user_id: { type: String, index: true, default: null },
    user_email: { type: String, index: true, default: null },
    session_id: { type: String, index: true, default: null },
    product_id: { type: String, index: true, default: null },
    category: { type: String, index: true, default: "" },
    event_type: {
        type: String,
        enum: INTERACTION_EVENT_TYPES,
        required: true,
        index: true,
    },
    dwell_ms: { type: Number, default: 0, min: 0, max: 300000 },
    search_query: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
    created_at: {
        type: Date,
        default: Date.now,
        expires: 60 * 60 * 24 * 90, // Keep rolling 90-day behavioral window
    },
});

userInteractionSchema.index({ user_id: 1, created_at: -1 });
userInteractionSchema.index({ session_id: 1, created_at: -1 });
userInteractionSchema.index({ product_id: 1, event_type: 1, created_at: -1 });

const UserInteractions = mongoose.model("UserInteractions", userInteractionSchema);

export default UserInteractions;
