import mongoose from "mongoose";
import bcrypt from "bcrypt";

const { Schema } = mongoose;

const UsersSchema = new Schema({
    first_name: { type: String },
    last_name: { type: String },
    email: { type: String, required: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["USER", "SELLER", "ADMIN"], default: "USER" },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },
    bio: { type: String, default: "" },
    seller_profile: {
        store_name: { type: String, default: "" },
        business_phone: { type: String, default: "" },
        business_location: { type: String, default: "Nairobi, Kenya" },
        business_description: { type: String, default: "" },
        category_focus: { type: String, default: "General Groceries" },
        status: {
            type: String,
            enum: ["NONE", "PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
            default: "NONE",
        },
        rejection_reason: { type: String, default: "" },
        applied_at: { type: Date },
        reviewed_at: { type: Date },
        reviewed_by: { type: String, default: "" },
    },
    address: {
        city: { type: String, default: "Nairobi" },
        area: { type: String, default: "" },
        street: { type: String, default: "" },
        building_number: { type: String, default: "" },
        floor: { type: String, default: "" },
        apartment_number: { type: String, default: "" },
    },
    wishlist: { type: Array, default: [] },
    cart: { type: Array, default: [] },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    account_status: {
        type: String,
        enum: ["ACTIVE", "SUSPENDED"],
        default: "ACTIVE",
        index: true,
    },
    is_deleted: {
        type: Boolean,
        default: false,
        index: true,
    },
    deleted_at: {
        type: Date,
        default: null,
    },
    deleted_by: {
        type: String,
        default: "",
    },
    suspension_reason: {
        type: String,
        default: "",
    },
    gdpr_retain_until: {
        type: Date,
        default: null,
        index: true,
    },
    previous_seller_status: {
        type: String,
        default: "",
    },
    last_low_stock_email_sent_at: {
        type: Date,
        default: null,
    },
    refresh_tokens: {
        type: [
            {
                token_hash: { type: String, required: true },
                created_at: { type: Date, default: Date.now },
                expires_at: { type: Date, required: true },
                rotated_at: { type: Date, default: null },
            },
        ],
        default: [],
    },
});

UsersSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

const Users = mongoose.model("Users", UsersSchema);
export default Users;
