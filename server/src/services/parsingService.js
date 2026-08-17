// Tách rawText -> { amount, description, isIncome, jarId(dự đoán), isPredicted }
// Áp dụng PersonalDictionaryRule trước, fallback rule-based keyword matching
// Tham chiếu: US1.1, US1.3, US1.4, US2.1

import { Jar } from "../models/Jar.js";
import { PersonalDictionaryRule } from "../models/PersonalDictionaryRule.js";
import { AMOUNT_TOKEN_REGEX, parseAmountToken } from "../utils/money.js";
import { containsKeyword, normalizeText } from "../utils/text.js";

const FALLBACK_JAR_KEY = "essential";

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

export function extractAmount(rawText) {
  AMOUNT_TOKEN_REGEX.lastIndex = 0;
  const match = AMOUNT_TOKEN_REGEX.exec(rawText);
  if (!match) return null;

  const amount = parseAmountToken(match[0]);
  if (amount === null) return null;

  return { amount, matchedText: match[0] };
}

export function extractDescription(rawText, matchedText) {
  let remainder = rawText;
  if (matchedText) {
    remainder = remainder.replace(matchedText, " ");
  }
  return remainder
    .replace(/[:\-–—]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectIsIncome(rawText) {
  const normalized = normalizeText(rawText);
  return INCOME_KEYWORDS.some((keyword) =>
    containsKeyword(normalized, normalizeText(keyword)),
  );
}

export function matchDictionaryRule(rules, normalizedText) {
  const matched = rules
    .filter((rule) => containsKeyword(normalizedText, rule.keyword))
    .sort((a, b) => b.keyword.length - a.keyword.length);
  return matched[0] ?? null;
}

export function matchDefaultJarKey(normalizedText) {
  for (const [jarKey, keywords] of Object.entries(DEFAULT_JAR_KEYWORDS)) {
    const isMatched = keywords.some((keyword) =>
      containsKeyword(normalizedText, normalizeText(keyword)),
    );
    if (isMatched) return jarKey;
  }
  return FALLBACK_JAR_KEY;
}

export async function classifyJar(userId, rawText) {
  const normalized = normalizeText(rawText);

  const rules = await PersonalDictionaryRule.find({ userId }).lean();
  const rule = matchDictionaryRule(rules, normalized);

  if (rule) {
    return {
      jarId: rule.jarId,
      isPredicted: false,
      matchedDictionaryRuleId: rule._id,
      predictionConfidence: null,
    };
  }

  const jarKey = matchDefaultJarKey(normalized);
  const jar = await Jar.findOne({ userId, key: jarKey }).lean();

  return {
    jarId: jar?._id ?? null,
    isPredicted: true,
    matchedDictionaryRuleId: null,
    predictionConfidence: jarKey === FALLBACK_JAR_KEY ? 0.3 : 0.6,
  };
}

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
