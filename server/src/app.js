// Khoi tao Express app: middleware chung (cors, json parser), mount routes/index.js,
// gan errorHandler.middleware.js o cuoi cung
import express from "express";
import cors from "cors";

import { env } from "./config/env.js";
import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.middleware.js";

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());

// Health check - kiểm tra nhanh server còn sống, không phụ thuộc DB.
app.get("/api/v1/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString });
});

app.use("/api/v1", routes);

// Bắt các request tới route không tồn tại, trả đúng format lỗi thống nhất.
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `Không tìm thấy route ${req.method} ${req.originalUrl}`,
      details: {},
    },
  });
});

// Luôn đăng ký cuối cùng.
app.use(errorHandler);

export default app;
