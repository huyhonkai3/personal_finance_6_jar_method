// Entry point: ket noi DB (config/db.js), dang ky cron job (jobs/scheduler.js),
// lang nghe PORT
import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";
import app from "./app.js";

async function start() {
  await connectDB();

  app.listen(env.PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${env.PORT}`);
    console.log(`   Môi trường: ${env.NODE_ENV}`);
  });
}

start().catch((err) => {
  console.error("❌ Không thể khởi động server:", err);
  process.exit(1);
});
