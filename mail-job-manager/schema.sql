-- Schema cho Mail Manager Database
-- Chạy file này trong PostgreSQL để tạo bảng

-- Bảng lưu trữ thông tin email (tập trung)
CREATE TABLE IF NOT EXISTS emails (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu trữ thông tin jobs
CREATE TABLE IF NOT EXISTS jobs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    chrome_profile VARCHAR(255),
    display_name VARCHAR(255), -- Tên hiển thị khi gửi mail (ưu tiên hơn chrome_profile)
    email_subject VARCHAR(500) NOT NULL,
    email_body TEXT NOT NULL,
    schedule VARCHAR(50) DEFAULT 'manual',
    schedule_time TIME DEFAULT '09:00:00',
    notes TEXT,
    status VARCHAR(50) DEFAULT 'active',
    app_password VARCHAR(255), -- Gmail App Password (có thể để NULL)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_sent TIMESTAMP
);

-- Bảng liên kết jobs và emails (many-to-many với type)
CREATE TABLE IF NOT EXISTS job_emails (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL DEFAULT 'to', -- 'from', 'to', 'cc', 'bcc'
    page_name VARCHAR(255) DEFAULT NULL, -- Tên Page cho email nhận (type='to'), thay thế [Name] khi gửi
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, email_id, type) -- Đảm bảo không trùng lặp
);

-- Bảng lưu trữ mỗi lần chạy job (run)
CREATE TABLE IF NOT EXISTS runs (
    id SERIAL PRIMARY KEY,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    email_from_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed', 'cancelled'
    method VARCHAR(50), -- 'Gmail API' hoặc 'SMTP'
    sent_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    errors TEXT, -- Lưu dạng JSON array
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu trữ các email đã gửi thành công
-- Đảm bảo trong cùng một job, mỗi email_to chỉ được gửi thành công 1 lần
CREATE TABLE IF NOT EXISTS sent_emails (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, email_id) -- Đảm bảo trong cùng job, mỗi email chỉ gửi thành công 1 lần
);

-- Bảng lưu trữ email thất bại (cập nhật để liên kết với runs)
-- email_id có thể NULL để lưu các email không hợp lệ (không thể lưu vào bảng emails)
CREATE TABLE IF NOT EXISTS failed_emails (
    id SERIAL PRIMARY KEY,
    run_id INTEGER REFERENCES runs(id) ON DELETE CASCADE,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE,
    error TEXT NOT NULL, -- Lưu error message, có thể chứa email không hợp lệ
    method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Bảng lưu trữ kết quả gửi email (giữ lại để tương thích ngược)
-- Khuyến nghị: Sử dụng bảng 'runs' thay thế
CREATE TABLE IF NOT EXISTS email_results (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    sent_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    method VARCHAR(50), -- 'Gmail API' hoặc 'SMTP'
    errors TEXT, -- Lưu dạng JSON array
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tạo index để tăng tốc truy vấn
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_results_job_id ON email_results(job_id);
CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email);

-- Index cho job_emails
CREATE INDEX IF NOT EXISTS idx_job_emails_job_id ON job_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_job_emails_email_id ON job_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_job_emails_type ON job_emails(type);

-- Index cho runs
CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);
CREATE INDEX IF NOT EXISTS idx_runs_email_from_id ON runs(email_from_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_job_id_started_at ON runs(job_id, started_at DESC);

-- Index cho sent_emails (quan trọng cho query kiểm tra email đã gửi)
CREATE INDEX IF NOT EXISTS idx_sent_emails_run_id ON sent_emails(run_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_job_id ON sent_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_email_id ON sent_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_job_email ON sent_emails(job_id, email_id);

-- Index cho failed_emails
CREATE INDEX IF NOT EXISTS idx_failed_emails_run_id ON failed_emails(run_id);
CREATE INDEX IF NOT EXISTS idx_failed_emails_job_id ON failed_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_failed_emails_email_id ON failed_emails(email_id);

-- Trigger để tự động cập nhật updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- EXECUTE PROCEDURE tương thích PostgreSQL 10+; dùng EXECUTE FUNCTION nếu dùng PostgreSQL 11+
CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

