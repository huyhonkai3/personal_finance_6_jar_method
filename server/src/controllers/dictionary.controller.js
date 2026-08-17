// GET/POST/DELETE /dictionary — muc 12
// CRUD thủ công cho Từ điển cá nhân (bổ sung cho cơ chế "tự học" ngầm qua
// PATCH /transactions/:id/jar ở transaction.controller.js).
import { z } from "zod";

import { Jar } from "../models/Jar.js";
import { PersonalDictionaryRule } from "../models/PersonalDictionaryRule.js";
import { AppError } from "../utils/AppError.js";
import { normalizeText } from "../utils/text.js";

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, "id không hợp lệ");

const createRuleSchema = z.object({
  keyword: z.string().trim().min(1, "Từ khóa không được để trống"),
  jarId: objectIdSchema,
});

export async function listDictionaryRules(req, res) {
  const rules = await PersonalDictionaryRule.find({ userId: req.userId }).sort({
    updatedAt: -1,
  });
  res.status(200).json({ rules });
}

export async function createDictionaryRule(req, res) {
  const result = createRuleSchema.safeParse(req.body);
  if (!result.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Dữ liệu gửi lên không hợp lệ",
      result.error.flatten(),
    );
  }

  const { keyword, jarId } = result.data;

  const jar = await Jar.findOne({ _id: jarId, userId: req.userId });
  if (!jar) {
    throw new AppError(404, "JAR_NOT_FOUND", "Không tìm thấy lọ");
  }
  const normalizedKeyword = normalizeText(keyword);

  const rule = await PersonalDictionaryRule.findOneAndUpdate(
    { userId: req.userId, keyword: normalizedKeyword },
    { $set: { jarId, sourceType: "manual" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.status(201).json({ rule });
}

export async function deleteDictionaryRule(req, res) {
  const { id } = req.params;

  const result = await PersonalDictionaryRule.deleteOne({
    _id: id,
    userId: req.userId,
  });

  if (result.deletedCount === 0) {
    throw new AppError(
      404,
      "DICTIONARY_RULE_NOT_FOUND",
      "Không tìm thấy quy tắc",
    );
  }

  res.status(200).json({ message: "Đã xóa quy tắc" });
}
