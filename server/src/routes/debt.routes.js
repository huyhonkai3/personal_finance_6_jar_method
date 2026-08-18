// Routes công nợ nội bộ - Giai đoạn 7.
import { Router } from "express";
import {
  debtIdParamSchema,
  listDebtsQuerySchema,
} from "@six-jars/shared/schemas/debt.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  listDebtRepayments,
  listDebts,
} from "../controllers/debt.controller.js";

const router = Router();
router.use(authMiddleware);

router.get("/", validate(listDebtsQuerySchema, "query"), listDebts);
router.get(
  "/:id/repayments",
  validate(debtIdParamSchema, "params"),
  listDebtRepayments,
);

export default router;
