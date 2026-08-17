import "dotenv/config";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasTestDb = Boolean(process.env.MONGODB_URI_TEST);

describe.skipIf(!hasTestDb)("Giai đoạn 7 - borrowing and debt integration", () => {
  let app;
  let User;
  let Jar;
  let InternalDebt;
  let DebtRepayment;
  let Transaction;
  let FinancialPeriod;
  let JarPeriodStat;
  let Notification;
  let RefreshToken;
  let userId;
  let token;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;
    process.env.JWT_ACCESS_SECRET ||= "phase7-test-access";
    process.env.JWT_REFRESH_SECRET ||= "phase7-test-refresh";
    process.env.PORT ||= "3998";
    process.env.CORS_ORIGIN ||= "http://localhost:5173";

    ({ default: app } = await import("./app.js"));
    ({ User } = await import("./models/User.js"));
    ({ Jar } = await import("./models/Jar.js"));
    ({ InternalDebt } = await import("./models/InternalDebt.js"));
    ({ DebtRepayment } = await import("./models/DebtRepayment.js"));
    ({ Transaction } = await import("./models/Transaction.js"));
    ({ FinancialPeriod } = await import("./models/FinancialPeriod.js"));
    ({ JarPeriodStat } = await import("./models/JarPeriodStat.js"));
    ({ Notification } = await import("./models/Notification.js"));
    ({ RefreshToken } = await import("./models/RefreshToken.js"));
    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  afterAll(async () => {
    if (userId) {
      await Promise.all([
        DebtRepayment.deleteMany({ userId }),
        InternalDebt.deleteMany({ userId }),
        Notification.deleteMany({ userId }),
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

  it("borrow, sensitive warning và debt repayment chạy end-to-end", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: `phase7-${Date.now()}@example.com`,
      password: "Test12345",
      name: "Phase 7 Test",
    });
    expect(register.status).toBe(201);
    userId = register.body.user._id;
    token = register.body.accessToken;

    const jars = await Jar.find({ userId });
    const essential = jars.find((jar) => jar.key === "essential");
    const play = jars.find((jar) => jar.key === "play");
    const savings = jars.find((jar) => jar.key === "savings");
    await Promise.all([
      Jar.updateOne({ _id: essential._id }, { $set: { balance: 0 } }),
      Jar.updateOne({ _id: play._id }, { $set: { balance: 500_000 } }),
      Jar.updateOne({ _id: savings._id }, { $set: { balance: 1_000_000 } }),
    ]);

    const parsed = await request(app)
      .post("/api/v1/transactions/parse")
      .set("Authorization", `Bearer ${token}`)
      .send({ rawText: "Ăn trưa 200k" });
    expect(parsed.status).toBe(200);
    expect(parsed.body.pendingExpense.amount).toBe(200_000);
    expect(String(parsed.body.borrowingSuggestion.suggestedJar.jarId)).toBe(
      String(play._id),
    );

    const followup = await request(app)
      .post("/api/v1/transactions/expense-followup")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pendingExpense: parsed.body.pendingExpense,
        decision: "borrow",
        borrowFromJarId: String(play._id),
      });
    expect(followup.status).toBe(201);
    expect(followup.body.transaction.type).toBe("expense");
    expect(followup.body.transfer.type).toBe("transfer");
    expect(followup.body.debt.remainingAmount).toBe(200_000);

    const sensitive = await request(app)
      .post("/api/v1/transfers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        fromJarId: String(savings._id),
        toJarId: String(essential._id),
        amount: 100_000,
      });
    expect(sensitive.status).toBe(409);
    expect(sensitive.body.error.code).toBe(
      "SENSITIVE_JAR_CONFIRMATION_REQUIRED",
    );

    const pendingIncome = {
      amount: 1_000_000,
      description: "Lương tháng",
    };
    const preview = await request(app)
      .post("/api/v1/income/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ pendingIncome, incomeType: "standard_split", preview: true });
    expect(preview.status).toBe(200);
    expect(preview.body.preview.totalDebtRepayment).toBe(200_000);
    expect(preview.body.preview.remainingIncome).toBe(800_000);

    const confirmed = await request(app)
      .post("/api/v1/income/confirm")
      .set("Authorization", `Bearer ${token}`)
      .send({ pendingIncome, incomeType: "standard_split" });
    expect(confirmed.status).toBe(201);

    const debt = await InternalDebt.findById(followup.body.debt._id);
    expect(debt.status).toBe("settled");
    expect(debt.remainingAmount).toBe(0);
    expect(
      await DebtRepayment.countDocuments({ userId, debtId: debt._id }),
    ).toBe(1);
  });
});
