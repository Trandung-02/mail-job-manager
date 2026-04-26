-- Migration: Thêm cột page_name vào job_emails (Tên Page cho mỗi email nhận)
-- Chạy trong PostgreSQL: \i migration_add_page_name.sql

ALTER TABLE job_emails
ADD COLUMN IF NOT EXISTS page_name VARCHAR(255) DEFAULT NULL;

COMMENT ON COLUMN job_emails.page_name IS 'Tên Page tương ứng với email nhận (type=to), dùng thay thế [Name] trong tiêu đề và nội dung email';
