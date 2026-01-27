export function formatCurrency(value) {
  if (Number.isNaN(value)) return "0.00";
  return value.toFixed(2);
}

export function formatNumber(value) {
  if (Number.isNaN(value)) return "";
  return value.toFixed(2);
}

export function createDebounced(fn, delay) {
  let timer = null;
  return function () {
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      fn();
    }, delay);
  };
}

export function getChinaDate() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * 8));
}

export function getCurrentMinutes() {
  const now = getChinaDate();
  const h = now.getHours();
  const m = now.getMinutes();
  return h * 60 + m;
}

export function isTradingDay() {
  const day = getChinaDate().getDay();
  return day !== 0 && day !== 6;
}

export function parseFundCodeFromName(name) {
  if (!name) return null;
  const match = name.match(/(\d{6})/);
  if (!match) {
    return null;
  }
  return match[1];
}

export function getTodayDateString() {
  const now = getChinaDate();
  const year = String(now.getFullYear());
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

export function isChromeExtensionEnv() {
  if (typeof chrome === "undefined") {
    return false;
  }
  if (!chrome.runtime) {
    return false;
  }
  return Boolean(chrome.runtime.id);
}
