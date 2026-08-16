// Định nghĩa route cho nhóm 'dictionary', gắn với dictionary.controller.js — muc 12
import { Router } from "express";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  createDictionaryRule,
  deleteDictionaryRule,
  listDictionaryRules,
} from "../controllers/dictionary.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/", listDictionaryRules);
router.post("/", createDictionaryRule);
router.delete("/:id", deleteDictionaryRule);

export default router;
