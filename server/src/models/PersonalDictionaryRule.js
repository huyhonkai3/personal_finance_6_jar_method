// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.9)
// Tham chiếu: US1.4
import mongoose from "mongoose";

export const DICTIONARY_RULE_SOURCE_TYPES = ["user_correction", "manual"];

const personalDictionaryRuleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Đã qua utils/text.js$normalizeText trước khi lưu (lowercase, bỏ dấu,
    // gộp khoảng trắng) - để khớp  từ khóa không phụ thuộc cách gõ của user.
    keyword: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    jarId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Jar",
      required: true,
    },
    // user_correction: tự học khi user đổi lọ (PATCH /transactions/:id/jar)
    // manual: user chủ động thêm ở màn Cài đặt (POST /dictionary)
    sourceType: {
      type: String,
      enum: DICTIONARY_RULE_SOURCE_TYPES,
      required: true,
    },
    matchCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamp: true },
);

// Cô lập giữa các user (US 1.4 AC3): user A và user B có quy tắc khác nhau cho từ khóa.
personalDictionaryRuleSchema.index({ userId: 1, keyword: 1 }, { unique: true });

export const PersonalDictionaryRule = mongoose.model(
  "PersonaDictionaryRule",
  personalDictionaryRuleSchema,
);
