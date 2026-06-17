# 智能路锥集群演示

仓库按功能分成三块：

- `frontend/`：2D 真实地图和 3D 演示前端
- `gateway/`：上位机，负责 TCP 接入、路径规划和 WebSocket 下发
- `simulator/`：下位机模拟器
- `docs/`：接口合同和说明文档

## 运行

1. 启动上位机：

```bash
cd gateway
python main.py
```

2. 启动模拟器：

```bash
cd simulator
python simulator.py --fast
```

3. 打开前端：

```text
frontend/index.html
```

## 说明

- 当前版本前端主位置只读取 `cone.telemetry.payload.position`
- GPS / UWB 不参与定位融合
- 拖动锥桶会向上位机发送 `cone.move.command`
