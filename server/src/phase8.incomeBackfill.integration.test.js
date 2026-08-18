import "dotenv/config";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasTestDb = Boolean(process.env.MONGODB_URI_TEST);

describe.skipIf(!hasTestDb)("Giai đoạn 8 - historical income backfill", () => {
  let app;
  let User;
  let Jar;
  let FinancialPeriod;
  let JarPeriodStat;
  let Transaction;
  let TransactionHistory;
  let Notification;
  let RefreshToken;
  let getPeriodBounds;
  let userId;
  let token;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;
    process.env.JWT_ACCESS_SECRET ||= "phase8-income-access";
    process.env.JWT_REFRESH_SECRET ||= "phase8-income-refresh";
    process.env.PORT ||= "3996";
    process.env.CORS_ORIGIN ||= "http://localhost:5173";

    ({ default: app } = await import("./app.js"));
    ({ User } = await import("./models/User.js"));
    ({ Jar } = await import("./models/Jar.js"));
    ({ FinancialPeriod } = await import("./models/FinancialPeriod.js"));
    ({ JarPeriodStat } = await import("./models/JarPeriodStat.js"));
    ({ Transaction } = await import("./models/Transaction.js"));
    ({ TransactionHistory } = await import("./models/TransactionHistory.js"));
    ({ Notification } = await import("./models/Notification.js"));
    ({ RefreshToken } = await import("./models/RefreshToken.js"));
    ({ getPeriodBounds } = await import("./utils/date.js"));
    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  afterAll(async () => {
    if (userId) {
      await Promise.all([
        Notification.deleteMany({ userId }),
        TransactionHistory.deleteMany({ userId }),
        Transaction.deleteMany({ userId }),
        JarPeriodStat.deleteMany({ userId }),
        FinancialPeriod.deleteMany({ userId }),
        Jar.deleteMany({ userId }),
        RefreshToken.deleteMany({ userId }),
        User.deleteOne({ _id: userId }),
      ]);
    }
    await mongoose.disconnect();
  });

  it("không double-count Jar.balance khi thêm targeted income vào kỳ closed", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: `phase8-income-${Date.now()}@example.com`,
      password: "Test12345",
      name: "Phase 8 Income",
    });
    expect(register.status).toBe(201);
    userId = register.body.user._id;
    token = register.body.accessToken;

    const essential = await Jar.findOne({ userId, key: "essential" });
    const currentPeriod = await FinancialPeriod.findOne({ userId, status: "open" });
    const previousBounds = getPeriodBounds(
      new Date(currentPeriod.startDate.getTime() - 1),
      1,
      "Asia/Ho_Chi_Minh",
    );
    const previousPeriod = await FinancialPeriod.create({
      userId,
      ...previousBounds,
      status: "closed",
      closedAt: new Date(),
    });

    await Promise.all([
      Jar.updateOne({ _id: essential._id }, { $set: { balance: 0 } }),
      JarPeriodStat.create({
        userId,
        jarId: essential._id,
        periodId: previousPeriod._id,
        openingBalance: 0,
        spendingLimit: 0,
        closingBalance: 0,
        closeDecision: "rollover",
        closeDecisionAmount: 0,
      }),
      JarPeriodStat.updateOne(
        { userId, jarId: essential._id, periodId: currentPeriod._id },
        { $set: { openingBalance: 0, spendingLimit: 0 } },
        { upsert: true, setDefaultsOnInsert: true },
      ),
    ]);

    const incomeDate = new Date(
      (previousPeriod.startDate.getTime() + previousPeriod.endDate.getTime()) / 2,
    );
    const response = await request(app)
      .post("/api/v1/income/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pendingIncome: {
          amount: 100_000,
          description: "Thu nhập bổ sung",
          transactionDate: incomeDate,
        },
        incomeType: "targeted",
        targetJarId: String(essential._id),
      });

    expect(response.status).toBe(201);
    expect(response.body.recalc.affectedPeriodIds).toHaveLength(1);

    const [essentialAfter, previousStat, adjustment] = await Promise.all([
      Jar.findById(essential._id),
      JarPeriodStat.findOne({
        userId,
        jarId: essential._id,
        periodId: previousPeriod._id,
      }),
      Transaction.findOne({
        userId,
        type: "adjustment",
        "adjustmentMeta.sourceTransactionId": response.body.transaction._id,
        isDeleted: false,
      }),
    ]);

    expect(previousStat.allocatedIncome).toBe(100_000);
    expect(previousStat.closingBalance).toBe(100_000);
    expect(adjustment.adjustmentMeta.deltaAmount).toBe(100_000);
    expect(essentialAfter.balance).toBe(100_000);
  });
});
