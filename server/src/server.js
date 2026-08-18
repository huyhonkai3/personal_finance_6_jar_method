// Entry point: kết nối DB, đăng ký cron jobs, lắng nghe PORT.
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { startScheduler } from "./jobs/scheduler.js";
import app from "./app.js";

async function start() {
  await connectDB();
  startScheduler();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${env.PORT}`);
    console.log(`   Môi trường: ${env.NODE_ENV}`);
  });
}

start().catch((err) => {
  console.error("❌ Không thể khởi động server:", err);
  process.exit(1);
});
