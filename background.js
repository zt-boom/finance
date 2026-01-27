async function fetchFundJsonByCode(code) {
  if (!code) {
    throw new Error("缺少基金代码");
  }
  const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("获取基金数据失败");
  }
  const text = await response.text();
  const match = text.match(/^jsonpgz\((.*)\);?$/);
  if (!match || !match[1]) {
    throw new Error("基金数据格式不正确");
  }
  const jsonText = match[1];
  return JSON.parse(jsonText);
}

async function fetchFundRealPercentByCode(code) {
  if (!code) {
    throw new Error("缺少基金代码");
  }
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("获取基金真实涨跌幅失败");
  }
  const text = await response.text();
  const contentMatch = text.match(/content:"([\s\S]*?)",records:/);
  if (!contentMatch || !contentMatch[1]) {
    throw new Error("解析基金真实涨跌幅失败");
  }
  const tableHtml = contentMatch[1];
  const firstRowMatch = tableHtml.match(/<tbody[^>]*>[\s\S]*?<tr>([\s\S]*?)<\/tr>/);
  if (!firstRowMatch || !firstRowMatch[1]) {
    throw new Error("解析基金真实涨跌幅失败");
  }
  const rowHtml = firstRowMatch[1];
  const cells = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let match;
  while ((match = tdRegex.exec(rowHtml)) !== null) {
    cells.push(match[1]);
  }
  if (cells.length < 4) {
    throw new Error("解析基金真实涨跌幅失败");
  }
  const rawCell = cells[3];
  const dateCell = cells[0];
  const textWithoutTags = rawCell.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
  const dateText = dateCell.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
  const normalized = textWithoutTags.replace("%", "").trim();
  const percent = parseFloat(normalized);
  if (Number.isNaN(percent)) {
    throw new Error("解析基金真实涨跌幅失败");
  }
  return { percent, date: dateText };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return;
  }
  if (message.type === "fetchFundJson") {
    const code = message.code;
    fetchFundJsonByCode(code)
      .then(data => {
        sendResponse({ ok: true, data });
      })
      .catch(error => {
        const messageText = error && error.message ? error.message : "获取基金数据失败";
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }
  if (message.type === "fetchFundRealPercent") {
    const code = message.code;
    fetchFundRealPercentByCode(code)
      .then(result => {
        sendResponse({ ok: true, data: result });
      })
      .catch(error => {
        const messageText = error && error.message ? error.message : "获取基金真实涨跌幅失败";
        sendResponse({ ok: false, error: messageText });
      });
    return true;
  }
  if (message.type === "updateBadge") {
    const text = typeof message.text === "string" ? message.text : "";
    chrome.action.setBadgeText({ text });
    if (message.color) {
      chrome.action.setBadgeBackgroundColor({ color: message.color });
    }
  }
});

chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("index.html");
  chrome.tabs.query({ url }, tabs => {
    if (chrome.runtime.lastError) {
      chrome.tabs.create({ url });
      return;
    }
    if (tabs && tabs.length > 0) {
      const tab = tabs[0];
      chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId !== undefined) {
        chrome.windows.update(tab.windowId, { focused: true });
      }
    } else {
      chrome.tabs.create({ url });
    }
  });
});
