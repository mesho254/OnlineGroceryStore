import { baseEmailLayout } from "./baseEmailLayout.js";
import { resolveEmailImageUrl } from "./orderStatusUpdateTemplate.js";

const renderStockProductRow = (p, isSoldOut) => {
    const imgSrc = resolveEmailImageUrl(p.image);
    const safeName = String(p.name || "Product").replace(/"/g, "&quot;");
    const skuOrId = p.sku || p.product_id || "";
    const metaParts = [
        skuOrId ? `#${skuOrId}` : "",
        p.category || "Grocery",
        p.seller?.name ? p.seller.name : "",
    ].filter(Boolean);
    const price = Number(p.discounted_price ?? p.price ?? 0);

    const stockBadge = isSoldOut
        ? `<span style="display:inline-block;background:#dc2626;color:#ffffff;font-size:11px;font-weight:800;padding:4px 11px;border-radius:999px;white-space:nowrap;">SOLD OUT (0)</span>`
        : `<span style="display:inline-block;background:#fef3c7;color:#b45309;border:1px solid #fcd34d;font-size:11px;font-weight:800;padding:4px 11px;border-radius:999px;white-space:nowrap;">${Number(
              p.stock || 0
          )} left</span>`;

    return `
        <tr>
          <td width="68" valign="middle" style="padding:12px 10px 12px 12px;border-bottom:1px solid #f1f5f9;">
            <img
              src="${imgSrc}"
              alt="${safeName}"
              width="54"
              height="54"
              style="display:block;width:54px;height:54px;object-fit:cover;border-radius:10px;border:1px solid #e2e8f0;background-color:#f8fafc;"
            />
          </td>
          <td valign="middle" style="padding:12px 10px 12px 0;border-bottom:1px solid #f1f5f9;">
            <div style="font-size:13.5px;font-weight:700;color:#0f172a;line-height:18px;">
              ${p.name || "Product"}
            </div>
            <div style="font-size:11.5px;font-weight:500;color:#64748b;margin-top:2px;line-height:16px;">
              ${metaParts.join(" &bull; ")}
            </div>
            ${
                price > 0
                    ? `<div style="font-size:11.5px;font-weight:700;color:#059669;margin-top:3px;">${price.toFixed(
                          2
                      )} KES</div>`
                    : ""
            }
          </td>
          <td align="right" valign="middle" style="padding:12px 12px 12px 6px;border-bottom:1px solid #f1f5f9;">
            ${stockBadge}
          </td>
        </tr>`;
};

export const lowStockAlertEmailTemplate = ({
    adminName = "Admin",
    outOfStockProducts = [],
    lowStockProducts = [],
    threshold = 10,
    baseUrl = "http://localhost:3000",
}) => {
    const cleanBase = String(baseUrl || "http://localhost:3000").replace(/\/+$/, "");
    const outRows = outOfStockProducts.map((p) => renderStockProductRow(p, true)).join("");
    const lowRows = lowStockProducts.map((p) => renderStockProductRow(p, false)).join("");

    const totalFlagged = outOfStockProducts.length + lowStockProducts.length;
    const hasSoldOut = outOfStockProducts.length > 0;
    const headlineVerb = totalFlagged === 1 ? "Needs" : "Need";
    const headlineNoun = totalFlagged === 1 ? "Product" : "Products";

    const contentHtml = `
      <div style="display:inline-block;background:${
          hasSoldOut ? "#fef2f2" : "#fffbeb"
      };border:1px solid ${hasSoldOut ? "#fecaca" : "#fde68a"};color:${
        hasSoldOut ? "#b91c1c" : "#b45309"
    };font-size:11px;font-weight:800;letter-spacing:0.4px;padding:4px 12px;border-radius:999px;margin-bottom:12px;text-transform:uppercase;">
        ${hasSoldOut ? "🚨 OUT OF STOCK INVENTORY ALERT" : "⚠️ LOW STOCK INVENTORY ALERT"}
      </div>
      <h2 style="margin:0 0 8px 0;font-size:21px;font-weight:800;color:#0f172a;line-height:28px;">
        ${totalFlagged} ${headlineNoun} ${headlineVerb} Restocking
      </h2>
      <p style="margin:0 0 18px 0;font-size:14px;color:#475569;line-height:21px;">
        Hi <strong>${adminName}</strong>, here is your latest KijaniMart inventory summary:
        <strong>${outOfStockProducts.length} sold-out</strong> and
        <strong>${lowStockProducts.length} low-stock (&le; ${threshold} units)</strong>
        ${totalFlagged === 1 ? "item requires" : "items require"} restocking.
      </p>

      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;margin-bottom:22px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th align="left" colspan="2" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid #e2e8f0;">Product</th>
            <th align="right" style="padding:10px 12px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:1px solid #e2e8f0;">Live Stock</th>
          </tr>
        </thead>
        <tbody>
          ${outRows}
          ${lowRows}
        </tbody>
      </table>

      <div style="text-align:center;margin-bottom:18px;">
        <a href="${cleanBase}/admin?tab=inventory&stock=${hasSoldOut ? "OUT" : "LOW"}"
           style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 26px;border-radius:999px;">
          Open Admin Inventory Manager &rarr;
        </a>
      </div>

      <p style="margin:0;text-align:center;font-size:11.5px;color:#94a3b8;line-height:17px;">
        To keep your inbox clutter-free, low-stock email reminders are sent at most once every 6 hours.
      </p>
    `;

    return baseEmailLayout({
        title: `KijaniMart Stock Alert (${totalFlagged} ${totalFlagged === 1 ? "item" : "items"})`,
        preheader: `${outOfStockProducts.length} sold out and ${lowStockProducts.length} low stock products need restocking.`,
        contentHtml,
    });
};
