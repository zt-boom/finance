export const APP_CONFIG = {
  // 刷新间隔（秒）
  REFRESH_INTERVAL: 60,
  
  // 接口请求超时（毫秒）
  REQUEST_TIMEOUT: 8000,
  
  // 最大重试次数
  MAX_RETRIES: 3,
  
  // 重试延迟（毫秒）
  RETRY_DELAY: 1000,
  
  // 交易时段配置
  TRADING_HOURS: {
    MORNING_START: 9 * 60 + 20, // 09:20
    AFTERNOON_END: 15 * 60 + 10, // 15:10
    EVENING_START: 18 * 60, // 18:00
    EVENING_END: 22 * 60 // 22:00
  },
  
  // 自动保存防抖时间（毫秒）
  STORAGE_DEBOUNCE: 500,
  
  // 收益计算防抖时间（毫秒）
  PROFIT_CALC_DEBOUNCE: 60,
  
  // 颜色配置
  COLORS: {
    POSITIVE: "#ef4444",
    NEGATIVE: "#10b981",
    ZERO: "#6b7280"
  }
};
