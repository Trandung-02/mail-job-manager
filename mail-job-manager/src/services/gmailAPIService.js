/**
 * Gmail API Service
 * Handles Gmail API operations
 */

// Lazy load googleapis only when needed
let google = null;
function getGoogle() {
  if (!google) {
    try {
      google = require("googleapis").google;
    } catch {
      throw new Error("Gmail API không khả dụng. Vui lòng cài đặt: npm install googleapis");
    }
  }
  return google;
}

const GmailAPIService = {
  /**
   * Create Gmail API client with OAuth2
   * @param {Object} credentials - OAuth2 credentials {clientId, clientSecret, refreshToken}
   * @returns {Object} Gmail API client
   */
  createGmailClient(credentials) {
    const { clientId, clientSecret, refreshToken } = credentials;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error("Thiếu OAuth2 credentials. Cần có: clientId, clientSecret, refreshToken");
    }

    const google = getGoogle();
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      "urn:ietf:wg:oauth:2.0:oob" // Redirect URI for installed apps
    );

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
    });

    return google.gmail({ version: "v1", auth: oauth2Client });
  },

  /**
   * Create email message in RFC 2822 format
   * @param {Object} options - Email options
   * @returns {string} Base64 encoded email message
   */
  createMessage(options) {
    const { from, to, subject, text, html, displayName } = options;

    const message = [
      `From: "${displayName || from}" <${from}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="boundary123"`,
      ``,
      `--boundary123`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      text || "",
      ``,
      `--boundary123`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      html || text.replace(/\n/g, "<br>"),
      ``,
      `--boundary123--`,
    ].join("\r\n");

    return Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  },

  /**
   * Send email using Gmail API
   * @param {Object} gmail - Gmail API client
   * @param {Object} options - Email options
   * @returns {Promise<Object>} Result object
   */
  async sendEmail(gmail, options) {
    const { to, subject, text, html, from, displayName } = options;

    const message = this.createMessage({
      from,
      to,
      subject,
      text,
      html,
      displayName,
    });

    try {
      const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw: message,
        },
      });

      return {
        success: true,
        messageId: response.data.id,
        threadId: response.data.threadId,
      };
    } catch (error) {
      // Gmail API trả về lỗi chi tiết nếu email không tồn tại
      const errorMessage = error.message || "";
      const errorDetails = error.response?.data?.error || {};
      const errorCode = error.code || "";
      const statusCode = error.response?.status || 0;

      // Log chi tiết để debug
      console.error("Gmail API Error Details:", {
        message: errorMessage,
        code: errorCode,
        statusCode: statusCode,
        errorDetails: errorDetails,
        fullError: JSON.stringify(error, Object.getOwnPropertyNames(error)),
      });

      // Kiểm tra error code và status code
      const errorMessageLower = errorMessage.toLowerCase();
      const errorDetailsMessage = (errorDetails.message || "").toLowerCase();
      const errorDetailsReason = (errorDetails.errors?.[0]?.reason || "").toLowerCase();

      // Kiểm tra các lỗi phổ biến về email không tồn tại
      const isInvalidEmailError =
        // SMTP error codes
        errorMessageLower.includes("550") ||
        errorMessageLower.includes("551") ||
        errorMessageLower.includes("553") ||
        errorMessageLower.includes("550-5.1.1") ||
        errorMessageLower.includes("550 5.1.1") ||
        errorMessageLower.includes("550 5.7.1") ||
        // Common error messages
        errorMessageLower.includes("not found") ||
        errorMessageLower.includes("does not exist") ||
        errorMessageLower.includes("email account that you tried to reach does not exist") ||
        errorMessageLower.includes("the email account that you tried to reach does not exist") ||
        errorMessageLower.includes("nosuchuser") ||
        errorMessageLower.includes("no such user") ||
        errorMessageLower.includes("invalid") ||
        errorMessageLower.includes("rejected") ||
        errorMessageLower.includes("user unknown") ||
        errorMessageLower.includes("address rejected") ||
        errorMessageLower.includes("mailbox unavailable") ||
        errorMessageLower.includes("recipient address rejected") ||
        errorMessageLower.includes("unable to deliver") ||
        errorMessageLower.includes("delivery failed") ||
        errorMessageLower.includes("thư của bạn không được gửi") ||
        errorMessageLower.includes("không tìm thấy địa chỉ") ||
        errorMessageLower.includes("không thể tìm thấy địa chỉ") ||
        errorMessageLower.includes("địa chỉ không thể nhận thư") ||
        errorMessageLower.includes("không thể nhận thư") ||
        // Error details
        errorDetailsMessage.includes("550") ||
        errorDetailsMessage.includes("not found") ||
        errorDetailsMessage.includes("does not exist") ||
        errorDetailsMessage.includes("email account that you tried to reach does not exist") ||
        errorDetailsMessage.includes("the email account that you tried to reach does not exist") ||
        errorDetailsMessage.includes("nosuchuser") ||
        errorDetailsMessage.includes("no such user") ||
        errorDetailsMessage.includes("invalid") ||
        errorDetailsMessage.includes("rejected") ||
        errorDetailsMessage.includes("user unknown") ||
        errorDetailsMessage.includes("address rejected") ||
        errorDetailsMessage.includes("mailbox unavailable") ||
        errorDetailsMessage.includes("recipient address rejected") ||
        errorDetailsMessage.includes("unable to deliver") ||
        errorDetailsMessage.includes("delivery failed") ||
        errorDetailsMessage.includes("thư của bạn không được gửi") ||
        errorDetailsMessage.includes("không tìm thấy địa chỉ") ||
        errorDetailsMessage.includes("không thể tìm thấy địa chỉ") ||
        errorDetailsMessage.includes("địa chỉ không thể nhận thư") ||
        errorDetailsMessage.includes("không thể nhận thư") ||
        // Gmail API specific error reasons
        errorDetailsReason.includes("invalid") ||
        errorDetailsReason.includes("rejected") ||
        errorDetailsReason.includes("nosuchuser") ||
        errorDetailsReason.includes("no such user") ||
        // Status codes that indicate invalid email
        statusCode === 400 || // Bad Request
        statusCode === 422; // Unprocessable Entity

      if (isInvalidEmailError) {
        const detailedError =
          errorDetails.message || errorDetails.errors?.[0]?.message || errorMessage;
        throw new Error(`Không tìm thấy địa chỉ email: ${detailedError}`);
      }

      throw error;
    }
  },
};

module.exports = GmailAPIService;
