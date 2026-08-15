// Xac thuc Bearer JWT (access token), gan req.userId -> trả 401 nếu thiếu/hết hạn.
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return next(new AppError(401, "UNAUTHORIZED", "Thiếu access token"));
  }

  const token = header.slice("Bearer ".length).trim();

  if (!token) {
    return next(new AppError(401, "UNAUTHORIZED", "Thiếu access token"));
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.userId = payload.sub;
    next();
  } catch (err) {
    next(
      new AppError(
        401,
        "UNAUTHORIZED",
        "Access token không hợp lệ hoặc đã hết hạn",
      ),
    );
  }
}
