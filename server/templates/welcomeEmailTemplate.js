import { baseEmailLayout } from "./baseEmailLayout.js";

export const welcomeEmailTemplate = ({ name = "Customer", shopUrl = "" }) =>
  baseEmailLayout({
    title: "Welcome to FreshMart!",
    preheader: "Farm-fresh groceries delivered to your doorstep in 20 minutes.",
    contentHtml: `
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">Welcome to FreshMart, ${name}! 🥬</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#475569;">
        Thank you for creating your FreshMart account. You now have access to 50+ farm-fresh groceries, organic vegetables, prime meats, dairy, and daily essentials delivered in under 20 minutes.
      </p>
      ${
        shopUrl
          ? `<div style="text-align:center;margin:28px 0;">
              <a href="${shopUrl}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;">
                Start Shopping Fresh Aisles
              </a>
            </div>`
          : ""
      }
    `,
  });

export default welcomeEmailTemplate;
