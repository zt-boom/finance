export class Calculator {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.rowCache = new Map();
  }

  clearCache() {
    this.rowCache.clear();
  }

  getRowData(row) {
    const rowId = row.dataset.rowId || Math.random().toString(36).substr(2, 9);
    if (!row.dataset.rowId) {
      row.dataset.rowId = rowId;
    }

    if (this.rowCache.has(rowId)) {
      return this.rowCache.get(rowId);
    }

    const inputs = row.querySelectorAll("input");
    const zfbInput = inputs[1];
    const stockInput = inputs[2];
    const amountSpan = row.querySelector('span[data-role="amount-display"]');
    const percentCell = row.querySelector('td[data-role="percent-cell"] span');
    const profitCell = row.querySelector('td[data-role="profit-cell"] span');
    const zfbProfitCell = row.querySelector('td[data-role="zfb-profit-cell"] span');
    const stockProfitCell = row.querySelector('td[data-role="stock-profit-cell"] span');

    const data = {
      zfbInput,
      stockInput,
      amountSpan,
      percentCell,
      profitCell,
      zfbProfitCell,
      stockProfitCell
    };

    this.rowCache.set(rowId, data);
    return data;
  }

  calculateProfit(formatCurrency, formatPercent, applyProfitColor, colors) {
    const rows = this.uiManager.getRows();
    let totalZfbAmount = 0;
    let totalStockAmount = 0;
    let totalZfbProfit = 0;
    let totalStockProfit = 0;
    let totalProfit = 0;
    let totalHoldingAmount = 0;

    rows.forEach(row => {
      const data = this.getRowData(row);
      const zfbAmount = data.zfbInput ? parseFloat(data.zfbInput.value) : NaN;
      const stockAmount = data.stockInput ? parseFloat(data.stockInput.value) : NaN;
      const normalizedZfb = Number.isNaN(zfbAmount) ? 0 : zfbAmount;
      const normalizedStock = Number.isNaN(stockAmount) ? 0 : stockAmount;
      const amount = normalizedZfb + normalizedStock;
      const percent = data.percentCell ? parseFloat(data.percentCell.textContent) : NaN;

      totalZfbAmount += normalizedZfb;
      totalStockAmount += normalizedStock;

      if (data.amountSpan) {
        data.amountSpan.textContent = formatCurrency(amount);
      }

      if (amount > 0) {
        totalHoldingAmount += amount;
      }

      if (amount <= 0 || Number.isNaN(percent)) {
        if (data.zfbProfitCell) {
          data.zfbProfitCell.textContent = "0.00";
          applyProfitColor(data.zfbProfitCell, 0);
        }
        if (data.stockProfitCell) {
          data.stockProfitCell.textContent = "0.00";
          applyProfitColor(data.stockProfitCell, 0);
        }
        if (data.profitCell) {
          data.profitCell.textContent = "0.00";
          applyProfitColor(data.profitCell, 0);
        }
        return;
      }

      const zfbProfit = normalizedZfb * percent / 100;
      const stockProfit = normalizedStock * percent / 100;
      const profit = zfbProfit + stockProfit;

      totalZfbProfit += zfbProfit;
      totalStockProfit += stockProfit;
      totalProfit += profit;

      if (data.zfbProfitCell) {
        data.zfbProfitCell.textContent = formatCurrency(zfbProfit);
        applyProfitColor(data.zfbProfitCell, zfbProfit);
      }
      if (data.stockProfitCell) {
        data.stockProfitCell.textContent = formatCurrency(stockProfit);
        applyProfitColor(data.stockProfitCell, stockProfit);
      }
      if (data.profitCell) {
        data.profitCell.textContent = formatCurrency(profit);
        applyProfitColor(data.profitCell, profit);
      }
    });

    const totalPercent = totalHoldingAmount > 0 ? (totalProfit / totalHoldingAmount) * 100 : 0;

    return {
      totalZfbAmount,
      totalStockAmount,
      totalHoldingAmount,
      totalPercent,
      totalZfbProfit,
      totalStockProfit,
      totalProfit
    };
  }

  readHoldingsFromTable() {
    const rows = this.uiManager.getRows();
    const holdings = [];

    rows.forEach(row => {
      const data = this.getRowData(row);
      const nameInput = row.querySelector("input");

      const name = nameInput ? nameInput.value.trim() : "";
      const zfbAmount = data.zfbInput ? parseFloat(data.zfbInput.value) : NaN;
      const stockAmount = data.stockInput ? parseFloat(data.stockInput.value) : NaN;

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
}
