import dotenv from "dotenv";
dotenv.config();

const BASE_URL = (
    process.env.WEBSITE_BASE_URL || "https://online-grocery-store-sable.vercel.app"
).replace(/\/+$/, "");

export const WEBSITE_BASE_URL = BASE_URL;
export const PRODUCTS_BASEURL = `${BASE_URL}/products`;
export const ORDERS_BASEURL = `${BASE_URL}/orders`;
export const SHIPPING_BASEURL = `${BASE_URL}/shipping`;
export const NOTIFICATIONS_BASEURL = `${BASE_URL}/notifications`;
export const PAYMENTS_BASEURL = `${BASE_URL}/payments`;
export const USER_BASEURL = `${BASE_URL}/api/v1`;
