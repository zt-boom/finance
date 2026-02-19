import { isChromeExtensionEnv } from './utils.js';
import { APP_CONFIG } from './config.js';

const fundJsonpMap = new Map();
// 用于存储正在进行的请求 Promise，实现请求去重
const pendingRequests = new Map();

function ensureJsonpHandler() {
  if (window._fundJsonpInitialized) {
    return;
  }
  window._fundJsonpInitialized = true;
  window.jsonpgz = function (data) {
    if (!data || !data.fundcode) {
      return;
    }
    const code = data.fundcode;
    const requests = fundJsonpMap.get(code) || [];
    fundJsonpMap.delete(code);
    for (let i = 0; i < requests.length; i += 1) {
      const request = requests[i];
      try {
        const value = request.transform ? request.transform(data) : data;
        request.resolve(value);
      } catch (e) {
        if (request.reject) {
          if (e instanceof Error) {
            request.reject(e);
          } else {
            request.reject(new Error("解析基金数据失败"));
          }
        }
      }
    }
    const scripts = document.querySelectorAll(`script[data-fund-code="${code}"]`);
    scripts.forEach(script => {
      const parent = script.parentNode;
      if (parent) {
        parent.removeChild(script);
      }
    });
  };
}

function fetchFundJsonp(code, transform) {
  return new Promise((resolve, reject) => {
    const timeoutMs = APP_CONFIG.REQUEST_TIMEOUT;
    let timer = null;
    let requestObj = null;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    try {
      ensureJsonpHandler();
    } catch (e) {
      reject(new Error("初始化JSONP处理器失败"));
      return;
    }

    timer = setTimeout(() => {
      const list = fundJsonpMap.get(code);
      if (list) {
        const idx = list.indexOf(requestObj);
        if (idx !== -1) {
          list.splice(idx, 1);
        }
        if (list.length === 0) {
          fundJsonpMap.delete(code);
          const scripts = document.querySelectorAll(`script[data-fund-code="${code}"]`);
          scripts.forEach(s => s.remove());
        }
      }
      reject(new Error("请求超时"));
    }, timeoutMs);

    requestObj = {
      code,
      resolve: (val) => {
        cleanup();
        resolve(val);
      },
      reject: (err) => {
        cleanup();
        reject(err);
      },
      transform: transform || (d => d)
    };

    try {
      const list = fundJsonpMap.get(code) || [];
      list.push(requestObj);
      fundJsonpMap.set(code, list);

      const script = document.createElement("script");
      script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
      script.dataset.fundCode = code;
      script.onerror = () => {
        const list = fundJsonpMap.get(code) || [];
        fundJsonpMap.delete(code);
        for (let i = 0; i < list.length; i += 1) {
          // This will trigger the reject wrapper which calls cleanup
          list[i].reject(new Error("获取基金数据失败"));
        }
        script.remove();
      };
      document.body.appendChild(script);
    } catch (e) {
      cleanup();
      reject(new Error("创建请求脚本失败"));
    }
  });
}

function fetchFundJsonViaExtension(code) {
  return new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (!isChromeExtensionEnv()) {
      reject(new Error("当前环境不是 Chrome 插件"));
      return;
    }
    // 添加超时保护
    const timer = setTimeout(() => {
        reject(new Error("请求超时"));
    }, APP_CONFIG.REQUEST_TIMEOUT);

    try {
      chrome.runtime.sendMessage(
        { type: "fetchFundJson", code },
        response => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error("获取基金数据失败"));
            return;
          }
          if (!response || !response.ok || !response.data) {
            const message = response && response.error ? response.error : "获取基金数据失败";
            reject(new Error(message));
            return;
          }
          resolve(response.data);
        }
      );
    } catch (e) {
      clearTimeout(timer);
      reject(new Error("获取基金数据失败"));
    }
  });
}

/**
 * 带重试机制的通用 Fetch 函数
 * @param {Function} fetchFn - 执行请求的函数，返回 Promise
 * @param {string} requestKey - 请求唯一标识，用于去重
 * @param {number} retries - 剩余重试次数
 * @returns {Promise<any>}
 */
async function fetchWithRetry(fetchFn, requestKey, retries = APP_CONFIG.MAX_RETRIES) {
  // 请求去重：如果已有相同的请求在进行中，直接返回该 Promise
  if (pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey);
  }

  const promise = (async () => {
    try {
      return await fetchFn();
    } catch (error) {
      if (retries > 0) {
        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, APP_CONFIG.RETRY_DELAY));
        // 递归重试，不经过 pendingRequests 缓存，因为上一次失败了
        return fetchWithRetry(fetchFn, `${requestKey}_retry_${retries}`, retries - 1);
      }
      throw error;
    } finally {
        // 请求完成（无论成功失败），移除缓存
        if (pendingRequests.get(requestKey) === promise) {
            pendingRequests.delete(requestKey);
        }
    }
  })();

  pendingRequests.set(requestKey, promise);
  return promise;
}

export function fetchFundRealPercent(code) {
  const fetchFn = () => new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (!isChromeExtensionEnv()) {
      reject(new Error("当前环境不是 Chrome 插件"));
      return;
    }
    
    // 添加超时保护
    const timer = setTimeout(() => {
        reject(new Error("请求超时"));
    }, APP_CONFIG.REQUEST_TIMEOUT);

    try {
      chrome.runtime.sendMessage(
        { type: "fetchFundRealPercent", code },
        response => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            reject(new Error("获取基金真实涨跌幅失败"));
            return;
          }
          if (!response || !response.ok || !response.data || typeof response.data.percent !== "number" || Number.isNaN(response.data.percent)) {
            const message = response && response.error ? response.error : "获取基金真实涨跌幅失败";
            reject(new Error(message));
            return;
          }
          resolve(response.data);
        }
      );
    } catch (e) {
      clearTimeout(timer);
      reject(new Error("获取基金真实涨跌幅失败"));
    }
  });

  return fetchWithRetry(fetchFn, `real_${code}`);
}

export function fetchFundEstimate(code) {
  const fetchFn = () => new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (isChromeExtensionEnv()) {
      fetchFundJsonViaExtension(code).then(data => {
        const percent = parseFloat(data.gszzl);
        if (Number.isNaN(percent)) {
          reject(new Error("无效的涨跌幅数据"));
          return;
        }
        resolve(percent);
      }).catch(reject);
      return;
    }

    fetchFundJsonp(code, data => {
      const percent = parseFloat(data.gszzl);
      if (Number.isNaN(percent)) {
        throw new Error("无效的涨跌幅数据");
      }
      return percent;
    }).then(resolve).catch(reject);
  });

  return fetchWithRetry(fetchFn, `estimate_${code}`);
}

export function fetchFundInfo(code) {
  const fetchFn = () => new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (isChromeExtensionEnv()) {
      fetchFundJsonViaExtension(code).then(resolve).catch(reject);
      return;
    }

    fetchFundJsonp(code, data => data).then(resolve).catch(reject);
  });
  
  // 基金基本信息通常不常变，也可以重试，但通常只在添加时调用一次
  return fetchWithRetry(fetchFn, `info_${code}`);
}

export function updateExtensionBadge(value) {
  if (!isChromeExtensionEnv()) {
    return;
  }
  let text = "";
  if (Number.isNaN(value)) {
    text = "";
  } else {
    const abs = Math.abs(value);
    if (abs === 0) {
      text = "0";
    } else if (abs < 1000) {
      text = String(Math.round(abs));
    } else {
      const absInK = abs / 1000;
      let formatted = absInK.toFixed(2);
      text = `${formatted}k`;
      if (text.length > 4) {
        formatted = absInK.toFixed(1);
        text = `${formatted}k`;
      }
      if (text.length > 4) {
        const intK = Math.round(absInK);
        text = `${intK}k`;
      }
      if (text.length > 4) {
        const core = String(Math.round(absInK));
        text = `${core.slice(0, 3)}k`;
      }
    }
  }
  let color = APP_CONFIG.COLORS.ZERO;
  if (!Number.isNaN(value)) {
    if (value > 0) {
      color = APP_CONFIG.COLORS.POSITIVE;
    } else if (value < 0) {
      color = APP_CONFIG.COLORS.NEGATIVE;
    }
  }
  try {
    chrome.runtime.sendMessage({ type: "updateBadge", text, color });
  } catch (e) {
    // ignore
  }
}
