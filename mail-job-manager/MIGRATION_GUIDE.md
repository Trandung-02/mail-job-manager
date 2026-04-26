# 🔄 Hướng Dẫn Migration Sang Architecture Mới

## 📋 Tổng Quan

Tài liệu này hướng dẫn cách migrate từ code cũ (monolithic) sang architecture mới (modular) một cách an toàn và từng bước.

---

## 🎯 Lợi Ích Của Architecture Mới

1. **Hiệu năng tốt hơn**: Batch queries thay vì N+1 queries
2. **Code dễ maintain**: Separation of concerns rõ ràng
3. **Dễ test**: Các module độc lập
4. **Dễ mở rộng**: Thêm features mới dễ dàng
5. **Error handling tốt hơn**: Centralized và consistent

---

## 📝 Bước 1: Sử Dụng Route Mới (Không Ảnh Hưởng Code Cũ)

### Trong `server.js`, thêm route mới:

```javascript
// Thêm ở đầu file
const jobRoutes = require("./src/routes/jobRoutes");

// Thay thế route cũ bằng route mới (hoặc giữ cả hai để test)
app.use("/api/jobs", jobRoutes);  // Route mới (optimized)

// Hoặc giữ route cũ với prefix khác để test
// app.use("/api/jobs-new", jobRoutes);
```

### So sánh Route Cũ vs Mới:

#### ❌ Route Cũ (N+1 queries):
```javascript
app.get("/api/jobs", async (req, res, next) => {
  const result = await query("SELECT * FROM jobs ORDER BY created_at DESC");
  const jobs = await Promise.all(
    result.rows.map(async (job) => {
      const emailFrom = await DatabaseHelper.getJobEmails(job.id, "from");
      const emailTo = await DatabaseHelper.getJobEmails(job.id, "to");
      // ... 4 queries per job
    })
  );
});
```

#### ✅ Route Mới (Batch query):
```javascript
// Trong src/controllers/jobController.js
async getAllJobs(req, res, next) {
  const result = await query("SELECT * FROM jobs ORDER BY created_at DESC");
  const jobIds = result.rows.map((job) => job.id);
  const jobEmailsMap = await DatabaseService.getJobEmailsBatch(jobIds); // 1 query
  // ...
}
```

---

## 📝 Bước 2: Migrate GET /api/jobs

### Option A: Thay Thế Trực Tiếp

Trong `server.js`, tìm và thay thế:

```javascript
// CŨ
app.get("/api/jobs", async (req, res, next) => {
  // ... code cũ với N+1 queries
});

// MỚI
const JobController = require("./src/controllers/jobController");
const asyncHandler = require("./src/middlewares/asyncHandler");

app.get("/api/jobs", asyncHandler(JobController.getAllJobs));
```

### Option B: Sử Dụng Router (Recommended)

```javascript
const jobRoutes = require("./src/routes/jobRoutes");
app.use("/api/jobs", jobRoutes);
```

---

## 📝 Bước 3: Migrate Các Route Khác

### Từng Route Một:

```javascript
// Thay thế
app.get("/api/jobs/:id", async (req, res, next) => {
  // code cũ
});

// Bằng
app.get("/api/jobs/:id", 
  validateJobId, 
  asyncHandler(JobController.getJobById)
);
```

---

## 📝 Bước 4: Sử Dụng Logger Mới

### Thay thế console.log:

```javascript
// CŨ
console.log("✅ Đã lưu job");
console.error("❌ Lỗi:", error);

// MỚI
const logger = require("./src/utils/logger");

logger.success("Đã lưu job");
logger.error("Lỗi:", error);
logger.info("Thông tin");
logger.debug("Debug info");
```

---

## 📝 Bước 5: Sử Dụng Error Handler Mới

### Thêm vào server.js:

```javascript
const errorHandler = require("./src/middlewares/errorHandler");

// Đặt ở cuối, sau tất cả routes
app.use(errorHandler);
```

### Bỏ error handler cũ:

```javascript
// XÓA
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ success: false, error: err.message });
});

// DÙNG MỚI
app.use(errorHandler);
```

---

## 📝 Bước 6: Sử Dụng Database Service Mới

### Thay thế DatabaseHelper:

```javascript
// CŨ
const { DatabaseHelper } = require("./server"); // Nếu export

// MỚI
const DatabaseService = require("./src/services/databaseService");

// Sử dụng
const emails = await DatabaseService.getJobEmails(jobId, "to");
const emailsMap = await DatabaseService.getJobEmailsBatch([1, 2, 3]);
```

---

## 📝 Bước 7: Sử Dụng Validation Middleware

### Thêm validation cho routes:

```javascript
const { validateJob, validateJobId } = require("./src/middlewares/validation");

// POST /api/jobs
app.post("/api/jobs", validateJob, asyncHandler(JobController.createJob));

// GET /api/jobs/:id
app.get("/api/jobs/:id", validateJobId, asyncHandler(JobController.getJobById));
```

---

## 🧪 Testing Migration

### 1. Test Route Mới Song Song Với Route Cũ:

```javascript
// Giữ route cũ
app.get("/api/jobs", oldHandler);

// Thêm route mới với prefix
app.use("/api/jobs-v2", jobRoutes);

// Test cả hai, so sánh kết quả
```

### 2. Test Performance:

```javascript
// Measure response time
console.time("GET /api/jobs");
// ... request
console.timeEnd("GET /api/jobs");

// Nên thấy cải thiện đáng kể với nhiều jobs
```

### 3. Test Database Queries:

```javascript
// Enable query logging trong database.js
// So sánh số lượng queries trước và sau
```

---

## ⚠️ Lưu Ý Quan Trọng

1. **Backup**: Luôn backup code và database trước khi migrate
2. **Test Kỹ**: Test từng bước một, không migrate tất cả cùng lúc
3. **Giữ Code Cũ**: Giữ code cũ trong comment để có thể rollback
4. **Monitor**: Theo dõi logs và errors sau khi migrate
5. **Performance**: Đo lường performance trước và sau

---

## 🔄 Rollback Plan

Nếu có vấn đề, rollback bằng cách:

1. Restore code cũ từ git
2. Hoặc comment route mới, uncomment route cũ
3. Restart server

```javascript
// Rollback
// app.use("/api/jobs", jobRoutes); // Comment
app.get("/api/jobs", oldHandler);   // Uncomment
```

---

## ✅ Checklist Migration

- [ ] Backup code và database
- [ ] Test route mới song song với route cũ
- [ ] Migrate GET /api/jobs
- [ ] Test và verify
- [ ] Migrate GET /api/jobs/:id
- [ ] Test và verify
- [ ] Migrate POST /api/jobs
- [ ] Test và verify
- [ ] Migrate PUT /api/jobs/:id
- [ ] Test và verify
- [ ] Migrate DELETE /api/jobs/:id
- [ ] Test và verify
- [ ] Thay thế tất cả console.log bằng logger
- [ ] Thêm error handler mới
- [ ] Xóa code cũ
- [ ] Final testing
- [ ] Deploy

---

## 📞 Hỗ Trợ

Nếu gặp vấn đề trong quá trình migration:
1. Kiểm tra logs
2. So sánh code cũ và mới
3. Test từng phần một
4. Tham khảo `OPTIMIZATION_SUMMARY.md`

