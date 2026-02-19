export function drawTrendChart(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Clear previous content
  container.innerHTML = "";
  
  if (!data || data.length === 0) {
      container.textContent = "暂无今日走势数据";
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.style.justifyContent = "center";
      container.style.color = "#9ca3af";
      return;
  }
  
  const width = container.clientWidth;
  const height = container.clientHeight;
  const padding = { top: 20, right: 20, bottom: 20, left: 40 };
  
  const canvas = document.createElement("canvas");
  canvas.width = width * 2; // Retina support
  canvas.height = height * 2;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  
  container.appendChild(canvas);
  
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  
  // Find min/max profit
  let minProfit = Infinity;
  let maxProfit = -Infinity;
  
  data.forEach(p => {
      if (p.profit < minProfit) minProfit = p.profit;
      if (p.profit > maxProfit) maxProfit = p.profit;
  });
  
  // Add some buffer
  const range = maxProfit - minProfit;
  const buffer = range === 0 ? Math.abs(maxProfit) * 0.1 || 10 : range * 0.1;
  minProfit -= buffer;
  maxProfit += buffer;
  
  // Ensure 0 is included if possible/sensible, but let's stick to auto-scale for now
  
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  
  // Helper to map x, y
  const getX = (index) => padding.left + (index / (data.length - 1 || 1)) * chartWidth;
  const getY = (profit) => padding.top + chartHeight - ((profit - minProfit) / (maxProfit - minProfit)) * chartHeight;
  
  // Draw Grid & Axes
  ctx.beginPath();
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  
  // Zero line
  const zeroY = getY(0);
  if (zeroY >= padding.top && zeroY <= height - padding.bottom) {
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(width - padding.right, zeroY);
      ctx.strokeStyle = "#d1d5db"; // Darker for zero line
      ctx.stroke();
  }
  
  // Draw Trend Line
  ctx.beginPath();
  ctx.strokeStyle = "#3b82f6"; // Blue
  ctx.lineWidth = 2;
  
  data.forEach((p, i) => {
      const x = getX(i);
      const y = getY(p.profit);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
  });
  
  ctx.stroke();
  
  // Fill Area
  ctx.beginPath();
  ctx.fillStyle = "rgba(59, 130, 246, 0.1)"; // Blue with opacity
  const firstX = getX(0);
  const firstY = getY(data[0].profit);
  ctx.moveTo(firstX, firstY);
  
  data.forEach((p, i) => {
      const x = getX(i);
      const y = getY(p.profit);
      ctx.lineTo(x, y);
  });
  
  // Close path to bottom or zero line
  const lastX = getX(data.length - 1);
  const baseY = Math.min(Math.max(getY(0), padding.top), height - padding.bottom);
  
  ctx.lineTo(lastX, baseY);
  ctx.lineTo(firstX, baseY);
  ctx.fill();
  
  // Draw Labels (Min/Max/Current)
  ctx.fillStyle = "#6b7280";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  
  // Y-axis labels
  ctx.fillText(maxProfit.toFixed(0), padding.left - 5, padding.top);
  ctx.fillText(minProfit.toFixed(0), padding.left - 5, height - padding.bottom);
  if (minProfit < 0 && maxProfit > 0) {
     ctx.fillText("0", padding.left - 5, zeroY);
  }
  
  // Last point value
  const lastP = data[data.length - 1];
  const lastY = getY(lastP.profit);
  ctx.fillStyle = lastP.profit >= 0 ? "#ef4444" : "#10b981";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText(lastP.profit.toFixed(2), width - 5, lastY - 10);
  
  // Draw dot at last point
  ctx.beginPath();
  ctx.fillStyle = lastP.profit >= 0 ? "#ef4444" : "#10b981";
  ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
  ctx.fill();
}
