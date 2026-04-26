/**
 * Email Service
 * Handles email sending using Gmail API or SMTP
 */

const nodemailer = require("nodemailer");
const GmailAPIService = require("./gmailAPIService");
const ProfileService = require("./profileService");
const DatabaseService = require("./databaseService");
const EmailValidator = require("../utils/emailValidator");
const { buildStandardHtmlEmail } = require("../utils/emailHtmlBuilder");
const logger = require("../utils/logger");
const config = require("../config");

const EMAIL_ERROR_PATTERNS = [
  "550",
  "551",
  "553",
  "550-5.1.1",
  "550 5.1.1",
  "550 5.7.1",
  "not found",
  "does not exist",
  "email account that you tried to reach does not exist",
  "the email account that you tried to reach does not exist",
  "nosuchuser",
  "no such user",
  "invalid",
  "rejected",
  "user unknown",
  "address rejected",
  "mailbox unavailable",
  "recipient address rejected",
  "unable to deliver",
  "delivery failed",
  "không tìm thấy địa chỉ",
  "không thể tìm thấy địa chỉ",
  "thư của bạn không được gửi",
  "địa chỉ email không tồn tại",
  "địa chỉ không thể nhận thư",
];

const EmailService = {
  /**
   * Send email using Gmail API (preferred) or SMTP (fallback)
   * @param {Object} job - Job object
   * @param {number} runId - Run ID (optional, để lưu sent_emails và failed_emails)
   * @returns {Promise<Object>} Result object
   */
  async sendEmail(job, runId = null) {
    const {
      emailTo,
      emailRecipients,
      emailSubject,
      emailBody,
      emailFrom,
      appPassword,
      clientId,
      clientSecret,
      refreshToken,
      id: jobId,
    } = job;

    // Chuẩn hóa danh sách nhận: [{ email, page_name }, ...] (page_name dùng thay [Name])
    const recipients =
      emailRecipients && Array.isArray(emailRecipients) && emailRecipients.length > 0
        ? emailRecipients.map((r) => ({
            email: typeof r.email === "string" ? r.email : String(r.email || ""),
            page_name: r.page_name != null ? String(r.page_name) : "",
          }))
        : (Array.isArray(emailTo) ? emailTo : [emailTo]).map((email) => ({
            email: typeof email === "string" ? email : String(email || ""),
            page_name: "",
          }));

    const emailToList = recipients.map((r) => r.email).filter((e) => e);

    if (emailToList.length === 0) {
      throw new Error("Không có email nhận hợp lệ");
    }

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
        logger.info("🔐 Đang khởi tạo Gmail API client...");
        gmail = GmailAPIService.createGmailClient({
          clientId,
          clientSecret,
          refreshToken,
        });
        logger.success("✅ Gmail API client đã được khởi tạo");
      } catch (error) {
        throw new Error(`Không thể khởi tạo Gmail API client. Lỗi: ${error.message}`);
      }
    }

    // Create SMTP transporter as fallback (only if not using Gmail API)
    let transporter = null;
    if (!useGmailAPI) {
      // Clean app password: loại bỏ khoảng trắng thừa (Gmail App Password thường có dạng "xxxx xxxx xxxx xxxx")
      const cleanAppPassword = appPassword ? appPassword.trim().replace(/\s+/g, "") : null;

      logger.debug(
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
        host: config.gmail.smtp.host,
        port: config.gmail.smtp.port,
        secure: config.gmail.smtp.secure,
        auth: {
          user: emailFrom,
          pass: cleanAppPassword,
        },
      });

      // Verify connection
      try {
        await transporter.verify();
        logger.success("✅ Kết nối SMTP thành công");
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
    const successfulEmails = [];

    // Helper: thay thế [Name] trong chuỗi bằng Tên Page (case-insensitive)
    const replaceNamePlaceholder = (text, pageName) => {
      if (text == null || typeof text !== "string") return text;
      const name = pageName != null && pageName !== "" ? String(pageName) : "";
      return text.replace(/\[Name\]/gi, name);
    };

    // Lấy tên hiển thị từ job (người gửi)
    let displayName = job.displayName;

    logger.debug(`🔍 Debug: job.displayName = "${job.displayName}"`);
    logger.debug(`🔍 Debug: job.chromeProfile = "${job.chromeProfile}"`);

    // Nếu không có displayName hoặc displayName rỗng, thử lấy từ profile
    if (!displayName || displayName.trim() === "") {
      if (job.chromeProfile) {
        try {
          const profileInfo = await ProfileService.getProfileInfo(job.chromeProfile);
          logger.debug(`🔍 Profile info nhận được:`, JSON.stringify(profileInfo, null, 2));
          if (
            profileInfo &&
            profileInfo.name &&
            profileInfo.name.trim() !== "" &&
            profileInfo.name !== job.chromeProfile // Đảm bảo không phải tên mặc định
          ) {
            displayName = profileInfo.name.trim();
            logger.success(
              `✅ Lấy tên hiển thị từ profile "${job.chromeProfile}": "${displayName}"`
            );
          } else {
            logger.warn(
              `⚠️ Profile "${job.chromeProfile}" không có tên hiển thị hợp lệ. Name: "${
                profileInfo?.name || "null"
              }"`
            );
          }
        } catch (error) {
          logger.error("❌ Không thể lấy tên từ profile:", error.message);
        }
      }
    } else {
      logger.info(`✅ Sử dụng tên hiển thị từ job: "${displayName}"`);
    }

    // Nếu vẫn không có, dùng email
    if (!displayName || displayName.trim() === "" || displayName === emailFrom) {
      displayName = emailFrom;
      logger.warn(`⚠️ Sử dụng email làm tên hiển thị: "${displayName}"`);
    }

    logger.info(`📧 Gửi email với tên hiển thị: "${displayName}" <${emailFrom}>`);

    const failedEmails = [];
    const potentiallyFailedEmails = [];

    for (const recipientObj of recipients) {
      const recipient = recipientObj.email;
      const pageName = recipientObj.page_name || "";
      if (!recipient) continue;

      try {
        logger.debug(`🔍 Đang kiểm tra email: ${recipient} (Tên Page: ${pageName || "(trống)"})`);

        // Comprehensive email validation - check if email exists and is valid
        const emailValidation = await EmailValidator.validateEmailExists(recipient);
        if (!emailValidation.valid) {
          logger.error(`❌ ${emailValidation.error}: ${recipient}`);
          const errorInfo = {
            email: recipient,
            error: emailValidation.error,
          };
          failedEmails.push(errorInfo);

          // Lưu vào database ngay lập tức nếu có jobId
          if (jobId && runId) {
            await DatabaseService.saveFailedEmail(
              runId,
              jobId,
              recipient,
              emailValidation.error,
              useGmailAPI ? "Gmail API" : "SMTP"
            );
          }
          continue;
        }

        // Log warnings if any
        if (emailValidation.warnings && emailValidation.warnings.length > 0) {
          emailValidation.warnings.forEach((warning) => {
            logger.warn(`⚠️ ${warning} - ${recipient}`);
          });
        }

        logger.debug(`✅ Email hợp lệ: ${recipient}`);

        let info;
        try {
          if (useGmailAPI && gmail) {
            const subjectPersonalized = replaceNamePlaceholder(emailSubject, pageName);
            const bodyPersonalized = replaceNamePlaceholder(emailBody, pageName);
            logger.info(
              `📧 Gửi email qua Gmail API đến: ${recipient} (Tên Page: ${pageName || "(trống)"})`
            );
            const result = await GmailAPIService.sendEmail(gmail, {
              from: emailFrom,
              to: recipient,
              subject: subjectPersonalized,
              text: bodyPersonalized,
              html: buildStandardHtmlEmail(bodyPersonalized, recipient),
              displayName: displayName,
            });

            info = {
              messageId: result.messageId,
              accepted: [recipient],
              rejected: [],
              response: "Gmail API: Email đã được gửi thành công",
            };
          } else if (transporter) {
            const subjectPersonalized = replaceNamePlaceholder(emailSubject, pageName);
            const bodyPersonalized = replaceNamePlaceholder(emailBody, pageName);
            const mailOptions = {
              from: `"${displayName}" <${emailFrom}>`,
              to: recipient,
              subject: subjectPersonalized,
              text: bodyPersonalized,
              html: buildStandardHtmlEmail(bodyPersonalized, recipient),
              headers: {
                "X-Mailer": "Mail Job Manager",
                "Return-Path": emailFrom,
                "MIME-Version": "1.0",
                "X-Priority": "3",
                "X-MS-Mail-Priority": "Normal",
                "Content-Language": "vi",
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
            logger.error(`❌ ${errorMsg} - ${recipient}`);
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId && runId) {
              await DatabaseService.saveFailedEmail(
                runId,
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
          const hasErrorInResponse = this._hasErrorInResponse(responseLower);

          if (hasErrorInResponse) {
            const errorMsg = `Lỗi SMTP: ${response}`;
            logger.error(`❌ Phát hiện lỗi trong response SMTP cho ${recipient}: ${response}`);
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId && runId) {
              await DatabaseService.saveFailedEmail(
                runId,
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
            logger.warn(`⚠️ Email không có trong danh sách accepted: ${recipient}`);
            // Don't count as sent, add to failed
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId && runId) {
              await DatabaseService.saveFailedEmail(
                runId,
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
          const hasErrorInFinalCheck = this._hasErrorInResponse(responseCheck);

          if (hasErrorInFinalCheck) {
            const errorMsg = `Lỗi phát hiện trong response: ${response}`;
            logger.error(
              `❌ Phát hiện lỗi trong response (final check) cho ${recipient}: ${response}`
            );
            const errorInfo = {
              email: recipient,
              error: errorMsg,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId && runId) {
              await DatabaseService.saveFailedEmail(
                runId,
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
            logger.success(`✅ Đã gửi email đến ${recipient}. Message ID: ${info.messageId}`);
            sentCount++;
            successfulEmails.push(recipient);

            // Lưu vào sent_emails nếu có runId và jobId
            if (runId && jobId) {
              await DatabaseService.saveSentEmail(runId, jobId, recipient);
            }
          } else {
            // If no accepted/rejected info, check response status code
            // Chỉ đếm là thành công nếu response có status code thành công (250, 200, etc.)
            const responseStatus = response.match(/^(\d{3})/);
            const statusCode = responseStatus ? parseInt(responseStatus[1]) : 0;

            // Chỉ đếm là thành công nếu status code là 2xx (200-299)
            if (statusCode >= 200 && statusCode < 300) {
              logger.success(
                `✅ Đã gửi email đến ${recipient} (status ${statusCode}). Message ID: ${info.messageId}`
              );
              sentCount++;
              successfulEmails.push(recipient);

              // Lưu vào sent_emails nếu có runId và jobId
              if (runId && jobId) {
                await DatabaseService.saveSentEmail(runId, jobId, recipient);
              }
            } else {
              // Nếu không có status code thành công, coi như lỗi
              const errorMsg = `Email không có thông tin accepted/rejected và không có status code thành công. Response: ${response}`;
              logger.warn(`⚠️ Email có thể thất bại: ${recipient} - ${errorMsg}`);
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
              if (jobId && runId) {
                await DatabaseService.saveFailedEmail(
                  runId,
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
            logger.debug(`   Response: ${response.substring(0, 200)}`);
          }
        } catch (sendError) {
          // Check if error contains information about invalid address
          const errorMessage = sendError.message || "";
          const errorCode = sendError.code || "";
          const errorMessageLower = errorMessage.toLowerCase();

          // Common error patterns for invalid addresses (including Vietnamese)
          const isInvalidEmailError = this._isInvalidEmailError(errorMessageLower, errorCode);

          if (isInvalidEmailError) {
            const finalErrorMessage = errorMessage.includes("Không tìm thấy địa chỉ")
              ? errorMessage
              : `Không tìm thấy địa chỉ: ${errorMessage}`;
            logger.error(`❌ Không tìm thấy địa chỉ email: ${recipient} - ${finalErrorMessage}`);
            const errorInfo = {
              email: recipient,
              error: finalErrorMessage,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId && runId) {
              await DatabaseService.saveFailedEmail(
                runId,
                jobId,
                recipient,
                finalErrorMessage,
                useGmailAPI ? "Gmail API" : "SMTP"
              );
            }
          } else {
            // Other errors
            logger.error(`❌ Lỗi khi gửi mail đến ${recipient}:`, errorMessage);
            const errorInfo = {
              email: recipient,
              error: errorMessage,
            };
            failedEmails.push(errorInfo);

            // Lưu vào database ngay lập tức nếu có jobId
            if (jobId && runId) {
              await DatabaseService.saveFailedEmail(
                runId,
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
        if (sentCount < emailToList.length) {
          await new Promise((resolve) => setTimeout(resolve, config.email.delay));
        }
      } catch (error) {
        logger.error(`❌ Lỗi khi gửi mail đến ${recipient}:`, error.message);
        const errorInfo = {
          email: recipient,
          error: error.message,
        };
        failedEmails.push(errorInfo);

        // Lưu vào database ngay lập tức nếu có jobId
        if (jobId && runId) {
          await DatabaseService.saveFailedEmail(
            runId,
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
      logger.warn(`\n⚠️ LOG CÁC EMAIL KHÔNG THỂ GỬI:`);
      logger.warn(`==========================================`);
      failedEmails.forEach((failed, index) => {
        logger.warn(`${index + 1}. Email: ${failed.email}`);
        logger.warn(`   Lỗi: ${failed.error}`);
        logger.warn(`   ---`);
      });
      logger.warn(`==========================================`);
      logger.warn(`Tổng cộng: ${failedEmails.length} email không thể gửi\n`);
    }

    // Update errors array với tất cả failed emails
    errors.push(...failedEmails);

    // Log warning about potentially failed emails (accepted by SMTP but may bounce)
    if (potentiallyFailedEmails.length > 0) {
      logger.warn(`\n⚠️ CẢNH BÁO: Các email sau đã được SMTP chấp nhận nhưng có thể bị bounce:`);
      logger.warn(`==========================================`);
      potentiallyFailedEmails.forEach((email, index) => {
        logger.warn(`${index + 1}. Email: ${email.email}`);
        logger.warn(`   Message ID: ${email.messageId}`);
        logger.warn(
          `   Lưu ý: Vui lòng kiểm tra hộp thư đến của ${emailFrom} để xem bounce messages`
        );
        logger.warn(`   ---`);
      });
      logger.warn(`==========================================`);
      logger.warn(`Tổng cộng: ${potentiallyFailedEmails.length} email cần theo dõi\n`);
    }

    // Log summary để đảm bảo tính toán đúng
    logger.info(`\n📊 TỔNG KẾT GỬI EMAIL:`);
    logger.info(`==========================================`);
    logger.info(`   Tổng số email: ${emailToList.length}`);
    logger.info(`   Đã gửi thành công: ${sentCount}`);
    logger.info(`   Thất bại: ${errors.length}`);
    logger.info(`   Có thể thất bại (cần theo dõi): ${potentiallyFailedEmails.length}`);
    logger.info(`==========================================`);
    logger.info(
      `   ✅ Đảm bảo: Email lỗi KHÔNG được đếm vào sentCount (sentCount chỉ bao gồm email thành công)`
    );
    logger.info(`==========================================\n`);

    return {
      success: true,
      sent: sentCount, // Chỉ bao gồm email thành công
      total: emailToList.length,
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

  /**
   * Check if response contains error indicators
   * @private
   */
  _hasErrorInResponse(responseLower) {
    return EMAIL_ERROR_PATTERNS.some((pattern) => responseLower.includes(pattern));
  },

  /**
   * Check if error message indicates invalid email
   * @private
   */
  _isInvalidEmailError(errorMessageLower, errorCode) {
    const invalidEmailSpecificPatterns = [
      "email không hợp lệ",
      "không tồn tại",
      "không thể nhận thư",
    ];

    return (
      EMAIL_ERROR_PATTERNS.some((pattern) => errorMessageLower.includes(pattern)) ||
      invalidEmailSpecificPatterns.some((pattern) => errorMessageLower.includes(pattern)) ||
      errorCode === "EENVELOPE" ||
      errorCode === "EMESSAGE"
    );
  },
};

module.exports = EmailService;
