/**
 * Mail Job Manager - Main Application
 * ES6 Module Pattern với Clean Code Architecture
 */

// ============================================
// Constants
// ============================================
const API_BASE_URL = "http://localhost:3000";
const STORAGE_KEY = "mailJobs";
const SCHEDULE_TEXTS = {
  manual: "Thủ công",
  daily: "Hàng ngày",
  weekly: "Hàng tuần",
  monthly: "Hàng tháng",
};

// ============================================
// State Management
// ============================================
const AppState = {
  jobs: [],
  editingJobId: null,
  isLoading: false,
};

// ============================================
// DOM Elements Cache
// ============================================
const DOM = {
  container: null,
  modal: null,
  form: null,
  // Initialize on DOMContentLoaded
  init() {
    this.container = document.getElementById("jobsContainer");
    this.modal = document.getElementById("jobModal");
    this.form = document.getElementById("jobForm");
  },
};

// ============================================
// LocalStorage Service
// ============================================
const StorageService = {
  /**
   * Load jobs from localStorage
   * @returns {Array} Array of jobs
   */
  loadJobs() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.warn("LocalStorage không khả dụng:", error);
      return [];
    }
  },

  /**
   * Save jobs to localStorage
   * @param {Array} jobs - Array of jobs to save
   */
  saveJobs(jobs) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
      return true;
    } catch (error) {
      console.warn("Không thể lưu dữ liệu vào localStorage:", error);
      return false;
    }
  },
};

// ============================================
// API Service
// ============================================
const ApiService = {
  /**
   * Fetch Chrome profiles
   * @returns {Promise<Array>} Array of Chrome profiles
   */
  async getProfiles() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/profiles`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error("Lỗi khi tải profiles:", error);
      throw error;
    }
  },

  /**
   * Get all jobs from database
   * @returns {Promise<Array>} Array of jobs
   */
  async getJobs() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.success ? result.data : [];
    } catch (error) {
      console.error("Lỗi khi tải jobs:", error);
      throw error;
    }
  },

  /**
   * Get a single job by ID
   * @param {number} id - Job ID
   * @returns {Promise<Object>} Job object
   */
  async getJob(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs/${id}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error) {
      console.error("Lỗi khi tải job:", error);
      throw error;
    }
  },

  /**
   * Create a new job
   * @param {Object} jobData - Job data
   * @returns {Promise<Object>} Created job object
   */
  async createJob(jobData) {
    try {
      // Convert jobData format to API format
      const apiJobData = {
        name: jobData.name,
        chrome_profile: jobData.chromeProfile || null,
        email_from: jobData.emailFrom,
        email_to: Array.isArray(jobData.emailTo)
          ? jobData.emailTo
          : [jobData.emailTo],
        email_subject: jobData.emailSubject,
        email_body: jobData.emailBody,
        schedule: jobData.schedule || "manual",
        schedule_time: jobData.scheduleTime
          ? `${jobData.scheduleTime}:00`
          : "09:00:00",
        notes: jobData.notes || null,
        status: jobData.status || "active",
        app_password: jobData.appPassword || null,
      };

      const response = await fetch(`${API_BASE_URL}/api/jobs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiJobData),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Không thể tạo job");
      }

      // Convert API format back to app format
      return this.convertJobFromAPI(result.data);
    } catch (error) {
      console.error("Lỗi khi tạo job:", error);
      throw error;
    }
  },

  /**
   * Update an existing job
   * @param {number} id - Job ID
   * @param {Object} jobData - Updated job data
   * @returns {Promise<Object>} Updated job object
   */
  async updateJob(id, jobData) {
    try {
      // Convert jobData format to API format
      const apiJobData = {};
      if (jobData.name !== undefined) apiJobData.name = jobData.name;
      if (jobData.chromeProfile !== undefined)
        apiJobData.chrome_profile = jobData.chromeProfile || null;
      if (jobData.emailFrom !== undefined)
        apiJobData.email_from = jobData.emailFrom;
      if (jobData.emailTo !== undefined) {
        apiJobData.email_to = Array.isArray(jobData.emailTo)
          ? jobData.emailTo
          : [jobData.emailTo];
      }
      if (jobData.emailSubject !== undefined)
        apiJobData.email_subject = jobData.emailSubject;
      if (jobData.emailBody !== undefined)
        apiJobData.email_body = jobData.emailBody;
      if (jobData.schedule !== undefined)
        apiJobData.schedule = jobData.schedule;
      if (jobData.scheduleTime !== undefined) {
        apiJobData.schedule_time = jobData.scheduleTime.includes(":")
          ? jobData.scheduleTime
          : `${jobData.scheduleTime}:00`;
      }
      if (jobData.notes !== undefined) apiJobData.notes = jobData.notes || null;
      if (jobData.status !== undefined) apiJobData.status = jobData.status;
      if (jobData.appPassword !== undefined) {
        // Nếu appPassword rỗng, gửi null để xóa
        apiJobData.app_password =
          jobData.appPassword && jobData.appPassword.trim() !== ""
            ? jobData.appPassword
            : null;
      }

      const response = await fetch(`${API_BASE_URL}/api/jobs/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apiJobData),
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Không thể cập nhật job");
      }

      // Convert API format back to app format
      return this.convertJobFromAPI(result.data);
    } catch (error) {
      console.error("Lỗi khi cập nhật job:", error);
      throw error;
    }
  },

  /**
   * Delete a job
   * @param {number} id - Job ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteJob(id) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/jobs/${id}`, {
        method: "DELETE",
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Không thể xóa job");
      }

      return true;
    } catch (error) {
      console.error("Lỗi khi xóa job:", error);
      throw error;
    }
  },

  /**
   * Get last run log for a job
   * @param {number} id - Job ID
   * @returns {Promise<Object>} Log data
   */
  async getLastRunLog(id) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/jobs/${id}/last-run-log`
      );
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const result = await response.json();
      return result;
    } catch (error) {
      console.error("Lỗi khi tải log:", error);
      throw error;
    }
  },

  /**
   * Run a job
   * @param {Object} job - Job object to run
   * @returns {Promise<Object>} Result object
   */
  async runJob(job) {
    try {
      // If job has database ID, use the run endpoint with job_id
      if (job.id && typeof job.id === "number") {
        const response = await fetch(`${API_BASE_URL}/api/jobs/${job.id}/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            appPassword: job.appPassword,
            clientId: job.clientId,
            clientSecret: job.clientSecret,
            refreshToken: job.refreshToken,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Không thể thực thi job");
        }
        return data.result || data;
      } else {
        // Fallback to old run-job endpoint for jobs without database ID
        const response = await fetch(`${API_BASE_URL}/api/run-job`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(job),
        });

        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "Không thể thực thi job");
          error.status = response.status;
          error.availableProfiles = data.availableProfiles || null;
          throw error;
        }
        return data;
      }
    } catch (error) {
      console.error("Lỗi khi chạy job:", error);
      throw error;
    }
  },

  /**
   * Convert job from API format to app format
   * @param {Object} apiJob - Job from API
   * @returns {Object} Job in app format
   */
  convertJobFromAPI(apiJob) {
    return {
      id: apiJob.id,
      name: apiJob.name,
      chromeProfile: apiJob.chrome_profile,
      emailFrom: apiJob.email_from,
      emailTo: Array.isArray(apiJob.email_to)
        ? apiJob.email_to
        : JSON.parse(apiJob.email_to || "[]"),
      emailSubject: apiJob.email_subject,
      emailBody: apiJob.email_body,
      schedule: apiJob.schedule,
      scheduleTime: apiJob.schedule_time
        ? apiJob.schedule_time.substring(0, 5)
        : "09:00",
      notes: apiJob.notes,
      status: apiJob.status,
      createdAt: apiJob.created_at,
      updatedAt: apiJob.updated_at,
      lastSent: apiJob.last_sent,
      appPassword: apiJob.app_password || null,
    };
  },
};

// ============================================
// Utility Functions
// ============================================
const Utils = {
  /**
   * Get schedule text in Vietnamese
   * @param {string} schedule - Schedule type
   * @returns {string} Schedule text
   */
  getScheduleText(schedule) {
    return SCHEDULE_TEXTS[schedule] || schedule;
  },

  /**
   * Format date to Vietnamese locale
   * @param {string} dateString - ISO date string
   * @returns {string} Formatted date
   */
  formatDate(dateString) {
    return new Date(dateString).toLocaleString("vi-VN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  },

  /**
   * Parse email list from text
   * @param {string} text - Email list text
   * @returns {Array<string>} Array of email addresses
   */
  parseEmailList(text) {
    return text
      .split(/[,\n]/)
      .map((email) => email.trim())
      .filter((email) => email.length > 0 && this.isValidEmail(email));
  },

  /**
   * Validate email format
   * @param {string} email - Email address
   * @returns {boolean} Is valid email
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },

  /**
   * Show notification (can be replaced with toast library)
   * @param {string} message - Message to show
   * @param {string} type - Type: 'success', 'error', 'info'
   */
  showNotification(message, type = "info") {
    // Simple alert for now, can be replaced with toast notification
    alert(message);
  },

  /**
   * Confirm action
   * @param {string} message - Confirmation message
   * @returns {boolean} User confirmed
   */
  confirm(message) {
    return window.confirm(message);
  },

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} Escaped text
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },
};

// ============================================
// Job Management
// ============================================
const JobManager = {
  /**
   * Load jobs from API database
   */
  async loadJobs() {
    AppState.isLoading = true;
    try {
      const jobs = await ApiService.getJobs();
      // Convert all jobs from API format to app format
      AppState.jobs = jobs.map((job) => ApiService.convertJobFromAPI(job));
      this.render();
      this.updateStats();
    } catch (error) {
      console.error("Lỗi khi tải jobs:", error);
      Utils.showNotification(
        `❌ Không thể tải jobs từ database. ${error.message}\n\nĐảm bảo server đang chạy và database đã được kết nối.`,
        "error"
      );
      // Fallback: show empty state
      AppState.jobs = [];
      this.render();
      this.updateStats();
    } finally {
      AppState.isLoading = false;
    }
  },

  /**
   * Add new job
   * @param {Object} jobData - Job data
   */
  async addJob(jobData) {
    AppState.isLoading = true;
    try {
      const createdJob = await ApiService.createJob(jobData);
      AppState.jobs.push(createdJob);
      this.render();
      this.updateStats();
      Utils.showNotification("✅ Đã tạo job thành công!", "success");
    } catch (error) {
      console.error("Lỗi khi tạo job:", error);
      Utils.showNotification(`❌ Không thể tạo job: ${error.message}`, "error");
      throw error;
    } finally {
      AppState.isLoading = false;
    }
  },

  /**
   * Update existing job
   * @param {number} id - Job ID (database ID)
   * @param {Object} jobData - Updated job data
   */
  async updateJob(id, jobData) {
    AppState.isLoading = true;
    try {
      const updatedJob = await ApiService.updateJob(id, jobData);
      const index = AppState.jobs.findIndex((j) => j.id === id);
      if (index !== -1) {
        AppState.jobs[index] = updatedJob;
      }
      this.render();
      this.updateStats();
      Utils.showNotification("✅ Đã cập nhật job thành công!", "success");
    } catch (error) {
      console.error("Lỗi khi cập nhật job:", error);
      Utils.showNotification(
        `❌ Không thể cập nhật job: ${error.message}`,
        "error"
      );
      throw error;
    } finally {
      AppState.isLoading = false;
    }
  },

  /**
   * Delete job
   * @param {number} id - Job ID (database ID)
   */
  async deleteJob(id) {
    if (!Utils.confirm("Bạn có chắc muốn xóa job này?")) {
      return;
    }

    AppState.isLoading = true;
    try {
      await ApiService.deleteJob(id);
      AppState.jobs = AppState.jobs.filter((j) => j.id !== id);
      this.render();
      this.updateStats();
      Utils.showNotification("✅ Đã xóa job thành công!", "success");
    } catch (error) {
      console.error("Lỗi khi xóa job:", error);
      Utils.showNotification(`❌ Không thể xóa job: ${error.message}`, "error");
    } finally {
      AppState.isLoading = false;
    }
  },

  /**
   * Toggle job status
   * @param {number} id - Job ID (database ID)
   */
  async toggleJobStatus(id) {
    const job = AppState.jobs.find((j) => j.id === id);
    if (!job) return;

    const newStatus = job.status === "active" ? "paused" : "active";
    try {
      await this.updateJob(id, { status: newStatus });
    } catch (error) {
      // Error already handled in updateJob
    }
  },

  /**
   * Show last run log for a job
   * @param {number} id - Job ID (database ID)
   */
  async showLastRunLog(id) {
    const job = AppState.jobs.find((j) => j.id === id);
    if (!job) {
      Utils.showNotification("❌ Không tìm thấy job", "error");
      return;
    }

    try {
      const logData = await ApiService.getLastRunLog(id);

      if (!logData.has_run) {
        Utils.showNotification(
          `Job "${job.name}" chưa được chạy lần nào.`,
          "info"
        );
        return;
      }

      // Show log modal
      LogModalManager.showLog(logData);
    } catch (error) {
      console.error("Lỗi khi tải log:", error);
      Utils.showNotification(`❌ Không thể tải log: ${error.message}`, "error");
    }
  },

  /**
   * Run job
   * @param {number} id - Job ID (database ID)
   */
  async runJob(id) {
    const job = AppState.jobs.find((j) => j.id === id);
    if (!job) {
      Utils.showNotification("❌ Không tìm thấy job", "error");
      return;
    }

    // Kiểm tra appPassword trước khi chạy
    // Nếu không có appPassword, vẫn thử chạy (có thể có trong database)
    // Nếu có appPassword nhưng không hợp lệ, báo lỗi
    if (
      job.appPassword &&
      job.appPassword.trim().length > 0 &&
      job.appPassword.trim().length < 16
    ) {
      Utils.showNotification(
        "❌ App Password không hợp lệ (phải có ít nhất 16 ký tự). Vui lòng chỉnh sửa job.\n\n" +
          "Tạo App Password tại: https://myaccount.google.com/apppasswords\n" +
          "(Cần bật 2-Step Verification trước)",
        "error"
      );
      return;
    }

    if (
      !Utils.confirm(
        `Bạn có chắc muốn chạy job "${job.name}"?\n\nSẽ gửi ${job.emailTo.length} email từ ${job.emailFrom}`
      )
    ) {
      return;
    }

    AppState.isLoading = true;
    this.updateRunButton(id, true);

    try {
      // Prepare job data with authentication
      // Nếu job có appPassword, dùng nó; nếu không, API sẽ lấy từ database
      const jobToRun = {
        ...job,
        // Chỉ gửi appPassword nếu có (không gửi null/undefined)
        ...(job.appPassword && job.appPassword.trim().length > 0
          ? { appPassword: job.appPassword }
          : {}),
        // Include Gmail API credentials if available
        ...(job.clientId ? { clientId: job.clientId } : {}),
        ...(job.clientSecret ? { clientSecret: job.clientSecret } : {}),
        ...(job.refreshToken ? { refreshToken: job.refreshToken } : {}),
      };

      const result = await ApiService.runJob(jobToRun);

      if (result.success || result.sent !== undefined) {
        // Reload jobs to get updated last_sent from database
        await this.loadJobs();

        Utils.showNotification(
          `✅ Job "${job.name}" đã được thực thi thành công!\n\nĐã gửi: ${
            result.sent || 0
          }/${job.emailTo.length} email`,
          "success"
        );
      } else {
        Utils.showNotification(
          `❌ Lỗi: ${result.error || "Không thể thực thi job"}`,
          "error"
        );
      }
    } catch (error) {
      let errorMessage = "❌ Không thể thực thi job";

      if (error.message) {
        errorMessage = `❌ ${error.message}`;
      } else if (error.status === 404) {
        errorMessage = `❌ Không tìm thấy Chrome profile. ${
          error.message || ""
        }`;
      } else if (error.status === 400) {
        errorMessage = `❌ Dữ liệu không hợp lệ: ${error.message || ""}`;
      } else if (
        error.name === "TypeError" &&
        error.message.includes("fetch")
      ) {
        errorMessage =
          "❌ Không thể kết nối đến server. Đảm bảo server Node.js đang chạy (npm start)";
      }

      // Hiển thị danh sách profiles có sẵn nếu có
      if (error.availableProfiles && error.availableProfiles.length > 0) {
        const profilesList = error.availableProfiles
          .map(
            (p) =>
              `  • ${p.name} (${p.directory})${p.email ? ` - ${p.email}` : ""}`
          )
          .join("\n");
        errorMessage += `\n\n📋 Các profile có sẵn:\n${profilesList}\n\n💡 Vui lòng chỉnh sửa job và chọn lại profile đúng.`;
      }

      Utils.showNotification(errorMessage, "error");
    } finally {
      AppState.isLoading = false;
      this.updateRunButton(id, false);
    }
  },

  /**
   * Update run button state
   * @param {number} id - Job ID (database ID)
   * @param {boolean} isLoading - Is loading
   */
  updateRunButton(id, isLoading) {
    const button = document.querySelector(
      `[data-job-id="${id}"][data-action="run"]`
    );
    if (button) {
      button.disabled = isLoading;
      button.innerHTML = isLoading
        ? '<span class="loading"></span> Đang xử lý...'
        : "▶ Chạy";
    }
  },

  /**
   * Render jobs list
   */
  render() {
    if (!DOM.container) return;

    if (AppState.jobs.length === 0) {
      DOM.container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state__icon">📭</div>
          <h3 class="empty-state__title">Chưa có job nào</h3>
          <p class="empty-state__text">Nhấn "Thêm Job Mới" để bắt đầu</p>
        </div>
      `;
      return;
    }

    DOM.container.innerHTML = AppState.jobs
      .map((job) => this.renderJobCard(job))
      .join("");
  },

  /**
   * Render single job card
   * @param {Object} job - Job object
   * @returns {string} HTML string
   */
  renderJobCard(job) {
    const statusClass =
      job.status === "active"
        ? "job-card__status--active"
        : "job-card__status--paused";
    const statusText = job.status === "active" ? "✓ Hoạt động" : "⏸ Tạm dừng";
    const lastSentHtml = job.lastSent
      ? `<div class="job-card__info"><strong>Gửi lần cuối:</strong> ${Utils.formatDate(
          job.lastSent
        )}</div>`
      : "";

    return `
      <article class="job-card">
        <div class="job-card__header">
          <h3 class="job-card__title">${Utils.escapeHtml(job.name)}</h3>
          <span class="job-card__status ${statusClass}">${statusText}</span>
        </div>
        <div class="job-card__info">
          <strong>Profile:</strong> ${Utils.escapeHtml(
            job.chromeProfile || "N/A"
          )}
        </div>
        <div class="job-card__info">
          <strong>Email:</strong> ${Utils.escapeHtml(job.emailFrom)}
        </div>
        <div class="job-card__info">
          <strong>Số người nhận:</strong> ${job.emailTo.length}
        </div>
        <div class="job-card__info">
          <strong>Lịch:</strong> ${Utils.getScheduleText(job.schedule)}
        </div>
        <div class="job-card__info">
          <strong>Thời gian:</strong> ${job.scheduleTime || "N/A"}
        </div>
        ${lastSentHtml}
        <div class="job-card__actions">
          <button class="btn btn--success btn--small" data-job-id="${
            job.id
          }" data-action="run" onclick="JobManager.runJob(${job.id})">
            ▶ Chạy
          </button>
          <button class="btn btn--info btn--small" data-job-id="${
            job.id
          }" data-action="log" onclick="JobManager.showLastRunLog(${job.id})">
            📋 Xem log
          </button>
          <button class="btn btn--warning btn--small" data-job-id="${
            job.id
          }" data-action="toggle" onclick="JobManager.toggleJobStatus(${
      job.id
    })">
            ${job.status === "active" ? "⏸ Dừng" : "▶ Kích hoạt"}
          </button>
          <button class="btn btn--primary btn--small" data-job-id="${
            job.id
          }" data-action="edit" onclick="ModalManager.openEditModal(${job.id})">
            ✏ Sửa
          </button>
          <button class="btn btn--danger btn--small" data-job-id="${
            job.id
          }" data-action="delete" onclick="JobManager.deleteJob(${job.id})">
            🗑 Xóa
          </button>
        </div>
      </article>
    `;
  },

  /**
   * Update statistics
   */
  updateStats() {
    const total = AppState.jobs.length;
    const active = AppState.jobs.filter((j) => j.status === "active").length;
    const paused = AppState.jobs.filter((j) => j.status === "paused").length;

    const totalEl = document.getElementById("totalJobs");
    const activeEl = document.getElementById("activeJobs");
    const pausedEl = document.getElementById("pausedJobs");

    if (totalEl) totalEl.textContent = total;
    if (activeEl) activeEl.textContent = active;
    if (pausedEl) pausedEl.textContent = paused;
  },
};

// ============================================
// Modal Management
// ============================================
const ModalManager = {
  /**
   * Open add modal
   */
  async openAddModal() {
    AppState.editingJobId = null;
    const title = document.getElementById("modalTitle");
    if (title) title.textContent = "Thêm Job Mới";

    // Lưu profiles trước khi reset form (nếu có)
    const profileSelect = document.getElementById("chromeProfile");
    let savedProfiles = null;
    if (profileSelect && profileSelect.dataset.profiles) {
      try {
        savedProfiles = JSON.parse(profileSelect.dataset.profiles);
      } catch (e) {
        console.warn("Không thể parse profiles:", e);
      }
    }

    // Reset form
    if (DOM.form) {
      DOM.form.reset();
    }

    // Reset email field về trạng thái ban đầu
    const emailFromInput = document.getElementById("emailFrom");
    if (emailFromInput) {
      emailFromInput.readOnly = false;
      emailFromInput.style.backgroundColor = "";
      emailFromInput.style.cursor = "";
      emailFromInput.title = "";
      emailFromInput.value = "";
    }

    // Reset App Password hint và input
    const appPasswordHint = document.getElementById("appPasswordHint");
    const appPasswordInput = document.getElementById("appPassword");
    if (appPasswordHint) appPasswordHint.style.display = "none";
    if (appPasswordInput) {
      appPasswordInput.placeholder =
        "Nhập Gmail App Password (16 ký tự, bắt buộc khi tạo mới)";
      appPasswordInput.setAttribute("required", "required");
    }

    // Reset profile custom input
    const profileCustomInput = document.getElementById("chromeProfileCustom");
    if (profileCustomInput) {
      profileCustomInput.value = "";
    }

    // Reset handler flag và xóa pending profile
    if (profileSelect) {
      profileSelect.dataset.handlerSetup = "false";
      delete profileSelect.dataset.pendingProfile;

      // Khôi phục hoặc load profiles
      if (savedProfiles) {
        // Khôi phục profiles đã có (sau khi form.reset() có thể đã xóa options)
        // Đợi một chút để đảm bảo form.reset() đã hoàn tất
        setTimeout(() => {
          ProfileManager.populateProfileSelect(savedProfiles);
        }, 0);
      } else if (!profileSelect.dataset.profiles) {
        // Tự động load profiles nếu chưa có
        try {
          const profiles = await ApiService.getProfiles();
          ProfileManager.populateProfileSelect(profiles);
        } catch (error) {
          console.warn("Không thể tự động load profiles:", error);
          // Vẫn tiếp tục, người dùng có thể nhấn nút "Tải Profiles" thủ công
        }
      } else {
        // Nếu đã có profiles trong dataset (form.reset() không xóa dataset),
        // chỉ cần setup handler
        ProfileManager.setupProfileChangeHandler();
      }
    }

    this.show();
  },

  /**
   * Open edit modal
   * @param {number} id - Job ID (database ID)
   */
  async openEditModal(id) {
    let job = AppState.jobs.find((j) => j.id === id);

    // Try to load from API if not in state
    if (!job) {
      try {
        const loadedJob = await ApiService.getJob(id);
        if (loadedJob) {
          const convertedJob = ApiService.convertJobFromAPI(loadedJob);
          const index = AppState.jobs.findIndex((j) => j.id === id);
          if (index !== -1) {
            AppState.jobs[index] = convertedJob;
          } else {
            AppState.jobs.push(convertedJob);
          }
          job = convertedJob;
        } else {
          Utils.showNotification("❌ Không tìm thấy job", "error");
          return;
        }
      } catch (error) {
        console.error("Lỗi khi tải job:", error);
        Utils.showNotification(
          `❌ Không thể tải job: ${error.message}`,
          "error"
        );
        return;
      }
    }

    if (!job) {
      Utils.showNotification("❌ Không tìm thấy job", "error");
      return;
    }

    AppState.editingJobId = id;
    const title = document.getElementById("modalTitle");
    if (title) title.textContent = "Chỉnh Sửa Job";

    // Hiển thị modal trước
    this.show();

    // Tự động load profiles nếu chưa có
    const profileSelect = document.getElementById("chromeProfile");
    if (profileSelect && !profileSelect.dataset.profiles) {
      try {
        const profiles = await ApiService.getProfiles();
        ProfileManager.populateProfileSelect(profiles);
      } catch (error) {
        console.warn("Không thể tự động load profiles:", error);
        // Vẫn tiếp tục với profile custom nếu không load được
      }
    }

    // Populate form sau khi đã có profiles
    this.populateForm(job);

    // Setup profile change handler nếu đã load profiles
    if (profileSelect) {
      profileSelect.dataset.handlerSetup = "false";
      if (profileSelect.dataset.profiles) {
        ProfileManager.setupProfileChangeHandler();
      }
    }
  },

  /**
   * Populate form with job data
   * @param {Object} job - Job object
   */
  populateForm(job) {
    const fields = {
      jobName: job.name,
      emailFrom: job.emailFrom,
      appPassword: "", // Không hiển thị password cũ vì lý do bảo mật
      emailTo: job.emailTo.join(", "),
      emailSubject: job.emailSubject,
      emailBody: job.emailBody,
      schedule: job.schedule,
      scheduleTime: job.scheduleTime,
      notes: job.notes || "",
    };

    // Set các field thông thường
    Object.entries(fields).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) element.value = value;
    });

    // Xử lý Chrome Profile đặc biệt
    const profileSelect = document.getElementById("chromeProfile");
    const profileCustom = document.getElementById("chromeProfileCustom");
    const savedProfile = job.chromeProfile || "";

    if (profileSelect && profileCustom) {
      // Lưu giá trị savedProfile vào data attribute để khôi phục sau khi load profiles
      if (savedProfile) {
        profileSelect.dataset.pendingProfile = savedProfile;
      }

      // Kiểm tra xem profile đã lưu có trong dropdown không
      let profileFound = false;
      let matchedOption = null;

      if (profileSelect.options.length > 1) {
        // Tìm profile trong dropdown (so sánh theo value/directory, name, hoặc cả hai)
        for (let i = 0; i < profileSelect.options.length; i++) {
          const option = profileSelect.options[i];
          const optionValue = option.value || "";
          const optionName = option.dataset.name || "";
          const savedProfileLower = savedProfile.toLowerCase();

          // So sánh với directory (value) - exact match
          if (optionValue && optionValue.toLowerCase() === savedProfileLower) {
            matchedOption = option;
            profileFound = true;
            break;
          }

          // So sánh với name (nếu có) - exact match
          if (optionName && optionName.toLowerCase() === savedProfileLower) {
            matchedOption = option;
            profileFound = true;
            break;
          }
        }

        // Nếu không tìm thấy exact match, thử partial match
        if (!profileFound) {
          for (let i = 0; i < profileSelect.options.length; i++) {
            const option = profileSelect.options[i];
            const optionValue = option.value || "";
            const optionName = option.dataset.name || "";
            const savedProfileLower = savedProfile.toLowerCase();

            // Partial match với directory
            if (
              optionValue &&
              optionValue.toLowerCase().includes(savedProfileLower)
            ) {
              matchedOption = option;
              profileFound = true;
              break;
            }

            // Partial match với name
            if (
              optionName &&
              optionName.toLowerCase().includes(savedProfileLower)
            ) {
              matchedOption = option;
              profileFound = true;
              break;
            }
          }
        }
      }

      if (profileFound && matchedOption) {
        // Profile tìm thấy trong dropdown, xóa custom input
        profileSelect.value = matchedOption.value;
        profileCustom.value = "";

        // Xóa pending profile vì đã tìm thấy
        delete profileSelect.dataset.pendingProfile;

        // Tự động điền email nếu có
        const emailFromInput = document.getElementById("emailFrom");
        if (emailFromInput && matchedOption.dataset.email) {
          emailFromInput.value = matchedOption.dataset.email;
        }
      } else {
        // Profile không có trong dropdown, dùng custom input
        profileSelect.value = "";
        profileCustom.value = savedProfile;
      }
    }

    // Hiển thị gợi ý về App Password khi chỉnh sửa
    const appPasswordHint = document.getElementById("appPasswordHint");
    const appPasswordInput = document.getElementById("appPassword");
    if (appPasswordHint && appPasswordInput) {
      if (job.appPassword && job.appPassword.trim().length >= 16) {
        appPasswordHint.style.display = "block";
        appPasswordInput.placeholder =
          "Nhập App Password mới (để trống để giữ password hiện tại)";
        appPasswordInput.removeAttribute("required"); // Không bắt buộc khi chỉnh sửa nếu đã có
      } else {
        appPasswordHint.style.display = "none";
        appPasswordInput.placeholder =
          "Nhập Gmail App Password (16 ký tự, bắt buộc)";
        appPasswordInput.setAttribute("required", "required");
      }
    }

    // Kiểm tra và tự động điền email từ profile nếu có
    const emailFromInput = document.getElementById("emailFrom");

    if (profileSelect && emailFromInput) {
      // Đợi một chút để đảm bảo select đã được set giá trị
      setTimeout(() => {
        const selectedOption =
          profileSelect.options[profileSelect.selectedIndex];
        const selectedEmail = selectedOption?.dataset.email || "";

        if (selectedEmail && selectedEmail === job.emailFrom) {
          // Nếu email khớp với profile, làm readonly
          emailFromInput.readOnly = true;
          emailFromInput.style.backgroundColor = "#f3f4f6";
          emailFromInput.style.cursor = "not-allowed";
          emailFromInput.title =
            "Email được lấy tự động từ Chrome Profile đã chọn";
        } else {
          // Cho phép chỉnh sửa
          emailFromInput.readOnly = false;
          emailFromInput.style.backgroundColor = "";
          emailFromInput.style.cursor = "";
          emailFromInput.title = "";
        }
      }, 100);
    }
  },

  /**
   * Show modal
   */
  show() {
    if (DOM.modal) {
      DOM.modal.classList.add("modal--active");
      document.body.style.overflow = "hidden";
    }
  },

  /**
   * Close modal
   */
  close() {
    if (DOM.modal) {
      DOM.modal.classList.remove("modal--active");
      document.body.style.overflow = "";
    }
    AppState.editingJobId = null;
  },

  /**
   * Handle form submit
   * @param {Event} e - Submit event
   */
  async handleSubmit(e) {
    e.preventDefault();

    const formData = this.getFormData();

    // Khi chỉnh sửa, nếu appPassword trống nhưng job đã có appPassword, giữ lại appPassword cũ
    if (AppState.editingJobId) {
      const existingJob = AppState.jobs.find(
        (j) => j.id === AppState.editingJobId
      );
      if (existingJob) {
        // Giữ lại appPassword cũ nếu không nhập mới
        if (!formData.appPassword || formData.appPassword.trim().length < 16) {
          if (
            existingJob.appPassword &&
            existingJob.appPassword.trim().length >= 16
          ) {
            formData.appPassword = existingJob.appPassword; // Giữ lại appPassword cũ
          }
        }

        // Giữ lại displayName cũ nếu không chọn profile mới hoặc không có displayName mới
        if (!formData.displayName || formData.displayName.trim() === "") {
          if (
            existingJob.displayName &&
            existingJob.displayName.trim() !== ""
          ) {
            formData.displayName = existingJob.displayName; // Giữ lại displayName cũ
          }
        }
      }
    }

    if (!this.validateForm(formData)) {
      return;
    }

    try {
      if (AppState.editingJobId) {
        await JobManager.updateJob(AppState.editingJobId, formData);
      } else {
        await JobManager.addJob(formData);
      }
      this.close();
    } catch (error) {
      // Error already handled in addJob/updateJob
      // Don't close modal if there's an error
    }
  },

  /**
   * Get form data
   * @returns {Object} Form data object
   */
  getFormData() {
    const profileSelect = document.getElementById("chromeProfile");
    const profileCustom = document.getElementById("chromeProfileCustom");
    const chromeProfile =
      profileCustom?.value.trim() || profileSelect?.value || "";

    // Lấy email từ profile nếu đã chọn, nếu không thì lấy từ input
    let emailFrom = document.getElementById("emailFrom")?.value || "";
    let displayName = ""; // Tên hiển thị từ profile

    // Nếu chọn profile từ dropdown và có email, ưu tiên dùng email từ profile
    if (!profileCustom?.value.trim() && profileSelect?.value) {
      const selectedOption = profileSelect.options[profileSelect.selectedIndex];
      const profileEmail = selectedOption?.dataset.email || "";
      const profileName = selectedOption?.dataset.name || "";
      if (profileEmail) {
        emailFrom = profileEmail;
      }
      if (profileName && profileName.trim() !== "") {
        displayName = profileName.trim();
      }
    }

    // Nếu không có displayName từ profile, để rỗng (server sẽ tự động lấy từ profile hoặc dùng email)

    const emailToText = document.getElementById("emailTo")?.value || "";
    const emailToArray = Utils.parseEmailList(emailToText);

    return {
      name: document.getElementById("jobName")?.value || "",
      chromeProfile,
      emailFrom,
      displayName: displayName || "", // Lưu rỗng nếu không có, server sẽ tự động lấy từ profile
      appPassword: document.getElementById("appPassword")?.value || "",
      emailTo: emailToArray,
      emailSubject: document.getElementById("emailSubject")?.value || "",
      emailBody: document.getElementById("emailBody")?.value || "",
      schedule: document.getElementById("schedule")?.value || "manual",
      scheduleTime: document.getElementById("scheduleTime")?.value || "09:00",
      notes: document.getElementById("notes")?.value || "",
    };
  },

  /**
   * Validate form data
   * @param {Object} formData - Form data
   * @returns {boolean} Is valid
   */
  validateForm(formData) {
    if (!formData.name.trim()) {
      Utils.showNotification("Vui lòng nhập tên job", "error");
      return false;
    }

    if (!formData.chromeProfile.trim()) {
      Utils.showNotification("Vui lòng chọn hoặc nhập Chrome profile", "error");
      return false;
    }

    if (!formData.emailFrom.trim() || !Utils.isValidEmail(formData.emailFrom)) {
      Utils.showNotification("Vui lòng nhập email gửi hợp lệ", "error");
      return false;
    }

    // Kiểm tra appPassword: bắt buộc khi tạo mới, hoặc khi chỉnh sửa nếu chưa có
    if (!formData.appPassword || formData.appPassword.trim().length < 16) {
      // Nếu đang chỉnh sửa, kiểm tra xem job cũ có appPassword không
      if (AppState.editingJobId) {
        const existingJob = AppState.jobs.find(
          (j) => j.id === AppState.editingJobId
        );
        if (
          !existingJob ||
          !existingJob.appPassword ||
          existingJob.appPassword.trim().length < 16
        ) {
          Utils.showNotification(
            "Vui lòng nhập Gmail App Password (16 ký tự). Tạo tại: https://myaccount.google.com/apppasswords",
            "error"
          );
          return false;
        }
        // Nếu job cũ có appPassword hợp lệ, validation sẽ pass (vì đã được set trong handleSubmit)
      } else {
        // Tạo mới: bắt buộc phải có appPassword
        Utils.showNotification(
          "Vui lòng nhập Gmail App Password (16 ký tự). Tạo tại: https://myaccount.google.com/apppasswords",
          "error"
        );
        return false;
      }
    }

    if (formData.emailTo.length === 0) {
      Utils.showNotification("Vui lòng nhập ít nhất một email nhận", "error");
      return false;
    }

    if (!formData.emailSubject.trim()) {
      Utils.showNotification("Vui lòng nhập tiêu đề email", "error");
      return false;
    }

    if (!formData.emailBody.trim()) {
      Utils.showNotification("Vui lòng nhập nội dung email", "error");
      return false;
    }

    return true;
  },
};

// ============================================
// Profile Management
// ============================================
const ProfileManager = {
  /**
   * Load Chrome profiles
   */
  async loadProfiles() {
    const button = event?.target;
    if (button) {
      button.disabled = true;
      button.innerHTML = '<span class="loading"></span> Đang tải...';
    }

    try {
      const profiles = await ApiService.getProfiles();
      this.populateProfileSelect(profiles);
      Utils.showNotification(
        `Đã tải ${profiles.length} Chrome profiles!`,
        "success"
      );
    } catch (error) {
      Utils.showNotification(
        "Không thể tải Chrome profiles. Đảm bảo server Node.js đang chạy (npm start)",
        "error"
      );
    } finally {
      if (button) {
        button.disabled = false;
        button.innerHTML = "🔄 Tải Profiles";
      }
    }
  },

  /**
   * Populate profile select dropdown
   * @param {Array} profiles - Array of profiles
   */
  populateProfileSelect(profiles) {
    const select = document.getElementById("chromeProfile");
    if (!select) return;

    // Lưu giá trị đã chọn trước khi populate (nếu có)
    const currentValue = select.value || "";
    const profileCustom = document.getElementById("chromeProfileCustom");
    const currentCustomValue = profileCustom?.value || "";

    select.innerHTML = '<option value="">-- Chọn profile --</option>';

    profiles.forEach((profile) => {
      const option = document.createElement("option");
      option.value = profile.directory;
      option.dataset.email = profile.email || ""; // Lưu email vào data attribute
      option.dataset.name = profile.name || ""; // Lưu tên profile vào data attribute
      option.textContent = `${profile.name} (${profile.email || "N/A"}) - [${
        profile.directory
      }]`;
      select.appendChild(option);
    });

    // Store profiles in data attribute for later use
    select.dataset.profiles = JSON.stringify(profiles);

    // Lấy giá trị pending profile nếu có (từ populateForm khi chưa có profiles)
    const pendingProfile = select.dataset.pendingProfile || "";
    const profileToRestore = pendingProfile || currentValue || "";

    // Khôi phục giá trị đã chọn nếu có
    if (profileToRestore) {
      let profileFound = false;
      let matchedOption = null;
      const profileToRestoreLower = profileToRestore.toLowerCase();

      // Tìm profile trong dropdown (so sánh theo value/directory, name)
      for (let i = 0; i < select.options.length; i++) {
        const option = select.options[i];
        const optionValue = option.value || "";
        const optionName = option.dataset.name || "";

        // Exact match với directory
        if (
          optionValue &&
          optionValue.toLowerCase() === profileToRestoreLower
        ) {
          matchedOption = option;
          profileFound = true;
          break;
        }

        // Exact match với name
        if (optionName && optionName.toLowerCase() === profileToRestoreLower) {
          matchedOption = option;
          profileFound = true;
          break;
        }
      }

      // Nếu không tìm thấy exact match, thử partial match
      if (!profileFound) {
        for (let i = 0; i < select.options.length; i++) {
          const option = select.options[i];
          const optionValue = option.value || "";
          const optionName = option.dataset.name || "";

          // Partial match với directory
          if (
            optionValue &&
            optionValue.toLowerCase().includes(profileToRestoreLower)
          ) {
            matchedOption = option;
            profileFound = true;
            break;
          }

          // Partial match với name
          if (
            optionName &&
            optionName.toLowerCase().includes(profileToRestoreLower)
          ) {
            matchedOption = option;
            profileFound = true;
            break;
          }
        }
      }

      if (profileFound && matchedOption) {
        select.value = matchedOption.value;
        if (profileCustom) profileCustom.value = "";

        // Xóa pending profile vì đã tìm thấy
        if (pendingProfile) {
          delete select.dataset.pendingProfile;
        }

        // Tự động điền email nếu có
        const emailFromInput = document.getElementById("emailFrom");
        if (emailFromInput && matchedOption.dataset.email) {
          emailFromInput.value = matchedOption.dataset.email;
        }
      } else {
        // Nếu không tìm thấy trong dropdown, giữ trong custom input
        select.value = "";
        if (profileCustom) {
          profileCustom.value = currentCustomValue || profileToRestore;
        }
      }
    } else if (currentCustomValue) {
      // Nếu có giá trị custom, giữ lại
      if (profileCustom) profileCustom.value = currentCustomValue;
    }

    // Thêm event listener để tự động điền email khi chọn profile
    this.setupProfileChangeHandler();
  },

  /**
   * Setup event handler for profile selection change
   */
  setupProfileChangeHandler() {
    const select = document.getElementById("chromeProfile");
    const emailFromInput = document.getElementById("emailFrom");
    const profileCustomInput = document.getElementById("chromeProfileCustom");

    if (!select || !emailFromInput) return;

    // Chỉ thêm event listener một lần bằng cách kiểm tra flag
    if (select.dataset.handlerSetup === "true") {
      return; // Đã setup rồi, không setup lại
    }

    // Đánh dấu đã setup
    select.dataset.handlerSetup = "true";

    // Thêm event listener cho profile select
    select.addEventListener("change", (e) => {
      const selectedOption = e.target.options[e.target.selectedIndex];
      const selectedEmail = selectedOption?.dataset.email || "";

      // Nếu đang nhập profile custom, không tự động điền
      if (profileCustomInput && profileCustomInput.value.trim()) {
        return;
      }

      if (selectedEmail) {
        // Tự động điền email từ profile đã chọn
        emailFromInput.value = selectedEmail;
        emailFromInput.readOnly = true;
        emailFromInput.style.backgroundColor = "#f3f4f6";
        emailFromInput.style.cursor = "not-allowed";
        emailFromInput.title =
          "Email được lấy tự động từ Chrome Profile đã chọn";
      } else {
        // Nếu không có email, cho phép nhập thủ công
        emailFromInput.readOnly = false;
        emailFromInput.style.backgroundColor = "";
        emailFromInput.style.cursor = "";
        emailFromInput.title = "";
        if (!emailFromInput.value) {
          emailFromInput.value = "";
        }
      }
    });

    // Khi nhập profile custom, cho phép chỉnh sửa email
    if (profileCustomInput) {
      // Xóa listener cũ nếu có
      const newProfileCustomInput = profileCustomInput.cloneNode(true);
      profileCustomInput.parentNode.replaceChild(
        newProfileCustomInput,
        profileCustomInput
      );

      newProfileCustomInput.addEventListener("input", () => {
        if (newProfileCustomInput.value.trim()) {
          // Nếu có profile custom, cho phép chỉnh sửa email
          emailFromInput.readOnly = false;
          emailFromInput.style.backgroundColor = "";
          emailFromInput.style.cursor = "";
          emailFromInput.title = "";
        } else {
          // Nếu xóa profile custom, kiểm tra lại select
          const selectedOption = select.options[select.selectedIndex];
          const selectedEmail = selectedOption?.dataset.email || "";
          if (selectedEmail) {
            emailFromInput.value = selectedEmail;
            emailFromInput.readOnly = true;
            emailFromInput.style.backgroundColor = "#f3f4f6";
            emailFromInput.style.cursor = "not-allowed";
            emailFromInput.title =
              "Email được lấy tự động từ Chrome Profile đã chọn";
          } else {
            emailFromInput.readOnly = false;
            emailFromInput.style.backgroundColor = "";
            emailFromInput.style.cursor = "";
            emailFromInput.title = "";
          }
        }
      });
    }
  },
};

// ============================================
// Data Import/Export
// ============================================
const DataManager = {
  /**
   * Export jobs to JSON file
   */
  exportData() {
    const dataStr = JSON.stringify(AppState.jobs, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mail_jobs_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    Utils.showNotification("Đã xuất dữ liệu thành công!", "success");
  },

  /**
   * Import jobs from JSON file and save to database
   */
  async importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const importedJobs = JSON.parse(event.target.result);
          if (!Array.isArray(importedJobs)) {
            throw new Error("File không đúng định dạng");
          }

          if (
            !Utils.confirm(
              `Tìm thấy ${importedJobs.length} jobs. Bạn muốn:\n- OK: Import tất cả vào database\n- Cancel: Hủy`
            )
          ) {
            return;
          }

          AppState.isLoading = true;
          let successCount = 0;
          let errorCount = 0;

          for (const job of importedJobs) {
            try {
              // Remove id and timestamps to create new jobs
              const { id, createdAt, updatedAt, lastSent, ...jobData } = job;
              await ApiService.createJob(jobData);
              successCount++;
            } catch (error) {
              console.error(`Lỗi khi import job "${job.name}":`, error);
              errorCount++;
            }
          }

          // Reload jobs from database
          await JobManager.loadJobs();

          Utils.showNotification(
            `✅ Đã import ${successCount} jobs thành công${
              errorCount > 0 ? `, ${errorCount} jobs lỗi` : ""
            }!`,
            successCount > 0 ? "success" : "error"
          );
        } catch (error) {
          Utils.showNotification(`Lỗi: ${error.message}`, "error");
        } finally {
          AppState.isLoading = false;
        }
      };
      reader.readAsText(file);
    };
    input.click();
  },
};

// ============================================
// Event Listeners
// ============================================
const EventHandlers = {
  /**
   * Initialize all event listeners
   */
  init() {
    // Form submit
    if (DOM.form) {
      DOM.form.addEventListener("submit", (e) => ModalManager.handleSubmit(e));
    }

    // Setup profile change handler khi form được mở
    const profileSelect = document.getElementById("chromeProfile");
    if (profileSelect) {
      // Đợi một chút để đảm bảo DOM đã sẵn sàng
      setTimeout(() => {
        if (profileSelect.dataset.profiles) {
          ProfileManager.setupProfileChangeHandler();
        }
      }, 100);
    }

    // Modal close on outside click
    if (DOM.modal) {
      DOM.modal.addEventListener("click", (e) => {
        if (e.target === DOM.modal) {
          ModalManager.close();
        }
      });
    }

    // Close modal button
    const closeButton = document.getElementById("modalClose");
    if (closeButton) {
      closeButton.addEventListener("click", () => ModalManager.close());
    }

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        DOM.modal?.classList.contains("modal--active")
      ) {
        ModalManager.close();
      }
    });
  },
};

// ============================================
// Application Initialization
// ============================================
const App = {
  /**
   * Initialize application
   */
  init() {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.start());
    } else {
      this.start();
    }
  },

  /**
   * Start application
   */
  start() {
    DOM.init();
    EventHandlers.init();
    JobManager.loadJobs();
  },
};

// ============================================
// Log Modal Manager
// ============================================
const LogModalManager = {
  /**
   * Show log modal with data
   * @param {Object} logData - Log data from API
   */
  showLog(logData) {
    const modal = document.getElementById("logModal");
    const title = document.getElementById("logModalTitle");
    const content = document.getElementById("logModalContent");

    if (!modal || !title || !content) {
      console.error("Log modal elements not found");
      return;
    }

    // Set title
    title.textContent = `Log: ${logData.job_name || "Job"}`;

    // Render log content
    content.innerHTML = this.renderLogContent(logData);

    // Show modal
    modal.classList.add("modal--active");
    modal.setAttribute("aria-hidden", "false");
  },

  /**
   * Render log content HTML
   * @param {Object} logData - Log data
   * @returns {string} HTML string
   */
  renderLogContent(logData) {
    if (!logData.has_run) {
      return `<div class="log-empty">Job chưa được chạy lần nào.</div>`;
    }

    const runTime = Utils.formatDate(logData.run_time);
    const totalCount = logData.total_count || 0;
    const sentCount = logData.sent_count || 0;
    const failedCount = logData.failed_count || 0;
    const method = logData.method || "SMTP";

    // Render failed emails list
    let failedEmailsHtml = "";
    if (logData.failed_emails && logData.failed_emails.length > 0) {
      failedEmailsHtml = `
        <div class="log-section">
          <h3 class="log-section__title">Danh sách Email Lỗi (${
            logData.failed_emails.length
          })</h3>
          <div class="log-failed-emails">
            ${logData.failed_emails
              .map(
                (item, index) => `
              <div class="log-failed-item">
                <div class="log-failed-item__number">${index + 1}.</div>
                <div class="log-failed-item__content">
                  <div class="log-failed-item__email"><strong>Email:</strong> ${Utils.escapeHtml(
                    item.email || "N/A"
                  )}</div>
                  <div class="log-failed-item__error"><strong>Lỗi:</strong> ${Utils.escapeHtml(
                    item.error || "Không có thông tin"
                  )}</div>
                  ${
                    item.method
                      ? `<div class="log-failed-item__method"><strong>Phương thức:</strong> ${Utils.escapeHtml(
                          item.method
                        )}</div>`
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    } else {
      failedEmailsHtml = `
        <div class="log-section">
          <h3 class="log-section__title">Danh sách Email Lỗi</h3>
          <div class="log-empty">Không có email nào bị lỗi.</div>
        </div>
      `;
    }

    // Render errors from email_results if available
    let errorsFromResultsHtml = "";
    if (
      logData.errors &&
      Array.isArray(logData.errors) &&
      logData.errors.length > 0
    ) {
      errorsFromResultsHtml = `
        <div class="log-section">
          <h3 class="log-section__title">Chi tiết Lỗi từ Email Results</h3>
          <div class="log-errors">
            ${logData.errors
              .map(
                (error, index) => `
              <div class="log-error-item">
                <div class="log-error-item__number">${index + 1}.</div>
                <div class="log-error-item__content">
                  ${
                    error.email
                      ? `<div class="log-error-item__email"><strong>Email:</strong> ${Utils.escapeHtml(
                          error.email
                        )}</div>`
                      : ""
                  }
                  ${
                    error.error
                      ? `<div class="log-error-item__error"><strong>Lỗi:</strong> ${Utils.escapeHtml(
                          error.error
                        )}</div>`
                      : ""
                  }
                </div>
              </div>
            `
              )
              .join("")}
          </div>
        </div>
      `;
    }

    return `
      <div class="log-container">
        <div class="log-section">
          <h3 class="log-section__title">Thông tin Tổng quan</h3>
          <div class="log-info-grid">
            <div class="log-info-item">
              <strong>Thời gian chạy:</strong>
              <span>${runTime}</span>
            </div>
            <div class="log-info-item">
              <strong>Tổng số email xử lý:</strong>
              <span>${totalCount}</span>
            </div>
            <div class="log-info-item">
              <strong>Số email gửi thành công:</strong>
              <span class="log-success">${sentCount}</span>
            </div>
            <div class="log-info-item">
              <strong>Số email gửi lỗi:</strong>
              <span class="log-error">${failedCount}</span>
            </div>
            <div class="log-info-item">
              <strong>Phương thức gửi:</strong>
              <span>${method}</span>
            </div>
          </div>
        </div>
        ${failedEmailsHtml}
        ${errorsFromResultsHtml}
      </div>
    `;
  },

  /**
   * Close log modal
   */
  close() {
    const modal = document.getElementById("logModal");
    if (modal) {
      modal.classList.remove("modal--active");
      modal.setAttribute("aria-hidden", "true");
    }
  },
};

// ============================================
// Global Functions (for onclick handlers)
// ============================================
window.openAddModal = () => ModalManager.openAddModal();
window.closeModal = () => ModalManager.close();
window.loadChromeProfiles = () => ProfileManager.loadProfiles();
window.exportData = () => DataManager.exportData();
window.importData = () => DataManager.importData();

// Make managers available globally for onclick handlers
window.JobManager = JobManager;
window.ModalManager = ModalManager;
window.LogModalManager = LogModalManager;

// Initialize app
App.init();
