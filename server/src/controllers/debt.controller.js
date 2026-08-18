// GET /debts, /debts/:id/repayments và /jars/:jarId/debts — US6.4.
import { InternalDebt } from "../models/InternalDebt.js";
import { DebtRepayment } from "../models/DebtRepayment.js";
import { AppError } from "../utils/AppError.js";

function buildDebtFilter(userId, { status, jarId } = {}) {
  const filter = { userId };
  if (status) filter.status = status;
  if (jarId) {
    filter.$or = [{ debtorJarId: jarId }, { creditorJarId: jarId }];
  }
  return filter;
}

export async function listDebts(req, res) {
  const { status, jarId, page = 1, limit = 20 } = req.query;
  const filter = buildDebtFilter(req.userId, { status, jarId });

  const [debts, total] = await Promise.all([
    InternalDebt.find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    InternalDebt.countDocuments(filter),
  ]);

  res.status(200).json({
    debts,
    pagination: { page, limit, total },
  });
}

export async function listDebtRepayments(req, res) {
  const debt = await InternalDebt.findOne({
    _id: req.params.id,
    userId: req.userId,
  });
  if (!debt) {
    throw new AppError(404, "DEBT_NOT_FOUND", "Không tìm thấy khoản công nợ");
  }

  const repayments = await DebtRepayment.find({
    userId: req.userId,
    debtId: debt._id,
  }).sort({ repaidAt: -1, _id: -1 });

  res.status(200).json({ debt, repayments });
}

export async function listJarDebts(req, res) {
  const debts = await InternalDebt.find(
    buildDebtFilter(req.userId, { jarId: req.params.jarId }),
  ).sort({ status: 1, createdAt: 1 });

  res.status(200).json({ debts });
}
