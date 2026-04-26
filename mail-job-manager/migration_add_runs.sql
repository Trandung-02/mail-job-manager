-- Migration script: Thêm bảng runs và sent_emails
-- Chạy script này để cập nhật schema với tính năng tracking runs và tránh gửi trùng email
-- 
-- Tính năng mới:
-- 1. Bảng runs: Lưu mỗi lần chạy job (thời gian chạy, job_id, email_from_id)
-- 2. Bảng sent_emails: Lưu các email đã gửi thành công, đảm bảo không gửi lại trong cùng job
-- 3. Cập nhật failed_emails: Thêm run_id để liên kết với runs

BEGIN;

-- 1. Tạo bảng runs để lưu mỗi lần chạy job
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

-- 2. Tạo bảng sent_emails để lưu các email đã gửi thành công
-- UNIQUE constraint (job_id, email_id) đảm bảo trong cùng job, mỗi email chỉ gửi thành công 1 lần
CREATE TABLE IF NOT EXISTS sent_emails (
    id SERIAL PRIMARY KEY,
    run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    email_id INTEGER NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(job_id, email_id) -- Đảm bảo trong cùng job, mỗi email chỉ gửi thành công 1 lần
);

-- 3. Thêm cột run_id vào bảng failed_emails (nếu chưa có) và cho phép email_id NULL
DO $$
BEGIN
    -- Thêm run_id nếu chưa có
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'failed_emails' AND column_name = 'run_id'
    ) THEN
        ALTER TABLE failed_emails ADD COLUMN run_id INTEGER REFERENCES runs(id) ON DELETE CASCADE;
    END IF;
    
    -- Cho phép email_id NULL để lưu email không hợp lệ (chỉ thực hiện nếu column có NOT NULL)
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'failed_emails' 
          AND column_name = 'email_id'
          AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE failed_emails ALTER COLUMN email_id DROP NOT NULL;
    END IF;
END $$;

-- 4. Tạo index cho runs
CREATE INDEX IF NOT EXISTS idx_runs_job_id ON runs(job_id);
CREATE INDEX IF NOT EXISTS idx_runs_email_from_id ON runs(email_from_id);
CREATE INDEX IF NOT EXISTS idx_runs_started_at ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_job_id_started_at ON runs(job_id, started_at DESC);

-- 5. Tạo index cho sent_emails (quan trọng cho query kiểm tra email đã gửi)
CREATE INDEX IF NOT EXISTS idx_sent_emails_run_id ON sent_emails(run_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_job_id ON sent_emails(job_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_email_id ON sent_emails(email_id);
CREATE INDEX IF NOT EXISTS idx_sent_emails_job_email ON sent_emails(job_id, email_id);

-- 6. Tạo index cho failed_emails.run_id (nếu cột mới được thêm)
CREATE INDEX IF NOT EXISTS idx_failed_emails_run_id ON failed_emails(run_id);

-- 7. (Tùy chọn) Migrate dữ liệu từ email_results sang runs nếu có
-- Nếu bạn muốn giữ lại lịch sử, có thể chạy migration này
-- Lưu ý: Cần email_from_id từ job_emails
DO $$
DECLARE
    result_record RECORD;
    email_from_id_val INTEGER;
BEGIN
    -- Chỉ migrate nếu có dữ liệu trong email_results và chưa có trong runs
    IF EXISTS (SELECT 1 FROM email_results LIMIT 1) 
       AND NOT EXISTS (SELECT 1 FROM runs LIMIT 1) THEN
        
        FOR result_record IN 
            SELECT er.*, je.email_id as from_email_id
            FROM email_results er
            LEFT JOIN job_emails je ON je.job_id = er.job_id AND je.type = 'from'
            WHERE je.email_id IS NOT NULL
            ORDER BY er.created_at
        LOOP
            -- Tạo run từ email_results
            INSERT INTO runs (
                job_id, 
                email_from_id, 
                started_at, 
                completed_at,
                status, 
                method, 
                sent_count, 
                total_count, 
                failed_count, 
                errors,
                created_at
            )
            VALUES (
                result_record.job_id,
                result_record.from_email_id,
                result_record.created_at,
                result_record.created_at, -- Giả sử completed_at = created_at
                'completed',
                result_record.method,
                result_record.sent_count,
                result_record.total_count,
                result_record.failed_count,
                result_record.errors,
                result_record.created_at
            );
        END LOOP;
    END IF;
END $$;

COMMIT;

-- Sau khi migration thành công, bạn có thể:
-- 1. Cập nhật code để sử dụng bảng runs thay vì email_results
-- 2. Khi chạy job, tạo record trong runs và sent_emails
-- 3. Query sent_emails để kiểm tra email nào đã gửi thành công trong job đó

