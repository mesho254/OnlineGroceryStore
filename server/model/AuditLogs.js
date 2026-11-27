import mongoose from "mongoose";
import generateId from "../utils/generateId.js";

const auditLogSchema = mongoose.Schema({
    log_id: {
        type: String,
        default: () => generateId(),
        unique: true,
    },
    action: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        enum: ["ORDERS", "SHIPPING", "INVENTORY", "USERS", "SELLERS", "PICKUP", "TRASH", "SYSTEM"],
        default: "SYSTEM",
    },
    severity: {
        type: String,
        enum: ["INFO", "SUCCESS", "WARNING", "DANGER"],
        default: "INFO",
    },
    actor_email: {
        type: String,
        default: "admin@freshmart.co.ke",
    },
    actor_name: {
        type: String,
        default: "System Admin",
    },
    target_id: {
        type: String,
        default: "",
    },
    details: {
        type: String,
        required: true,
    },
    metadata: {
        type: Object,
        default: {},
    },
    created_at: {
        type: Date,
        default: Date.now,
    },
});

const AuditLogs = mongoose.model("AuditLogs", auditLogSchema);

export const recordAuditLog = async ({
    action,
    category = "SYSTEM",
    severity = "INFO",
    actor_email = "admin@freshmart.co.ke",
    actor_name = "Admin",
    target_id = "",
    details = "",
    metadata = {},
}) => {
    try {
        return await AuditLogs.create({
            action,
            category,
            severity,
            actor_email,
            actor_name,
            target_id,
            details,
            metadata,
            created_at: new Date(),
        });
    } catch (err) {
        console.warn("Audit log write skipped:", err.message);
        return null;
    }
};

export default AuditLogs;
