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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, email_id, type) -- Đảm bảo không trùng lặp
);

-- Bảng lưu trữ kết quả gửi email
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

-- Bảng lưu trữ email thất bại
CREATE TABLE IF NOT EXISTS failed_emails (
    id SERIAL PRIMARY KEY,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE,
    error TEXT NOT NULL,
    method VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tạo index để tăng tốc truy vấn
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_email_results_job_id ON email_results(job_id);
CREATE INDEX IF NOT EXISTS idx_emails_email ON emails(email);
CREATE INDEX IF NOT EXISTS idx_job_emails_job_id ON job_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_job_emails_email_id ON job_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_job_emails_type ON job_emails(type);
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

CREATE TRIGGER update_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

