/**
 * Run Controller
 * Handles running email jobs
 */

const { query } = require("../config/database");
const DatabaseService = require("../services/databaseService");
const EmailService = require("../services/emailService");
const logger = require("../utils/logger");

const RunController = {
  /**
   * Run a specific job by ID
   */
  async runJob(req, res, next) {
    try {
      const { id } = req.params;
      const jobId = parseInt(id, 10);

      // Get job from database
      const jobResult = await query("SELECT * FROM jobs WHERE id = $1", [jobId]);
      if (jobResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job không tồn tại",
        });
      }

      const job = jobResult.rows[0];

      // Get emails for this job (recipients kèm page_name để thay [Name])
      const emailFrom = await DatabaseService.getJobEmails(job.id, "from");
      const emailRecipients = await DatabaseService.getJobRecipients(job.id);
      const emailTo = emailRecipients.map((r) => r.email);
      const emailCc = await DatabaseService.getJobEmails(job.id, "cc");
      const emailBcc = await DatabaseService.getJobEmails(job.id, "bcc");

      if (emailFrom.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Job không có email gửi",
        });
      }

      if (emailTo.length === 0) {
        return res.status(400).json({
          success: false,
          error: "Job không có email nhận",
        });
      }

      // Prepare job object for EmailService (emailRecipients để thay [Name] khi gửi)
      const jobData = {
        id: job.id,
        emailFrom: emailFrom[0],
        emailTo,
        emailRecipients,
        emailCc,
        emailBcc,
        emailSubject: job.email_subject,
        emailBody: job.email_body,
        appPassword: job.app_password,
        displayName: job.display_name || job.chrome_profile,
        chromeProfile: job.chrome_profile,
      };

      // Check if Gmail API credentials are provided (from request body)
      const { clientId, clientSecret, refreshToken } = req.body;
      if (clientId && clientSecret && refreshToken) {
        jobData.clientId = clientId;
        jobData.clientSecret = clientSecret;
        jobData.refreshToken = refreshToken;
      }

      // Determine method
      const method = jobData.clientId ? "Gmail API" : "SMTP";

      // Create run
      let runId = null;
      try {
        runId = await DatabaseService.createRun(job.id, jobData.emailFrom, method);
        logger.success(`✅ Đã tạo run ${runId} cho job ${job.id}`);
      } catch (runError) {
        logger.error("❌ Lỗi khi tạo run:", runError);
      }

      // Send emails
      const result = await EmailService.sendEmail(jobData, runId);

      // Update run status
      if (runId) {
        try {
          await DatabaseService.updateRunStatus(
            runId,
            "completed",
            result.sent || 0,
            result.total || 0,
            result.failedCount || 0,
            result.errors || null
          );
        } catch (error) {
          logger.error("Lỗi khi cập nhật run status:", error);
        }
      }

      // Update last_sent
      try {
        await query(`UPDATE jobs SET last_sent = CURRENT_TIMESTAMP WHERE id = $1`, [job.id]);
      } catch (error) {
        logger.error("Lỗi khi cập nhật last_sent:", error);
      }

      // Add run_id to response
      const response = { ...result };
      if (runId) {
        response.run_id = runId;
      }
      response.job_id = job.id;

      res.json(response);
    } catch (error) {
      next(error);
    }
  },
};

module.exports = RunController;
