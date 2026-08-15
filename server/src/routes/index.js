// Gộp toàn bộ router con, mount dưới prefix /api/v1
// vi du: router.use('/auth', authRoutes); router.use('/jars', jarRoutes); ...

import { Router } from "express";

import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);

export default router;
