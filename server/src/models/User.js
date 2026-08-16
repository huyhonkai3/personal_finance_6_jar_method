// Mongoose schema: User
// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.1)
import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    settings: {
      // Ngày nhận lương cố định - US 2.4. Nullable vì không phải ai cũng có lương cố định.
      salaryDay: {
        type: Number,
        min: 1,
        max: 31,
        default: null,
      },
      // Ngày chốt sổ
      monthEndDay: {
        type: Number,
        min: 1,
        max: 31,
        default: 1,
      },
      // US 2.5
      balanceDisplayMode: {
        type: String,
        enum: ["rounded", "exact"],
        default: "rounded",
      },
      // Tính mốc 23:59 chính xác - US 4.3
      timezone: {
        type: String,
        default: "Asia/Ho_Chi_Minh",
      },
    },
    // Gate màn hình thiết lập lần đầu - US 3.1 AC1.
    hasCompletedJarSetup: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// passwordHash không bao giờ lọt vào response JSON.
// kể cả khi 1 endpoint nào đó trả thẳng cả document User.
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model("User", userSchema);
