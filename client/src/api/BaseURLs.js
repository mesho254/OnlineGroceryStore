const BASE_URL = (
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    "http://localhost:5000"
).replace(/\/+$/, "");

export const PRODUCTS_BASEURL = `${BASE_URL}/products`;
export const ADMIN_PRODUCTS_BASEURL = `${BASE_URL}/products`;
export const ORDERS_BASEURL = `${BASE_URL}/orders`;
export const SHIPPING_BASEURL = `${BASE_URL}/shipping`;
export const PAYMENTS_BASEURL = `${BASE_URL}/payments`;
export const NOTIFICATIONS_BASEURL = `${BASE_URL}/notifications`;
export const ADMIN_BASEURL = `${BASE_URL}/admin`;
export const SELLER_BASEURL = `${BASE_URL}/seller`;
export const USER_BASEURL = `${BASE_URL}/api/v1`;
