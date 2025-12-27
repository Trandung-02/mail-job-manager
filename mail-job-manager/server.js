/**
 * Mail Job Manager Server
 * Express server với Gmail API để gửi email
 */

const express = require("express");
const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const os = require("os");
const dns = require("dns").promises;
require("dotenv").config();
const { query, testConnection } = require("./database");

// Lazy load googleapis only when needed
let google = null;
function getGoogle() {
  if (!google) {
    try {
      google = require("googleapis").google;
    } catch (error) {
      throw new Error(
        "Gmail API không khả dụng. Vui lòng cài đặt: npm install googleapis"
      );
    }
  }
  return google;
}

// ============================================
// Configuration
// ============================================
const CONFIG = {
  PORT: process.env.PORT || 3000,
  // Gmail SMTP settings
  GMAIL_SMTP: {
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: "", // Will be set from job.emailFrom
      pass: "", // Will be set from job.appPassword
    },
  },
  // Delay between emails (ms)
  EMAIL_DELAY: 1000,
};

// ============================================
// Utilities
// ============================================
const Utils = {
  /**
   * Get Chrome profiles path based on OS
   * @returns {string} Path to Chrome User Data directory
   */
  getChromeProfilesPath() {
    const platform = os.platform();
    const homeDir = os.homedir();

    const paths = {
      win32: path.join(
        homeDir,
        "AppData",
        "Local",
        "Google",
        "Chrome",
        "User Data"
      ),
      darwin: path.join(
        homeDir,
        "Library",
        "Application Support",
        "Google",
        "Chrome"
      ),
      linux: path.join(homeDir, ".config", "google-chrome"),
    };

    return paths[platform] || paths.linux;
  },

  /**
   * Check if path exists
   * @param {string} filePath - Path to check
   * @returns {boolean} Path exists
   */
  pathExists(filePath) {
    try {
      return fsSync.existsSync(filePath);
    } catch {
      return false;
    }
  },

  /**
   * Read JSON file safely
   * @param {string} filePath - Path to JSON file
   * @returns {Promise<Object|null>} Parsed JSON or null
   */
  async readJsonFile(filePath) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Không thể đọc file ${filePath}:`, error.message);
      return null;
    }
  },

  /**
   * Validate email domain by checking MX records
   * @param {string} email - Email address to validate
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   */
  async validateEmailDomain(email) {
    try {
      const domain = email.split("@")[1];
      if (!domain) {
        return { valid: false, error: "Email không có domain" };
      }

      // Check MX records
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          error: `Domain ${domain} không có MX records (email có thể không tồn tại)`,
        };
      }

      return { valid: true };
    } catch (error) {
      // If DNS lookup fails, it might be invalid domain
      if (error.code === "ENOTFOUND" || error.code === "ENODATA") {
        return {
          valid: false,
          error: `Domain không tồn tại hoặc không có MX records: ${error.message}`,
        };
      }
      // Other DNS errors - log but don't fail
      console.warn(
        `Cảnh báo khi kiểm tra MX records cho ${email}:`,
        error.message
      );
      return { valid: true }; // Assume valid if DNS check fails (network issues, etc.)
    }
  },

  /**
   * Comprehensive email validation - checks if email exists and is valid
   * @param {string} email - Email address to validate
   * @returns {Promise<{valid: boolean, error?: string, warnings?: string[]}>} Validation result
   */
  async validateEmailExists(email) {
    const warnings = [];

    try {
      // 1. Basic format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
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

      // 3. Check for common invalid patterns
      const localPart = email.split("@")[0].toLowerCase();

      // Check for suspicious patterns that often indicate invalid emails
      const suspiciousPatterns = [
        /^test\d*$/i, // test, test1, test123
        /^noo\d*$/i, // noo, noo1, noo123
        /^user\d*$/i, // user, user1, user123
        /^email\d*$/i, // email, email1
        /^temp\d*$/i, // temp, temp1
        /^fake\d*$/i, // fake, fake1
        /^dummy\d*$/i, // dummy, dummy1
      ];

      const isSuspicious = suspiciousPatterns.some((pattern) =>
        pattern.test(localPart)
      );
      if (isSuspicious) {
        warnings.push(`Email có pattern đáng ngờ: ${localPart}@${domain}`);
      }

      // 4. Validate domain exists and has MX records
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
        // Other DNS errors - log warning but continue
        warnings.push(`Không thể kiểm tra MX records: ${dnsError.message}`);
      }

      // 5. Check for common disposable email domains (optional - can be expanded)
      const disposableDomains = [
        "tempmail.com",
        "10minutemail.com",
        "guerrillamail.com",
        "mailinator.com",
      ];
      if (disposableDomains.includes(domain)) {
        warnings.push(`Domain ${domain} là disposable email domain`);
      }

      // 6. Additional validation for common email providers
      const commonProviders = [
        "gmail.com",
        "yahoo.com",
        "outlook.com",
        "hotmail.com",
      ];
      if (commonProviders.includes(domain)) {
        // For common providers, check if local part looks valid
        if (localPart.length < 2) {
          return {
            valid: false,
            error: `Email không hợp lệ: local part quá ngắn cho ${domain}`,
          };
        }

        // Check for invalid characters in local part for Gmail
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
      console.warn(`Lỗi khi validate email ${email}:`, error.message);
      return {
        valid: false,
        error: `Lỗi khi kiểm tra email: ${error.message}`,
      };
    }
  },

  /**
   * Try to verify email by connecting to mail server (VRFY command)
   * Note: Most mail servers (including Gmail) disable VRFY for security
   * @param {string} email - Email address to verify
   * @returns {Promise<{valid: boolean, error?: string}>} Validation result
   */
  async verifyEmailWithSMTP(email) {
    try {
      const domain = email.split("@")[1];
      if (!domain) {
        return { valid: false, error: "Email không có domain" };
      }

      // Get MX records
      const mxRecords = await dns.resolveMx(domain);
      if (!mxRecords || mxRecords.length === 0) {
        return {
          valid: false,
          error: `Domain ${domain} không có MX records`,
        };
      }

      // Sort by priority
      mxRecords.sort((a, b) => a.priority - b.priority);
      const mailServer = mxRecords[0].exchange;

      // Try to connect and verify (most servers disable VRFY, so this will likely fail)
      // But we can at least check if the server is reachable
      return new Promise((resolve) => {
        const net = require("net");
        const socket = new net.Socket();
        let connected = false;

        socket.setTimeout(5000); // 5 second timeout

        socket.on("connect", () => {
          connected = true;
          socket.destroy();
          // Even if we can connect, we can't verify the email without VRFY
          // So we assume it's valid if server is reachable
          resolve({ valid: true });
        });

        socket.on("timeout", () => {
          socket.destroy();
          if (!connected) {
            resolve({
              valid: false,
              error: `Không thể kết nối đến mail server ${mailServer}`,
            });
          }
        });

        socket.on("error", () => {
          // If connection fails, assume valid (server might block connections)
          resolve({ valid: true, skipped: true });
        });

        // Try to connect to port 25 (SMTP)
        socket.connect(25, mailServer);
      });
    } catch (error) {
      // If verification fails, assume valid
      return { valid: true, skipped: true };
    }
  },
};

// ============================================
// Chrome Profile Service
// ============================================
const ProfileService = {
  /**
   * Get all Chrome profiles
   * @returns {Promise<Array>} Array of profile objects
   */
  async getProfiles() {
    const profilesPath = Utils.getChromeProfilesPath();
    const profiles = [];

    if (!Utils.pathExists(profilesPath)) {
      return profiles;
    }

    try {
      const files = await fs.readdir(profilesPath);

      const profileDirs = files.filter((file) => {
        const fullPath = path.join(profilesPath, file);
        const stats = fsSync.statSync(fullPath);
        return (
          stats.isDirectory() &&
          (file === "Default" || file.startsWith("Profile "))
        );
      });

      for (const profileDir of profileDirs) {
        const profile = await this.getProfileInfo(profilesPath, profileDir);
        if (profile) {
          profiles.push(profile);
        }
      }
    } catch (error) {
      console.error("Lỗi khi đọc thư mục profiles:", error);
    }

    return profiles;
  },

  /**
   * Get profile information
   * @param {string} profilesPath - Base profiles path
   * @param {string} profileDir - Profile directory name
   * @returns {Promise<Object|null>} Profile object or null
   */
  async getProfileInfo(profilesPath, profileDir) {
    const profilePath = path.join(profilesPath, profileDir);
    const preferencesPath = path.join(profilePath, "Preferences");

    let email = null;
    let name = profileDir; // Default fallback

    if (Utils.pathExists(preferencesPath)) {
      const prefs = await Utils.readJsonFile(preferencesPath);
      if (prefs) {
        // Lấy thông tin từ account_info (Gmail account)
        // Kiểm tra tất cả các account trong account_info để tìm account có email và tên hiển thị đầy đủ
        if (prefs.account_info && prefs.account_info.length > 0) {
          // Debug: Log toàn bộ account_info để xem cấu trúc (chỉ log một lần để tránh spam)
          if (process.env.DEBUG_PROFILES === "true") {
            console.log(
              `🔍 Debug account_info cho profile ${profileDir}:`,
              JSON.stringify(prefs.account_info, null, 2)
            );
          }

          // Hàm helper để lấy tên từ một account info
          const getNameFromAccount = (accountInfo) => {
            let accountName = null;

            // Bước 1: Ưu tiên các trường chứa tên đầy đủ (display name)
            // Đây là tên hiển thị đầy đủ trên Gmail, không bị cắt/ngắt
            const fullNameFields = [
              "display_name",
              "displayName",
              "full_name",
              "fullName",
              "name",
            ];

            for (const field of fullNameFields) {
              if (
                accountInfo[field] &&
                typeof accountInfo[field] === "string" &&
                accountInfo[field].trim() !== ""
              ) {
                // Lấy toàn bộ chuỗi, không truncate, không split, không giới hạn độ dài
                accountName = accountInfo[field].trim();
                console.log(
                  `✅ Lấy tên đầy đủ từ trường "${field}": "${accountName}"`
                );
                return accountName;
              }
            }

            // Bước 2: Nếu không tìm thấy tên đầy đủ, ghép given_name + family_name
            const givenName =
              accountInfo.given_name || accountInfo.givenName || "";
            const familyName =
              accountInfo.family_name || accountInfo.familyName || "";

            if (givenName || familyName) {
              // Ghép tên và họ với khoảng trắng, đảm bảo không mất ký tự, giữ nguyên khoảng trắng
              const parts = [givenName.trim(), familyName.trim()].filter(
                (part) => part !== ""
              );
              if (parts.length > 0) {
                accountName = parts.join(" "); // Không trim ở đây để giữ khoảng trắng giữa các phần
                console.log(
                  `✅ Ghép tên từ given_name + family_name: "${accountName}"`
                );
                return accountName;
              }
            }

            // Bước 3: Kiểm tra tất cả các keys còn lại trong accountInfo để tìm tên hiển thị
            for (const key in accountInfo) {
              if (
                accountInfo.hasOwnProperty(key) &&
                typeof accountInfo[key] === "string" &&
                accountInfo[key].trim() !== "" &&
                key.toLowerCase().includes("name")
              ) {
                accountName = accountInfo[key].trim();
                console.log(`✅ Lấy tên từ trường "${key}": "${accountName}"`);
                return accountName;
              }
            }

            return null;
          };

          // Duyệt qua tất cả các account trong account_info
          for (const accountInfo of prefs.account_info) {
            // Lấy email từ account đầu tiên nếu chưa có
            if (!email && accountInfo.email) {
              email = accountInfo.email;
            }

            // Lấy tên từ account này
            const accountName = getNameFromAccount(accountInfo);
            if (accountName && accountName.trim() !== "") {
              name = accountName;
              // Nếu đã tìm thấy tên đầy đủ từ display_name hoặc full_name, dừng lại
              // Nếu chỉ tìm thấy từ given_name + family_name, tiếp tục tìm account khác có display_name
              const hasFullName =
                accountInfo.display_name ||
                accountInfo.displayName ||
                accountInfo.full_name ||
                accountInfo.fullName ||
                accountInfo.name;

              if (hasFullName) {
                break; // Đã tìm thấy tên đầy đủ, không cần tìm thêm
              }
            }
          }
        }

        // Thử tìm trong các phần khác của Preferences nếu không tìm thấy
        if (name === profileDir) {
          // Kiểm tra account_manager với cùng logic ưu tiên
          if (prefs.account_manager && prefs.account_manager.accounts) {
            const accounts = Array.isArray(prefs.account_manager.accounts)
              ? prefs.account_manager.accounts
              : Object.values(prefs.account_manager.accounts || {});

            for (const account of accounts) {
              if (account.email === email) {
                // Ưu tiên tên đầy đủ trước
                const fullNameFields = [
                  "display_name",
                  "displayName",
                  "full_name",
                  "fullName",
                  "name",
                ];

                for (const field of fullNameFields) {
                  if (
                    account[field] &&
                    typeof account[field] === "string" &&
                    account[field].trim() !== ""
                  ) {
                    name = account[field].trim();
                    console.log(
                      `✅ Lấy tên đầy đủ từ account_manager.${field}: "${name}"`
                    );
                    break;
                  }
                }

                // Nếu không tìm thấy, ghép given_name + family_name
                if (name === profileDir) {
                  const givenName =
                    account.given_name || account.givenName || "";
                  const familyName =
                    account.family_name || account.familyName || "";

                  if (givenName || familyName) {
                    const parts = [givenName, familyName].filter(
                      (part) => part && part.trim() !== ""
                    );
                    if (parts.length > 0) {
                      name = parts.join(" ").trim();
                      console.log(
                        `✅ Ghép tên từ account_manager (given_name + family_name): "${name}"`
                      );
                    }
                  }
                }

                if (name !== profileDir) {
                  break;
                }
              }
            }
          }
        }

        // Nếu không tìm thấy tên từ account_info, thử lấy từ profile.name (fallback)
        if (name === profileDir && prefs.profile && prefs.profile.name) {
          name = prefs.profile.name;
        }
      }
    }

    // Nếu vẫn không tìm thấy name nhưng có email, dùng email (hoặc phần trước @) làm name
    // Thay vì dùng profileDir (tên thư mục) làm fallback
    if (name === profileDir && email) {
      // Lấy phần trước @ của email làm name
      const emailName = email.split("@")[0];
      name = emailName;
      console.log(
        `ℹ️ Không tìm thấy name từ profile, sử dụng email làm name: "${name}"`
      );
    }

    // Log kết quả
    console.log(`✅ Profile ${profileDir}: email=${email}, name="${name}"`);

    return {
      name,
      directory: profileDir,
      path: profilePath,
      email,
    };
  },

  /**
   * Find profile directory by name or directory
   * @param {string} profileName - Profile name or directory
   * @returns {Promise<{directory: string|null, availableProfiles: Array}>} Profile directory and available profiles
   */
  async findProfileDirectory(profileName) {
    const profilesPath = Utils.getChromeProfilesPath();

    if (!Utils.pathExists(profilesPath)) {
      console.warn(`Chrome profiles path không tồn tại: ${profilesPath}`);
      return { directory: null, availableProfiles: [] };
    }

    // Get all available profiles first
    const profiles = await this.getProfiles();
    console.log(`Đang tìm profile: "${profileName}"`);
    console.log(
      `Có ${profiles.length} profiles có sẵn:`,
      profiles.map((p) => `${p.name} (${p.directory})`)
    );

    // Check if it's a directory name (exact match)
    const profilePath = path.join(profilesPath, profileName);
    if (Utils.pathExists(profilePath)) {
      // Verify it's actually a profile directory
      const stats = fsSync.statSync(profilePath);
      if (
        stats.isDirectory() &&
        (profileName === "Default" || profileName.startsWith("Profile "))
      ) {
        console.log(`Tìm thấy profile directory: ${profileName}`);
        return { directory: profileName, availableProfiles: profiles };
      }
    }

    // Search in all profiles by directory (case-insensitive)
    let found = profiles.find(
      (p) => p.directory.toLowerCase() === profileName.toLowerCase()
    );

    // If not found by directory, search by name (case-insensitive)
    if (!found) {
      found = profiles.find(
        (p) => p.name.toLowerCase() === profileName.toLowerCase()
      );
    }

    // If still not found, try partial match
    if (!found) {
      found = profiles.find(
        (p) =>
          p.directory.toLowerCase().includes(profileName.toLowerCase()) ||
          p.name.toLowerCase().includes(profileName.toLowerCase())
      );
    }

    if (found) {
      console.log(`Tìm thấy profile: ${found.name} (${found.directory})`);
    } else {
      console.warn(`Không tìm thấy profile: "${profileName}"`);
    }

    return {
      directory: found ? found.directory : null,
      availableProfiles: profiles,
    };
  },
};

// ============================================
// Gmail API Service
// ============================================
const GmailAPIService = {
  /**
   * Create Gmail API client with OAuth2
   * @param {Object} credentials - OAuth2 credentials {clientId, clientSecret, refreshToken}
   * @returns {Object} Gmail API client
   */
  createGmailClient(credentials) {
    const { clientId, clientSecret, refreshToken } = credentials;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Thiếu OAuth2 credentials. Cần có: clientId, clientSecret, refreshToken"
      );
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
      const errorDetailsReason = (
        errorDetails.errors?.[0]?.reason || ""
      ).toLowerCase();
      const errorDetailsDomain = (
        errorDetails.errors?.[0]?.domain || ""
      ).toLowerCase();

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
        errorMessageLower.includes(
          "email account that you tried to reach does not exist"
        ) ||
        errorMessageLower.includes(
          "the email account that you tried to reach does not exist"
        ) ||
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
        errorDetailsMessage.includes(
          "email account that you tried to reach does not exist"
        ) ||
        errorDetailsMessage.includes(
          "the email account that you tried to reach does not exist"
        ) ||
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
          errorDetails.message ||
          errorDetails.errors?.[0]?.message ||
          errorMessage;
        throw new Error(`Không tìm thấy địa chỉ email: ${detailedError}`);
      }

      throw error;
    }
  },
};

// ============================================
// Database Helper Functions
// ============================================
const DatabaseHelper = {
  /**
   * Lấy hoặc tạo email trong bảng emails
   * @param {string} email - Email address
   * @returns {Promise<number>} Email ID
   */
  async getOrCreateEmail(email) {
    try {
      // Tìm email trong bảng emails
      let result = await query("SELECT id FROM emails WHERE email = $1", [
        email,
      ]);

      if (result.rows.length > 0) {
        return result.rows[0].id;
      }

      // Nếu chưa có, tạo mới
      result = await query(
        "INSERT INTO emails (email) VALUES ($1) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id",
        [email]
      );

      return result.rows[0].id;
    } catch (error) {
      console.error("❌ Lỗi khi lấy/tạo email:", error);
      throw error;
    }
  },

  /**
   * Lấy email từ email_id
   * @param {number} emailId - Email ID
   * @returns {Promise<string|null>} Email address
   */
  async getEmailById(emailId) {
    try {
      const result = await query("SELECT email FROM emails WHERE id = $1", [
        emailId,
      ]);
      return result.rows.length > 0 ? result.rows[0].email : null;
    } catch (error) {
      console.error("❌ Lỗi khi lấy email theo ID:", error);
      return null;
    }
  },

  /**
   * Lưu email failed vào database ngay lập tức
   * Đảm bảo mỗi email chỉ lưu một lần duy nhất, không ghi đè
   * @param {number} jobId - Job ID
   * @param {string} email - Email address
   * @param {string} error - Error message
   * @param {string} method - Method used (Gmail API or SMTP)
   */
  async saveFailedEmail(jobId, email, error, method = "SMTP") {
    try {
      // Debug: Log thông tin đầu vào
      console.log(
        `🔍 Debug saveFailedEmail: jobId=${jobId}, email=${email}, error=${error?.substring(
          0,
          50
        )}..., method=${method}`
      );

      if (!jobId || !email || !error) {
        console.warn(
          `⚠️ Không lưu email failed vào database vì thiếu thông tin: jobId=${jobId}, email=${email}, error=${error}`
        );
        return; // Không lưu nếu thiếu thông tin
      }

      // Lấy hoặc tạo email_id
      const emailId = await this.getOrCreateEmail(email);

      // Kiểm tra xem bảng failed_emails có tồn tại không, nếu không thì tạo
      await query(`
        CREATE TABLE IF NOT EXISTS failed_emails (
          id SERIAL PRIMARY KEY,
          job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
          email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE,
          error TEXT NOT NULL,
          method VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Kiểm tra xem email đã được lưu chưa để tránh ghi đè
      const existingCheck = await query(
        `SELECT id FROM failed_emails 
         WHERE job_id = $1 AND email_id = $2`,
        [jobId, emailId]
      );

      if (existingCheck.rows.length > 0) {
        console.log(
          `⚠️ Email failed đã tồn tại trong database, không ghi đè: ${email} - Job ID: ${jobId}`
        );
        return; // Không lưu lại nếu đã tồn tại
      }

      // Lưu email failed (chỉ lưu một lần duy nhất)
      await query(
        `INSERT INTO failed_emails (job_id, email_id, error, method)
         VALUES ($1, $2, $3, $4)`,
        [jobId, emailId, error, method]
      );

      console.log(
        `💾 Đã lưu email failed vào database (một lần duy nhất): ${email} - Job ID: ${jobId}`
      );
    } catch (dbError) {
      console.error("❌ Lỗi khi lưu email failed vào database:", dbError);
      console.error("   Chi tiết:", dbError.message);
      console.error("   Stack:", dbError.stack);
      // Không throw error, chỉ log để không ảnh hưởng đến quá trình gửi email
    }
  },

  /**
   * Lấy emails của một job theo type
   * @param {number} jobId - Job ID
   * @param {string} type - Email type ('from', 'to', 'cc', 'bcc')
   * @returns {Promise<string[]>} Array of email addresses
   */
  async getJobEmails(jobId, type = null) {
    try {
      let queryText = `
        SELECT e.email 
        FROM emails e
        INNER JOIN job_emails je ON e.id = je.email_id
        WHERE je.job_id = $1
      `;
      const params = [jobId];

      if (type) {
        queryText += ` AND je.type = $2`;
        params.push(type);
      }

      const result = await query(queryText, params);
      return result.rows.map((row) => row.email);
    } catch (error) {
      console.error("❌ Lỗi khi lấy emails của job:", error);
      return [];
    }
  },

  /**
   * Lưu emails cho một job
   * @param {number} jobId - Job ID
   * @param {string|string[]} emails - Email address(es)
   * @param {string} type - Email type ('from', 'to', 'cc', 'bcc')
   */
  async saveJobEmails(jobId, emails, type) {
    try {
      const emailArray = Array.isArray(emails) ? emails : [emails];

      for (const email of emailArray) {
        if (!email || email.trim() === "") continue;

        // Lấy hoặc tạo email_id
        const emailId = await this.getOrCreateEmail(email.trim());

        // Lưu vào job_emails
        await query(
          `INSERT INTO job_emails (job_id, email_id, type)
           VALUES ($1, $2, $3)
           ON CONFLICT (job_id, email_id, type) DO NOTHING`,
          [jobId, emailId, type]
        );
      }
    } catch (error) {
      console.error("❌ Lỗi khi lưu emails cho job:", error);
      throw error;
    }
  },

  /**
   * Xóa emails của một job theo type
   * @param {number} jobId - Job ID
   * @param {string} type - Email type ('from', 'to', 'cc', 'bcc'), null để xóa tất cả
   */
  async deleteJobEmails(jobId, type = null) {
    try {
      if (type) {
        await query("DELETE FROM job_emails WHERE job_id = $1 AND type = $2", [
          jobId,
          type,
        ]);
      } else {
        await query("DELETE FROM job_emails WHERE job_id = $1", [jobId]);
      }
    } catch (error) {
      console.error("❌ Lỗi khi xóa emails của job:", error);
      throw error;
    }
  },
};

// ============================================
// Email Service
// ============================================
const EmailService = {
  /**
   * Send email using Gmail API (preferred) or SMTP (fallback)
   * @param {Object} job - Job object
   * @returns {Promise<Object>} Result object
   */
  async sendEmail(job) {
    const {
      emailTo,
      emailSubject,
      emailBody,
      emailFrom,
      appPassword,
      // Gmail API OAuth2 credentials (optional, if not provided, will use SMTP)
      clientId,
      clientSecret,
      refreshToken,
      id: jobId, // Job ID từ database (nếu có)
    } = job;

    // Validate required fields
    if (!emailFrom) {
      throw new Error("Thiếu email gửi (emailFrom)");
    }

    // Check if Gmail API credentials are provided
    const useGmailAPI = clientId && clientSecret && refreshToken;

    if (!useGmailAPI && !appPassword) {
      throw new Error(
        "Thiếu thông tin xác thực. Cần có:\n" +
          "1. Gmail API OAuth2 (clientId, clientSecret, refreshToken) HOẶC\n" +
          "2. App Password (appPassword)\n\n" +
          "Để sử dụng Gmail API:\n" +
          "1. Vào https://console.cloud.google.com/\n" +
          "2. Tạo OAuth2 credentials\n" +
          "3. Nhập clientId, clientSecret, refreshToken vào form"
      );
    }

    // Initialize Gmail API client if credentials are provided
    let gmail = null;
    if (useGmailAPI) {
      try {
        console.log("🔐 Đang khởi tạo Gmail API client...");
        gmail = GmailAPIService.createGmailClient({
          clientId,
          clientSecret,
          refreshToken,
        });
        console.log("✅ Gmail API client đã được khởi tạo");
      } catch (error) {
        throw new Error(
          `Không thể khởi tạo Gmail API client. Lỗi: ${error.message}`
        );
      }
    }

    // Create SMTP transporter as fallback (only if not using Gmail API)
    let transporter = null;
    if (!useGmailAPI) {
      // Clean app password: loại bỏ khoảng trắng thừa (Gmail App Password thường có dạng "xxxx xxxx xxxx xxxx")
      const cleanAppPassword = appPassword
        ? appPassword.trim().replace(/\s+/g, "")
        : null;

      console.log(
        `🔐 SMTP Config: emailFrom=${emailFrom}, appPassword length=${
          cleanAppPassword ? cleanAppPassword.length : 0
        }`
      );

      // Validate app password format trước khi tạo transporter
      if (cleanAppPassword && cleanAppPassword.length !== 16) {
        throw new Error(
          `App Password không hợp lệ. Phải có đúng 16 ký tự (sau khi loại bỏ khoảng trắng). Hiện tại: ${cleanAppPassword.length} ký tự.`
        );
      }

      transporter = nodemailer.createTransport({
        host: CONFIG.GMAIL_SMTP.host,
        port: CONFIG.GMAIL_SMTP.port,
        secure: CONFIG.GMAIL_SMTP.secure,
        auth: {
          user: emailFrom,
          pass: cleanAppPassword,
        },
      });

      // Verify connection
      try {
        await transporter.verify();
        console.log("✅ Kết nối SMTP thành công");
      } catch (error) {
        throw new Error(
          `Không thể kết nối SMTP. Lỗi: ${error.message}\n\n` +
            `Vui lòng kiểm tra:\n` +
            `1. Email và App Password đúng\n` +
            `2. Đã bật 2-Step Verification trong Gmail\n` +
            `3. App Password được tạo đúng cách`
        );
      }
    }

    let sentCount = 0;
    const errors = [];
    const successfulEmails = []; // Theo dõi các email đã gửi thành công

    // Send emails
    // Lấy tên hiển thị từ job, nếu không có thì thử lấy từ profile, cuối cùng mới dùng email
    let displayName = job.displayName;

    console.log(`🔍 Debug: job.displayName = "${job.displayName}"`);
    console.log(`🔍 Debug: job.chromeProfile = "${job.chromeProfile}"`);

    // Nếu không có displayName hoặc displayName rỗng, thử lấy từ profile
    if (!displayName || displayName.trim() === "") {
      if (job.chromeProfile) {
        try {
          const profilesPath = Utils.getChromeProfilesPath();
          console.log(`🔍 Đang lấy thông tin từ profile: ${job.chromeProfile}`);
          const profileInfo = await ProfileService.getProfileInfo(
            profilesPath,
            job.chromeProfile
          );
          console.log(
            `🔍 Profile info nhận được:`,
            JSON.stringify(profileInfo, null, 2)
          );
          if (
            profileInfo &&
            profileInfo.name &&
            profileInfo.name.trim() !== "" &&
            profileInfo.name !== job.chromeProfile // Đảm bảo không phải tên mặc định
          ) {
            displayName = profileInfo.name.trim();
            console.log(
              `✅ Lấy tên hiển thị từ profile "${job.chromeProfile}": "${displayName}"`
            );
          } else {
            console.log(
              `⚠️ Profile "${
                job.chromeProfile
              }" không có tên hiển thị hợp lệ. Name: "${
                profileInfo?.name || "null"
              }"`
            );
          }
        } catch (error) {
          console.error("❌ Không thể lấy tên từ profile:", error.message);
          console.error(error.stack);
        }
      }
    } else {
      console.log(`✅ Sử dụng tên hiển thị từ job: "${displayName}"`);
    }

    // Nếu vẫn không có, dùng email
    if (
      !displayName ||
      displayName.trim() === "" ||
      displayName === emailFrom
    ) {
      displayName = emailFrom;
      console.log(`⚠️ Sử dụng email làm tên hiển thị: "${displayName}"`);
    }

    console.log(
      `📧 Gửi email với tên hiển thị: "${displayName}" <${emailFrom}>`
    );

    // First pass: Send all emails
    const failedEmails = [];
    const potentiallyFailedEmails = []; // Emails that might fail (accepted by SMTP but may bounce)

    for (const recipient of emailTo) {
      try {
        console.log(`🔍 Đang kiểm tra email: ${recipient}`);

        // Comprehensive email validation - check if email exists and is valid
        const emailValidation = await Utils.validateEmailExists(recipient);
        if (!emailValidation.valid) {
          console.error(`❌ ${emailValidation.error}: ${recipient}`);
          const errorInfo = {
            email: recipient,
            error: emailValidation.error,
          };
          failedEmails.push(errorInfo);

          // Lưu vào database ngay lập tức nếu có jobId
          console.log(
            `🔍 Debug: jobId=${jobId}, recipient=${recipient}, error=${emailValidation.error}`
          );
          if (jobId) {
            await DatabaseHelper.saveFailedEmail(
              jobId,
              recipient,
              emailValidation.error,
              useGmailAPI ? "Gmail API" : "SMTP"
            );
          } else {
            console.warn(
              `⚠️ Không có jobId, không thể lưu email failed vào database: ${recipient}`
            );
          }
          continue;
        }

        // Log warnings if any
        if (emailValidation.warnings && emailValidation.warnings.length > 0) {
          emailValidation.warnings.forEach((warning) => {
            console.warn(`⚠️ ${warning} - ${recipient}`);
          });
        }

        console.log(`✅ Email hợp lệ: ${recipient}`);

        // Optional: Validate email with API (if API key is set)
        // Uncomment if you want to use email validation API
        // const apiValidation = await Utils.validateEmailWithAPI(recipient);
        // if (!apiValidation.valid && !apiValidation.skipped) {
        //   console.error(`❌ ${apiValidation.error}: ${recipient}`);
        //   failedEmails.push({
        //     email: recipient,
        //     error: apiValidation.error,
        //   });
        //   continue;
        // }

        let info;
        try {
          if (useGmailAPI && gmail) {
            // Use Gmail API
            console.log(`📧 Gửi email qua Gmail API đến: ${recipient}`);
            const result = await GmailAPIService.sendEmail(gmail, {
              from: emailFrom,
              to: recipient,
              subject: emailSubject,
              text: emailBody,
              html: emailBody.replace(/\n/g, "<br>"),
              displayName: displayName,
            });

            info = {
              messageId: result.messageId,
              accepted: [recipient],
              rejected: [],
              response: "Gmail API: Email đã được gửi thành công",
            };
          } else if (transporter) {
            // Use SMTP as fallback
            const mailOptions = {
              from: `"${displayName}" <${emailFrom}>`,
              to: recipient,
              subject: emailSubject,
              text: emailBody,
              html: emailBody.replace(/\n/g, "<br>"),
              headers: {
                "X-Mailer": "Mail Job Manager",
                "Return-Path": emailFrom,
              },
              envelope: {
                from: emailFrom,
                to: [recipient],
              },
            };

            info = await transporter.sendMail(mailOptions);
          } else {
            throw new Error("Không có phương thức gửi email nào được cấu hình");
          }

          // Check response for any warnings or errors
          const response = info.response || "";
          const accepted = info.accepted || [];
          const rejected = info.rejected || [];

          // If email was rejected by SMTP server
          if (rejected.length > 0 && rejected.includes(recipient)) {
            const errorMsg = `Email bị từ chối bởi SMTP server: ${response}`;
            console.error(`❌ ${errorMsg} - ${recipient}`);
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId) {
              await DatabaseHelper.saveFailedEmail(
                jobId,
                recipient,
                errorMsg,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
            continue;
          }

          // Check if response contains error indicators
          const responseLower = response.toLowerCase();
          const hasErrorInResponse =
            responseLower.includes("550") ||
            responseLower.includes("551") ||
            responseLower.includes("553") ||
            responseLower.includes("550-5.1.1") ||
            responseLower.includes("550 5.1.1") ||
            responseLower.includes("550 5.7.1") ||
            responseLower.includes("not found") ||
            responseLower.includes("does not exist") ||
            responseLower.includes(
              "email account that you tried to reach does not exist"
            ) ||
            responseLower.includes(
              "the email account that you tried to reach does not exist"
            ) ||
            responseLower.includes("nosuchuser") ||
            responseLower.includes("no such user") ||
            responseLower.includes("invalid") ||
            responseLower.includes("rejected") ||
            responseLower.includes("user unknown") ||
            responseLower.includes("address rejected") ||
            responseLower.includes("mailbox unavailable") ||
            responseLower.includes("recipient address rejected") ||
            responseLower.includes("unable to deliver") ||
            responseLower.includes("delivery failed") ||
            responseLower.includes("không tìm thấy địa chỉ") ||
            responseLower.includes("không thể tìm thấy địa chỉ") ||
            responseLower.includes("thư của bạn không được gửi") ||
            responseLower.includes("địa chỉ email không tồn tại") ||
            responseLower.includes("địa chỉ không thể nhận thư");

          if (hasErrorInResponse) {
            const errorMsg = `Lỗi SMTP: ${response}`;
            console.error(
              `❌ Phát hiện lỗi trong response SMTP cho ${recipient}: ${response}`
            );
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId) {
              await DatabaseHelper.saveFailedEmail(
                jobId,
                recipient,
                errorMsg,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
            continue;
          }

          // If email was not in accepted list, it might fail
          if (accepted.length > 0 && !accepted.includes(recipient)) {
            const errorMsg = `Email không được chấp nhận bởi SMTP server`;
            console.warn(
              `⚠️ Email không có trong danh sách accepted: ${recipient}`
            );
            // Don't count as sent, add to failed
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId) {
              await DatabaseHelper.saveFailedEmail(
                jobId,
                recipient,
                errorMsg,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
            continue;
          }

          // Kiểm tra lại response một lần nữa trước khi đếm sentCount
          // Đảm bảo không đếm email lỗi là thành công
          const responseCheck = (info.response || "").toLowerCase();
          const hasErrorInFinalCheck =
            responseCheck.includes("550") ||
            responseCheck.includes("551") ||
            responseCheck.includes("553") ||
            responseCheck.includes("550-5.1.1") ||
            responseCheck.includes("550 5.1.1") ||
            responseCheck.includes("550 5.7.1") ||
            responseCheck.includes("not found") ||
            responseCheck.includes("does not exist") ||
            responseCheck.includes(
              "email account that you tried to reach does not exist"
            ) ||
            responseCheck.includes(
              "the email account that you tried to reach does not exist"
            ) ||
            responseCheck.includes("nosuchuser") ||
            responseCheck.includes("no such user") ||
            responseCheck.includes("invalid") ||
            responseCheck.includes("rejected") ||
            responseCheck.includes("user unknown") ||
            responseCheck.includes("address rejected") ||
            responseCheck.includes("mailbox unavailable") ||
            responseCheck.includes("recipient address rejected") ||
            responseCheck.includes("unable to deliver") ||
            responseCheck.includes("delivery failed") ||
            responseCheck.includes("không tìm thấy địa chỉ") ||
            responseCheck.includes("không thể tìm thấy địa chỉ") ||
            responseCheck.includes("thư của bạn không được gửi") ||
            responseCheck.includes("địa chỉ email không tồn tại") ||
            responseCheck.includes("địa chỉ không thể nhận thư");

          if (hasErrorInFinalCheck) {
            const errorMsg = `Lỗi phát hiện trong response: ${response}`;
            console.error(
              `❌ Phát hiện lỗi trong response (final check) cho ${recipient}: ${response}`
            );
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId) {
              await DatabaseHelper.saveFailedEmail(
                jobId,
                recipient,
                errorMsg,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
            continue; // Bỏ qua, không đếm là đã gửi
          }

          // If email is in accepted list, log success
          if (accepted.length > 0 && accepted.includes(recipient)) {
            console.log(
              `✅ Đã gửi email đến ${recipient}. Message ID: ${info.messageId}`
            );
            sentCount++;
            successfulEmails.push(recipient);
          } else {
            // If no accepted/rejected info, check response status code
            // Chỉ đếm là thành công nếu response có status code thành công (250, 200, etc.)
            const responseStatus = response.match(/^(\d{3})/);
            const statusCode = responseStatus ? parseInt(responseStatus[1]) : 0;

            // Chỉ đếm là thành công nếu status code là 2xx (200-299)
            if (statusCode >= 200 && statusCode < 300) {
              console.log(
                `✅ Đã gửi email đến ${recipient} (status ${statusCode}). Message ID: ${info.messageId}`
              );
              sentCount++;
              successfulEmails.push(recipient);
            } else {
              // Nếu không có status code thành công, coi như lỗi
              const errorMsg = `Email không có thông tin accepted/rejected và không có status code thành công. Response: ${response}`;
              console.warn(
                `⚠️ Email có thể thất bại: ${recipient} - ${errorMsg}`
              );
              const errorInfo = {
                email: recipient,
                error: errorMsg,
              };
              failedEmails.push(errorInfo);
              potentiallyFailedEmails.push({
                email: recipient,
                messageId: info.messageId,
                response: response,
              });

              // Lưu vào database ngay lập tức nếu có jobId
              if (jobId) {
                await DatabaseHelper.saveFailedEmail(
                  jobId,
                  recipient,
                  errorMsg,
                  useGmailAPI ? "Gmail API" : "SMTP"
                );
              }
              // KHÔNG đếm sentCount++ - email này bị lỗi
            }
          }

          // Log response details for debugging
          if (response) {
            console.log(`   Response: ${response.substring(0, 200)}`);
          }
        } catch (sendError) {
          // Check if error contains information about invalid address
          const errorMessage = sendError.message || "";
          const errorCode = sendError.code || "";
          const errorMessageLower = errorMessage.toLowerCase();

          // Common error patterns for invalid addresses (including Vietnamese)
          const isInvalidEmailError =
            // SMTP error codes
            errorMessageLower.includes("550") ||
            errorMessageLower.includes("551") ||
            errorMessageLower.includes("553") ||
            errorMessageLower.includes("550-5.1.1") ||
            errorMessageLower.includes("550 5.1.1") ||
            errorMessageLower.includes("550 5.7.1") ||
            // English error messages
            errorMessageLower.includes("not found") ||
            errorMessageLower.includes("does not exist") ||
            errorMessageLower.includes(
              "email account that you tried to reach does not exist"
            ) ||
            errorMessageLower.includes(
              "the email account that you tried to reach does not exist"
            ) ||
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
            // Vietnamese error messages
            errorMessageLower.includes("không tìm thấy địa chỉ") ||
            errorMessageLower.includes("không thể tìm thấy địa chỉ") ||
            errorMessageLower.includes("thư của bạn không được gửi") ||
            errorMessageLower.includes("địa chỉ email không tồn tại") ||
            errorMessageLower.includes("địa chỉ không thể nhận thư") ||
            errorMessageLower.includes("email không hợp lệ") ||
            errorMessageLower.includes("không tồn tại") ||
            errorMessageLower.includes("không thể nhận thư") ||
            // Error codes
            errorCode === "EENVELOPE" ||
            errorCode === "EMESSAGE";

          if (isInvalidEmailError) {
            const finalErrorMessage = errorMessage.includes(
              "Không tìm thấy địa chỉ"
            )
              ? errorMessage
              : `Không tìm thấy địa chỉ: ${errorMessage}`;
            console.error(
              `❌ Không tìm thấy địa chỉ email: ${recipient} - ${finalErrorMessage}`
            );
            const errorInfo = {
              email: recipient,
              error: finalErrorMessage,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId) {
              await DatabaseHelper.saveFailedEmail(
                jobId,
                recipient,
                finalErrorMessage,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
          } else {
            // Other errors
            console.error(
              `❌ Lỗi khi gửi mail đến ${recipient}:`,
              errorMessage
            );
            const errorInfo = {
              email: recipient,
              error: errorMessage,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId) {
              await DatabaseHelper.saveFailedEmail(
                jobId,
                recipient,
                errorMessage,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
          }
          continue;
        }

        // Delay between emails to avoid rate limiting
        if (sentCount < emailTo.length) {
          await new Promise((resolve) =>
            setTimeout(resolve, CONFIG.EMAIL_DELAY)
          );
        }
      } catch (error) {
        console.error(`❌ Lỗi khi gửi mail đến ${recipient}:`, error.message);
        const errorInfo = {
          email: recipient,
          error: error.message,
        };
        failedEmails.push(errorInfo);

        // Lưu vào database ngay lập tức nếu có jobId
        if (jobId) {
          await DatabaseHelper.saveFailedEmail(
            jobId,
            recipient,
            error.message,
            useGmailAPI ? "Gmail API" : "SMTP"
          );
        }
      }
    }

    // Log summary của các email thất bại
    if (failedEmails.length > 0) {
      console.log(`\n⚠️ LOG CÁC EMAIL KHÔNG THỂ GỬI:`);
      console.log(`==========================================`);
      failedEmails.forEach((failed, index) => {
        console.log(`${index + 1}. Email: ${failed.email}`);
        console.log(`   Lỗi: ${failed.error}`);
        console.log(`   ---`);
      });
      console.log(`==========================================`);
      console.log(`Tổng cộng: ${failedEmails.length} email không thể gửi\n`);
    }

    // Update errors array với tất cả failed emails
    errors.push(...failedEmails);

    // Log warning about potentially failed emails (accepted by SMTP but may bounce)
    if (potentiallyFailedEmails.length > 0) {
      console.log(
        `\n⚠️ CẢNH BÁO: Các email sau đã được SMTP chấp nhận nhưng có thể bị bounce:`
      );
      console.log(`==========================================`);
      potentiallyFailedEmails.forEach((email, index) => {
        console.log(`${index + 1}. Email: ${email.email}`);
        console.log(`   Message ID: ${email.messageId}`);
        console.log(
          `   Lưu ý: Vui lòng kiểm tra hộp thư đến của ${emailFrom} để xem bounce messages`
        );
        console.log(`   ---`);
      });
      console.log(`==========================================`);
      console.log(
        `Tổng cộng: ${potentiallyFailedEmails.length} email cần theo dõi\n`
      );
    }

    // Log summary để đảm bảo tính toán đúng
    console.log(`\n📊 TỔNG KẾT GỬI EMAIL:`);
    console.log(`==========================================`);
    console.log(`   Tổng số email: ${emailTo.length}`);
    console.log(`   Đã gửi thành công: ${sentCount}`);
    console.log(`   Thất bại: ${errors.length}`);
    console.log(
      `   Có thể thất bại (cần theo dõi): ${potentiallyFailedEmails.length}`
    );
    console.log(`==========================================`);
    console.log(
      `   ✅ Đảm bảo: Email lỗi KHÔNG được đếm vào sentCount (sentCount chỉ bao gồm email thành công)`
    );
    console.log(`==========================================\n`);

    return {
      success: true,
      sent: sentCount, // Chỉ bao gồm email thành công
      total: emailTo.length,
      errors: errors.length > 0 ? errors : undefined,
      failedCount: errors.length,
      successfulEmails: successfulEmails, // Danh sách email đã gửi thành công
      potentiallyFailed:
        potentiallyFailedEmails.length > 0
          ? potentiallyFailedEmails.map((e) => e.email)
          : undefined,
      warning:
        potentiallyFailedEmails.length > 0
          ? useGmailAPI
            ? undefined // Gmail API trả về lỗi ngay lập tức, không cần cảnh báo
            : `Có ${potentiallyFailedEmails.length} email đã được SMTP chấp nhận nhưng có thể bị bounce. Vui lòng kiểm tra hộp thư đến của ${emailFrom} để xem bounce messages.`
          : undefined,
      method: useGmailAPI ? "Gmail API" : "SMTP",
    };
  },
};

// ============================================
// Express App Setup
// ============================================
const app = express();

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// CORS middleware
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

// ============================================
// API Routes
// ============================================

/**
 * GET /api/profiles
 * Get list of Chrome profiles
 */
app.get("/api/profiles", async (req, res, next) => {
  try {
    const profiles = await ProfileService.getProfiles();
    res.json(profiles);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/run-job
 * Run email job
 */
app.post("/api/run-job", async (req, res, next) => {
  try {
    const job = req.body;

    // Validate job data
    if (
      !job ||
      !job.emailFrom ||
      !job.emailTo ||
      !job.emailSubject ||
      !job.emailBody
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Thiếu thông tin job. Cần có: emailFrom, emailTo, emailSubject, emailBody",
      });
    }

    // Validate authentication credentials
    // Need either Gmail API OAuth2 credentials OR App Password
    const hasGmailAPI = job.clientId && job.clientSecret && job.refreshToken;
    const hasAppPassword = job.appPassword;

    if (!hasGmailAPI && !hasAppPassword) {
      return res.status(400).json({
        success: false,
        error:
          "Thiếu thông tin xác thực. Cần có:\n" +
          "1. Gmail API OAuth2 (clientId, clientSecret, refreshToken) HOẶC\n" +
          "2. App Password (appPassword)\n\n" +
          "Để sử dụng Gmail API:\n" +
          "1. Vào https://console.cloud.google.com/\n" +
          "2. Tạo OAuth2 credentials\n" +
          "3. Nhập clientId, clientSecret, refreshToken vào form\n\n" +
          "Để sử dụng SMTP:\n" +
          "1. Vào https://myaccount.google.com/apppasswords\n" +
          "2. Tạo App Password mới\n" +
          "3. Nhập App Password vào form",
      });
    }

    // Validate emailTo is array
    if (!Array.isArray(job.emailTo) || job.emailTo.length === 0) {
      return res.status(400).json({
        success: false,
        error: "emailTo phải là mảng và có ít nhất một email",
      });
    }

    // Validate emailFrom format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(job.emailFrom)) {
      return res.status(400).json({
        success: false,
        error: "Email gửi không hợp lệ",
      });
    }

    // Đảm bảo job.id được set trước khi gọi sendEmail (để lưu failed emails vào database)
    // Hỗ trợ cả job.id (từ body) và job_id (từ query parameter)
    const jobId = job.id || job.job_id || req.query.job_id;
    if (jobId) {
      const jobIdNum = typeof jobId === "string" ? parseInt(jobId) : jobId;
      if (!isNaN(jobIdNum) && jobIdNum > 0) {
        job.id = jobIdNum; // Set job.id để hàm sendEmail có thể sử dụng
      }
    }

    // Send emails
    const result = await EmailService.sendEmail(job);

    // Lưu kết quả vào database nếu có job_id
    if (jobId) {
      const jobIdNum = typeof jobId === "string" ? parseInt(jobId) : jobId;
      if (!isNaN(jobIdNum) && jobIdNum > 0) {
        try {
          // Kiểm tra job có tồn tại trong database không
          const jobCheck = await query("SELECT id FROM jobs WHERE id = $1", [
            jobIdNum,
          ]);
          if (jobCheck.rows.length > 0) {
            await query(
              `INSERT INTO email_results (job_id, sent_count, total_count, failed_count, method, errors)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                jobIdNum,
                result.sent || 0,
                result.total || 0,
                result.failedCount || 0,
                result.method || "SMTP",
                result.errors ? JSON.stringify(result.errors) : null,
              ]
            );

            // Cập nhật last_sent cho job
            await query(
              `UPDATE jobs SET last_sent = CURRENT_TIMESTAMP WHERE id = $1`,
              [jobIdNum]
            );

            console.log(
              `✅ Đã lưu kết quả gửi email vào database cho job_id: ${jobIdNum}`
            );
          }
        } catch (dbError) {
          console.error("Lỗi khi lưu kết quả vào database:", dbError);
          // Không throw error, chỉ log để không ảnh hưởng đến response
        }
      }
    }

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * Health check endpoint
 */
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ============================================
// PostgreSQL CRUD API Routes
// ============================================

/**
 * GET /api/jobs
 * Lấy danh sách tất cả jobs
 */
app.get("/api/jobs", async (req, res, next) => {
  try {
    const result = await query("SELECT * FROM jobs ORDER BY created_at DESC");

    // Lấy emails cho từng job
    const jobs = await Promise.all(
      result.rows.map(async (job) => {
        const emailFrom = await DatabaseHelper.getJobEmails(job.id, "from");
        const emailTo = await DatabaseHelper.getJobEmails(job.id, "to");
        const emailCc = await DatabaseHelper.getJobEmails(job.id, "cc");
        const emailBcc = await DatabaseHelper.getJobEmails(job.id, "bcc");

        return {
          ...job,
          email_from: emailFrom.length > 0 ? emailFrom[0] : null,
          email_to: emailTo,
          email_cc: emailCc,
          email_bcc: emailBcc,
        };
      })
    );

    res.json({
      success: true,
      data: jobs,
      count: jobs.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:id
 * Lấy thông tin một job theo ID
 */
app.get("/api/jobs/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query("SELECT * FROM jobs WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    const job = result.rows[0];

    // Lấy emails từ bảng job_emails
    const emailFrom = await DatabaseHelper.getJobEmails(job.id, "from");
    const emailTo = await DatabaseHelper.getJobEmails(job.id, "to");
    const emailCc = await DatabaseHelper.getJobEmails(job.id, "cc");
    const emailBcc = await DatabaseHelper.getJobEmails(job.id, "bcc");

    job.email_from = emailFrom.length > 0 ? emailFrom[0] : null;
    job.email_to = emailTo;
    job.email_cc = emailCc;
    job.email_bcc = emailBcc;

    res.json({
      success: true,
      data: job,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/jobs
 * Tạo job mới
 */
app.post("/api/jobs", async (req, res, next) => {
  try {
    const {
      name,
      chrome_profile,
      email_from,
      email_to,
      email_subject,
      email_body,
      schedule = "manual",
      schedule_time = "09:00:00",
      notes,
      status = "active",
      app_password,
    } = req.body;

    // Validation
    if (!name || !email_from || !email_to || !email_subject || !email_body) {
      return res.status(400).json({
        success: false,
        error:
          "Thiếu thông tin bắt buộc: name, email_from, email_to, email_subject, email_body",
      });
    }

    // Validate email_to là array
    const emailToArray = Array.isArray(email_to) ? email_to : [email_to];
    if (emailToArray.length === 0) {
      return res.status(400).json({
        success: false,
        error: "email_to phải có ít nhất một email",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email_from)) {
      return res.status(400).json({
        success: false,
        error: "Email gửi không hợp lệ",
      });
    }

    // Clean app_password: loại bỏ khoảng trắng (Gmail App Password thường có dạng "xxxx xxxx xxxx xxxx")
    const cleanAppPassword = app_password
      ? app_password.trim().replace(/\s+/g, "")
      : null;

    // Validate app_password format nếu có (phải có 16 ký tự sau khi clean)
    if (cleanAppPassword && cleanAppPassword.length !== 16) {
      return res.status(400).json({
        success: false,
        error: `App Password không hợp lệ. Phải có đúng 16 ký tự (sau khi loại bỏ khoảng trắng). Hiện tại: ${cleanAppPassword.length} ký tự.`,
      });
    }

    console.log(
      `💾 Lưu job mới: emailFrom=${email_from}, app_password length=${
        cleanAppPassword ? cleanAppPassword.length : 0
      }`
    );

    // Insert job (không có email_from và email_to nữa)
    const result = await query(
      `INSERT INTO jobs (name, chrome_profile, email_subject, email_body, schedule, schedule_time, notes, status, app_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        name,
        chrome_profile || null,
        email_subject,
        email_body,
        schedule,
        schedule_time,
        notes || null,
        status,
        cleanAppPassword,
      ]
    );

    const job = result.rows[0];

    // Lưu emails vào bảng emails và job_emails
    await DatabaseHelper.saveJobEmails(job.id, email_from, "from");
    await DatabaseHelper.saveJobEmails(job.id, emailToArray, "to");

    // Lấy lại emails để trả về
    const emailFrom = await DatabaseHelper.getJobEmails(job.id, "from");
    const emailTo = await DatabaseHelper.getJobEmails(job.id, "to");
    job.email_from = emailFrom.length > 0 ? emailFrom[0] : null;
    job.email_to = emailTo;

    res.status(201).json({
      success: true,
      message: "Đã tạo job thành công",
      data: job,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/jobs/:id
 * Cập nhật job
 */
app.put("/api/jobs/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      chrome_profile,
      email_from,
      email_to,
      email_subject,
      email_body,
      schedule,
      schedule_time,
      notes,
      status,
      app_password,
    } = req.body;

    // Kiểm tra job có tồn tại không
    const checkResult = await query("SELECT id FROM jobs WHERE id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (chrome_profile !== undefined) {
      updates.push(`chrome_profile = $${paramCount++}`);
      values.push(chrome_profile);
    }
    // email_from và email_to được xử lý riêng trong job_emails
    if (email_subject !== undefined) {
      updates.push(`email_subject = $${paramCount++}`);
      values.push(email_subject);
    }
    if (email_body !== undefined) {
      updates.push(`email_body = $${paramCount++}`);
      values.push(email_body);
    }
    if (schedule !== undefined) {
      updates.push(`schedule = $${paramCount++}`);
      values.push(schedule);
    }
    if (schedule_time !== undefined) {
      updates.push(`schedule_time = $${paramCount++}`);
      values.push(schedule_time);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(notes);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }
    if (app_password !== undefined) {
      // Clean app_password: loại bỏ khoảng trắng
      const cleanAppPassword = app_password
        ? app_password.trim().replace(/\s+/g, "")
        : null;

      // Validate app_password format nếu có
      if (cleanAppPassword && cleanAppPassword.length !== 16) {
        return res.status(400).json({
          success: false,
          error: `App Password không hợp lệ. Phải có đúng 16 ký tự (sau khi loại bỏ khoảng trắng). Hiện tại: ${cleanAppPassword.length} ký tự.`,
        });
      }

      updates.push(`app_password = $${paramCount++}`);
      values.push(cleanAppPassword);

      console.log(
        `💾 Cập nhật job ${id}: app_password length=${
          cleanAppPassword ? cleanAppPassword.length : 0
        }`
      );
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Không có trường nào để cập nhật",
      });
    }

    values.push(id);
    const result = await query(
      `UPDATE jobs SET ${updates.join(
        ", "
      )} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    const job = result.rows[0];

    // Cập nhật emails nếu có
    if (email_from !== undefined) {
      await DatabaseHelper.deleteJobEmails(id, "from");
      await DatabaseHelper.saveJobEmails(id, email_from, "from");
    }
    if (email_to !== undefined) {
      const emailToArray = Array.isArray(email_to) ? email_to : [email_to];
      await DatabaseHelper.deleteJobEmails(id, "to");
      await DatabaseHelper.saveJobEmails(id, emailToArray, "to");
    }

    // Lấy lại emails để trả về
    const emailFrom = await DatabaseHelper.getJobEmails(job.id, "from");
    const emailTo = await DatabaseHelper.getJobEmails(job.id, "to");
    const emailCc = await DatabaseHelper.getJobEmails(job.id, "cc");
    const emailBcc = await DatabaseHelper.getJobEmails(job.id, "bcc");
    job.email_from = emailFrom.length > 0 ? emailFrom[0] : null;
    job.email_to = emailTo;
    job.email_cc = emailCc;
    job.email_bcc = emailBcc;

    res.json({
      success: true,
      message: "Đã cập nhật job thành công",
      data: job,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/jobs/:id
 * Xóa job
 */
app.delete("/api/jobs/:id", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const checkResult = await query("SELECT id FROM jobs WHERE id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    await query("DELETE FROM jobs WHERE id = $1", [id]);

    res.json({
      success: true,
      message: "Đã xóa job thành công",
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/jobs/:id/run
 * Chạy job từ database (lấy job từ database và gửi email)
 * Body: { appPassword?, clientId?, clientSecret?, refreshToken? } - Thông tin xác thực
 */
app.post("/api/jobs/:id/run", async (req, res, next) => {
  try {
    const { id } = req.params;
    const { appPassword, clientId, clientSecret, refreshToken } = req.body;

    // Lấy job từ database
    const jobResult = await query("SELECT * FROM jobs WHERE id = $1", [id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    const dbJob = jobResult.rows[0];

    // Lấy emails từ bảng job_emails
    const emailFrom = await DatabaseHelper.getJobEmails(dbJob.id, "from");
    const emailTo = await DatabaseHelper.getJobEmails(dbJob.id, "to");

    if (emailFrom.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Job không có email gửi hợp lệ",
      });
    }

    if (emailTo.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Job không có email nhận hợp lệ",
      });
    }

    // Lấy app_password từ database nếu không có trong body
    const finalAppPassword = appPassword || dbJob.app_password || null;

    // Debug: Log thông tin xác thực (ẩn password)
    console.log(`🔍 Debug job ${id} authentication:`);
    console.log(
      `   - appPassword từ body: ${
        appPassword
          ? "*** (có, length: " + appPassword.length + ")"
          : "không có"
      }`
    );
    console.log(
      `   - app_password từ DB: ${
        dbJob.app_password
          ? "*** (có, length: " + dbJob.app_password.length + ")"
          : "không có"
      }`
    );
    console.log(`   - email_from: ${emailFrom[0]}`);
    console.log(
      `   - Gmail API credentials: ${
        clientId && clientSecret && refreshToken ? "có" : "không có"
      }`
    );

    // Kiểm tra thông tin xác thực
    const hasGmailAPI = clientId && clientSecret && refreshToken;
    const hasAppPassword =
      finalAppPassword && finalAppPassword.trim().length > 0;

    if (!hasGmailAPI && !hasAppPassword) {
      return res.status(400).json({
        success: false,
        error:
          "Thiếu thông tin xác thực. Cần có:\n" +
          "1. Gmail API OAuth2 (clientId, clientSecret, refreshToken) HOẶC\n" +
          "2. App Password (appPassword)\n\n" +
          "Vui lòng cập nhật job và nhập App Password, hoặc gửi trong body của request.",
      });
    }

    // Clean app password: loại bỏ khoảng trắng thừa (đảm bảo không có khoảng trắng)
    const cleanAppPassword = finalAppPassword
      ? finalAppPassword.trim().replace(/\s+/g, "")
      : null;

    // Validate app password format
    if (cleanAppPassword && cleanAppPassword.length !== 16) {
      console.error(
        `❌ App Password không hợp lệ: length=${cleanAppPassword.length}, expected=16`
      );
      return res.status(400).json({
        success: false,
        error: `App Password không hợp lệ. Phải có đúng 16 ký tự (sau khi loại bỏ khoảng trắng). Hiện tại: ${cleanAppPassword.length} ký tự.`,
      });
    }

    console.log(
      `   - cleanAppPassword: ${
        cleanAppPassword
          ? "*** (length: " + cleanAppPassword.length + ")"
          : "không có"
      }`
    );

    // Tạo job object để gửi email
    const job = {
      id: parseInt(id), // Thêm id để lưu kết quả
      emailFrom: emailFrom[0],
      emailTo: emailTo,
      emailSubject: dbJob.email_subject,
      emailBody: dbJob.email_body,
      chromeProfile: dbJob.chrome_profile,
      appPassword: cleanAppPassword,
      clientId: clientId,
      clientSecret: clientSecret,
      refreshToken: refreshToken,
    };

    console.log(`📧 Đang gửi email với job ${id}, emailFrom: ${job.emailFrom}`);

    // Gửi email
    const result = await EmailService.sendEmail(job);

    // Lưu kết quả vào database
    try {
      await query(
        `INSERT INTO email_results (job_id, sent_count, total_count, failed_count, method, errors)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          parseInt(id),
          result.sent || 0,
          result.total || 0,
          result.failedCount || 0,
          result.method || "SMTP",
          result.errors ? JSON.stringify(result.errors) : null,
        ]
      );

      // Cập nhật last_sent cho job
      await query(
        `UPDATE jobs SET last_sent = CURRENT_TIMESTAMP WHERE id = $1`,
        [parseInt(id)]
      );

      console.log(`✅ Đã lưu kết quả gửi email vào database cho job_id: ${id}`);
    } catch (dbError) {
      console.error("Lỗi khi lưu kết quả vào database:", dbError);
      // Không throw error, chỉ log để không ảnh hưởng đến response
    }

    res.json({
      success: true,
      message: "Đã chạy job thành công",
      job_id: parseInt(id),
      result: result,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Email Results API Routes
// ============================================

/**
 * GET /api/email-results
 * Lấy danh sách tất cả kết quả gửi email
 * Query params: ?job_id=123 (lọc theo job_id), ?limit=10 (giới hạn số lượng)
 */
app.get("/api/email-results", async (req, res, next) => {
  try {
    const { job_id, limit } = req.query;
    let queryText = `
      SELECT er.*, j.name as job_name, 
             (SELECT e.email FROM emails e 
              INNER JOIN job_emails je ON e.id = je.email_id 
              WHERE je.job_id = j.id AND je.type = 'from' LIMIT 1) as email_from
      FROM email_results er
      LEFT JOIN jobs j ON er.job_id = j.id
    `;
    const params = [];
    let paramCount = 1;

    if (job_id) {
      queryText += ` WHERE er.job_id = $${paramCount++}`;
      params.push(job_id);
    }

    queryText += ` ORDER BY er.created_at DESC`;

    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        queryText += ` LIMIT $${paramCount++}`;
        params.push(limitNum);
      }
    }

    const result = await query(queryText, params);

    // Parse errors từ JSON string
    const results = result.rows.map((row) => ({
      ...row,
      errors: row.errors ? JSON.parse(row.errors) : null,
    }));

    res.json({
      success: true,
      data: results,
      count: results.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/email-results/:id
 * Lấy thông tin một kết quả gửi email theo ID
 */
app.get("/api/email-results/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT er.*, j.name as job_name,
              (SELECT e.email FROM emails e 
               INNER JOIN job_emails je ON e.id = je.email_id 
               WHERE je.job_id = j.id AND je.type = 'from' LIMIT 1) as email_from
       FROM email_results er
       LEFT JOIN jobs j ON er.job_id = j.id
       WHERE er.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy kết quả với ID này",
      });
    }

    const emailResult = result.rows[0];
    emailResult.errors = emailResult.errors
      ? JSON.parse(emailResult.errors)
      : null;

    res.json({
      success: true,
      data: emailResult,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:id/results
 * Lấy tất cả kết quả gửi email của một job cụ thể
 */
app.get("/api/jobs/:id/results", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [
      id,
    ]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    const result = await query(
      `SELECT er.*
       FROM email_results er
       WHERE er.job_id = $1
       ORDER BY er.created_at DESC`,
      [id]
    );

    // Parse errors từ JSON string
    const results = result.rows.map((row) => ({
      ...row,
      errors: row.errors ? JSON.parse(row.errors) : null,
    }));

    res.json({
      success: true,
      job_id: parseInt(id),
      job_name: jobCheck.rows[0].name,
      data: results,
      count: results.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:id/stats
 * Lấy thống kê tổng hợp về kết quả gửi email của một job
 */
app.get("/api/jobs/:id/stats", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [
      id,
    ]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    // Lấy thống kê tổng hợp
    const statsResult = await query(
      `SELECT 
        COUNT(*) as total_runs,
        SUM(sent_count) as total_sent,
        SUM(total_count) as total_emails,
        SUM(failed_count) as total_failed,
        MAX(created_at) as last_run
       FROM email_results
       WHERE job_id = $1`,
      [id]
    );

    const stats = statsResult.rows[0];
    const successRate =
      stats.total_emails > 0
        ? ((stats.total_sent / stats.total_emails) * 100).toFixed(2)
        : 0;

    res.json({
      success: true,
      job_id: parseInt(id),
      job_name: jobCheck.rows[0].name,
      stats: {
        total_runs: parseInt(stats.total_runs) || 0,
        total_sent: parseInt(stats.total_sent) || 0,
        total_emails: parseInt(stats.total_emails) || 0,
        total_failed: parseInt(stats.total_failed) || 0,
        success_rate: parseFloat(successRate),
        last_run: stats.last_run,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/failed-emails
 * Lấy danh sách tất cả email failed
 * Query params: ?job_id=123 (lọc theo job_id), ?limit=10 (giới hạn số lượng)
 */
app.get("/api/failed-emails", async (req, res, next) => {
  try {
    const { job_id, limit } = req.query;
    let queryText = `
      SELECT fe.*, j.name as job_name, e.email,
             (SELECT e2.email FROM emails e2 
              INNER JOIN job_emails je ON e2.id = je.email_id 
              WHERE je.job_id = j.id AND je.type = 'from' LIMIT 1) as email_from
      FROM failed_emails fe
      LEFT JOIN jobs j ON fe.job_id = j.id
      LEFT JOIN emails e ON fe.email_id = e.id
    `;
    const params = [];
    let paramCount = 1;

    if (job_id) {
      queryText += ` WHERE fe.job_id = $${paramCount++}`;
      params.push(job_id);
    }

    queryText += ` ORDER BY fe.created_at DESC`;

    if (limit) {
      const limitNum = parseInt(limit);
      if (!isNaN(limitNum) && limitNum > 0) {
        queryText += ` LIMIT $${paramCount++}`;
        params.push(limitNum);
      }
    }

    const result = await query(queryText, params);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:id/failed-emails
 * Lấy danh sách email failed của một job cụ thể
 */
app.get("/api/jobs/:id/failed-emails", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [
      id,
    ]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    const result = await query(
      `SELECT fe.*, e.email
       FROM failed_emails fe
       LEFT JOIN emails e ON fe.email_id = e.id
       WHERE fe.job_id = $1
       ORDER BY fe.created_at DESC`,
      [id]
    );

    res.json({
      success: true,
      job_id: parseInt(id),
      job_name: jobCheck.rows[0].name,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/jobs/:id/last-run-log
 * Lấy log của lần chạy job gần nhất, bao gồm email_results và failed_emails
 */
app.get("/api/jobs/:id/last-run-log", async (req, res, next) => {
  try {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [
      id,
    ]);
    if (jobCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Không tìm thấy job với ID này",
      });
    }

    // Lấy email_result gần nhất
    const resultQuery = await query(
      `SELECT er.*
       FROM email_results er
       WHERE er.job_id = $1
       ORDER BY er.created_at DESC
       LIMIT 1`,
      [id]
    );

    if (resultQuery.rows.length === 0) {
      return res.json({
        success: true,
        job_id: parseInt(id),
        job_name: jobCheck.rows[0].name,
        has_run: false,
        message: "Job chưa được chạy lần nào",
      });
    }

    const emailResult = resultQuery.rows[0];
    const runTime = emailResult.created_at;

    // Parse errors từ JSON string
    let errors = null;
    try {
      errors = emailResult.errors ? JSON.parse(emailResult.errors) : null;
    } catch (e) {
      console.warn("Lỗi khi parse errors JSON:", e);
      errors = null;
    }

    // Lấy danh sách failed emails cho lần chạy này
    // Lấy các failed emails được tạo trong khoảng thời gian gần với runTime (trong vòng 5 phút)
    const failedEmailsQuery = await query(
      `SELECT fe.*, e.email
       FROM failed_emails fe
       LEFT JOIN emails e ON fe.email_id = e.id
       WHERE fe.job_id = $1
         AND fe.created_at >= ($2::timestamp - INTERVAL '5 minutes')
         AND fe.created_at <= ($2::timestamp + INTERVAL '5 minutes')
       ORDER BY fe.created_at DESC`,
      [id, runTime]
    );

    const failedEmails = failedEmailsQuery.rows.map((row) => ({
      email: row.email,
      error: row.error,
      method: row.method,
      created_at: row.created_at,
    }));

    res.json({
      success: true,
      job_id: parseInt(id),
      job_name: jobCheck.rows[0].name,
      has_run: true,
      run_time: runTime,
      total_count: emailResult.total_count || 0,
      sent_count: emailResult.sent_count || 0,
      failed_count: emailResult.failed_count || 0,
      method: emailResult.method || "SMTP",
      failed_emails: failedEmails,
      errors: errors, // Errors từ email_results (nếu có)
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// Server Startup
// ============================================
async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error("❌ Không thể kết nối database. Vui lòng kiểm tra cấu hình.");
    process.exit(1);
  }

  app.listen(CONFIG.PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${CONFIG.PORT}`);
    console.log(
      `📧 Mở trình duyệt và truy cập: http://localhost:${CONFIG.PORT}/index.html`
    );
    console.log(`📊 Frontend CRUD: http://localhost:${CONFIG.PORT}/crud.html`);
    console.log(`💚 Health check: http://localhost:${CONFIG.PORT}/api/health`);
  });
}

startServer();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  process.exit(0);
});
