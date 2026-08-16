// POST /auth/register, /auth/login, /auth/refresh, /auth/logout — muc 6
// Auth controller — Data Model & API Design, mục 6.
//
// Cấu hình đã chốt (không có trong tài liệu gốc):
//   - Access Token TTL: 15 phút (đúng theo mô tả "~15 phút" ở mục 5).
//   - Refresh Token TTL: 7 ngày.
//   - Mật khẩu tối thiểu 8 ký tự, bắt buộc có cả chữ và số.
//
// Các handler async ở đây KHÔNG dùng try/catch thủ công — Express 5 tự động
// chuyển Promise bị reject (kể cả từ throw trong hàm async) vào
// errorHandler.middleware.js, đúng lý do đã chọn Express 5 ở Technical Stack.

import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { z } from "zod";

import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { RefreshToken } from "../models/RefreshToken.js";
import { Jar, DEFAULT_JARS } from "../models/Jar.js";
import { AppError } from "../utils/AppError.js";
import { getOrCreateCurrentPeriod } from "../services/periodService.js";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const BCRYPT_SALT_ROUNDS = 10;

const passwordSchema = z
  .string()
  .min(8, "Mật khẩu phải có ít nhật 8 ký tự")
  .regex(/[A-Za-z]/, "Mật khẩu phải chứa ít nhất 1 chữ cái")
  .regex(/\d/, "Mật khẩu phải chứa ít nhất 1 chữ số");

const registerSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: passwordSchema,
  name: z.string().trim().min(1, "Tên không được để trống"),
});

const loginSchema = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được để trống"),
});

const refreshTokenBodySchema = z.object({
  refreshToken: z.string().min(1, "refreshToken không được để trống"),
});

function parseOrThrow(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      422,
      "VALIDATION_ERROR",
      "Dữ liệu gửi lên không hợp lệ",
      result.error.flatten().fieldErrors,
    );
  }
  return result.data;
}

function signAccessToken(userId) {
  return jwt.sign({ sub: String(userId) }, env.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function hashRefreshToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function issueRefreshToken(userId) {
  const rawToken = crypto.randomBytes(64).toString("hex");
  const tokenHash = hashRefreshToken(rawToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

  await RefreshToken.create({
    userId,
    tokenHash,
    expiresAt,
    revoked: false,
  });

  // Raw token chỉ tồn tại ở response này - DB chỉ lưu bản hash
  return rawToken;
}

export async function register(req, res) {
  const { email, password, name } = parseOrThrow(registerSchema, req.body);
  const normalizedEmail = email.toLowerCase();

  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new AppError(409, "EMAIL_ALREADY_EXISTS", "Email đã được đăng ký");
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

  const user = await User.create({
    email: normalizedEmail,
    passwordHash,
    name,
  });

  // Giai đoạn 2: seed 6 Jar mặc định (55-10-10-10-10-5) + tạo FinancialPeriod
  // đầu tiên (status: 'open') ngay khi đăng ký - US 3.1 AC1.
  // Không dùng Mongo transaction ở đây (tương tự lý do đã ghi chú ở jar.controller.js#updateJarRatios):
  // seed dữ liệu của chính user vừa tạo, rủi ro va chạm gần như bằng 0, và tránh phụ thuộc replica set khi dev.
  await Jar.insertMany(
    DEFAULT_JARS.map((jar) => ({ ...jar, userId: user._id })),
  );

  await getOrCreateCurrentPeriod(user._id);
  // `hasCompletedJarSetup` không được set true ở đây: field này gate màn
  // hình thiết lập tỷ lệ lọ lần đầu (US 3.1 AC1) phía Frontend -user vẫn cần
  // đi qua/xác nhận màn hình đó dù đã có sẵn tỷ lệ gợi ý mặc định. Việc set true sẽ là
  // trách nhiệm của luồng "hoàn tất thiết lập lọ" khi Frontend được triển khai.

  const accessToken = signAccessToken(user._id);
  const refreshToken = await issueRefreshToken(user._id);

  res.status(201).json({ user, accessToken, refreshToken });
}

export async function login(req, res) {
  const { email, password } = parseOrThrow(loginSchema, req.body);
  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Email hoặc mật khẩu không đúng",
    );
  }
  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new AppError(
      401,
      "INVALID_CREDENTIALS",
      "Email hoặc mật khẩu không đúng",
    );
  }

  const accessToken = signAccessToken(user._id);
  const refreshToken = await issueRefreshToken(user._id);

  res.status(200).json({ user, accessToken, refreshToken });
}

export async function refresh(req, res) {
  const { refreshToken } = parseOrThrow(refreshTokenBodySchema, req.body);
  const tokenHash = hashRefreshToken(refreshToken);

  const record = await RefreshToken.findOne({ tokenHash, revoked: false });
  if (!record || record.expiresAt <= new Date()) {
    throw new AppError(
      401,
      "INVALID_REFRESH_TOKEN",
      "Refresh token không hợp lệ hoặc đã hết hạn",
    );
  }

  const user = await User.findById(record.userId);
  if (!user) {
    throw new AppError(
      401,
      "INVALID_REFRESH_TOKEN",
      "Refresh token không hợp lệ hoặc đã hết hạn",
    );
  }

  const accessToken = signAccessToken(user._id);

  // Chỉ cấp access token mới, giữ nguyên refresh token hiện có (đúng mô tả
  // "Cấp access token mới từ refresh token" ở Data Model, mục 6 — không có
  // yêu cầu xoay vòng/rotate refresh token).
  res.status(200).json({ accessToken });
}

export async function logout(req, res) {
  const { refreshToken } = parseOrThrow(refreshTokenBodySchema, req.body);
  const tokenHash = hashRefreshToken(refreshToken);

  await RefreshToken.updateOne({ tokenHash }, { $set: { revoked: true } });

  res.status(200).json({ message: "Đã đăng xuất" });
}
