import axios from 'axios';
import {
    ADMIN_BASEURL,
    NOTIFICATIONS_BASEURL,
    ORDERS_BASEURL,
    PAYMENTS_BASEURL,
    PRODUCTS_BASEURL,
    SELLER_BASEURL,
    SHIPPING_BASEURL,
    USER_BASEURL,
} from "./BaseURLs";
import {getTrackerSessionId} from "../utils/tracker";
import {
    clearStoredProfile,
    isAccessTokenExpired,
    isRefreshTokenExpired,
    readStoredProfile,
    writeStoredProfile,
} from "../utils/authSession";

const API = axios.create();

const AUTH_BYPASS_PATHS = [
    '/login',
    '/signup',
    '/refresh-token',
    '/logout',
    '/forgot-password',
    '/reset-password',
];

const isAuthBypassUrl = (url = '') =>
    AUTH_BYPASS_PATHS.some((segment) => String(url).includes(segment));

// Single-flight refresh promise so concurrent expired requests share one /refresh-token call
let inFlightRefreshPromise = null;

export const refreshAuthSession = async () => {
    if (inFlightRefreshPromise) {
        return inFlightRefreshPromise;
    }

    const current = readStoredProfile();
    const refreshToken = current?.refreshToken;

    if (!refreshToken || isRefreshTokenExpired(current, 1000)) {
        clearStoredProfile({notify: true, reason: 'refresh_token_expired'});
        throw new Error('Refresh token expired');
    }

    inFlightRefreshPromise = axios
        .post(`${USER_BASEURL}/refresh-token`, {refreshToken})
        .then((res) => {
            const updated = writeStoredProfile(res.data, {notify: true});
            if (!updated?.accessToken) {
                throw new Error('Invalid refresh response');
            }
            return updated;
        })
        .catch((err) => {
            const status = err?.response?.status;
            if (status === 401 || status === 403) {
                clearStoredProfile({notify: true, reason: 'refresh_rejected'});
            }
            throw err;
        })
        .finally(() => {
            inFlightRefreshPromise = null;
        });

    return inFlightRefreshPromise;
};

API.interceptors.request.use(async (req) => {
    let profile = readStoredProfile();

    // Proactively rotate access token if it is expired or expiring within 20 seconds
    if (
        profile &&
        !isAuthBypassUrl(req.url) &&
        isAccessTokenExpired(profile, 20000) &&
        profile.refreshToken &&
        !isRefreshTokenExpired(profile, 2000)
    ) {
        try {
            profile = await refreshAuthSession();
        } catch {
            profile = readStoredProfile();
        }
    }

    const token = profile ? profile.accessToken || profile.token : null;
    if (token) {
        req.headers.Authorization = `Bearer ${token}`;
    }

    const sessionId = getTrackerSessionId();
    if (sessionId) {
        req.headers['X-Session-Id'] = sessionId;
    }

    return req;
});

API.interceptors.response.use(
    (response) => {
        // If an endpoint (such as password change) returns newly rotated tokens, persist them
        if (response?.data?.accessToken && response?.data?.refreshToken && !isAuthBypassUrl(response?.config?.url)) {
            writeStoredProfile(response.data, {notify: true});
        }
        return response;
    },
    async (error) => {
        const originalRequest = error?.config;
        const status = error?.response?.status;
        const errorCode = error?.response?.data?.code;
        const url = String(originalRequest?.url || '');

        if (status !== 401 || !originalRequest || originalRequest._retry || isAuthBypassUrl(url)) {
            return Promise.reject(error);
        }

        // Password-check or checkout-token endpoints return 401 for business logic; only refresh if JWT itself expired
        const isPasswordOrCheckoutCheck =
            url.includes('/profile/password') ||
            url.includes('/profile/suspend') ||
            url.includes(PAYMENTS_BASEURL);

        if (isPasswordOrCheckoutCheck && errorCode !== 'TOKEN_EXPIRED') {
            return Promise.reject(error);
        }

        const current = readStoredProfile();
        if (current?.refreshToken && !isRefreshTokenExpired(current, 1000)) {
            originalRequest._retry = true;
            try {
                const refreshed = await refreshAuthSession();
                originalRequest.headers = originalRequest.headers || {};
                originalRequest.headers.Authorization = `Bearer ${refreshed.accessToken}`;
                return API(originalRequest);
            } catch (refreshErr) {
                return Promise.reject(refreshErr);
            }
        }

        if (errorCode === 'TOKEN_EXPIRED' || errorCode === 'TOKEN_INVALID' || current) {
            clearStoredProfile({notify: true, reason: 'access_token_expired'});
        }

        return Promise.reject(error);
    }
);

export const getProductsPerPage = (page, category, flash = false) =>
    API.get(
        `${PRODUCTS_BASEURL}?page=${page}${
            category ? `&category=${encodeURIComponent(category)}` : ''
        }${flash ? '&flash=true' : ''}`
    );
export const productsSearch = (search, page) =>
    API.get(`${PRODUCTS_BASEURL}/search?search=${encodeURIComponent(search)}&page=${page}`);
export const getRecommendations = () => API.get(`${PRODUCTS_BASEURL}/recommendations`);
export const trackProductInteraction = (payload) =>
    API.post(`${PRODUCTS_BASEURL}/interactions`, payload);
export const getFlashSaleProducts = () => API.get(`${PRODUCTS_BASEURL}/flash-sales`);
export const getProductById = (id) => API.get(`${PRODUCTS_BASEURL}/${id}`);
export const fetchPendingReviews = () => API.get(`${PRODUCTS_BASEURL}/pending-reviews`);
export const checkProductReviewEligibility = (id, orderId) =>
    API.get(`${PRODUCTS_BASEURL}/${id}/review-eligibility${orderId ? `?order=${encodeURIComponent(orderId)}` : ''}`);
export const postProductReview = (id, reviewData) =>
    API.post(`${PRODUCTS_BASEURL}/${id}/reviews`, reviewData);
export const postProduct = (product) => API.post(`${PRODUCTS_BASEURL}`, product);
export const adminUpdateDatabase = (csv, mode) => API.patch(`${PRODUCTS_BASEURL}`, {csv, mode});
export const validateCart = (cart) => API.post(`${PRODUCTS_BASEURL}/cart`, {cart});
export const checkProductsStock = (productIds, excludeCheckoutTokenId = null) =>
    API.post(`${PRODUCTS_BASEURL}/stock-check`, {
        product_ids: productIds,
        exclude_checkout_token_id: excludeCheckoutTokenId,
    });

export const authLogin = (email, password) => API.post(`${USER_BASEURL}/login`, {email, password});
export const authSignup = (first_name, last_name, email, password) =>
    API.post(`${USER_BASEURL}/signup`, {first_name, last_name, email, password});
export const authRefreshToken = (refreshToken) =>
    axios.post(`${USER_BASEURL}/refresh-token`, {refreshToken});
export const authLogout = (refreshToken, allDevices = false) =>
    axios.post(`${USER_BASEURL}/logout`, {refreshToken, allDevices});
export const authForgotPassword = (email) => API.post(`${USER_BASEURL}/forgot-password`, {email});
export const authResetPassword = (token, password) =>
    API.post(`${USER_BASEURL}/reset-password/${token}`, {password});
export const verify = () => API.post(`${USER_BASEURL}/verify`);
export const userUpdateWishlist = (product_id) => API.patch(`${USER_BASEURL}/wishlist`, {product_id});
export const getWishlist = () => API.get(`${USER_BASEURL}/wishlist`);
export const getUserCart = () => API.get(`${USER_BASEURL}/cart`);
export const syncUserCart = (cart) => API.put(`${USER_BASEURL}/cart`, {cart});
export const fetchUserProfile = () => API.get(`${USER_BASEURL}/profile`);
export const updateUserProfile = (data) => API.patch(`${USER_BASEURL}/profile`, data);
export const changeUserPassword = (data) => API.patch(`${USER_BASEURL}/profile/password`, data);
export const suspendMyAccount = (data) => API.post(`${USER_BASEURL}/profile/suspend`, data);

export const fetchShipments = (page) => API.get(`${SHIPPING_BASEURL}?page=${page}`);
export const fetchMyShipments = () => API.get(`${SHIPPING_BASEURL}/my-shipments`);
export const fetchShipment = (id) => API.get(`${SHIPPING_BASEURL}/${id}`);
export const updateShipment = (id, status) => API.patch(`${SHIPPING_BASEURL}/${id}`, {status});

export const fetchPickupStations = () => API.get(`${SHIPPING_BASEURL}/pickup-stations`);
export const createPickupStation = (data) => API.post(`${SHIPPING_BASEURL}/pickup-stations`, data);
export const updatePickupStation = (id, data) =>
    API.patch(`${SHIPPING_BASEURL}/pickup-stations/${id}`, data);
export const deletePickupStation = (id) =>
    API.delete(`${SHIPPING_BASEURL}/pickup-stations/${id}`);

export const fetchOrders = (page) => API.get(`${ORDERS_BASEURL}?page=${page}`);
export const fetchMyOrders = () => API.get(`${ORDERS_BASEURL}/my-orders`);
export const fetchOrder = (id) => API.get(`${ORDERS_BASEURL}/${id}`);
export const updateOrder = (id, status) => API.patch(`${ORDERS_BASEURL}/${id}`, {status});
export const downloadOrderReceiptPdf = (id) =>
    API.get(`${ORDERS_BASEURL}/${encodeURIComponent(id)}/receipt.pdf`, {
        responseType: 'blob',
    });

export const processPayment = (token, data) => API.post(`${PAYMENTS_BASEURL}`, {token, data});
export const verifyCheckoutSession = (sessionId) =>
    API.get(`${PAYMENTS_BASEURL}/session/${encodeURIComponent(sessionId)}`);
export const cancelPendingCheckout = (orderId) =>
    API.delete(`${PAYMENTS_BASEURL}/pending/${encodeURIComponent(orderId)}`);

export const fetchNotifications = (scope = 'all', limit = 40) =>
    API.get(
        `${NOTIFICATIONS_BASEURL}?scope=${encodeURIComponent(scope)}&limit=${encodeURIComponent(
            limit
        )}`
    );
export const markNotificationRead = (id, dismissed_popup) =>
    API.patch(`${NOTIFICATIONS_BASEURL}/${id}/read`, {dismissed_popup});
export const markAllNotificationsRead = (scope = 'mine') =>
    API.patch(`${NOTIFICATIONS_BASEURL}/read-all?scope=${encodeURIComponent(scope)}`);

export const fetchAdminOverview = () => API.get(`${ADMIN_BASEURL}/overview`);
export const triggerAdminStockCronScan = () => API.post(`${ADMIN_BASEURL}/stock-alerts/run`);
export const fetchAdminSellers = () => API.get(`${ADMIN_BASEURL}/sellers`);
export const updateAdminSellerStatus = (sellerId, status, rejection_reason = '') =>
    API.patch(`${ADMIN_BASEURL}/sellers/${sellerId}/status`, {status, rejection_reason});
export const fetchAdminUsers = () => API.get(`${ADMIN_BASEURL}/users`);
export const updateAdminUserRole = (userId, role) =>
    API.patch(`${ADMIN_BASEURL}/users/${userId}/role`, {role});
export const deleteAdminUser = (userId, reason = '') =>
    API.delete(`${ADMIN_BASEURL}/users/${userId}`, {data: {reason}});

export const fetchAdminInventory = () => API.get(`${ADMIN_BASEURL}/products`);
export const updateAdminProductQuick = (productId, data) =>
    API.patch(`${ADMIN_BASEURL}/products/${productId}`, data);
export const updateAdminProductFull = (productId, formData) =>
    API.put(`${ADMIN_BASEURL}/products/${productId}/full`, formData);
export const updateAdminProductApproval = (productId, approval_status, rejection_reason = '') =>
    API.patch(`${ADMIN_BASEURL}/products/${productId}/approval`, {
        approval_status,
        rejection_reason,
    });
export const reviewAdminProductPendingChanges = (productId, action, rejection_reason = '') =>
    API.patch(`${ADMIN_BASEURL}/products/${productId}/pending-changes`, {
        action,
        rejection_reason,
    });
export const deleteAdminProduct = (productId, reason = '') =>
    API.delete(`${ADMIN_BASEURL}/products/${productId}`, {data: {reason}});

export const fetchAdminTrash = () => API.get(`${ADMIN_BASEURL}/trash`);
export const restoreAdminTrashedProduct = (productId) =>
    API.patch(`${ADMIN_BASEURL}/trash/products/${productId}/restore`);
export const permanentDeleteAdminProduct = (productId) =>
    API.delete(`${ADMIN_BASEURL}/trash/products/${productId}/permanent`);
export const restoreAdminTrashedUser = (userId) =>
    API.patch(`${ADMIN_BASEURL}/trash/users/${userId}/restore`);
export const permanentDeleteAdminUser = (userId) =>
    API.delete(`${ADMIN_BASEURL}/trash/users/${userId}/permanent`);
export const triggerAdminTrashPurgeNow = () => API.post(`${ADMIN_BASEURL}/trash/purge-now`);

export const fetchAdminLogs = (category = 'ALL', severity = 'ALL') =>
    API.get(
        `${ADMIN_BASEURL}/logs?category=${encodeURIComponent(category)}&severity=${encodeURIComponent(
            severity
        )}`
    );
export const createAdminLog = (data) => API.post(`${ADMIN_BASEURL}/logs`, data);

// Seller Portal APIs
export const registerSeller = (data) => API.post(`${SELLER_BASEURL}/register`, data);
export const applyAsSeller = (data) => API.post(`${SELLER_BASEURL}/apply`, data);
export const fetchSellerStatus = () => API.get(`${SELLER_BASEURL}/status`);
export const fetchSellerOverview = () => API.get(`${SELLER_BASEURL}/overview`);
export const fetchSellerProducts = () => API.get(`${SELLER_BASEURL}/products`);
export const createSellerProduct = (formData) => API.post(`${SELLER_BASEURL}/products`, formData);
export const updateSellerProduct = (productId, formData) =>
    API.patch(`${SELLER_BASEURL}/products/${productId}`, formData);
export const deleteSellerProduct = (productId) =>
    API.delete(`${SELLER_BASEURL}/products/${productId}`);
export const fetchSellerOrders = () => API.get(`${SELLER_BASEURL}/orders`);
export const proposeSellerOrderStatus = (orderId, status, note = '') =>
    API.patch(`${SELLER_BASEURL}/orders/${orderId}/status`, {status, note});
export const fetchSellerReviews = () => API.get(`${SELLER_BASEURL}/reviews`);
export const updateSellerProfile = (data) => API.patch(`${SELLER_BASEURL}/profile`, data);
export const fetchSellerNotifications = () => API.get(`${SELLER_BASEURL}/notifications`);
export const markSellerNotificationsRead = () =>
    API.patch(`${SELLER_BASEURL}/notifications/read-all`);
