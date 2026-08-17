// Đăng ký cron jobs khi server khởi động.
import cron from "node-cron";
import { runAutoSnapshotJob } from "./autoSnapshot.job.js";
import { runSalaryReminderJob } from "./salaryReminder.job.js";

function runSafely(name, job) {
  Promise.resolve()
    .then(job)
    .catch((error) => console.error(`❌ Cron ${name} thất bại:`, error));
}

export function startScheduler() {
  // endDate đã được lưu dưới dạng UTC tương ứng đúng 23:59 timezone user,
  // vì vậy chỉ cần poll mỗi phút; không cần tạo một cron riêng cho từng timezone.
  const autoSnapshotTask = cron.schedule("* * * * *", () => {
    runSafely("auto-snapshot", () => runAutoSnapshotJob(new Date()));
  });

  // Quét hourly; salaryReminder tự chống gửi lặp trong cùng ngày.
  const salaryReminderTask = cron.schedule("0 * * * *", () => {
    runSafely("salary-reminder", () => runSalaryReminderJob(new Date()));
  });

  return {
    stop() {
      autoSnapshotTask.stop();
      salaryReminderTask.stop();
    },
  };
}
