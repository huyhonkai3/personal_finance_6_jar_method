// Định nghĩa route cho nhóm 'transaction', gắn với transaction.controller.js - muc 9
import { Router } from "express";

import {
  bulkConfirmSchema,
  listTransactionsQuerySchema,
  parseBulkTransactionSchema,
  parseTransactionSchema,
  transactionIdParamSchema,
  updateTransactionJarSchema,
} from "@six-jars/shared/schemas/transaction.schemajs";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  bulkConfirmTransactions,
  getTransaction,
  listTransactions,
  parseBulkTransactions,
  parseTransaction,
  updateTransactionJar,
} from "../controllers/transaction.controller.js";

const router = Router();

router.use(authMiddleware);

router.post("/parse", validate(parseTransactionSchema), parseTransaction);
router.post(
  "/parse-bulk",
  validate(parseBulkTransactionSchema),
  parseBulkTransactions,
);
router.post(
  "/bulk-confirm",
  validate(bulkConfirmSchema),
  bulkConfirmTransactions,
);

router.get(
  "/",
  validate(listTransactionsQuerySchema, "query"),
  listTransactions,
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
  updateTransactionJar,
);

export default router;
