import Users from "../../model/Users.js";
import Products from "../../model/Products.js";
import { PUBLISHED_PRODUCT_FILTER } from "../products/Products.js";

export const sanitizeUserWishlistIds = async (user) => {
    const rawWishlist = Array.isArray(user?.wishlist)
        ? Array.from(new Set(user.wishlist.filter(Boolean)))
        : [];
    if (rawWishlist.length === 0) return [];

    const existingProducts = await Products.find(
        {
            ...PUBLISHED_PRODUCT_FILTER,
            product_id: { $in: rawWishlist },
        },
        { product_id: 1 }
    ).lean();

    const validSet = new Set(existingProducts.map((p) => p.product_id));
    const cleaned = rawWishlist.filter((pid) => validSet.has(pid));

    if (cleaned.length !== (user?.wishlist?.length || 0) && user?._id) {
        await Users.updateOne({ _id: user._id }, { $set: { wishlist: cleaned } });
        user.wishlist = cleaned;
    }

    return cleaned;
};

export const getWishlist = async (req, res) => {
    const userId = req.userId || req.body?.id;

    try {
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const rawWishlist = Array.isArray(user.wishlist)
            ? Array.from(new Set(user.wishlist.filter(Boolean)))
            : [];

        const data =
            rawWishlist.length > 0
                ? await Products.find(
                      {
                          ...PUBLISHED_PRODUCT_FILTER,
                          product_id: { $in: rawWishlist },
                      },
                      { reviews: 0, pending_changes: 0 }
                  ).lean()
                : [];

        const validIds = data.map((p) => p.product_id);
        if (validIds.length !== (user.wishlist?.length || 0)) {
            await Users.updateOne({ _id: user._id }, { $set: { wishlist: validIds } });
        }

        return res.status(200).json(data);
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const updateWishlist = async (req, res) => {
    const userId = req.userId || req.body?.id;
    const { product_id } = req.body;
    try {
        const user = await Users.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const cleanedCurrent = await sanitizeUserWishlistIds(user);

        let newWishlist;
        if (cleanedCurrent.includes(product_id)) {
            newWishlist = cleanedCurrent.filter((item) => item !== product_id);
        } else {
            const targetProduct = await Products.findOne(
                {
                    ...PUBLISHED_PRODUCT_FILTER,
                    product_id,
                },
                { product_id: 1 }
            ).lean();
            newWishlist = targetProduct
                ? [...cleanedCurrent, product_id]
                : cleanedCurrent;
        }

        await Users.updateOne({ _id: user._id }, { $set: { wishlist: newWishlist } });

        return res.status(201).json({ wishlist: newWishlist });
    } catch (error) {
        return res.status(409).json({ message: error.message });
    }
};

export const getUserCart = async (req, res) => {
    const userId = req.userId || req.body?.id;
    try {
        const user = await Users.findById(userId, { cart: 1 }).lean();
        return res.status(200).json({ cart: user?.cart || [] });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const syncUserCart = async (req, res) => {
    const userId = req.userId || req.body?.id;
    const { cart } = req.body;
    try {
        const safeCart = Array.isArray(cart) ? cart : [];
        await Users.findByIdAndUpdate(userId, { cart: safeCart });
        return res.status(200).json({ cart: safeCart });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};
