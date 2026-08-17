// Gộp toàn bộ router con, mount dưới prefix /api/v1
// vi du: router.use('/auth', authRoutes); router.use('/jars', jarRoutes); ...

import { Router } from "express";

import authRoutes from "./auth.routes.js";
import userRoutes from "./user.routes.js";
import jarRoutes from "./jar.routes.js";
import transactionRoutes from "./transaction.routes.js";
import dictionaryRoutes from "./dictionary.routes.js";
import incomeRoutes from "./income.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/jars", jarRoutes);
router.use("/transactions", transactionRoutes);
router.use("/dictionary", dictionaryRoutes);
router.use("/income", incomeRoutes);

export default router;
