/**
 * Run Routes
 * API routes for running email jobs
 */

const express = require("express");
const router = express.Router();
const EmailService = require("../services/emailService");
const DatabaseService = require("../services/databaseService");
const { query } = require("../config/database");
const asyncHandler = require("../middlewares/asyncHandler");
const logger = require("../utils/logger");

/**
 * POST /api/run-job
 * Run email job (legacy endpoint)
 */
router.post(
  "/run-job",
  asyncHandler(async (req, res) => {
    const job = req.body;

    // Validate job data (chấp nhận emailTo hoặc emailRecipients)
    const hasEmailTo = job.emailTo && Array.isArray(job.emailTo) && job.emailTo.length > 0;
    const hasEmailRecipients =
      job.emailRecipients && Array.isArray(job.emailRecipients) && job.emailRecipients.length > 0;
    if (
      !job ||
      !job.emailFrom ||
      (!hasEmailTo && !hasEmailRecipients) ||
      !job.emailSubject ||
      !job.emailBody
    ) {
      return res.status(400).json({
        success: false,
        error:
          "Thiếu thông tin job. Cần có: emailFrom, emailTo hoặc emailRecipients, emailSubject, emailBody",
      });
    }
    if (!job.emailTo && job.emailRecipients) {
      job.emailTo = job.emailRecipients.map((r) => (r && r.email) || r);
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

    if (!Array.isArray(job.emailTo) || job.emailTo.length === 0) {
      return res.status(400).json({
        success: false,
        error: "emailTo / emailRecipients phải có ít nhất một email",
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
    let jobIdNum = null;
    if (jobId) {
      jobIdNum = typeof jobId === "string" ? parseInt(jobId) : jobId;
      if (!isNaN(jobIdNum) && jobIdNum > 0) {
        job.id = jobIdNum; // Set job.id để hàm sendEmail có thể sử dụng
      } else {
        jobIdNum = null;
      }
    }

    // Kiểm tra job có tồn tại trong database không
    let jobExists = false;
    let runId = null;
    if (jobIdNum) {
      try {
        const jobCheck = await query("SELECT id FROM jobs WHERE id = $1", [jobIdNum]);
        jobExists = jobCheck.rows.length > 0;

        if (jobExists) {
          const emailsToSend = await DatabaseService.getEmailsToSend(jobIdNum);
          if (emailsToSend.length === 0) {
            return res.status(400).json({
              success: false,
              error:
                "Không có email nào cần gửi. Tất cả email đã được gửi thành công trong các lần chạy trước.",
            });
          }
          const allRecipients = await DatabaseService.getJobRecipients(jobIdNum);
          const setToSend = new Set(emailsToSend.map((e) => e.toLowerCase()));
          job.emailRecipients = allRecipients.filter((r) => setToSend.has(r.email.toLowerCase()));
          job.emailTo = emailsToSend;
          logger.info(
            `📧 Đã lọc email: ${job.emailTo.length} email cần gửi (đã bỏ qua email đã gửi thành công)`
          );

          // Xác định phương thức gửi
          const method = hasGmailAPI ? "Gmail API" : "SMTP";

          // Tạo run mới
          try {
            runId = await DatabaseService.createRun(jobIdNum, job.emailFrom, method);
            logger.success(`✅ Đã tạo run ${runId} cho job ${jobIdNum}`);
          } catch (runError) {
            logger.error("❌ Lỗi khi tạo run:", runError);
            // Tiếp tục chạy nhưng không có run tracking
          }
        }
      } catch (dbError) {
        logger.error("Lỗi khi kiểm tra job:", dbError);
        // Tiếp tục chạy như bình thường
      }
    }

    // Send emails
    const result = await EmailService.sendEmail(job, runId);

    // Lưu kết quả vào database nếu có job_id và job tồn tại
    if (jobIdNum && jobExists) {
      try {
        if (runId) {
          // Cập nhật run status
          await DatabaseService.updateRunStatus(
            runId,
            "completed",
            result.sent || 0,
            result.total || 0,
            result.failedCount || 0,
            result.errors || null
          );
        }

        // Giữ lại email_results để tương thích ngược
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
        await query(`UPDATE jobs SET last_sent = CURRENT_TIMESTAMP WHERE id = $1`, [jobIdNum]);

        logger.success(
          `✅ Đã lưu kết quả gửi email vào database cho job_id: ${jobIdNum}${
            runId ? `, run_id: ${runId}` : ""
          }`
        );
      } catch (dbError) {
        logger.error("Lỗi khi lưu kết quả vào database:", dbError);
        // Không throw error, chỉ log để không ảnh hưởng đến response
      }
    }

    // Thêm run_id vào response nếu có
    const response = { ...result };
    if (runId) {
      response.run_id = runId;
    }
    if (jobIdNum) {
      response.job_id = jobIdNum;
    }

    res.json(response);
  })
);

module.exports = router;
