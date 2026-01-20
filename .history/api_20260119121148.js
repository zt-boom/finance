const fundJsonpMap = new Map();
let jsonpHandlerInitialized = false;
const JSONP_TIMEOUT = 10000;

function ensureJsonpHandler() {
  if (jsonpHandlerInitialized) {
    return;
  }
  jsonpHandlerInitialized = true;
  window.jsonpgz = function (data) {
    if (!data || !data.fundcode) {
      console.warn("Invalid JSONP response received");
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
        console.error(`Failed to transform data for fund ${code}:`, e);
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

function fetchFundJsonp(code, transform, apiBaseUrl) {
  return new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
      return;
    }
    ensureJsonpHandler();
    {
      const list = fundJsonpMap.get(code) || [];
      list.push({
        code,
        resolve,
        reject,
        transform
      });
      fundJsonpMap.set(code, list);
    }
    const script = document.createElement("script");
    script.src = `${apiBaseUrl}/${code}.js?rt=${Date.now()}`;
    script.dataset.fundCode = code;

    const timeoutId = setTimeout(() => {
      const list = fundJsonpMap.get(code) || [];
      fundJsonpMap.delete(code);
      for (let i = 0; i < list.length; i += 1) {
        const request = list[i];
        request.reject(new Error("请求超时"));
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, JSONP_TIMEOUT);

    script.onerror = () => {
      clearTimeout(timeoutId);
      const list = fundJsonpMap.get(code) || [];
      fundJsonpMap.delete(code);
      for (let i = 0; i < list.length; i += 1) {
        const request = list[i];
        request.reject(new Error("获取基金数据失败"));
      }
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    script.onload = () => {
      clearTimeout(timeoutId);
    };

    document.body.appendChild(script);
  });
}

function fetchFundJsonViaExtension(code) {
  return new Promise((resolve, reject) => {
    if (!code) {
      reject(new Error("缺少基金代码"));
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
      console.error("Failed to send message to extension:", e);
      reject(new Error("获取基金数据失败"));
    }
  });
}

export function fetchFundEstimate(code, isChromeExtensionEnv, apiBaseUrl) {
  if (!code) {
    return Promise.reject(new Error("缺少基金代码"));
  }
  if (isChromeExtensionEnv()) {
    return fetchFundJsonViaExtension(code).then(data => {
      const percent = parseFloat(data.gszzl);
      if (Number.isNaN(percent)) {
        throw new Error("无效的涨跌幅数据");
      }
      return percent;
    });
  }
  return fetchFundJsonp(code, data => {
    const percent = parseFloat(data.gszzl);
    if (Number.isNaN(percent)) {
      throw new Error("无效的涨跌幅数据");
    }
    return percent;
  }, apiBaseUrl);
}

export function fetchFundInfo(code, isChromeExtensionEnv, apiBaseUrl) {
  if (!code) {
    return Promise.reject(new Error("缺少基金代码"));
  }
  if (isChromeExtensionEnv()) {
    return fetchFundJsonViaExtension(code);
  }
  return fetchFundJsonp(code, data => data, apiBaseUrl);
}
