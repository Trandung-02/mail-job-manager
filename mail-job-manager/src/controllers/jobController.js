/**
 * Job Controller
 * Handles job-related API requests with optimized database queries
 */

const { query } = require("../config/database");
const DatabaseService = require("../services/databaseService");

function normalizeAppPassword(appPassword) {
  if (!appPassword) return null;
  return appPassword.trim().replace(/\s+/g, "");
}

function normalizeRecipientsInput(emailTo, emailRecipients) {
  if (emailRecipients && Array.isArray(emailRecipients) && emailRecipients.length > 0) {
    return emailRecipients;
  }
  if (Array.isArray(emailTo)) {
    return emailTo;
  }
  return emailTo != null ? [emailTo] : [];
}

async function buildJobWithEmails(jobId, baseJobData) {
  const emailFrom = await DatabaseService.getJobEmails(jobId, "from");
  const emailTo = await DatabaseService.getJobEmails(jobId, "to");
  const emailRecipients = await DatabaseService.getJobRecipients(jobId);
  const emailCc = await DatabaseService.getJobEmails(jobId, "cc");
  const emailBcc = await DatabaseService.getJobEmails(jobId, "bcc");

  return {
    ...baseJobData,
    email_from: emailFrom.length > 0 ? emailFrom[0] : null,
    email_to: emailTo,
    email_recipients:
      emailRecipients.length > 0
        ? emailRecipients
        : emailTo.map((email) => ({ email, page_name: null })),
    email_cc: emailCc,
    email_bcc: emailBcc,
  };
}

const JobController = {
  /**
   * Get all jobs (optimized with batch query to avoid N+1)
   */
  async getAllJobs(req, res, next) {
    try {
      // Get all jobs
      const result = await query("SELECT * FROM jobs ORDER BY created_at DESC");
      const jobs = result.rows;

      if (jobs.length === 0) {
        return res.json({
          success: true,
          data: [],
          count: 0,
        });
      }

      // Get all job IDs for batch query
      const jobIds = jobs.map((job) => job.id);

      // Batch query to get all emails for all jobs at once (fixes N+1 problem)
      const jobEmailsMap = await DatabaseService.getJobEmailsBatch(jobIds);

      // Map jobs with their emails
      const jobsWithEmails = jobs.map((job) => {
        const emails = jobEmailsMap.get(job.id) || {
          from: [],
          to: [],
          toRecipients: [],
          cc: [],
          bcc: [],
        };

        return {
          ...job,
          email_from: emails.from.length > 0 ? emails.from[0] : null,
          email_to: emails.to,
          email_recipients:
            emails.toRecipients || emails.to.map((email) => ({ email, page_name: null })),
          email_cc: emails.cc,
          email_bcc: emails.bcc,
        };
      });

      res.json({
        success: true,
        data: jobsWithEmails,
        count: jobsWithEmails.length,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Get job by ID
   */
  async getJobById(req, res, next) {
    try {
      const { id } = req.params;

      const result = await query("SELECT * FROM jobs WHERE id = $1", [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job không tồn tại",
        });
      }

      res.json({
        success: true,
        data: await buildJobWithEmails(result.rows[0].id, result.rows[0]),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Create new job
   */
  async createJob(req, res, next) {
    try {
      const {
        name,
        chrome_profile,
        display_name,
        email_subject,
        email_body,
        schedule,
        schedule_time,
        notes,
        status,
        app_password,
        email_from,
        email_to,
        email_recipients,
        email_cc,
        email_bcc,
      } = req.body;

      // Clean app password
      const cleanAppPassword = normalizeAppPassword(app_password);

      // Validate app password format if provided
      if (cleanAppPassword && cleanAppPassword.length !== 16) {
        return res.status(400).json({
          success: false,
          error: `App Password không hợp lệ. Phải có đúng 16 ký tự (sau khi loại bỏ khoảng trắng). Hiện tại: ${cleanAppPassword.length} ký tự.`,
        });
      }

      // Insert job
      const result = await query(
        `INSERT INTO jobs (name, chrome_profile, display_name, email_subject, email_body, schedule, schedule_time, notes, status, app_password)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          name,
          chrome_profile || null,
          display_name && display_name.trim() !== "" ? display_name.trim() : null,
          email_subject,
          email_body,
          schedule || "manual",
          schedule_time || "09:00:00",
          notes || null,
          status || "active",
          cleanAppPassword,
        ]
      );

      const job = result.rows[0];

      // Save emails (email_recipients = [{ email, page_name }, ...] hoặc email_to = string[])
      const fromResult = await DatabaseService.saveJobEmails(job.id, email_from, "from");

      const toData = normalizeRecipientsInput(email_to, email_recipients);
      const toResult = await DatabaseService.saveJobEmails(job.id, toData, "to");

      // Save CC and BCC if provided
      if (email_cc && Array.isArray(email_cc) && email_cc.length > 0) {
        await DatabaseService.saveJobEmails(job.id, email_cc, "cc");
      }

      if (email_bcc && Array.isArray(email_bcc) && email_bcc.length > 0) {
        await DatabaseService.saveJobEmails(job.id, email_bcc, "bcc");
      }

      // Validate results
      if (fromResult.saved === 0) {
        await query("DELETE FROM jobs WHERE id = $1", [job.id]);
        return res.status(400).json({
          success: false,
          error: "Email gửi không hợp lệ. Vui lòng kiểm tra lại format email.",
        });
      }

      if (toResult.saved === 0) {
        await query("DELETE FROM jobs WHERE id = $1", [job.id]);
        return res.status(400).json({
          success: false,
          error: "Không có email nhận hợp lệ. Vui lòng kiểm tra lại format email.",
        });
      }

      res.status(201).json({
        success: true,
        data: await buildJobWithEmails(job.id, job),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Update job
   */
  async updateJob(req, res, next) {
    try {
      const { id } = req.params;
      const {
        name,
        chrome_profile,
        display_name,
        email_subject,
        email_body,
        schedule,
        schedule_time,
        notes,
        status,
        app_password,
        email_from,
        email_to,
        email_recipients,
        email_cc,
        email_bcc,
      } = req.body;

      // Check if job exists
      const jobResult = await query("SELECT * FROM jobs WHERE id = $1", [id]);
      if (jobResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job không tồn tại",
        });
      }

      // Clean app password if provided
      let cleanAppPassword = jobResult.rows[0].app_password;
      if (app_password !== undefined) {
        cleanAppPassword = normalizeAppPassword(app_password);

        if (cleanAppPassword && cleanAppPassword.length !== 16) {
          return res.status(400).json({
            success: false,
            error: `App Password không hợp lệ. Phải có đúng 16 ký tự.`,
          });
        }
      }

      // Update job
      const updateFields = [];
      const updateValues = [];
      let paramIndex = 1;

      if (name !== undefined) {
        updateFields.push(`name = $${paramIndex++}`);
        updateValues.push(name);
      }
      if (chrome_profile !== undefined) {
        updateFields.push(`chrome_profile = $${paramIndex++}`);
        updateValues.push(chrome_profile || null);
      }
      if (display_name !== undefined) {
        updateFields.push(`display_name = $${paramIndex++}`);
        updateValues.push(display_name && display_name.trim() !== "" ? display_name.trim() : null);
      }
      if (email_subject !== undefined) {
        updateFields.push(`email_subject = $${paramIndex++}`);
        updateValues.push(email_subject);
      }
      if (email_body !== undefined) {
        updateFields.push(`email_body = $${paramIndex++}`);
        updateValues.push(email_body);
      }
      if (schedule !== undefined) {
        updateFields.push(`schedule = $${paramIndex++}`);
        updateValues.push(schedule);
      }
      if (schedule_time !== undefined) {
        updateFields.push(`schedule_time = $${paramIndex++}`);
        updateValues.push(schedule_time);
      }
      if (notes !== undefined) {
        updateFields.push(`notes = $${paramIndex++}`);
        updateValues.push(notes || null);
      }
      if (status !== undefined) {
        updateFields.push(`status = $${paramIndex++}`);
        updateValues.push(status);
      }
      if (app_password !== undefined) {
        updateFields.push(`app_password = $${paramIndex++}`);
        updateValues.push(cleanAppPassword);
      }

      if (updateFields.length > 0) {
        updateValues.push(id);
        await query(
          `UPDATE jobs SET ${updateFields.join(", ")} WHERE id = $${paramIndex}`,
          updateValues
        );
      }

      // Update emails if provided
      if (email_from !== undefined) {
        await DatabaseService.deleteJobEmails(id, "from");
        const fromResult = await DatabaseService.saveJobEmails(id, email_from, "from");
        if (fromResult.saved === 0) {
          return res.status(400).json({
            success: false,
            error: "Email gửi không hợp lệ",
          });
        }
      }

      if (email_to !== undefined || email_recipients !== undefined) {
        await DatabaseService.deleteJobEmails(id, "to");
        const toData = normalizeRecipientsInput(email_to, email_recipients);
        const toResult = await DatabaseService.saveJobEmails(id, toData, "to");
        if (toResult.saved === 0) {
          return res.status(400).json({
            success: false,
            error: "Không có email nhận hợp lệ",
          });
        }
      }

      if (email_cc !== undefined) {
        await DatabaseService.deleteJobEmails(id, "cc");
        if (email_cc && Array.isArray(email_cc) && email_cc.length > 0) {
          await DatabaseService.saveJobEmails(id, email_cc, "cc");
        }
      }

      if (email_bcc !== undefined) {
        await DatabaseService.deleteJobEmails(id, "bcc");
        if (email_bcc && Array.isArray(email_bcc) && email_bcc.length > 0) {
          await DatabaseService.saveJobEmails(id, email_bcc, "bcc");
        }
      }

      // Get updated job
      const updatedResult = await query("SELECT * FROM jobs WHERE id = $1", [id]);
      const updatedJob = updatedResult.rows[0];

      res.json({
        success: true,
        data: await buildJobWithEmails(id, updatedJob),
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Delete job
   */
  async deleteJob(req, res, next) {
    try {
      const { id } = req.params;

      const result = await query("DELETE FROM jobs WHERE id = $1 RETURNING *", [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Job không tồn tại",
        });
      }

      res.json({
        success: true,
        message: "Job đã được xóa thành công",
      });
    } catch (error) {
      next(error);
    }
  },
};

module.exports = JobController;
