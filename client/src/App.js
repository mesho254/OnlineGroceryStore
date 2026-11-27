import {BrowserRouter, Routes, Route, useLocation} from "react-router-dom";
import Home from "./pages/home/Home";
import './shared/css/master.css';
import Navigation from "./components/navigation/Navigation";
import Footer from "./components/footer/Footer";
import CartPage from "./pages/cart/Cart";
import {createContext, useEffect, useRef, useState} from "react";
import {useDispatch, useSelector} from "react-redux";
import {useQuery} from "@tanstack/react-query";
import * as api from "./api";
import {LOGOUT, REFRESH_TOKENS} from "./constants/actions/authentication";
import {
    isRefreshTokenExpired,
    readStoredProfile,
} from "./utils/authSession";
import {trackCartAdd} from "./utils/tracker";
import Order from "./pages/order/Order";
import Signup from "./pages/authentication/signup/Signup";
import Shipment from "./pages/shipment/Shipment";
import Login from "./pages/authentication/login/Login";
import ForgotPassword from "./pages/authentication/forgot-password/ForgotPassword";
import ResetPassword from "./pages/authentication/reset-password/ResetPassword";
import PrivateRoute from "./components/privete-route/PrivateRoute";
import Wishlist from "./pages/wishlist/Wishlist";
import Error401 from "./pages/errors/401/Error401";
import Error404 from "./pages/errors/404/Error404";
import Admin from "./pages/admin/default/Admin";
import AdminUpdate from "./pages/admin/products/update/default/AdminUpdate";
import AdminUpdateSuccess from "./pages/admin/products/update/success/AdminUpdateSuccess";
import AdminUpdateOrder from "./pages/admin/orders/update/AdminUpdateOrder";
import ScrollToTop from "./components/scroll-to-top/ScrollToTop";
import AdminOrders from "./pages/admin/orders/default/AdminOrders";
import AdminViewOrder from "./pages/admin/orders/id/AdminViewOrder";
import AdminNewProduct from "./pages/admin/products/new/AdminNewProduct";
import AdminShipping from "./pages/admin/shipment/default/AdminShipping";
import AdminUpdateShipping from "./pages/admin/shipment/update/AdminUpdateShipping";
import AdminPickupStations from "./pages/admin/pickup-stations/AdminPickupStations";
import Products from './pages/products/Products';
import ProductDetails from './pages/product-details/ProductDetails';

import Checkout from "./pages/checkout/checkout";
import Success from "./pages/checkout/success";
import ShipmentId from "./pages/shipment/id/ShipmentId";
import OrderId from "./pages/order/id/OrderId";
import Profile from "./components/profile/Profile";
import PendingReviewsPage from "./pages/pending-reviews/PendingReviewsPage";
import NotificationsPage from "./pages/notifications/NotificationsPage";
import SellerPortal from "./pages/seller/SellerPortal";
import PrivacyNotice from "./pages/privacy/PrivacyNotice";
import CookieConsentPopup from "./components/cookie-consent/CookieConsentPopup";

export const CartContext = createContext({
    cart: [],
    cartCount: 0,
    addProductToCart: () => {},
    removeProductFromCart: () => {},
    updateQuantity: () => {},
    setCartItemQuantity: () => {},
});

const getCartStorageKey = (user) => {
    const uid = user?._id || user?.email;
    return uid ? `cart_${uid}` : null;
};

const readUserCartFromStorage = (user) => {
    const key = getCartStorageKey(user);
    if (!key) return [];
    try {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        return Array.isArray(user?.cart) ? user.cart : [];
    } catch {
        return [];
    }
};

const App = () => {
    const dispatch = useDispatch();
    const {
        user,
        token,
        refreshToken,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
    } = useSelector((state) => state.authentication);
    const userKey = getCartStorageKey(user);
    const hydratedKeyRef = useRef(null);

    // Clean up legacy unscoped 'cart' key so old shared carts never leak across users
    useEffect(() => {
        localStorage.removeItem('cart');
    }, []);

    // Keep Redux authentication state synchronized with silent token refreshes, expiry events, and cross-tab storage updates
    useEffect(() => {
        const handleSessionUpdated = (e) => {
            if (e?.detail) {
                dispatch({type: REFRESH_TOKENS, data: e.detail});
            }
        };

        const handleSessionExpired = () => {
            dispatch({type: LOGOUT});
        };

        const handleStorageSync = (e) => {
            if (e.key === 'profile') {
                const updated = readStoredProfile();
                if (updated) {
                    dispatch({type: REFRESH_TOKENS, data: updated});
                } else {
                    dispatch({type: LOGOUT});
                }
            }
        };

        window.addEventListener('auth:session-updated', handleSessionUpdated);
        window.addEventListener('auth:session-expired', handleSessionExpired);
        window.addEventListener('storage', handleStorageSync);

        return () => {
            window.removeEventListener('auth:session-updated', handleSessionUpdated);
            window.removeEventListener('auth:session-expired', handleSessionExpired);
            window.removeEventListener('storage', handleStorageSync);
        };
    }, [dispatch]);

    // Proactive background timer: rotates access token 45s before expiry or logs out when session expires
    useEffect(() => {
        if (!token) return undefined;

        const now = Date.now();
        const currentProfile = readStoredProfile();
        if (!currentProfile) {
            dispatch({type: LOGOUT});
            return undefined;
        }

        // If refresh token itself is expired (or missing) and access token has expired, end session immediately
        if (refreshTokenExpiresAt && now >= Number(refreshTokenExpiresAt)) {
            dispatch({type: LOGOUT});
            return undefined;
        }

        let timerId = null;

        if (accessTokenExpiresAt) {
            const refreshLeadMs = 45 * 1000;
            const msUntilRefresh = Number(accessTokenExpiresAt) - now - refreshLeadMs;
            const msUntilAccessExpiry = Number(accessTokenExpiresAt) - now;

            if (refreshToken && !isRefreshTokenExpired(currentProfile, 2000)) {
                const delay = Math.max(1000, Math.min(msUntilRefresh, 24 * 60 * 60 * 1000));
                timerId = window.setTimeout(() => {
                    api.refreshAuthSession().catch(() => {});
                }, delay);
            } else if (msUntilAccessExpiry <= 0) {
                dispatch({type: LOGOUT});
            } else {
                const delay = Math.min(msUntilAccessExpiry, 24 * 60 * 60 * 1000);
                timerId = window.setTimeout(() => {
                    dispatch({type: LOGOUT});
                }, delay);
            }
        }

        return () => {
            if (timerId) window.clearTimeout(timerId);
        };
    }, [dispatch, token, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt]);

    const [cart, setCart] = useState(() => readUserCartFromStorage(user));
    const [cartCount, setCartCount] = useState(0);

    // Deduplicated cart hydration via React Query (prevents duplicate /cart XHR calls under StrictMode)
    const {data: serverCartData} = useQuery({
        queryKey: ['userCartHydrate', userKey],
        queryFn: async () => {
            const res = await api.getUserCart();
            return Array.isArray(res.data?.cart) ? res.data.cart : [];
        },
        enabled: Boolean(userKey),
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // When the logged-in user changes (login, signup, switch user, or logout), load their specific cart
    useEffect(() => {
        if (!userKey) {
            hydratedKeyRef.current = null;
            setCart([]);
            return;
        }

        const localCart = readUserCartFromStorage(user);
        setCart(localCart);
        hydratedKeyRef.current = userKey;
    }, [userKey]);

    useEffect(() => {
        if (!userKey || !Array.isArray(serverCartData) || serverCartData.length === 0) return;
        const storedRaw = localStorage.getItem(userKey);
        if (storedRaw === null) {
            setCart(serverCartData);
            localStorage.setItem(userKey, JSON.stringify(serverCartData));
        }
    }, [userKey, serverCartData]);

    const persistUserCart = (nextCart) => {
        setCart(nextCart);
        if (userKey) {
            localStorage.setItem(userKey, JSON.stringify(nextCart));
            api.syncUserCart(nextCart).catch(() => {});
        }
    };

    const addProductToCart = (product, qty = 1) => {
        if (!product || !product.product_id) return;
        const maxStock =
            product.stock !== undefined && product.stock !== null
                ? Number(product.stock)
                : Infinity;
        if (maxStock <= 0) return;

        const addedQty = Math.max(1, Number(qty) || 1);
        const productIndex = cart.findIndex((cartProduct) => cartProduct.product_id === product.product_id);

        let nextCart;
        if (productIndex >= 0) {
            const currentQty = Number(cart[productIndex].quantity) || 0;
            const cappedQty = Number.isFinite(maxStock)
                ? Math.min(maxStock, currentQty + addedQty)
                : currentQty + addedQty;
            if (cappedQty <= currentQty) return;

            const updatedData = {
                ...cart[productIndex],
                ...product,
                quantity: cappedQty
            };
            nextCart = [...cart];
            nextCart[productIndex] = updatedData;
        } else {
            const initialQty = Number.isFinite(maxStock)
                ? Math.min(maxStock, addedQty)
                : addedQty;
            nextCart = [...cart, {...product, quantity: initialQty}];
        }
        persistUserCart(nextCart);
        trackCartAdd(product, addedQty);
    };

    const removeProductFromCart = (product) => {
        const productIndex = cart.findIndex((cartProduct) => cartProduct.product_id === product.product_id);

        if (productIndex === -1)
            return;

        let nextCart;
        if (cart[productIndex].quantity === 1) {
            nextCart = cart.filter((cartItem) => cartItem.product_id !== product.product_id);
        } else {
            const updatedData = {...cart[productIndex], quantity: cart[productIndex].quantity - 1};
            nextCart = [...cart];
            nextCart[productIndex] = updatedData;
        }
        persistUserCart(nextCart);
    };

    const updateQuantity = (product, operation) => {
        if (operation === 'ADD')
            return addProductToCart(product);

        if (operation === 'REMOVE')
            return removeProductFromCart(product);
    };

    const setCartItemQuantity = (productId, nextQty) => {
        const qty = Math.floor(Number(nextQty) || 0);
        if (qty <= 0) {
            persistUserCart(cart.filter((item) => item.product_id !== productId));
            return;
        }
        const nextCart = cart.map((item) =>
            item.product_id === productId ? {...item, quantity: qty} : item
        );
        persistUserCart(nextCart);
    };

    useEffect(() => {
        let products = 0;
        for (const cartElement of cart) {
            products += Number(cartElement.quantity || 0);
        }
        setCartCount(products);
    }, [cart]);

    return (
        <CartContext.Provider
            value={{
                cart,
                cartCount,
                addProductToCart,
                removeProductFromCart,
                updateQuantity,
                setCartItemQuantity,
            }}
        >
            <BrowserRouter>
                <AppShell
                    cart={cart}
                    cartCount={cartCount}
                    addProductToCart={addProductToCart}
                    updateQuantity={updateQuantity}
                    persistUserCart={persistUserCart}
                />
            </BrowserRouter>
        </CartContext.Provider>
    );
};

const AppShell = ({cart, cartCount, addProductToCart, updateQuantity, persistUserCart}) => {
    const location = useLocation();
    const isSellerPortal = location.pathname.startsWith('/seller');

    return (
        <>
            <ScrollToTop/>
            {!isSellerPortal && <Navigation cartCount={cartCount}/>}
            <Routes>
                {/* Standalone Seller Marketplace Portal (opens in new tab) */}
                <Route path={'/seller'} element={<SellerPortal/>}/>

                {/* Public Routes */}
                <Route path={'/'} element={<Home addProductToCart={addProductToCart}/>}/>
                <Route path={'/products'} element={<Products addProductToCart={addProductToCart}/>}/>
                <Route path={'/products/:id'} element={<ProductDetails addProductToCart={addProductToCart}/>}/>
                <Route path={'/privacy'} element={<PrivacyNotice/>}/>

                {/* Auth Routes */}
                <Route path={'/login'} element={<Login/>}/>
                <Route path={'/signup'} element={<Signup/>}/>
                <Route path={'/forgot-password'} element={<ForgotPassword/>}/>
                <Route path={'/reset-password/:token'} element={<ResetPassword/>}/>

                {/* Protected Customer Routes (Require Login) */}
                <Route
                    path={'/cart'}
                    element={
                        <PrivateRoute
                            component={<CartPage cart={cart} cartCount={cartCount} updateQuantity={updateQuantity}/>}
                        />
                    }
                />
                <Route
                    path={'/checkout'}
                    element={<PrivateRoute component={<Checkout/>}/>}
                />
                <Route
                    path={'/checkout/success'}
                    element={<PrivateRoute component={<Success setCart={persistUserCart}/>}/>}
                />
                <Route
                    path={'/orders'}
                    element={<PrivateRoute component={<Order/>}/>}
                />
                <Route
                    path={'/orders/:id'}
                    element={<PrivateRoute component={<OrderId/>}/>}
                />
                <Route
                    path={'/shipping'}
                    element={<PrivateRoute component={<Shipment/>}/>}
                />
                <Route
                    path={'/shipping/:id'}
                    element={<PrivateRoute component={<ShipmentId/>}/>}
                />
                <Route
                    path={'/wishlist'}
                    element={<PrivateRoute component={<Wishlist addProductToCart={addProductToCart}/>}/>}
                />
                <Route
                    path={'/profile'}
                    element={<PrivateRoute component={<Profile/>}/>}
                />
                <Route
                    path={'/pending-reviews'}
                    element={<PrivateRoute component={<PendingReviewsPage/>}/>}
                />
                <Route
                    path={'/notifications'}
                    element={<PrivateRoute component={<NotificationsPage/>}/>}
                />

                {/* Protected Admin Routes (Require ADMIN Role) */}
                <Route path={'/admin'} element={<PrivateRoute role={'ADMIN'} component={<Admin/>}/>}/>
                <Route
                    path={'/admin/pickup-stations'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminPickupStations/>}/>}
                />
                <Route
                    path={'/admin/orders'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminOrders/>}/>}
                />
                <Route
                    path={'/admin/orders/update'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminUpdateOrder/>}/>}
                />
                <Route
                    path={'/admin/orders/:id'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminViewOrder/>}/>}
                />
                <Route
                    path={'/admin/shipping'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminShipping/>}/>}
                />
                <Route
                    path={'/admin/shipping/update'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminUpdateShipping/>}/>}
                />
                <Route
                    path={'/admin/products/new'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminNewProduct/>}/>}
                />
                <Route
                    path={'/admin/products/edit/:id'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminNewProduct/>}/>}
                />
                <Route
                    path={'/admin/products/update'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminUpdate/>}/>}
                />
                <Route
                    path={'/admin/products/update/success'}
                    element={<PrivateRoute role={'ADMIN'} component={<AdminUpdateSuccess/>}/>}
                />

                {/* Error & Not Found Routes */}
                <Route path={'/401'} element={<Error401/>}/>
                <Route path={'/404'} element={<Error404/>}/>
                <Route path={'*'} element={<Error404/>}/>
            </Routes>
            {!isSellerPortal && <Footer/>}
            <CookieConsentPopup/>
        </>
    );
};

export default App;
