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

personal_finance_6_jar_method
├── .gitignore
├── package.json
├── README.md
├── client
│ ├── .gitignore
│ ├── index.html
│ ├── package.json
│ ├── vite.config.js
│ └── src
│ ├── App.jsx
│ ├── index.css
│ ├── main.jsx
│ ├── api
│ │ ├── auth.api.js
│ │ ├── client.js
│ │ ├── dictionary.api.js
│ │ ├── income.api.js
│ │ ├── jars.api.js
│ │ ├── notifications.api.js
│ │ ├── periods.api.js
│ │ ├── transactions.api.js
│ │ ├── transfers.api.js
│ │ └── user.api.js
│ ├── features
│ │ ├── auth
│ │ │ └── README.md
│ │ ├── history
│ │ │ └── README.md
│ │ ├── income
│ │ │ └── README.md
│ │ ├── input
│ │ │ └── README.md
│ │ ├── jars
│ │ │ └── README.md
│ │ ├── month-end
│ │ │ └── README.md
│ │ ├── settings
│ │ │ └── README.md
│ │ └── transfers
│ │ └── README.md
│ ├── hooks
│ │ ├── useJars.js
│ │ └── useTransactions.js
│ ├── lib
│ │ └── formatMoney.js
│ ├── routes
│ │ └── AppRoutes.jsx
│ └── store
│ ├── bulkReviewStore.js
│ └── monthEndStore.js
├── server
│ ├── .env.example
│ ├── .gitignore
│ ├── package.json
│ └── src
│ ├── app.js
│ ├── server.js
│ ├── config
│ │ ├── db.js
│ │ └── env.js
│ ├── controllers
│ │ ├── auth.controller.js
│ │ ├── debt.controller.js
│ │ ├── dictionary.controller.js
│ │ ├── income.controller.js
│ │ ├── jar.controller.js
│ │ ├── notification.controller.js
│ │ ├── period.controller.js
│ │ ├── transaction.controller.js
│ │ ├── transfer.controller.js
│ │ └── user.controller.js
│ ├── jobs
│ │ ├── autoSnapshot.job.js
│ │ ├── salaryReminder.job.js
│ │ └── scheduler.js
│ ├── middlewares
│ │ ├── auth.middleware.js
│ │ ├── editWindowGuard.middleware.js
│ │ ├── errorHandler.middleware.js
│ │ ├── monthEndLock.middleware.js
│ │ └── validate.middleware.js
│ ├── models
│ │ ├── DebtRepayment.js
│ │ ├── FinancialPeriod.js
│ │ ├── InternalDebt.js
│ │ ├── Jar.js
│ │ ├── JarPeriodStat.js
│ │ ├── Notification.js
│ │ ├── PersonalDictionaryRule.js
│ │ ├── RefreshToken.js
│ │ ├── Transaction.js
│ │ ├── TransactionHistory.js
│ │ └── User.js
│ ├── routes
│ │ ├── auth.routes.js
│ │ ├── debt.routes.js
│ │ ├── dictionary.routes.js
│ │ ├── income.routes.js
│ │ ├── index.js
│ │ ├── jar.routes.js
│ │ ├── notification.routes.js
│ │ ├── period.routes.js
│ │ ├── transaction.routes.js
│ │ ├── transfer.routes.js
│ │ └── user.routes.js
│ ├── services
│ │ ├── allocationService.js
│ │ ├── debtService.js
│ │ ├── parsingService.js
│ │ ├── periodService.js
│ │ ├── recalculationEngine.js
│ │ └── thresholdWatcher.js
│ └── utils
│ ├── AppError.js
│ ├── date.js
│ └── money.js
└── shared
├── package.json
└── schemas
├── income.schema.js
├── index.js
├── jar.schema.js
├── transaction.schema.js
└── transfer.schema.js
