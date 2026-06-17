window.SMART_CONE_CONFIG = {
  amap: {
    key: "b62988f5dbf038436c72e383e5169abf",
    securityJsCode: "818e14cc0255b621567ee6d0bcb23709",
    version: "2.0",
    plugins: ["AMap.Scale", "AMap.ToolBar", "AMap.Geocoder"]
  },
  gateway: {
    wsUrl: "ws://127.0.0.1:8080/ws",
    httpBaseUrl: "http://127.0.0.1:8080/api"
  },
  scene: {
    name: "重庆大学虎溪校区交叉创新中心",
    sceneCenterQuery: "重庆大学虎溪校区学生交叉创新中心",
    fallbackCenter: [106.293186, 29.593694],
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
