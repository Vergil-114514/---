(function () {
  const MODES = {
    IDLE: { label: "待命", color: 0xe2e8f0, command: "STANDBY_DIM", blink: false },
    BLOCK: { label: "禁行", color: 0xdc2626, command: "BLOCK_RED", blink: true },
    GUIDE_LEFT: { label: "左侧引导", color: 0xfacc15, command: "GUIDE_LEFT_ARROW", blink: false },
    GUIDE_RIGHT: { label: "右侧引导", color: 0xfacc15, command: "GUIDE_RIGHT_ARROW", blink: false },
    WARNING: { label: "拥挤预警", color: 0xf97316, command: "WARN_CROWD_ORANGE", blink: true },
    FALLEN: { label: "倒伏报警", color: 0xef4444, command: "ALARM_FALLEN_RED", blink: true },
    EMERGENCY: { label: "紧急求助", color: 0xb91c1c, command: "ALARM_HELP_RED", blink: true }
  };

  const initialCones = [
    { id: "cone_01", px: 31, py: 55, mode: "IDLE", battery: 86, crowdLevel: 0, fallen: false },
    { id: "cone_02", px: 41, py: 55, mode: "IDLE", battery: 82, crowdLevel: 0, fallen: false },
    { id: "cone_03", px: 51, py: 55, mode: "IDLE", battery: 79, crowdLevel: 0, fallen: false },
    { id: "cone_04", px: 61, py: 56, mode: "IDLE", battery: 74, crowdLevel: 0, fallen: false },
    { id: "cone_05", px: 69, py: 62, mode: "IDLE", battery: 88, crowdLevel: 0, fallen: false },
    { id: "cone_06", px: 47, py: 67, mode: "IDLE", battery: 81, crowdLevel: 0, fallen: false }
  ];

  function P(px, py) {
    return { x: (px - 50) * 0.24, z: (py - 50) * 0.16 };
  }

  const scenes = {
    idle: {
      name: "正常待命",
      description: "路锥沿虎溪体育馆入口广场与东侧校园道路低亮布设，监测人流与车辆通行。",
      focus: "cone_01",
      closure: false,
      crowd: false,
      flows: [],
      updates: {
        cone_01: { ...P(31, 55), mode: "IDLE", crowdLevel: 0, fallen: false },
        cone_02: { ...P(41, 55), mode: "IDLE", crowdLevel: 0, fallen: false },
        cone_03: { ...P(51, 55), mode: "IDLE", crowdLevel: 0, fallen: false },
        cone_04: { ...P(61, 56), mode: "IDLE", crowdLevel: 0, fallen: false },
        cone_05: { ...P(69, 62), mode: "IDLE", crowdLevel: 0, fallen: false },
        cone_06: { ...P(47, 67), mode: "IDLE", crowdLevel: 0, fallen: false }
      }
    },
    maintenance: {
      name: "东侧道路维护",
      description: "体育馆东侧校园道路临时维护，路锥封闭施工段并把行人与非机动车引向入口广场外侧。",
      focus: "cone_04",
      closure: true,
      crowd: false,
      flows: [{ x: -2.8, z: 1.2, dir: "right" }, { x: 0.2, z: 1.2, dir: "right" }, { x: 4.5, z: 3.2, dir: "down" }],
      updates: {
        cone_01: { ...P(38, 56), mode: "GUIDE_RIGHT", crowdLevel: 1, fallen: false },
        cone_02: { ...P(49, 56), mode: "GUIDE_RIGHT", crowdLevel: 1, fallen: false },
        cone_03: { ...P(59, 48), mode: "BLOCK", crowdLevel: 0, fallen: false },
        cone_04: { ...P(65, 52), mode: "BLOCK", crowdLevel: 0, fallen: false },
        cone_05: { ...P(70, 58), mode: "BLOCK", crowdLevel: 0, fallen: false },
        cone_06: { ...P(47, 67), mode: "GUIDE_RIGHT", crowdLevel: 1, fallen: false }
      }
    },
    warning: {
      name: "拥挤预警",
      description: "活动散场时，校车站与东侧路口出现局部拥挤，邻近路锥升为橙色预警并触发分流。",
      focus: "cone_05",
      closure: false,
      crowd: true,
      flows: [{ x: 2.3, z: 2.2, dir: "left" }, { x: 5.6, z: 2.6, dir: "down" }],
      updates: {
        cone_01: { ...P(33, 56), mode: "IDLE", crowdLevel: 0, fallen: false },
        cone_02: { ...P(45, 57), mode: "GUIDE_LEFT", crowdLevel: 1, fallen: false },
        cone_03: { ...P(57, 59), mode: "WARNING", crowdLevel: 3, fallen: false },
        cone_04: { ...P(66, 62), mode: "WARNING", crowdLevel: 3, fallen: false },
        cone_05: { ...P(72, 66), mode: "WARNING", crowdLevel: 3, fallen: false },
        cone_06: { ...P(50, 69), mode: "GUIDE_LEFT", crowdLevel: 2, fallen: false }
      }
    },
    dispersal: {
      name: "活动散场分流",
      description: "体育馆活动结束后，系统把人流分成校车站方向、生活区方向和教学区方向三路，减少入口广场堆积。",
      focus: "cone_04",
      closure: false,
      crowd: false,
      flows: [
        { x: -3.8, z: 1.6, dir: "left" },
        { x: 0.2, z: 1.8, dir: "right" },
        { x: 4.9, z: 3.6, dir: "down" },
        { x: 6.0, z: -1.2, dir: "up" }
      ],
      updates: {
        cone_01: { ...P(29, 55), mode: "GUIDE_LEFT", crowdLevel: 1, fallen: false },
        cone_02: { ...P(39, 59), mode: "GUIDE_LEFT", crowdLevel: 1, fallen: false },
        cone_03: { ...P(50, 63), mode: "GUIDE_RIGHT", crowdLevel: 1, fallen: false },
        cone_04: { ...P(61, 60), mode: "GUIDE_RIGHT", crowdLevel: 1, fallen: false },
        cone_05: { ...P(72, 64), mode: "GUIDE_RIGHT", crowdLevel: 1, fallen: false },
        cone_06: { ...P(50, 72), mode: "GUIDE_LEFT", crowdLevel: 1, fallen: false }
      }
    },
    emergency: {
      name: "紧急求助",
      description: "体育馆南侧出入口出现求助事件，路锥立即清出急救车通道并提示人群避让。",
      focus: "cone_03",
      closure: false,
      crowd: true,
      flows: [{ x: -1.4, z: 3.6, dir: "right" }, { x: 2.0, z: 3.8, dir: "right" }],
      updates: {
        cone_01: { ...P(33, 62), mode: "GUIDE_RIGHT", crowdLevel: 2, fallen: false },
        cone_02: { ...P(43, 64), mode: "EMERGENCY", crowdLevel: 3, fallen: false },
        cone_03: { ...P(53, 66), mode: "EMERGENCY", crowdLevel: 3, fallen: false },
        cone_04: { ...P(63, 66), mode: "GUIDE_RIGHT", crowdLevel: 2, fallen: false },
        cone_05: { ...P(70, 61), mode: "BLOCK", crowdLevel: 1, fallen: false },
        cone_06: { ...P(49, 75), mode: "BLOCK", crowdLevel: 1, fallen: false }
      }
    }
  };

  const demoScript = ["idle", "maintenance", "warning", "fallen", "dispersal", "emergency", "idle"];
  const cameraPresets = {
    idle: { radius: 19.4, theta: -0.72, phi: 0.8, target: [0.4, 0, 0.8] },
    maintenance: { radius: 15.6, theta: -0.86, phi: 0.72, target: [3.2, 0, 1.2] },
    warning: { radius: 13.8, theta: -0.78, phi: 0.7, target: [4.9, 0, 2.9] },
    dispersal: { radius: 15.2, theta: -0.68, phi: 0.74, target: [1.4, 0, 3.0] },
    emergency: { radius: 14.4, theta: -0.66, phi: 0.72, target: [0.8, 0, 3.7] },
    fallen: { radius: 12.8, theta: -0.84, phi: 0.68, target: [5.0, 0, 2.8] }
  };
  const cones = initialCones.map((cone) => ({ ...cone, ...P(cone.px, cone.py) }));
  const coneObjects = new Map();
  const selectable = [];
  const flowObjects = [];
  const crowdPeople = [];
  const networkLinks = [];
  const gatewayPulses = [];
  const gatewayPosition = new THREE.Vector3(-2.45, 2.05, 0.55);
  let gatewayLight = null;
  let activeScene = "idle";
  let selectedConeId = cones[0].id;
  let demoTimer = null;
  let demoIndex = 0;
  let demoRunning = false;

  const host = document.getElementById("sceneHost");
  const els = {
    activeSceneName: document.getElementById("activeSceneName"),
    sceneSummary: document.getElementById("sceneSummary"),
    sceneDescription: document.getElementById("sceneDescription"),
    selectedConeId: document.getElementById("selectedConeId"),
    selectedConeMode: document.getElementById("selectedConeMode"),
    selectedConeBattery: document.getElementById("selectedConeBattery"),
    selectedConeCrowd: document.getElementById("selectedConeCrowd"),
    selectedConePosition: document.getElementById("selectedConePosition"),
    commandCount: document.getElementById("commandCount"),
    gatewayStatus: document.getElementById("gatewayStatus"),
    commandPreview: document.getElementById("commandPreview"),
    sceneTabs: document.getElementById("sceneTabs"),
    autoDemoBtn: document.getElementById("autoDemoBtn"),
    resetSceneBtn: document.getElementById("resetSceneBtn")
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x071526);
  scene.fog = new THREE.Fog(0x071526, 18, 52);

  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight);
  renderer.shadowMap.enabled = true;
  host.appendChild(renderer.domElement);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const cameraState = { radius: 19.4, theta: -0.72, phi: 0.8, target: new THREE.Vector3(0.4, 0, 0.8) };
  const cameraTarget = { radius: 19.4, theta: -0.72, phi: 0.8, target: new THREE.Vector3(0.4, 0, 0.8) };
  const drag = { active: false, moved: false, x: 0, y: 0 };

  const closureZone = makeZone(0xdc2626, 4.3, 2.2, 0.5);
  closureZone.position.set(4.4, 0.055, 0.3);
  closureZone.visible = false;
  scene.add(closureZone);

  const crowdZone = makeZone(0xf97316, 3.6, 2.2, 0.45);
  crowdZone.position.set(4.6, 0.065, 2.7);
  crowdZone.visible = false;
  scene.add(crowdZone);

  initLighting();
  initStadium();
  initCones();
  initNetwork();
  initSceneTabs();
  bindEvents();
  applyScene("idle");
  setupDiagnostics();
  animate();

  function initLighting() {
    scene.add(new THREE.HemisphereLight(0xdbeafe, 0x172033, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(-8, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 1024;
    sun.shadow.mapSize.height = 1024;
    scene.add(sun);
  }

  function initStadium() {
    addPlane(44, 30, 0x0f766e, 0, 0, -0.04);
    addPlane(13.2, 7.8, 0x15803d, -5.3, -2.6, -0.02);

    addRoadSegment(6.3, 0.1, 2.8, 17.4, "东侧校园主路");
    addRoadSegment(0.8, 5.1, 18.2, 2.4, "大学城南路方向");
    addRoadSegment(-1.6, 1.55, 11.8, 1.45, "体育馆入口车行道");
    addRoadSegment(2.7, 3.35, 7.2, 1.45, "活动散场分流带");
    addRoadSegment(-4.7, 3.65, 1.55, 5.2, "教学区步行方向");

    addCrosswalk(6.3, 3.45, 2.45, 1.0, "vertical");
    addCrosswalk(3.2, 1.55, 1.15, 1.3, "horizontal");
    addCrosswalk(-4.7, 1.55, 1.15, 1.3, "horizontal");

    addStadiumComplex();
    addOutdoorTrack();
    addBusStop();
    addParkingLot();
    addCrowdPeople();

    addCampusBuilding(-9.1, 4.8, 2.8, 2.1, 1.1, 0xbfd7ea, "教学区方向");
    addCampusBuilding(9.2, 6.7, 2.8, 2.0, 1.0, 0xf4d4a4, "生活区方向");
    addCampusBuilding(8.8, -6.1, 3.2, 1.8, 0.85, 0xcbd5e1, "北大门方向");
    addCampusBuilding(-10.1, -4.5, 2.4, 2.2, 0.9, 0xa7f3d0, "训练场");

    addCampusLabel("重庆大学虎溪校区体育馆周边道路", -1.4, 0.18, -7.1, 260, 54);
    addCampusLabel("入口广场", -1.1, 0.16, 2.9, 120, 42);
    addCampusLabel("急救通道", 0.9, 0.16, 4.0, 120, 42);

    [
      [-8.2, 1.7], [-7.2, 1.9], [-6.1, 2.1], [-5.1, 5.9], [-3.9, 5.9],
      [-2.8, 5.9], [-1.6, 5.9], [1.6, 6.4], [3.0, 6.4], [4.4, 6.4],
      [7.9, -5.1], [7.9, -3.8], [7.9, -2.5], [7.9, -1.2], [7.9, 0.2],
      [7.9, 1.5], [7.9, 2.9], [7.9, 4.2], [4.3, -4.9], [2.8, -5.5]
    ].forEach(([x, z]) => addTree(x, z));

    [
      [-3.6, 0.65], [-0.4, 0.65], [2.6, 0.65], [5.0, 2.4],
      [5.0, 4.6], [7.8, -2.2], [7.8, 2.0], [-4.0, 4.7]
    ].forEach(([x, z]) => addLamp(x, z));
  }

  function addPlane(width, depth, color, x, z, y = 0, opacity = 1) {
    const material = new THREE.MeshPhongMaterial({
      color,
      shininess: 10,
      transparent: opacity < 1,
      opacity
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  function addRoadSegment(x, z, width, depth, label) {
    addPlane(width, depth, 0x334155, x, z, 0.004);
    addPlane(width + 0.26, 0.08, 0xe2e8f0, x, z - depth / 2, 0.012, 0.72);
    addPlane(width + 0.26, 0.08, 0xe2e8f0, x, z + depth / 2, 0.012, 0.72);
    addPlane(0.08, depth + 0.26, 0xe2e8f0, x - width / 2, z, 0.012, 0.72);
    addPlane(0.08, depth + 0.26, 0xe2e8f0, x + width / 2, z, 0.012, 0.72);

    const vertical = depth > width;
    const count = Math.floor((vertical ? depth : width) / 1.45);
    for (let i = 0; i < count; i += 1) {
      const offset = -((count - 1) * 1.45) / 2 + i * 1.45;
      if (vertical) addPlane(0.08, 0.58, 0xf8fafc, x, z + offset, 0.018, 0.72);
      else addPlane(0.58, 0.08, 0xf8fafc, x + offset, z, 0.018, 0.72);
    }

    addCampusLabel(label, x, 0.14, z - depth / 2 - 0.52, 145, 38);
  }

  function addCrosswalk(x, z, width, depth, axis) {
    const stripeCount = 5;
    for (let i = 0; i < stripeCount; i += 1) {
      const offset = (i - 2) * 0.22;
      if (axis === "vertical") addPlane(width, 0.08, 0xffffff, x, z + offset, 0.026, 0.82);
      else addPlane(0.08, depth, 0xffffff, x + offset, z, 0.026, 0.82);
    }
  }

  function addStadiumComplex() {
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(8.2, 1.2, 3.8),
      new THREE.MeshPhongMaterial({ color: 0xdbeafe, shininess: 26 })
    );
    base.position.set(-2.7, 0.6, -1.45);
    base.castShadow = true;
    base.receiveShadow = true;
    scene.add(base);

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 0.35, 4.25),
      new THREE.MeshPhongMaterial({ color: 0x64748b, shininess: 38 })
    );
    roof.position.set(-2.7, 1.34, -1.45);
    roof.castShadow = true;
    scene.add(roof);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(6.2, 0.82, 0.08),
      new THREE.MeshPhongMaterial({ color: 0x93c5fd, emissive: 0x1d4ed8, emissiveIntensity: 0.12, transparent: true, opacity: 0.72 })
    );
    glass.position.set(-2.7, 0.72, 0.52);
    scene.add(glass);

    addCampusLabel("虎溪体育中心", -2.7, 1.76, 0.78, 180, 46);
    addPlane(9.6, 2.45, 0xe5e7eb, -1.4, 2.35, 0.016);
  }

  function addOutdoorTrack() {
    const track = new THREE.Mesh(
      makeEllipseRingGeometry(4.6, 2.55, 3.25, 1.62),
      new THREE.MeshPhongMaterial({ color: 0xc2410c, shininess: 18 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(-6.4, 0.018, -4.1);
    track.receiveShadow = true;
    scene.add(track);

    const field = new THREE.Mesh(
      makeEllipseGeometry(3.0, 1.42),
      new THREE.MeshPhongMaterial({ color: 0x86efac, shininess: 10 })
    );
    field.rotation.x = -Math.PI / 2;
    field.position.set(-6.4, 0.035, -4.1);
    field.receiveShadow = true;
    scene.add(field);

    [4.25, 3.75].forEach((rx, index) => {
      const line = makeEllipseLine(rx, 2.32 - index * 0.45, 0xffffff);
      line.position.set(-6.4, 0.055, -4.1);
      scene.add(line);
    });
    addCampusLabel("足球场和田径场", -6.4, 0.18, -6.85, 160, 40);
  }

  function addBusStop() {
    addPlane(2.1, 0.62, 0xfacc15, 6.25, 2.55, 0.03, 0.8);
    const bus = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.48, 0.52),
      new THREE.MeshPhongMaterial({ color: 0x38bdf8, shininess: 26 })
    );
    bus.position.set(6.25, 0.29, 1.72);
    bus.castShadow = true;
    scene.add(bus);

    const busTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.15, 0.18, 0.42),
      new THREE.MeshPhongMaterial({ color: 0xe0f2fe, shininess: 18 })
    );
    busTop.position.set(6.25, 0.62, 1.72);
    scene.add(busTop);

    const shelter = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.12, 0.46),
      new THREE.MeshPhongMaterial({ color: 0x0f172a, emissive: 0x0f172a })
    );
    shelter.position.set(6.25, 0.72, 2.55);
    scene.add(shelter);
    [-0.55, 0.55].forEach((offset) => {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 0.72, 12),
        new THREE.MeshPhongMaterial({ color: 0x475569 })
      );
      pole.position.set(6.25 + offset, 0.36, 2.55);
      scene.add(pole);
    });
    addCampusLabel("校车站", 6.25, 1.05, 2.95, 100, 38);
  }

  function addCrowdPeople() {
    const points = [
      [4.4, 2.2], [4.75, 2.55], [5.1, 2.18], [5.35, 2.7], [5.75, 2.32], [6.0, 2.8],
      [3.7, 2.95], [4.05, 3.25], [4.45, 3.15], [4.82, 3.45], [5.2, 3.28], [5.58, 3.58],
      [-0.8, 2.55], [-0.38, 2.82], [0.05, 2.48], [0.42, 2.96], [0.9, 2.7], [1.26, 3.08],
      [-1.35, 3.25], [-0.95, 3.55], [-0.5, 3.35], [0.0, 3.62], [0.55, 3.45], [1.0, 3.75]
    ];
    points.forEach(([x, z], index) => {
      const person = createPerson(index % 3 === 0 ? 0xf97316 : index % 3 === 1 ? 0x2563eb : 0x22c55e);
      person.position.set(x, 0, z);
      person.visible = false;
      scene.add(person);
      crowdPeople.push(person);
    });
  }

  function createPerson(color) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.075, 0.32, 10),
      new THREE.MeshPhongMaterial({ color, shininess: 14 })
    );
    body.position.y = 0.22;
    group.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 8),
      new THREE.MeshPhongMaterial({ color: 0xffedd5, shininess: 12 })
    );
    head.position.y = 0.43;
    group.add(head);
    return group;
  }

  function addParkingLot() {
    addPlane(3.4, 2.35, 0x475569, 9.0, -2.8, 0.012);
    addCampusLabel("停车区", 9.0, 0.16, -1.2, 100, 38);
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        addCar(8.05 + col * 0.85, -3.35 + row * 0.86, col % 2 ? 0x60a5fa : 0xf97316);
      }
    }
  }

  function addCar(x, z, color) {
    const car = new THREE.Mesh(
      new THREE.BoxGeometry(0.58, 0.26, 0.32),
      new THREE.MeshPhongMaterial({ color, shininess: 30 })
    );
    car.position.set(x, 0.16, z);
    car.castShadow = true;
    scene.add(car);
  }

  function addCampusBuilding(x, z, width, depth, height, color, label) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshPhongMaterial({ color, shininess: 18 })
    );
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    addCampusLabel(label, x, height + 0.32, z, 130, 38);
  }

  function addTree(x, z) {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.075, 0.42, 10),
      new THREE.MeshPhongMaterial({ color: 0x854d0e })
    );
    trunk.position.set(x, 0.21, z);
    scene.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 14, 10),
      new THREE.MeshPhongMaterial({ color: 0x22c55e, shininess: 8 })
    );
    crown.position.set(x, 0.6, z);
    crown.castShadow = true;
    scene.add(crown);
  }

  function addLamp(x, z) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 1.15, 12),
      new THREE.MeshPhongMaterial({ color: 0x334155 })
    );
    pole.position.set(x, 0.58, z);
    scene.add(pole);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xfef3c7 })
    );
    head.position.set(x, 1.22, z);
    scene.add(head);
    const light = new THREE.PointLight(0xfef3c7, 0.28, 3.2);
    light.position.set(x, 1.28, z);
    scene.add(light);
  }

  function addCampusLabel(text, x, y, z, width, height) {
    const sprite = makeTextSprite(text, "#ffffff", "rgba(15,35,55,0.76)", width, height);
    sprite.position.set(x, y, z);
    scene.add(sprite);
    return sprite;
  }

  function initCones() {
    cones.forEach((cone) => {
      const object = createConeObject(cone);
      coneObjects.set(cone.id, object);
      scene.add(object.group);
    });
  }

  function initNetwork() {
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, 1.15, 14),
      new THREE.MeshPhongMaterial({ color: 0xe2e8f0, shininess: 24 })
    );
    mast.position.copy(gatewayPosition);
    mast.position.y -= 0.36;
    scene.add(mast);

    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    node.position.copy(gatewayPosition);
    scene.add(node);

    gatewayLight = new THREE.PointLight(0x38bdf8, 0.9, 5.5);
    gatewayLight.position.copy(gatewayPosition);
    scene.add(gatewayLight);

    [0, 1, 2].forEach((index) => {
      const pulse = new THREE.Mesh(
        new THREE.TorusGeometry(0.35 + index * 0.18, 0.012, 10, 56),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.28 })
      );
      pulse.rotation.x = Math.PI / 2;
      pulse.position.copy(gatewayPosition);
      gatewayPulses.push(pulse);
      scene.add(pulse);
    });

    addCampusLabel("集群网关", gatewayPosition.x, gatewayPosition.y + 0.42, gatewayPosition.z, 110, 38);

    cones.forEach((cone, index) => {
      const end = new THREE.Vector3(cone.x, 0.92, cone.z);
      const geometry = new THREE.BufferGeometry().setFromPoints([gatewayPosition, end]);
      const material = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.26
      });
      const line = new THREE.Line(geometry, material);
      scene.add(line);

      const packet = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.9 })
      );
      packet.position.copy(gatewayPosition);
      scene.add(packet);

      networkLinks.push({ coneId: cone.id, line, packet, offset: index / cones.length });
    });
  }

  function initSceneTabs() {
    const labels = [
      ["idle", "正常待命"],
      ["maintenance", "道路维护"],
      ["warning", "拥挤预警"],
      ["dispersal", "散场分流"],
      ["emergency", "紧急求助"],
      ["fallen", "倒伏报警"]
    ];

    labels.forEach(([key, label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.scene = key;
      btn.textContent = label;
      btn.addEventListener("click", () => {
        if (key === "fallen") simulateFallen();
        else applyScene(key);
      });
      els.sceneTabs.appendChild(btn);
    });
  }

  function bindEvents() {
    renderer.domElement.addEventListener("pointerdown", (event) => {
      drag.active = true;
      drag.moved = false;
      drag.x = event.clientX;
      drag.y = event.clientY;
      renderer.domElement.setPointerCapture(event.pointerId);
    });

    renderer.domElement.addEventListener("pointermove", (event) => {
      if (!drag.active) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      cameraState.theta -= dx * 0.006;
      cameraState.phi = THREE.MathUtils.clamp(cameraState.phi + dy * 0.004, 0.42, 1.22);
      syncCameraTarget();
      drag.x = event.clientX;
      drag.y = event.clientY;
    });

    renderer.domElement.addEventListener("pointerup", (event) => {
      drag.active = false;
      renderer.domElement.releasePointerCapture(event.pointerId);
      if (!drag.moved) pickCone(event);
    });

    renderer.domElement.addEventListener("wheel", (event) => {
      event.preventDefault();
      cameraState.radius = THREE.MathUtils.clamp(cameraState.radius + event.deltaY * 0.008, 9.5, 23);
      syncCameraTarget();
    }, { passive: false });

    window.addEventListener("resize", onResize);
    els.autoDemoBtn.addEventListener("click", toggleDemo);
    els.resetSceneBtn.addEventListener("click", () => applyScene("idle"));
  }

  function makeEllipseRingGeometry(outerX, outerZ, innerX, innerZ) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, outerX, outerZ, 0, Math.PI * 2, false, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, 0, innerX, innerZ, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
    return new THREE.ShapeGeometry(shape, 96);
  }

  function makeEllipseGeometry(rx, rz) {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
    return new THREE.ShapeGeometry(shape, 96);
  }

  function makeEllipseLine(rx, rz, color) {
    const points = [];
    for (let i = 0; i <= 160; i += 1) {
      const t = (i / 160) * Math.PI * 2;
      points.push(new THREE.Vector3(Math.cos(t) * rx, 0, Math.sin(t) * rz));
    }
    return new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.62 })
    );
  }

  function addStands(z, name) {
    for (let row = 0; row < 4; row += 1) {
      const stand = new THREE.Mesh(
        new THREE.BoxGeometry(14.5 - row * 0.9, 0.28, 0.55),
        new THREE.MeshPhongMaterial({ color: row % 2 ? 0x94a3b8 : 0xcbd5e1 })
      );
      stand.position.set(0, 0.14 + row * 0.16, z + (name === "north" ? -row * 0.54 : row * 0.54));
      stand.castShadow = true;
      stand.receiveShadow = true;
      scene.add(stand);
    }
  }

  function addGate(x, z, label) {
    const gate = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 1.2, 2.2),
      new THREE.MeshPhongMaterial({ color: 0x334155, emissive: 0x0f2337 })
    );
    gate.position.set(x, 0.6, z);
    gate.castShadow = true;
    scene.add(gate);
    const sprite = makeTextSprite(label, "#ffffff", "rgba(15,35,55,0.78)", 170, 52);
    sprite.position.set(x, 1.75, z);
    scene.add(sprite);
  }

  function makeZone(color, width, depth, opacity) {
    const zone = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide })
    );
    zone.rotation.x = -Math.PI / 2;
    return zone;
  }

  function createConeObject(cone) {
    const group = new THREE.Group();
    group.position.set(cone.x, 0, cone.z);

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.42, 0.18, 28),
      new THREE.MeshPhongMaterial({ color: 0x263445 })
    );
    base.position.y = 0.09;
    base.castShadow = true;
    base.userData.id = cone.id;
    group.add(base);
    selectable.push(base);

    const body = new THREE.Mesh(
      new THREE.ConeGeometry(0.27, 0.86, 32),
      new THREE.MeshPhongMaterial({ color: 0xe2e8f0, emissive: 0x111827, emissiveIntensity: 0.2 })
    );
    body.position.y = 0.62;
    body.castShadow = true;
    body.userData.id = cone.id;
    group.add(body);
    selectable.push(body);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.035, 12, 44),
      new THREE.MeshBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.75 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.88;
    group.add(ring);

    const light = new THREE.PointLight(0xe2e8f0, 0.6, 4);
    light.position.y = 1.05;
    group.add(light);

    const label = makeTextSprite(cone.id.replace("cone_", "C"), "#ffffff", "rgba(15,35,55,0.82)", 96, 42);
    label.position.y = 1.42;
    group.add(label);

    return { group, body, ring, light, label };
  }

  function makeTextSprite(text, color, background, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = background;
    roundedRect(ctx, 0, 0, width, height, 16);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "bold 24px Microsoft YaHei, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, width / 2, height / 2 + 1);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(width / 100, height / 100, 1);
    return sprite;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function createFlowArrow(flow) {
    const group = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.78, 14), material);
    shaft.rotation.z = Math.PI / 2;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 24), material);
    head.rotation.z = -Math.PI / 2;
    head.position.x = 0.56;
    group.add(shaft, head);
    group.position.set(flow.x, 0.32, flow.z);
    const rot = flow.dir === "left" ? Math.PI : flow.dir === "up" ? Math.PI / 2 : flow.dir === "down" ? -Math.PI / 2 : 0;
    group.rotation.y = rot;
    scene.add(group);
    flowObjects.push({ group, baseX: flow.x, baseZ: flow.z, dir: flow.dir });
  }

  function applyScene(sceneKey) {
    const target = scenes[sceneKey] || scenes.idle;
    activeScene = sceneKey in scenes ? sceneKey : "idle";
    if (target.focus) selectedConeId = target.focus;
    setCameraPreset(activeScene);

    cones.forEach((cone) => {
      const update = target.updates[cone.id] || {};
      Object.assign(cone, update);
      cone.fallen = update.fallen || cone.mode === "FALLEN";
      updateConeObject(cone);
    });

    closureZone.visible = target.closure;
    crowdZone.visible = target.crowd;
    crowdPeople.forEach((person) => {
      person.visible = target.crowd;
    });
    clearFlows();
    target.flows.forEach(createFlowArrow);
    updateHud(target);
    updateSceneTabs();
  }

  function simulateFallen() {
    applyScene("warning");
    setCameraPreset("fallen");
    const cone = cones.find((item) => item.id === "cone_05") || cones[0];
    cone.mode = "FALLEN";
    cone.fallen = true;
    cone.crowdLevel = Math.max(cone.crowdLevel, 2);
    selectedConeId = cone.id;
    updateConeObject(cone);
    activeScene = "fallen";
    updateHud({ name: "倒伏报警", description: `${cone.id} 在校车站旁被人流碰倒，管理端收到倒伏与移位异常上报。` });
    updateSceneTabs();
  }

  function updateConeObject(cone) {
    const object = coneObjects.get(cone.id);
    const mode = MODES[cone.mode] || MODES.IDLE;
    object.group.position.x += (cone.x - object.group.position.x) * 0.35;
    object.group.position.z += (cone.z - object.group.position.z) * 0.35;
    object.body.material.color.setHex(mode.color);
    object.body.material.emissive.setHex(mode.color);
    object.body.material.emissiveIntensity = mode.blink ? 0.75 : 0.18;
    object.ring.material.color.setHex(mode.color);
    object.light.color.setHex(mode.color);
    object.light.intensity = mode.blink ? 1.35 : 0.5;
    object.group.rotation.z = cone.fallen ? -Math.PI / 2.5 : 0;
  }

  function updateHud(sceneInfo) {
    const selected = cones.find((cone) => cone.id === selectedConeId) || cones[0];
    const mode = MODES[selected.mode] || MODES.IDLE;
    const payload = buildPayload(sceneInfo.name);

    els.activeSceneName.textContent = sceneInfo.name;
    els.sceneSummary.textContent = `重庆大学虎溪校区体育馆周边道路 · ${sceneInfo.name}`;
    els.sceneDescription.textContent = sceneInfo.description;
    els.selectedConeId.textContent = selected.id;
    els.selectedConeMode.textContent = mode.label;
    els.selectedConeBattery.textContent = `${selected.battery}%`;
    els.selectedConeCrowd.textContent = String(selected.crowdLevel || 0);
    els.selectedConePosition.textContent = `${selected.x.toFixed(1)}, ${selected.z.toFixed(1)}`;
    els.commandCount.textContent = `${payload.commands.length} 条`;
    els.gatewayStatus.textContent = buildGatewayStatus(payload);
    els.commandPreview.textContent = JSON.stringify(payload, null, 2);
  }

  function buildGatewayStatus(payload) {
    const maxCrowd = Math.max(...cones.map((cone) => cone.crowdLevel || 0));
    const urgentCount = cones.filter((cone) => cone.mode !== "IDLE").length;
    const latency = 34 + urgentCount * 6 + maxCrowd * 5;
    return `huxi_gateway_01 在线 · 链路 ${payload.gateway.links}/${cones.length} · 延迟 ${latency}ms`;
  }

  function buildPayload(sceneName) {
    return {
      scene: sceneName,
      target: "cluster",
      location: "CQU Huxi Campus Sports Center Road Area",
      view: "huxi-campus-3d-digital-twin",
      gateway: {
        id: "huxi_gateway_01",
        role: "edge-controller",
        links: cones.length,
        protocol: "MQTT/WebSocket demo"
      },
      commands: cones.map((cone) => {
        const mode = MODES[cone.mode] || MODES.IDLE;
        return {
          id: cone.id,
          mode: mode.command,
          ledColor: `#${mode.color.toString(16).padStart(6, "0")}`,
          blink: mode.blink,
          position: { x: Number(cone.x.toFixed(2)), z: Number(cone.z.toFixed(2)) }
        };
      })
    };
  }

  function updateSceneTabs() {
    els.sceneTabs.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.scene === activeScene);
    });
  }

  function clearFlows() {
    while (flowObjects.length) {
      const item = flowObjects.pop();
      scene.remove(item.group);
    }
  }

  function pickCone(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(selectable, false)[0];
    if (!hit?.object?.userData?.id) return;
    selectedConeId = hit.object.userData.id;
    updateHud({ name: scenes[activeScene]?.name || "倒伏报警", description: els.sceneDescription.textContent });
  }

  function toggleDemo() {
    demoRunning = !demoRunning;
    els.autoDemoBtn.textContent = demoRunning ? "暂停演示" : "开始演示";
    if (demoRunning) runDemoStep();
    else window.clearTimeout(demoTimer);
  }

  function runDemoStep() {
    if (!demoRunning) return;
    const key = demoScript[demoIndex % demoScript.length];
    if (key === "fallen") simulateFallen();
    else applyScene(key);
    demoIndex += 1;
    demoTimer = window.setTimeout(runDemoStep, 3200);
  }

  function updateCamera() {
    cameraState.radius += (cameraTarget.radius - cameraState.radius) * 0.045;
    cameraState.theta += (cameraTarget.theta - cameraState.theta) * 0.045;
    cameraState.phi += (cameraTarget.phi - cameraState.phi) * 0.045;
    cameraState.target.lerp(cameraTarget.target, 0.05);

    const { radius, theta, phi, target } = cameraState;
    camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
    camera.position.y = target.y + radius * Math.cos(phi);
    camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);
    camera.lookAt(target);
  }

  function setCameraPreset(sceneKey) {
    const preset = cameraPresets[sceneKey] || cameraPresets.idle;
    cameraTarget.radius = preset.radius;
    cameraTarget.theta = preset.theta;
    cameraTarget.phi = preset.phi;
    cameraTarget.target.set(preset.target[0], preset.target[1], preset.target[2]);
  }

  function syncCameraTarget() {
    cameraTarget.radius = cameraState.radius;
    cameraTarget.theta = cameraState.theta;
    cameraTarget.phi = cameraState.phi;
    cameraTarget.target.copy(cameraState.target);
  }

  function animate(time = 0) {
    requestAnimationFrame(animate);
    const t = time * 0.001;
    updateCamera();

    cones.forEach((cone) => {
      const object = coneObjects.get(cone.id);
      const mode = MODES[cone.mode] || MODES.IDLE;
      object.group.position.x += (cone.x - object.group.position.x) * 0.08;
      object.group.position.z += (cone.z - object.group.position.z) * 0.08;
      const selectedBoost = cone.id === selectedConeId ? 0.28 : 0;
      const pulse = mode.blink ? 0.55 + Math.sin(t * 7) * 0.32 : 0.28;
      object.ring.material.opacity = pulse + selectedBoost;
      object.light.intensity = mode.blink ? 1.1 + Math.sin(t * 7) * 0.5 : 0.4 + selectedBoost;
      object.label.material.opacity = cone.id === selectedConeId ? 1 : 0.82;
    });

    updateNetwork(t);
    crowdZone.material.opacity = 0.28 + Math.sin(t * 4) * 0.12;
    crowdPeople.forEach((person, index) => {
      if (!person.visible) return;
      person.position.y = Math.sin(t * 4 + index * 0.7) * 0.025;
      person.rotation.y = Math.sin(t * 2 + index) * 0.4;
    });
    flowObjects.forEach((item, index) => {
      const drift = Math.sin(t * 3 + index) * 0.18;
      item.group.position.x = item.baseX + (item.dir === "left" ? -drift : item.dir === "right" ? drift : 0);
      item.group.position.z = item.baseZ + (item.dir === "up" ? -drift : item.dir === "down" ? drift : 0);
    });

    renderer.render(scene, camera);
  }

  function updateNetwork(t) {
    if (gatewayLight) gatewayLight.intensity = 0.65 + Math.sin(t * 4.2) * 0.22;

    gatewayPulses.forEach((pulse, index) => {
      const phase = (t * 0.75 + index * 0.33) % 1;
      const scale = 1 + phase * 1.8;
      pulse.scale.set(scale, scale, scale);
      pulse.material.opacity = (1 - phase) * 0.32;
    });

    networkLinks.forEach((item, index) => {
      const cone = cones.find((entry) => entry.id === item.coneId);
      const object = coneObjects.get(item.coneId);
      if (!cone || !object) return;

      const mode = MODES[cone.mode] || MODES.IDLE;
      const end = new THREE.Vector3(object.group.position.x, 0.96, object.group.position.z);
      const positions = item.line.geometry.attributes.position.array;
      positions[0] = gatewayPosition.x;
      positions[1] = gatewayPosition.y;
      positions[2] = gatewayPosition.z;
      positions[3] = end.x;
      positions[4] = end.y;
      positions[5] = end.z;
      item.line.geometry.attributes.position.needsUpdate = true;

      const active = cone.mode !== "IDLE";
      const pulse = active ? 0.48 + Math.sin(t * 5.4 + index) * 0.16 : 0.22;
      item.line.material.color.setHex(mode.color);
      item.line.material.opacity = pulse;

      const progress = (t * (active ? 0.65 : 0.28) + item.offset) % 1;
      item.packet.position.lerpVectors(gatewayPosition, end, progress);
      item.packet.material.color.setHex(mode.color);
      item.packet.material.opacity = active ? 0.95 : 0.42;
      item.packet.scale.setScalar(active ? 1.25 : 0.85);
    });
  }

  function onResize() {
    camera.aspect = host.clientWidth / host.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight);
  }

  function setupDiagnostics() {
    if (!new URLSearchParams(window.location.search).has("verify")) return;
    const node = document.createElement("div");
    node.id = "renderHealth";
    node.hidden = true;
    document.body.appendChild(node);

    window.setTimeout(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 120;
      canvas.height = 80;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let bright = 0;
      let varied = 0;
      for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r + g + b > 80) bright += 1;
        if (Math.max(r, g, b) - Math.min(r, g, b) > 10) varied += 1;
      }
      node.dataset.status = bright > 100 && varied > 50 ? "ok" : "fail";
      node.dataset.bright = String(bright);
      node.dataset.varied = String(varied);
      node.textContent = `status=${node.dataset.status};bright=${bright};varied=${varied}`;
    }, 1200);
  }
})();
