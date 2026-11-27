import Users from "../../model/Users.js";
import Products from "../../model/Products.js";

export const getWishlist = async (req, res) => {
    const { id } = req.body;

    try {
        const user = await Users.findById(id);
        const wishlist = user?.wishlist || [];
        const data = await Products.find({ product_id: { $in: wishlist } });

        res.status(200).json(data);
    } catch (e) {
        res.status(400).json({ message: e.message });
    }
};

export const updateWishlist = async (req, res) => {
    const { id, product_id } = req.body;
    try {
        const user = await Users.findById(id);

        const wishlist = user.wishlist || [];

        let newWishlist;
        if (wishlist.includes(product_id))
            newWishlist = wishlist.filter((item) => item !== product_id);
        else
            newWishlist = [...wishlist, product_id];

        await Users.findByIdAndUpdate(id, { wishlist: newWishlist });

        res.status(201).json({ wishlist: newWishlist });
    } catch (error) {
        res.status(409).json({ message: error.message });
    }
};

export const getUserCart = async (req, res) => {
    const { id } = req.body;
    try {
        const user = await Users.findById(id);
        return res.status(200).json({ cart: user?.cart || [] });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};

export const syncUserCart = async (req, res) => {
    const { id, cart } = req.body;
    try {
        const safeCart = Array.isArray(cart) ? cart : [];
        await Users.findByIdAndUpdate(id, { cart: safeCart });
        return res.status(200).json({ cart: safeCart });
    } catch (e) {
        return res.status(400).json({ message: e.message });
    }
};
