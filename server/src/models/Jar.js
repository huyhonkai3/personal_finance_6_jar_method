// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.2)
import mongoose from "mongoose";

// `key` là định danh cố định của lọ, không đổi được sau khi tạo (khác với
// `displayName` - tên hiển thị, user có thể đổi). Dùng để nhận diện lọ đích
// của sweep (isSweepTarget) và để seed 6 lọ mặc định lúc đăng ký.
export const JAR_KEYS = [
  "essential",
  "savings",
  "education",
  "play",
  "freedom",
  "charity",
];

export const SENSITIVITY_GROUPS = ["flexible", "sensitive"];

const jarSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    key: {
      type: String,
      enum: JAR_KEYS,
      required: true,
      immutable: true, // key không đổi được sau khi tạo
    },
    // Tổng percentage của 6 lọ thuộc cùng 1 user luôn phải = 100.
    // Ràng buộc này được validate ở tầng API (jar.controller.js), không thể
    // validate ở tầng schema vì Mongoose validate từng document độc lập.
    percentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    // flexible: play, education, charity - nhóm "dễ mượn".
    // sensitive: savings, freedom - nhóm nhạy cảm, cảnh báo mềm khi mượn (US6.3).
    sensitivityGroup: {
      type: String,
      enum: SENSITIVITY_GROUPS,
      required: true,
    },
    // true duy nhất cho lọ `savings` - đích đến mặc định của "Quét (sweep)" - US 4.2 AC3.
    isSweepTarget: {
      type: Boolean,
      default: false,
    },
    // Số dư luỹ kế hiện tại - denormalized cache, luôn tái tạo được 100% từ
    // tổng các Transaction chưa xoá (nguyên tắc thiết kế #3, Data Model muc 1).
    balance: {
      type: Number,
      default: 0,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
  },
  { timestamps: true },
);

jarSchema.index({ userId: 1, key: 1 }, { unique: true });
export const Jar = mongoose.model("Jar", jarSchema);

// 6 lọ mặc định, tỷ lệ gợi ý 55-10-10-10-10-5 (PRD muc 5.3, US 3.1 AC1).
// Không đổi thứ tự các phần tử - `order` field bên dưới phụ thuộc vị trí này
export const DEFAULT_JARS = [
  {
    key: "essential",
    displayName: "Thiết yếu",
    percentage: 55,
    sensitivityGroup: "flexible",
    isSweepTarget: false,
    order: 1,
  },
  {
    key: "savings",
    displayName: "Tiết kiệm / Đầu tư dài hạn",
    percentage: 10,
    sensitivityGroup: "sensitive",
    isSweepTarget: true,
    order: 2,
  },
  {
    key: "education",
    displayName: "Giáo dục",
    percentage: 10,
    sensitivityGroup: "flexible",
    isSweepTarget: false,
    order: 3,
  },
  {
    key: "play",
    displayName: "Hưởng thụ",
    percentage: 10,
    sensitivityGroup: "flexible",
    isSweepTarget: false,
    order: 4,
  },
  {
    key: "freedom",
    displayName: "Tự do tài chính",
    percentage: 10,
    sensitivityGroup: "sensitive",
    isSweepTarget: false,
    order: 5,
  },
  {
    key: "charity",
    displayName: "Từ thiện",
    percentage: 5,
    sensitivityGroup: "flexible",
    isSweepTarget: false,
    order: 6,
  },
];
