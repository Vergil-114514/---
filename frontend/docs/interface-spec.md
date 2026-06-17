# 智能路锥集群系统接口文档

版本：v1.0  
适用范围：前端演示系统、路径规划算法、本地网关、ESP32 智能路锥  
推荐协议：HTTP / WebSocket 用于前端与算法，MQTT 用于网关与 ESP32，串口/USB 用于 BU04 UWB 基站接入网关

## 当前版本说明

当前项目处于“上位机直接输出最终坐标”的演示模式。GPS / UWB 不参与定位融合，前端地图主位置只消费 `cone.telemetry.payload.position`。`gps.position`、`uwb.position` 和 `fused.position` 仅保留为历史兼容字段，不作为地图主位置来源。

## 1. 系统通信结构

```text
前端管理端 / 3D 数字孪生
        |
        | HTTP / WebSocket
        v
本地网关程序 Node.js / Python
        |
        | MQTT
        v
ESP32 智能路锥

BU04 UWB 基站
        |
        | USB / TTL 串口
        v
本地网关程序 Node.js / Python
        |
        | 绑定 BU03 标签 ID -> coneId
        v
路锥实时坐标 / 路径规划输入

路径规划算法服务
        |
        | HTTP / WebSocket
        v
本地网关 / 前端管理端
```

推荐拆分原则：

- 前端负责展示、人工控制、场景切换和指令预览。
- 路径规划算法负责根据障碍区、人群区、起终点输出路线和路锥任务。
- 本地网关负责把集群任务拆成单设备命令，并转发给 ESP32。
- BU04 作为 UWB 固定基站接入本地网关，BU03 作为路锥标签提供实时位置。
- ESP32 只执行单设备命令，并回传 ACK 与状态。

## 2. 坐标系约定

统一使用本地平面坐标：

```json
{
  "mapFrame": "cqu_huxi_local_v1",
  "unit": "m",
  "axis": {
    "x": "east",
    "y": "north"
  }
}
```

说明：

- `x`：向东为正。
- `y`：向北为正。
- 前端 2D 百分比坐标需要在网关或前端侧转换成本地米制坐标。
- 3D 页面内部使用 `x/z`，对外接口统一转换为 `x/y`。

## 3. 模式枚举

| mode | 含义 | LED | 声音 | 箭头 |
| --- | --- | --- | --- | --- |
| `STANDBY_DIM` | 待命 | 白色低亮 | 关闭 | 无 |
| `BLOCK_RED` | 禁行/封闭 | 红色 | 急促 | 无 |
| `GUIDE_LEFT_ARROW` | 左侧引导 | 黄色 | 关闭 | 左 |
| `GUIDE_RIGHT_ARROW` | 右侧引导 | 黄色 | 关闭 | 右 |
| `WARN_CROWD_ORANGE` | 拥挤预警 | 橙色 | 柔和提示 | 可选 |
| `ALARM_HELP_RED` | 紧急求助 | 红色快闪 | 急促 | 可选 |
| `ALARM_FALLEN_RED` | 倒伏报警 | 红色快闪 | 急促 | 无 |
| `OFFLINE` | 离线 | 关闭 | 关闭 | 无 |

## 4. 前端/算法到网关：集群指令

用途：前端场景切换或路径规划算法输出任务后，向本地网关提交一组路锥命令。

HTTP：

```text
POST /api/cluster/command
Content-Type: application/json
```

WebSocket：

```json
{
  "type": "cluster.command",
  "payload": {}
}
```

请求体：

```json
{
  "version": "1.0",
  "requestId": "cmd_20260610_0001",
  "scene": "东侧道路维护",
  "target": "cluster",
  "mapFrame": "cqu_huxi_local_v1",
  "issuedAt": "2026-06-10T14:30:00+08:00",
  "gateway": {
    "id": "huxi_gateway_01",
    "protocol": "MQTT",
    "links": 6
  },
  "commands": [
    {
      "id": "cone_04",
      "seq": 1024,
      "mode": "BLOCK_RED",
      "ledColor": "#dc2626",
      "blink": true,
      "audio": "urgent",
      "arrow": "none",
      "position": {
        "x": 3.6,
        "y": 0.3
      },
      "ttlMs": 5000
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `version` | string | 是 | 接口版本 |
| `requestId` | string | 是 | 指令批次 ID |
| `scene` | string | 是 | 当前场景名称 |
| `target` | string | 是 | 固定为 `cluster` |
| `mapFrame` | string | 是 | 坐标系 |
| `issuedAt` | string | 是 | ISO 时间 |
| `gateway.id` | string | 是 | 网关 ID |
| `commands` | array | 是 | 单设备命令列表 |
| `commands[].id` | string | 是 | 路锥 ID |
| `commands[].seq` | number | 是 | 单设备递增指令序号 |
| `commands[].mode` | string | 是 | 工作模式 |
| `commands[].ledColor` | string | 是 | `#RRGGBB` |
| `commands[].blink` | boolean | 是 | 是否闪烁 |
| `commands[].audio` | string | 是 | `off` / `soft` / `urgent` / `none` |
| `commands[].arrow` | string | 是 | `left` / `right` / `none` |
| `commands[].position` | object | 否 | 目标摆放位置 |
| `commands[].ttlMs` | number | 是 | 指令有效时间 |

响应：

```json
{
  "requestId": "cmd_20260610_0001",
  "status": "accepted",
  "accepted": 6,
  "rejected": 0,
  "message": "cluster command accepted"
}
```

## 5. 网关到 ESP32：单设备命令

推荐使用 MQTT。

Topic：

```text
smartcone/cmd/{deviceId}
```

示例：

```text
smartcone/cmd/cone_04
```

Payload：

```json
{
  "seq": 1024,
  "mode": "BLOCK_RED",
  "ledColor": "#dc2626",
  "blink": true,
  "audio": "urgent",
  "arrow": "none",
  "ttlMs": 5000
}
```

ESP32 必须处理字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `seq` | number | 指令序号，避免重复执行 |
| `mode` | string | 工作模式 |
| `ledColor` | string | LED 颜色 |
| `blink` | boolean | 是否闪烁 |
| `audio` | string | 声音策略 |
| `arrow` | string | 箭头方向 |
| `ttlMs` | number | 有效时间 |

ESP32 执行建议：

1. 收到命令后比较 `seq`，小于或等于上次执行序号则丢弃。
2. 立即切换 LED、蜂鸣器、箭头显示。
3. 发布 ACK。
4. 超过 `ttlMs` 且没有新命令时回到 `STANDBY_DIM`。

## 6. ESP32 到网关：ACK 回执

Topic：

```text
smartcone/ack/{deviceId}
```

Payload：

```json
{
  "id": "cone_04",
  "seq": 1024,
  "status": "ok",
  "latencyMs": 48,
  "timestamp": 1781073000000
}
```

`status` 枚举：

| status | 含义 |
| --- | --- |
| `ok` | 已执行 |
| `fail` | 执行失败 |
| `busy` | 设备忙 |
| `invalid_command` | 命令不合法 |
| `low_battery` | 电量过低 |

## 7. ESP32 到网关：状态上报

Topic：

```text
smartcone/status/{deviceId}
```

Payload：

```json
{
  "id": "cone_04",
  "online": true,
  "battery": 74,
  "rssi": -61,
  "mode": "BLOCK_RED",
  "fallen": false,
  "crowdLevel": 0,
  "position": {
    "x": 3.6,
    "y": 0.3
  },
  "timestamp": 1781073000000
}
```

建议频率：

- 普通状态：每 3-5 秒上报一次。
- 倒伏、低电量、离线恢复：立即上报。
- 人流检测变化：变化超过阈值时上报。

## 8. 路径规划算法输入

HTTP：

```text
POST /api/planner/route
Content-Type: application/json
```

请求体：

```json
{
  "requestId": "plan_20260610_0001",
  "mapFrame": "cqu_huxi_local_v1",
  "scene": "活动散场分流",
  "origin": {
    "x": -1.2,
    "y": 2.7
  },
  "destination": {
    "x": 6.3,
    "y": 3.6
  },
  "cones": [
    {
      "id": "cone_01",
      "position": {
        "x": -4.6,
        "y": 0.8
      },
      "battery": 86,
      "online": true,
      "mode": "STANDBY_DIM"
    }
  ],
  "blockedZones": [
    {
      "id": "maintenance_zone_01",
      "type": "polygon",
      "points": [
        { "x": 3.0, "y": -0.8 },
        { "x": 5.2, "y": -0.8 },
        { "x": 5.2, "y": 1.4 },
        { "x": 3.0, "y": 1.4 }
      ]
    }
  ],
  "crowdZones": [
    {
      "id": "bus_stop_crowd",
      "center": {
        "x": 5.0,
        "y": 2.8
      },
      "radius": 2.0,
      "level": 3
    }
  ]
}
```

说明：

- `blockedZones` 是不可通行区域。
- `crowdZones.level` 建议范围为 `0-3`。
- 算法可基于 `blockedZones`、`crowdZones` 和起终点生成避让路线。

## 9. 路径规划算法输出

响应：

```json
{
  "requestId": "plan_20260610_0001",
  "status": "ok",
  "route": {
    "distanceM": 86.5,
    "etaSec": 72,
    "polyline": [
      { "x": -1.2, "y": 2.7 },
      { "x": 1.4, "y": 3.0 },
      { "x": 4.9, "y": 3.6 },
      { "x": 6.3, "y": 3.6 }
    ]
  },
  "assignments": [
    {
      "coneId": "cone_01",
      "mode": "GUIDE_RIGHT_ARROW",
      "arrow": "right",
      "ledColor": "#facc15",
      "audio": "off"
    },
    {
      "coneId": "cone_04",
      "mode": "BLOCK_RED",
      "arrow": "none",
      "ledColor": "#dc2626",
      "audio": "urgent"
    }
  ]
}
```

网关收到 `assignments` 后，应转换为第 4 节的 `commands`，再拆成第 5 节的 ESP32 单设备命令。

## 10. WebSocket 事件格式

前端连接：

```text
./ws
```

前端会将相对地址按当前页面文件夹自动解析为 `ws://当前主机/当前文件夹/ws` 或 `wss://当前主机/当前文件夹/ws`。如果网关单独部署，也可以直接配置为完整地址，例如 `ws://192.168.1.20:8080/ws`。

通用包格式：

```json
{
  "type": "event.name",
  "requestId": "optional",
  "payload": {}
}
```

事件类型：

| type | 方向 | 说明 |
| --- | --- | --- |
| `cluster.command` | 前端 -> 网关 | 下发集群命令 |
| `cone.move.command` | 前端 -> 网关 | 地图拖拽路锥后下发目标经纬度 |
| `cluster.ack` | 网关 -> 前端 | 返回批量 ACK |
| `cone.status` | 网关 -> 前端 | 推送设备状态 |
| `planner.request` | 前端 -> 算法 | 请求路径规划 |
| `planner.response` | 算法 -> 前端 | 返回规划结果 |
| `gateway.status` | 网关 -> 前端 | 网关在线、延迟、链路数 |
| `uwb.raw` | 网关 -> 前端/算法 | BU04 解析后的原始测距/方位数据 |
| `uwb.position` | 网关 -> 前端/算法 | BU03 标签对应路锥的实时坐标 |
| `uwb.status` | 网关 -> 前端 | UWB 基站、标签在线状态 |
| `gps.position` | 网关 -> 前端/算法 | 路锥 GPS 定位结果，坐标已转为 GCJ-02 |
| `fused.position` | 网关 -> 前端/算法 | UWB + GPS 融合后的地图坐标 |
| `imu.raw` | 网关 -> 前端 | MPU/IMU6050 姿态或原始加速度角速度 |
| `tilt.status` | 网关 -> 前端 | 网关判定后的倾倒状态 |
| `cone.telemetry` | 网关 -> 前端 | 单个路锥完整遥测包，推荐前端优先使用 |
| `calibration.status` | 网关 -> 前端 | UWB 地图对齐或 IMU 零偏标定状态 |
| `route.plan` / `route.guide` | 算法/网关 -> 前端 | 路径规划覆盖层与路锥引导任务 |

## 11. 错误响应

```json
{
  "requestId": "cmd_20260610_0001",
  "status": "error",
  "code": "INVALID_MODE",
  "message": "unknown mode: GUIDE_UP"
}
```

错误码：

| code | 说明 |
| --- | --- |
| `INVALID_JSON` | JSON 解析失败 |
| `INVALID_MODE` | 未知模式 |
| `DEVICE_OFFLINE` | 设备离线 |
| `GATEWAY_OFFLINE` | 网关离线 |
| `PLANNER_FAILED` | 路径规划失败 |
| `TIMEOUT` | 超时 |

## 12. ESP32 对接建议

ESP32 推荐依赖：

- WiFi
- PubSubClient 或 AsyncMqttClient
- ArduinoJson
- FastLED 或 NeoPixel LED 库

ESP32 端最小逻辑：

1. 连接 WiFi。
2. 连接 MQTT Broker。
3. 订阅 `smartcone/cmd/{deviceId}`。
4. 收到 JSON 后解析 `seq`、`mode`、`ledColor`、`blink`、`audio`、`arrow`。
5. 执行灯光、蜂鸣器、箭头显示。
6. 发布 `smartcone/ack/{deviceId}`。
7. 定时发布 `smartcone/status/{deviceId}`。

## 13. 最小联调顺序

1. 先让 ESP32 固定订阅 `smartcone/cmd/cone_01`。
2. 用 MQTTX 或 Mosquitto 手动发布单设备命令。
3. 确认 ESP32 LED / 蜂鸣器 / 箭头执行正确。
4. 让 ESP32 发布 ACK。
5. 写本地网关，把集群命令拆成多个 MQTT topic。
6. 接入前端 demo 的 JSON 指令。
7. 最后接入路径规划算法。

## 14. UWB 硬件角色约定

本项目 UWB 定位采用以下角色：

| 硬件 | 角色 | 安装位置 | 作用 |
| --- | --- | --- | --- |
| `BU04` | UWB 基站 Anchor | 固定安装在体育馆入口、道路两侧或高点 | 提供固定坐标参考，接收/计算标签距离、角度或位置 |
| `BU03` | UWB 标签 Tag | 安装在每个智能路锥内部 | 绑定路锥 ID，提供路锥实时位置 |
| ESP32 | 路锥主控 | 智能路锥内部 | 执行声光命令，读取 BU03 或接收网关定位结果 |
| 本地网关 | 定位解析与协议转换 | 管理端电脑或边缘设备 | 读取 BU04 串口/USB 数据，转换为统一定位接口 |

推荐编号：

```json
{
  "anchors": [
    { "anchorId": "uwb_anchor_01", "hardware": "BU04", "role": "anchor" },
    { "anchorId": "uwb_anchor_02", "hardware": "BU04", "role": "anchor" },
    { "anchorId": "uwb_anchor_03", "hardware": "BU04", "role": "anchor" }
  ],
  "tags": [
    { "tagId": "uwb_tag_01", "hardware": "BU03", "coneId": "cone_01" },
    { "tagId": "uwb_tag_02", "hardware": "BU03", "coneId": "cone_02" }
  ]
}
```

说明：

- 如果只用 1 个 BU04 双天线基站，可做测距/方位演示，输出距离与角度，再由网关换算近似坐标。
- 如果使用 3 个及以上 BU04 基站，推荐输出二维坐标，路径规划算法可以直接使用。
- `coneId` 是业务 ID，`tagId` 是 UWB 标签 ID，二者需要在网关中绑定。

推荐接法：

```text
BU03 标签安装在路锥上，只负责被 BU04 基站定位。
BU04 基站通过 USB / TTL 接入本地网关。
ESP32 不直接计算 UWB 坐标，只接收网关下发的声光控制命令。
```

可选接法：

```text
如果 BU03 与 ESP32 通过串口连接，ESP32 可把本机 UWB 标签 ID 或测距数据随 status 上报。
但路径规划仍建议使用网关归一化后的 uwb.position，而不是直接读 ESP32 原始数据。
```

## 15. UWB 基站配置接口

用途：配置 BU04 基站固定坐标。

HTTP：

```text
POST /api/uwb/anchors
Content-Type: application/json
```

请求体：

```json
{
  "mapFrame": "cqu_huxi_local_v1",
  "anchors": [
    {
      "anchorId": "uwb_anchor_01",
      "hardware": "BU04",
      "serialPort": "COM5",
      "baudRate": 115200,
      "position": {
        "x": 0.0,
        "y": 0.0,
        "z": 2.2
      },
      "yawDeg": 0
    },
    {
      "anchorId": "uwb_anchor_02",
      "hardware": "BU04",
      "serialPort": "COM6",
      "baudRate": 115200,
      "position": {
        "x": 8.0,
        "y": 0.0,
        "z": 2.2
      },
      "yawDeg": 0
    },
    {
      "anchorId": "uwb_anchor_03",
      "hardware": "BU04",
      "serialPort": "COM7",
      "baudRate": 115200,
      "position": {
        "x": 4.0,
        "y": 6.0,
        "z": 2.2
      },
      "yawDeg": 0
    }
  ]
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `anchorId` | string | 是 | BU04 基站 ID |
| `hardware` | string | 是 | 固定为 `BU04` |
| `serialPort` | string | 否 | 网关读取基站数据的串口 |
| `baudRate` | number | 否 | 串口波特率，按实际固件配置 |
| `position.x/y/z` | number | 是 | 基站在本地坐标系下的位置，单位 m |
| `yawDeg` | number | 否 | 基站朝向角，PDOA/角度定位时使用 |

响应：

```json
{
  "status": "ok",
  "mapFrame": "cqu_huxi_local_v1",
  "anchorCount": 3
}
```

## 16. UWB 标签与路锥绑定接口

用途：把 BU03 标签 ID 绑定到业务路锥 ID。

HTTP：

```text
POST /api/uwb/tag-map
Content-Type: application/json
```

请求体：

```json
{
  "bindings": [
    {
      "tagId": "uwb_tag_01",
      "hardware": "BU03",
      "coneId": "cone_01",
      "mount": "inside_cone_body"
    },
    {
      "tagId": "uwb_tag_02",
      "hardware": "BU03",
      "coneId": "cone_02",
      "mount": "inside_cone_body"
    }
  ]
}
```

响应：

```json
{
  "status": "ok",
  "bindingCount": 2
}
```

## 17. BU04 到网关：UWB 原始定位数据

用途：网关从 BU04 串口/USB 读取原始定位结果后，先转换成统一 JSON。  
注意：不同固件的串口输出格式可能不同，网关内部需要写 parser；业务层统一使用下面的标准格式。

### 17.0 串口接入约定

BU04 基站接入网关时，建议由网关独立维护串口配置：

```json
{
  "device": "BU04",
  "anchorId": "uwb_anchor_01",
  "serial": {
    "port": "COM5",
    "baudRate": 115200,
    "dataBits": 8,
    "stopBits": 1,
    "parity": "none"
  },
  "parser": {
    "type": "vendor_text_or_binary",
    "output": "normalized_json"
  }
}
```

处理原则：

- BU04 原始串口帧只在网关内部解析。
- 前端、路径规划算法、ESP32 不直接依赖 BU04 厂家原始帧。
- 网关把原始帧统一转换成 `uwb.raw` 或 `uwb.position`。
- 如果固件输出的是距离和角度，转换为 `uwb.raw`。
- 如果固件或网关已经解算出坐标，转换为 `uwb.position`。

### 17.1 单基站测距/方位格式

适合：1 个 BU04 基站 + 多个 BU03 标签，演示距离、方向和大致位置。

```json
{
  "type": "uwb.raw",
  "anchorId": "uwb_anchor_01",
  "tagId": "uwb_tag_01",
  "hardware": {
    "anchor": "BU04",
    "tag": "BU03"
  },
  "seq": 256,
  "rangeM": 4.82,
  "aoaDeg": 37.5,
  "rssi": -68,
  "quality": 0.86,
  "timestamp": 1781073000000
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `anchorId` | string | BU04 基站 ID |
| `tagId` | string | BU03 标签 ID |
| `rangeM` | number | 基站到标签距离，单位 m |
| `aoaDeg` | number | 到达角/方位角，单位度 |
| `rssi` | number | 信号强度 |
| `quality` | number | 定位质量，建议范围 `0-1` |
| `timestamp` | number | 毫秒时间戳 |

### 17.2 多基站二维定位格式

适合：3 个及以上 BU04 基站 + BU03 标签，输出二维/三维坐标。

```json
{
  "type": "uwb.position",
  "mapFrame": "cqu_huxi_local_v1",
  "tagId": "uwb_tag_01",
  "coneId": "cone_01",
  "position": {
    "lng": 106.301305,
    "lat": 29.609625,
    "accuracyM": 0.18,
    "source": "uwb",
    "stale": false
  },
  "accuracyM": 0.18,
  "quality": 0.91,
  "anchorsUsed": [
    "uwb_anchor_01",
    "uwb_anchor_02",
    "uwb_anchor_03"
  ],
  "timestamp": 1781073000000
}
```

## 18. 网关发布 UWB 定位结果

推荐 MQTT topic：

```text
smartcone/uwb/tag/{tagId}
smartcone/uwb/cone/{coneId}
```

示例：

```text
smartcone/uwb/cone/cone_01
```

Payload：

```json
{
  "coneId": "cone_01",
  "tagId": "uwb_tag_01",
  "source": "BU04_BU03_UWB",
  "mapFrame": "cqu_huxi_local_v1",
  "position": {
    "lng": 106.301305,
    "lat": 29.609625,
    "accuracyM": 0.15,
    "source": "uwb_gps_fused",
    "stale": false
  },
  "accuracyM": 0.15,
  "quality": 0.91,
  "online": true,
  "timestamp": 1781073000000
}
```

前端 WebSocket 推送：

```json
{
  "type": "uwb.position",
  "payload": {
    "coneId": "cone_01",
    "tagId": "uwb_tag_01",
    "position": {
      "lng": 106.301305,
      "lat": 29.609625,
      "accuracyM": 0.18,
      "source": "uwb",
      "stale": false
    },
    "accuracyM": 0.18,
    "quality": 0.91,
    "timestamp": 1781073000000
  }
}
```

## 19. 路锥状态中加入 UWB 字段

第 7 节的 `smartcone/status/{deviceId}` 可以扩展为：

```json
{
  "id": "cone_01",
  "online": true,
  "battery": 86,
  "rssi": -61,
  "mode": "STANDBY_DIM",
  "fallen": false,
  "crowdLevel": 0,
  "position": {
    "x": 3.42,
    "y": 2.18
  },
  "uwb": {
    "enabled": true,
    "tagId": "uwb_tag_01",
    "hardware": "BU03",
    "source": "BU04_BU03_UWB",
    "accuracyM": 0.15,
    "quality": 0.91,
    "lastUpdate": 1781073000000
  },
  "timestamp": 1781073000000
}
```

## 20. 路径规划算法中的 UWB 输入

路径规划算法输入中的 `cones` 建议增加 `uwb` 字段：

```json
{
  "id": "cone_01",
  "position": {
    "x": 3.42,
    "y": 2.18
  },
  "battery": 86,
  "online": true,
  "mode": "STANDBY_DIM",
  "uwb": {
    "tagId": "uwb_tag_01",
    "accuracyM": 0.15,
    "quality": 0.91,
    "source": "BU04_BU03_UWB"
  }
}
```

算法使用建议：

- `quality < 0.5` 时，不建议直接采用该位置，应使用上一帧位置或人工标定位置。
- `accuracyM > 0.5` 时，可降级为“区域级定位”，不要用于精细路径规划。
- 标签离线超过 3 秒时，路锥位置标记为 stale。

UWB 到路径规划的数据流：

```text
BU03 标签随路锥移动
        |
        | UWB 信号
        v
BU04 基站接收测距/方位/定位数据
        |
        | USB / TTL 串口
        v
本地网关解析并绑定 tagId -> coneId
        |
        | uwb.position
        v
前端刷新路锥位置 / 路径规划算法读取 cones[].position
```

## 21. UWB 网关状态接口

HTTP：

```text
GET /api/uwb/status
```

响应：

```json
{
  "status": "ok",
  "mapFrame": "cqu_huxi_local_v1",
  "anchors": [
    {
      "anchorId": "uwb_anchor_01",
      "hardware": "BU04",
      "online": true,
      "serialPort": "COM5",
      "lastUpdate": 1781073000000
    }
  ],
  "tags": [
    {
      "tagId": "uwb_tag_01",
      "hardware": "BU03",
      "coneId": "cone_01",
      "online": true,
      "accuracyM": 0.15,
      "quality": 0.91,
      "lastUpdate": 1781073000000
    }
  ]
}
```

## 22. UWB 联调顺序

1. 先只接 1 个 BU04 基站和 1 个 BU03 标签，确认串口能输出测距数据。
2. 在网关里写 BU04 串口 parser，把原始串口内容转换成 `uwb.raw`。
3. 配置 `tagId -> coneId` 绑定关系。
4. 如果有 3 个及以上 BU04 基站，配置基站坐标并输出 `uwb.position`。
5. 把 `uwb.position` 发布到 `smartcone/uwb/cone/{coneId}`。
6. 前端订阅 `uwb.position`，实时刷新路锥位置。
7. 路径规划算法读取带 UWB 字段的 `cones`，用实时位置规划绕行路线。
8. 算法输出 `assignments`，网关再转换成 ESP32 单设备命令。

## 23. UWB 数据质量建议

| 指标 | 建议阈值 | 处理方式 |
| --- | --- | --- |
| `quality >= 0.8` | 高质量 | 直接用于路径规划 |
| `0.5 <= quality < 0.8` | 中等质量 | 可用于显示，路径规划需平滑 |
| `quality < 0.5` | 低质量 | 不直接用于规划 |
| `accuracyM <= 0.3` | 精细定位 | 可用于路锥自动布设判断 |
| `accuracyM > 0.5` | 粗定位 | 只用于区域提示 |
| `lastUpdate > 3000ms` | 数据过期 | 标记为 stale |

## 24. UWB 参考资料

- 安信可 UWB 系列模组专题：BU03/BU04 基于 DW3000 系列，支持双向测距、TDOA/PDOA 定位，BU04 为双天线 UWB 模组。
- 安信可 BU03-Kit 使用指南：BU03 可通过基站编号、标签编号和上位机配置进行定位测试。
- BU04 测距/定位测试资料：BU04 可作为基站，通过 USB/TTL 与上位机交互，并可进行测距、PDOA 方位定位演示。

## 25. 真实 2D 地图前端配置

`index.html` 读取项目根目录的 `config.local.js`。该文件不建议提交到公开仓库，可参考 `config.example.js`。

```json
{
  "amap": {
    "key": "YOUR_AMAP_WEB_JS_KEY",
    "securityJsCode": "YOUR_AMAP_SECURITY_JS_CODE",
    "version": "2.0",
    "plugins": ["AMap.Scale", "AMap.ToolBar", "AMap.Geocoder"]
  },
  "gateway": {
    "wsUrl": "./ws",
    "httpBaseUrl": "./api"
  },
  "scene": {
    "name": "重庆大学虎溪校区体育馆周边道路",
    "sceneCenterQuery": "重庆大学虎溪校区体育馆",
    "fallbackCenter": [106.30172, 29.60942],
    "zoom": 18
  },
  "devices": [
    {
      "coneId": "cone_01",
      "label": "C1",
      "uwbTagId": "uwb_tag_01",
      "gpsDeviceId": "gps_cone_01",
      "defaultPosition": [106.3013, 29.60962]
    }
  ]
}
```

约定：

- 前端地图坐标统一使用 GCJ-02。
- 网关负责把 GPS WGS84 转为 GCJ-02。
- 网关负责把 UWB 本地坐标通过标定点转换到地图坐标。
- 前端只做展示，不在浏览器里计算融合定位和倾倒判定。

## 26. GPS 定位事件

WebSocket：

```json
{
  "type": "gps.position",
  "payload": {
    "coneId": "cone_01",
    "deviceId": "gps_cone_01",
    "coordSys": "GCJ-02",
    "position": {
      "lng": 106.301301,
      "lat": 29.609622
    },
    "accuracyM": 1.8,
    "hdop": 0.9,
    "satellites": 12,
    "stale": false,
    "timestamp": 1781073000000
  }
}
```

处理要求：

- `coordSys` 推给前端时必须为 `GCJ-02`。
- `accuracyM > 5` 或 `hdop > 2.5` 时，前端可展示但路径规划应降权。
- GPS 超过 3 秒未更新时，网关应将 `stale` 置为 `true`。

## 27. UWB + GPS 融合定位事件

推荐由网关输出 `fused.position`，也可以直接包含在 `cone.telemetry.position` 中。

```json
{
  "type": "fused.position",
  "payload": {
    "coneId": "cone_01",
    "mapFrame": "gcj02_cqu_huxi_v1",
    "position": {
      "lng": 106.301305,
      "lat": 29.609625,
      "accuracyM": 0.45,
      "source": "uwb_gps_fused",
      "stale": false
    },
    "uwb": {
      "tagId": "uwb_tag_01",
      "quality": 0.91,
      "accuracyM": 0.18,
      "anchorsUsed": ["uwb_anchor_01", "uwb_anchor_02", "uwb_anchor_03"]
    },
    "gps": {
      "deviceId": "gps_cone_01",
      "accuracyM": 1.8,
      "hdop": 0.9
    },
    "fusion": {
      "algorithm": "quality_weighted_v1",
      "uwbWeight": 0.78,
      "gpsWeight": 0.22,
      "reason": "uwb_high_quality"
    },
    "timestamp": 1781073000000
  }
}
```

第一版融合建议：

- UWB `quality >= 0.8` 且 `accuracyM <= 0.5` 时，以 UWB 为主，GPS 用于地图漂移约束。
- UWB 质量下降或基站数量不足时，提高 GPS 权重。
- GPS 失效时，短时间使用 UWB 位置；UWB 失效时，使用 GPS 粗定位并标记低精度。
- 两个来源都过期时，保持最后一次位置并将 `position.stale` 置为 `true`。

## 28. IMU6050 原始姿态与倾倒状态

ESP32 或网关可先发布 IMU 原始姿态：

```json
{
  "type": "imu.raw",
  "payload": {
    "coneId": "cone_02",
    "sensor": "MPU6050",
    "ax": 0.02,
    "ay": -0.11,
    "az": 0.98,
    "gx": 0.4,
    "gy": -0.2,
    "gz": 0.1,
    "rollDeg": 3.2,
    "pitchDeg": -1.8,
    "yawDeg": 12.5,
    "calibrated": true,
    "timestamp": 1781073000000
  }
}
```

倾倒判定由网关输出：

```json
{
  "type": "tilt.status",
  "payload": {
    "coneId": "cone_02",
    "fallen": true,
    "angleDeg": 76.4,
    "thresholdDeg": 55,
    "debounceMs": 600,
    "calibration": "zero_bias_ok",
    "timestamp": 1781073000000
  }
}
```

判定建议：

- 开机或放正后进行零偏标定，记录静止状态下的 roll/pitch 基准。
- 标定后使用绝对 roll 或 pitch 与基准的偏差角判断倾倒。
- 推荐阈值：`55°`，去抖时间：`600 ms`。
- 前端不重复计算 `fallen`，只展示网关判断结果。

## 29. 单路锥完整遥测包

前端推荐优先消费 `cone.telemetry`，因为它能一次刷新地图位置、UWB/GPS 质量、IMU 和倾倒状态。

```json
{
  "type": "cone.telemetry",
  "payload": {
    "coneId": "cone_01",
    "ts": 1781073000000,
    "mode": "STANDBY_DIM",
    "online": true,
    "battery": 86,
    "position": {
      "lng": 106.301305,
      "lat": 29.609625,
      "accuracyM": 0.45,
      "source": "uwb_gps_fused",
      "stale": false
    },
    "uwb": {
      "tagId": "uwb_tag_01",
      "quality": 0.91,
      "accuracyM": 0.18,
      "anchorsUsed": ["uwb_anchor_01", "uwb_anchor_02", "uwb_anchor_03"],
      "stale": false
    },
    "gps": {
      "deviceId": "gps_cone_01",
      "coordSys": "GCJ-02",
      "accuracyM": 1.8,
      "hdop": 0.9,
      "stale": false
    },
    "imu": {
      "rollDeg": 2.1,
      "pitchDeg": -1.4,
      "yawDeg": 15.2,
      "calibrated": true
    },
    "tilt": {
      "fallen": false,
      "angleDeg": 2.1,
      "thresholdDeg": 55,
      "debounceMs": 600,
      "calibration": "zero_bias_ok"
    },
    "health": {
      "stale": false,
      "lastSeenMs": 1781073000000
    }
  }
}
```

前端显示策略：

- `tilt.fallen = true`：地图路锥变红并旋转，右侧详情显示倾倒。
- `position.accuracyM`：显示为地图精度圈半径。
- `health.stale = true` 或超过 8 秒未收到数据：标记离线/过期。
- `mode` 可继续使用第 3 节枚举。

## 30. UWB 地图对齐与 IMU 标定状态

UWB 本地坐标要落到真实地图，需要一次性标定。推荐在场地选 2-3 个已知点，同时记录本地 UWB 坐标和地图 GCJ-02 坐标。

```json
{
  "type": "calibration.status",
  "payload": {
    "mapFrame": "gcj02_cqu_huxi_v1",
    "uwbFrame": "cqu_huxi_local_v1",
    "status": "ok",
    "points": [
      {
        "name": "体育馆东侧入口",
        "uwb": { "x": 0.0, "y": 0.0 },
        "map": { "lng": 106.3013, "lat": 29.60962 }
      },
      {
        "name": "体育馆南侧道路",
        "uwb": { "x": 18.2, "y": -7.6 },
        "map": { "lng": 106.30208, "lat": 29.60935 }
      }
    ],
    "rmsErrorM": 0.42,
    "timestamp": 1781073000000
  }
}
```

IMU 标定建议：

- 每个路锥开机静置 2-3 秒，采集均值作为零偏。
- 如果路锥上电时已倾斜，应返回 `calibration: "need_reset"`，前端显示未校准。
- 网关应把标定结果写入 `tilt.calibration` 或 `imu.calibrated`。

## 31. 路径规划覆盖层预留接口

当前 2D 前端已预留 `route.plan` / `route.guide` 显示路线覆盖层。

```json
{
  "type": "route.plan",
  "payload": {
    "requestId": "plan_20260615_0001",
    "route": {
      "distanceM": 86.5,
      "etaSec": 72,
      "polyline": [
        { "lng": 106.3012, "lat": 29.6097 },
        { "lng": 106.3017, "lat": 29.6095 },
        { "lng": 106.3022, "lat": 29.6093 }
      ]
    },
    "assignments": [
      {
        "coneId": "cone_01",
        "mode": "GUIDE_RIGHT_ARROW",
        "arrow": "right",
        "ledColor": "#facc15"
      }
    ]
  }
}
```

约定：

- 路线点使用 GCJ-02 `lng/lat`。
- 规划算法需要本地米制坐标时，由网关维护 `mapFrame` 与 `uwbFrame` 的转换。
- 前端只画路线和更新路锥模式，不直接参与路径搜索。

## 32. 地图拖拽目标点控制接口

2D 前端支持直接拖动地图上的路锥图标。拖拽结束时，前端会把拖拽后的地图经纬度作为目标点下发给网关，消息类型为 `cone.move.command`。

WebSocket：

```json
{
  "type": "cone.move.command",
  "requestId": "move_1781073000000_cone_01",
  "payload": {
    "coneId": "cone_01",
    "target": {
      "lng": 106.293206,
      "lat": 29.593974,
      "coordSys": "GCJ-02"
    },
    "source": "frontend_drag",
    "issuedAt": "2026-06-16T09:30:00.000Z",
    "mode": "STANDBY_DIM",
    "ttlMs": 10000
  }
}
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `requestId` | string | 是 | 本次拖拽指令 ID，用于 ACK 和日志追踪 |
| `payload.coneId` | string | 是 | 目标路锥 ID |
| `payload.target.lng` | number | 是 | 目标经度，GCJ-02 |
| `payload.target.lat` | number | 是 | 目标纬度，GCJ-02 |
| `payload.target.coordSys` | string | 是 | 当前固定为 `GCJ-02` |
| `payload.source` | string | 是 | 固定为 `frontend_drag`，表示来自地图拖拽 |
| `payload.mode` | string | 否 | 拖拽时路锥当前工作模式，网关可按需保留 |
| `payload.ttlMs` | number | 是 | 指令有效时间，超时未执行应丢弃 |

网关处理建议：

1. 校验 `coneId` 是否在线，以及目标点是否在允许活动区域内。
2. 如执行机构使用 UWB 本地坐标，网关负责把 GCJ-02 目标点转换为 UWB/mapFrame 米制坐标。
3. 如接入路径规划算法，网关把目标点转成移动任务，由算法返回可达路径或不可达原因。
4. 如当前路锥不具备自动移动能力，网关可以把该消息作为“人工摆放目标点”任务，并在管理端返回 ACK。
5. 执行后继续通过 `cone.telemetry` 或 `fused.position` 上报真实融合定位，前端以网关遥测结果为最终位置来源。

ACK 示例：

```json
{
  "type": "cluster.ack",
  "requestId": "move_1781073000000_cone_01",
  "payload": {
    "coneId": "cone_01",
    "status": "accepted",
    "message": "move target accepted"
  }
}
```
