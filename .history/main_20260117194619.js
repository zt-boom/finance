const STORAGE_KEY = "fund_holdings_v1";
let dragSourceRow = null;

function handleRowDragStart(event) {
const cell = event.currentTarget;
const row = cell.parentElement;
dragSourceRow = row;
row.classList.add("dragging");
if (event.dataTransfer) {
event.dataTransfer.effectAllowed = "move";
event.dataTransfer.setData("text/plain", "");
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
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
rows.forEach(row => {
row.classList.remove("dragging");
});
dragSourceRow = null;
updateRowIndices();
handleStorageUpdate();
calculateProfit();
}

function formatCurrency(value) {
if (Number.isNaN(value)) return "0.00";
return value.toFixed(2);
}

function formatNumber(value) {
if (Number.isNaN(value)) return "";
return value.toFixed(2);
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

const fundJsonpRequests = [];
let isFetchingPercentages = false;

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
    while (true) {
    let index = -1;
    for (let i = 0; i < fundJsonpRequests.length; i += 1) {
    if (fundJsonpRequests[i].code === code) {
    index = i;
    break;
    }
    }
    if (index === -1) {
    break;
    }
    const request = fundJsonpRequests.splice(index, 1)[0];
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
ensureJsonpHandler();
    fundJsonpRequests.push({
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
    const script = document.createElement("script");
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    script.dataset.fundCode = code;
    script.onerror = () => {
    for (let i = 0; i < fundJsonpRequests.length; i += 1) {
    if (fundJsonpRequests[i].code === code) {
    const request = fundJsonpRequests.splice(i, 1)[0];
    request.reject(new Error("获取基金数据失败"));
    break;
    }
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
ensureJsonpHandler();
    fundJsonpRequests.push({
    code,
    resolve,
    reject,
    transform: data => data
    });
    const script = document.createElement("script");
    script.src = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    script.dataset.fundCode = code;
    script.onerror = () => {
    for (let i = 0; i < fundJsonpRequests.length; i += 1) {
    if (fundJsonpRequests[i].code === code) {
    const request = fundJsonpRequests.splice(i, 1)[0];
    request.reject(new Error("获取基金数据失败"));
    break;
    }
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
nameInput.addEventListener("keydown", event => {
if (event.key === "Enter") {
event.preventDefault();
const raw = nameInput.value.trim();
const code = parseFundCodeFromName(raw);
if (!code) {
window.alert("请先输入6位基金代码");
return;
}
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
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
});
const zfbInput = document.createElement("input");
zfbInput.type = "number";
zfbInput.step = "0.01";
zfbInput.min = "0";
zfbInput.value = fund.zfbAmount != null ? formatCurrency(Number(fund.zfbAmount)) : "0.00";
zfbInput.addEventListener("blur", () => {
const value = parseFloat(zfbInput.value);
const normalized = Number.isNaN(value) ? 0 : value;
zfbInput.value = formatCurrency(normalized);
});
zfbInput.addEventListener("input", () => {
calculateProfit();
});
zfbInput.addEventListener("change", () => {
handleStorageUpdate();
calculateProfit();
});
zfbInput.className = "narrow-number-input";
const stockInput = document.createElement("input");
stockInput.type = "number";
stockInput.step = "0.01";
stockInput.min = "0";
stockInput.value = fund.stockAmount != null ? formatCurrency(Number(fund.stockAmount)) : "0.00";
stockInput.addEventListener("blur", () => {
const value = parseFloat(stockInput.value);
const normalized = Number.isNaN(value) ? 0 : value;
stockInput.value = formatCurrency(normalized);
});
stockInput.addEventListener("input", () => {
calculateProfit();
});
stockInput.addEventListener("change", () => {
handleStorageUpdate();
calculateProfit();
});
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
const deleteButton = document.createElement("button");
deleteButton.textContent = "删除";
deleteButton.className = "danger-button";
deleteButton.addEventListener("click", () => {
const inputs = tr.querySelectorAll("input");
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
tr.remove();
handleStorageUpdate();
calculateProfit();
updateRowIndices();
});
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
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
const holdings = [];
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const nameInput = inputs[0];
const zfbInput = inputs[1];
const stockInput = inputs[2];
const name = nameInput.value.trim();
const zfbAmount = parseFloat(zfbInput.value);
const stockAmount = parseFloat(stockInput.value);
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
if (holdings.length === 0) {
const row = createTableRow({ name: "", zfbAmount: null, stockAmount: null });
tbody.appendChild(row);
updateRowIndices();
calculateProfit();
return;
}
holdings.forEach(fund => {
const row = createTableRow({
name: fund.name || "",
zfbAmount: fund.zfbAmount != null ? fund.zfbAmount : null,
stockAmount: fund.stockAmount != null ? fund.stockAmount : null
});
tbody.appendChild(row);
});
updateRowIndices();
calculateProfit();
}

function calculateProfit() {
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
let totalZfbAmount = 0;
let totalStockAmount = 0;
let totalZfbProfit = 0;
let totalStockProfit = 0;
let totalProfit = 0;
let totalHoldingAmount = 0;
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const zfbInput = inputs[1];
const stockInput = inputs[2];
const amountSpan = row.querySelector('span[data-role="amount-display"]');
const percentCell = row.querySelector('td[data-role="percent-cell"] span');
const profitCell = row.querySelector('td[data-role="profit-cell"] span');
const zfbProfitCell = row.querySelector('td[data-role="zfb-profit-cell"] span');
const stockProfitCell = row.querySelector('td[data-role="stock-profit-cell"] span');
const zfbAmount = zfbInput ? parseFloat(zfbInput.value) : NaN;
const stockAmount = stockInput ? parseFloat(stockInput.value) : NaN;
const normalizedZfb = Number.isNaN(zfbAmount) ? 0 : zfbAmount;
const normalizedStock = Number.isNaN(stockAmount) ? 0 : stockAmount;
const amount = normalizedZfb + normalizedStock;
const percent = percentCell ? parseFloat(percentCell.textContent) : NaN;
totalZfbAmount += normalizedZfb;
totalStockAmount += normalizedStock;
if (amountSpan) {
amountSpan.textContent = formatCurrency(amount);
}
if (amount > 0) {
totalHoldingAmount += amount;
}
if (amount <= 0 || Number.isNaN(percent)) {
if (zfbProfitCell) {
zfbProfitCell.textContent = "0.00";
applyProfitColor(zfbProfitCell, 0);
}
if (stockProfitCell) {
stockProfitCell.textContent = "0.00";
applyProfitColor(stockProfitCell, 0);
}
if (profitCell) {
profitCell.textContent = "0.00";
applyProfitColor(profitCell, 0);
}
return;
}
const zfbProfit = normalizedZfb * percent / 100;
const stockProfit = normalizedStock * percent / 100;
const profit = zfbProfit + stockProfit;
totalZfbProfit += zfbProfit;
totalStockProfit += stockProfit;
totalProfit += profit;
if (zfbProfitCell) {
zfbProfitCell.textContent = formatCurrency(zfbProfit);
applyProfitColor(zfbProfitCell, zfbProfit);
}
if (stockProfitCell) {
stockProfitCell.textContent = formatCurrency(stockProfit);
applyProfitColor(stockProfitCell, stockProfit);
}
if (profitCell) {
profitCell.textContent = formatCurrency(profit);
applyProfitColor(profitCell, profit);
}
});
const totalZfbAmountElement = document.getElementById("total-zfb-amount");
if (totalZfbAmountElement) {
totalZfbAmountElement.textContent = formatCurrency(totalZfbAmount);
}
const totalStockAmountElement = document.getElementById("total-stock-amount");
if (totalStockAmountElement) {
totalStockAmountElement.textContent = formatCurrency(totalStockAmount);
}
const totalAmountElement = document.getElementById("total-amount");
if (totalAmountElement) {
totalAmountElement.textContent = formatCurrency(totalHoldingAmount);
}
const totalPercentElement = document.getElementById("total-percent");
if (totalPercentElement) {
const totalPercent = totalHoldingAmount > 0 ? (totalProfit / totalHoldingAmount) * 100 : 0;
totalPercentElement.textContent = `${formatNumber(totalPercent)}%`;
applyProfitColor(totalPercentElement, totalPercent);
}
const totalZfbProfitElement = document.getElementById("total-zfb-profit");
if (totalZfbProfitElement) {
totalZfbProfitElement.textContent = formatCurrency(totalZfbProfit);
applyProfitColor(totalZfbProfitElement, totalZfbProfit);
}
const totalStockProfitElement = document.getElementById("total-stock-profit");
if (totalStockProfitElement) {
totalStockProfitElement.textContent = formatCurrency(totalStockProfit);
applyProfitColor(totalStockProfitElement, totalStockProfit);
}
const totalProfitElement = document.getElementById("total-profit");
totalProfitElement.textContent = formatCurrency(totalProfit);
applyProfitColor(totalProfitElement, totalProfit);
}

function autoFetchPercentages(options) {
if (isFetchingPercentages) {
return;
}
const useButton = !options || options.useButton !== false;
const showAlert = !options || options.showAlert !== false;
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
const promises = [];
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const nameInput = inputs[0];
const name = nameInput ? nameInput.value.trim() : "";
const code = parseFundCodeFromName(name);
if (!code) {
return;
}
const percentCell = row.querySelector('td[data-role="percent-cell"] span');
if (!percentCell) {
return;
}
const promise = fetchFundEstimate(code).then(percent => {
const value = formatNumber(percent);
percentCell.textContent = `${value}%`;
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
window.alert("未能获取任何基金的预估涨跌幅，请检查基金代码或网络连接");
}
return;
}
calculateProfit();
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

function initApp() {
const dateElement = document.getElementById("current-date");
if (dateElement) {
dateElement.textContent = getTodayDateString();
}
populateTableFromStorage();
  const addFundButton = document.getElementById("add-fund-btn");
  const fetchPercentButton = document.getElementById("fetch-percent-btn");
  const countdownElement = document.getElementById("auto-refresh-countdown");
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
const row = createTableRow({ name: "", amount: null });
tbody.appendChild(row);
updateRowIndices();
});
}
  if (fetchPercentButton) {
    fetchPercentButton.addEventListener("click", () => {
      autoFetchPercentages({ useButton: true, showAlert: true });
      resetCountdown();
    });
  }
if (dateElement) {
setInterval(() => {
dateElement.textContent = getTodayDateString();
}, 1000);
}
setInterval(() => {
remainingSeconds -= 1;
if (remainingSeconds <= 0) {
autoFetchPercentages({ useButton: false, showAlert: false });
remainingSeconds = autoRefreshSeconds;
}
updateCountdown();
}, 1000);
}

function updateRowIndices() {
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
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
