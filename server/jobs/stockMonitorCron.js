import cron from "node-cron";
import Products from "../model/Products.js";
import Users from "../model/Users.js";
import sendEmail from "../utils/sendEmail.js";
import { lowStockAlertEmailTemplate } from "../templates/lowStockAlertEmailTemplate.js";
import { WEBSITE_BASE_URL } from "../services/BaseURLs.js";
import { recordAuditLog } from "../model/AuditLogs.js";
import {
    LOW_STOCK_THRESHOLD,
    syncAdminStockNotificationsForProducts,
} from "../utils/stockAlerts.js";

const DEFAULT_CRON_SCHEDULE = "*/5 * * * *"; // Every 5 minutes
const EMAIL_COOLDOWN_MS = 6 * 60 * 60 * 1000; // Re-email same unchanged list at most once every 6 hours

const configuredSchedule =
    process.env.LOW_STOCK_CRON_SCHEDULE && cron.validate(process.env.LOW_STOCK_CRON_SCHEDULE)
        ? process.env.LOW_STOCK_CRON_SCHEDULE
        : DEFAULT_CRON_SCHEDULE;

const cronState = {
    schedule: configuredSchedule,
    threshold: LOW_STOCK_THRESHOLD,
    active: false,
    running: false,
    last_run_at: null,
    last_source: null,
    last_out_of_stock_count: 0,
    last_low_stock_count: 0,
    last_notified_admins: 0,
    last_email_sent_at: null,
    last_alert_signature: "",
    total_runs: 0,
};

let scheduledTask = null;

/**
 * Scans all products in MongoDB for low stock (<= LOW_STOCK_THRESHOLD) and out of stock (0),
 * synchronizes admin bell notifications, records an audit log when inventory alerts change,
 * and sends a digest email to admins (if SMTP is configured and cooldown/change rules pass).
 */
export const runLowStockMonitorSweep = async ({
    source = "CRON",
    forceEmail = false,
    originUrl = "",
} = {}) => {
    if (cronState.running) {
        return { skipped: true, reason: "ALREADY_RUNNING", status: { ...cronState } };
    }

    cronState.running = true;
    try {
        // 1. Sync in-app bell notifications for all admins (creates new, updates changed, clears restocked)
        await syncAdminStockNotificationsForProducts(null, { logAudit: false });

        // 2. Inspect current flagged products & admin recipients (including persisted email cooldown timestamps)
        const [flaggedProducts, admins] = await Promise.all([
            Products.find({
                stock: { $lte: LOW_STOCK_THRESHOLD },
                is_deleted: { $ne: true },
            }).sort({ stock: 1, name: 1 }),
            Users.find(
                { role: "ADMIN", is_deleted: { $ne: true }, account_status: { $ne: "SUSPENDED" } },
                {
                    _id: 1,
                    first_name: 1,
                    last_name: 1,
                    email: 1,
                    last_low_stock_email_sent_at: 1,
                }
            ),
        ]);

        const outOfStockProducts = flaggedProducts.filter((p) => Number(p.stock || 0) <= 0);
        const lowStockProducts = flaggedProducts.filter(
            (p) => Number(p.stock || 0) > 0 && Number(p.stock || 0) <= LOW_STOCK_THRESHOLD
        );

        const signature = flaggedProducts
            .map((p) => `${p.product_id}:${Math.max(0, Number(p.stock || 0))}`)
            .sort()
            .join("|");

        const signatureChanged = signature !== cronState.last_alert_signature;
        const now = new Date();

        // 3. Record concise audit log when alerts change or admin triggers a manual scan
        if (flaggedProducts.length > 0 && (signatureChanged || source === "MANUAL")) {
            await recordAuditLog({
                action: "INVENTORY_STOCK_CHECK",
                category: "INVENTORY",
                severity: outOfStockProducts.length > 0 ? "DANGER" : "WARNING",
                actor_email: "system@freshmart.co.ke",
                actor_name: "Inventory Monitor",
                target_id: `STOCK-CHECK`,
                details: `Inventory check found ${outOfStockProducts.length} sold-out and ${lowStockProducts.length} low-stock (≤ ${LOW_STOCK_THRESHOLD}) product(s). Synced alerts for ${admins.length} admin(s).`,
            });
        }

        // 4. Send low-stock digest email per admin STRICTLY respecting the 6-hour MongoDB-persisted cooldown
        //    (survives server restarts & ignores repeated checks until a full 6 hours have passed).
        let emailsSentThisRun = 0;
        if (
            flaggedProducts.length > 0 &&
            admins.length > 0 &&
            Boolean(process.env.USER && process.env.PASS)
        ) {
            const baseUrl = originUrl || process.env.WEBSITE_BASE_URL || WEBSITE_BASE_URL;
            const cooldownCutoff = new Date(now.getTime() - EMAIL_COOLDOWN_MS);

            for (const admin of admins) {
                if (!admin.email) continue;

                const lastSentMs = admin.last_low_stock_email_sent_at
                    ? new Date(admin.last_low_stock_email_sent_at).getTime()
                    : 0;
                const cooldownElapsed = now.getTime() - lastSentMs >= EMAIL_COOLDOWN_MS;

                if (!forceEmail && !cooldownElapsed) {
                    continue;
                }

                // Atomically claim the 6-hour cooldown slot in MongoDB before sending so concurrent/restart runs never double-email
                const claimFilter = forceEmail
                    ? { _id: admin._id }
                    : {
                          _id: admin._id,
                          $or: [
                              { last_low_stock_email_sent_at: null },
                              { last_low_stock_email_sent_at: { $exists: false } },
                              { last_low_stock_email_sent_at: { $lte: cooldownCutoff } },
                          ],
                      };

                const claimed = await Users.updateOne(claimFilter, {
                    $set: { last_low_stock_email_sent_at: now },
                });

                if (!forceEmail && claimed.modifiedCount === 0) {
                    continue;
                }

                emailsSentThisRun += 1;
                sendEmail({
                    to: admin.email,
                    subject:
                        outOfStockProducts.length > 0
                            ? `🚨 FreshMart Stock Alert: ${outOfStockProducts.length} Sold Out, ${lowStockProducts.length} Low Stock`
                            : `⚠️ FreshMart Low Stock Alert: ${lowStockProducts.length} Product${
                                  lowStockProducts.length === 1 ? "" : "s"
                              } Need${lowStockProducts.length === 1 ? "s" : ""} Restocking`,
                    html: lowStockAlertEmailTemplate({
                        adminName: admin.first_name || "Admin",
                        outOfStockProducts,
                        lowStockProducts,
                        threshold: LOW_STOCK_THRESHOLD,
                        baseUrl,
                    }),
                }).catch((err) => console.warn("Admin low-stock email skipped:", err.message));
            }

            if (emailsSentThisRun > 0) {
                cronState.last_email_sent_at = now;
            }
        }

        cronState.last_run_at = now;
        cronState.last_source = source;
        cronState.last_out_of_stock_count = outOfStockProducts.length;
        cronState.last_low_stock_count = lowStockProducts.length;
        cronState.last_notified_admins = admins.length;
        cronState.last_alert_signature = signature;
        cronState.total_runs += 1;

        return {
            skipped: false,
            out_of_stock_count: outOfStockProducts.length,
            low_stock_count: lowStockProducts.length,
            notified_admins: admins.length,
            emails_sent: emailsSentThisRun,
            status: { ...cronState },
        };
    } catch (error) {
        console.warn("Low-stock cron sweep error:", error.message);
        return { skipped: false, error: error.message, status: { ...cronState } };
    } finally {
        cronState.running = false;
    }
};

export const startLowStockCronJob = () => {
    if (scheduledTask) return scheduledTask;

    scheduledTask = cron.schedule(cronState.schedule, () => {
        runLowStockMonitorSweep({ source: "CRON" });
    });
    cronState.active = true;

    console.log(
        `Low-stock monitor cron job scheduled (${cronState.schedule}, threshold <= ${LOW_STOCK_THRESHOLD} units)`
    );

    // Run an initial sweep shortly after MongoDB connects so admins see alerts immediately
    setTimeout(() => {
        runLowStockMonitorSweep({ source: "STARTUP" });
    }, 3000);

    return scheduledTask;
};

export const getLowStockCronStatus = () => ({ ...cronState });
