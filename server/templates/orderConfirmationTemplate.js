import { baseEmailLayout } from "./baseEmailLayout.js";
import {
  formatCleanEmailAddress,
  renderEmailProductRows,
} from "./orderStatusUpdateTemplate.js";
import { WEBSITE_BASE_URL } from "../services/BaseURLs.js";

export const orderConfirmationTemplate = (order, baseUrl = WEBSITE_BASE_URL) => {
  const cleanBase = String(baseUrl || WEBSITE_BASE_URL || "http://localhost:3000").replace(
    /\/+$/,
    ""
  );
  const products = Array.isArray(order?.products) ? order.products : [];
  const rowsHtml = renderEmailProductRows(products);
  const addr = formatCleanEmailAddress(order?.address || {});
  const totalUnits = products.reduce((s, p) => s + Math.max(1, Number(p.quantity || 1)), 0);

  return baseEmailLayout({
    title: `Order Confirmation #${order?.order_id}`,
    preheader: `Your KijaniMart order #${order?.order_id} (${Number(order?.total || 0).toFixed(2)} KES) is confirmed!`,
    contentHtml: `
      <div style="margin-bottom:14px;">
        <span style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:11px;font-weight:800;letter-spacing:0.6px;padding:5px 12px;border-radius:999px;text-transform:uppercase;">
          ✓ ORDER CONFIRMED &bull; #${order?.order_id}
        </span>
      </div>

      <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#0f172a;line-height:28px;">
        Thank You for Your Order! 🎉
      </h2>
      <p style="margin:0 0 20px;font-size:15px;line-height:23px;color:#475569;">
        Hi <strong>${order?.name?.first || "Customer"}</strong>, we have received your order of
        <strong>${totalUnits} ${totalUnits === 1 ? "item" : "items"}</strong> and our team is
        preparing it for express delivery.
      </p>

      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.6px;color:#64748b;margin-bottom:6px;">
        Order Summary
      </div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;border-top:1px solid #e2e8f0;">
        ${rowsHtml}
        <tr>
          <td colspan="2" style="padding-top:12px;font-size:13px;color:#64748b;">
            Express Delivery Fee
          </td>
          <td align="right" style="padding-top:12px;font-size:13px;font-weight:700;color:#059669;">
            FREE
          </td>
        </tr>
        <tr>
          <td colspan="2" style="padding-top:8px;font-size:15px;font-weight:800;color:#0f172a;">
            Total Paid
          </td>
          <td align="right" style="padding-top:8px;font-size:19px;font-weight:800;color:#059669;white-space:nowrap;">
            ${Number(order?.total || 0).toFixed(2)} KES
          </td>
        </tr>
      </table>

      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:14px 16px;font-size:13px;color:#475569;line-height:20px;margin-bottom:24px;">
        <strong style="color:#0f172a;">${addr.label}:</strong><br/>
        ${addr.value}
        ${addr.hours ? `<div style="margin-top:4px;font-size:12px;color:#64748b;">🕒 ${addr.hours}</div>` : ""}
      </div>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${cleanBase}/shipping/${order?.order_id}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:999px;margin:4px 6px;">
              Track Live Order &rarr;
            </a>
            <a href="${cleanBase}/orders/${order?.order_id}" style="display:inline-block;background:#f1f5f9;color:#0f172a;border:1px solid #cbd5e1;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:999px;margin:4px 6px;">
              View Receipt
            </a>
          </td>
        </tr>
      </table>
    `,
  });
};

export default orderConfirmationTemplate;
