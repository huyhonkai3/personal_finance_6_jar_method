// GET /notifications, PATCH /notifications/:id/read — muc 14 / Giai đoạn 5.
import { Notification } from "../models/Notification.js";
import { AppError } from "../utils/AppError.js";

export async function listNotifications(req, res) {
  const { isRead, page = 1, limit = 20 } = req.query;

  const filter = { userId: req.userId };
  if (typeof isRead === "boolean") filter.isRead = isRead;

  const [notifications, total] = await Promise.all([
    Notification.find(filter)
      .sort({ sentAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
  ]);

  res.status(200).json({
    notifications,
    pagination: { page, limit, total },
  });
}

export async function markNotificationRead(req, res) {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: { isRead: true } },
    { new: true },
  );

  if (!notification) {
    throw new AppError(
      404,
      "NOTIFICATION_NOT_FOUND",
      "Không tìm thấy thông báo",
    );
  }

  res.status(200).json({ notification });
}
