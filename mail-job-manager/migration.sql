-- Migration script: Chuyển đổi từ cấu trúc cũ sang cấu trúc mới
-- Chạy script này sau khi đã tạo schema mới để migrate dữ liệu

-- Bước 1: Tạo bảng emails và job_emails nếu chưa có (từ schema.sql)
-- Bước 2: Chạy các lệnh migration dưới đây

BEGIN;

-- 1. Migrate email_from từ jobs sang emails và job_emails
INSERT INTO emails (email)
SELECT DISTINCT email_from
FROM jobs
WHERE email_from IS NOT NULL AND email_from != ''
ON CONFLICT (email) DO NOTHING;

INSERT INTO job_emails (job_id, email_id, type)
SELECT j.id, e.id, 'from'
FROM jobs j
INNER JOIN emails e ON e.email = j.email_from
WHERE j.email_from IS NOT NULL AND j.email_from != ''
ON CONFLICT (job_id, email_id, type) DO NOTHING;

-- 2. Migrate email_to từ jobs (JSON array) sang emails và job_emails
-- Parse JSON array và insert từng email
DO $$
DECLARE
    job_record RECORD;
    email_item TEXT;
    email_array TEXT[];
    email_id_val INTEGER;
BEGIN
    FOR job_record IN SELECT id, email_to FROM jobs WHERE email_to IS NOT NULL AND email_to != '' LOOP
        -- Parse JSON array
        BEGIN
            email_array := ARRAY(SELECT json_array_elements_text(job_record.email_to::json));
        EXCEPTION WHEN OTHERS THEN
            -- Nếu không phải JSON hợp lệ, thử parse như string đơn giản
            email_array := string_to_array(trim(both '"' from job_record.email_to), ',');
        END;
        
        -- Insert từng email vào bảng emails và job_emails
        FOREACH email_item IN ARRAY email_array LOOP
            email_item := trim(email_item);
            IF email_item != '' THEN
                -- Insert vào emails (ignore nếu đã tồn tại)
                INSERT INTO emails (email) VALUES (email_item)
                ON CONFLICT (email) DO NOTHING
                RETURNING id INTO email_id_val;
                
                -- Lấy email_id nếu chưa có
                IF email_id_val IS NULL THEN
                    SELECT id INTO email_id_val FROM emails WHERE email = email_item;
                END IF;
                
                -- Insert vào job_emails
                IF email_id_val IS NOT NULL THEN
                    INSERT INTO job_emails (job_id, email_id, type)
                    VALUES (job_record.id, email_id_val, 'to')
                    ON CONFLICT (job_id, email_id, type) DO NOTHING;
                END IF;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- 3. Migrate failed_emails từ email (VARCHAR) sang email_id
-- Trước tiên, insert các email từ failed_emails vào bảng emails
INSERT INTO emails (email)
SELECT DISTINCT email
FROM failed_emails
WHERE email IS NOT NULL AND email != ''
ON CONFLICT (email) DO NOTHING;

-- Cập nhật failed_emails: thêm cột email_id nếu chưa có
DO $$
BEGIN
    -- Kiểm tra xem cột email_id đã tồn tại chưa
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'failed_emails' AND column_name = 'email_id'
    ) THEN
        -- Thêm cột email_id
        ALTER TABLE failed_emails ADD COLUMN email_id INTEGER REFERENCES emails(id) ON DELETE CASCADE;
        
        -- Cập nhật email_id từ email
        UPDATE failed_emails fe
        SET email_id = e.id
        FROM emails e
        WHERE fe.email = e.email AND fe.email_id IS NULL;
    END IF;
END $$;

COMMIT;

-- Sau khi migration xong, có thể xóa các cột cũ (tùy chọn, nên backup trước)
-- ALTER TABLE jobs DROP COLUMN IF EXISTS email_from;
-- ALTER TABLE jobs DROP COLUMN IF EXISTS email_to;
-- ALTER TABLE failed_emails DROP COLUMN IF EXISTS email;

