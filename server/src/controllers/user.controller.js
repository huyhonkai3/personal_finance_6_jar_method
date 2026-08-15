// GET/PATCH /users/me, /users/me/settings — muc 7
import { z } from "zod";

import { User } from "../models/User.js";
import { AppError } from "../utils/AppError.js";

const updateSettingsSchema = z
  .object({
    salaryDay: z.number().int().min(1).max(31).nullable(),
    monthEndDay: z.number().int().min(1).max(31),
    balanceDisplayMode: z.enum(["rounded", "exact"]),
    timezone: z.string().min(1),
  })
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Cần ít nhất 1 field để cập nhật",
  });

export async function getMe(req, res) {
  const user = await User.findOne(req.userId);
  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Không tìm thấy user");
  }
  res.status(200).json({ user });
}

export async function updateSettings(req, res) {
  const result = updateSettingsSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Dữ liệu gửi lên không hợp lệ",
      result.error.flatten().fieldErrors,
    );
  }

  // Map { salaryDay, monthEndDay, ... } -> { 'settings.salaryDay': ..., ... }
  // để chỉ $set đúng field được gửi lên, không đụng các field settings khác.
  const updates = {};
  for (const [key, value] of Object.entries(result.data)) {
    updates[`settings.${key}`] = value;
  }

  const user = await User.findByIdAndUpdate(
    req.userId,
    { $set: updates },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw new AppError(404, "USER_NOT_FOUND", "Không tìm thấy user");
  }

  res.status(200).json({ user });
}
