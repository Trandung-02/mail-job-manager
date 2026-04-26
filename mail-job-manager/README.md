# 📧 Mail Job Manager

Ứng dụng quản lý job gửi mail tự động sử dụng Gmail SMTP. Được xây dựng với Clean Code Architecture, Modern UI/UX và Best Practices.

## ✨ Tính năng

- ✅ Quản lý nhiều job gửi mail
- ✅ Tự động lấy danh sách Chrome profiles từ máy tính
- ✅ Gửi mail tự động qua SMTP (Gmail) với Nodemailer
- ✅ Hỗ trợ danh sách người nhận nhiều email
- ✅ Nội dung email tùy biến
- ✅ Lưu trữ dữ liệu local (localStorage)
- ✅ Xuất/Nhập dữ liệu JSON
- ✅ Responsive design (Mobile, Tablet, Desktop)
- ✅ Modern UI/UX với Design System
- ✅ Clean Code Architecture
- ✅ Error handling tốt

## 🏗️ Kiến trúc & Công nghệ

### Frontend
- **HTML5 Semantic**: Cấu trúc HTML rõ ràng, accessible
- **CSS3 Modern**: Design System với CSS Variables, BEM Methodology
- **Vanilla JavaScript**: ES6+ Modules, Clean Code Pattern
- **Responsive Design**: Mobile-first approach

### Backend
- **Node.js**: Express.js framework
- **Nodemailer**: SMTP email sending
- **Clean Architecture**: Separation of concerns, modular design

## 🚀 Cài đặt

### 1. Cài đặt Node.js

Đảm bảo bạn đã cài đặt Node.js (phiên bản 14 trở lên). Tải tại: https://nodejs.org/

### 2. Cài đặt dependencies

Mở terminal/command prompt trong thư mục dự án và chạy:

```bash
npm install
```

### 3. Chạy ứng dụng

```bash
npm start
```

Server sẽ chạy tại `http://localhost:3000`

Mở trình duyệt và truy cập: `http://localhost:3000/index.html`

## 📖 Hướng dẫn sử dụng

### Tạo Gmail App Password (Bắt buộc)

Trước khi sử dụng, bạn cần tạo Gmail App Password:

1. Vào https://myaccount.google.com/apppasswords
2. Đảm bảo đã bật **2-Step Verification** trong tài khoản Google
3. Chọn **"Mail"** và **"Other (Custom name)"**
4. Nhập tên: "Mail Job Manager"
5. Click **"Generate"**
6. Copy App Password (16 ký tự, có dấu cách - bỏ dấu cách khi nhập)

### Tạo Job mới

1. Click nút **"➕ Thêm Job Mới"**
2. Điền thông tin:
   - **Tên Job**: Tên mô tả cho job
   - **Chrome Profile**: 
     - Click **"🔄 Tải Profiles"** để lấy danh sách profiles từ Chrome
     - Chọn profile từ dropdown hoặc nhập tên profile tùy chỉnh
   - **Email Gửi**: Email sẽ được sử dụng để gửi (tự động lấy từ Chrome Profile)
   - **Gmail App Password**: Nhập App Password đã tạo (16 ký tự, không có dấu cách)
   - **Danh Sách Email Nhận**: Nhập danh sách email, cách nhau bởi dấu phẩy hoặc xuống dòng
   - **Tiêu Đề Email**: Tiêu đề của email
   - **Nội Dung Email**: Nội dung email
   - **Lịch Gửi**: Chọn lịch gửi (hiện tại chỉ hỗ trợ gửi thủ công)
   - **Ghi Chú**: Ghi chú tùy chọn
3. Click **"Lưu Job"**

### Chạy Job

1. Tìm job bạn muốn chạy trong danh sách
2. Click nút **"▶ Chạy"**
3. Hệ thống sẽ tự động gửi mail qua SMTP đến tất cả email trong danh sách
4. Không cần mở browser, gửi trực tiếp qua SMTP

### Quản lý Job

- **⏸ Dừng/Kích hoạt**: Tạm dừng hoặc kích hoạt job
- **✏ Sửa**: Chỉnh sửa thông tin job
- **🗑 Xóa**: Xóa job

### Xuất/Nhập dữ liệu

- **📥 Xuất Dữ Liệu**: Tải file JSON chứa tất cả jobs
- **📤 Nhập Dữ Liệu**: Tải lên file JSON để khôi phục jobs

## ⚠️ Lưu ý quan trọng

1. **Chrome Profiles**: 
   - Ứng dụng sẽ tự động tìm Chrome profiles trong thư mục mặc định
   - Trên Windows: `C:\Users\[TênUser]\AppData\Local\Google\Chrome\User Data`
   - Trên macOS: `~/Library/Application Support/Google/Chrome`
   - Trên Linux: `~/.config/google-chrome`
   - Đảm bảo Chrome đã được đăng nhập Gmail trong profile bạn muốn sử dụng

2. **Gửi Mail**:
   - Ứng dụng sử dụng Nodemailer với Gmail SMTP để gửi email
   - Không cần mở browser, gửi trực tiếp qua SMTP
   - Cần Gmail App Password (không phải mật khẩu thông thường)
   - Tốc độ gửi: ~1 giây/email
   - Đảm bảo đã bật 2-Step Verification trong Gmail

3. **Bảo mật**:
   - Dữ liệu được lưu local trên máy tính của bạn
   - Không có dữ liệu nào được gửi lên server bên ngoài

4. **Giới hạn Gmail**:
   - Gmail có giới hạn số lượng email gửi trong ngày
   - Khuyến nghị: Không gửi quá 100-200 email/ngày từ một tài khoản

## 🛠️ Cấu trúc dự án

```
mail-job-manager/
├── src/                    # Source code (Modular Architecture)
│   ├── config/             # Configuration
│   │   ├── index.js        # Main config
│   │   └── database.js     # Database config
│   ├── controllers/        # Business logic
│   │   └── jobController.js
│   ├── services/           # Service layer
│   │   └── databaseService.js  # Database operations (optimized)
│   ├── routes/             # API routes
│   │   └── jobRoutes.js
│   ├── middlewares/        # Express middlewares
│   │   ├── errorHandler.js
│   │   ├── asyncHandler.js
│   │   ├── validation.js
│   │   └── cors.js
│   └── utils/              # Utilities
│       ├── logger.js       # Centralized logging
│       ├── emailValidator.js
│       └── fileUtils.js
├── index.html              # Giao diện web chính
├── assets/                 # Frontend assets
│   ├── css/
│   │   └── main.css
│   └── js/
│       └── app.js
├── server.js               # Server entry point (có thể migrate sang src/)
├── database.js             # Database connection (legacy, có thể migrate)
├── schema.sql              # Database schema
├── package.json            # Dependencies
├── OPTIMIZATION_SUMMARY.md # Báo cáo tối ưu
├── MIGRATION_GUIDE.md      # Hướng dẫn migration
└── README.md               # Tài liệu này
```

### 📚 Tài Liệu
- `OPTIMIZATION_SUMMARY.md`: Báo cáo chi tiết các cải tiến đã thực hiện
- `MIGRATION_GUIDE.md`: Hướng dẫn migration từ code cũ sang architecture mới
- `EXAMPLE_INTEGRATION.js`: Ví dụ cách tích hợp các module mới

## 🎨 Design System

Ứng dụng sử dụng Design System với:

- **CSS Variables**: Màu sắc, spacing, typography được định nghĩa tập trung
- **BEM Methodology**: Naming convention rõ ràng cho CSS classes
- **Responsive Breakpoints**: Mobile (480px), Tablet (768px), Desktop (1200px+)
- **Modern UI Elements**: Shadows, gradients, transitions, animations

## 📝 Code Quality

### Frontend
- ✅ Semantic HTML5
- ✅ BEM CSS Methodology
- ✅ ES6+ JavaScript
- ✅ Module Pattern
- ✅ Error Handling
- ✅ Accessibility (ARIA labels)
- ✅ Responsive Design

### Backend
- ✅ Clean Code Architecture
- ✅ Separation of Concerns
- ✅ Error Handling Middleware
- ✅ Input Validation
- ✅ Async/Await Pattern
- ✅ Graceful Shutdown

## 🐛 Xử lý lỗi

### Không tìm thấy Chrome profiles
- Đảm bảo Chrome đã được cài đặt
- Kiểm tra đường dẫn Chrome profiles trong code nếu cần
- Đảm bảo Chrome đã được sử dụng ít nhất một lần để tạo profile

### Không thể gửi mail
- Đảm bảo đã tạo Gmail App Password đúng cách
- Kiểm tra App Password có 16 ký tự (không có dấu cách)
- Đảm bảo đã bật 2-Step Verification trong Gmail
- Kiểm tra kết nối internet
- Xem console log để biết lỗi chi tiết
- Thử tạo App Password mới nếu vẫn lỗi

### Server không chạy
- Đảm bảo đã cài đặt dependencies: `npm install`
- Kiểm tra port 3000 có bị chiếm dụng không
- Thử đổi PORT bằng biến môi trường: `PORT=3001 npm start`

### Lỗi SMTP
- Kiểm tra App Password đúng (16 ký tự, không có dấu cách)
- Đảm bảo đã bật 2-Step Verification
- Kiểm tra email gửi đúng định dạng
- Xem console log để biết lỗi chi tiết từ SMTP server

## 🔧 Development

### Cấu trúc Code

**Frontend (app.js)**:
- `AppState`: Quản lý state
- `StorageService`: LocalStorage operations
- `ApiService`: API calls
- `JobManager`: Job CRUD operations
- `ModalManager`: Modal handling
- `ProfileManager`: Chrome profiles
- `DataManager`: Import/Export
- `Utils`: Utility functions

**Backend (server.js)**:
- `Utils`: Utility functions
- `ProfileService`: Chrome profile operations
- `EmailService`: Email sending logic
- Express routes và middleware

### Thêm tính năng mới

1. **Frontend**: Thêm function vào module tương ứng trong `app.js`
2. **Backend**: Thêm route mới trong `server.js` hoặc service mới
3. **Styling**: Thêm styles theo BEM trong `main.css`

## 📄 License

MIT

## 👨‍💻 Tác giả

Mail Job Manager - Clean Code Edition

---

**Lưu ý**: Đây là công cụ tự động hóa. Hãy sử dụng có trách nhiệm và tuân thủ các quy định của Gmail về gửi email hàng loạt.
