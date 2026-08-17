// Gộp toàn bộ router con, mount dưới prefix /api/v1
import { Router } from "express";

import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import jarRoutes from "./jar.routes.js";
import transactionRoutes from "./transaction.routes.js";
import dictionaryRoutes from "./dictionary.routes.js";
import incomeRoutes from "./income.routes.js";
import notificationRoutes from "./notification.routes.js";
import periodRoutes from "./period.routes.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { monthEndLock } from "../middlewares/monthEndLock.middleware.js";

const router = Router();

// Auth phải nằm ngoài month-end lock để login/refresh/logout luôn dùng được.
router.use("/auth", authRoutes);

// Từ đây trở xuống là API đã xác thực. Gắn lock ở cấp router gốc để mọi
// module ghi dữ liệu đều tuân thủ MONTH_END_PENDING.
router.use(authMiddleware);
router.use(monthEndLock);

router.use("/users", userRoutes);
router.use("/jars", jarRoutes);
router.use("/transactions", transactionRoutes);
router.use("/dictionary", dictionaryRoutes);
router.use("/income", incomeRoutes);
router.use("/notifications", notificationRoutes);
router.use("/periods", periodRoutes);

export default router;
