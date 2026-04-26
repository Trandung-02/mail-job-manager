/**
 * Database Service
 * Optimized database operations with batch queries to avoid N+1 problems
 */

const { query } = require("../config/database");
const EmailValidator = require("../utils/emailValidator");
const logger = require("../utils/logger");

const DatabaseService = {
  /**
   * Get or create email in emails table
   * @param {string} email - Email address
   * @returns {Promise<number>} Email ID
   */
  async getOrCreateEmail(email) {
    if (!EmailValidator.isValidFormat(email)) {
      throw new Error(`Email không hợp lệ (format không đúng): ${email}`);
    }

    const trimmedEmail = email.trim().toLowerCase();

    try {
      // Single-query upsert avoids redundant SELECT and race conditions.
      const result = await query(
        `INSERT INTO emails (email)
         VALUES ($1)
         ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [trimmedEmail]
      );
      return result.rows[0].id;
    } catch (error) {
      logger.error("Lỗi khi lấy/tạo email:", error);
      throw error;
    }
  },

  /**
   * Get email by ID
   * @param {number} emailId - Email ID
   * @returns {Promise<string|null>} Email address
   */
  async getEmailById(emailId) {
    try {
      const result = await query("SELECT email FROM emails WHERE id = $1", [emailId]);
      return result.rows.length > 0 ? result.rows[0].email : null;
    } catch (error) {
      logger.error("Lỗi khi lấy email theo ID:", error);
      return null;
    }
  },

  /**
   * Get all job emails in batch (optimized to avoid N+1 queries)
   * @param {number[]} jobIds - Array of job IDs
   * @returns {Promise<Map<number, {from: string[], to: string[], cc: string[], bcc: string[]}>>} Map of job emails by type
   */
  async getJobEmailsBatch(jobIds) {
    if (!jobIds || jobIds.length === 0) {
      return new Map();
    }

    try {
      const result = await query(
        `SELECT je.job_id, je.type, e.email, je.page_name
         FROM job_emails je
         INNER JOIN emails e ON e.id = je.email_id
         WHERE je.job_id = ANY($1::int[])
         ORDER BY je.job_id, je.type, e.email`,
        [jobIds]
      );

      // Group by job_id and type
      const jobEmailsMap = new Map();

      for (const row of result.rows) {
        const jobId = row.job_id;
        const type = row.type;
        const email = row.email;

        if (!jobEmailsMap.has(jobId)) {
          jobEmailsMap.set(jobId, {
            from: [],
            to: [],
            toRecipients: [],
            cc: [],
            bcc: [],
          });
        }

        const jobEmails = jobEmailsMap.get(jobId);
        if (jobEmails[type]) {
          jobEmails[type].push(email);
          if (type === "to") {
            jobEmails.toRecipients.push({
              email,
              page_name: row.page_name != null ? row.page_name : null,
            });
          }
        }
      }

      return jobEmailsMap;
    } catch (error) {
      logger.error("Lỗi khi lấy emails của jobs (batch):", error);
      throw error;
    }
  },

  /**
   * Get emails for a single job
   * @param {number} jobId - Job ID
   * @param {string|null} type - Email type ('from', 'to', 'cc', 'bcc') or null for all
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

      queryText += ` ORDER BY e.email`;

      const result = await query(queryText, params);
      return result.rows.map((row) => row.email);
    } catch (error) {
      logger.error("Lỗi khi lấy emails của job:", error);
      return [];
    }
  },

  /**
   * Get recipients (type 'to') with page_name for [Name] replacement
   * @param {number} jobId - Job ID
   * @returns {Promise<Array<{email: string, page_name: string|null}>>}
   */
  async getJobRecipients(jobId) {
    try {
      const result = await query(
        `SELECT e.email, je.page_name
         FROM emails e
         INNER JOIN job_emails je ON e.id = je.email_id
         WHERE je.job_id = $1 AND je.type = 'to'
         ORDER BY e.email`,
        [jobId]
      );
      return result.rows.map((row) => ({
        email: row.email,
        page_name: row.page_name != null ? row.page_name : null,
      }));
    } catch (error) {
      logger.error("Lỗi khi lấy recipients của job:", error);
      return [];
    }
  },

  /**
   * Save job emails
   * @param {number} jobId - Job ID
   * @param {string|string[]|Array<{email: string, page_name?: string}>} emails - Email address(es) or recipients with page_name (for type 'to')
   * @param {string} type - Email type ('from', 'to', 'cc', 'bcc')
   * @returns {Promise<{saved: number, skipped: number, errors: string[]}>} Result
   */
  async saveJobEmails(jobId, emails, type) {
    const result = { saved: 0, skipped: 0, errors: [] };
    const rawArray = Array.isArray(emails) ? emails : [emails];
    const isRecipientsFormat =
      type === "to" &&
      rawArray.length > 0 &&
      rawArray[0] &&
      typeof rawArray[0] === "object" &&
      "email" in rawArray[0];
    const items = isRecipientsFormat
      ? rawArray.map((r) => ({
          email: (r && r.email) || "",
          page_name: (r && r.page_name) || null,
        }))
      : rawArray.map((email) => ({
          email: typeof email === "string" ? email : "",
          page_name: null,
        }));

    try {
      for (const item of items) {
        const trimmedEmail = typeof item.email === "string" ? item.email.trim() : "";
        if (!trimmedEmail) {
          result.skipped++;
          continue;
        }

        if (!EmailValidator.isValidFormat(trimmedEmail)) {
          const errorMsg = `Email không hợp lệ (format không đúng): ${trimmedEmail}`;
          logger.warn(errorMsg);
          result.skipped++;
          result.errors.push(errorMsg);
          continue;
        }

        try {
          const emailId = await this.getOrCreateEmail(trimmedEmail);
          const pageName =
            type === "to" && item.page_name != null ? String(item.page_name).trim() || null : null;

          if (type === "to") {
            await query(
              `INSERT INTO job_emails (job_id, email_id, type, page_name)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (job_id, email_id, type) DO UPDATE SET page_name = EXCLUDED.page_name`,
              [jobId, emailId, type, pageName]
            );
          } else {
            await query(
              `INSERT INTO job_emails (job_id, email_id, type)
               VALUES ($1, $2, $3)
               ON CONFLICT (job_id, email_id, type) DO NOTHING`,
              [jobId, emailId, type]
            );
          }

          result.saved++;
        } catch (emailError) {
          const errorMsg = `Không thể lưu email ${trimmedEmail}: ${emailError.message}`;
          logger.error(errorMsg);
          result.skipped++;
          result.errors.push(errorMsg);
        }
      }

      if (result.errors.length > 0) {
        logger.warn(
          `Khi lưu emails cho job ${jobId}, type ${type}: ${result.saved} email đã lưu, ${result.skipped} email bị bỏ qua`
        );
      }

      return result;
    } catch (error) {
      logger.error("Lỗi khi lưu emails cho job:", error);
      throw error;
    }
  },

  /**
   * Delete job emails
   * @param {number} jobId - Job ID
   * @param {string|null} type - Email type or null for all
   */
  async deleteJobEmails(jobId, type = null) {
    try {
      if (type) {
        await query("DELETE FROM job_emails WHERE job_id = $1 AND type = $2", [jobId, type]);
      } else {
        await query("DELETE FROM job_emails WHERE job_id = $1", [jobId]);
      }
    } catch (error) {
      logger.error("Lỗi khi xóa emails của job:", error);
      throw error;
    }
  },

  /**
   * Create a new run
   * @param {number} jobId - Job ID
   * @param {string} emailFrom - From email
   * @param {string} method - Method ('Gmail API' or 'SMTP')
   * @returns {Promise<number>} Run ID
   */
  async createRun(jobId, emailFrom, method = "SMTP") {
    try {
      const emailFromId = await this.getOrCreateEmail(emailFrom);

      const result = await query(
        `INSERT INTO runs (job_id, email_from_id, status, method)
         VALUES ($1, $2, 'running', $3)
         RETURNING id`,
        [jobId, emailFromId, method]
      );

      const runId = result.rows[0].id;
      logger.success(`Đã tạo run mới: run_id=${runId}, job_id=${jobId}`);
      return runId;
    } catch (error) {
      logger.error("Lỗi khi tạo run:", error);
      throw error;
    }
  },

  /**
   * Update run status
   * @param {number} runId - Run ID
   * @param {string} status - Status
   * @param {number} sentCount - Sent count
   * @param {number} totalCount - Total count
   * @param {number} failedCount - Failed count
   * @param {Array} errors - Errors array
   */
  async updateRunStatus(
    runId,
    status,
    sentCount = 0,
    totalCount = 0,
    failedCount = 0,
    errors = null
  ) {
    try {
      await query(
        `UPDATE runs
         SET status = $1,
             completed_at = CURRENT_TIMESTAMP,
             sent_count = $2,
             total_count = $3,
             failed_count = $4,
             errors = $5
         WHERE id = $6`,
        [status, sentCount, totalCount, failedCount, errors ? JSON.stringify(errors) : null, runId]
      );
      logger.debug(
        `Đã cập nhật run ${runId}: status=${status}, sent=${sentCount}, failed=${failedCount}`
      );
    } catch (error) {
      logger.error("Lỗi khi cập nhật run status:", error);
      throw error;
    }
  },

  /**
   * Get emails to send (excluding already sent ones)
   * @param {number} jobId - Job ID
   * @returns {Promise<string[]>} Array of email addresses
   */
  async getEmailsToSend(jobId) {
    try {
      const result = await query(
        `SELECT e.email
         FROM job_emails je
         INNER JOIN emails e ON e.id = je.email_id
         WHERE je.job_id = $1
           AND je.type = 'to'
           AND je.email_id NOT IN (
             SELECT email_id 
             FROM sent_emails 
             WHERE job_id = $1
           )
         ORDER BY e.email`,
        [jobId]
      );
      return result.rows.map((row) => row.email);
    } catch (error) {
      logger.error("Lỗi khi lấy danh sách email cần gửi:", error);
      throw error;
    }
  },

  /**
   * Save sent email
   * @param {number} runId - Run ID
   * @param {number} jobId - Job ID
   * @param {string} email - Email address
   */
  async saveSentEmail(runId, jobId, email) {
    try {
      const emailId = await this.getOrCreateEmail(email);

      await query(
        `INSERT INTO sent_emails (run_id, job_id, email_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (job_id, email_id) DO NOTHING`,
        [runId, jobId, emailId]
      );
    } catch (error) {
      logger.error(`Lỗi khi lưu sent email ${email}:`, error);
      // Don't throw to avoid affecting email sending process
    }
  },

  /**
   * Save failed email
   * @param {number|null} runId - Run ID
   * @param {number} jobId - Job ID
   * @param {string} email - Email address
   * @param {string} error - Error message
   * @param {string} method - Method used
   */
  async saveFailedEmail(runId, jobId, email, error, method = "SMTP") {
    try {
      if (!jobId || !email || !error) {
        logger.warn(
          `Không lưu email failed vì thiếu thông tin: runId=${runId}, jobId=${jobId}, email=${email}`
        );
        return;
      }

      let emailId = null;
      let finalError = error;

      if (EmailValidator.isValidFormat(email)) {
        try {
          emailId = await this.getOrCreateEmail(email);
        } catch (emailError) {
          logger.warn(`Không thể lưu email vào bảng emails: ${email}`, emailError.message);
          finalError = `${error} (Email không hợp lệ: ${email})`;
        }
      } else {
        logger.warn(`Email không hợp lệ, không lưu vào bảng emails: ${email}`);
        finalError = `${error} (Email không hợp lệ: ${email})`;
      }

      await query(
        `INSERT INTO failed_emails (run_id, job_id, email_id, error, method)
         VALUES ($1, $2, $3, $4, $5)`,
        [runId, jobId, emailId, finalError, method]
      );

      logger.debug(
        `Đã lưu email failed: ${email} (email_id: ${
          emailId || "NULL"
        }) - Run ID: ${runId || "N/A"}, Job ID: ${jobId}`
      );
    } catch (dbError) {
      logger.error("Lỗi khi lưu email failed vào database:", dbError);
      // Don't throw to avoid affecting email sending process
    }
  },
};

module.exports = DatabaseService;
