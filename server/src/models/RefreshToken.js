// Mongoose schema: RefreshToken
// Field & index chi tiết: docs/Data_Model_va_API_Design_Ung_dung_Quan_ly_Tai_chinh_6_Lo.md (muc 3.11)
// tokenHash dùng SHA-256 (không dùng bcrypt như password). bcrypt sinh salt ngẫu nhiên mỗi lần hash.
// SHA-256 deterministic (cùng input -> cùng output) nên tra đc ngay.
import mongoose, { mongo } from "mongoose";

const refreshTokenSchema = mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    // TTL = 7 ngày kể từ lúc phát hành.
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

// TTL index - MongoDB tự xóa document sau khi quá expiresAt.
refreshTokenSchema.index({ expiresAt: 1 }, { expiresAfterSeconds: 0 });

export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
