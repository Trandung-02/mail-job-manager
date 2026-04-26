/**
 * Result Routes
 * API routes for email results and statistics
 */

const express = require("express");
const router = express.Router();
const { query } = require("../config/database");
const asyncHandler = require("../middlewares/asyncHandler");

/** Parse errors JSON an toàn, trả về null nếu không hợp lệ */
function safeParseErrors(value) {
  if (value == null || value === "") return null;
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

/**
 * GET /api/email-results
 * Get all email results with optional filtering
 */
router.get(
  "/email-results",
  asyncHandler(async (req, res) => {
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

    // Parse errors từ JSON string (an toàn, tránh crash khi dữ liệu lỗi)
    const results = result.rows.map((row) => ({
      ...row,
      errors: safeParseErrors(row.errors),
    }));

    res.json({
      success: true,
      data: results,
      count: results.length,
    });
  })
);

/**
 * GET /api/email-results/:id
 * Get a specific email result by ID
 */
router.get(
  "/email-results/:id",
  asyncHandler(async (req, res) => {
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
    emailResult.errors = safeParseErrors(emailResult.errors);

    res.json({
      success: true,
      data: emailResult,
    });
  })
);

/**
 * GET /api/jobs/:id/results
 * Get all email results for a specific job
 */
router.get(
  "/jobs/:id/results",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [id]);
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

    // Parse errors từ JSON string (an toàn)
    const results = result.rows.map((row) => ({
      ...row,
      errors: safeParseErrors(row.errors),
    }));

    res.json({
      success: true,
      job_id: parseInt(id),
      job_name: jobCheck.rows[0].name,
      data: results,
      count: results.length,
    });
  })
);

/**
 * GET /api/jobs/:id/stats
 * Get statistics for a specific job
 */
router.get(
  "/jobs/:id/stats",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [id]);
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
      stats.total_emails > 0 ? ((stats.total_sent / stats.total_emails) * 100).toFixed(2) : 0;

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
  })
);

/**
 * GET /api/failed-emails
 * Get all failed emails with optional filtering
 */
router.get(
  "/failed-emails",
  asyncHandler(async (req, res) => {
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
  })
);

/**
 * GET /api/jobs/:id/failed-emails
 * Get failed emails for a specific job
 */
router.get(
  "/jobs/:id/failed-emails",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [id]);
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
  })
);

/**
 * GET /api/jobs/:id/last-run-log
 * Get log of the last run for a specific job
 */
router.get(
  "/jobs/:id/last-run-log",
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Kiểm tra job có tồn tại không
    const jobCheck = await query("SELECT id, name FROM jobs WHERE id = $1", [id]);
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

    // Lấy failed_emails của lần chạy gần nhất (dựa trên created_at gần với email_result)
    let failedEmails = [];
    if (resultQuery.rows.length > 0) {
      const lastRunTime = resultQuery.rows[0].created_at;
      // Lấy failed emails trong khoảng thời gian gần với last run (trong vòng 1 giờ)
      const failedQuery = await query(
        `SELECT fe.*, e.email
         FROM failed_emails fe
         LEFT JOIN emails e ON fe.email_id = e.id
         WHERE fe.job_id = $1
           AND fe.created_at >= $2 - INTERVAL '1 hour'
           AND fe.created_at <= $2 + INTERVAL '1 hour'
         ORDER BY fe.created_at DESC`,
        [id, lastRunTime]
      );
      failedEmails = failedQuery.rows;
    }

    const emailResult = resultQuery.rows[0];
    if (emailResult) {
      emailResult.errors = safeParseErrors(emailResult.errors);
    }

    res.json({
      success: true,
      job_id: parseInt(id),
      job_name: jobCheck.rows[0].name,
      last_run: emailResult || null,
      failed_emails: failedEmails,
      failed_count: failedEmails.length,
    });
  })
);

module.exports = router;
