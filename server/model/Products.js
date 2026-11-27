import mongoose from "mongoose";
const { Schema } = mongoose;
import { v4 as uuidv4 } from "uuid";

const reviewSchema = new Schema({
    user_id: { type: String },
    user_name: { type: String, default: "Verified Customer" },
    user_email: { type: String },
    order_id: { type: String },
    product_rating: { type: Number, required: true, min: 1, max: 5 },
    seller_rating: { type: Number, default: 5, min: 1, max: 5 },
    comment: { type: String, default: "" },
    verified_purchase: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
});

const productSchema = new Schema({
    product_id: { type: String, unique: true },
    name: { type: String, required: true },
    description: {
        type: String,
        default: "Farm-fresh quality grocery item sourced daily from trusted local producers.",
    },
    price: { type: Number, required: true },
    discount: {
        type: Number,
        default: 0,
        min: 0,
        max: 95,
    },
    discounted_price: {
        type: Number,
    },
    flash_sale: {
        type: Boolean,
        default: false,
    },
    flash_sale_ends_at: {
        type: Date,
    },
    weight: Number,
    measurement: String,
    category: String,
    brand: {
        type: String,
        default: "FreshMart Organics",
    },
    sku: {
        type: String,
    },
    origin: {
        type: String,
        default: "Kenyan Highlands",
    },
    is_organic: {
        type: Boolean,
        default: true,
    },
    rating: {
        type: Number,
        default: 4.8,
    },
    reviews_count: {
        type: Number,
        default: 28,
    },
    reviews: {
        type: [reviewSchema],
        default: [],
    },
    seller: {
        seller_id: { type: String, index: true, default: "" },
        name: { type: String, default: "FreshMart Verified Farm Partner" },
        email: { type: String, default: "" },
        verified: { type: Boolean, default: true },
        rating: { type: Number, default: 4.9 },
        location: { type: String, default: "Nairobi, Kenya" },
    },
    nutrition: {
        calories: { type: String, default: "120 kcal" },
        protein: { type: String, default: "4.5g" },
        carbs: { type: String, default: "14g" },
        fat: { type: String, default: "2.5g" },
        fiber: { type: String, default: "3.0g" },
        vitamins: { type: [String], default: ["Vitamin A", "Vitamin C", "Calcium"] },
    },
    storage_tips: {
        type: String,
        default: "Store in a cool, dry place or refrigerate at 2°C–6°C to preserve optimal freshness.",
    },
    shelf_life: {
        type: String,
        default: "7–14 Days",
    },
    tags: {
        type: [String],
        default: ["Farm Fresh", "Quality Checked"],
    },
    harvest_date: {
        type: Date,
        default: Date.now,
    },
    expiry_date: {
        type: Date,
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
    image: {
        type: String,
        default:
            "https://res.cloudinary.com/crunchbase-production/image/upload/c_lpad,h_256,w_256,f_auto,q_auto:eco,dpr_1/lqcm8z8qwhi42efm2lue",
    },
    images: {
        type: [String],
        default: [],
    },
    stock: {
        type: Number,
        default: 0,
    },
    approval_status: {
        type: String,
        enum: ["APPROVED", "PENDING_APPROVAL", "REJECTED"],
        default: "APPROVED",
        index: true,
    },
    rejection_reason: {
        type: String,
        default: "",
    },
    approved_at: {
        type: Date,
    },
    approved_by: {
        type: String,
        default: "",
    },
    pending_changes: {
        type: Schema.Types.Mixed,
        default: null,
    },
    pending_changes_submitted_at: {
        type: Date,
        default: null,
    },
    pending_changes_note: {
        type: String,
        default: "",
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
    delete_reason: {
        type: String,
        default: "",
    },
    purge_after: {
        type: Date,
        default: null,
        index: true,
    },
});

productSchema.pre("save", function (next) {
    if (!this.product_id) {
        this.product_id = uuidv4();
    }
    const basePrice = Number(this.price || 0);
    const discountPct = Math.min(95, Math.max(0, Number(this.discount || 0)));
    this.discount = discountPct;
    this.discounted_price =
        discountPct > 0
            ? Number((basePrice * (1 - discountPct / 100)).toFixed(2))
            : Number(basePrice.toFixed(2));

    const combinedImages = Array.from(
        new Set([this.image, ...(Array.isArray(this.images) ? this.images : [])].filter(Boolean))
    );
    if (combinedImages.length > 0) {
        this.image = combinedImages[0];
        this.images = combinedImages;
    }
    next();
});

const Products = mongoose.model("Products", productSchema);
export default Products;
