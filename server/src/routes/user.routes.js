// Định nghĩa route cho nhóm 'user', gắn với user.controller.js
import { Router } from "express";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { getMe, updateSettings } from "../controllers/user.controller.js";

const router = Router();

router.use(authMiddleware);

router.get("/me", getMe);
router.patch("/me/settings", updateSettings);

export default router;
