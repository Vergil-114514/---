# 智能路锥集群演示

仓库按原项目结构分成三块：

- `front/`：前端，包含 2D 真实地图、3D 演示、配置示例和接口文档
- `up/`：上位机，负责 TCP 接入、路径规划、状态包装和 WebSocket 下发
- `down/`：下位机模拟器，用于模拟锥桶回传位置、IMU 和执行拖拽目标

## 运行

1. 启动上位机：

```bash
cd up
python main.py
```

2. 启动模拟器：

```bash
cd down
python simulator.py --fast
```

3. 打开前端：

```text
front/index.html
```

## 说明

- 当前版本前端主位置只读取 `cone.telemetry.payload.position`
- GPS / UWB 不参与定位融合
- 拖动锥桶会向上位机发送 `cone.move.command`
- 前端与上位机对接数据合同见 `front/docs/frontend-gateway-contract.json`
