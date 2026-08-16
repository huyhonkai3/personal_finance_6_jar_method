// Ham lam tron / dinh dang so tien (don vi: dong, luon la so nguyen)
//
// parseAmountToken() là hàm THUẦN cấp thấp: nhận vào 1 "token số tiền" đã
// được tách sẵn từ text (VD "30k", "30.000", "15 triệu") và trả về giá trị
// số nguyên (đồng). Việc TÌM token này ở đâu trong 1 câu dài là trách nhiệm
// của parsingService.js (Data Model muc 17 ghi rõ: "Tách số tiền từ text"
// thuộc parsingService, không phải money.js).
//
// Hỗ trợ:
//   - Số trần: "30000"
//   - Số có dấu . / , làm phân cách hàng nghìn (quy ước VN): "30.000"
//   - Hậu tố viết tắt: "k"/"nghìn"/"ngàn" (x1.000), "tr"/"triệu" (x1.000.000)
//   - Khi có hậu tố, dấu . / , được hiểu là dấu THẬP PHÂN: "1.5tr" = 1.500.000
//   - Hậu tố tiền tệ thuần (không đổi độ lớn): "đ", "d", "vnd"
const SCALE_MULTILIERS = {
  k: 1_000,
  nghin: 1_000,
  ngan: 1_000,
  tr: 1_000_000,
  trieu: 1_000_000,
};

// Regex bắt 1 token số tiền: phần số (\d kèm . hoặc , xen giữa) + tuỳ chọn
// hậu tố đơn vị. Cờ "g" để parsingService dùng .exec() lặp/tìm vị trí trong
// câu dài; nhớ reset `lastIndex = 0` trước mỗi lần dùng lại (regex có state).
export const AMOUNT_TOKEN_REGEX =
  /\d[\d.,]*\s*(?:nghìn|nghin|ngàn|ngan|triệu|trieu|vnd|đ|d|k|tr)?/giu;

function normalizeUnitWord(word) {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * @param {string} token - VD "30k" "30.000", "15 triệu", "15 tr"
 * @returns {number | null} số tiền (đồng), null nếu không parse được
 */
export function parseAmountToken(token) {
  if (!token) return null;

  const match = token.match(
    /(\d[\d.,]*)\s*(nghìn|nghin|ngàn|ngan|triệu|trieu|vnd|đ|d|k|tr)?/iu,
  );
  if (!match) return null;

  const [, numberPart, unitPartRaw] = match;
  const unit = unitPartRaw ? normalizeUnitWord(unitPartRaw) : null;
  const scaleMultiplier = unit ? SCALE_MULTILIERS[unit] : undefined;
  const hasScaleSuffix = Boolean(scaleMultiplier);

  // Có hậu tố quy mô (k/tr/nghìn/triệu) -> dấu .,  là THẬP PHÂN.
  // Không có (kể cả hậu tố tiền tệ thuần đ/d/vnd, hoặc không hậu tố gì) ->
  // dấu ., là PHÂN CÁCH HÀNG NGHÌN, bỏ hết trước khi parse.
  const normalizedNumber = hasScaleSuffix
    ? numberPart.replace(",", ".")
    : numberPart.replace(/[.,]/g, "");

  const value = Number(normalizedNumber);
  if (!Number.isFinite(value) || value < 0) return null;

  const multiplier = hasScaleSuffix ? scaleMultiplier : 1;
  return Math.round(value * multiplier);
}

/**
 * Làm tròn đến hàng nghìn - dùng cho chế độ hiển thị "rounded"
 * (User.settings.balanceDisplayMode - US2.5), sẽ được nối vào response
 * format thực sự ở Giai đoạn 4.
 */
export function roundToThousand(amount) {
  return Math.round(amount / 1000) * 1000;
}
