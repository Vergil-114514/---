(function () {
  const FALLBACK_CENTER = [106.293186, 29.593694];
  const DEFAULT_CONFIG = {
    amap: {
      key: "",
      securityJsCode: "",
      version: "2.0",
      plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Geocoder"]
    },
    gateway: {
      wsUrl: "ws://localhost:8080/ws",
      httpBaseUrl: "http://localhost:8080"
    },
    scene: {
      name: "重庆大学虎溪校区交叉创新中心",
      sceneCenterQuery: "重庆大学虎溪校区学生交叉创新中心",
      fallbackCenter: FALLBACK_CENTER,
      zoom: 18
    },
    devices: [
      {
        coneId: "cone_01",
        label: "C1",
        uwbTagId: "uwb_tag_01",
        gpsDeviceId: "gps_cone_01",
        defaultPosition: [106.29302, 29.59386]
      },
      {
        coneId: "cone_02",
        label: "C2",
        uwbTagId: "uwb_tag_02",
        gpsDeviceId: "gps_cone_02",
        defaultPosition: [106.29336, 29.59353]
      }
    ]
  };

  const MODES = {
    STANDBY_DIM: { label: "待命", className: "idle", color: "#e2e8f0" },
    BLOCK_RED: { label: "禁行", className: "warning", color: "#dc2626" },
    GUIDE_LEFT_ARROW: { label: "左引导", className: "guide", color: "#facc15" },
    GUIDE_RIGHT_ARROW: { label: "右引导", className: "guide", color: "#facc15" },
    WARN_CROWD_ORANGE: { label: "拥挤预警", className: "warning", color: "#f97316" },
    ALARM_HELP_RED: { label: "紧急求助", className: "fallen", color: "#b91c1c" },
    ALARM_FALLEN_RED: { label: "倾倒报警", className: "fallen", color: "#ef4444" },
    OFFLINE: { label: "离线", className: "offline", color: "#94a3b8" }
  };

  const els = {
    currentSceneName: document.getElementById("currentSceneName"),
    sceneDescription: document.getElementById("sceneDescription"),
    realMap: document.getElementById("realMap"),
    mapLoading: document.getElementById("mapLoading"),
    mapError: document.getElementById("mapError"),
    simModeBtn: document.getElementById("simModeBtn"),
    realModeBtn: document.getElementById("realModeBtn"),
    reconnectBtn: document.getElementById("reconnectBtn"),
    centerMapBtn: document.getElementById("centerMapBtn"),
    dataModeLabel: document.getElementById("dataModeLabel"),
    gatewayStatus: document.getElementById("gatewayStatus"),
    gatewayUrl: document.getElementById("gatewayUrl"),
    mapScope: document.getElementById("mapScope"),
    gatewayNote: document.getElementById("gatewayNote"),
    coneList: document.getElementById("coneList"),
    onlineCount: document.getElementById("onlineCount"),
    selectedConeId: document.getElementById("selectedConeId"),
    selectedMode: document.getElementById("selectedMode"),
    selectedBattery: document.getElementById("selectedBattery"),
    selectedPosition: document.getElementById("selectedPosition"),
    selectedAccuracy: document.getElementById("selectedAccuracy"),
    selectedUwb: document.getElementById("selectedUwb"),
    selectedGps: document.getElementById("selectedGps"),
    selectedImu: document.getElementById("selectedImu"),
    selectedTilt: document.getElementById("selectedTilt"),
    selectedNote: document.getElementById("selectedNote"),
    payloadType: document.getElementById("payloadType"),
    payloadPreview: document.getElementById("payloadPreview"),
    alertStack: document.getElementById("alertStack"),
    eventLog: document.getElementById("eventLog"),
    clearLogBtn: document.getElementById("clearLogBtn")
  };

  const config = mergeConfig(DEFAULT_CONFIG, window.SMART_CONE_CONFIG || {});
  const state = {
    dataMode: "sim",
    map: null,
    sceneCenter: config.scene.fallbackCenter || FALLBACK_CENTER,
    mapReady: false,
    mapError: "",
    ws: null,
    wsStatus: "idle",
    selectedConeId: config.devices[0]?.coneId || "cone_01",
    cones: new Map(),
    markers: new Map(),
    accuracyCircles: new Map(),
    traces: new Map(),
    traceLines: new Map(),
    routeLine: null,
    logItems: [],
    lastPayload: null,
    simTimer: null,
    simTick: 0,
    draggingConeId: null,
    nativeDraggingConeId: null,
    manualDrag: null,
    mapDragFallbackBound: false,
    simPausedByDrag: false,
    alertSerial: 0
  };

  function mergeConfig(base, override) {
    const merged = {
      amap: { ...base.amap, ...(override.amap || {}) },
      gateway: { ...base.gateway, ...(override.gateway || {}) },
      scene: { ...base.scene, ...(override.scene || {}) },
      devices: Array.isArray(override.devices) && override.devices.length ? override.devices : base.devices
    };
    return merged;
  }

  function boot() {
    initializeCones();
    bindEvents();
    renderStaticInfo();
    setDataMode("sim");
    initMap();
    addLog("前端启动：等待地图与数据源初始化。");
  }

  function initializeCones() {
    config.devices.slice(0, 2).forEach((device, index) => {
      const defaultPosition = device.defaultPosition || [
        (config.scene.fallbackCenter || FALLBACK_CENTER)[0] + (index === 0 ? -0.00035 : 0.00035),
        (config.scene.fallbackCenter || FALLBACK_CENTER)[1] + (index === 0 ? 0.00022 : -0.00012)
      ];
      state.cones.set(device.coneId, {
        coneId: device.coneId,
        label: device.label || `C${index + 1}`,
        tagId: device.uwbTagId,
        gpsDeviceId: device.gpsDeviceId,
        mode: "STANDBY_DIM",
        online: true,
        battery: 88 - index * 5,
        position: {
          lng: defaultPosition[0],
          lat: defaultPosition[1],
          accuracyM: 0.8,
          source: "sim_initial"
        },
        targetPosition: null,
        uwb: {
          tagId: device.uwbTagId,
          quality: 0.9,
          accuracyM: 0.22,
          stale: false
        },
        gps: {
          deviceId: device.gpsDeviceId,
          accuracyM: 1.6,
          hdop: 0.9,
          stale: false
        },
        imu: {
          rollDeg: 0,
          pitchDeg: 0,
          yawDeg: 0,
          calibrated: true
        },
        tilt: {
          fallen: false,
          angleDeg: 0,
          thresholdDeg: 55,
          debounceMs: 600,
          calibration: "zero_bias_ok"
        },
        health: {
          stale: false,
          lastSeenMs: Date.now()
        },
        ts: Date.now()
      });
      state.traces.set(device.coneId, [[defaultPosition[0], defaultPosition[1]]]);
    });
  }

  function bindEvents() {
    els.simModeBtn.addEventListener("click", () => setDataMode("sim"));
    els.realModeBtn.addEventListener("click", () => setDataMode("real"));
    els.reconnectBtn.addEventListener("click", () => connectGateway(true));
    els.centerMapBtn.addEventListener("click", centerMap);
    els.clearLogBtn.addEventListener("click", () => {
      state.logItems = [];
      renderLog();
    });

    window.addEventListener("resize", () => {
      if (state.mapReady && state.map) {
        state.map.resize();
      }
    });

    document.addEventListener("mouseup", handleDocumentPointerUp);
  }

  function renderStaticInfo() {
    els.currentSceneName.textContent = config.scene.name || "重庆大学虎溪校区交叉创新中心";
    els.mapScope.textContent = config.scene.sceneCenterQuery || "重庆大学虎溪校区学生交叉创新中心";
    els.gatewayUrl.textContent = config.gateway.wsUrl || "--";
    els.sceneDescription.textContent = "UWB+GPS 融合坐标由网关输出，前端按 GCJ-02 坐标实时显示两只路锥。";
  }

  function setDataMode(mode) {
    state.dataMode = mode;
    els.simModeBtn.classList.toggle("active", mode === "sim");
    els.realModeBtn.classList.toggle("active", mode === "real");
    els.dataModeLabel.textContent = mode === "sim" ? "模拟数据" : "真实数据";
    els.gatewayNote.textContent = mode === "sim"
      ? "当前使用模拟数据，结构与真实网关推送保持一致。"
      : "当前连接本地网关，等待 cone.telemetry / uwb / gps / imu / tilt 事件。";

    if (mode === "sim") {
      disconnectGateway();
      startSimulation();
      addLog("切换到模拟数据：开始回放双路锥融合定位与倾倒事件。");
    } else {
      stopSimulation();
      connectGateway(true);
      addLog("切换到真实数据：尝试连接本地网关 WebSocket。");
    }

    renderAll();
  }

  function initMap() {
    if (!config.amap.key) {
      showMapError("缺少高德地图 key。请在 config.local.js 中配置 window.SMART_CONE_CONFIG.amap.key。");
      addLog("地图初始化失败：缺少 Amap key。", "danger");
      renderAll();
      return;
    }

    if (config.amap.securityJsCode) {
      window._AMapSecurityConfig = {
        securityJsCode: config.amap.securityJsCode
      };
    }

    loadAmapScript()
      .then(() => {
        state.map = new AMap.Map("realMap", {
          zoom: config.scene.zoom || 18,
          center: config.scene.fallbackCenter || FALLBACK_CENTER,
          viewMode: "2D",
          mapStyle: "amap://styles/normal",
          resizeEnable: true
        });
        AMap.plugin(["AMap.Scale", "AMap.ToolBar", "AMap.Geocoder"], () => {
          state.map.addControl(new AMap.Scale());
          state.map.addControl(new AMap.ToolBar({ position: "RT" }));
          state.mapReady = true;
          els.mapLoading.classList.add("hidden");
          els.mapError.classList.add("hidden");
          bindMapDragFallback();
          resolveSceneCenter();
          renderMapObjects();
          addLog("高德地图加载完成。");
        });
      })
      .catch((error) => {
        showMapError(`地图脚本加载失败：${error.message || "请检查网络与 key 配置"}`);
        addLog("地图脚本加载失败，请检查网络与 Amap 配置。", "danger");
      });
  }

  function loadAmapScript() {
    if (window.AMap) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-amap-loader='true']");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error("AMap script error")), { once: true });
        return;
      }

      const script = document.createElement("script");
      const pluginText = (config.amap.plugins || []).join(",");
      script.dataset.amapLoader = "true";
      script.src = `https://webapi.amap.com/maps?v=${encodeURIComponent(config.amap.version || "2.0")}&key=${encodeURIComponent(config.amap.key)}&plugin=${pluginText}`;
      script.async = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("AMap script error"));
      document.head.appendChild(script);
    });
  }

  function resolveSceneCenter() {
    const fallback = config.scene.fallbackCenter || FALLBACK_CENTER;
    state.sceneCenter = fallback;
    if (!window.AMap || !AMap.Geocoder || !config.scene.sceneCenterQuery) {
      centerMap();
      return;
    }

    const geocoder = new AMap.Geocoder({
      city: "重庆"
    });
    geocoder.getLocation(config.scene.sceneCenterQuery, (status, result) => {
      const location = result?.geocodes?.[0]?.location;
      if (status === "complete" && location) {
        state.sceneCenter = [location.lng, location.lat];
        addLog(`地理编码完成：${config.scene.sceneCenterQuery}`);
      } else {
        addLog("地理编码失败，使用 fallback 坐标定位场景。", "warning");
      }
      centerMap();
    });
  }

  function showMapError(message) {
    state.mapError = message;
    els.mapLoading.classList.add("hidden");
    els.mapError.classList.remove("hidden");
    els.mapError.textContent = message;
  }

  function centerMap() {
    if (!state.mapReady || !state.map) return;
    const positions = Array.from(state.cones.values())
      .map((cone) => cone.position)
      .filter((position) => isFiniteCoordinate(position));

    if (positions.length > 1) {
      const bounds = new AMap.Bounds(
        [Math.min(...positions.map((item) => item.lng)), Math.min(...positions.map((item) => item.lat))],
        [Math.max(...positions.map((item) => item.lng)), Math.max(...positions.map((item) => item.lat))]
      );
      state.map.setBounds(bounds, false, [70, 70, 70, 70]);
      return;
    }
    state.map.setZoomAndCenter(config.scene.zoom || 18, state.sceneCenter);
  }

  function connectGateway(force = false) {
    if (state.dataMode !== "real") return;
    if (!config.gateway.wsUrl) {
      state.wsStatus = "missing_url";
      addLog("真实数据模式缺少 gateway.wsUrl。", "danger");
      renderAll();
      return;
    }
    if (!force && state.ws && state.ws.readyState === WebSocket.OPEN) return;

    disconnectGateway();
    state.wsStatus = "connecting";
    renderAll();

    try {
      state.ws = new WebSocket(config.gateway.wsUrl);
      state.ws.addEventListener("open", () => {
        state.wsStatus = "connected";
        addLog("本地网关 WebSocket 已连接。");
        renderAll();
      });
      state.ws.addEventListener("message", (event) => handleGatewayMessage(event.data));
      state.ws.addEventListener("close", () => {
        state.wsStatus = "closed";
        addLog("本地网关 WebSocket 已断开。", "warning");
        renderAll();
      });
      state.ws.addEventListener("error", () => {
        state.wsStatus = "error";
        addLog("本地网关 WebSocket 连接错误。", "danger");
        renderAll();
      });
    } catch (error) {
      state.wsStatus = "error";
      addLog(`连接网关失败：${error.message}`, "danger");
      renderAll();
    }
  }

  function disconnectGateway() {
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    state.wsStatus = "idle";
  }

  function handleGatewayMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch (error) {
      addLog("收到无法解析的 WebSocket 消息。", "warning");
      return;
    }

    const type = message.type || "cone.telemetry";
    const payload = message.payload || message;
    state.lastPayload = { type, payload };
    els.payloadType.textContent = type;

    if (type === "cone.telemetry") updateConeFromTelemetry(payload);
    if (type === "fused.position") updateConePartial(payload.coneId, {
      position: normalizePosition(payload.position || payload, payload),
      uwb: payload.uwb,
      gps: payload.gps,
      ts: payload.timestamp
    });
    if (type === "gps.position") updateConePartial(payload.coneId, {
      gps: payload,
      position: normalizePosition(payload.position || payload, { source: "gps", accuracyM: payload.accuracyM }),
      ts: payload.timestamp
    });
    if (type === "uwb.position") updateConePartial(payload.coneId, {
      uwb: payload,
      position: normalizePosition(payload.position || payload, { source: "uwb", accuracyM: payload.accuracyM }),
      ts: payload.timestamp
    });
    if (type === "imu.raw") updateConePartial(payload.coneId, { imu: normalizeImu(payload.imu || payload), ts: payload.timestamp });
    if (type === "tilt.status") updateConePartial(payload.coneId, { tilt: normalizeTilt(payload.tilt || payload), ts: payload.timestamp });
    if (type === "gateway.status") updateGatewayStatus(payload);
    if (type === "route.plan" || type === "route.guide") renderRoute(payload);
    if (type === "calibration.status") addLog(`标定状态：${payload.status || "unknown"}`);

    renderAll();
  }

  function updateConeFromTelemetry(payload) {
    const coneId = payload.coneId || payload.id;
    if (!coneId || !state.cones.has(coneId)) return;
    const cone = state.cones.get(coneId);
    const nextPosition = normalizePosition(payload.position, payload);
    const tiltPatch = payload.tilt ? normalizeTilt(payload.tilt) : (payload.fallen !== undefined ? { fallen: Boolean(payload.fallen) } : {});
    const imuPatch = payload.imu ? normalizeImu(payload.imu) : {};

    Object.assign(cone, {
      mode: payload.mode || cone.mode,
      online: payload.online !== undefined ? Boolean(payload.online) : cone.online,
      battery: payload.battery ?? cone.battery,
      position: nextPosition || cone.position,
      uwb: { ...cone.uwb, ...(payload.uwb || {}) },
      gps: { ...cone.gps, ...(payload.gps || {}) },
      imu: { ...cone.imu, ...imuPatch },
      tilt: { ...cone.tilt, ...tiltPatch },
      health: { ...cone.health, ...(payload.health || {}), lastSeenMs: Date.now() },
      ts: payload.ts || payload.timestamp || Date.now()
    });
    if (cone.tilt.fallen) cone.mode = "ALARM_FALLEN_RED";
    if (!cone.tilt.fallen) cone._fallenAlerted = false;
    pushTrace(cone);
    maybeAlertFallen(cone);
  }

  function updateConePartial(coneId, patch) {
    if (!coneId || !state.cones.has(coneId)) return;
    const cone = state.cones.get(coneId);
    if (patch.position && isFiniteCoordinate(patch.position)) {
      cone.position = { ...cone.position, ...patch.position };
    }
    if (patch.uwb) cone.uwb = { ...cone.uwb, ...patch.uwb };
    if (patch.gps) cone.gps = { ...cone.gps, ...patch.gps };
    if (patch.imu) cone.imu = { ...cone.imu, ...patch.imu };
    if (patch.tilt) cone.tilt = { ...cone.tilt, ...patch.tilt };
    cone.ts = patch.ts || patch.timestamp || Date.now();
    cone.health = { ...cone.health, stale: false, lastSeenMs: Date.now() };
    if (cone.tilt.fallen) cone.mode = "ALARM_FALLEN_RED";
    if (!cone.tilt.fallen) cone._fallenAlerted = false;
    pushTrace(cone);
    maybeAlertFallen(cone);
  }

  function updateGatewayStatus(payload) {
    state.wsStatus = payload.status || state.wsStatus;
    const delay = payload.latencyMs !== undefined ? ` · ${payload.latencyMs} ms` : "";
    els.gatewayNote.textContent = `网关状态：${payload.status || "unknown"}${delay}`;
  }

  function normalizePosition(position, payload = {}) {
    if (!position) return null;
    const lng = Number(position.lng ?? position.lon ?? position.longitude ?? payload.lng ?? payload.lon);
    const lat = Number(position.lat ?? position.latitude ?? payload.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return {
      lng,
      lat,
      accuracyM: Number(position.accuracyM ?? payload.accuracyM ?? 1),
      source: position.source || payload.source || "uwb_gps_fused",
      stale: Boolean(position.stale || payload.stale)
    };
  }

  function normalizeImu(imu) {
    return {
      rollDeg: Number(imu.rollDeg ?? imu.roll ?? 0),
      pitchDeg: Number(imu.pitchDeg ?? imu.pitch ?? 0),
      yawDeg: Number(imu.yawDeg ?? imu.yaw ?? 0),
      calibrated: imu.calibrated !== undefined ? Boolean(imu.calibrated) : true,
      ax: imu.ax,
      ay: imu.ay,
      az: imu.az,
      gx: imu.gx,
      gy: imu.gy,
      gz: imu.gz
    };
  }

  function normalizeTilt(tilt) {
    return {
      fallen: Boolean(tilt.fallen),
      angleDeg: Number(tilt.angleDeg ?? tilt.angle ?? 0),
      thresholdDeg: Number(tilt.thresholdDeg ?? 55),
      debounceMs: Number(tilt.debounceMs ?? 600),
      calibration: tilt.calibration || tilt.calibrationStatus || "zero_bias_ok"
    };
  }

  function startSimulation() {
    stopSimulation();
    state.simPausedByDrag = false;
    state.simTick = 0;
    runSimulationFrame();
    state.simTimer = window.setInterval(runSimulationFrame, 1400);
  }

  function stopSimulation() {
    if (state.simTimer) {
      window.clearInterval(state.simTimer);
      state.simTimer = null;
    }
  }

  function runSimulationFrame() {
    const tick = state.simTick;
    const base = config.scene.fallbackCenter || FALLBACK_CENTER;
    const paths = [
      [
        [base[0] - 0.00042, base[1] + 0.00024],
        [base[0] - 0.0002, base[1] + 0.00032],
        [base[0] + 0.00002, base[1] + 0.00028],
        [base[0] + 0.0002, base[1] + 0.00016]
      ],
      [
        [base[0] + 0.0004, base[1] - 0.00018],
        [base[0] + 0.0002, base[1] - 0.00006],
        [base[0] + 0.00004, base[1] + 0.00005],
        [base[0] - 0.00016, base[1] + 0.00012]
      ]
    ];

    Array.from(state.cones.values()).forEach((cone, index) => {
      const path = paths[index] || paths[0];
      const position = path[tick % path.length];
      const fallen = index === 1 && tick % 12 >= 7 && tick % 12 <= 8;
      const warning = index === 0 && tick % 10 >= 5 && tick % 10 <= 6;
      const roll = fallen ? 76 + Math.sin(tick) * 2 : Math.sin(tick / 2 + index) * 3;
      const pitch = fallen ? -18 : Math.cos(tick / 3 + index) * 2.5;
      const payload = {
        coneId: cone.coneId,
        ts: Date.now(),
        mode: fallen ? "ALARM_FALLEN_RED" : warning ? "GUIDE_RIGHT_ARROW" : "STANDBY_DIM",
        online: true,
        battery: Math.max(62, cone.battery - 0.02),
        position: {
          lng: position[0],
          lat: position[1],
          accuracyM: fallen ? 1.2 : 0.45 + index * 0.18,
          source: "uwb_gps_fused"
        },
        uwb: {
          tagId: cone.tagId,
          quality: fallen ? 0.72 : 0.91 - index * 0.05,
          accuracyM: fallen ? 0.38 : 0.18 + index * 0.04,
          anchorsUsed: ["uwb_anchor_01", "uwb_anchor_02", "uwb_anchor_03"],
          stale: false
        },
        gps: {
          deviceId: cone.gpsDeviceId,
          accuracyM: 1.4 + index * 0.35,
          hdop: 0.9 + index * 0.2,
          coordSys: "GCJ-02",
          stale: false
        },
        imu: {
          rollDeg: roll,
          pitchDeg: pitch,
          yawDeg: 12 + tick * 2,
          calibrated: true
        },
        tilt: {
          fallen,
          angleDeg: Math.max(Math.abs(roll), Math.abs(pitch)),
          thresholdDeg: 55,
          debounceMs: 600,
          calibration: "zero_bias_ok"
        },
        health: {
          stale: false,
          lastSeenMs: Date.now()
        }
      };
      state.lastPayload = { type: "cone.telemetry", payload };
      updateConeFromTelemetry(payload);
    });

    if (tick % 12 === 7) {
      addLog("模拟事件：cone_02 IMU6050 倾角超过阈值，网关上报倾倒状态。", "danger");
    }
    if (tick % 10 === 5) {
      addLog("模拟事件：cone_01 切换为绕行引导状态。", "info");
    }
    state.simTick += 1;
    renderAll();
  }

  function pushTrace(cone) {
    if (!isFiniteCoordinate(cone.position)) return;
    const trace = state.traces.get(cone.coneId) || [];
    trace.push([cone.position.lng, cone.position.lat]);
    state.traces.set(cone.coneId, trace.slice(-16));
  }

  function maybeAlertFallen(cone) {
    if (!cone.tilt?.fallen || cone._fallenAlerted) return;
    cone._fallenAlerted = true;
    showAlert({
      title: "路锥倾倒报警",
      level: "danger",
      target: cone.coneId,
      action: `${cone.coneId} 的 IMU6050 倾角 ${formatNumber(cone.tilt.angleDeg, 1)}°，已超过阈值 ${formatNumber(cone.tilt.thresholdDeg, 0)}°。`
    });
  }

  function renderAll() {
    renderGateway();
    renderConeList();
    renderSelectedConeDetail();
    renderPayloadPreview();
    renderLog();
    renderMapObjects();
  }

  function renderGateway() {
    if (state.dataMode === "sim") {
      els.gatewayStatus.textContent = "模拟运行";
      return;
    }
    const label = {
      idle: "未连接",
      connecting: "连接中",
      connected: "已连接",
      closed: "已断开",
      error: "连接错误",
      missing_url: "缺少地址"
    }[state.wsStatus] || state.wsStatus;
    els.gatewayStatus.textContent = label;
  }

  function renderConeList() {
    els.coneList.innerHTML = "";
    Array.from(state.cones.values()).forEach((cone) => {
      const mode = getVisualMode(cone);
      const stale = isConeStale(cone);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `cone-row ${mode.className} ${cone.coneId === state.selectedConeId ? "active" : ""}`;
      row.innerHTML = `
        <span class="status-stripe" style="--stripe-color:${mode.color}"></span>
        <div>
          <strong>${escapeHtml(cone.coneId)} · ${escapeHtml(mode.label)}</strong>
          <span>${cone.online && !stale ? "在线" : "离线/过期"} · 精度 ${formatNumber(cone.position.accuracyM, 2)} m · ${cone.position.source}</span>
        </div>
        <b>${Math.round(cone.battery)}%</b>
      `;
      row.addEventListener("click", () => selectCone(cone.coneId));
      els.coneList.appendChild(row);
    });

    const online = Array.from(state.cones.values()).filter((cone) => cone.online && !isConeStale(cone)).length;
    els.onlineCount.textContent = `${online} / ${state.cones.size} 在线`;
  }

  function renderSelectedConeDetail() {
    const cone = state.cones.get(state.selectedConeId) || Array.from(state.cones.values())[0];
    if (!cone) return;
    const mode = getVisualMode(cone);
    const positionText = isFiniteCoordinate(cone.position)
      ? `${cone.position.lng.toFixed(6)}, ${cone.position.lat.toFixed(6)}`
      : "--";

    els.selectedConeId.textContent = cone.coneId;
    els.selectedMode.textContent = mode.label;
    els.selectedBattery.textContent = `${Math.round(cone.battery)}%`;
    els.selectedPosition.textContent = positionText;
    els.selectedAccuracy.textContent = `${formatNumber(cone.position.accuracyM, 2)} m · ${cone.position.source}`;
    els.selectedUwb.textContent = `${formatNumber(cone.uwb.quality, 2)} / ${formatNumber(cone.uwb.accuracyM, 2)} m`;
    els.selectedGps.textContent = `${formatNumber(cone.gps.accuracyM, 2)} m / HDOP ${formatNumber(cone.gps.hdop, 1)}`;
    els.selectedImu.textContent = `${formatNumber(cone.imu.rollDeg, 1)}° / ${formatNumber(cone.imu.pitchDeg, 1)}°`;
    els.selectedTilt.textContent = cone.tilt.fallen ? "已倾倒" : "正常";
    els.selectedNote.textContent = cone.tilt.fallen
      ? "网关已根据 IMU6050 标定后的 roll/pitch 输出倾倒状态，前端只负责告警展示。"
      : `最近更新：${formatTime(cone.ts)} · IMU ${cone.imu.calibrated ? "已校准" : "未校准"}${formatTargetNote(cone)}`;
  }

  function renderPayloadPreview() {
    const payload = state.lastPayload || {
      type: "cone.telemetry",
      payload: Array.from(state.cones.values())[0]
    };
    els.payloadType.textContent = payload.type;
    els.payloadPreview.textContent = JSON.stringify(payload, null, 2);
  }

  function renderLog() {
    els.eventLog.innerHTML = "";
    state.logItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = `log-item ${item.level}`;
      row.innerHTML = `<time>${item.time}</time><strong>${escapeHtml(item.message)}</strong>`;
      els.eventLog.appendChild(row);
    });
  }

  function renderMapObjects() {
    if (!state.mapReady || !state.map || !window.AMap) return;
    Array.from(state.cones.values()).forEach((cone) => {
      if (!isFiniteCoordinate(cone.position)) return;
      const lngLat = [cone.position.lng, cone.position.lat];
      const mode = getVisualMode(cone);
      const isDragging = state.draggingConeId === cone.coneId;
      let marker = state.markers.get(cone.coneId);
      if (!marker) {
        marker = new AMap.Marker({
          position: lngLat,
          offset: new AMap.Pixel(-22, -48),
          anchor: "bottom-center",
          draggable: true,
          cursor: "move",
          content: buildMarkerHtml(cone, mode)
        });
        marker.on("click", () => selectCone(cone.coneId));
        marker.on("mousedown", (event) => handleManualDragPointerDown(cone.coneId, event));
        marker.on("dragstart", () => handleNativeConeDragStart(cone.coneId));
        marker.on("dragging", (event) => handleConeDragging(cone.coneId, event?.lnglat || marker.getPosition()));
        marker.on("dragend", (event) => handleNativeConeDragEnd(cone.coneId, event?.lnglat || marker.getPosition()));
        marker.setMap(state.map);
        state.markers.set(cone.coneId, marker);
      } else {
        if (!isDragging) marker.setPosition(lngLat);
        marker.setContent(buildMarkerHtml(cone, mode));
      }

      let circle = state.accuracyCircles.get(cone.coneId);
      if (!circle) {
        circle = new AMap.Circle({
          center: lngLat,
          radius: Math.max(0.5, Number(cone.position.accuracyM || 1)),
          strokeColor: mode.color,
          strokeOpacity: 0.65,
          strokeWeight: 1,
          fillColor: mode.color,
          fillOpacity: 0.12
        });
        circle.setMap(state.map);
        state.accuracyCircles.set(cone.coneId, circle);
      } else {
        circle.setCenter(lngLat);
        circle.setRadius(Math.max(0.5, Number(cone.position.accuracyM || 1)));
        circle.setOptions({
          strokeColor: mode.color,
          fillColor: mode.color
        });
      }

      const trace = state.traces.get(cone.coneId) || [];
      let line = state.traceLines.get(cone.coneId);
      if (!line) {
        line = new AMap.Polyline({
          path: trace,
          strokeColor: mode.color,
          strokeOpacity: 0.72,
          strokeWeight: 4,
          showDir: true
        });
        line.setMap(state.map);
        state.traceLines.set(cone.coneId, line);
      } else {
        line.setPath(trace);
        line.setOptions({ strokeColor: mode.color });
      }
    });
  }

  function renderRoute(payload) {
    if (!state.mapReady || !state.map || !window.AMap) return;
    const path = payload.polyline || payload.route?.polyline || [];
    const points = path
      .map((point) => normalizePosition(point, point))
      .filter(Boolean)
      .map((point) => [point.lng, point.lat]);
    if (!points.length) return;

    if (!state.routeLine) {
      state.routeLine = new AMap.Polyline({
        path: points,
        strokeColor: "#2563eb",
        strokeOpacity: 0.88,
        strokeWeight: 6,
        strokeStyle: "dashed",
        showDir: true
      });
      state.routeLine.setMap(state.map);
    } else {
      state.routeLine.setPath(points);
    }
    addLog("已接收路径规划覆盖层。");
  }

  function buildMarkerHtml(cone, mode) {
    const selected = cone.coneId === state.selectedConeId ? " selected" : "";
    const fallen = cone.tilt.fallen ? " fallen" : "";
    const stale = isConeStale(cone) ? " stale" : "";
    return `
      <button class="map-cone-marker ${mode.className}${selected}${fallen}${stale}" style="--marker-color:${mode.color}" type="button" title="${escapeHtml(cone.coneId)}">
        <span class="map-cone-label">${escapeHtml(cone.label || cone.coneId)}</span>
        <span class="map-cone-light"></span>
        <span class="map-cone-body"></span>
        <span class="map-cone-base"></span>
      </button>
    `;
  }

  function selectCone(coneId) {
    state.selectedConeId = coneId;
    renderAll();
  }

  function bindMapDragFallback() {
    if (!state.mapReady || !state.map || state.mapDragFallbackBound) return;
    state.mapDragFallbackBound = true;
    state.map.on("mousemove", handleManualMapMouseMove);
    state.map.on("mouseup", handleManualMapMouseUp);
  }

  function handleManualDragPointerDown(coneId, event) {
    if (!state.cones.has(coneId)) return;
    state.selectedConeId = coneId;
    state.manualDrag = {
      coneId,
      active: false,
      start: normalizeLngLat(event?.lnglat),
      last: normalizeLngLat(event?.lnglat)
    };
  }

  function handleManualMapMouseMove(event) {
    if (!state.manualDrag || state.nativeDraggingConeId) return;
    const target = normalizeLngLat(event?.lnglat);
    if (!target) return;
    state.manualDrag.last = target;
    if (!state.manualDrag.active) {
      state.manualDrag.active = true;
      setMapDraggingEnabled(false);
      handleConeDragStart(state.manualDrag.coneId);
    }
    handleConeDragging(state.manualDrag.coneId, target);
  }

  function handleManualMapMouseUp(event) {
    if (!state.manualDrag) return;
    const manualDrag = state.manualDrag;
    const target = normalizeLngLat(event?.lnglat) || manualDrag.last || manualDrag.start;
    state.manualDrag = null;
    setMapDraggingEnabled(true);
    if (state.nativeDraggingConeId) return;
    if (manualDrag.active) {
      handleConeDragEnd(manualDrag.coneId, target);
    }
  }

  function handleDocumentPointerUp(event) {
    if (!state.draggingConeId) return;
    const coneId = state.draggingConeId;
    const target = lngLatFromClientPoint(event.clientX, event.clientY)
      || state.manualDrag?.last
      || getMarkerLngLat(coneId);
    state.nativeDraggingConeId = null;
    state.manualDrag = null;
    setMapDraggingEnabled(true);
    handleConeDragEnd(coneId, target);
  }

  function handleNativeConeDragStart(coneId) {
    state.nativeDraggingConeId = coneId;
    handleConeDragStart(coneId);
  }

  function handleNativeConeDragEnd(coneId, lngLat) {
    const wasDragging = state.draggingConeId === coneId || state.nativeDraggingConeId === coneId;
    state.nativeDraggingConeId = null;
    state.manualDrag = null;
    setMapDraggingEnabled(true);
    if (!wasDragging) return;
    handleConeDragEnd(coneId, lngLat);
  }

  function handleConeDragStart(coneId) {
    if (state.draggingConeId === coneId) return;
    state.draggingConeId = coneId;
    state.selectedConeId = coneId;
    if (state.dataMode === "sim" && state.simTimer) {
      stopSimulation();
      state.simPausedByDrag = true;
      addLog("模拟回放已暂停，可通过拖动锥桶设置目标经纬度。", "warning");
    } else {
      renderSelectedConeDetail();
    }
  }

  function handleConeDragging(coneId, lngLat) {
    const target = normalizeLngLat(lngLat);
    if (!target || !state.cones.has(coneId)) return;
    const cone = state.cones.get(coneId);
    cone.position = {
      ...cone.position,
      lng: target.lng,
      lat: target.lat,
      accuracyM: 0.3,
      source: "frontend_drag_preview",
      stale: false
    };
    cone.targetPosition = {
      lng: target.lng,
      lat: target.lat,
      coordSys: "GCJ-02",
      source: "frontend_drag"
    };
    cone.health = { ...cone.health, stale: false, lastSeenMs: Date.now() };
    cone.ts = Date.now();
    const marker = state.markers.get(coneId);
    const circle = state.accuracyCircles.get(coneId);
    if (marker) marker.setPosition([target.lng, target.lat]);
    if (circle) circle.setCenter([target.lng, target.lat]);
    renderSelectedConeDetail();
  }

  function handleConeDragEnd(coneId, lngLat) {
    const target = normalizeLngLat(lngLat);
    state.draggingConeId = null;
    if (!target || !state.cones.has(coneId)) {
      addLog("拖拽目标坐标无效，未生成移动指令。", "warning");
      renderAll();
      return;
    }

    const cone = state.cones.get(coneId);
    updateConeManualTarget(cone, target);
    const command = buildMoveCommand(cone, target);
    state.lastPayload = command;
    dispatchMoveCommand(command);
    pushTrace(cone);
    renderAll();
  }

  function setMapDraggingEnabled(enabled) {
    if (!state.map || typeof state.map.setStatus !== "function") return;
    state.map.setStatus({ dragEnable: enabled });
  }

  function getMarkerLngLat(coneId) {
    const marker = state.markers.get(coneId);
    if (!marker || typeof marker.getPosition !== "function") return null;
    return normalizeLngLat(marker.getPosition());
  }

  function lngLatFromClientPoint(clientX, clientY) {
    if (!state.map || !window.AMap || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
    const rect = els.realMap.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    if (typeof state.map.containerToLngLat !== "function") return null;
    return normalizeLngLat(state.map.containerToLngLat(new AMap.Pixel(x, y)));
  }

  function updateConeManualTarget(cone, target) {
    const position = {
      lng: target.lng,
      lat: target.lat,
      accuracyM: 0.3,
      source: "frontend_drag_target",
      stale: false
    };
    cone.position = position;
    cone.targetPosition = {
      lng: target.lng,
      lat: target.lat,
      coordSys: "GCJ-02",
      source: "frontend_drag"
    };
    cone.online = true;
    cone.health = { ...cone.health, stale: false, lastSeenMs: Date.now() };
    cone.ts = Date.now();
  }

  function buildMoveCommand(cone, target) {
    const issuedAt = new Date().toISOString();
    return {
      type: "cone.move.command",
      requestId: `move_${Date.now()}_${cone.coneId}`,
      payload: {
        coneId: cone.coneId,
        target: {
          lng: Number(target.lng.toFixed(8)),
          lat: Number(target.lat.toFixed(8)),
          coordSys: "GCJ-02"
        },
        source: "frontend_drag",
        issuedAt,
        mode: cone.mode,
        ttlMs: 10000
      }
    };
  }

  function dispatchMoveCommand(command) {
    const payload = command.payload;
    const targetText = `${payload.target.lng.toFixed(6)}, ${payload.target.lat.toFixed(6)}`;
    if (state.dataMode === "sim") {
      addLog(`模拟下发移动目标：${payload.coneId} -> ${targetText}`, "info");
      if (state.simPausedByDrag) {
        addLog("拖拽目标已保持在地图上；重新点击“模拟数据”可恢复轨迹回放。", "warning");
      }
      return;
    }

    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify(command));
      addLog(`已发送拖拽移动指令：${payload.coneId} -> ${targetText}`, "info");
      return;
    }

    addLog("网关未连接，拖拽目标已保留但未下发。", "warning");
    showAlert({
      title: "移动指令未下发",
      level: "warning",
      target: payload.coneId,
      action: "当前 WebSocket 未连接，请连接本地网关后再次拖动锥桶。"
    });
  }

  function normalizeLngLat(lngLat) {
    if (!lngLat) return null;
    const lng = Number(
      typeof lngLat.getLng === "function"
        ? lngLat.getLng()
        : lngLat.lng ?? lngLat.lon ?? lngLat[0]
    );
    const lat = Number(
      typeof lngLat.getLat === "function"
        ? lngLat.getLat()
        : lngLat.lat ?? lngLat[1]
    );
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    return { lng, lat };
  }

  function formatTargetNote(cone) {
    if (!cone.targetPosition) return "";
    return ` · 目标 ${cone.targetPosition.lng.toFixed(6)}, ${cone.targetPosition.lat.toFixed(6)}`;
  }

  function getVisualMode(cone) {
    if (!cone.online || isConeStale(cone)) return MODES.OFFLINE;
    if (cone.tilt?.fallen) return MODES.ALARM_FALLEN_RED;
    return MODES[cone.mode] || MODES.STANDBY_DIM;
  }

  function isConeStale(cone) {
    if (state.dataMode === "sim" && state.simPausedByDrag && cone.targetPosition?.source === "frontend_drag") {
      return false;
    }
    if (cone.health?.stale || cone.position?.stale) return true;
    const lastSeen = cone.health?.lastSeenMs || cone.ts || 0;
    return Date.now() - Number(lastSeen) > 8000;
  }

  function isFiniteCoordinate(position) {
    return position && Number.isFinite(Number(position.lng)) && Number.isFinite(Number(position.lat));
  }

  function addLog(message, level = "info") {
    state.logItems.unshift({
      time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
      message,
      level
    });
    state.logItems = state.logItems.slice(0, 24);
    renderLog();
  }

  function showAlert({ title, level = "warning", target, action }) {
    const id = `alert-${state.alertSerial}`;
    state.alertSerial += 1;
    const card = document.createElement("article");
    card.className = `alert-card ${level}`;
    card.dataset.alertId = id;
    card.innerHTML = `
      <div class="alert-head">
        <strong>${escapeHtml(title)}</strong>
        <button class="alert-close" type="button" aria-label="关闭报警">×</button>
      </div>
      <div class="alert-body">
        <p>${escapeHtml(action)}</p>
        <div class="alert-meta">
          <span>对象</span><span>${escapeHtml(target)}</span>
          <span>时间</span><span>${new Date().toLocaleTimeString("zh-CN", { hour12: false })}</span>
        </div>
      </div>
    `;
    const close = () => card.remove();
    card.querySelector(".alert-close").addEventListener("click", close);
    els.alertStack.prepend(card);
    while (els.alertStack.children.length > 3) {
      els.alertStack.lastElementChild.remove();
    }
    window.setTimeout(() => {
      if (card.isConnected) close();
    }, 9000);
  }

  function formatNumber(value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "--";
    return number.toFixed(digits);
  }

  function formatTime(value) {
    const date = new Date(value || Date.now());
    return date.toLocaleTimeString("zh-CN", { hour12: false });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  boot();
})();
