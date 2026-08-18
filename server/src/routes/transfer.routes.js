// Routes mượn tiền giữa các lọ - Giai đoạn 7.
import { Router } from "express";
import {
  createTransferSchema,
  listTransfersQuerySchema,
  suggestTransferSchema,
} from "@six-jars/shared/schemas/transfer.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { editWindowGuard } from "../middlewares/editWindowGuard.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  createTransfer,
  listTransfers,
  suggestTransfer,
} from "../controllers/transfer.controller.js";

const router = Router();
router.use(authMiddleware);

router.post("/suggest", validate(suggestTransferSchema), suggestTransfer);
router.post(
  "/",
  validate(createTransferSchema),
  editWindowGuard,
  createTransfer,
);
router.get("/", validate(listTransfersQuerySchema, "query"), listTransfers);

export default router;
