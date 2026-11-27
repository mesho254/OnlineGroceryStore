import crypto from "node:crypto";
import Users from "../../model/Users.js";
import Order from "../../model/Orders.js";
import Shipments from "../../model/Shipments.js";
import Notifications from "../../model/Notifications.js";
import { recordAuditLog } from "../../model/AuditLogs.js";
import {
    computeUserGdprRetainDate,
    USER_GDPR_RETENTION_DAYS,
} from "../../jobs/trashPurgeCron.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import sendEmail from "../../utils/sendEmail.js";
import {
    passwordResetTemplate,
    passwordResetSuccessTemplate,
    welcomeEmailTemplate,
} from "../../templates/index.js";
import { WEBSITE_BASE_URL } from "../../services/BaseURLs.js";
import {
    hashToken,
    issueAuthTokens,
    revokeRefreshToken,
    verifyRefreshTokenJwt,
} from "../../utils/authTokens.js";
import { sanitizeUserWishlistIds } from "./Wishlist.js";

const formatAuthUser = (user) => ({
    _id: user._id,
    email: user.email,
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    phone: user.phone || "",
    avatar: user.avatar || "",
    bio: user.bio || "",
    address: user.address || {},
    role: user.role || "USER",
    seller_profile: user.seller_profile || { status: "NONE" },
    wishlist: user.wishlist || [],
    cart: user.cart || [],
});

export const login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ message: "Email address or Password is not provided" });

    try {
        const user = await Users.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password)))
            return res.status(401).json({ status: "fail", message: "Email or password is incorrect" });

        if (user.is_deleted || user.account_status === "SUSPENDED") {
            const retainDateLabel = user.gdpr_retain_until
                ? new Date(user.gdpr_retain_until).toLocaleDateString("en-KE", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                  })
                : `${USER_GDPR_RETENTION_DAYS} days`;
            return res.status(403).json({
                status: "suspended",
                message: `Your account is currently suspended and archived in Trash under GDPR data retention (retained until ${retainDateLabel}). Please contact an administrator if you wish to restore your account.`,
            });
        }

        await sanitizeUserWishlistIds(user);
        const tokens = await issueAuthTokens(user);

        return res.status(200).json({
            user: formatAuthUser(user),
            ...tokens,
        });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const refreshAccessToken = async (req, res) => {
    const rawRefreshToken =
        req.body?.refreshToken ||
        req.headers?.["x-refresh-token"] ||
        (req.headers?.authorization?.startsWith("Bearer ")
            ? req.headers.authorization.split(" ")[1]
            : null);

    if (!rawRefreshToken) {
        return res.status(401).json({
            code: "REFRESH_TOKEN_MISSING",
            message: "Refresh token is required",
        });
    }

    try {
        const decoded = verifyRefreshTokenJwt(rawRefreshToken);
        const user = await Users.findById(decoded.id);

        if (!user) {
            return res.status(401).json({
                code: "USER_NOT_FOUND",
                message: "User account not found",
            });
        }

        if (user.is_deleted || user.account_status === "SUSPENDED") {
            await revokeRefreshToken(user._id, null, { allDevices: true });
            return res.status(403).json({
                code: "ACCOUNT_SUSPENDED",
                suspended: true,
                message: "Your account is currently suspended.",
            });
        }

        const incomingHash = hashToken(rawRefreshToken);
        const nowMs = Date.now();
        const storedTokens = Array.isArray(user.refresh_tokens) ? user.refresh_tokens : [];
        const matched = storedTokens.find(
            (entry) =>
                entry &&
                entry.token_hash === incomingHash &&
                entry.expires_at &&
                new Date(entry.expires_at).getTime() > nowMs
        );

        if (!matched) {
            return res.status(401).json({
                code: "REFRESH_TOKEN_REVOKED",
                message: "Session expired or signed out. Please sign in again.",
            });
        }

        const tokens = await issueAuthTokens(user, { replacedTokenHash: incomingHash });

        return res.status(200).json({
            user: formatAuthUser(user),
            ...tokens,
        });
    } catch (e) {
        const isExpired = e?.name === "TokenExpiredError";
        return res.status(401).json({
            code: isExpired ? "REFRESH_TOKEN_EXPIRED" : "REFRESH_TOKEN_INVALID",
            expired: isExpired,
            message: isExpired
                ? "Your session has expired. Please sign in again."
                : "Invalid refresh token. Please sign in again.",
        });
    }
};

export const logoutUser = async (req, res) => {
    try {
        const rawRefreshToken =
            req.body?.refreshToken || req.headers?.["x-refresh-token"] || null;
        const allDevices = Boolean(req.body?.allDevices);

        let userId = req.userId || req.body?.id || null;
        if (!userId && rawRefreshToken) {
            try {
                const decoded = jwt.decode(rawRefreshToken);
                userId = decoded?.id || null;
            } catch {
                // ignore decode error
            }
        }

        if (userId) {
            await revokeRefreshToken(userId, rawRefreshToken, { allDevices });
        }

        return res.status(200).json({
            status: "success",
            message: "Signed out successfully.",
        });
    } catch (e) {
        return res.status(200).json({
            status: "success",
            message: "Signed out.",
        });
    }
};

export const verifyUser = async (req, res) => {
    const id = req.userId || req.body?.id;
    try {
        const user = await Users.findById(id, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        if (user.is_deleted || user.account_status === "SUSPENDED") {
            return res.status(403).json({
                suspended: true,
                message: "Your account is currently suspended and archived under GDPR retention.",
            });
        }
        return res.status(200).json({ ...user?._doc });
    } catch (e) {
        return res.status(404).json({ message: "User not found" });
    }
};

export const verifyRole = async (req, res) => {
    try {
        const { id, role } = req.body;

        const user = await Users.findById(id, { password: 0 });

        if (!user)
            return res.status(404).json({ message: `User ${id} was not found` });

        if (user.is_deleted || user.account_status === "SUSPENDED")
            return res.status(403).json({
                suspended: true,
                message: "Your account is currently suspended.",
            });

        if (role !== user.role)
            return res.status(401).json({ message: "Unauthorized user" });

        return res.status(200).json({ user });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const signup = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password)
        return res.status(400).json({ message: "Email address or Password is not provided" });

    try {
        const user = await Users.findOne({ email });

        if (user) {
            if (user.is_deleted || user.account_status === "SUSPENDED") {
                return res.status(403).json({
                    message:
                        "An account with this email is currently suspended in GDPR archival retention. Please contact an administrator to restore it.",
                });
            }
            return res.status(400).json({ message: "User already exists" });
        }

        const newUser = await Users.create({
            email: req.body.email,
            password: req.body.password,
            phone: req.body.phone,
            first_name: req.body.first_name,
            last_name: req.body.last_name,
            address: req.body.address,
            role: req.body.role,
            wishlist: req.body.wishlist,
        });

        const tokens = await issueAuthTokens(newUser);

        const baseUrl = req.headers.origin || process.env.WEBSITE_BASE_URL || WEBSITE_BASE_URL;
        sendEmail({
            to: newUser.email,
            subject: "Welcome to FreshMart Online Grocery Store!",
            html: welcomeEmailTemplate({
                name: newUser.first_name || "Customer",
                shopUrl: `${baseUrl}/products`,
            }),
        }).catch((err) => console.warn("Welcome email skipped:", err.message));

        return res.status(200).json({
            status: "success",
            user: formatAuthUser(newUser),
            ...tokens,
            data: {
                user: newUser,
            },
        });
    } catch (error) {
        console.log("SIGNUP ERROR", error);
        return res.status(400).json({ message: error.message });
    }
};

export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Please provide your email address." });
    }

    try {
        const user = await Users.findOne({
            email: { $regex: `^${email.trim()}$`, $options: "i" },
        });

        if (!user) {
            return res.status(404).json({
                message: "No account found with that email address.",
            });
        }

        const resetToken = crypto.randomBytes(32).toString("hex");
        const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await Users.updateOne(
            { _id: user._id },
            {
                resetPasswordToken: resetToken,
                resetPasswordExpires: resetExpires,
            }
        );

        const baseUrl = req.headers.origin || process.env.WEBSITE_BASE_URL || "http://localhost:3000";
        const resetUrl = `${baseUrl.replace(/\/+$/, "")}/reset-password/${resetToken}`;

        await sendEmail({
            to: user.email,
            subject: "Reset Your FreshMart Account Password",
            html: passwordResetTemplate({
                name: user.first_name || "Customer",
                resetUrl,
            }),
        });

        return res.status(200).json({
            message: "Password reset link has been sent to your email address.",
        });
    } catch (error) {
        console.error("FORGOT PASSWORD ERROR:", error);
        return res.status(500).json({
            message: error.message || "Failed to send password reset email.",
        });
    }
};

export const resetPassword = async (req, res) => {
    const token = req.params.token || req.body.token;
    const { password } = req.body;

    if (!token) {
        return res.status(400).json({ message: "Reset token is required." });
    }
    if (!password || password.length < 8) {
        return res.status(400).json({
            message: "New password must be at least 8 characters long.",
        });
    }

    try {
        const user = await Users.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({
                message: "Password reset link is invalid or has expired. Please request a new one.",
            });
        }

        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        user.refresh_tokens = [];
        await user.save();

        const baseUrl = req.headers.origin || process.env.WEBSITE_BASE_URL || "http://localhost:3000";
        sendEmail({
            to: user.email,
            subject: "Your FreshMart Password Was Changed",
            html: passwordResetSuccessTemplate({
                name: user.first_name || "Customer",
                loginUrl: `${baseUrl.replace(/\/+$/, "")}/login`,
            }),
        }).catch((err) => console.warn("Password change confirmation email skipped:", err.message));

        return res.status(200).json({
            message: "Your password has been reset successfully. You can now log in.",
        });
    } catch (error) {
        console.error("RESET PASSWORD ERROR:", error);
        return res.status(500).json({
            message: error.message || "Failed to reset password.",
        });
    }
};

export const getProfile = async (req, res) => {
    try {
        const userId = req.userId || req.body?.id;
        const user = await Users.findById(userId, { password: 0 });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        await sanitizeUserWishlistIds(user);

        const orders = await Order.find({
            email: { $regex: `^${user.email}$`, $options: "i" },
        }).sort({ ordered_at: -1 });

        const orderIds = orders.map((o) => o.order_id);
        const shipments = await Shipments.find({ order_id: { $in: orderIds } });
        const shipmentMap = new Map(shipments.map((s) => [s.order_id, s]));

        const validOrders = orders.filter((o) => o.status !== "CANCELLED");
        const totalSpent = Number(
            validOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0).toFixed(2)
        );
        const deliveredCount = orders.filter((o) => {
            const sh = shipmentMap.get(o.order_id);
            return o.status === "FULFILLED" || sh?.status === "DELIVERED";
        }).length;
        const activeOrdersCount = orders.filter((o) => {
            const sh = shipmentMap.get(o.order_id);
            return (
                o.status !== "FULFILLED" &&
                o.status !== "CANCELLED" &&
                sh?.status !== "DELIVERED" &&
                sh?.status !== "RETURNED"
            );
        }).length;

        const recentOrders = orders.slice(0, 6).map((o) => {
            const sh = shipmentMap.get(o.order_id);
            return {
                order_id: o.order_id,
                total: o.total,
                ordered_at: o.ordered_at,
                status: o.status || "CREATED",
                shipment_status: sh?.status || "CREATED",
                delivery_method: o.address?.delivery_method || "DOORSTEP",
                items_count: (o.products || []).reduce(
                    (s, p) => s + (Number(p.quantity) || 1),
                    0
                ),
            };
        });

        return res.status(200).json({
            user: {
                _id: user._id,
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                email: user.email,
                phone: user.phone || "",
                avatar: user.avatar || "",
                bio: user.bio || "",
                address: user.address || {},
                role: user.role || "USER",
                seller_profile: user.seller_profile || { status: "NONE" },
                wishlist: user.wishlist || [],
                cart: user.cart || [],
            },
            stats: {
                orders_count: orders.length,
                delivered_count: deliveredCount,
                active_orders_count: activeOrdersCount,
                total_spent: totalSpent,
                wishlist_count: Array.isArray(user.wishlist) ? user.wishlist.length : 0,
                cart_count: Array.isArray(user.cart)
                    ? user.cart.reduce((s, c) => s + (Number(c.quantity) || 1), 0)
                    : 0,
            },
            recent_orders: recentOrders,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const updateProfile = async (req, res) => {
    try {
        const userId = req.body.id;
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const { first_name, last_name, phone, avatar, bio, address } = req.body;

        if (first_name !== undefined) user.first_name = String(first_name).trim();
        if (last_name !== undefined) user.last_name = String(last_name).trim();
        if (phone !== undefined) user.phone = String(phone).trim();
        if (avatar !== undefined) user.avatar = String(avatar);
        if (bio !== undefined) user.bio = String(bio).trim();
        if (address && typeof address === "object") {
            user.address = {
                city: String(address.city ?? user.address?.city ?? "Nairobi").trim(),
                area: String(address.area ?? user.address?.area ?? "").trim(),
                street: String(address.street ?? user.address?.street ?? "").trim(),
                building_number: String(
                    address.building_number ?? user.address?.building_number ?? ""
                ).trim(),
                floor: String(address.floor ?? user.address?.floor ?? "").trim(),
                apartment_number: String(
                    address.apartment_number ?? user.address?.apartment_number ?? ""
                ).trim(),
            };
        }

        await user.save();

        return res.status(200).json({
            message: "Profile updated successfully.",
            user: {
                _id: user._id,
                first_name: user.first_name || "",
                last_name: user.last_name || "",
                email: user.email,
                phone: user.phone || "",
                avatar: user.avatar || "",
                bio: user.bio || "",
                address: user.address || {},
                role: user.role || "USER",
                seller_profile: user.seller_profile || { status: "NONE" },
                wishlist: user.wishlist || [],
                cart: user.cart || [],
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const changePassword = async (req, res) => {
    try {
        const userId = req.body.id;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({
                message: "Please provide both your current password and new password.",
            });
        }

        if (String(new_password).length < 8) {
            return res.status(400).json({
                message: "New password must be at least 8 characters long.",
            });
        }

        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const isMatch = await bcrypt.compare(current_password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                message: "Your current password is incorrect.",
            });
        }

        user.password = new_password;
        user.refresh_tokens = [];
        await user.save();

        const tokens = await issueAuthTokens(user);

        return res.status(200).json({
            message: "Your password has been updated successfully.",
            ...tokens,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

export const suspendMyAccount = async (req, res) => {
    try {
        const userId = req.userId || req.body?.id;
        const { password, reason = "" } = req.body || {};

        if (!password) {
            return res.status(400).json({
                message: "Please enter your current password to confirm account suspension.",
            });
        }

        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }
        if (user.is_deleted || user.account_status === "SUSPENDED") {
            return res.status(400).json({ message: "This account is already suspended." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({
                message: "Incorrect password. Account suspension cancelled.",
            });
        }

        // Prevent the sole remaining active Admin from locking out the entire store
        if (user.role === "ADMIN") {
            const activeAdmins = await Users.countDocuments({
                role: "ADMIN",
                is_deleted: { $ne: true },
                account_status: { $ne: "SUSPENDED" },
            });
            if (activeAdmins <= 1) {
                return res.status(400).json({
                    message:
                        "You are the only active administrator account. Promote another admin before suspending your account.",
                });
            }
        }

        const now = new Date();
        const retainUntil = computeUserGdprRetainDate(now);
        const cleanReason = String(reason || "").trim() || "Self-suspended by account holder";

        user.account_status = "SUSPENDED";
        user.is_deleted = true;
        user.deleted_at = now;
        user.deleted_by = "SELF";
        user.suspension_reason = cleanReason;
        user.gdpr_retain_until = retainUntil;
        user.refresh_tokens = [];

        if (user.seller_profile?.status && user.seller_profile.status !== "NONE") {
            user.previous_seller_status = user.seller_profile.status;
            user.seller_profile.status = "SUSPENDED";
        }

        await user.save();

        const displayName =
            [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email;

        await recordAuditLog({
            action: "USER_SELF_SUSPENDED",
            category: "TRASH",
            severity: "WARNING",
            actor_email: user.email,
            actor_name: displayName,
            target_id: user.email,
            details: `${displayName} (${user.email}) suspended their own account into GDPR Trash (retained ${USER_GDPR_RETENTION_DAYS} days until ${retainUntil.toISOString().slice(0, 10)}). Reason: ${cleanReason}.`,
        });

        // Alert active admins that a user self-suspended into Trash
        const admins = await Users.find(
            {
                role: "ADMIN",
                is_deleted: { $ne: true },
                account_status: { $ne: "SUSPENDED" },
            },
            { _id: 1, email: 1 }
        ).lean();
        for (const admin of admins) {
            await Notifications.create({
                user_id: String(admin._id),
                user_email: admin.email,
                type: "USER_SUSPENDED",
                title: `🔒 Account Suspended (GDPR Trash): ${displayName}`,
                message: `${displayName} (${user.email}) suspended their account. Personal data is retained for ${USER_GDPR_RETENTION_DAYS} days under GDPR compliance and can be restored in Admin → Trash.`,
                link: "/admin?tab=trash",
                read: false,
                dismissed_popup: true,
            }).catch(() => {});
        }

        return res.status(200).json({
            message: `Your account has been suspended and moved to GDPR Trash. Your records will be safely retained for ${USER_GDPR_RETENTION_DAYS} days (until ${retainUntil.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}) in accordance with GDPR statutory obligations. Contact an administrator anytime during this window to restore your account.`,
            gdpr_retain_until: retainUntil,
            retention_days: USER_GDPR_RETENTION_DAYS,
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};
