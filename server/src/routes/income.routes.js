// Routes Income.
import { Router } from "express";
import { confirmIncomeSchema } from "@six-jars/shared/schemas/income.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { editWindowGuard } from "../middlewares/editWindowGuard.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { confirmIncome } from "../controllers/income.controller.js";

const router = Router();
router.use(authMiddleware);

router.post(
  "/confirm",
  validate(confirmIncomeSchema),
  editWindowGuard,
  confirmIncome,
);

export default router;
