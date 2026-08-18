// Routes nhóm Jar.
import { Router } from "express";
import {
  jarIdParamSchema,
  updateJarDisplayNameSchema,
  updateJarRatiosSchema,
} from "@six-jars/shared/schemas/jar.schema.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
  listJars,
  updateJar,
  updateJarRatios,
} from "../controllers/jar.controller.js";
import { listJarDebts } from "../controllers/debt.controller.js";

const router = Router();
router.use(authMiddleware);

router.get("/", listJars);
router.put("/ratios", validate(updateJarRatiosSchema), updateJarRatios);
router.get("/:jarId/debts", validate(jarIdParamSchema, "params"), listJarDebts);
router.patch(
  "/:jarId",
  validate(jarIdParamSchema, "params"),
  validate(updateJarDisplayNameSchema),
  updateJar,
);

export default router;
