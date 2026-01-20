export class FundFetcher {
  constructor(fetchFundEstimate, parseFundCodeFromName, uiManager) {
    this.fetchFundEstimate = fetchFundEstimate;
    this.parseFundCodeFromName = parseFundCodeFromName;
    this.uiManager = uiManager;
    this.isFetching = false;
    this.maxConcurrentRequests = 5;
    this.retryAttempts = 2;
    this.retryDelay = 1000;
  }

  async fetchAllPercentages(options) {
    if (this.isFetching) {
      return;
    }
    const useButton = !options || options.useButton !== false;
    const showAlert = !options || options.showAlert !== false;
    const rows = this.uiManager.getRows();
    const fetchTasks = [];

    rows.forEach(row => {
      const inputs = row.querySelectorAll("input");
      const nameInput = inputs[0];
      const name = nameInput ? nameInput.value.trim() : "";
      const code = this.parseFundCodeFromName(name);
      if (!code) {
        return;
      }
      const percentCell = row.querySelector('td[data-role="percent-cell"] span');
      if (!percentCell) {
        return;
      }
      fetchTasks.push({
        code,
        percentCell,
        row
      });
    });

    if (fetchTasks.length === 0) {
      if (showAlert) {
        window.alert("请先在名称中输入包含6位基金代码的内容");
      }
      return;
    }

    if (useButton) {
      this.uiManager.setFetchButtonDisabled(true);
    }
    this.isFetching = true;

    try {
      const results = await this.fetchWithConcurrencyLimit(fetchTasks);
      const successCount = results.filter(Boolean).length;

      if (successCount === 0 && showAlert) {
        window.alert("未能获取任何基金的预估涨跌，请检查基金代码或网络连接");
      }
    } catch (error) {
      console.error("Failed to fetch fund percentages:", error);
      if (showAlert) {
        window.alert("获取基金数据时发生错误，请稍后重试");
      }
    } finally {
      this.isFetching = false;
      if (useButton) {
        this.uiManager.setFetchButtonDisabled(false);
      }
    }
  }

  async fetchWithConcurrencyLimit(tasks) {
    const results = [];
    const executing = [];

    for (const task of tasks) {
      const promise = this.fetchWithRetry(task).then(result => {
        results.push(result);
        executing.splice(executing.indexOf(promise), 1);
        return result;
      });

      executing.push(promise);

      if (executing.length >= this.maxConcurrentRequests) {
        await Promise.race(executing);
      }
    }

    await Promise.all(executing);
    return results;
  }

  async fetchWithRetry(task, attempt = 1) {
    try {
      const percent = await this.fetchFundEstimate(task.code);
      task.percentCell.textContent = `${percent.toFixed(2)}%`;
      return true;
    } catch (error) {
      if (attempt < this.retryAttempts) {
        await this.delay(this.retryDelay * attempt);
        return this.fetchWithRetry(task, attempt + 1);
      }
      console.error(`Failed to fetch fund ${task.code} after ${attempt} attempts:`, error);
      return false;
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
