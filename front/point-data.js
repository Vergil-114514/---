(function () {
  const els = {
    seedInput: document.getElementById("seedInput"),
    trialInput: document.getElementById("trialInput"),
    regenerateBtn: document.getElementById("regenerateBtn"),
    csvBtn: document.getElementById("csvBtn"),
    jsonBtn: document.getElementById("jsonBtn"),
    metricSuccess: document.getElementById("metricSuccess"),
    metricSuccessDetail: document.getElementById("metricSuccessDetail"),
    metricPressTime: document.getElementById("metricPressTime"),
    metricTapOffset: document.getElementById("metricTapOffset"),
    metricPressOffset: document.getElementById("metricPressOffset"),
    metricLiftOffset: document.getElementById("metricLiftOffset"),
    scatterCanvas: document.getElementById("scatterCanvas"),
    offsetCanvas: document.getElementById("offsetCanvas"),
    histCanvas: document.getElementById("histCanvas"),
    seriesCanvas: document.getElementById("seriesCanvas"),
    dataBody: document.getElementById("dataBody"),
    tableCount: document.getElementById("tableCount")
  };

  let currentRows = [];

  function createRng(seed) {
    let state = Number(seed) >>> 0;
    if (!state) state = 1;
    return function random() {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  }

  function normal(rng, mean = 0, sd = 1) {
    const u1 = Math.max(rng(), 1e-9);
    const u2 = Math.max(rng(), 1e-9);
    return mean + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sd;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function distance(x, y) {
    return Math.sqrt(x * x + y * y);
  }

  function round(value, digits = 2) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  function generateRows(seed, count) {
    const rng = createRng(seed);
    const rows = [];
    const targetSet = [
      { x: 220, y: 160 },
      { x: 420, y: 160 },
      { x: 620, y: 160 },
      { x: 300, y: 320 },
      { x: 520, y: 320 },
      { x: 400, y: 470 }
    ];

    for (let i = 0; i < count; i += 1) {
      const target = targetSet[i % targetSet.length];
      const fatigue = i / Math.max(1, count - 1);
      const skillWave = Math.sin(i * 0.31) * 1.4;
      const baseSd = 7.4 + fatigue * 4.2 + Math.abs(skillWave);

      const x_t = normal(rng, normal(rng, 0, 1.2), baseSd);
      const y_t = normal(rng, 1.8 + fatigue * 2.4, baseSd * 0.86);
      const x_p = x_t + normal(rng, 0, 3.2 + fatigue * 1.5);
      const y_p = y_t + normal(rng, 0, 3.4 + fatigue * 1.5);
      const x_l = x_p + normal(rng, 0.6, 4.2 + fatigue * 2.1);
      const y_l = y_p + normal(rng, 0.8, 4.4 + fatigue * 2.1);

      const s_t = distance(x_t, y_t);
      const s_p = distance(x_p, y_p);
      const s_l = distance(x_l, y_l);
      const pressStartMs = 800 + i * 1350 + Math.floor(rng() * 210);
      const t_p = clamp(normal(rng, 330 + fatigue * 48 + s_l * 1.1, 54), 135, 760);
      const pressEndMs = pressStartMs + t_p;
      const success = s_t <= 18 && s_l <= 24 && t_p >= 150 && t_p <= 650;

      rows.push({
        participant_id: "P01",
        trial_id: i + 1,
        target_x: target.x,
        target_y: target.y,
        tap_x: round(target.x + x_t),
        tap_y: round(target.y + y_t),
        press_x: round(target.x + x_p),
        press_y: round(target.y + y_p),
        lift_x: round(target.x + x_l),
        lift_y: round(target.y + y_l),
        x_t: round(x_t),
        y_t: round(y_t),
        s_t: round(s_t),
        x_p: round(x_p),
        y_p: round(y_p),
        s_p: round(s_p),
        x_l: round(x_l),
        y_l: round(y_l),
        s_l: round(s_l),
        press_start_ms: Math.round(pressStartMs),
        press_end_ms: Math.round(pressEndMs),
        t_p: Math.round(t_p),
        success: success ? 1 : 0
      });
    }

    return rows;
  }

  function summarize(rows) {
    const total = rows.length || 1;
    const successCount = rows.filter((row) => row.success === 1).length;
    return {
      total,
      successCount,
      rc: successCount / total,
      avgTp: average(rows, "t_p"),
      avgSt: average(rows, "s_t"),
      avgSp: average(rows, "s_p"),
      avgSl: average(rows, "s_l")
    };
  }

  function average(rows, key) {
    if (!rows.length) return 0;
    return rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length;
  }

  function renderMetrics(rows) {
    const summary = summarize(rows);
    els.metricSuccess.textContent = `${(summary.rc * 100).toFixed(1)}%`;
    els.metricSuccessDetail.textContent = `${summary.successCount} / ${summary.total} 成功`;
    els.metricPressTime.textContent = `${summary.avgTp.toFixed(0)}`;
    els.metricTapOffset.textContent = summary.avgSt.toFixed(1);
    els.metricPressOffset.textContent = summary.avgSp.toFixed(1);
    els.metricLiftOffset.textContent = summary.avgSl.toFixed(1);
  }

  function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function clearChart(ctx, width, height) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }

  function drawText(ctx, text, x, y, options = {}) {
    ctx.save();
    ctx.fillStyle = options.color || "#465467";
    ctx.font = `${options.weight || 600} ${options.size || 12}px "Microsoft YaHei", Arial, sans-serif`;
    ctx.textAlign = options.align || "left";
    ctx.textBaseline = options.baseline || "middle";
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawScatter(rows) {
    const { ctx, width, height } = setupCanvas(els.scatterCanvas);
    clearChart(ctx, width, height);
    const pad = { left: 58, right: 20, top: 22, bottom: 42 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const maxAbs = Math.max(30, Math.ceil(Math.max(...rows.flatMap((row) => [
      Math.abs(row.x_t), Math.abs(row.y_t), Math.abs(row.x_p), Math.abs(row.y_p), Math.abs(row.x_l), Math.abs(row.y_l)
    ])) / 10) * 10);
    const cx = pad.left + chartW / 2;
    const cy = pad.top + chartH / 2;
    const scale = Math.min(chartW, chartH) / (maxAbs * 2);

    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1;
    for (let step = -maxAbs; step <= maxAbs; step += 10) {
      const gx = cx + step * scale;
      const gy = cy - step * scale;
      ctx.beginPath();
      ctx.moveTo(gx, pad.top);
      ctx.lineTo(gx, pad.top + chartH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.left, gy);
      ctx.lineTo(pad.left + chartW, gy);
      ctx.stroke();
    }

    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pad.left, cy);
    ctx.lineTo(pad.left + chartW, cy);
    ctx.moveTo(cx, pad.top);
    ctx.lineTo(cx, pad.top + chartH);
    ctx.stroke();

    drawTargetCircle(ctx, cx, cy, 18 * scale, "#2563eb", "18px");
    drawTargetCircle(ctx, cx, cy, 24 * scale, "#d97706", "24px");

    rows.forEach((row) => {
      if (!row.success) drawPoint(ctx, cx + row.x_t * scale, cy - row.y_t * scale, "#dc2626", 3.7, 0.75);
    });
    rows.forEach((row) => drawPoint(ctx, cx + row.x_p * scale, cy - row.y_p * scale, "#0f9f6e", 2.8, 0.42));
    rows.forEach((row) => drawPoint(ctx, cx + row.x_l * scale, cy - row.y_l * scale, "#d97706", 3.1, 0.48));
    rows.forEach((row) => drawPoint(ctx, cx + row.x_t * scale, cy - row.y_t * scale, "#2563eb", 3, 0.7));

    drawText(ctx, `x 偏移 px`, cx, height - 14, { align: "center" });
    drawText(ctx, `y 偏移 px`, 12, cy, { align: "left" });
    drawText(ctx, `0`, cx + 7, cy + 12, { size: 11, color: "#64748b" });
    drawText(ctx, `-${maxAbs}`, pad.left, height - 18, { align: "center", size: 11 });
    drawText(ctx, `${maxAbs}`, pad.left + chartW, height - 18, { align: "center", size: 11 });
  }

  function drawTargetCircle(ctx, x, y, radius, color, label) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    drawText(ctx, label, x + radius + 6, y - 7, { color, size: 11 });
    ctx.restore();
  }

  function drawPoint(ctx, x, y, color, radius, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawOffsetBars(rows) {
    const { ctx, width, height } = setupCanvas(els.offsetCanvas);
    clearChart(ctx, width, height);
    const data = [
      { label: "s_t", value: average(rows, "s_t"), color: "#2563eb" },
      { label: "s_p", value: average(rows, "s_p"), color: "#0f9f6e" },
      { label: "s_l", value: average(rows, "s_l"), color: "#d97706" }
    ];
    const pad = { left: 52, right: 20, top: 20, bottom: 46 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const maxValue = Math.max(30, Math.ceil(Math.max(...data.map((item) => item.value)) / 5) * 5);

    drawYAxis(ctx, pad, chartW, chartH, maxValue, 5);

    const gap = chartW / data.length;
    data.forEach((item, index) => {
      const barW = Math.min(72, gap * 0.42);
      const x = pad.left + gap * index + gap / 2 - barW / 2;
      const h = (item.value / maxValue) * chartH;
      const y = pad.top + chartH - h;
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y, barW, h);
      drawText(ctx, item.label, x + barW / 2, height - 20, { align: "center" });
      drawText(ctx, item.value.toFixed(1), x + barW / 2, y - 10, { align: "center", color: "#172033" });
    });
  }

  function drawHistogram(rows) {
    const { ctx, width, height } = setupCanvas(els.histCanvas);
    clearChart(ctx, width, height);
    const bins = [150, 225, 300, 375, 450, 525, 600, 675, 750];
    const counts = bins.slice(0, -1).map((start, index) => {
      const end = bins[index + 1];
      return rows.filter((row) => row.t_p >= start && row.t_p < end).length;
    });
    const pad = { left: 42, right: 18, top: 20, bottom: 46 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const maxCount = Math.max(1, Math.max(...counts));

    drawYAxis(ctx, pad, chartW, chartH, maxCount, 4);

    const gap = chartW / counts.length;
    counts.forEach((count, index) => {
      const barW = gap * 0.68;
      const x = pad.left + gap * index + gap * 0.16;
      const h = (count / maxCount) * chartH;
      const y = pad.top + chartH - h;
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(x, y, barW, h);
      drawText(ctx, `${bins[index]}`, x + barW / 2, height - 20, { align: "center", size: 11 });
    });

    drawText(ctx, "t_p(ms)", width / 2, height - 7, { align: "center", size: 11 });
  }

  function drawSeries(rows) {
    const { ctx, width, height } = setupCanvas(els.seriesCanvas);
    clearChart(ctx, width, height);
    const pad = { left: 52, right: 22, top: 20, bottom: 42 };
    const chartW = width - pad.left - pad.right;
    const chartH = height - pad.top - pad.bottom;
    const minY = 120;
    const maxY = 800;

    drawYAxis(ctx, pad, chartW, chartH, maxY, 4, minY);

    function xAt(index) {
      return pad.left + (index / Math.max(1, rows.length - 1)) * chartW;
    }

    function yAt(value) {
      return pad.top + chartH - ((value - minY) / (maxY - minY)) * chartH;
    }

    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    ctx.beginPath();
    rows.forEach((row, index) => {
      const x = xAt(index);
      const y = yAt(row.t_p);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    rows.forEach((row, index) => {
      drawPoint(ctx, xAt(index), yAt(row.t_p), row.success ? "#2563eb" : "#dc2626", row.success ? 2.8 : 4, row.success ? 0.72 : 0.9);
    });

    drawText(ctx, "trial", width / 2, height - 14, { align: "center" });
    drawText(ctx, "t_p", 14, pad.top + 8, { size: 11 });
  }

  function drawYAxis(ctx, pad, chartW, chartH, maxValue, ticks, minValue = 0) {
    ctx.strokeStyle = "#d9dee7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, pad.top + chartH);
    ctx.lineTo(pad.left + chartW, pad.top + chartH);
    ctx.stroke();

    for (let i = 0; i <= ticks; i += 1) {
      const ratio = i / ticks;
      const value = minValue + (maxValue - minValue) * ratio;
      const y = pad.top + chartH - ratio * chartH;
      ctx.strokeStyle = "#edf1f5";
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + chartW, y);
      ctx.stroke();
      drawText(ctx, String(Math.round(value)), pad.left - 8, y, { align: "right", size: 11, color: "#64748b" });
    }
  }

  function renderTable(rows) {
    els.tableCount.textContent = `${rows.length} 条`;
    els.dataBody.innerHTML = "";
    rows.forEach((row) => {
      const tr = document.createElement("tr");
      if (!row.success) tr.className = "failed";
      tr.innerHTML = `
        <td>${row.trial_id}</td>
        <td>${row.target_x}</td>
        <td>${row.target_y}</td>
        <td>${row.x_t}</td>
        <td>${row.y_t}</td>
        <td>${row.s_t}</td>
        <td>${row.x_p}</td>
        <td>${row.y_p}</td>
        <td>${row.s_p}</td>
        <td>${row.x_l}</td>
        <td>${row.y_l}</td>
        <td>${row.s_l}</td>
        <td>${row.t_p}</td>
        <td>${row.success}</td>
      `;
      els.dataBody.appendChild(tr);
    });
  }

  function renderAll() {
    renderMetrics(currentRows);
    drawScatter(currentRows);
    drawOffsetBars(currentRows);
    drawHistogram(currentRows);
    drawSeries(currentRows);
    renderTable(currentRows);
  }

  function regenerate() {
    const seed = Number(els.seedInput.value || 20260604);
    const count = clamp(Number(els.trialInput.value || 96), 24, 240);
    els.trialInput.value = String(count);
    currentRows = generateRows(seed, count);
    renderAll();
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function toCsv(rows) {
    const headers = [
      "participant_id", "trial_id", "target_x", "target_y", "tap_x", "tap_y", "press_x", "press_y", "lift_x", "lift_y",
      "x_t", "y_t", "s_t", "x_p", "y_p", "s_p", "x_l", "y_l", "s_l", "press_start_ms", "press_end_ms", "t_p", "success"
    ];
    const lines = [headers.join(",")];
    rows.forEach((row) => {
      lines.push(headers.map((key) => row[key]).join(","));
    });
    return lines.join("\n");
  }

  els.regenerateBtn.addEventListener("click", regenerate);
  els.csvBtn.addEventListener("click", () => {
    download("point-press-simulated-raw-data.csv", toCsv(currentRows), "text/csv;charset=utf-8");
  });
  els.jsonBtn.addEventListener("click", () => {
    download("point-press-simulated-raw-data.json", JSON.stringify({
      generated_at: new Date().toISOString(),
      seed: Number(els.seedInput.value || 20260604),
      summary: summarize(currentRows),
      rows: currentRows
    }, null, 2), "application/json;charset=utf-8");
  });
  window.addEventListener("resize", renderAll);

  regenerate();
})();
