const STORAGE_KEY = "fund_holdings_v1";
let dragSourceRow = null;

function handleNameBlur(event) {
const input = event.currentTarget;
tryFetchFundByInput(input, { showAlertOnMissing: false });
}

function handleNameKeyDown(event) {
if (event.key === "Enter") {
event.preventDefault();
const input = event.currentTarget;
tryFetchFundByInput(input, { showAlertOnMissing: true });
}
}

function handleAmountBlur(event) {
const input = event.currentTarget;
const value = parseFloat(input.value);
const normalized = Number.isNaN(value) ? 0 : value;
input.value = formatCurrency(normalized);
}

function handleAmountInput() {
scheduleProfit();
}

function handleAmountChange() {
handleStorageUpdate();
scheduleProfit();
}

function handleTableClick(event) {
const target = event.target;
const button = target.closest("button");
if (!button) {
return;
}
const row = button.closest('tr[data-role="fund-row"]');
if (!row) {
return;
}
const action = button.dataset.action;
if (action === "view-fund") {
const inputs = row.querySelectorAll("input");
const nameValue = inputs[0] ? inputs[0].value.trim() : "";
const code = parseFundCodeFromName(nameValue);
if (!code) {
window.alert("请先在名称中输入包含6位基金代码的内容");
return;
}
const url = `https://fund.eastmoney.com/${code}.html`;
if (isChromeExtensionEnv()) {
try {
chrome.tabs.create({ url });
} catch (e) {
window.open(url, "_blank");
}
} else {
window.open(url, "_blank");
}
} else if (action === "delete-fund") {
const inputs = row.querySelectorAll("input");
const nameValue = inputs[0] ? inputs[0].value.trim() : "";
const zfbValue = inputs[1] ? inputs[1].value.trim() : "";
const stockValue = inputs[2] ? inputs[2].value.trim() : "";
const isEmptyRow = !nameValue && !zfbValue && !stockValue;
if (!isEmptyRow) {
const confirmed = window.confirm("确定要删除这条持仓记录吗？");
if (!confirmed) {
return;
}
}
row.remove();
handleStorageUpdate();
scheduleProfit();
updateRowIndices();
}
}

function handleRowDragStart(event) {
const cell = event.currentTarget;
const row = cell.parentElement;
dragSourceRow = row;
row.classList.add("dragging");
if (event.dataTransfer) {
event.dataTransfer.effectAllowed = "move";
event.dataTransfer.setData("text/plain", "");
const rowRect = row.getBoundingClientRect();
const cellRect = cell.getBoundingClientRect();
const offsetX = (cellRect.left - rowRect.left) + (cellRect.width / 2);
const offsetY = (cellRect.top - rowRect.top) + (cellRect.height / 2);
event.dataTransfer.setDragImage(row, offsetX, offsetY);
}
}

function handleRowDragOver(event) {
event.preventDefault();
if (event.dataTransfer) {
event.dataTransfer.dropEffect = "move";
}
}

function handleRowDrop(event) {
event.preventDefault();
const targetCell = event.currentTarget;
const targetRow = targetCell.parentElement;
if (!dragSourceRow || dragSourceRow === targetRow) {
return;
}
const tbody = targetRow.parentElement;
const rows = Array.from(tbody.querySelectorAll('tr[data-role="fund-row"]'));
const sourceIndex = rows.indexOf(dragSourceRow);
const targetIndex = rows.indexOf(targetRow);
if (sourceIndex === -1 || targetIndex === -1) {
return;
}
if (sourceIndex < targetIndex) {
tbody.insertBefore(dragSourceRow, targetRow.nextSibling);
} else {
tbody.insertBefore(dragSourceRow, targetRow);
}
}

function handleRowDragEnd() {
const rows = getFundRows();
rows.forEach(row => {
row.classList.remove("dragging");
});
dragSourceRow = null;
updateRowIndices();
handleStorageUpdate();
scheduleProfit();
}

function formatCurrency(value) {
if (Number.isNaN(value)) return "0.00";
return value.toFixed(2);
}

function formatNumber(value) {
if (Number.isNaN(value)) return "";
return value.toFixed(2);
}

function createDebounced(fn, delay) {
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

const scheduleProfit = createDebounced(calculateProfit, 60);
let totalZfbAmountElement = null;
let totalStockAmountElement = null;
let totalAmountElement = null;
let totalPercentElement = null;
let totalZfbProfitElement = null;
let totalStockProfitElement = null;
let totalProfitElement = null;
let percentHeader = null;
let profitHeader = null;
let percentSortOrder = null;
let profitSortOrder = null;
const basePercentHeaderText = "预估涨跌(%)";
const baseProfitHeaderText = "预估收益(元)";
let originalOrderSnapshot = null;
 
function isTradingTime() {
const now = new Date();
const day = now.getDay();
if (day === 0 || day === 6) {
return false;
}
const h = now.getHours();
const m = now.getMinutes();
const t = h * 60 + m;
const morningStart = 9 * 60;
const morningEnd = 11 * 60 + 30;
const afternoonStart = 13 * 60;
const afternoonEnd = 15 * 60 + 30;
if (t >= morningStart && t <= morningEnd) {
return true;
}
if (t >= afternoonStart && t <= afternoonEnd) {
return true;
}
return false;
}

function getRowPercent(row) {
const percentCell = row.querySelector('td[data-role="percent-cell"] span');
const v = percentCell ? parseFloat(percentCell.textContent) : NaN;
return v;
}

function getRowProfit(row) {
const profitCell = row.querySelector('td[data-role="profit-cell"] span');
const v = profitCell ? parseFloat(profitCell.textContent) : NaN;
return v;
}

function sortTableBy(type, order) {
const tbody = getFundTableBody();
if (!tbody) {
return;
}
const rows = getFundRows();
rows.sort((a, b) => {
let av = NaN;
let bv = NaN;
if (type === "percent") {
av = getRowPercent(a);
bv = getRowPercent(b);
} else {
av = getRowProfit(a);
bv = getRowProfit(b);
}
const aNa = Number.isNaN(av);
const bNa = Number.isNaN(bv);
if (aNa && bNa) return 0;
if (aNa) return 1;
if (bNa) return -1;
if (order === "asc") {
return av - bv;
}
return bv - av;
});
rows.forEach(r => tbody.appendChild(r));
updateRowIndices();
}

function updateSortHeaderUI() {
if (percentHeader) {
percentHeader.textContent = basePercentHeaderText;
percentHeader.classList.remove("sort-asc", "sort-desc");
if (percentSortOrder) {
percentHeader.classList.add(percentSortOrder === "asc" ? "sort-asc" : "sort-desc");
}
const s = percentHeader.querySelector(".sort-state");
if (s) {
if (!percentSortOrder) {
s.textContent = "不排序";
} else if (percentSortOrder === "desc") {
s.textContent = "从高到低";
} else {
s.textContent = "从低到高";
}
}
}
if (profitHeader) {
profitHeader.textContent = baseProfitHeaderText;
profitHeader.classList.remove("sort-asc", "sort-desc");
if (profitSortOrder) {
profitHeader.classList.add(profitSortOrder === "asc" ? "sort-asc" : "sort-desc");
}
const s = profitHeader.querySelector(".sort-state");
if (s) {
if (!profitSortOrder) {
s.textContent = "不排序";
} else if (profitSortOrder === "desc") {
s.textContent = "从高到低";
} else {
s.textContent = "从低到高";
}
}
}
}

function getFundTableBody() {
return document.getElementById("fund-table-body");
}

function getFundRows() {
const tbody = getFundTableBody();
if (!tbody) {
return [];
}
return Array.from(tbody.querySelectorAll('tr[data-role="fund-row"]'));
}

function getFundRowInputs(row) {
const inputs = row.querySelectorAll("input");
return {
nameInput: inputs[0] || null,
zfbInput: inputs[1] || null,
stockInput: inputs[2] || null
};
}

function getFundCodeFromRow(row) {
const inputs = getFundRowInputs(row);
const name = inputs.nameInput ? inputs.nameInput.value.trim() : "";
return parseFundCodeFromName(name);
}

function getCurrentRows() {
return getFundRows();
}

function restoreOriginalOrder() {
if (!originalOrderSnapshot) {
return;
}
const tbody = getFundTableBody();
if (!tbody) {
return;
}
const currentRows = getCurrentRows();
const snapshotSet = new Set(originalOrderSnapshot);
originalOrderSnapshot.forEach(row => {
if (tbody.contains(row)) {
tbody.appendChild(row);
}
});
currentRows.forEach(row => {
if (!snapshotSet.has(row)) {
tbody.appendChild(row);
}
});
updateRowIndices();
}

function getTodayDateString() {
const now = new Date();
const year = String(now.getFullYear());
const month = String(now.getMonth() + 1).padStart(2, "0");
const day = String(now.getDate()).padStart(2, "0");
const hours = String(now.getHours()).padStart(2, "0");
const minutes = String(now.getMinutes()).padStart(2, "0");
const seconds = String(now.getSeconds()).padStart(2, "0");
return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

const fundJsonpMap = new Map();
let isFetchingPercentages = false;

function isChromeExtensionEnv() {
if (typeof chrome === "undefined") {
return false;
}
if (!chrome.runtime) {
return false;
}
return Boolean(chrome.runtime.id);
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

function fetchFundRealPercent(code) {
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
if (!response || !response.ok || typeof response.data !== "number") {
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

function fetchFundEstimate(code) {
return new Promise((resolve, reject) => {
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
ensureJsonpHandler();
    {
      const list = fundJsonpMap.get(code) || [];
      list.push({
        code,
        resolve,
        reject,
        transform: data => {
          const percent = parseFloat(data.gszzl);
          if (Number.isNaN(percent)) {
            throw new Error("无效的涨跌幅数据");
          }
          return percent;
        }
      });
      fundJsonpMap.set(code, list);
    }
    const script = document.createElement("script");
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    script.dataset.fundCode = code;
    script.onerror = () => {
    const list = fundJsonpMap.get(code) || [];
    fundJsonpMap.delete(code);
    for (let i = 0; i < list.length; i += 1) {
      const request = list[i];
      request.reject(new Error("获取基金数据失败"));
    }
    script.remove();
    };
    document.body.appendChild(script);
});
}

function fetchFundInfo(code) {
return new Promise((resolve, reject) => {
if (!code) {
reject(new Error("缺少基金代码"));
return;
}
if (isChromeExtensionEnv()) {
fetchFundJsonViaExtension(code).then(data => {
resolve(data);
}).catch(reject);
return;
}
ensureJsonpHandler();
    {
      const list = fundJsonpMap.get(code) || [];
      list.push({
        code,
        resolve,
        reject,
        transform: data => data
      });
      fundJsonpMap.set(code, list);
    }
    const script = document.createElement("script");
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    script.dataset.fundCode = code;
    script.onerror = () => {
    const list = fundJsonpMap.get(code) || [];
    fundJsonpMap.delete(code);
    for (let i = 0; i < list.length; i += 1) {
      const request = list[i];
      request.reject(new Error("获取基金数据失败"));
    }
    script.remove();
    };
    document.body.appendChild(script);
});
}

function parseFundCodeFromName(name) {
if (!name) return null;
const match = name.match(/(\d{6})/);
if (!match) {
return null;
}
return match[1];
}

function tryFetchFundByInput(nameInput, options) {
const showAlertOnMissing = !options || options.showAlertOnMissing !== false;
const raw = nameInput.value.trim();
const resolvedPattern = /^\d{6}\s{2}.+/;
if (resolvedPattern.test(raw)) {
return;
}
const code = parseFundCodeFromName(raw);
if (!code) {
if (showAlertOnMissing) {
window.alert("请先输入6位基金代码");
}
return;
}
const rows = getFundRows();
let duplicate = false;
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const otherNameInput = inputs[0];
if (!otherNameInput || otherNameInput === nameInput) {
return;
}
const otherCode = parseFundCodeFromName(otherNameInput.value.trim());
if (otherCode && otherCode === code) {
duplicate = true;
}
});
if (duplicate) {
window.alert("该基金代码已存在，请不要重复添加");
return;
}
nameInput.disabled = true;
fetchFundInfo(code).then(data => {
nameInput.disabled = false;
if (!data || !data.name) {
window.alert("未能获取基金名称，请检查基金代码");
return;
}
nameInput.value = `${code}  ${data.name}`;
handleStorageUpdate();
}).catch(() => {
nameInput.disabled = false;
window.alert("未能获取基金名称，请检查基金代码或网络连接");
});
}

function loadHoldingsFromStorage() {
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

function saveHoldingsToStorage(holdings) {
try {
const serialized = JSON.stringify(holdings);
window.localStorage.setItem(STORAGE_KEY, serialized);
} catch (e) {
}
}

function createTableRow(fund) {
const tr = document.createElement("tr");
const indexTd = document.createElement("td");
const nameTd = document.createElement("td");
const zfbAmountTd = document.createElement("td");
const stockAmountTd = document.createElement("td");
const amountTd = document.createElement("td");
const zfbProfitTd = document.createElement("td");
const stockProfitTd = document.createElement("td");
const percentTd = document.createElement("td");
const profitTd = document.createElement("td");
const actionsTd = document.createElement("td");
const nameInput = document.createElement("input");
nameInput.type = "text";
nameInput.value = fund.name || "";
nameInput.placeholder = "请输入6位基金代码，例如：110022";
  nameInput.addEventListener("change", handleStorageUpdate);
  nameInput.addEventListener("blur", handleNameBlur);
  nameInput.addEventListener("keydown", handleNameKeyDown);
const zfbInput = document.createElement("input");
zfbInput.type = "number";
zfbInput.step = "0.01";
zfbInput.min = "0";
zfbInput.value = fund.zfbAmount != null ? formatCurrency(Number(fund.zfbAmount)) : "0.00";
  zfbInput.addEventListener("blur", handleAmountBlur);
  zfbInput.addEventListener("input", handleAmountInput);
  zfbInput.addEventListener("change", handleAmountChange);
zfbInput.className = "narrow-number-input";
const stockInput = document.createElement("input");
stockInput.type = "number";
stockInput.step = "0.01";
stockInput.min = "0";
stockInput.value = fund.stockAmount != null ? formatCurrency(Number(fund.stockAmount)) : "0.00";
  stockInput.addEventListener("blur", handleAmountBlur);
  stockInput.addEventListener("input", handleAmountInput);
  stockInput.addEventListener("change", handleAmountChange);
stockInput.className = "narrow-number-input";
const amountSpan = document.createElement("span");
amountSpan.dataset.role = "amount-display";
amountSpan.textContent = "0.00";
const zfbProfitSpan = document.createElement("span");
zfbProfitSpan.textContent = "0.00";
const stockProfitSpan = document.createElement("span");
stockProfitSpan.textContent = "0.00";
const percentSpan = document.createElement("span");
percentSpan.textContent = "0.00%";
const profitSpan = document.createElement("span");
profitSpan.textContent = "0.00";
const viewButton = document.createElement("button");
viewButton.type = "button";
viewButton.textContent = "详";
viewButton.className = "icon-button";
  viewButton.dataset.action = "view-fund";
const deleteButton = document.createElement("button");
deleteButton.type = "button";
deleteButton.textContent = "删";
deleteButton.className = "danger-button";
  deleteButton.dataset.action = "delete-fund";
indexTd.dataset.role = "row-index";
indexTd.draggable = true;
indexTd.addEventListener("dragstart", handleRowDragStart);
indexTd.addEventListener("dragover", handleRowDragOver);
indexTd.addEventListener("drop", handleRowDrop);
indexTd.addEventListener("dragend", handleRowDragEnd);
zfbProfitTd.dataset.role = "zfb-profit-cell";
stockProfitTd.dataset.role = "stock-profit-cell";
percentTd.dataset.role = "percent-cell";
profitTd.dataset.role = "profit-cell";
nameTd.appendChild(nameInput);
zfbAmountTd.appendChild(zfbInput);
stockAmountTd.appendChild(stockInput);
amountTd.appendChild(amountSpan);
zfbProfitTd.appendChild(zfbProfitSpan);
stockProfitTd.appendChild(stockProfitSpan);
percentTd.appendChild(percentSpan);
profitTd.appendChild(profitSpan);
actionsTd.appendChild(viewButton);
actionsTd.appendChild(deleteButton);
tr.appendChild(indexTd);
tr.appendChild(nameTd);
tr.appendChild(zfbAmountTd);
tr.appendChild(stockAmountTd);
tr.appendChild(amountTd);
tr.appendChild(zfbProfitTd);
tr.appendChild(stockProfitTd);
tr.appendChild(percentTd);
tr.appendChild(profitTd);
tr.appendChild(actionsTd);
tr.dataset.role = "fund-row";
return tr;
}

function readHoldingsFromTable() {
const rows = getFundRows();
const holdings = [];
rows.forEach(row => {
const inputs = getFundRowInputs(row);
const nameInput = inputs.nameInput;
const zfbInput = inputs.zfbInput;
const stockInput = inputs.stockInput;
const name = nameInput ? nameInput.value.trim() : "";
const zfbAmount = zfbInput ? parseFloat(zfbInput.value) : NaN;
const stockAmount = stockInput ? parseFloat(stockInput.value) : NaN;
const hasZfb = !Number.isNaN(zfbAmount) && zfbAmount > 0;
const hasStock = !Number.isNaN(stockAmount) && stockAmount > 0;
if (!name && !hasZfb && !hasStock) {
return;
}
holdings.push({
name,
zfbAmount: hasZfb ? zfbAmount : 0,
stockAmount: hasStock ? stockAmount : 0
});
});
return holdings;
}

function handleStorageUpdate() {
const holdings = readHoldingsFromTable();
saveHoldingsToStorage(holdings);
}

function populateTableFromStorage() {
  const tbody = document.getElementById("fund-table-body");
  tbody.innerHTML = "";
  const holdings = loadHoldingsFromStorage();
  const fragment = document.createDocumentFragment();
  if (holdings.length === 0) {
    const row = createTableRow({ name: "", zfbAmount: null, stockAmount: null });
    fragment.appendChild(row);
  } else {
    holdings.forEach(fund => {
      const row = createTableRow({
        name: fund.name || "",
        zfbAmount: fund.zfbAmount != null ? fund.zfbAmount : null,
        stockAmount: fund.stockAmount != null ? fund.stockAmount : null
      });
      fragment.appendChild(row);
    });
  }
  tbody.appendChild(fragment);
  updateRowIndices();
  calculateProfit();
}

function calculateProfit() {
  const rows = getFundRows();
  const updates = [];
  let totalZfbAmount = 0;
  let totalStockAmount = 0;
  let totalZfbProfit = 0;
  let totalStockProfit = 0;
  let totalProfit = 0;
  let totalHoldingAmount = 0;

  rows.forEach(row => {
    const inputs = getFundRowInputs(row);
    const zfbInput = inputs.zfbInput;
    const stockInput = inputs.stockInput;
    const percentCell = row.querySelector('td[data-role="percent-cell"] span');
    
    // Cache elements for write phase
    const amountSpan = row.querySelector('span[data-role="amount-display"]');
    const zfbProfitCell = row.querySelector('td[data-role="zfb-profit-cell"] span');
    const stockProfitCell = row.querySelector('td[data-role="stock-profit-cell"] span');
    const profitCell = row.querySelector('td[data-role="profit-cell"] span');

    const zfbAmount = zfbInput ? parseFloat(zfbInput.value) : NaN;
    const stockAmount = stockInput ? parseFloat(stockInput.value) : NaN;
    const normalizedZfb = Number.isNaN(zfbAmount) ? 0 : zfbAmount;
    const normalizedStock = Number.isNaN(stockAmount) ? 0 : stockAmount;
    const amount = normalizedZfb + normalizedStock;
    const percent = percentCell ? parseFloat(percentCell.textContent) : NaN;
    const isReal = percentCell && percentCell.dataset && percentCell.dataset.real === "true";

    totalZfbAmount += normalizedZfb;
    totalStockAmount += normalizedStock;
    if (amount > 0) {
        totalHoldingAmount += amount;
    }

    let zfbProfit = 0;
    let stockProfit = 0;
    let rowProfit = 0;
    let validCalc = false;

    if (amount > 0 && !Number.isNaN(percent)) {
        zfbProfit = normalizedZfb * percent / 100;
        stockProfit = normalizedStock * percent / 100;
        rowProfit = zfbProfit + stockProfit;
        validCalc = true;

        totalZfbProfit += zfbProfit;
        totalStockProfit += stockProfit;
        totalProfit += rowProfit;
    }

    updates.push({
        amountSpan,
        zfbProfitCell,
        stockProfitCell,
        profitCell,
        amount,
        zfbProfit,
        stockProfit,
        rowProfit,
        validCalc,
        isReal
    });
  });

  updates.forEach(data => {
      if (data.amountSpan) {
          data.amountSpan.textContent = formatCurrency(data.amount);
      }
      
      if (!data.validCalc) {
          if (data.zfbProfitCell) { data.zfbProfitCell.textContent = "0.00"; applyProfitColor(data.zfbProfitCell, 0); }
          if (data.stockProfitCell) { data.stockProfitCell.textContent = "0.00"; applyProfitColor(data.stockProfitCell, 0); }
          if (data.profitCell) { data.profitCell.textContent = "0.00"; applyProfitColor(data.profitCell, 0); }
      } else {
          if (data.zfbProfitCell) { data.zfbProfitCell.textContent = formatCurrency(data.zfbProfit); applyProfitColor(data.zfbProfitCell, data.zfbProfit); }
          if (data.stockProfitCell) { data.stockProfitCell.textContent = formatCurrency(data.stockProfit); applyProfitColor(data.stockProfitCell, data.stockProfit); }
          if (data.profitCell) {
              const suffix = data.isReal ? "(实)" : "";
              data.profitCell.textContent = `${formatCurrency(data.rowProfit)}${suffix}`;
              applyProfitColor(data.profitCell, data.rowProfit);
          }
      }
  });

  const elTotalZfb = totalZfbAmountElement || document.getElementById("total-zfb-amount");
  if (elTotalZfb) elTotalZfb.textContent = formatCurrency(totalZfbAmount);

  const elTotalStock = totalStockAmountElement || document.getElementById("total-stock-amount");
  if (elTotalStock) elTotalStock.textContent = formatCurrency(totalStockAmount);
  
  const elTotalAmount = totalAmountElement || document.getElementById("total-amount");
  if (elTotalAmount) elTotalAmount.textContent = formatCurrency(totalHoldingAmount);

  const elTotalPercent = totalPercentElement || document.getElementById("total-percent");
  if (elTotalPercent) {
      const totalPercent = totalHoldingAmount > 0 ? (totalProfit / totalHoldingAmount) * 100 : 0;
      elTotalPercent.textContent = `${formatNumber(totalPercent)}%`;
      applyProfitColor(elTotalPercent, totalPercent);
  }

  const elTotalZfbProfit = totalZfbProfitElement || document.getElementById("total-zfb-profit");
  if (elTotalZfbProfit) {
      elTotalZfbProfit.textContent = formatCurrency(totalZfbProfit);
      applyProfitColor(elTotalZfbProfit, totalZfbProfit);
  }

  const elTotalStockProfit = totalStockProfitElement || document.getElementById("total-stock-profit");
  if (elTotalStockProfit) {
      elTotalStockProfit.textContent = formatCurrency(totalStockProfit);
      applyProfitColor(elTotalStockProfit, totalStockProfit);
  }

  const elTotalProfit = totalProfitElement || document.getElementById("total-profit");
  if (elTotalProfit) {
      elTotalProfit.textContent = formatCurrency(totalProfit);
      applyProfitColor(elTotalProfit, totalProfit);
  }

  if (isChromeExtensionEnv()) {
    updateExtensionBadge(totalProfit);
  }
}

function updateExtensionBadge(value) {
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
}
}

function autoFetchPercentages(options) {
if (isFetchingPercentages) {
return;
}
const useButton = !options || options.useButton !== false;
const showAlert = !options || options.showAlert !== false;
const rows = getFundRows();
const promises = [];
rows.forEach(row => {
const code = getFundCodeFromRow(row);
if (!code) {
return;
}
const percentCell = row.querySelector('td[data-role="percent-cell"] span');
if (!percentCell) {
return;
}
const promise = fetchFundEstimate(code).then(percent => {
      if (percent === 0) {
        return true;
      }
      const value = formatNumber(percent);
      percentCell.textContent = `${value}%`;
      if (percentCell.dataset && percentCell.dataset.real) {
        delete percentCell.dataset.real;
      }
      return true;
    }).catch(() => false);
promises.push(promise);
});
if (promises.length === 0) {
if (showAlert) {
window.alert("请先在名称中输入包含6位基金代码的内容");
}
return;
}
const fetchButton = useButton ? document.getElementById("fetch-percent-btn") : null;
if (fetchButton) {
fetchButton.disabled = true;
}
isFetchingPercentages = true;
Promise.all(promises).then(results => {
isFetchingPercentages = false;
const successCount = results.filter(Boolean).length;
if (fetchButton) {
fetchButton.disabled = false;
}
if (successCount === 0) {
if (showAlert) {
window.alert("未能获取任何基金的预估涨跌，请检查基金代码或网络连接");
}
return;
}
scheduleProfit();
});
}

function fetchRealPercentagesForAllFunds() {
const rows = getFundRows();
const promises = [];
rows.forEach(row => {
const code = getFundCodeFromRow(row);
if (!code) {
return;
}
const percentCell = row.querySelector('td[data-role="percent-cell"] span');
if (!percentCell) {
return;
}
if (percentCell.dataset && percentCell.dataset.real === "true") {
return;
}
const promise = fetchFundRealPercent(code).then(percent => {
const value = formatNumber(percent);
percentCell.textContent = `${value}%(实)`;
if (percentCell.dataset) {
percentCell.dataset.real = "true";
}
return true;
}).catch(() => false);
promises.push(promise);
});
if (promises.length === 0) {
return Promise.resolve({ anySuccess: false, allDone: true });
}
return Promise.all(promises).then(results => {
const successCount = results.filter(Boolean).length;
if (successCount > 0) {
scheduleProfit();
}
let allDone = true;
rows.forEach(row => {
const code = getFundCodeFromRow(row);
if (!code) {
return;
}
const percentCell = row.querySelector('td[data-role="percent-cell"] span');
if (!percentCell) {
return;
}
if (!percentCell.dataset || percentCell.dataset.real !== "true") {
allDone = false;
}
});
return { anySuccess: successCount > 0, allDone };
});
}

function applyProfitColor(element, value) {
if (!element) {
return;
}
element.classList.remove("value-positive", "value-negative", "value-zero");
if (Number.isNaN(value)) {
return;
}
if (value > 0) {
element.classList.add("value-positive");
} else if (value < 0) {
element.classList.add("value-negative");
} else {
element.classList.add("value-zero");
}
}

let realUpdateDone = false;
let realUpdateTimerId = null;

function isAfterRealUpdateTime() {
const now = new Date();
const h = now.getHours();
const m = now.getMinutes();
const t = h * 60 + m;
const start = 22 * 60;
const end = 24 * 60;
return t >= start && t < end;
}

function triggerRealUpdateIfNeeded() {
if (realUpdateDone) {
return;
}
if (!isAfterRealUpdateTime()) {
return;
}
fetchRealPercentagesForAllFunds().then(result => {
if (result && result.allDone) {
realUpdateDone = true;
if (realUpdateTimerId != null) {
clearInterval(realUpdateTimerId);
realUpdateTimerId = null;
}
}
});
}

function setupDailyRealUpdateScheduler() {
if (!isChromeExtensionEnv()) {
return;
}
triggerRealUpdateIfNeeded();
realUpdateTimerId = setInterval(triggerRealUpdateIfNeeded, 300000);
}

function initApp() {
const dateElement = document.getElementById("current-date");
const tradingStatusElement = document.getElementById("trading-status");
const tbody = document.getElementById("fund-table-body");
if (dateElement) {
dateElement.textContent = getTodayDateString();
}
populateTableFromStorage();
  totalZfbAmountElement = document.getElementById("total-zfb-amount");
  totalStockAmountElement = document.getElementById("total-stock-amount");
  totalAmountElement = document.getElementById("total-amount");
  totalPercentElement = document.getElementById("total-percent");
  totalZfbProfitElement = document.getElementById("total-zfb-profit");
  totalStockProfitElement = document.getElementById("total-stock-profit");
  totalProfitElement = document.getElementById("total-profit");
  const addFundButton = document.getElementById("add-fund-btn");
  const fetchPercentButton = document.getElementById("fetch-percent-btn");
  const countdownElement = document.getElementById("auto-refresh-countdown");
  percentHeader = document.querySelector('th[data-sort="percent"]');
  profitHeader = document.querySelector('th[data-sort="profit"]');
  updateSortHeaderUI();
  if (tbody) {
  tbody.addEventListener("click", handleTableClick);
  }
  if (percentHeader) {
    percentHeader.addEventListener("click", () => {
      if (!percentSortOrder) {
        originalOrderSnapshot = getCurrentRows();
        percentSortOrder = "desc";
        profitSortOrder = null;
        updateSortHeaderUI();
        sortTableBy("percent", "desc");
      } else if (percentSortOrder === "desc") {
        percentSortOrder = "asc";
        updateSortHeaderUI();
        sortTableBy("percent", "asc");
      } else {
        percentSortOrder = null;
        updateSortHeaderUI();
        restoreOriginalOrder();
        originalOrderSnapshot = null;
      }
    });
  }
  if (profitHeader) {
    profitHeader.addEventListener("click", () => {
      if (!profitSortOrder) {
        originalOrderSnapshot = getCurrentRows();
        profitSortOrder = "desc";
        percentSortOrder = null;
        updateSortHeaderUI();
        sortTableBy("profit", "desc");
      } else if (profitSortOrder === "desc") {
        profitSortOrder = "asc";
        updateSortHeaderUI();
        sortTableBy("profit", "asc");
      } else {
        profitSortOrder = null;
        updateSortHeaderUI();
        restoreOriginalOrder();
        originalOrderSnapshot = null;
      }
    });
  }
const autoRefreshSeconds = 300;
let remainingSeconds = autoRefreshSeconds;
function updateCountdown() {
if (countdownElement) {
countdownElement.textContent = String(remainingSeconds);
}
}
function resetCountdown() {
remainingSeconds = autoRefreshSeconds;
updateCountdown();
}
updateCountdown();
  if (addFundButton) {
    addFundButton.addEventListener("click", () => {
      const tbody = document.getElementById("fund-table-body");
      const row = createTableRow({ name: "", zfbAmount: null, stockAmount: null });
      tbody.appendChild(row);
      updateRowIndices();
    });
  }
  if (fetchPercentButton) {
    fetchPercentButton.addEventListener("click", () => {
      autoFetchPercentages({ useButton: true, showAlert: true });
      resetCountdown();
      triggerRealUpdateIfNeeded();
    });
  }
setupDailyRealUpdateScheduler();
if (dateElement) {
setInterval(() => {
dateElement.textContent = getTodayDateString();
if (tradingStatusElement) {
if (isTradingTime()) {
tradingStatusElement.textContent = "";
tradingStatusElement.classList.remove("paused");
} else {
tradingStatusElement.textContent = "非交易时段，自动刷新已暂停";
tradingStatusElement.classList.add("paused");
}
}
}, 1000);
}
setInterval(() => {
remainingSeconds -= 1;
if (remainingSeconds <= 0) {
if (isTradingTime()) {
autoFetchPercentages({ useButton: false, showAlert: false });
}
remainingSeconds = autoRefreshSeconds;
}
updateCountdown();
}, 1000);
}

function updateRowIndices() {
const rows = getFundRows();
rows.forEach((row, index) => {
const indexCell = row.querySelector('td[data-role="row-index"]');
if (indexCell) {
indexCell.textContent = String(index + 1);
}
});
}

if (document.readyState === "loading") {
document.addEventListener("DOMContentLoaded", initApp);
} else {
initApp();
}
