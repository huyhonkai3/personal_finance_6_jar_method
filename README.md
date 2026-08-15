# Ứng dụng Quản lý Tài chính Cá nhân theo Phương pháp 6 Chiếc Lọ

## Cấu trúc thư mục

- `server/` — Backend Express 5 + Mongoose 9 (REST API `/api/v1`)
- `client/` — Frontend React 19 + Vite + Tailwind CSS 4
- `shared/` — Zod schema dùng chung giữa client & server (validate)
- `docs/` — Toàn bộ tài liệu dự án (PRD, Product Backlog, Technical Stack, Data Model & API Design)

## Bắt đầu

```bash
npm install          # cài đặt cho toàn bộ workspace
npm run dev --workspace=server
npm run dev --workspace=client
```

Xem chi tiết nghiệp vụ tại `docs/PRD_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md`,
User Story/AC tại `docs/Product_Backlog_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md`,
và thiết kế kỹ thuật tại `docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md`.
