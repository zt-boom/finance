const STORAGE_KEY = "fund_holdings_v1";
const STORAGE_KEY_PERCENT = "fund_percent_status_v1";
const STORAGE_KEY_SORT = "fund_sort_status_v1";
const STORAGE_KEY_TREND = "fund_trend_history_v1";

import { isChromeExtensionEnv, getTodayDateString } from './utils.js';

// 兼容层：如果不在 Chrome 插件环境，回退到 localStorage
const storage = {
  get: (key, defaultValue) => {
    return new Promise((resolve) => {
      if (isChromeExtensionEnv()) {
        const storageArea = chrome.storage.sync || chrome.storage.local;
        storageArea.get([key], (result) => {
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        });
      } else {
        try {
          const raw = window.localStorage.getItem(key);
          resolve(raw ? JSON.parse(raw) : defaultValue);
        } catch (e) {
          resolve(defaultValue);
        }
      }
    });
  },
  set: (key, value) => {
    return new Promise((resolve) => {
      if (isChromeExtensionEnv()) {
        const storageArea = chrome.storage.sync || chrome.storage.local;
        storageArea.set({ [key]: value }, resolve);
      } else {
        try {
          window.localStorage.setItem(key, JSON.stringify(value));
          resolve();
        } catch (e) {
          console.error(`Failed to save ${key}`, e);
          resolve();
        }
      }
    });
  }
};

// --- API ---

// 注意：现在所有 Storage 操作都变成异步的了！
// 为了保持向后兼容性（不重构 main.js 的所有同步调用），我们可能需要一种折中方案。
// 但 Chrome Storage API 只能异步。
// 方案：
// 1. 初始化时全量读取到内存变量。
// 2. 读操作直接读内存变量（同步）。
// 3. 写操作同时更新内存和异步 Storage。
// 4. 在 main.js 初始化时，先 await 初始化数据。

let cachedHoldings = [];
let cachedPercentStatus = {};
let cachedSortStatus = null;
let cachedTrendHistory = {};
let isInitialized = false;

export async function initStorage() {
  if (isInitialized) return;
  
  cachedHoldings = await storage.get(STORAGE_KEY, []);
  cachedPercentStatus = await storage.get(STORAGE_KEY_PERCENT, {});
  cachedSortStatus = await storage.get(STORAGE_KEY_SORT, null);
  cachedTrendHistory = await storage.get(STORAGE_KEY_TREND, {});
  
  // 检查 TrendHistory 日期，如果不是今天则重置
  const today = getTodayDateString().split(' ')[0];
  if (cachedTrendHistory.date !== today) {
    cachedTrendHistory = { date: today, data: [] };
    storage.set(STORAGE_KEY_TREND, cachedTrendHistory);
  }
  
  isInitialized = true;
}

export function loadHoldingsFromStorage() {
  return cachedHoldings;
}

export function saveHoldingsToStorage(holdings) {
  cachedHoldings = holdings;
  storage.set(STORAGE_KEY, holdings).then(() => {
    // 通知 background 更新
    if (isChromeExtensionEnv()) {
        try {
            chrome.runtime.sendMessage({ type: "holdingsUpdated" });
        } catch(e) { /* ignore */ }
    }
  });
}

export function loadPercentStatusFromStorage() {
  return cachedPercentStatus;
}

export function savePercentStatusToStorage(statusMap) {
  cachedPercentStatus = statusMap;
  // 百分比状态数据较大且频繁变化，建议仅存 local，不存 sync，避免配额超限
  // 这里做一个特殊处理：如果是 Chrome 环境，percentStatus 强制存 local
  if (isChromeExtensionEnv()) {
    chrome.storage.local.set({ [STORAGE_KEY_PERCENT]: statusMap });
  } else {
    storage.set(STORAGE_KEY_PERCENT, statusMap);
  }
}

export function loadSortStatusFromStorage() {
  return cachedSortStatus;
}

export function saveSortStatusToStorage(sortStatus) {
  cachedSortStatus = sortStatus;
  storage.set(STORAGE_KEY_SORT, sortStatus);
}

export function loadTrendHistoryFromStorage() {
    return cachedTrendHistory;
}

export function saveTrendPointToStorage(point) {
    const today = getTodayDateString().split(' ')[0];
    if (cachedTrendHistory.date !== today) {
        cachedTrendHistory = { date: today, data: [] };
    }
    
    // 避免重复时间点 (分钟级)
    const lastPoint = cachedTrendHistory.data[cachedTrendHistory.data.length - 1];
    if (lastPoint && lastPoint.time === point.time) {
        // 更新最后一个点
        lastPoint.profit = point.profit;
    } else {
        cachedTrendHistory.data.push(point);
    }
    
    // 只保留最近的 N 个点 (可选，例如保留全天的分钟点大约 240 个)
    // 交易时间 4小时 = 240分钟
    
    if (isChromeExtensionEnv()) {
         chrome.storage.local.set({ [STORAGE_KEY_TREND]: cachedTrendHistory });
    } else {
         storage.set(STORAGE_KEY_TREND, cachedTrendHistory);
    }
}
