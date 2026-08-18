// POST /transfers/suggest, POST/GET /transfers — Epic 6.
import mongoose from "mongoose";

import { Transaction } from "../models/Transaction.js";
import {
  createBorrowTransfer,
  suggestBorrowingSource,
} from "../services/transferService.js";

export async function suggestTransfer(req, res) {
  const { jarId, shortfallAmount } = req.body;
  const suggestion = await suggestBorrowingSource(
    req.userId,
    jarId,
    shortfallAmount,
  );
  res.status(200).json({ suggestion });
}

export async function createTransfer(req, res) {
  const {
    fromJarId,
    toJarId,
    amount,
    note,
    transactionDate,
    confirmSensitiveWarning,
  } = req.body;

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await createBorrowTransfer(
        {
          userId: req.userId,
          fromJarId,
          toJarId,
          amount,
          note,
          transactionDate: transactionDate ?? new Date(),
          trigger: "manual",
          confirmSensitiveWarning,
        },
        session,
      );
    });
  } finally {
    await session.endSession();
  }

  res.status(201).json({
    transaction: result.transaction,
    debt: result.debt,
  });
}

export async function listTransfers(req, res) {
  const { page = 1, limit = 20 } = req.query;
  const filter = {
    userId: req.userId,
    type: "transfer",
    isDeleted: false,
  };

  const [transfers, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Transaction.countDocuments(filter),
  ]);

  res.status(200).json({
    transfers,
    pagination: { page, limit, total },
  });
}
