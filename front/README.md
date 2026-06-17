# 智能路锥集群管理演示系统

这是面向答辩和联调的智能路锥演示系统，支持重庆大学虎溪校区交叉创新中心周边道路的真实地图展示、模拟数据回放和本地上位机实时接入。

## 当前定位口径

当前 GPS / UWB 硬件不可用，因此本版本不做 UWB+GPS 融合定位。前端地图主位置只读取上位机推送的 `cone.telemetry.payload.position`。

上位机或调试端只需要提供最终 GCJ-02 经纬度：

```json
{
  "type": "telemetry",
  "coneId": "cone_01",
  "lng": 106.293186,
  "lat": 29.593694,
  "accuracy": 1.0
}
```

上位机会包装成前端使用的 `cone.telemetry`。`gps.position`、`uwb.position`、`fused.position` 当前不作为地图定位来源。

## 运行方式

直接用浏览器打开：

```text
smart-cone-demo/index.html
```

上位机项目内打开：

```text
front/index.html
```

真实数据模式连接：

```text
ws://localhost:8080/ws
```

## 当前功能

- 高德地图真实 2D 场景
- 两只智能路锥的地图标记
- 上位机最终坐标实时展示
- IMU6050 倾倒状态展示
- 拖动地图路锥图标生成目标经纬度控制指令
- 真实数据 / 模拟数据切换
- 本地上位机 WebSocket 接入
- 事件日志与告警弹窗
- 3D 数字孪生演示页

## 建议演示顺序

1. 先用“模拟数据”确认地图、日志、告警和拖拽指令正常。
2. 切换到“真实数据”，连接本地上位机 WebSocket。
3. 上位机发送 `cone.telemetry` 后，前端地图会更新锥桶位置。
4. 拖动任意锥桶，前端发送 `cone.move.command` 给上位机。
5. 上位机规划路径并继续通过 `cone.telemetry` 回传最终位置。

接口合同见：

```text
front/docs/frontend-gateway-contract.json
```
