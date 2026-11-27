import { baseEmailLayout } from "./baseEmailLayout.js";

const FALLBACK_PRODUCT_IMG = "https://www.themealdb.com/images/ingredients/Kale.png";

export const resolveEmailImageUrl = (raw) => {
  const url = String(raw || "").trim();
  if (!/^https?:\/\//i.test(url)) return FALLBACK_PRODUCT_IMG;
  // Ensure Cloudinary images always deliver fast, email-client-safe PNG thumbnails (even if uploaded as WebP/AVIF)
  if (
    /res\.cloudinary\.com\/[^/]+\/image\/upload\//i.test(url) &&
    !/\/image\/upload\/[^/]*f_(png|jpg|jpeg)/i.test(url)
  ) {
    return url.replace(
      /\/image\/upload\//i,
      "/image/upload/w_160,h_160,c_pad,b_rgb:f8fafc,f_png,q_auto/"
    );
  }
  return url;
};

export const formatCleanEmailAddress = (address = {}) => {
  const isPickup = address?.delivery_method === "PICKUP_STATION";
  if (isPickup && address?.pickup_station?.name) {
    const parts = [
      address.pickup_station.name,
      address.pickup_station.landmark,
      address.pickup_station.area || address.area,
      address.pickup_station.city || address.city,
    ].filter((v) => v && String(v).trim().toUpperCase() !== "N/A");
    return {
      label: "Pickup Station",
      value: parts.join(", ") || "FreshMart Pickup Hub, Nairobi",
      hours: address.pickup_station.opening_hours || "",
    };
  }

  const bldg =
    address.building_number && String(address.building_number).trim().toUpperCase() !== "N/A"
      ? `Bldg ${String(address.building_number).trim()}`
      : "";
  const parts = [bldg, address.street, address.area, address.city, address.country].filter(
    (v) => v && String(v).trim().toUpperCase() !== "N/A"
  );
  // Deduplicate adjacent identical segments (e.g. "Uthiru ward ... Uthiru ward")
  const deduped = Array.from(new Set(parts.map((p) => String(p).trim())));

  return {
    label: "Delivery Address",
    value: deduped.join(", ") || "Nairobi, Kenya",
    hours: "",
  };
};

export const renderEmailProductRows = (products = []) =>
  products
    .map((item) => {
      const qty = Math.max(1, Number(item.quantity || 1));
      const unitPrice = Number(item.price ?? item.discounted_price ?? 0);
      const lineTotal = unitPrice > 0 ? unitPrice * qty : 0;
      const imgSrc = resolveEmailImageUrl(item.image);
      const subParts = [
        item.category || "",
        item.weight ? `${item.weight}${item.measurement || ""}` : "",
        item.seller_name ? `Seller: ${item.seller_name}` : "",
      ].filter(Boolean);

      return `
      <tr>
        <td width="76" valign="middle" style="padding:12px 12px 12px 0;border-bottom:1px solid #f1f5f9;">
          <img
            src="${imgSrc}"
            alt="${String(item.name || "Product").replace(/"/g, "&quot;")}"
            width="64"
            height="64"
            style="display:block;width:64px;height:64px;object-fit:cover;border-radius:12px;border:1px solid #e2e8f0;background-color:#f8fafc;"
          />
        </td>
        <td valign="middle" style="padding:12px 10px 12px 0;border-bottom:1px solid #f1f5f9;">
          <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:19px;">
            ${item.name || "Grocery Item"}
          </div>
          ${
            subParts.length > 0
              ? `<div style="font-size:12px;color:#64748b;margin-top:3px;line-height:16px;">${subParts.join(" &bull; ")}</div>`
              : ""
          }
          <div style="margin-top:5px;">
            <span style="display:inline-block;background:#f1f5f9;color:#334155;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px;">
              Qty: ${qty}
            </span>
            ${
              unitPrice > 0
                ? `<span style="font-size:11px;color:#64748b;margin-left:6px;">@ ${unitPrice.toFixed(2)} KES</span>`
                : ""
            }
          </div>
        </td>
        <td align="right" valign="middle" style="padding:12px 0;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
          ${
            lineTotal > 0
              ? `<div style="font-size:14px;font-weight:800;color:#0f172a;">${lineTotal.toFixed(2)} KES</div>`
              : `<div style="font-size:13px;font-weight:700;color:#475569;">&times; ${qty}</div>`
          }
        </td>
      </tr>`;
    })
    .join("");

export const STATUS_EMAIL_META = {
  ORDER_PLACED: {
    badge: "ORDER PLACED",
    emoji: "🛍️",
    headline: "Your Order Has Been Placed",
    summary: "We have recorded your order in our system and queued it for confirmation.",
    pillBg: "#eff6ff",
    pillColor: "#1d4ed8",
    accent: "#2563eb",
    stepIndex: 0,
  },
  PENDING_CONFIRMATION: {
    badge: "CONFIRMED",
    emoji: "✅",
    headline: "Your Order Is Confirmed!",
    summary: "Payment and stock reservation are confirmed. Our team is preparing your groceries.",
    pillBg: "#eff6ff",
    pillColor: "#1d4ed8",
    accent: "#2563eb",
    stepIndex: 1,
  },
  WAITING_TO_BE_SHIPPED: {
    badge: "PACKED • WAITING TO BE SHIPPED",
    emoji: "📦",
    headline: "Your Groceries Are Packed & Ready for Dispatch!",
    summary: "Your fresh items have been carefully handpicked, packed, and are waiting for our express rider.",
    pillBg: "#fffbeb",
    pillColor: "#b45309",
    accent: "#d97706",
    stepIndex: 2,
  },
  SHIPPED: {
    badge: "SHIPPED • ON THE WAY",
    emoji: "🚚",
    headline: "Your Order Has Been Shipped!",
    summary: "Your package has been dispatched and is currently in transit with our express delivery rider.",
    pillBg: "#eff6ff",
    pillColor: "#1d4ed8",
    accent: "#0284c7",
    stepIndex: 3,
  },
  AVAILABLE_FOR_PICKUP: {
    badge: "AVAILABLE FOR PICKUP",
    emoji: "🏪",
    headline: "Your Order Is Ready for Pickup!",
    summary: "Your order has arrived at your selected FreshMart Pickup Station and is ready for collection.",
    pillBg: "#ecfdf5",
    pillColor: "#047857",
    accent: "#059669",
    stepIndex: 4,
  },
  DELIVERED: {
    badge: "DELIVERED",
    emoji: "🎉",
    headline: "Your Order Has Been Delivered!",
    summary: "Your groceries have been delivered. We hope everything arrived farm-fresh!",
    pillBg: "#ecfdf5",
    pillColor: "#047857",
    accent: "#059669",
    stepIndex: 5,
  },
  RETURN_IN_PROGRESS: {
    badge: "RETURN IN PROGRESS",
    emoji: "↩️",
    headline: "Your Return Request Is In Progress",
    summary: "We are processing the return for your order and will keep you updated at every step.",
    pillBg: "#fffbeb",
    pillColor: "#b45309",
    accent: "#d97706",
    stepIndex: -1,
  },
  RETURNED: {
    badge: "RETURNED",
    emoji: "📦",
    headline: "Your Returned Order Has Been Received",
    summary: "We have received your returned items and verified them at our fulfillment center.",
    pillBg: "#f1f5f9",
    pillColor: "#475569",
    accent: "#64748b",
    stepIndex: -1,
  },
  REFUNDED: {
    badge: "REFUNDED",
    emoji: "💳",
    headline: "Your Order Refund Has Been Processed",
    summary: "Your refund for this order has been processed back to your original payment method.",
    pillBg: "#ecfdf5",
    pillColor: "#047857",
    accent: "#059669",
    stepIndex: -1,
  },
  FAILED_DELIVERY: {
    badge: "FAILED DELIVERY",
    emoji: "⚠️",
    headline: "Delivery Attempt Unsuccessful",
    summary: "Our rider was unable to complete delivery. Please check your order tracker or contact support to reschedule.",
    pillBg: "#fef2f2",
    pillColor: "#b91c1c",
    accent: "#dc2626",
    stepIndex: -1,
  },
  CANCELLED: {
    badge: "CANCELLED",
    emoji: "❌",
    headline: "Your Order Has Been Cancelled",
    summary: "This order has been cancelled. If your order was prepaid, our team will process your refund promptly.",
    pillBg: "#fef2f2",
    pillColor: "#b91c1c",
    accent: "#dc2626",
    stepIndex: -1,
  },
  CANCELLED_PAYMENT_UNSUCCESSFUL: {
    badge: "PAYMENT UNSUCCESSFUL",
    emoji: "⚠️",
    headline: "Order Cancelled — Payment Unsuccessful",
    summary: "Payment could not be completed for this order. You can place a fresh order anytime in the store.",
    pillBg: "#fef2f2",
    pillColor: "#b91c1c",
    accent: "#dc2626",
    stepIndex: -1,
  },
};

const renderProgressStepper = (stepIndex) => {
  if (stepIndex < 0) return "";
  const steps = ["Placed", "Confirmed", "Packed", "Shipped", "Delivered"];
  const normalizedIdx = stepIndex >= 4 ? (stepIndex === 5 ? 4 : 3) : stepIndex;

  const cells = steps
    .map((label, idx) => {
      const done = idx <= normalizedIdx;
      const dotBg = done ? "#059669" : "#e2e8f0";
      const dotColor = done ? "#ffffff" : "#94a3b8";
      const textColor = done ? "#065f46" : "#94a3b8";
      return `
        <td align="center" width="20%" style="padding:4px 2px;">
          <div style="width:24px;height:24px;line-height:24px;border-radius:50%;background:${dotBg};color:${dotColor};font-size:11px;font-weight:800;margin:0 auto 5px;">
            ${done ? "&#10003;" : idx + 1}
          </div>
          <div style="font-size:10px;font-weight:700;color:${textColor};letter-spacing:0.2px;">
            ${label}
          </div>
        </td>`;
    })
    .join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 8px;margin-bottom:22px;">
      <tr>${cells}</tr>
    </table>`;
};

export const orderStatusUpdateTemplate = ({
  order,
  status,
  products = [],
  baseUrl = "http://localhost:3000",
}) => {
  const cleanBase = String(baseUrl || "http://localhost:3000").replace(/\/+$/, "");
  const meta = STATUS_EMAIL_META[status] || {
    badge: String(status || "UPDATED").replace(/_/g, " "),
    emoji: "📦",
    headline: "Your Order Status Was Updated",
    summary: `Your order #${order?.order_id} status is now ${String(status || "").replace(/_/g, " ")}.`,
    pillBg: "#eff6ff",
    pillColor: "#1d4ed8",
    accent: "#059669",
    stepIndex: -1,
  };

  const customerName =
    [order?.name?.first, order?.name?.last].filter(Boolean).join(" ") ||
    order?.name?.first ||
    "Valued Customer";
  const items = Array.isArray(products) && products.length > 0 ? products : order?.products || [];
  const rowsHtml = renderEmailProductRows(items);
  const addr = formatCleanEmailAddress(order?.address || {});
  const updatedTime = new Date().toLocaleString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return baseEmailLayout({
    title: `${meta.emoji} Order #${order?.order_id} — ${meta.badge}`,
    preheader: `${meta.headline} (Order #${order?.order_id})`,
    contentHtml: `
      <div style="margin-bottom:14px;">
        <span style="display:inline-block;background:${meta.pillBg};color:${meta.pillColor};font-size:11px;font-weight:800;letter-spacing:0.6px;padding:5px 12px;border-radius:999px;text-transform:uppercase;">
          ${meta.emoji} ${meta.badge} &bull; ORDER #${order?.order_id}
        </span>
      </div>

      <h2 style="margin:0 0 10px;font-size:21px;font-weight:800;color:#0f172a;line-height:28px;">
        ${meta.headline}
      </h2>
      <p style="margin:0 0 18px;font-size:15px;line-height:23px;color:#475569;">
        Hi <strong>${customerName}</strong>, ${meta.summary}
      </p>

      ${renderProgressStepper(meta.stepIndex)}

      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:6px;">
        Items in Your Order (${items.length})
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:18px;border-top:1px solid #e2e8f0;">
        ${rowsHtml}
        <tr>
          <td colspan="2" style="padding-top:14px;font-size:14px;font-weight:700;color:#334155;">
            Order Total (Free Express Delivery)
          </td>
          <td align="right" style="padding-top:14px;font-size:18px;font-weight:800;color:#059669;white-space:nowrap;">
            ${Number(order?.total || 0).toFixed(2)} KES
          </td>
        </tr>
      </table>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;font-size:13px;color:#475569;line-height:20px;margin-bottom:22px;">
        <strong style="color:#0f172a;">${addr.label}:</strong><br/>
        ${addr.value}
        ${addr.hours ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">🕒 ${addr.hours}</div>` : ""}
        <div style="margin-top:6px;font-size:11px;color:#94a3b8;">Updated: ${updatedTime}</div>
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center" style="padding-top:4px;">
            <a href="${cleanBase}/shipping/${order?.order_id}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:999px;margin:4px 6px;">
              Track Live Shipment &rarr;
            </a>
            <a href="${cleanBase}/orders/${order?.order_id}" style="display:inline-block;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:999px;margin:4px 6px;">
              View Order Receipt
            </a>
          </td>
        </tr>
      </table>
    `,
  });
};

export default orderStatusUpdateTemplate;
