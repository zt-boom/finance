// 1. 将原有的数据加载逻辑适配为 Chrome Storage
const STORAGE_KEY = "fund_holdings_v1";

// Chrome Storage 包装器，支持 Promise
const storage = {
  get: (keys) => new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(keys, resolve);
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(keys, resolve);
    } else {
      resolve({});
    }
  }),
  set: (items) => new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(items, resolve);
    } else if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(items, resolve);
    } else {
      resolve();
    }
  })
};

// 2. 迁移原有的 fetch 逻辑到 background，并增加批量处理能力

async function fetchFundJsonByCode(code) {
  if (!code) throw new Error("缺少基金代码");
  const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("获取基金数据失败");
    const text = await response.text();
    const match = text.match(/^jsonpgz\((.*)\);?$/);
    if (!match || !match[1]) throw new Error("基金数据格式不正确");
    return JSON.parse(match[1]);
  } catch (e) {
    console.error(`Fetch error for ${code}:`, e);
    throw e;
  }
}

// 简单计算函数，用于后台更新 Badge
function calculateTotalProfit(holdings, estimates) {
  let totalProfit = 0;
  holdings.forEach(fund => {
    const code = parseFundCodeFromName(fund.name);
    if (!code) return;
    
    const estimate = estimates[code];
    if (estimate === undefined) return; // 没有数据则不计入
    
    const zfb = fund.zfbAmount || 0;
    const stock = fund.stockAmount || 0;
    const amount = zfb + stock;
    
    if (amount > 0) {
      totalProfit += amount * estimate / 100;
    }
  });
  return totalProfit;
}

function parseFundCodeFromName(name) {
  if (!name) return null;
  const match = name.match(/(\d{6})/);
  return match ? match[1] : null;
}

function updateBadge(text, color) {
  chrome.action.setBadgeText({ text });
  if (color) {
    chrome.action.setBadgeBackgroundColor({ color });
  }
}

function formatBadgeText(value) {
  if (Number.isNaN(value)) return "";
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  
  if (abs < 1000) {
    return String(Math.round(abs));
  } else {
    const absInK = abs / 1000;
    let formatted = absInK.toFixed(1);
    // Remove .0 if exists
    if (formatted.endsWith(".0")) {
        formatted = formatted.slice(0, -2);
    }
    return `${formatted}k`;
  }
}

// 3. 核心定时任务逻辑
async function performBackgroundUpdate() {
  // 读取配置和持仓
  const data = await storage.get([STORAGE_KEY]);
  const holdings = data[STORAGE_KEY] || [];
  
  if (holdings.length === 0) {
    updateBadge("");
    return;
  }

  // 检查是否在交易时间
  // 这里简化处理，后台任务每分钟触发，简单判断时间即可
  // 复杂的时间判断逻辑（如节假日）可以简化，或者依赖接口返回
  // 9:00 - 15:30 之间尝试更新
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const chinaTime = new Date(utc + (3600000 * 8));
  const day = chinaTime.getDay();
  const hour = chinaTime.getHours();
  const minute = chinaTime.getMinutes();
  const timeVal = hour * 60 + minute;
  
  // 简单判断：周末不更新，非交易时段不更新（除非有手动触发的需求，但 alarm 是自动的）
  // 交易时间：09:15 - 15:30 (放宽一点)
  // 盘后更新：18:00 - 22:00 (获取真实净值，暂未实现后台获取真实净值，先只做预估)
  // 目前只做预估值的后台刷新
  
  const isWeekend = day === 0 || day === 6;
  const isTradingHours = timeVal >= (9 * 60 + 15) && timeVal <= (15 * 60 + 30);
  
  if (isWeekend || !isTradingHours) {
     // 非交易时间，不主动清空，保持最后的状态，或者清空？
     // 保持状态比较好，让用户知道今天的战果
     return; 
  }

  const estimates = {};
  const promises = holdings.map(async (fund) => {
    const code = parseFundCodeFromName(fund.name);
    if (!code) return;
    try {
      const data = await fetchFundJsonByCode(code);
      if (data && data.gszzl) {
        estimates[code] = parseFloat(data.gszzl);
      }
    } catch (e) {
      // ignore individual error
    }
  });

  await Promise.all(promises);
  
  const totalProfit = calculateTotalProfit(holdings, estimates);
  const badgeText = formatBadgeText(totalProfit);
  
  let color = "#6b7280"; // zero
  if (totalProfit > 0) color = "#ef4444";
  if (totalProfit < 0) color = "#10b981";
  
  updateBadge(badgeText, color);
}

// 4. 事件监听

// 初始化 alarms
chrome.runtime.onInstalled.addListener(() => {
  // 每 1 分钟执行一次
  chrome.alarms.create("fund_refresh_alarm", {
    periodInMinutes: 1
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "fund_refresh_alarm") {
    performBackgroundUpdate();
  }
});

// 5. 新增：搜索基金
async function searchFund(keyword) {
  if (!keyword) throw new Error("缺少搜索关键词");
  const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}`;
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("搜索基金失败");
    const data = await response.json();
    if (data.ErrCode !== 0) throw new Error(data.ErrMsg || "搜索失败");
    return data.Datas || [];
  } catch (e) {
    console.error(`Search error for ${keyword}:`, e);
    throw e;
  }
}

// 保持原有的消息监听，兼容前端手动调用
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  if (message.type === "searchFund") {
    searchFund(message.keyword)
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true;
  }

  if (message.type === "fetchFundJson") {
    fetchFundJsonByCode(message.code)
      .then(data => sendResponse({ ok: true, data }))
      .catch(e => sendResponse({ ok: false, error: e.message }));
    return true; // async response
  }
  
  if (message.type === "fetchFundRealPercent") {
      // 复用之前的逻辑，这里需要重新引入或复制 fetchFundRealPercentByCode
      // 为保持文件整洁，这里建议将 fetchFundRealPercentByCode 也包含进来
      fetchFundRealPercentByCode(message.code)
        .then(data => sendResponse({ ok: true, data }))
        .catch(e => sendResponse({ ok: false, error: e.message }));
      return true;
  }

  if (message.type === "updateBadge") {
    // 前端计算更准（包含真实净值混合），允许前端覆盖
    const text = typeof message.text === "string" ? message.text : "";
    chrome.action.setBadgeText({ text });
    if (message.color) {
      chrome.action.setBadgeBackgroundColor({ color: message.color });
    }
    return false;
  }
  
  // 监听前端数据变更，立即触发一次刷新（可选）
  if (message.type === "holdingsUpdated") {
      performBackgroundUpdate();
      return false;
  }
});

// 辅助函数：获取真实净值（原样保留）
async function fetchFundRealPercentByCode(code) {
  if (!code) throw new Error("缺少基金代码");
  const url = `https://fundf10.eastmoney.com/F10DataApi.aspx?type=lsjz&code=${code}&page=1&per=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error("获取基金真实涨跌幅失败");
  const text = await response.text();
  // ... (保留原有解析逻辑，稍微精简)
  const contentMatch = text.match(/content:"([\s\S]*?)",records:/);
  if (!contentMatch || !contentMatch[1]) throw new Error("解析失败");
  const tableHtml = contentMatch[1];
  const firstRowMatch = tableHtml.match(/<tbody[^>]*>[\s\S]*?<tr>([\s\S]*?)<\/tr>/);
  if (!firstRowMatch || !firstRowMatch[1]) throw new Error("解析失败");
  const rowHtml = firstRowMatch[1];
  const cells = [];
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/g;
  let match;
  while ((match = tdRegex.exec(rowHtml)) !== null) cells.push(match[1]);
  if (cells.length < 4) throw new Error("解析失败");
  
  const rawCell = cells[3];
  const dateCell = cells[0];
  const dateText = dateCell.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
  const percent = parseFloat(rawCell.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim().replace("%", ""));
  if (Number.isNaN(percent)) throw new Error("解析失败");
  
  return { percent, date: dateText };
}

// 点击图标打开首页（保留）
chrome.action.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("index.html");
  chrome.tabs.query({ url }, tabs => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url });
    }
  });
});
