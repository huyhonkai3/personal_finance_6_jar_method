// Routes Transaction Engine.
import { Router } from "express";
import {
  bulkConfirmSchema,
  expenseFollowupSchema,
  listTransactionsQuerySchema,
  parseBulkTransactionSchema,
  parseTransactionSchema,
  transactionIdParamSchema,
  updateTransactionJarSchema,
  updateTransactionSchema,
} from "@six-jars/shared/schemas/transaction.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { editWindowGuard } from "../middlewares/editWindowGuard.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  bulkConfirmTransactions,
  deleteTransaction,
  expenseFollowup,
  getTransaction,
  getTransactionHistory,
  listTransactions,
  parseBulkTransactions,
  parseTransaction,
  updateTransaction,
  updateTransactionJar,
} from "../controllers/transaction.controller.js";

const router = Router();
router.use(authMiddleware);

router.post(
  "/parse",
  validate(parseTransactionSchema),
  editWindowGuard,
  parseTransaction,
);
router.post(
  "/expense-followup",
  validate(expenseFollowupSchema),
  editWindowGuard,
  expenseFollowup,
);
router.post(
  "/parse-bulk",
  validate(parseBulkTransactionSchema),
  parseBulkTransactions,
);
router.post(
  "/bulk-confirm",
  validate(bulkConfirmSchema),
  editWindowGuard,
  bulkConfirmTransactions,
);
router.get(
  "/",
  validate(listTransactionsQuerySchema, "query"),
  listTransactions,
);
router.get(
  "/:id/history",
  validate(transactionIdParamSchema, "params"),
  getTransactionHistory,
);
router.get(
  "/:id",
  validate(transactionIdParamSchema, "params"),
  getTransaction,
);
router.patch(
  "/:id/jar",
  validate(transactionIdParamSchema, "params"),
  validate(updateTransactionJarSchema),
  editWindowGuard,
  updateTransactionJar,
);
router.patch(
  "/:id",
  validate(transactionIdParamSchema, "params"),
  validate(updateTransactionSchema),
  editWindowGuard,
  updateTransaction,
);
router.delete(
  "/:id",
  validate(transactionIdParamSchema, "params"),
  editWindowGuard,
  deleteTransaction,
);

export default router;
