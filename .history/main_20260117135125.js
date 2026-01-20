const STORAGE_KEY = "fund_holdings_v1";

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
script.onerror = () => {
for (let i = 0; i < fundJsonpRequests.length; i += 1) {
if (fundJsonpRequests[i].code === code) {
const request = fundJsonpRequests.splice(i, 1)[0];
request.reject(new Error("获取基金数据失败"));
break;
}
}
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
script.onerror = () => {
for (let i = 0; i < fundJsonpRequests.length; i += 1) {
if (fundJsonpRequests[i].code === code) {
const request = fundJsonpRequests.splice(i, 1)[0];
request.reject(new Error("获取基金数据失败"));
break;
}
}
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
const amountTd = document.createElement("td");
const percentTd = document.createElement("td");
const profitTd = document.createElement("td");
const actionsTd = document.createElement("td");
const nameInput = document.createElement("input");
nameInput.type = "text";
nameInput.value = fund.name || "";
nameInput.placeholder = "例如：XX基金";
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
const amountInput = document.createElement("input");
amountInput.type = "number";
amountInput.step = "0.01";
amountInput.min = "0";
amountInput.value = fund.amount != null ? String(fund.amount) : "";
amountInput.placeholder = "持仓金额";
amountInput.addEventListener("change", handleStorageUpdate);
const percentInput = document.createElement("input");
percentInput.type = "number";
percentInput.step = "0.01";
percentInput.placeholder = "";
amountInput.className = "narrow-number-input";
percentInput.className = "narrow-number-input";
const profitSpan = document.createElement("span");
profitSpan.textContent = "0.00";
const deleteButton = document.createElement("button");
deleteButton.textContent = "删除";
deleteButton.className = "danger-button";
deleteButton.addEventListener("click", () => {
const inputs = tr.querySelectorAll("input");
const nameValue = inputs[0] ? inputs[0].value.trim() : "";
const amountValue = inputs[1] ? inputs[1].value.trim() : "";
const percentValue = inputs[2] ? inputs[2].value.trim() : "";
const isEmptyRow = !nameValue && !amountValue && !percentValue;
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
profitTd.dataset.role = "profit-cell";
nameTd.appendChild(nameInput);
amountTd.appendChild(amountInput);
percentTd.appendChild(percentInput);
profitTd.appendChild(profitSpan);
actionsTd.appendChild(deleteButton);
tr.appendChild(indexTd);
tr.appendChild(nameTd);
tr.appendChild(amountTd);
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
const amountInput = inputs[1];
const name = nameInput.value.trim();
const amount = parseFloat(amountInput.value);
if (!name && (Number.isNaN(amount) || amount <= 0)) {
return;
}
holdings.push({
name,
amount: Number.isNaN(amount) ? 0 : amount
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
const row = createTableRow({ name: "", amount: null });
tbody.appendChild(row);
updateRowIndices();
return;
}
holdings.forEach(fund => {
const row = createTableRow(fund);
tbody.appendChild(row);
});
updateRowIndices();
}

function calculateProfit() {
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
let totalProfit = 0;
let totalHoldingAmount = 0;
let activeAmount = 0;
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const amountInput = inputs[1];
const percentInput = inputs[2];
const amount = parseFloat(amountInput.value);
const percent = parseFloat(percentInput.value);
const profitCell = row.querySelector('td[data-role="profit-cell"] span');
if (!Number.isNaN(amount)) {
totalHoldingAmount += amount;
}
if (Number.isNaN(amount) || Number.isNaN(percent)) {
profitCell.textContent = "0.00";
applyProfitColor(profitCell, 0);
return;
}
const profit = amount * percent / 100;
totalProfit += profit;
activeAmount += amount;
profitCell.textContent = formatCurrency(profit);
applyProfitColor(profitCell, profit);
});
const totalAmountElement = document.getElementById("total-amount");
const totalPercentElement = document.getElementById("total-percent");
if (totalAmountElement) {
totalAmountElement.textContent = formatCurrency(totalHoldingAmount);
}
if (totalPercentElement) {
const totalPercent = activeAmount > 0 ? (totalProfit / activeAmount) * 100 : 0;
totalPercentElement.textContent = formatCurrency(totalPercent);
}
const totalProfitElement = document.getElementById("total-profit");
totalProfitElement.textContent = formatCurrency(totalProfit);
applyProfitColor(totalProfitElement, totalProfit);
}

function resetPercentages() {
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const percentInput = inputs[2];
const profitCell = row.querySelector('td[data-role="profit-cell"] span');
percentInput.value = "";
profitCell.textContent = "0.00";
applyProfitColor(profitCell, 0);
});
const totalProfitElement = document.getElementById("total-profit");
totalProfitElement.textContent = "0.00";
applyProfitColor(totalProfitElement, 0);
const totalPercentElement = document.getElementById("total-percent");
if (totalPercentElement) {
totalPercentElement.textContent = "0.00";
}
const totalAmountElement = document.getElementById("total-amount");
if (totalAmountElement) {
let totalAmount = 0;
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const amountInput = inputs[1];
const amount = parseFloat(amountInput.value);
if (!Number.isNaN(amount)) {
totalAmount += amount;
}
});
totalAmountElement.textContent = formatCurrency(totalAmount);
}
}


function autoFetchPercentages() {
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
const promises = [];
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const nameInput = inputs[0];
const percentInput = inputs[2];
const name = nameInput ? nameInput.value.trim() : "";
const code = parseFundCodeFromName(name);
if (!code) {
return;
}
const promise = fetchFundEstimate(code).then(percent => {
const value = formatNumber(percent);
percentInput.value = value;
return true;
}).catch(() => false);
promises.push(promise);
});
if (promises.length === 0) {
window.alert("请先在名称中输入包含6位基金代码的内容");
return;
}
const fetchButton = document.getElementById("fetch-percent-btn");
if (fetchButton) {
fetchButton.disabled = true;
fetchButton.textContent = "正在获取...";
}
Promise.all(promises).then(results => {
const successCount = results.filter(Boolean).length;
if (fetchButton) {
fetchButton.disabled = false;
fetchButton.textContent = "自动获取涨跌幅";
}
if (successCount === 0) {
window.alert("未能获取任何基金的预估涨跌幅，请检查基金代码或网络连接");
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
const calculateButton = document.getElementById("calculate-btn");
const resetPercentageButton = document.getElementById("reset-percentage-btn");
const fetchPercentButton = document.getElementById("fetch-percent-btn");
if (addFundButton) {
addFundButton.addEventListener("click", () => {
const tbody = document.getElementById("fund-table-body");
const row = createTableRow({ name: "", amount: null });
tbody.appendChild(row);
updateRowIndices();
});
}
if (calculateButton) {
calculateButton.addEventListener("click", () => {
calculateProfit();
handleStorageUpdate();
});
}
if (resetPercentageButton) {
resetPercentageButton.addEventListener("click", () => {
const confirmed = window.confirm("确定要清空所有基金的当日预估涨跌幅和预估收益吗？");
if (!confirmed) {
return;
}
resetPercentages();
});
}
if (fetchPercentButton) {
fetchPercentButton.addEventListener("click", () => {
autoFetchPercentages();
});
}
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
