from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any
import json

app = FastAPI(title="路锥集群极简协调上位机")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                print(f"广播给客户端失败: {e}")

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    处理前端的 WebSocket 连接，接收诸如指令或控制包
    """
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            print(f"[WebSocket] 收到前端发来的数据: {data}")
            # 此处已打通接收到了如 {"type": "cone.move.command", ...} 的包。
    except WebSocketDisconnect:
        print("[WebSocket] 前端断开连接")
        manager.disconnect(websocket)

@app.post("/api/hardware/gps")
async def receive_hardware_gps(data: Dict[str, Any]):
    """
    预留给真实硬件(或本地网关的其他服务)的极简调用口
    要求提供的数据体例如:
    {
       "coneId": "cone_01",
       "lng": 106.29302,
       "lat": 29.59386
    }
    """
    if "coneId" not in data or "lng" not in data or "lat" not in data:
        return {"error": "缺少必要参数: coneId, lng, lat", "status": "failed"}

    # 封装备有 gps.position 包结构供前端渲染
    frontend_message = {
        "type": "gps.position",
        "payload": data
    }
    
    # 向所有连接的前端广播
    await manager.broadcast(json.dumps(frontend_message))
    
    return {"status": "success", "forwarded": True, "data": data}

@app.post("/api/cluster/command")
async def cluster_command(data: Dict[str, Any]):
    """
    预留给前端发送集群控制命令的 HTTP 接口。
    用于后期扩展状态控制、模式切换等功能。
    """
    print(f"[HTTP] 收到集群控制指令: {data}")
    return {"status": "accepted", "message": "cluster command accepted"}

if __name__ == "__main__":
    import uvicorn
    # 为了方便测试，直接 `python main.py` 也能运行
    uvicorn.run("main:app", host="0.0.0.0", port=8080, log_level="info", reload=True)