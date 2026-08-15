// Kết nối MongoDB qua Mongoose 9.x
// Đọc MONGODB_URI từ biến môi trường (.env)
// Có log trạng thái kết nối và tự động thử kết nối lại (retry) khi mất kết nối hoặc kết nối lần đầu thất bại.
import mongoose from "mongoose";
import { env } from "./env.js";

const RETRY_DELAY_MS = 5000;

let listenersAttached = false;

function attachConnectionListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on("connected", () => {
    console.log("✅ MongoDB đã kết nối:", mongoose.connection.name);
  });

  mongoose.connection.on("error", (err) => {
    console.error("❌ Lỗi kết nối MongoDB:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn(
      `⚠️  MongoDB bị mất kết nối. Thử kết nối lại sau ${RETRY_DELAY_MS}ms...`,
    );
    setTimeout(connectWithRetry, RETRY_DELAY_MS);
  });
}

async function connectWithRetry() {
  try {
    await mongoose.connect(env.MONGODB_URI);
  } catch (err) {
    console.error("❌ Không thể kết nối MongoDB:", err.message);
    console.log(`⏳ Thử kết nối lại sau ${RETRY_DELAY_MS}ms...`);
    setTimeout(connectWithRetry, RETRY_DELAY_MS);
  }
}

/**
 * Kết nối tới MongoDB. Promise chỉ resolve khi kết nối lần đầu thành công
 * (fail-fast lúc khởi động server); nết kết nối lần đầu thất bại, hàm sẽ tự động thử
 * lại theo chu kỳ RETRY_DELAY_MS thay vì reject ngay.
 */
export function connectDB() {
  attachConnectionListeners();

  return new Promise((resolve) => {
    mongoose.connection.once("connected", resolve);
    connectWithRetry();
  });
}
