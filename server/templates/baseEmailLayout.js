export const baseEmailLayout = ({ title, preheader = "", contentHtml }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background-color:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 12px 32px -8px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#064e3b 0%,#059669 100%);padding:28px 32px;text-align:center;">
              <div style="display:inline-block;background:rgba(255,255,255,0.16);color:#ecfdf5;font-size:11px;font-weight:700;letter-spacing:1.2px;padding:4px 12px;border-radius:999px;text-transform:uppercase;margin-bottom:8px;">
                ⚡ 20-Min Express Grocery
              </div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">KijaniMart</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${contentHtml}
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 32px;text-align:center;font-size:12px;color:#64748b;line-height:18px;">
              <strong>KijaniMart Online Grocery Store</strong> • Nairobi, Kenya<br/>
              100% Farm-Fresh Groceries Delivered in 20 Minutes.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
