/**
 * Validation Middleware
 * Input validation utilities
 */

const EmailValidator = require("../utils/emailValidator");

const validators = {
  /**
   * Validate job creation/update data
   */
  validateJob: (req, res, next) => {
    const { name, email_subject, email_body, email_from, email_to, email_recipients } = req.body;

    const errors = [];

    if (!name || name.trim() === "") {
      errors.push("Tên job không được để trống");
    }

    if (!email_subject || email_subject.trim() === "") {
      errors.push("Tiêu đề email không được để trống");
    }

    if (!email_body || email_body.trim() === "") {
      errors.push("Nội dung email không được để trống");
    }

    if (!email_from || email_from.trim() === "") {
      errors.push("Email gửi không được để trống");
    } else if (!EmailValidator.isValidFormat(email_from)) {
      errors.push("Email gửi không hợp lệ");
    }

    const rawList =
      email_recipients && Array.isArray(email_recipients) && email_recipients.length > 0
        ? email_recipients.map((r) => (r && typeof r === "object" && r.email != null ? r.email : r))
        : Array.isArray(email_to)
          ? email_to
          : [email_to];
    const emailToArray = rawList.filter((e) => e != null && String(e).trim() !== "");
    const hasValidRecipient = emailToArray.some((e) =>
      EmailValidator.isValidFormat(String(e).trim())
    );
    if (emailToArray.length === 0 || !hasValidRecipient) {
      errors.push("Phải có ít nhất một email nhận hợp lệ");
    } else {
      emailToArray.forEach((email, index) => {
        const str = String(email).trim();
        if (!EmailValidator.isValidFormat(str)) {
          errors.push(`Email nhận thứ ${index + 1} không hợp lệ: ${str}`);
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    next();
  },

  /**
   * Validate job ID parameter
   */
  validateJobId: (req, res, next) => {
    const { id } = req.params;

    if (!id || isNaN(parseInt(id, 10))) {
      return res.status(400).json({
        success: false,
        error: "Job ID không hợp lệ",
      });
    }

    req.params.id = parseInt(id, 10);
    next();
  },

  /**
   * Validate email format
   */
  validateEmail: (req, res, next) => {
    const { email } = req.body;

    if (!email || !EmailValidator.isValidFormat(email)) {
      return res.status(400).json({
        success: false,
        error: "Email không hợp lệ",
      });
    }

    next();
  },
};

module.exports = validators;
