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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "fetchFundJson") {
    return;
  }
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
});

chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("index.html");
  chrome.tabs.create({ url });
});
