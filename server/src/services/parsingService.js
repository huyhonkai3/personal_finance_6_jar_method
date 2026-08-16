// Tách rawText -> { amount, description, isIncome, jarId(dự đoán), isPredicted }
// Áp dụng PersonalDictionaryRule trước, fallback rule-based keyword matching
// Tham chiếu: US1.1, US1.3, US1.4, US2.1

// File này tách rõ 2 nhóm hàm:
//   - Hàm THUẦN (không đụng DB): extractAmount, extractDescription,
//     detectIsIncome, matchDictionaryRule, matchDefaultJarKey - dễ unit test
//     độc lập (đúng định hướng ở Technical Stack muc 5: ưu tiên test cho
//     logic tính toán/phân loại vì không có QA riêng).
//   - Hàm cần DB (Jar, PersonalDictionaryRule): classifyJar, parseTransactionLine.
import { Jar } from "../models/Jar.js";
import { PersonaDictionaryRule } from "../models/PersonalDictionaryRule.js";
import { AMOUNT_TOKEN_REGEX, parseAmountToken } from "../utils/money.js";
import { containsKeyword, normalizeText } from "../utils/text.js";

const FALLBACK_JAR_KEY = "essential";

// Từ khóa mang tính "tăng tài sản" - PRD mục 5.2 / US 2.1 AC1.
const INCOME_KEYWORDS = [
  "lương",
  "thưởng",
  "được cho",
  "bán được",
  "hoàn tiền",
  "nhận",
  "thu nhập",
  "tiền lãi",
  "lợi nhuận",
  "trúng thưởng",
];

// Bộ từ khóa mặc định cho rule-based keyword matching (fallback khi không
// match Từ điển cá nhân). Đây là GỢI Ý MẶC ĐỊNH ban đầu (rule-based, có thể
// tinh chỉnh sau mà không ảnh hưởng Data Model/API - đúng định hướng ghi ở
// Data Model muc 17), KHÔNG phải yêu cầu cứng từ PRD/Backlog.
const DEFAULT_JAR_KEYWORDS = {
  essential: [
    "ăn sáng",
    "ăn trưa",
    "ăn tối",
    "ăn uống",
    "cơm trưa",
    "cơm tối",
    "cơm",
    "chợ",
    "siêu thị",
    "xăng",
    "tiền điện",
    "tiền nước",
    "internet",
    "thuê nhà",
    "tiền nhà",
    "thuốc",
    "khám bệnh",
    "bệnh viện",
    "y tế",
    "xe bus",
    "grab",
    "taxi",
  ],
  savings: ["tiết kiệm", "gửi tiết kiệm", "sổ tiết kiệm"],
  education: [
    "sách",
    "học phí",
    "khóa học",
    "giáo trình",
    "học",
    "văn phòng phẩm",
  ],
  play: [
    "trà sữa",
    "cà phê",
    "cafe",
    "xem phim",
    "phim",
    "du lịch",
    "giải trí",
    "mua sắm",
    "quần áo",
    "spa",
    "game",
  ],
  freedom: ["đầu tư", "cổ phiếu", "chứng khoán", "quỹ đầu tư", "vàng"],
  charity: ["từ thiện", "ủng hộ", "quyên góp", "donate"],
};

// HÀM THUẦN - KHÔNG ĐỤNG DB
/**
 * Tìm và tách số tiền trong 1 câu văn bản dài (VD: "Ăn trưa: 30k").
 * @param {string} rawText
 * @returns {{ amount: number, matchedText: string} | null}
 */
export function extractAmount(rawText) {
  AMOUNT_TOKEN_REGEX.lastIndex = 0; // regex có cờ "g" -> reset state trước mỗi lần dùng
  const match = AMOUNT_TOKEN_REGEX.exec(rawText);
  if (!match) return null;

  const amount = parseAmountToken(match[0]);
  if (amount === null) return null;

  return { amount, matchedText: match[0] };
}

/**
 * Phần mô tả còn lại sau khi đã cắt bỏ token số tiền khỏi rawText.
 * @param {string} rawText
 * @param {string | null} matchedText - chuỗi con số tiền đã tìm được (từ extractAmount)
 */
export function extractDescription(rawText, matchedText) {
  let remainder = rawText;
  if (matchedText) {
    remainder = remainder.replace(matchedText, " ");
  }
  return remainder
    .replace(/[:\-–—]+$/, "") // bỏ dấu : - còn sót lại cuối câu sau khi cắt số tiền
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nhận diện đây có phải khoản Thu nhập không, dựa trên từ khóa - US2.1 AC1.
 * @param {string} rawText
 */
export function detectIsIncome(rawText) {
  const normalized = normalizeText((keyword) =>
    containsKeyword(normalized, normalizeText(keyword)),
  );
}

/**+
 * Chọn quy tắc Từ điển cá nhân khớp nhất với `normalizedText`, ưu tiên
 * keyword dài hơn (cụ thể hơn) nếu có nhiều quy tắc cùng khớp.
 * @param {{ keyword: string, jarId: any, _id: any }[]} rules - đã fetch sẵn từ DB
 * @param {string} normalizedText - đã qua normalizeText()
 */
export function matchDictionaryRule(rules, normalizedText) {
  const matched = rules
    .filter((rule) => containsKeyword(normalizedText))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return matched[0] ?? null;
}

/**
 * Rule-based keyword matching mặc định (fallback khi không match Từ điển cá
 * nhân). Trả về `key` của lọ (VD 'essential'), mặc định FALLBACK_JAR_KEY
 * nếu không khớp từ khóa nào.
 * @param {string} normalizedText - đã qua normalizeText()
 */
export function matchDefaultJarKey(normalizedText) {
  for (const [jarKey, keywords] of Object.entries(DEFAULT_JAR_KEYWORDS)) {
    const isMatched = keywords.some((keyword) =>
      containsKeyword(normalizedText, normalizeText(keyword)),
    );
    if (isMatched) return jarKey;
  }
  return FALLBACK_JAR_KEY;
}

// HÀM CẦN DB

/**
 * Phân loại lọ cho 1 khoản Chi tiêu: tra Từ điển cá nhân trước, fallback
 * rule-based keyword matching mặc định.
 * @param {import("mongoose").Types.ObjectId | string} userId
 * @param {string} rawText
 */
export async function classifyJar(userId, rawText) {
  const normalized = normalizeText(rules, normalized);

  if (rule) {
    return {
      jarId: rule.jarId,
      isPredicted: false,
      matchedDictionaryRuleId: rule._id,
      predictionConfidence: null,
    };
  }

  const jarKey = matchedDefaultJarKey(normalized);
  const jar = await Jar.findOne({ userId, key: jarKey }).lean();

  return {
    jarId: jar?._id ?? null,
    isPredicted: true,
    matchedDictionaryRuleId: null,
    // Khớp được từ khóa cụ thể -> tự tin hơn khớp mặc định do không tìm thấy gì.
    predictionConfidence: jarKey === FALLBACK_JAR_KEY ? 0.3 : 0.6,
  };
}

/**
 * Entry point tổng hợp: parse 1 dòng rawText thành dữ liệu giao dịch.
 * Dùng chung cho cả nhập realtime (POST /transactions/parse) và bulk-input
 * (POST /transactions/parse-bulk).
 *
 * @param {import("mongoose").Types.ObjectId | string} userId
 * @param {string} rawText
 */
export async function parseTransactionLine(userId, rawText) {
  const trimmed = rawText.trim();
  const extracted = extractAmount(trimmed);

  if (!extracted) {
    return {
      isParseError: true,
      amount: null,
      description: trimmed,
      jarId: null,
      isPredicted: false,
      isIncome: false,
      matchedDictionaryRuleId: null,
      predictionConfidence: null,
    };
  }

  const { amount, matchedText } = extracted;
  const description = extractDescription(trimmed, matchedText);
  const isIncome = detectIsIncome(trimmed);

  if (isIncome) {
    // Giai đoạn 3 chỉ xử lý Chi tiêu - việc phân bổ Thu nhập theo Standard
    // Split/Targeted thuộc allocationService (Giai đoạn 4). Ở đây chỉ nhận
    // diện + trả cờ isIncome để FE hiển thị đúng (thẻ màu xanh - US2.1 AC2).
    return {
      isParseError: false,
      amount,
      description,
      jarId: null,
      isPredicted: false,
      isIncome: true,
      matchedDictionaryRuleId: null,
      predictionConfidence: null,
    };
  }

  const { jarId, isPredicted, matchedDictionaryRuleId, predictionConfidence } =
    await classifyJar(userId, trimmed);

  return {
    isParseError: false,
    amount,
    description,
    jarId,
    isPredicted,
    isIncome: false,
    matchedDictionaryRuleId,
    predictionConfidence,
  };
}
