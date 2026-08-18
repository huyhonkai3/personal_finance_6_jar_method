import "dotenv/config";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasTestDb = Boolean(process.env.MONGODB_URI_TEST);

describe.skipIf(!hasTestDb)("Giai đoạn 8 - Recalculation Engine", () => {
  let app;
  let User;
  let Jar;
  let FinancialPeriod;
  let JarPeriodStat;
  let Transaction;
  let TransactionHistory;
  let Notification;
  let InternalDebt;
  let DebtRepayment;
  let RefreshToken;
  let getPeriodBounds;
  let recalculateFromPeriod;
  const userIds = [];

  async function registerUser(label) {
    const response = await request(app).post("/api/v1/auth/register").send({
      email: `phase8-${label}-${Date.now()}-${Math.random()}@example.com`,
      password: "Test12345",
      name: `Phase 8 ${label}`,
    });
    expect(response.status).toBe(201);
    userIds.push(response.body.user._id);
    return {
      userId: response.body.user._id,
      token: response.body.accessToken,
    };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;
    process.env.JWT_ACCESS_SECRET ||= "phase8-test-access-secret";
    process.env.JWT_REFRESH_SECRET ||= "phase8-test-refresh-secret";
    process.env.PORT ||= "3997";
    process.env.CORS_ORIGIN ||= "http://localhost:5173";

    ({ default: app } = await import("./app.js"));
    ({ User } = await import("./models/User.js"));
    ({ Jar } = await import("./models/Jar.js"));
    ({ FinancialPeriod } = await import("./models/FinancialPeriod.js"));
    ({ JarPeriodStat } = await import("./models/JarPeriodStat.js"));
    ({ Transaction } = await import("./models/Transaction.js"));
    ({ TransactionHistory } = await import("./models/TransactionHistory.js"));
    ({ Notification } = await import("./models/Notification.js"));
    ({ InternalDebt } = await import("./models/InternalDebt.js"));
    ({ DebtRepayment } = await import("./models/DebtRepayment.js"));
    ({ RefreshToken } = await import("./models/RefreshToken.js"));
    ({ getPeriodBounds } = await import("./utils/date.js"));
    ({ recalculateFromPeriod } = await import("./services/recalculationEngine.js"));

    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  afterAll(async () => {
    if (userIds.length > 0) {
      const userFilter = { userId: { $in: userIds } };
      await Promise.all([
        DebtRepayment.deleteMany(userFilter),
        InternalDebt.deleteMany(userFilter),
        Notification.deleteMany(userFilter),
        TransactionHistory.deleteMany(userFilter),
        Transaction.deleteMany(userFilter),
        JarPeriodStat.deleteMany(userFilter),
        FinancialPeriod.deleteMany(userFilter),
        Jar.deleteMany(userFilter),
        RefreshToken.deleteMany(userFilter),
        User.deleteMany({ _id: { $in: userIds } }),
      ]);
    }
    await mongoose.disconnect();
  });

  it("cascade 3 kỳ: sweep 500k rồi backfill expense 300k chỉ tạo adjustment -300k ở hiện tại", async () => {
    const { userId, token } = await registerUser("cascade");
    const jars = await Jar.find({ userId }).sort({ order: 1 });
    const essential = jars.find((jar) => jar.key === "essential");
    const savings = jars.find((jar) => jar.key === "savings");
    const currentPeriod = await FinancialPeriod.findOne({
      userId,
      status: "open",
    });

    const p3Bounds = getPeriodBounds(
      new Date(currentPeriod.startDate.getTime() - 1),
      1,
      "Asia/Ho_Chi_Minh",
    );
    const p2Bounds = getPeriodBounds(
      new Date(p3Bounds.startDate.getTime() - 1),
      1,
      "Asia/Ho_Chi_Minh",
    );
    const p1Bounds = getPeriodBounds(
      new Date(p2Bounds.startDate.getTime() - 1),
      1,
      "Asia/Ho_Chi_Minh",
    );

    const [p1, p2, p3] = await FinancialPeriod.create([
      { userId, ...p1Bounds, status: "closed", closedAt: new Date() },
      { userId, ...p2Bounds, status: "closed", closedAt: new Date() },
      { userId, ...p3Bounds, status: "closed", closedAt: new Date() },
    ]);

    await Promise.all([
      JarPeriodStat.create({
        userId,
        jarId: essential._id,
        periodId: p1._id,
        openingBalance: 500_000,
        spendingLimit: 500_000,
        closingBalance: 500_000,
        closeDecision: "sweep",
        closeDecisionAmount: 500_000,
      }),
      JarPeriodStat.create({
        userId,
        jarId: savings._id,
        periodId: p2._id,
        openingBalance: 500_000,
        spendingLimit: 500_000,
        closingBalance: 500_000,
        closeDecision: "rollover",
        closeDecisionAmount: 500_000,
      }),
      JarPeriodStat.create({
        userId,
        jarId: savings._id,
        periodId: p3._id,
        openingBalance: 500_000,
        spendingLimit: 500_000,
        closingBalance: 500_000,
        closeDecision: "rollover",
        closeDecisionAmount: 500_000,
      }),
      JarPeriodStat.updateOne(
        { userId, jarId: savings._id, periodId: currentPeriod._id },
        { $set: { openingBalance: 500_000, spendingLimit: 500_000 } },
        { upsert: true, setDefaultsOnInsert: true },
      ),
      Jar.updateOne({ _id: savings._id }, { $set: { balance: 500_000 } }),
    ]);

    const backfillDate = new Date(
      (p1.startDate.getTime() + p1.endDate.getTime()) / 2,
    );
    const response = await request(app)
      .post("/api/v1/transactions/parse")
      .set("Authorization", `Bearer ${token}`)
      .send({ rawText: "Ăn trưa 300k", transactionDate: backfillDate });

    expect(response.status).toBe(201);
    expect(response.body.recalc.affectedPeriodIds).toHaveLength(3);

    const sourceTransactionId = response.body.transaction._id;
    const adjustment = await Transaction.findOne({
      userId,
      type: "adjustment",
      "adjustmentMeta.sourceTransactionId": sourceTransactionId,
      isDeleted: false,
    });
    expect(adjustment).toBeTruthy();
    expect(String(adjustment.jarId)).toBe(String(savings._id));
    expect(adjustment.amount).toBe(300_000);
    expect(adjustment.adjustmentMeta.deltaAmount).toBe(-300_000);

    const [p1Stat, p2Stat, p3Stat, savingsAfter] = await Promise.all([
      JarPeriodStat.findOne({ userId, jarId: essential._id, periodId: p1._id }),
      JarPeriodStat.findOne({ userId, jarId: savings._id, periodId: p2._id }),
      JarPeriodStat.findOne({ userId, jarId: savings._id, periodId: p3._id }),
      Jar.findById(savings._id),
    ]);
    expect(p1Stat.closingBalance).toBe(200_000);
    expect(p2Stat.closingBalance).toBe(200_000);
    expect(p3Stat.closingBalance).toBe(200_000);
    expect(savingsAfter.balance).toBe(200_000);

    const history = await TransactionHistory.findOne({
      userId,
      transactionId: sourceTransactionId,
      changeType: "create",
    });
    expect(history.triggeredRecalc).toBe(true);
    expect(history.affectedPeriodIds).toHaveLength(3);

    await recalculateFromPeriod({
      userId,
      periodId: p1._id,
      sourceTransactionId,
    });
    const savingsAfterRetry = await Jar.findById(savings._id);
    expect(savingsAfterRetry.balance).toBe(200_000);
  });

  it("PATCH/DELETE expense kỳ hiện tại cập nhật balance và ghi history", async () => {
    const { userId, token } = await registerUser("edit-delete");
    const essential = await Jar.findOne({ userId, key: "essential" });
    await Jar.updateOne({ _id: essential._id }, { $set: { balance: 1_000_000 } });

    const created = await request(app)
      .post("/api/v1/transactions/parse")
      .set("Authorization", `Bearer ${token}`)
      .send({ rawText: "Ăn trưa 100k" });
    expect(created.status).toBe(201);

    const transactionId = created.body.transaction._id;
    const updated = await request(app)
      .patch(`/api/v1/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ amount: 150_000 });
    expect(updated.status).toBe(200);
    expect(updated.body.transaction.amount).toBe(150_000);

    const afterUpdate = await Jar.findById(essential._id);
    expect(afterUpdate.balance).toBe(850_000);

    const deleted = await request(app)
      .delete(`/api/v1/transactions/${transactionId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.transaction.isDeleted).toBe(true);

    const afterDelete = await Jar.findById(essential._id);
    expect(afterDelete.balance).toBe(1_000_000);

    const historyResponse = await request(app)
      .get(`/api/v1/transactions/${transactionId}/history`)
      .set("Authorization", `Bearer ${token}`);
    expect(historyResponse.status).toBe(200);
    expect(historyResponse.body.history.map((item) => item.changeType)).toEqual(
      expect.arrayContaining(["update", "delete"]),
    );
  });

  it("reject backdate ngoài 12 tháng và bulk income không còn bị skip", async () => {
    const { userId, token } = await registerUser("window-bulk");

    const rejected = await request(app)
      .post("/api/v1/transactions/parse")
      .set("Authorization", `Bearer ${token}`)
      .send({
        rawText: "Ăn trưa 100k",
        transactionDate: "2020-01-01T00:00:00.000Z",
      });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe("EDIT_WINDOW_EXCEEDED");

    const parsed = await request(app)
      .post("/api/v1/transactions/parse-bulk")
      .set("Authorization", `Bearer ${token}`)
      .send({ rawText: "Lương 1tr\nĂn trưa 100k" });
    expect(parsed.status).toBe(200);

    const confirmed = await request(app)
      .post("/api/v1/transactions/bulk-confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: parsed.body.items });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.skippedIncomeItems).toEqual([]);
    expect(confirmed.body.transactions.map((item) => item.type)).toEqual([
      "income",
      "expense",
    ]);

    const essential = await Jar.findOne({ userId, key: "essential" });
    expect(essential.balance).toBe(450_000);
  });
});
