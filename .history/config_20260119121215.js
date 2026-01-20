export const STORAGE_KEY = "fund_holdings_v1";
export const AUTO_REFRESH_SECONDS = 300;
export const DEBOUNCE_DELAY = 60;
export const FUND_CODE_PATTERN = /(\d{6})/;
export const RESOLVED_PATTERN = /^\d{6}\s{2}.+/;

export const TRADING_TIME = {
  MORNING_START: 9 * 60 + 30,
  MORNING_END: 11 * 60 + 30,
  AFTERNOON_START: 13 * 60,
  AFTERNOON_END: 15 * 60
};

export const COLORS = {
  POSITIVE: "#ef4444",
  NEGATIVE: "#10b981",
  ZERO: "#6b7280",
  DEFAULT: "#6b7280"
};

export const API_BASE_URL = "https://fundgz.1234567.com.cn/js";
export const FUND_DETAIL_URL = "https://fund.eastmoney.com";
