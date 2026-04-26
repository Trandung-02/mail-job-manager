/**
 * Email HTML Builder
 * Template chuyên nghiệp theo phong cách Meta/Facebook
 * Best practices: multipart/alternative, proper MIME, charset UTF-8
 */

// Design tokens - hiện đại, chuyên nghiệp
const DESIGN = {
  primary: "#2563EB",
  primaryLight: "#3B82F6",
  textPrimary: "#0F172A",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  bgPage: "#F8FAFC",
  bgCard: "#FFFFFF",
  border: "#E2E8F0",
  shadow: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
  radius: "12px",
  radiusSm: "8px",
};

/**
 * Escape HTML entities để tránh XSS và lỗi hiển thị
 * @param {string} text - Chuỗi cần escape
 * @returns {string}
 */
function escapeHtml(text) {
  if (text == null || typeof text !== "string") return "";
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Kiểm tra xem chuỗi đã có HTML tags chưa (ví dụ từ editor WYSIWYG)
 * @param {string} text
 * @returns {boolean}
 */
function hasHtmlContent(text) {
  if (!text || typeof text !== "string") return false;
  return /<[a-z][\s\S]*>/i.test(text);
}

/**
 * Kiểm tra xem có phải full HTML document (DOCTYPE, html, body)
 * @param {string} text
 * @returns {boolean}
 */
function isFullHtmlDocument(text) {
  if (!text || typeof text !== "string") return false;
  const trimmed = text.trim().toLowerCase();
  return (
    trimmed.startsWith("<!doctype") || (trimmed.startsWith("<html") && trimmed.includes("</html>"))
  );
}

/**
 * Chuyển plain text thành HTML (xuống dòng -> <br>, đoạn văn -> <p>)
 * @param {string} text - Nội dung plain text
 * @returns {string} HTML
 */
function plainTextToHtml(text) {
  if (text == null || typeof text !== "string") return "";
  const escaped = escapeHtml(text);
  const paragraphs = escaped.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const lines = p.split("\n").filter((l) => l.trim() !== "");
      if (lines.length === 0) return "";
      const content = lines.join("<br>\n");
      return `<p style="margin:0 0 16px 0;line-height:1.6;font-size:15px;color:${DESIGN.textPrimary};">${content}</p>`;
    })
    .filter((p) => p)
    .join("\n");
}

/**
 * Build HTML email theo phong cách Meta/Facebook
 * - Bố cục rõ ràng, card-based
 * - Typography chuyên nghiệp (system fonts)
 * - Màu sắc chuẩn Meta
 * - Responsive, tương thích email clients
 * @param {string} body - Nội dung email (plain text hoặc HTML)
 * @param {string} [recipientEmail] - Email người nhận (thay {mail_address} trong footer)
 * @returns {string} HTML document hoàn chỉnh
 */
function buildStandardHtmlEmail(body, recipientEmail = "") {
  if (body == null || typeof body !== "string") body = "";

  let htmlContent;
  if (isFullHtmlDocument(body)) {
    return body.trim();
  }
  if (hasHtmlContent(body)) {
    htmlContent = body.trim();
  } else {
    htmlContent = plainTextToHtml(body);
  }

  const fontStack =
    "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
  const recipientDisplay = recipientEmail ? escapeHtml(recipientEmail) : "{mail_address}";

  return [
    "<!DOCTYPE html>",
    '<html lang="vi">',
    "<head>",
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">',
    "  <title>Notification</title>",
    "  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->",
    '  <style type="text/css">',
    "    .email-content a { color: " +
      DESIGN.primary +
      "; text-decoration: none; font-weight: 500; }",
    "    .email-content a:hover { text-decoration: underline; }",
    "    .email-content p:last-child { margin-bottom: 0 !important; }",
    "    @media only screen and (max-width: 600px) { .email-wrapper { padding: 20px 16px !important; } .email-card { border-radius: 10px !important; } }",
    "  </style>",
    "</head>",
    `<body style="margin:0;padding:0;font-family:${fontStack};font-size:15px;line-height:1.6;color:${DESIGN.textPrimary};background-color:${DESIGN.bgPage};-webkit-font-smoothing:antialiased;">`,
    '  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:' +
      DESIGN.bgPage +
      ';min-height:100vh;">',
    "    <tr>",
    '      <td align="center" class="email-wrapper" style="padding:40px 24px;">',
    '        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">',
    "          <tr>",
    '            <td style="background-color:' +
      DESIGN.bgCard +
      ";border-radius:" +
      DESIGN.radius +
      ";box-shadow:" +
      DESIGN.shadow +
      ";border:1px solid " +
      DESIGN.border +
      ';overflow:hidden;">',
    "              <!-- Accent bar -->",
    '              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="height:4px;background-color:' +
      DESIGN.primary +
      ';"></td></tr></table>',
    "              <!-- Content -->",
    '              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">',
    "                <tr>",
    '                  <td style="padding:32px 32px 28px 32px;">',
    '                    <div style="margin-bottom:24px;">',
    '                      <span style="display:inline-block;font-size:13px;font-weight:600;color:' +
      DESIGN.primary +
      ';letter-spacing:0.5px;text-transform:uppercase;">Notification</span>',
    "                    </div>",
    '                    <div class="email-content" style="color:' +
      DESIGN.textPrimary +
      ';font-size:15px;line-height:1.65;">',
    htmlContent || "<p></p>",
    "                    </div>",
    "                  </td>",
    "                </tr>",
    "                <tr>",
    '                  <td style="padding:0 32px 32px 32px;">',
    '                    <div style="height:1px;background-color:' +
      DESIGN.border +
      ';margin-bottom:24px;"></div>',
    '                    <p style="margin:0;font-size:12px;color:' +
      DESIGN.textMuted +
      ';line-height:1.5;">',
    '                      Sent to <span style="color:' +
      DESIGN.textSecondary +
      ';font-weight:500;">' +
      recipientDisplay +
      "</span>",
    "                    </p>",
    '                    <p style="margin:6px 0 0 0;font-size:12px;color:' +
      DESIGN.textMuted +
      ';">Please do not reply directly to this email.</p>',
    "                  </td>",
    "                </tr>",
    "              </table>",
    "            </td>",
    "          </tr>",
    "        </table>",
    "      </td>",
    "    </tr>",
    "  </table>",
    "</body>",
    "</html>",
  ].join("\n");
}

module.exports = {
  escapeHtml,
  hasHtmlContent,
  isFullHtmlDocument,
  plainTextToHtml,
  buildStandardHtmlEmail,
};
