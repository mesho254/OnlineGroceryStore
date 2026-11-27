import { baseEmailLayout } from "./baseEmailLayout.js";
import { resolveEmailImageUrl } from "./orderStatusUpdateTemplate.js";

export const deliveryReviewEmailTemplate = ({
  name = "Customer",
  order_id,
  products = [],
  total = null,
  hasPdfAttachment = true,
  baseUrl = "http://localhost:3000",
}) => {
  const cleanBase = String(baseUrl || "http://localhost:3000").replace(/\/+$/, "");

  const itemsHtml = products
    .map((item) => {
      const imgSrc = resolveEmailImageUrl(item.image);
      const qty = Math.max(1, Number(item.quantity || 1));
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
          <div style="font-size:12px;color:#64748b;margin-top:3px;">
            Seller: ${item.seller_name || "FreshMart Farm Partner"} &bull; Qty: ${qty}
          </div>
        </td>
        <td align="right" valign="middle" style="padding:12px 0;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
          <a href="${cleanBase}/products/${item.product_id}?review=true&order=${order_id}" style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;text-decoration:none;font-size:12px;font-weight:700;padding:7px 14px;border-radius:999px;">
            ★ Rate Item
          </a>
        </td>
      </tr>`;
    })
    .join("");

  return baseEmailLayout({
    title: `Order #${order_id} Delivered! Rate Your Groceries ⭐`,
    preheader: `Your FreshMart order #${order_id} has been delivered. Tell us how we did!`,
    contentHtml: `
      <div style="margin-bottom:14px;">
        <span style="display:inline-block;background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:11px;font-weight:800;letter-spacing:0.6px;padding:5px 12px;border-radius:999px;text-transform:uppercase;">
          ⭐ DELIVERED &bull; ORDER #${order_id}
        </span>
      </div>

      <h2 style="margin:0 0 10px;font-size:22px;font-weight:800;color:#0f172a;line-height:28px;">
        Your Groceries Have Arrived! 🎉
      </h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:23px;color:#475569;">
        Hi <strong>${name}</strong>, your order <strong>#${order_id}</strong>${
          total ? ` (<strong>${Number(total).toFixed(2)} KES</strong>)` : ""
        } has been marked as <strong>Delivered</strong>. We hope your groceries arrived farm-fresh and right on time!
      </p>
      <p style="margin:0 0 16px;font-size:14px;line-height:21px;color:#475569;">
        Take a moment to rate the quality of your products and seller below:
      </p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;border-top:1px solid #e2e8f0;">
        ${itemsHtml}
      </table>

      ${
        hasPdfAttachment
          ? `<div style="background:#f8fafc;border:1px dashed #94a3b8;border-radius:14px;padding:13px 16px;margin-bottom:22px;font-size:13px;color:#334155;line-height:20px;">
              <strong style="color:#0f172a;">🧾 Official POS Sales Receipt Attached (PDF)</strong><br/>
              Your thermal-style POS receipt (<strong>FreshMart-Receipt-${order_id}.pdf</strong>) is attached to this email for your records. You can also download it anytime from your Order Receipt page.
            </div>`
          : ""
      }

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
        <tr>
          <td align="center">
            <a href="${cleanBase}/profile?tab=reviews" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 28px;border-radius:999px;margin:4px 6px;">
              Rate Your Order ⭐
            </a>
            <a href="${cleanBase}/orders/${order_id}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:999px;margin:4px 6px;">
              🧾 View &amp; Download Receipt
            </a>
          </td>
        </tr>
      </table>
    `,
  });
};

export default deliveryReviewEmailTemplate;
