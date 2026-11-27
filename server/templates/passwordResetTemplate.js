import { baseEmailLayout } from "./baseEmailLayout.js";

export const passwordResetTemplate = ({ name = "Customer", resetUrl }) =>
  baseEmailLayout({
    title: "Reset Your KijaniMart Password",
    preheader: "Use the link inside to reset your KijaniMart account password.",
    contentHtml: `
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">Reset Your Password</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">
        Hi <strong>${name}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#475569;">
        We received a request to reset the password for your KijaniMart account. Click the button below to choose a new password. This link is valid for <strong>1 hour</strong>.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#10b981 0%,#059669 100%);color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 32px;border-radius:999px;box-shadow:0 8px 20px -4px rgba(16,185,129,0.4);">
          Reset My Password
        </a>
      </div>
      <p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#64748b;">
        Or copy and paste this link into your browser:
      </p>
      <div style="word-break:break-all;background-color:#f8fafc;border:1px solid #e2e8f0;padding:10px 14px;border-radius:10px;font-size:12px;color:#059669;margin-bottom:20px;">
        ${resetUrl}
      </div>
      <p style="margin:0;font-size:13px;line-height:20px;color:#94a3b8;">
        If you didn't request a password reset, you can safely ignore this email—your password will remain unchanged.
      </p>
    `,
  });

export default passwordResetTemplate;
