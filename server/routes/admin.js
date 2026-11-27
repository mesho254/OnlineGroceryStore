import express from "express";
import auth from "../middleware/auth.js";
import upload from "../middleware/cloudinaryConfig.js";
import {
    getAdminOverview,
    getAdminUsers,
    updateAdminUserRole,
    deleteAdminUser,
    getAdminInventory,
    updateAdminProductQuick,
    updateAdminProductFull,
    updateAdminProductApproval,
    reviewAdminProductPendingChanges,
    deleteAdminProduct,
    getAdminTrash,
    restoreTrashedProduct,
    permanentDeleteTrashedProduct,
    restoreTrashedUser,
    permanentDeleteTrashedUser,
    triggerTrashPurgeCronNow,
    getAdminAuditLogs,
    createCustomAuditLog,
    triggerLowStockCronNow,
    getAdminSellers,
    updateAdminSellerStatus,
} from "../controller/admin/Admin.js";

const router = express.Router();

router.get("/overview", auth, getAdminOverview);
router.post("/stock-alerts/run", auth, triggerLowStockCronNow);
router.get("/sellers", auth, getAdminSellers);
router.patch("/sellers/:sellerId/status", auth, updateAdminSellerStatus);
router.get("/users", auth, getAdminUsers);
router.patch("/users/:userId/role", auth, updateAdminUserRole);
router.delete("/users/:userId", auth, deleteAdminUser);

router.get("/products", auth, getAdminInventory);
router.patch("/products/:productId/approval", auth, updateAdminProductApproval);
router.patch("/products/:productId/pending-changes", auth, reviewAdminProductPendingChanges);
router.put(
    "/products/:productId/full",
    auth,
    upload.fields([
        { name: "image", maxCount: 1 },
        { name: "images", maxCount: 10 },
    ]),
    updateAdminProductFull
);
router.patch("/products/:productId", auth, updateAdminProductQuick);
router.delete("/products/:productId", auth, deleteAdminProduct);

router.get("/trash", auth, getAdminTrash);
router.patch("/trash/products/:productId/restore", auth, restoreTrashedProduct);
router.delete("/trash/products/:productId/permanent", auth, permanentDeleteTrashedProduct);
router.patch("/trash/users/:userId/restore", auth, restoreTrashedUser);
router.delete("/trash/users/:userId/permanent", auth, permanentDeleteTrashedUser);
router.post("/trash/purge-now", auth, triggerTrashPurgeCronNow);

router.get("/logs", auth, getAdminAuditLogs);
router.post("/logs", auth, createCustomAuditLog);

export default router;
