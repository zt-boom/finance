const STORAGE_KEY = "fund_holdings_v1";
const AUTO_REFRESH_SECONDS = 300;
const DEBOUNCE_DELAY = 60;
const FUND_CODE_PATTERN = /(\d{6})/;
const RESOLVED_PATTERN = /^\d{6}\s{2}.+/;

const TRADING_TIME = {
  MORNING_START: 9 * 60 + 30,
  MORNING_END: 11 * 60 + 30,
  AFTERNOON_START: 13 * 60,
  AFTERNOON_END: 15 * 60
};

const COLORS = {
  POSITIVE: "#ef4444",
  NEGATIVE: "#10b981",
  ZERO: "#6b7280",
  DEFAULT: "#6b7280"
};

const API_BASE_URL = "https://fundgz.1234567.com.cn/js";
const FUND_DETAIL_URL = "https://fund.eastmoney.com";
