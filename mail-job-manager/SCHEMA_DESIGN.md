# Thiết Kế Schema Mới - Mail Job Manager

## Tổng Quan

Schema đã được tái cấu trúc để hỗ trợ tracking mỗi lần chạy job và đảm bảo không gửi trùng email trong cùng một job.

## Cấu Trúc Bảng

### 1. Bảng `runs`
Lưu trữ mỗi lần chạy job.

**Các trường:**
- `id`: Primary key
- `job_id`: Foreign key đến `jobs(id)`
- `email_from_id`: Foreign key đến `emails(id)` - email được dùng để gửi
- `started_at`: Thời gian bắt đầu chạy
- `completed_at`: Thời gian hoàn thành (NULL nếu đang chạy)
- `status`: Trạng thái ('running', 'completed', 'failed', 'cancelled')
- `method`: Phương thức gửi ('Gmail API' hoặc 'SMTP')
- `sent_count`: Số email gửi thành công
- `total_count`: Tổng số email cần gửi
- `failed_count`: Số email gửi thất bại
- `errors`: JSON array chứa các lỗi (nếu có)

### 2. Bảng `sent_emails`
Lưu trữ các email đã gửi thành công. **Quan trọng:** Constraint `UNIQUE(job_id, email_id)` đảm bảo trong cùng một job, mỗi email chỉ được gửi thành công 1 lần.

**Các trường:**
- `id`: Primary key
- `run_id`: Foreign key đến `runs(id)`
- `job_id`: Foreign key đến `jobs(id)` - để dễ query
- `email_id`: Foreign key đến `emails(id)` - email đã gửi thành công
- `sent_at`: Thời gian gửi

**Constraint:** `UNIQUE(job_id, email_id)` - Đảm bảo không gửi trùng email trong cùng job

### 3. Bảng `failed_emails` (đã cập nhật)
Lưu trữ các email gửi thất bại. Đã thêm trường `run_id` để liên kết với runs.

**Các trường:**
- `id`: Primary key
- `run_id`: Foreign key đến `runs(id)` (mới thêm)
- `job_id`: Foreign key đến `jobs(id)`
- `email_id`: Foreign key đến `emails(id)`
- `error`: Thông tin lỗi
- `method`: Phương thức gửi
- `created_at`: Thời gian tạo record

## Logic Hoạt Động

### Khi chạy một job:

1. **Tạo record trong `runs`:**
   ```sql
   INSERT INTO runs (job_id, email_from_id, status, method)
   VALUES ($1, $2, 'running', $3)
   RETURNING id;
   ```

2. **Lấy danh sách email cần gửi (bỏ qua email đã gửi thành công):**
   ```sql
   SELECT je.email_id, e.email
   FROM job_emails je
   INNER JOIN emails e ON e.id = je.email_id
   WHERE je.job_id = $1 
     AND je.type = 'to'
     AND je.email_id NOT IN (
       SELECT email_id 
       FROM sent_emails 
       WHERE job_id = $1
     );
   ```

3. **Sau khi gửi thành công một email:**
   ```sql
   INSERT INTO sent_emails (run_id, job_id, email_id)
   VALUES ($1, $2, $3)
   ON CONFLICT (job_id, email_id) DO NOTHING;
   ```

4. **Sau khi gửi thất bại một email:**
   ```sql
   INSERT INTO failed_emails (run_id, job_id, email_id, error, method)
   VALUES ($1, $2, $3, $4, $5);
   ```

5. **Cập nhật trạng thái run khi hoàn thành:**
   ```sql
   UPDATE runs
   SET status = 'completed',
       completed_at = CURRENT_TIMESTAMP,
       sent_count = $1,
       total_count = $2,
       failed_count = $3,
       errors = $4
   WHERE id = $5;
   ```

## Ví Dụ Query

### Lấy danh sách runs của một job:
```sql
SELECT r.*, e.email as email_from
FROM runs r
INNER JOIN emails e ON e.id = r.email_from_id
WHERE r.job_id = $1
ORDER BY r.started_at DESC;
```

### Lấy danh sách email đã gửi thành công trong một job:
```sql
SELECT se.*, e.email
FROM sent_emails se
INNER JOIN emails e ON e.id = se.email_id
WHERE se.job_id = $1
ORDER BY se.sent_at DESC;
```

### Lấy danh sách email chưa được gửi trong một job:
```sql
SELECT je.email_id, e.email
FROM job_emails je
INNER JOIN emails e ON e.id = je.email_id
WHERE je.job_id = $1
  AND je.type = 'to'
  AND je.email_id NOT IN (
    SELECT email_id 
    FROM sent_emails 
    WHERE job_id = $1
  );
```

### Lấy thống kê của một job:
```sql
SELECT 
  j.id,
  j.name,
  COUNT(DISTINCT r.id) as total_runs,
  COUNT(DISTINCT se.email_id) as unique_emails_sent,
  COUNT(DISTINCT fe.email_id) as unique_emails_failed,
  SUM(r.sent_count) as total_sent,
  SUM(r.failed_count) as total_failed
FROM jobs j
LEFT JOIN runs r ON r.job_id = j.id
LEFT JOIN sent_emails se ON se.job_id = j.id
LEFT JOIN failed_emails fe ON fe.job_id = j.id
WHERE j.id = $1
GROUP BY j.id, j.name;
```

## Migration

Để cập nhật database hiện có, chạy file `migration_add_runs.sql`:

```bash
psql -U username -d database_name -f migration_add_runs.sql
```

File migration sẽ:
1. Tạo bảng `runs`
2. Tạo bảng `sent_emails`
3. Thêm cột `run_id` vào bảng `failed_emails` (nếu chưa có)
4. Tạo các index cần thiết
5. (Tùy chọn) Migrate dữ liệu từ `email_results` sang `runs`

## Lưu Ý

- Bảng `email_results` vẫn được giữ lại để tương thích ngược, nhưng khuyến nghị sử dụng bảng `runs` thay thế.
- Constraint `UNIQUE(job_id, email_id)` trong `sent_emails` đảm bảo logic không gửi trùng email.
- Email gửi thất bại có thể được thử lại ở lần chạy sau (vì chỉ lưu email thành công trong `sent_emails`).

