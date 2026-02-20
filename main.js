import {
  formatCurrency,
  formatNumber,
  createDebounced,
  getChinaDate,
  getCurrentMinutes,
  isTradingDay,
  parseFundCodeFromName,
  getTodayDateString,
  isChromeExtensionEnv
} from './utils.js';

import {
  loadHoldingsFromStorage,
  saveHoldingsToStorage,
  loadPercentStatusFromStorage,
  savePercentStatusToStorage,
  loadSortStatusFromStorage,
  saveSortStatusToStorage,
  initStorage,
  loadTrendHistoryFromStorage,
  saveTrendPointToStorage
} from './storage.js';

// --- Privacy Mode ---
let isPrivacyMode = false;

function togglePrivacyMode() {
  isPrivacyMode = !isPrivacyMode;
  applyPrivacyMode();
  // Save preference
  localStorage.setItem("finance_privacy_mode", isPrivacyMode);
}

function applyPrivacyMode() {
  const body = document.body;
  const btn = document.getElementById("toggle-privacy-btn");
  
  if (isPrivacyMode) {
    body.classList.add("privacy-active");
    if (btn) {
       const eyeOpen = btn.querySelectorAll(".eye-open");
       const eyeClosed = btn.querySelectorAll(".eye-closed");
       eyeOpen.forEach(el => el.style.display = "none");
       eyeClosed.forEach(el => el.style.display = "block");
       btn.title = "显示金额";
    }
  } else {
    body.classList.remove("privacy-active");
    if (btn) {
       const eyeOpen = btn.querySelectorAll(".eye-open");
       const eyeClosed = btn.querySelectorAll(".eye-closed");
       eyeOpen.forEach(el => el.style.display = "block");
       eyeClosed.forEach(el => el.style.display = "none");
       btn.title = "隐藏金额";
    }
  }
}

function initPrivacyMode() {
  const saved = localStorage.getItem("finance_privacy_mode");
  isPrivacyMode = saved === "true";
  applyPrivacyMode();
  
  const btn = document.getElementById("toggle-privacy-btn");
  if (btn) {
    btn.addEventListener("click", togglePrivacyMode);
  }
}


import { drawTrendChart } from './chart.js';

import {
  fetchFundRealPercent,
  fetchFundEstimate,
  fetchFundInfo,
  updateExtensionBadge,
  searchFund
} from './api.js';

import { APP_CONFIG } from './config.js';

let dragSourceRow = null;
let isGlobalFetching = false;
let realUpdateDone = false;
let originalOrderSnapshot = null;

let selectedFunds = new Map();
let currentSearchResults = [];

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

const APP_STATE = {
  ESTIMATE: "ESTIMATE",
  REAL: "REAL",
  PAUSED: "PAUSED"
};

const handleDebouncedStorageUpdate = createDebounced(handleStorageUpdate, APP_CONFIG.STORAGE_DEBOUNCE);
const scheduleProfit = createDebounced(calculateProfit, APP_CONFIG.PROFIT_CALC_DEBOUNCE);
const handleDebouncedNameInput = createDebounced((input) => {
    tryFetchFundByInput(input, { showAlertOnMissing: false });
}, APP_CONFIG.INPUT_DEBOUNCE);

const handleDebouncedSearch = createDebounced(performSearch, 500);

// --- UI Helpers ---

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

function updateRowIndices() {
  const rows = getFundRows();
  rows.forEach((row, index) => {
    const indexCell = row.querySelector('td[data-role="row-index"]');
    if (indexCell) {
      indexCell.textContent = String(index + 1);
    }
  });
}

function updateAndFlash(element, newValueString) {
  if (!element) return;
  if (element.textContent !== newValueString) {
    element.textContent = newValueString;
    const parent = element.parentElement;
    if (parent) {
      parent.classList.remove("value-updated");
      void parent.offsetWidth; // trigger reflow
      parent.classList.add("value-updated");
    }
  }
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

// --- Logic ---

function getAppStatus() {
  const now = getChinaDate();
  const day = now.getDay();

  if (day === 0 || day === 6) {
    return APP_STATE.PAUSED;
  }

  const t = now.getHours() * 60 + now.getMinutes();

  if (t >= APP_CONFIG.TRADING_HOURS.MORNING_START && t < APP_CONFIG.TRADING_HOURS.AFTERNOON_END) {
    return APP_STATE.ESTIMATE;
  }

  if (t >= APP_CONFIG.TRADING_HOURS.EVENING_START && t < APP_CONFIG.TRADING_HOURS.EVENING_END) {
    return APP_STATE.REAL;
  }

  return APP_STATE.PAUSED;
}

function shouldShowEstimateOnly() {
  if (!isTradingDay()) {
    return false;
  }
  const now = getChinaDate();
  const h = now.getHours();
  // 9:00之后只展示当日的预估值
  return h >= 9;
}

function isManualRealFetchTime() {
  const t = getCurrentMinutes();
  // 18:00 - 09:20 next day
  return (t >= APP_CONFIG.TRADING_HOURS.EVENING_START) || (t < APP_CONFIG.TRADING_HOURS.MORNING_START);
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
    
    // 优化：优先从 dataset 读取数值，避免 parseFloat 文本
    let percent = NaN;
    if (percentCell && percentCell.dataset && percentCell.dataset.value) {
        percent = parseFloat(percentCell.dataset.value);
    } else {
        percent = percentCell ? parseFloat(percentCell.textContent) : NaN;
    }
    
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
      try {
        zfbProfit = normalizedZfb * percent / 100;
        stockProfit = normalizedStock * percent / 100;
        rowProfit = zfbProfit + stockProfit;
        validCalc = true;
  
        totalZfbProfit += zfbProfit;
        totalStockProfit += stockProfit;
        totalProfit += rowProfit;
      } catch(e) {
          console.error("Calculation error for row", row, e);
          validCalc = false;
      }
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
      updateAndFlash(data.amountSpan, formatCurrency(data.amount));
    }

    if (!data.validCalc) {
      if (data.zfbProfitCell) { updateAndFlash(data.zfbProfitCell, "0.00"); applyProfitColor(data.zfbProfitCell, 0); }
      if (data.stockProfitCell) { updateAndFlash(data.stockProfitCell, "0.00"); applyProfitColor(data.stockProfitCell, 0); }
      if (data.profitCell) { updateAndFlash(data.profitCell, "0.00"); applyProfitColor(data.profitCell, 0); }
    } else {
      if (data.zfbProfitCell) { updateAndFlash(data.zfbProfitCell, formatCurrency(data.zfbProfit)); applyProfitColor(data.zfbProfitCell, data.zfbProfit); }
      if (data.stockProfitCell) { updateAndFlash(data.stockProfitCell, formatCurrency(data.stockProfit)); applyProfitColor(data.stockProfitCell, data.stockProfit); }
      if (data.profitCell) {
        const suffix = data.isReal ? "(实)" : "";
        const newText = `${formatCurrency(data.rowProfit)}${suffix}`;
        updateAndFlash(data.profitCell, newText);
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
  
  // 更新图表
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  // 只有在交易时间或有意义的时刻才记录
  // 简单起见，只要有数据变化且是今天，就记录
  saveTrendPointToStorage({ time: timeStr, profit: totalProfit });
  
  const history = loadTrendHistoryFromStorage();
  if (history && history.data) {
      drawTrendChart("trend-chart-container", history.data);
  }
}

// --- Event Handlers ---

function handleNameInput(event) {
  const input = event.currentTarget;
  const rawValue = input.value;
  
  // Check for batch input (paste)
  // Pattern: multiple 6-digit codes separated by spaces, commas, or newlines
  // e.g., "110022 000001" or "110022,000001"
  // But we need to be careful not to trigger this when user is just typing a single code and presses space
  // So we check if there are at least two 6-digit codes
  const potentialCodes = rawValue.match(/\d{6}/g);
  
  if (potentialCodes && potentialCodes.length > 1) {
      // It's a batch paste
      // 1. Update current row with the first code
      input.value = potentialCodes[0];
      // Trigger fetch for current row
      handleDebouncedNameInput(input);
      
      const tbody = document.getElementById("fund-table-body");
      const fragment = document.createDocumentFragment();
      const currentRow = input.closest('tr[data-role="fund-row"]');
      
      // 2. Add new rows for the rest
      for (let i = 1; i < potentialCodes.length; i++) {
          const code = potentialCodes[i];
          const newRow = createTableRow({ name: code, zfbAmount: null, stockAmount: null });
          fragment.appendChild(newRow);
          
          // We need to trigger fetch for these new rows too
          // But since they are not in DOM yet, we can't easily use handleDebouncedNameInput on them 
          // (unless we append first, which we will do)
      }
      
      if (currentRow) {
          if (currentRow.nextSibling) {
              tbody.insertBefore(fragment, currentRow.nextSibling);
          } else {
              tbody.appendChild(fragment);
          }
      } else {
           tbody.appendChild(fragment);
      }
      
      updateRowIndices();
      
      // Trigger fetch for new rows
      // We need to find the rows we just added. 
      // A simple way is to iterate from the next sibling of currentRow
      let nextRow = currentRow.nextSibling;
      let count = 1;
      while(nextRow && count < potentialCodes.length) {
          const inputs = getFundRowInputs(nextRow);
          if (inputs.nameInput) {
               // Force fetch immediately for new rows
               tryFetchFundByInput(inputs.nameInput, { showAlertOnMissing: false });
          }
          nextRow = nextRow.nextSibling;
          count++;
      }
      
      handleStorageUpdate();
      return;
  }

  handleStorageUpdate();
  handleDebouncedNameInput(input);
}

function handleNameBlur(event) {
  const input = event.currentTarget;
  handleStorageUpdate(); // Blur can be immediate
  // Blur 时不再触发查询，避免与 Debounce 冲突或重复查询
}

function handleNameKeyDown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    const input = event.currentTarget;
    handleStorageUpdate(); // Enter can be immediate
    tryFetchFundByInput(input, { showAlertOnMissing: true });
  }
}

function handleAmountBlur(event) {
  const input = event.currentTarget;
  const value = parseFloat(input.value);
  const normalized = Number.isNaN(value) ? 0 : value;
  input.value = formatCurrency(normalized);
  handleStorageUpdate(); // Blur immediate
}

function handleAmountInput() {
  scheduleProfit();
  handleDebouncedStorageUpdate();
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
    if (!isEmptyRow && nameValue) {
      const confirmed = window.confirm("确定要删除这条持仓记录吗？");
      if (!confirmed) {
        return;
      }
    }
    row.remove();
    if (originalOrderSnapshot) {
      const idx = originalOrderSnapshot.indexOf(row);
      if (idx !== -1) {
        originalOrderSnapshot.splice(idx, 1);
      }
    }
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
  
  const targetCell = event.currentTarget;
  const targetRow = targetCell.parentElement;
  
  if (dragSourceRow && targetRow !== dragSourceRow) {
      const rect = targetRow.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      
      // Clear previous styles
      const rows = getFundRows();
      rows.forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
      
      if (event.clientY < midY) {
          targetRow.classList.add('drag-over-top');
      } else {
          targetRow.classList.add('drag-over-bottom');
      }
  }
}

function handleRowDrop(event) {
  event.preventDefault();
  const targetCell = event.currentTarget;
  const targetRow = targetCell.parentElement;
  
  // Clear styles
  const rows = getFundRows();
  rows.forEach(r => r.classList.remove('drag-over-top', 'drag-over-bottom'));
  
  if (!dragSourceRow || dragSourceRow === targetRow) {
    return;
  }
  const tbody = targetRow.parentElement;
  const allRows = Array.from(tbody.querySelectorAll('tr[data-role="fund-row"]'));
  const sourceIndex = allRows.indexOf(dragSourceRow);
  const targetIndex = allRows.indexOf(targetRow);
  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }
  
  const rect = targetRow.getBoundingClientRect();
  const midY = rect.top + rect.height / 2;
  
  if (event.clientY < midY) {
      // Insert before
      tbody.insertBefore(dragSourceRow, targetRow);
  } else {
      // Insert after
      tbody.insertBefore(dragSourceRow, targetRow.nextSibling);
  }
}

function handleRowDragEnd() {
  const rows = getFundRows();
  rows.forEach(row => {
    row.classList.remove("dragging", "drag-over-top", "drag-over-bottom");
  });
  dragSourceRow = null;
  updateRowIndices();
  handleStorageUpdate();
  scheduleProfit();
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
  nameInput.addEventListener("input", handleNameInput);
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

// --- Sorting ---

function getRowPercent(row) {
  const percentCell = row.querySelector('td[data-role="percent-cell"] span');
  // 优化：优先从 dataset 读取数值
  if (percentCell && percentCell.dataset && percentCell.dataset.value) {
    return parseFloat(percentCell.dataset.value);
  }
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

// --- Main App Logic ---

function populateTableFromStorage() {
  const tbody = document.getElementById("fund-table-body");
  tbody.innerHTML = "";
  const holdings = loadHoldingsFromStorage();
  const statusMap = loadPercentStatusFromStorage();
  const fragment = document.createDocumentFragment();
  const onlyEstimates = shouldShowEstimateOnly();

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

      // Try to restore percent status
      const code = getFundCodeFromRow(row);
      if (code && statusMap[code]) {
        const status = statusMap[code];
        if (status.isReal && !onlyEstimates) {
          const percentCell = row.querySelector('td[data-role="percent-cell"] span');
          if (percentCell) {
             percentCell.textContent = `${formatNumber(status.percent)}%(实)`;
             percentCell.dataset.real = "true";
             // 优化：写入 dataset.value
             percentCell.dataset.value = status.percent;
             applyProfitColor(percentCell, status.percent);
          }
        }
      }

      fragment.appendChild(row);
    });
  }
  tbody.appendChild(fragment);
  updateRowIndices();
  calculateProfit();
}

function autoFetchPercentages(options) {
  if (isGlobalFetching) {
    return;
  }
  const useButton = !options || options.useButton !== false;
  const showAlert = !options || options.showAlert !== false;
  const rows = getFundRows();
  const promises = [];
  const onlyEstimates = shouldShowEstimateOnly();

  rows.forEach(row => {
    const code = getFundCodeFromRow(row);
    if (!code) {
      return;
    }
    const percentCell = row.querySelector('td[data-role="percent-cell"] span');
    if (!percentCell) {
      return;
    }
    // If we should keep real values (before 9am) and this row has real value, skip it
    if (!onlyEstimates && percentCell.dataset && percentCell.dataset.real) {
      return;
    }
    
    // Add updating visual feedback
    row.classList.add("updating");

    const promise = fetchFundEstimate(code).then(percent => {
      // 优化：统一更新 DOM 逻辑
      const value = formatNumber(percent);
      const suffix = onlyEstimates ? "" : ""; // Estimate has no suffix
      percentCell.textContent = `${value}%${suffix}`;
      // 优化：写入 dataset.value
      percentCell.dataset.value = percent;
      applyProfitColor(percentCell, percent);
      
      if (percentCell.dataset && percentCell.dataset.real) {
        delete percentCell.dataset.real;
      }
      return true;
    }).catch(() => {
      // On failure
      if (onlyEstimates) {
        percentCell.textContent = "0.00%";
        percentCell.dataset.value = 0;
        applyProfitColor(percentCell, 0);
        if (percentCell.dataset && percentCell.dataset.real) {
          delete percentCell.dataset.real;
        }
        return true; // We handled it by setting to 0
      }
      return false;
    }).finally(() => {
        // Remove updating visual feedback
        row.classList.remove("updating");
    });
    promises.push(promise);
  });
  if (promises.length === 0) {
    if (showAlert) {
      window.alert("请先在名称中输入包含6位基金代码的内容");
    }
    return;
  }
  const fetchButton = document.getElementById("fetch-percent-btn");
  if (fetchButton) {
    fetchButton.disabled = true;
    const icon = fetchButton.querySelector(".refresh-icon");
    if (icon) icon.classList.add("spinning");
  }
  isGlobalFetching = true;
  Promise.all(promises).then(results => {
    isGlobalFetching = false;
    const successCount = results.filter(Boolean).length;
    if (fetchButton) {
      fetchButton.disabled = false;
      const icon = fetchButton.querySelector(".refresh-icon");
      if (icon) icon.classList.remove("spinning");
    }
    if (successCount === 0) {
      if (showAlert) {
        window.alert("未能获取任何基金的预估涨跌，请检查基金代码或网络连接");
      }
      return;
    }
    scheduleProfit();

    // Re-apply sort if active
    if (percentSortOrder) {
      sortTableBy("percent", percentSortOrder);
    } else if (profitSortOrder) {
      sortTableBy("profit", profitSortOrder);
    }
  });
}

function fetchRealPercentagesForAllFunds() {
  const rows = getFundRows();
  const promises = [];
  const chinaTime = getChinaDate();
  
  const year = chinaTime.getFullYear();
  const month = String(chinaTime.getMonth() + 1).padStart(2, "0");
  const day = String(chinaTime.getDate()).padStart(2, "0");
  const todayStr = `${year}-${month}-${day}`;
  
  let expectedDateStr = todayStr;
  const dayOfWeek = chinaTime.getDay();
  const currentMinutes = chinaTime.getHours() * 60 + chinaTime.getMinutes();
  const isBeforeMarketOpen = currentMinutes < 9 * 60 + 30; // Before 09:30

  if (dayOfWeek === 0) { // Sunday
    const d = new Date(chinaTime);
    d.setDate(chinaTime.getDate() - 2);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    expectedDateStr = `${d.getFullYear()}-${m}-${dy}`;
  } else if (dayOfWeek === 6) { // Saturday
    const d = new Date(chinaTime);
    d.setDate(chinaTime.getDate() - 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    expectedDateStr = `${d.getFullYear()}-${m}-${dy}`;
  } else if (isBeforeMarketOpen) {
    const d = new Date(chinaTime);
    if (dayOfWeek === 1) {
       d.setDate(chinaTime.getDate() - 3);
    } else {
       d.setDate(chinaTime.getDate() - 1);
    }
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    expectedDateStr = `${d.getFullYear()}-${m}-${dy}`;
  } else {
    // After 09:30 on weekdays.
    // We expect the data date to be Today.
    // If it's evening and data is not updated yet, we should fall back to estimate.
    expectedDateStr = todayStr;
  }


  rows.forEach(row => {
    const code = getFundCodeFromRow(row);
    if (!code) {
      return;
    }
    const percentCell = row.querySelector('td[data-role="percent-cell"] span');
    if (!percentCell) {
      return;
    }

    // Chain fetchFundRealPercent first and check its date
    // Add updating visual feedback
    row.classList.add("updating");
    
    const promise = fetchFundRealPercent(code).then(result => {
      const { percent, date } = result;
      
      if (expectedDateStr && date !== expectedDateStr) {
         // Date mismatch, data is old.
         throw new Error("Data not updated yet");
      }
      
      const value = formatNumber(percent);
      percentCell.textContent = `${value}%(实)`;
      // 优化：写入 dataset.value
      percentCell.dataset.value = percent;
      applyProfitColor(percentCell, percent);
      if (percentCell.dataset) {
        percentCell.dataset.real = "true";
      }
      return true;
    }).catch((err) => {
      // If real update fails or date mismatch, fallback to estimate
      return fetchFundEstimate(code).then(estimate => {
           const value = formatNumber(estimate);
           percentCell.textContent = `${value}%`;
           // 优化：写入 dataset.value
           percentCell.dataset.value = estimate;
           applyProfitColor(percentCell, estimate);
           if (percentCell.dataset && percentCell.dataset.real) {
             delete percentCell.dataset.real;
           }
           return true;
      }).catch(() => false);
    }).finally(() => {
        // Remove updating visual feedback
        row.classList.remove("updating");
    });
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
    const statusMap = loadPercentStatusFromStorage();
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
      } else {
        // 优化：优先从 dataset 读取数值
        const percent = percentCell.dataset.value ? parseFloat(percentCell.dataset.value) : parseFloat(percentCell.textContent);
        if (!Number.isNaN(percent)) {
          statusMap[code] = {
            percent,
            isReal: true,
            time: Date.now()
          };
        }
      }
    });
    savePercentStatusToStorage(statusMap);
    
    if (percentSortOrder) {
      sortTableBy("percent", percentSortOrder);
    } else if (profitSortOrder) {
      sortTableBy("profit", profitSortOrder);
    }
    
    return { anySuccess: successCount > 0, allDone };
  });
}

function triggerRealUpdateIfNeeded() {
   if (isGlobalFetching) {
     return;
   }
   const fetchButton = document.getElementById("fetch-percent-btn");
   if (fetchButton) {
     fetchButton.disabled = true;
     const icon = fetchButton.querySelector(".refresh-icon");
     if (icon) icon.classList.add("spinning");
   }
   
    isGlobalFetching = true;
    fetchRealPercentagesForAllFunds().then(result => {
      isGlobalFetching = false;
      if (result && result.allDone) {
        realUpdateDone = true;
      }
      if (fetchButton) {
        fetchButton.disabled = false;
        const icon = fetchButton.querySelector(".refresh-icon");
        if (icon) icon.classList.remove("spinning");
      }
    });
}

function setupDailyRealUpdateScheduler() {
  if (!isChromeExtensionEnv()) {
    return;
  }
  const status = getAppStatus();
  if (status === APP_STATE.REAL) {
    triggerRealUpdateIfNeeded();
  }
}


function exportConfig() {
  const holdings = loadHoldingsFromStorage();
  const config = {
    version: 1,
    exportDate: getTodayDateString(),
    holdings: holdings
  };
  const jsonString = JSON.stringify(config, null, 2);
  const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  const dateStr = getTodayDateString().split(" ")[0];
  link.setAttribute("download", `finance_config_${dateStr}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function importConfig(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const config = JSON.parse(e.target.result);
      if (config && Array.isArray(config.holdings)) {
        if (confirm(`检测到 ${config.holdings.length} 条持仓记录，确认覆盖当前配置吗？`)) {
          saveHoldingsToStorage(config.holdings);
          populateTableFromStorage();
          alert("配置导入成功！");
        }
      } else {
        alert("无效的配置文件格式");
      }
    } catch (err) {
      console.error("Import error", err);
      alert("读取配置文件失败");
    }
    // Reset input
    event.target.value = "";
  };
  reader.readAsText(file);
}

function handleKeyboardShortcuts(event) {
  // Cmd/Ctrl + R: Refresh
  if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
    event.preventDefault();
    const fetchBtn = document.getElementById("fetch-percent-btn");
    if (fetchBtn) fetchBtn.click();
    return;
  }
  
  // Cmd/Ctrl + I: Focus Input (Add Fund)
  if ((event.metaKey || event.ctrlKey) && event.key === 'i') {
    event.preventDefault();
    const addBtn = document.getElementById("add-fund-btn");
    if (addBtn) addBtn.click();
    // After adding row, focus the first input of the last row
    setTimeout(() => {
        const rows = getFundRows();
        if (rows.length > 0) {
            const lastRow = rows[rows.length - 1];
            const inputs = getFundRowInputs(lastRow);
            if (inputs.nameInput) inputs.nameInput.focus();
        }
    }, 50);
    return;
  }
}

function copySummaryReport() {
  const dateStr = getTodayDateString();
  const totalAmount = document.getElementById("total-amount").textContent;
  const totalProfit = document.getElementById("total-profit").textContent;
  const totalPercent = document.getElementById("total-percent").textContent;
  
  const lines = [];
  lines.push(`【基金战报】${dateStr}`);
  lines.push(`总持有：${totalAmount}`);
  lines.push(`当日盈亏：${totalProfit} (${totalPercent})`);
  lines.push("----------------");
  
  const rows = getFundRows();
  rows.forEach((row, index) => {
    const inputs = getFundRowInputs(row);
    const name = inputs.nameInput ? inputs.nameInput.value.trim() : "未命名";
    const simpleName = name.split(/\s+/).slice(1).join(" ") || name;
    
    const percentCell = row.querySelector('td[data-role="percent-cell"] span');
    const profitCell = row.querySelector('td[data-role="profit-cell"] span');
    
    const percent = percentCell ? percentCell.textContent : "0%";
    const profit = profitCell ? profitCell.textContent : "0";
    
    lines.push(`${index + 1}. ${simpleName}: ${percent} (${profit})`);
  });
  
  const text = lines.join("\n");
  
  navigator.clipboard.writeText(text).then(() => {
    window.alert("战报已复制到剪贴板！");
  }).catch(() => {
    window.alert("复制失败，请手动复制。");
  });
}

// --- Modal Logic ---

function openAddFundModal() {
  const modal = document.getElementById("add-fund-modal");
  const input = document.getElementById("fund-search-input");
  if (modal) {
    modal.classList.add("open");
    selectedFunds.clear();
    currentSearchResults = [];
    updateSelectedCount();
    renderSearchResults([]);
    if (input) {
      input.value = "";
      input.focus();
    }
  }
}

function closeAddFundModal() {
  const modal = document.getElementById("add-fund-modal");
  if (modal) {
    modal.classList.remove("open");
  }
}

function performSearch(keyword) {
  if (!keyword) {
    renderSearchResults([]);
    return;
  }
  
  const resultsContainer = document.getElementById("search-results-list");
  if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="empty-state">搜索中...</div>';
  }

  searchFund(keyword).then(data => {
    currentSearchResults = data;
    renderSearchResults(data);
  }).catch(err => {
    console.error(err);
    if (resultsContainer) {
        resultsContainer.innerHTML = '<div class="empty-state">搜索失败，请稍后重试</div>';
    }
  });
}

function renderSearchResults(data) {
  const container = document.getElementById("search-results-list");
  if (!container) return;
  
  container.innerHTML = "";
  
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="empty-state">未找到相关基金</div>';
    return;
  }
  
  const fragment = document.createDocumentFragment();
  
  data.forEach(fund => {
    // Only show Funds (CATEGORYDESC === "基金")
    if (fund.CATEGORYDESC !== "基金") return;
    
    const item = document.createElement("div");
    item.className = "search-result-item";
    if (selectedFunds.has(fund.CODE)) {
      item.classList.add("selected");
    }
    
    item.innerHTML = `
      <div class="item-checkbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:10px;height:10px;display:${selectedFunds.has(fund.CODE) ? 'block' : 'none'}">
          <path d="M20 6L9 17l-5-5"/>
        </svg>
      </div>
      <div class="item-info" style="display:flex;align-items:center;width:100%">
        <span class="item-code">${fund.CODE}</span>
        <span class="item-name">${fund.NAME}</span>
        <span class="item-type">${fund.FundBaseInfo ? fund.FundBaseInfo.FTYPE : "基金"}</span>
      </div>
    `;
    
    item.addEventListener("click", () => toggleSelectFund(fund, item));
    fragment.appendChild(item);
  });
  
  if (fragment.children.length === 0) {
      container.innerHTML = '<div class="empty-state">未找到相关基金</div>';
  } else {
      container.appendChild(fragment);
  }
}

function toggleSelectFund(fund, itemElement) {
  if (selectedFunds.has(fund.CODE)) {
    selectedFunds.delete(fund.CODE);
    itemElement.classList.remove("selected");
    itemElement.querySelector("svg").style.display = "none";
  } else {
    selectedFunds.set(fund.CODE, fund);
    itemElement.classList.add("selected");
    itemElement.querySelector("svg").style.display = "block";
  }
  updateSelectedCount();
}

function updateSelectedCount() {
  const countSpan = document.getElementById("selected-count-num");
  const confirmBtn = document.getElementById("confirm-add-btn");
  
  if (countSpan) countSpan.textContent = selectedFunds.size;
  if (confirmBtn) confirmBtn.disabled = selectedFunds.size === 0;
}

function confirmAddFunds() {
  if (selectedFunds.size === 0) return;
  
  const tbody = document.getElementById("fund-table-body");
  const fragment = document.createDocumentFragment();
  const existingRows = getFundRows();
  let addedCount = 0;
  let duplicateCount = 0;
  
  selectedFunds.forEach((fund, code) => {
      // Check if already exists in table to avoid duplicates
      let exists = false;
      existingRows.forEach(r => {
          const c = getFundCodeFromRow(r);
          if (c === code) exists = true;
      });
      
      if (!exists) {
          const name = `${code}  ${fund.NAME}`;
          const row = createTableRow({ name: name, zfbAmount: null, stockAmount: null });
          fragment.appendChild(row);
          addedCount++;
      } else {
          duplicateCount++;
      }
  });
  
  if (addedCount > 0) {
      tbody.appendChild(fragment);
      updateRowIndices();
      handleStorageUpdate();
      scheduleProfit(); // Will fetch estimates
  }
  
  closeAddFundModal();
  
  // Show feedback
  if (duplicateCount > 0) {
      if (addedCount > 0) {
          // window.alert(`成功添加 ${addedCount} 只基金，有 ${duplicateCount} 只已存在被忽略。`);
          // Use less intrusive notification or just log
          console.log(`Added ${addedCount}, Duplicates ignored: ${duplicateCount}`);
      } else {
          window.alert(`所选的 ${duplicateCount} 只基金均已存在，未进行添加。`);
      }
  } else if (addedCount > 0) {
      setTimeout(() => {
         window.scrollTo(0, document.body.scrollHeight);
      }, 100);
  }
}

async function initApp() {
  await initStorage();
  const dateElement = document.getElementById("current-date");
  const tradingStatusElement = document.getElementById("trading-status");
  const tbody = document.getElementById("fund-table-body");
  if (dateElement) {
    dateElement.textContent = getTodayDateString();
  }
  
  // 初始绘制图表
  const history = loadTrendHistoryFromStorage();
  if (history && history.data) {
      drawTrendChart("trend-chart-container", history.data);
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

  const exportConfigButton = document.getElementById("export-config-btn");
  const importButton = document.getElementById("import-btn");
  const importInput = document.getElementById("import-file-input");
  
  const countdownElement = document.getElementById("fetch-btn-status");
  const summaryRow = document.querySelector(".summary-row");

  document.addEventListener("keydown", handleKeyboardShortcuts);

  percentHeader = document.querySelector('th[data-sort="percent"]');
  profitHeader = document.querySelector('th[data-sort="profit"]');
  updateSortHeaderUI();
  
  const sortStatus = loadSortStatusFromStorage();
  if (sortStatus) {
    originalOrderSnapshot = getCurrentRows();
    if (sortStatus.type === "percent") {
      percentSortOrder = sortStatus.order;
      updateSortHeaderUI();
      sortTableBy("percent", percentSortOrder);
    } else if (sortStatus.type === "profit") {
      profitSortOrder = sortStatus.order;
      updateSortHeaderUI();
      sortTableBy("profit", profitSortOrder);
    }
  }

  if (summaryRow) {
    summaryRow.addEventListener("click", (event) => {
      // If click target is inside the toggle-privacy-btn, do not copy report
      if (event.target.closest("#toggle-privacy-btn")) {
        return;
      }
      copySummaryReport();
    });
    summaryRow.title = "点击复制今日战报";
  }

  if (tbody) {
    tbody.addEventListener("click", handleTableClick);
  }
  if (percentHeader) {
    percentHeader.addEventListener("click", () => {
      if (!percentSortOrder) {
        originalOrderSnapshot = getCurrentRows();
        percentSortOrder = "desc";
        profitSortOrder = null;
        saveSortStatusToStorage({ type: "percent", order: "desc" });
        updateSortHeaderUI();
        sortTableBy("percent", "desc");
      } else if (percentSortOrder === "desc") {
        percentSortOrder = "asc";
        saveSortStatusToStorage({ type: "percent", order: "asc" });
        updateSortHeaderUI();
        sortTableBy("percent", "asc");
      } else {
        percentSortOrder = null;
        saveSortStatusToStorage(null);
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
        saveSortStatusToStorage({ type: "profit", order: "desc" });
        updateSortHeaderUI();
        sortTableBy("profit", "desc");
      } else if (profitSortOrder === "desc") {
        profitSortOrder = "asc";
        saveSortStatusToStorage({ type: "profit", order: "asc" });
        updateSortHeaderUI();
        sortTableBy("profit", "asc");
      } else {
        profitSortOrder = null;
        saveSortStatusToStorage(null);
        updateSortHeaderUI();
        restoreOriginalOrder();
        originalOrderSnapshot = null;
      }
    });
  }
  const autoRefreshSeconds = APP_CONFIG.REFRESH_INTERVAL;
  let remainingSeconds = autoRefreshSeconds;
  function updateCountdown() {
    const status = getAppStatus();
    const isPaused = status === APP_STATE.PAUSED || (status === APP_STATE.REAL && realUpdateDone);

    if (countdownElement) {
      if (isPaused) {
        countdownElement.textContent = "（已暂停）";
      } else {
        countdownElement.textContent = `（${remainingSeconds}s）`;
      }
    }

    if (tradingStatusElement) {
      if (status === APP_STATE.ESTIMATE) {
        tradingStatusElement.textContent = `交易时段，自动刷新预估值（${remainingSeconds}s）`;
        tradingStatusElement.classList.remove("paused");
      } else if (status === APP_STATE.REAL) {
         if (realUpdateDone) {
           tradingStatusElement.textContent = "真实涨跌更新完毕";
           tradingStatusElement.classList.add("paused");
         } else {
           tradingStatusElement.textContent = `盘后时段，自动刷新真实涨跌（${remainingSeconds}s）`;
           tradingStatusElement.classList.remove("paused");
         }
      } else {
        tradingStatusElement.textContent = "非刷新时段，自动刷新已暂停";
        tradingStatusElement.classList.add("paused");
      }
    }
  }

  function resetCountdown() {
    remainingSeconds = autoRefreshSeconds;
    updateCountdown();
  }
  
  updateCountdown();
  if (addFundButton) {
    addFundButton.addEventListener("click", openAddFundModal);
  }

  const closeModalBtn = document.getElementById("close-modal-btn");
  const cancelAddBtn = document.getElementById("cancel-add-btn");
  const confirmAddBtn = document.getElementById("confirm-add-btn");
  const searchInput = document.getElementById("fund-search-input");
  const modal = document.getElementById("add-fund-modal");

  if (closeModalBtn) closeModalBtn.addEventListener("click", closeAddFundModal);
  if (cancelAddBtn) cancelAddBtn.addEventListener("click", closeAddFundModal);
  if (confirmAddBtn) confirmAddBtn.addEventListener("click", confirmAddFunds);
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
        handleDebouncedSearch(e.target.value.trim());
    });
  }
  
  // Close modal when clicking outside
  if (modal) {
      modal.addEventListener("click", (e) => {
          if (e.target === modal) {
              closeAddFundModal();
          }
      });
  }

  if (exportConfigButton) {
    exportConfigButton.addEventListener("click", exportConfig);
  }
  if (importButton && importInput) {
    importButton.addEventListener("click", () => importInput.click());
    importInput.addEventListener("change", importConfig);
  }
  if (fetchPercentButton) {
    fetchPercentButton.addEventListener("click", () => {
      const status = getAppStatus();
      const isNightOrMorning = isManualRealFetchTime();
      
      if (status === APP_STATE.REAL || isNightOrMorning || !isTradingDay()) {
        triggerRealUpdateIfNeeded();
      } else {
        autoFetchPercentages({ useButton: true, showAlert: true });
      }
      
      resetCountdown();
    });
  }
  setupDailyRealUpdateScheduler();
  
  const currentStatus = getAppStatus();
  
  if (currentStatus === APP_STATE.ESTIMATE) {
    autoFetchPercentages({ useButton: false, showAlert: false });
  } else if (currentStatus === APP_STATE.REAL) {
    triggerRealUpdateIfNeeded();
  } else {
    const isNightOrMorning = isManualRealFetchTime();
    if (isNightOrMorning || !isTradingDay()) {
        triggerRealUpdateIfNeeded();
    } else {
       if (isTradingDay()) {
           autoFetchPercentages({ useButton: false, showAlert: false });
       }
    }
  }

  if (dateElement) {
    setInterval(() => {
      dateElement.textContent = getTodayDateString();
      
      const status = getAppStatus();
      
      if (status === APP_STATE.ESTIMATE && realUpdateDone) {
        realUpdateDone = false;
      }
      
      let shouldCountdown = true;
      
      if (status === APP_STATE.PAUSED) {
        shouldCountdown = false;
      } else if (status === APP_STATE.REAL && realUpdateDone) {
        shouldCountdown = false;
      }

      if (shouldCountdown) {
        remainingSeconds -= 1;
        if (remainingSeconds <= 0) {
          if (status === APP_STATE.ESTIMATE) {
            autoFetchPercentages({ useButton: false, showAlert: false });
          } else if (status === APP_STATE.REAL) {
            triggerRealUpdateIfNeeded();
          }
          remainingSeconds = autoRefreshSeconds;
        }
      }

      updateCountdown();
    }, 1000);
  }
}

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        initApp();
        initPrivacyMode();
    });
  } else {
    initApp();
    initPrivacyMode();
  }
