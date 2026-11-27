import express from "express";
import auth from "../middleware/auth.js";
import {
    login,
    refreshAccessToken,
    logoutUser,
    verifyRole,
    verifyUser,
    signup,
    forgotPassword,
    resetPassword,
    getProfile,
    updateProfile,
    changePassword,
    suspendMyAccount,
} from "../controller/me/Authentication.js";
import {
    getWishlist,
    updateWishlist,
    getUserCart,
    syncUserCart,
} from "../controller/me/Wishlist.js";

const router = express.Router();

router.post("/login", login);
router.post("/signup", signup);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", logoutUser);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.post("/reset-password", resetPassword);
router.post("/verify", auth, verifyUser);
router.post("/role", verifyRole);

router.get("/wishlist", auth, getWishlist);
router.patch("/wishlist", auth, updateWishlist);

router.get("/cart", auth, getUserCart);
router.put("/cart", auth, syncUserCart);

router.get("/profile", auth, getProfile);
router.patch("/profile", auth, updateProfile);
router.patch("/profile/password", auth, changePassword);
router.post("/profile/suspend", auth, suspendMyAccount);

export default router;
