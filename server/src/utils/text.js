// Chuẩn hoá text tiếng Việt - dùng chung bởi parsingService (rule-based
// keyword matching, nhận diện Thu nhập) và PersonalDictionaryRule (khớp từ
// khóa cá nhân, lưu keyword đã chuẩn hoá). Mục tiêu: việc so khớp không phụ
// thuộc người dùng gõ có dấu/không dấu, hoa/thường, hay thừa khoảng trắng.
// VD: normalizeText("Mua  Sách!") -> "mua sach!"
//     normalizeText("ăn trưa")    -> "an trua"
export function normalizeText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu thanh/dấu phụ
    .replace(/[đĐ]/g, "d") // đ không bị NFD tách (là ký tự riêng, không phải base+combining)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Kiểm tra `normalizedKeyword` có xuất hiện trong `normalizedText` dưới
 * dạng CỤM TỪ TRỌN VẸN (có ranh giới từ ở 2 đầu) hay không - tránh khớp
 * nhầm vào giữa 1 từ khác (VD keyword "an" không được khớp vào giữa từ
 * "ngan" - "ngân hàng" sau khi chuẩn hoá).
 *
 * @param {string} normalizedText - đã qua normalizeText()
 * @param {string} normalizedKeyword - đã qua normalizeText()
 */
export function containsKeyword(normalizedText, normalizedKeyword) {
  if (!normalzedKeyword) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i");
  return pattern.test(normalizedText);
}
