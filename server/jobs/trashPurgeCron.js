import cron from "node-cron";
import Products from "../model/Products.js";
import Users from "../model/Users.js";
import Notifications from "../model/Notifications.js";
import UserInteractions from "../model/UserInteractions.js";
import { recordAuditLog } from "../model/AuditLogs.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Products stay in Trash for 30 days before permanent auto-deletion
export const PRODUCT_TRASH_RETENTION_DAYS = Math.max(
    1,
    Number(process.env.PRODUCT_TRASH_DAYS) || 30
);

// Suspended user accounts are retained for 365 days (12 months) under GDPR Art. 17(3)(b)
// statutory tax, invoice, dispute, and audit retention compliance before automated erasure
export const USER_GDPR_RETENTION_DAYS = Math.max(
    30,
    Number(process.env.USER_GDPR_RETENTION_DAYS) || 365
);

const DEFAULT_TRASH_CRON_SCHEDULE = "0 2 * * *"; // Daily at 02:00 AM

const configuredSchedule =
    process.env.TRASH_PURGE_CRON_SCHEDULE && cron.validate(process.env.TRASH_PURGE_CRON_SCHEDULE)
        ? process.env.TRASH_PURGE_CRON_SCHEDULE
        : DEFAULT_TRASH_CRON_SCHEDULE;

export const computeProductPurgeDate = (fromDate = new Date()) =>
    new Date(new Date(fromDate).getTime() + PRODUCT_TRASH_RETENTION_DAYS * MS_PER_DAY);

export const computeUserGdprRetainDate = (fromDate = new Date()) =>
    new Date(new Date(fromDate).getTime() + USER_GDPR_RETENTION_DAYS * MS_PER_DAY);

const cronState = {
    schedule: configuredSchedule,
    product_retention_days: PRODUCT_TRASH_RETENTION_DAYS,
    user_gdpr_retention_days: USER_GDPR_RETENTION_DAYS,
    active: false,
    running: false,
    last_run_at: null,
    last_source: null,
    last_purged_products: 0,
    last_purged_users: 0,
    total_purged_products: 0,
    total_purged_users: 0,
    total_runs: 0,
};

let scheduledTask = null;

/**
 * Permanently purges:
 *  1) Trashed Products past their 30-day `purge_after` deadline.
 *  2) Suspended User accounts past their 365-day GDPR `gdpr_retain_until` deadline
 *     (erasing personal profile, notifications, and behavioral tracking data while
 *      leaving historical invoice/order ledger rows intact per GDPR Art. 17(3)(b)).
 */
export const runTrashPurgeSweep = async ({ source = "CRON" } = {}) => {
    if (cronState.running) {
        return { skipped: true, reason: "ALREADY_RUNNING", status: { ...cronState } };
    }

    cronState.running = true;
    try {
        const now = new Date();
        const productFallbackCutoff = new Date(
            now.getTime() - PRODUCT_TRASH_RETENTION_DAYS * MS_PER_DAY
        );
        const userFallbackCutoff = new Date(
            now.getTime() - USER_GDPR_RETENTION_DAYS * MS_PER_DAY
        );

        // 1. Find & permanently delete expired trashed products (> 30 days in Trash)
        const expiredProducts = await Products.find(
            {
                is_deleted: true,
                $or: [
                    { purge_after: { $lte: now } },
                    { purge_after: null, deleted_at: { $lte: productFallbackCutoff } },
                ],
            },
            { _id: 1, product_id: 1, name: 1 }
        ).lean();

        let purgedProductsCount = 0;
        if (expiredProducts.length > 0) {
            const mongoIds = expiredProducts.map((p) => p._id);
            const productIds = expiredProducts.map((p) => p.product_id).filter(Boolean);

            const deleteResult = await Products.deleteMany({ _id: { $in: mongoIds } });
            purgedProductsCount = deleteResult?.deletedCount || expiredProducts.length;

            if (productIds.length > 0) {
                await Notifications.deleteMany({ product_id: { $in: productIds } }).catch(() => {});
            }

            await recordAuditLog({
                action: "TRASH_PRODUCTS_AUTO_PURGED",
                category: "TRASH",
                severity: "WARNING",
                actor_email: "system@freshmart.co.ke",
                actor_name: "Automated Retention Cleanup",
                target_id: `PURGE-PRODUCTS-${purgedProductsCount}`,
                details: `Auto-purged ${purgedProductsCount} trashed product(s) past the ${PRODUCT_TRASH_RETENTION_DAYS}-day retention period: ${expiredProducts
                    .slice(0, 5)
                    .map((p) => p.name)
                    .join(", ")}${expiredProducts.length > 5 ? "..." : ""}.`,
            });
        }

        // 2. Find & permanently erase suspended user accounts past GDPR retention window
        const expiredUsers = await Users.find(
            {
                is_deleted: true,
                $or: [
                    { gdpr_retain_until: { $lte: now } },
                    { gdpr_retain_until: null, deleted_at: { $lte: userFallbackCutoff } },
                ],
            },
            { _id: 1, email: 1, first_name: 1, last_name: 1 }
        ).lean();

        let purgedUsersCount = 0;
        if (expiredUsers.length > 0) {
            const userMongoIds = expiredUsers.map((u) => u._id);
            const userIdStrings = expiredUsers.map((u) => String(u._id));
            const userEmails = expiredUsers
                .map((u) => String(u.email || "").toLowerCase())
                .filter(Boolean);

            const delUsers = await Users.deleteMany({ _id: { $in: userMongoIds } });
            purgedUsersCount = delUsers?.deletedCount || expiredUsers.length;

            // Erase personal notifications & behavioral interaction logs per GDPR Right to Erasure
            await Promise.all([
                Notifications.deleteMany({
                    $or: [
                        { user_id: { $in: userIdStrings } },
                        { user_email: { $in: userEmails } },
                    ],
                }).catch(() => {}),
                UserInteractions.deleteMany({
                    $or: [
                        { user_id: { $in: userIdStrings } },
                        { user_email: { $in: userEmails } },
                    ],
                }).catch(() => {}),
            ]);

            await recordAuditLog({
                action: "GDPR_USERS_AUTO_ERASED",
                category: "TRASH",
                severity: "DANGER",
                actor_email: "system@freshmart.co.ke",
                actor_name: "GDPR Data Retention Policy",
                target_id: `GDPR-ERASE-${purgedUsersCount}`,
                details: `GDPR retention period (${USER_GDPR_RETENTION_DAYS} days) expired for ${purgedUsersCount} suspended user account(s). Permanently erased user profiles, notifications, and tracking history.`,
            });
        }

        cronState.last_run_at = now;
        cronState.last_source = source;
        cronState.last_purged_products = purgedProductsCount;
        cronState.last_purged_users = purgedUsersCount;
        cronState.total_purged_products += purgedProductsCount;
        cronState.total_purged_users += purgedUsersCount;
        cronState.total_runs += 1;

        return {
            skipped: false,
            purged_products: purgedProductsCount,
            purged_users: purgedUsersCount,
            status: { ...cronState },
        };
    } catch (error) {
        console.warn("Trash & GDPR purge cron sweep error:", error.message);
        return { skipped: false, error: error.message, status: { ...cronState } };
    } finally {
        cronState.running = false;
    }
};

export const startTrashPurgeCronJob = () => {
    if (scheduledTask) return scheduledTask;

    scheduledTask = cron.schedule(cronState.schedule, () => {
        runTrashPurgeSweep({ source: "CRON" });
    });
    cronState.active = true;

    console.log(
        `Trash & GDPR retention cron job scheduled (${cronState.schedule} | Products: ${PRODUCT_TRASH_RETENTION_DAYS}d, Users GDPR: ${USER_GDPR_RETENTION_DAYS}d)`
    );

    // Run an initial sweep shortly after MongoDB connects to purge any overdue items
    setTimeout(() => {
        runTrashPurgeSweep({ source: "STARTUP" });
    }, 5000);

    return scheduledTask;
};

export const getTrashPurgeCronStatus = () => ({ ...cronState });
