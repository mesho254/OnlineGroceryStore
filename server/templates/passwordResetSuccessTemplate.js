import { baseEmailLayout } from "./baseEmailLayout.js";

export const passwordResetSuccessTemplate = ({ name = "Customer", loginUrl = "" }) =>
  baseEmailLayout({
    title: "Your Password Has Been Updated",
    preheader: "Confirmation that your FreshMart password was changed.",
    contentHtml: `
      <h2 style="margin:0 0 12px;font-size:20px;font-weight:700;color:#0f172a;">Password Updated Successfully ✓</h2>
      <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">
        Hi <strong>${name}</strong>,
      </p>
      <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#475569;">
        Your FreshMart account password has just been changed. You can now sign in with your new password.
      </p>
      ${
        loginUrl
          ? `<div style="text-align:center;margin:24px 0;">
              <a href="${loginUrl}" style="display:inline-block;background:#059669;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 28px;border-radius:999px;">
                Sign In to FreshMart
              </a>
            </div>`
          : ""
      }
      <p style="margin:0;font-size:13px;line-height:20px;color:#94a3b8;">
        If you did not make this change, please reset your password immediately.
      </p>
    `,
  });

export default passwordResetSuccessTemplate;
