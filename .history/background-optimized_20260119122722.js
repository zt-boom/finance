const API_BASE_URL = "https://fundgz.1234567.com.cn/js";
const REQUEST_TIMEOUT = 10000;

async function fetchFundJsonByCode(code) {
  if (!code) {
    throw new Error("缺少基金代码");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const url = `${API_BASE_URL}/${code}.js?rt=${Date.now()}`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const match = text.match(/^jsonpgz\((.*)\);?$/);

    if (!match || !match[1]) {
      throw new Error("基金数据格式不正确");
    }

    const jsonText = match[1];
    return JSON.parse(jsonText);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error("请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  switch (message.type) {
    case "fetchFundJson":
      handleFetchFundJson(message, sendResponse);
      return true;

    case "updateBadge":
      handleUpdateBadge(message);
      return false;

    default:
      console.warn(`Unknown message type: ${message.type}`);
      return false;
  }
});

function handleFetchFundJson(message, sendResponse) {
  const code = message.code;

  if (!code) {
    sendResponse({ ok: false, error: "缺少基金代码" });
    return;
  }

  fetchFundJsonByCode(code)
    .then(data => {
      sendResponse({ ok: true, data });
    })
    .catch(error => {
      const messageText = error && error.message ? error.message : "获取基金数据失败";
      console.error(`Failed to fetch fund data for ${code}:`, error);
      sendResponse({ ok: false, error: messageText });
    });
}

function handleUpdateBadge(message) {
  try {
    const text = typeof message.text === "string" ? message.text : "";
    chrome.action.setBadgeText({ text });

    if (message.color) {
      chrome.action.setBadgeBackgroundColor({ color: message.color });
    }
  } catch (error) {
    console.error("Failed to update badge:", error);
  }
}

chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("index.html");

  chrome.tabs.query({ url }, (tabs) => {
    if (chrome.runtime.lastError) {
      console.error("Error querying tabs:", chrome.runtime.lastError);
      chrome.tabs.create({ url });
      return;
    }

    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      chrome.tabs.update(tab.id, { active: true }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error updating tab:", chrome.runtime.lastError);
        }
      });

      if (tab.windowId !== undefined) {
        chrome.windows.update(tab.windowId, { focused: true }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error updating window:", chrome.runtime.lastError);
          }
        });
      }
    } else {
      chrome.tabs.create({ url }, (tab) => {
        if (chrome.runtime.lastError) {
          console.error("Error creating tab:", chrome.runtime.lastError);
        }
      });
    }
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Extension installed');
  } else if (details.reason === 'update') {
    console.log('Extension updated');
  }
});

chrome.runtime.onSuspend.addListener(() => {
  console.log('Extension is suspending');
});
