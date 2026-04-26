/**
 * Email Validation Utility
 * Comprehensive email validation functions
 */

const dns = require("dns").promises;
const logger = require("./logger");

const EmailValidator = {
  /**
   * Basic email format validation
   * @param {string} email - Email address
   * @returns {boolean} Is valid email format
   */
  isValidFormat(email) {
    if (!email || typeof email !== "string") {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  },

  /**
   * Validate email domain by checking MX records
   * @param {string} email - Email address to validate
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   */
  async validateDomain(email) {
    try {
      const domain = email.split("@")[1];
      if (!domain) {
        return { valid: false, error: "Email không có domain" };
      }

      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          error: `Domain ${domain} không có MX records (email có thể không tồn tại)`,
        };
      }

      return { valid: true };
    } catch (error) {
      if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
        return {
          valid: false,
          error: `Domain không tồn tại hoặc không có MX records: ${error.message}`,
        };
      }
      logger.warn(`Cảnh báo khi kiểm tra MX records cho ${email}:`, error.message);
      return { valid: true }; // Assume valid if DNS check fails
    }
  },

  /**
   * Comprehensive email validation
   * @param {string} email - Email address to validate
   * @returns {Promise<{valid: boolean, error?: string, warnings?: string[]}>} Validation result
   */
  async validateEmail(email) {
    const warnings = [];

    try {
      // 1. Basic format validation
      if (!this.isValidFormat(email)) {
        return {
          valid: false,
          error: "Email không hợp lệ (format không đúng)",
        };
      }

      // 2. Extract domain
      const domain = email.split("@")[1].toLowerCase();
      if (!domain) {
        return { valid: false, error: "Email không có domain" };
      }

      const localPart = email.split("@")[0].toLowerCase();

      // 3. Check for suspicious patterns
      const suspiciousPatterns = [
        /^test\d*$/i,
        /^noo\d*$/i,
        /^user\d*$/i,
        /^email\d*$/i,
        /^temp\d*$/i,
        /^fake\d*$/i,
        /^dummy\d*$/i,
      ];

      const isSuspicious = suspiciousPatterns.some((pattern) => pattern.test(localPart));
      if (isSuspicious) {
        warnings.push(`Email có pattern đáng ngờ: ${localPart}@${domain}`);
      }

      // 4. Validate domain MX records
      try {
        const mxRecords = await dns.resolveMx(domain);
        if (!mxRecords || mxRecords.length === 0) {
          return {
            valid: false,
            error: `Domain ${domain} không có MX records (email không tồn tại)`,
          };
        }
      } catch (dnsError) {
        if (dnsError.code === "ENOTFOUND" || dnsError.code === "ENODATA") {
          return {
            valid: false,
            error: `Domain ${domain} không tồn tại hoặc không có MX records`,
          };
        }
        warnings.push(`Không thể kiểm tra MX records: ${dnsError.message}`);
      }

      // 5. Check for disposable email domains
      const disposableDomains = [
        "tempmail.com",
        "10minutemail.com",
        "guerrillamail.com",
        "mailinator.com",
      ];
      if (disposableDomains.includes(domain)) {
        warnings.push(`Domain ${domain} là disposable email domain`);
      }

      // 6. Additional validation for common providers
      const commonProviders = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com"];
      if (commonProviders.includes(domain)) {
        if (localPart.length < 2) {
          return {
            valid: false,
            error: `Email không hợp lệ: local part quá ngắn cho ${domain}`,
          };
        }

        if (domain === "gmail.com") {
          if (!/^[a-z0-9.]+$/.test(localPart.replace(/\+.*$/, ""))) {
            return {
              valid: false,
              error: "Email Gmail không hợp lệ (chứa ký tự không được phép)",
            };
          }
        }
      }

      return {
        valid: true,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      logger.warn(`Lỗi khi validate email ${email}:`, error.message);
      return {
        valid: false,
        error: `Lỗi khi kiểm tra email: ${error.message}`,
      };
    }
  },

  /**
   * Comprehensive email validation - checks if email exists and is valid
   * Alias for validateEmail for backward compatibility
   * @param {string} email - Email address to validate
   * @returns {Promise<{valid: boolean, error?: string, warnings?: string[]}>} Validation result
   */
  async validateEmailExists(email) {
    return this.validateEmail(email);
  },
};

module.exports = EmailValidator;
