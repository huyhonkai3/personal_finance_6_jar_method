import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasTestDb = Boolean(process.env.MONGODB_URI_TEST);

describe.skipIf(!hasTestDb)("Giai đoạn 6 - late month-end integration", () => {
  let app;
  let User;
  let Jar;
  let FinancialPeriod;
  let JarPeriodStat;
  let Transaction;
  let Notification;
  let RefreshToken;
  let userId;
  let accessToken;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.MONGODB_URI = process.env.MONGODB_URI_TEST;
    process.env.JWT_ACCESS_SECRET ||= "integration-test-access-secret";
    process.env.JWT_REFRESH_SECRET ||= "integration-test-refresh-secret";
    process.env.PORT ||= "3999";
    process.env.CORS_ORIGIN ||= "http://localhost:5173";

    ({ default: app } = await import("./app.js"));
    ({ User } = await import("./models/User.js"));
    ({ Jar } = await import("./models/Jar.js"));
    ({ FinancialPeriod } = await import("./models/FinancialPeriod.js"));
    ({ JarPeriodStat } = await import("./models/JarPeriodStat.js"));
    ({ Transaction } = await import("./models/Transaction.js"));
    ({ Notification } = await import("./models/Notification.js"));
    ({ RefreshToken } = await import("./models/RefreshToken.js"));

    await mongoose.connect(process.env.MONGODB_URI_TEST);
  });

  afterAll(async () => {
    if (userId) {
      await Promise.all([
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

  it("snapshot kỳ cũ, khóa app, cho expense vào kỳ mới rồi mở khóa sau close", async () => {
    const email = `phase6-${Date.now()}@example.com`;
    const registerResponse = await request(app).post("/api/v1/auth/register").send({
      email,
      password: "Test12345",
      name: "Phase 6 Integration",
    });

    expect(registerResponse.status).toBe(201);
    userId = registerResponse.body.user._id;
    accessToken = registerResponse.body.accessToken;

    const jars = await Jar.find({ userId }).sort({ order: 1 });
    expect(jars).toHaveLength(6);

    const oldPeriod = await FinancialPeriod.findOne({ userId, status: "open" });
    oldPeriod.periodKey = `integration-old-${Date.now()}`;
    oldPeriod.startDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    oldPeriod.endDate = new Date(Date.now() - 1000);
    await oldPeriod.save();

    await JarPeriodStat.create({
      userId,
      jarId: jars[0]._id,
      periodId: oldPeriod._id,
      openingBalance: 100_000,
      allocatedIncome: 50_000,
      totalExpense: 20_000,
      spendingLimit: 150_000,
    });

    const currentResponse = await request(app)
      .get("/api/v1/periods/current")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(currentResponse.status).toBe(200);
    expect(currentResponse.body.hasPendingClose).toBe(true);
    expect(String(currentResponse.body.pendingPeriod._id)).toBe(
      String(oldPeriod._id),
    );
    expect(currentResponse.body.currentPeriod.status).toBe("open");

    const blockedResponse = await request(app)
      .patch("/api/v1/users/me/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ balanceDisplayMode: "exact" });

    expect(blockedResponse.status).toBe(423);
    expect(blockedResponse.body.error.code).toBe("MONTH_END_PENDING");

    const expenseResponse = await request(app)
      .post("/api/v1/transactions/parse")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ rawText: "Ăn trưa 10k" });

    expect(expenseResponse.status).toBe(201);
    expect(String(expenseResponse.body.transaction.periodId)).toBe(
      String(currentResponse.body.currentPeriod._id),
    );

    const summaryResponse = await request(app)
      .get(`/api/v1/periods/${oldPeriod._id}/summary`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(summaryResponse.status).toBe(200);
    const essentialSummary = summaryResponse.body.jars.find(
      (item) => String(item.jarId) === String(jars[0]._id),
    );
    expect(essentialSummary.closingBalance).toBe(130_000);

    const closeResponse = await request(app)
      .post(`/api/v1/periods/${oldPeriod._id}/close`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        decisions: jars.map((jar) => ({
          jarId: String(jar._id),
          action: "rollover",
        })),
      });

    expect(closeResponse.status).toBe(200);
    expect(closeResponse.body.period.status).toBe("closed");

    const nextStat = await JarPeriodStat.findOne({
      userId,
      jarId: jars[0]._id,
      periodId: currentResponse.body.currentPeriod._id,
    });
    expect(nextStat.openingBalance).toBe(130_000);
    expect(nextStat.totalExpense).toBe(10_000);

    const unlockedResponse = await request(app)
      .patch("/api/v1/users/me/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ balanceDisplayMode: "exact" });

    expect(unlockedResponse.status).toBe(200);
  });
});
