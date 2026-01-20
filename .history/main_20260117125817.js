const STORAGE_KEY = "fund_holdings_v1";

function formatCurrency(value) {
if (Number.isNaN(value)) return "0.00";
return value.toFixed(2);
}

function getTodayDateString() {
const now = new Date();
const year = String(now.getFullYear());
const month = String(now.getMonth() + 1).padStart(2, "0");
const day = String(now.getDate()).padStart(2, "0");
return `${year}-${month}-${day}`;
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
percentInput.placeholder = "今日预估涨跌幅";
amountInput.className = "narrow-number-input";
percentInput.className = "narrow-number-input";
const profitSpan = document.createElement("span");
profitSpan.textContent = "0.00";
const deleteButton = document.createElement("button");
deleteButton.textContent = "删除";
deleteButton.className = "danger-button";
deleteButton.addEventListener("click", () => {
const confirmed = window.confirm("确定要删除这条持仓记录吗？");
if (!confirmed) {
return;
}
tr.remove();
handleStorageUpdate();
calculateProfit();
updateRowIndices();
});
indexTd.dataset.role = "row-index";
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
const profitCell = row.querySelector("td:nth-child(4) span");
if (!Number.isNaN(amount)) {
totalHoldingAmount += amount;
}
if (Number.isNaN(amount) || Number.isNaN(percent)) {
profitCell.textContent = "0.00";
return;
}
const profit = amount * percent / 100;
totalProfit += profit;
activeAmount += amount;
profitCell.textContent = formatCurrency(profit);
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
}

function resetPercentages() {
const rows = document.querySelectorAll('tr[data-role="fund-row"]');
rows.forEach(row => {
const inputs = row.querySelectorAll("input");
const percentInput = inputs[2];
const profitCell = row.querySelector("td:nth-child(4) span");
percentInput.value = "";
profitCell.textContent = "0.00";
});
const totalProfitElement = document.getElementById("total-profit");
totalProfitElement.textContent = "0.00";
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

function initApp() {
const dateElement = document.getElementById("current-date");
if (dateElement) {
dateElement.textContent = getTodayDateString();
}
populateTableFromStorage();
const addFundButton = document.getElementById("add-fund-btn");
const calculateButton = document.getElementById("calculate-btn");
const resetPercentageButton = document.getElementById("reset-percentage-btn");
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
resetPercentages();
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
