const STORAGE_KEY = "fund_holdings_v1";
const STORAGE_KEY_PERCENT = "fund_percent_status_v1";
const STORAGE_KEY_SORT = "fund_sort_status_v1";

export function loadHoldingsFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    return [];
  }
}

export function saveHoldingsToStorage(holdings) {
  try {
    const serialized = JSON.stringify(holdings);
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (e) {
    console.error("Failed to save holdings", e);
  }
}

export function loadPercentStatusFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PERCENT);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

export function savePercentStatusToStorage(statusMap) {
  try {
    const serialized = JSON.stringify(statusMap);
    window.localStorage.setItem(STORAGE_KEY_PERCENT, serialized);
  } catch (e) {
    console.error("Failed to save percent status", e);
  }
}

export function loadSortStatusFromStorage() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_SORT);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveSortStatusToStorage(sortStatus) {
  try {
    const serialized = JSON.stringify(sortStatus);
    window.localStorage.setItem(STORAGE_KEY_SORT, serialized);
  } catch (e) {
    console.error("Failed to save sort status", e);
  }
}
