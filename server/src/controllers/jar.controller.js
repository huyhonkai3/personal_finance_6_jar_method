// GET /jars, PUT /jars/ratios, PATCH /jars/:jarId — muc 8
// (GET /jars/:jarId/debts để dành Giai đoạn 7, khi InternalDebt model tồn tại)
import { Jar } from "../models/Jar.js";
import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";
import { formatBalanceForDisplay } from "../utils/money.js";

const REQUIRED_JAR_COUNT = 6;
const RATIO_TOTAL_TARGET = 100;
// Sai số cho phép khi cộng dồn số thực dấu phẩy động (VD 33.33 + 33.33 + 33.34 có thể ra 99.999999999999 do IEEE 754) - không phải
// một khoản "nới lỏng" nghiệp vụ, chỉ để tránh từ chối oan các trường hợp về mặt toán học là đúng 100%.
const FLOATING_POINT_EPSILON = 1e-6;

/**
 * Kiểm tra tổng percentage của danh sách item gửi lên PUT /jars/ratios có đúng bằng 100 không.
 * Hàm thuần (ko đụng DB/HTTP) để dễ unit test độc lập  - tách riêng khỏi updateJarRatios() bên dưới.
 *
 * @param {{ jarId: string, percentage: number }[]} items
 * @returns {number} tổng percentage đã làm tròn 2 chữ số thập phân
 * @throws {AppError} 409 JAR_RATIO_NOT_100 nếu tổng khác 100
 */
export function validateRatioSum(items) {
  const rawTotal = items.reduce((sum, item) => sum + item.percentage, 0);
  const total = Math.round(rawTotal * 100) / 100;

  if (Math.abs(total - RATIO_TOTAL_TARGET) > FLOATING_POINT_EPSILON) {
    throw new AppError(
      409,
      "JAR_RATIO_NOT_100",
      "Tổng tỷ lệ các lọ phải bằng 100%",
      { total },
    );
  }

  return total;
}

export async function listJars(req, res) {
  // Fetch song song jars + balanceDisplayMode của user - US2.5 AC1/AC2:
  // mặc định "rounded" (làm tròn hàng nghìn), user có thể bật "exact" ở
  // Settings (PATCH /users/me/settings, đã có từ Giai đoạn 1).
  const [jars, user] = await Promise.all([
    Jar.find({ usreId: req.userId }).sort({ order: 1 }),
    User.findById(req.usreId).select("settings.balanceDisplayMode"),
  ]);

  const balanceDisplayMode = user?.settings?.balanceDisplayMode ?? "rounded";
  const displayedJars = jars.map((jar) => ({
    ...jar.toObject(),
    balance: formatBalanceForDisplay(jar.balance, balanceDisplayMode),
  }));

  res.status(200).json({ jars: displayedJars, balanceDisplayMode });
}

export async function updateJarRatios(req, res) {
  // req.body đã được chuẩn hóa bởi validate.middleware.js
  // (updateJarRatiosSchema) - mảng đúng 6 phần tử { jarId, percentage }
  const items = req.body;

  // 1. Validate nghiệp vụ: tổng = 100 (409 JAR_RATIO_NOT_100).
  validateRatioSum(items);

  // 2. Validate danh sách jarId gửi lên đúng khớp 6 lọ hiện có của user - tránh trường hợp
  // gửi thiếu/thừa/nhầm jarId của user khác.
  const jars = await Jar.find({ userId: req.userId });
  if (jars.length !== REQUIRED_JAR_COUNT) {
    throw new AppError(
      500,
      "JAR_SETUP_INCOMPLETE",
      "Tài khoản chưa có đủ 6 lọ mặc định",
    );
  }

  const existingJarIds = new Set(jars.map((jar) => String(jar._id)));
  const incomingJarIds = new Set(items.map((item) => item.jarId));

  const isSameSet =
    existingJarIds.size === incomingJarIds.size &&
    [...existingJarIds].every((id) => incomingJarIds.has(id));
  if (!isSameSet) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Danh sách jarId gửi lên không khớp với 6 lọ của tài khoản",
    );
  }

  // 3. Cập nhật percentage cho từng lọ. Dùng bulkWrite thay vì Mongo
  // session/transaction: đây là 6 update độc lập trên document của chính user
  // đó (không có ràng buộc chéo cần atomic tuyệt đối), và tránh phụ thuộc cấu hình
  // replica set ở môi trường MongoDB standalone lúc dev.
  await Jar.bulkWrite(
    items.map((item) => ({
      updateOne: {
        filter: { _id: item.jarId, userId: req.userId },
        update: { $set: { percentage: item.percentage } },
      },
    })),
  );

  const updateJars = await Jar.find({ userId: req.userId }).sort({
    order: 1,
  });
  res.status(200).json({ jars: updateJars });
}

export async function updateJar(req, res) {
  const { jarId } = req.params;
  // req.body đã đc chuẩn hóa bởi validate.middleware.js
  // (updateJarDisplayNameSchema) - chỉ gồm {displayName}
  const { displayName } = req.body;

  const jar = await Jar.findOneAndUpdate(
    { _id: jarId, userId: req.userId },
    { $set: { displayName } },
    { new: true, runValidators: true },
  );
  if (!jar) {
    throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ");
  }

  res.status(200).json({ jar });
}
