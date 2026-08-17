// Định nghĩa route cho nhóm notification - Giai đoạn 5.
import { Router } from "express";

import {
  listNotificationsQuerySchema,
  notificationIdParamSchema,
} from "@six-jars/shared/schemas/notification.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  listNotifications,
  markNotificationRead,
} from "../controllers/notification.controller.js";

const router = Router();

router.use(authMiddleware);

router.get(
  "/",
  validate(listNotificationsQuerySchema, "query"),
  listNotifications,
);

router.patch(
  "/:id/read",
  validate(notificationIdParamSchema, "params"),
  markNotificationRead,
);

export default router;
