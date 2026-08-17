// Routes Financial Period / Month-End - Giai đoạn 6.
import { Router } from "express";
import {
  closePeriodSchema,
  periodIdParamSchema,
} from "@six-jars/shared/schemas/period.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  closePeriod,
  getCurrentPeriod,
  getPeriodSummaryController,
} from "../controllers/period.controller.js";

const router = Router();
router.use(authMiddleware);

router.get("/current", getCurrentPeriod);
router.get(
  "/:id/summary",
  validate(periodIdParamSchema, "params"),
  getPeriodSummaryController,
);
router.post(
  "/:id/close",
  validate(periodIdParamSchema, "params"),
  validate(closePeriodSchema),
  closePeriod,
);

export default router;
