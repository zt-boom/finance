import { isChromeExtensionEnv } from './utils.js';

const fundJsonpMap = new Map();

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
    const timeoutMs = 8000;
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
    try {
      chrome.runtime.sendMessage(
        { type: "fetchFundJson", code },
        response => {
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
      reject(new Error("获取基金数据失败"));
    }
  });
}

export function fetchFundRealPercent(code) {
  return new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (!isChromeExtensionEnv()) {
      reject(new Error("当前环境不是 Chrome 插件"));
      return;
    }
    try {
      chrome.runtime.sendMessage(
        { type: "fetchFundRealPercent", code },
        response => {
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
      reject(new Error("获取基金真实涨跌幅失败"));
    }
  });
}

export function fetchFundEstimate(code) {
  return new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (isChromeExtensionEnv()) {
      // Add timeout for extension calls too
      const timeoutMs = 8000;
      let timer = setTimeout(() => reject(new Error("请求超时")), timeoutMs);

      fetchFundJsonViaExtension(code).then(data => {
        clearTimeout(timer);
        const percent = parseFloat(data.gszzl);
        if (Number.isNaN(percent)) {
          reject(new Error("无效的涨跌幅数据"));
          return;
        }
        resolve(percent);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
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
}

export function fetchFundInfo(code) {
  return new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    if (isChromeExtensionEnv()) {
      const timeoutMs = 8000;
      let timer = setTimeout(() => reject(new Error("请求超时")), timeoutMs);

      fetchFundJsonViaExtension(code).then(data => {
        clearTimeout(timer);
        resolve(data);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
      return;
    }

    fetchFundJsonp(code, data => data).then(resolve).catch(reject);
  });
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
  let color = "#6b7280";
  if (!Number.isNaN(value)) {
    if (value > 0) {
      color = "#ef4444";
    } else if (value < 0) {
      color = "#10b981";
    }
  }
  try {
    chrome.runtime.sendMessage({ type: "updateBadge", text, color });
  } catch (e) {
    // ignore
  }
}
