-- Migration: Thêm cột display_name vào bảng jobs
-- Chạy file này trong PostgreSQL để thêm cột display_name

-- Thêm cột display_name vào bảng jobs (nếu chưa có)
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS display_name VARCHAR(255);

-- Comment cho cột
COMMENT ON COLUMN jobs.display_name IS 'Tên hiển thị khi gửi mail (ưu tiên hơn chrome_profile)';

