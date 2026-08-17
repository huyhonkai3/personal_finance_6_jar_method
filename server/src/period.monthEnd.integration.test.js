import "dotenv/config";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const hasTestDb = Boolean(process.env.MONGODB_URI_TEST);

describe.skipIf(!hasTestDb)("Giai đoạn 6 - month-end integration", () => {
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
    process.env.JWT_ACCESS_SECRET ||= "phase6-test-access-secret";
    process.env.JWT_REFRESH_SECRET ||= "phase6-test-refresh-secret";
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

  it("snapshot, lock, cho nhập expense kỳ mới và unlock sau close", async () => {
    const register = await request(app).post("/api/v1/auth/register").send({
      email: `phase6-${Date.now()}@example.com`,
      password: "Test12345",
      name: "Phase 6 Test",
    });
    expect(register.status).toBe(201);
    userId = register.body.user._id;
    accessToken = register.body.accessToken;

    const jars = await Jar.find({ userId }).sort({ order: 1 });
    const essential = jars[0];
    await Jar.updateOne({ _id: essential._id }, { $set: { balance: 200_000 } });

    const oldPeriod = await FinancialPeriod.findOne({ userId, status: "open" });
    oldPeriod.periodKey = `phase6-old-${Date.now()}`;
    oldPeriod.startDate = new Date(Date.now() - 31 * 86400_000);
    oldPeriod.endDate = new Date(Date.now() - 1000);
    await oldPeriod.save();

    await JarPeriodStat.create({
      userId,
      jarId: essential._id,
      periodId: oldPeriod._id,
      openingBalance: 200_000,
      spendingLimit: 200_000,
    });

    const current = await request(app)
      .get("/api/v1/periods/current")
      .set("Authorization", `Bearer ${accessToken}`);
    expect(current.status).toBe(200);
    expect(current.body.hasPendingClose).toBe(true);
    expect(String(current.body.pendingPeriod._id)).toBe(String(oldPeriod._id));

    const blocked = await request(app)
      .patch("/api/v1/users/me/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ balanceDisplayMode: "exact" });
    expect(blocked.status).toBe(423);

    const expense = await request(app)
      .post("/api/v1/transactions/parse")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ rawText: "Ăn trưa 10k" });
    expect(expense.status).toBe(201);
    expect(String(expense.body.transaction.periodId)).toBe(
      String(current.body.currentPeriod._id),
    );

    const close = await request(app)
      .post(`/api/v1/periods/${oldPeriod._id}/close`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        decisions: jars.map((jar) => ({
          jarId: String(jar._id),
          action: "rollover",
        })),
      });
    expect(close.status).toBe(200);
    expect(close.body.period.status).toBe("closed");
    expect(close.body.period.closedAt).toBeTruthy();

    const unlocked = await request(app)
      .patch("/api/v1/users/me/settings")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ balanceDisplayMode: "exact" });
    expect(unlocked.status).toBe(200);
  });
});
