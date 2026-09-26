/* ============================================================
 * GTA 上海像素城 · 全局配置与12行政区地图配置
 * 地图采用「布局还原、面积压缩」策略：
 * 每个行政区一张 400x400 格独立小地图（1格≈8px），
 * 地标/水域/道路关系按真实上海位置布局，面积按玩法压缩。
 * ============================================================ */
const CONFIG = {
  TILE: 8,             // 每格像素
  MAP_W: 400,          // 地图宽（格）
  MAP_H: 400,          // 地图高（格）
  START_MAP: 'huangpu',
  START_POS: { x: 250, y: 226 },

  TILES: {             // 瓦片类型
    GROUND: 0,         // 人行道/空地
    ROAD: 1,           // 道路
    ROAD_MARK: 2,      // 道路中线
    BUILDING: 3,       // 普通建筑
    WATER: 4,          // 水域
    GRASS: 5,          // 绿地
    LANDMARK: 6,       // 地标建筑
    BRIDGE: 7          // 桥梁
  },

  // 速度（格/秒）
  WALK: 4.5,
  RUN: 7,
  CAR_MIN: 8,
  CAR_MAX: 20,

  // 产业类型定义
  BUSINESS_TYPES: {
    shop:    { name: '便利店',   icon: '🏪', price: 5000,  income: 5,  desc: '稳定的小额日营收' },
    gas:     { name: '加油站',   icon: '⛽', price: 12000, income: 12, desc: '能源生意，收益中等' },
    garage:  { name: '改装车行', icon: '🔧', price: 20000, income: 20, desc: '修车改装，客源稳定' },
    freight: { name: '货运站',   icon: '🚚', price: 15000, income: 16, desc: '物流收入，周期短' },
    club:    { name: '夜店',     icon: '🎵', price: 30000, income: 30, desc: '高投入高回报' },
    gym:     { name: '健身房',   icon: '🏋', price: 8000,  income: 8,  desc: '社区生意，回报稳' }
  },

  // 任务类型
  TASK_TYPES: {
    delivery: { name: '货运配送', desc: '把货物按时送到指定地点', reward: 1500, time: 90 },
    escort:   { name: '安保押运', desc: '护送运钞车安全抵达金库', reward: 3000, time: 120 },
    race:     { name: '街头竞速', desc: '和对手赛车，率先到达终点', reward: 2000, time: 60 }
  }
};

/* ---------------- 各区地图配置 ---------------- */
/* 坐标系统：x向右，y向下。地图400x400格。
 * water: 矩形水域 {x,y,w,h}；road: {gap, sub} 主/次路网格间距
 * landmarks: 地标 [{name, x, y, color}]  位置为地标中心(格)
 * businesses: 产业 [{id, type, x, y}]
 * tasks: 任务点 [{type, x, y}]
 * police: 警察局坐标 [{x, y}]
 * transfer: 地铁枢纽(传送点) [{x, y, label}]
 * spawn: 出生点 {x, y}
 */
const MAPS = {
  /* ---------- 浦西 · 北部 ---------- */
  yangpu: {
    id: 'yangpu', name: '杨浦', intro: '大学云集 · 五角场商圈',
    road: { main: 56, sub: 28, off: 8 },
    water: [
      { x: 0, y: 378, w: 400, h: 22 },   // 南侧黄浦江
      { x: 386, y: 330, w: 14, h: 70 }   // 东侧拐角江
    ],
    landmarks: [
      { name: '五角场', x: 200, y: 170, color: '#e67e22' },
      { name: '复旦大学', x: 120, y: 130, color: '#8e44ad' },
      { name: '同济大学', x: 250, y: 200, color: '#2980b9' },
      { name: '江湾体育场', x: 180, y: 225, color: '#27ae60' },
      { name: '杨浦大桥', x: 362, y: 352, color: '#c0392b' },
      { name: '共青森林公园', x: 330, y: 70, color: '#2ecc71' }
    ],
    businesses: [
      { id: 'yp1', type: 'shop', x: 160, y: 300 },
      { id: 'yp2', type: 'gas', x: 320, y: 300 },
      { id: 'yp3', type: 'garage', x: 60, y: 200 },
      { id: 'yp4', type: 'freight', x: 300, y: 120 }
    ],
    tasks: [
      { type: 'delivery', x: 100, y: 310 },
      { type: 'race', x: 280, y: 260 }
    ],
    police: [ { x: 120, y: 360 } ],
    transfer: [ { x: 100, y: 370, label: '地铁 · 杨浦站' } ],
    spawn: { x: 200, y: 170 }
  },

  hongkou: {
    id: 'hongkou', name: '虹口', intro: '北外滩 · 老城记忆',
    road: { main: 56, sub: 28, off: 16 },
    water: [ { x: 0, y: 378, w: 400, h: 22 } ],
    landmarks: [
      { name: '北外滩', x: 200, y: 350, color: '#d35400' },
      { name: '四川北路', x: 150, y: 250, color: '#e67e22' },
      { name: '鲁迅公园', x: 120, y: 110, color: '#2ecc71' },
      { name: '虹口足球场', x: 130, y: 150, color: '#2980b9' },
      { name: '多伦路', x: 160, y: 220, color: '#8e44ad' }
    ],
    businesses: [
      { id: 'hk1', type: 'shop', x: 320, y: 300 },
      { id: 'hk2', type: 'club', x: 240, y: 340 },
      { id: 'hk3', type: 'gym', x: 60, y: 160 }
    ],
    tasks: [
      { type: 'delivery', x: 300, y: 120 },
      { type: 'escort', x: 100, y: 330 }
    ],
    police: [ { x: 300, y: 360 } ],
    transfer: [ { x: 310, y: 368, label: '地铁 · 虹口站' } ],
    spawn: { x: 150, y: 250 }
  },

  /* ---------- 浦西 · 中部/南部 ---------- */
  huangpu: {
    id: 'huangpu', name: '黄浦', intro: '外滩万国 · 南京东路',
    road: { main: 56, sub: 28, off: 20 },
    water: [ { x: 376, y: 0, w: 24, h: 400 } ],   // 东侧黄浦江
    landmarks: [
      { name: '外滩', x: 360, y: 190, color: '#d35400' },
      { name: '南京东路', x: 300, y: 180, color: '#c0392b' },
      { name: '人民广场', x: 250, y: 235, color: '#27ae60' },
      { name: '豫园', x: 330, y: 290, color: '#e67e22' },
      { name: '新天地', x: 200, y: 300, color: '#8e44ad' },
      { name: '淮海中路', x: 230, y: 330, color: '#2980b9' }
    ],
    businesses: [
      { id: 'hp1', type: 'shop', x: 250, y: 180 },
      { id: 'hp2', type: 'gas', x: 110, y: 260 },
      { id: 'hp3', type: 'club', x: 200, y: 300 },
      { id: 'hp4', type: 'gym', x: 320, y: 240 }
    ],
    tasks: [
      { type: 'delivery', x: 140, y: 170 },
      { type: 'escort', x: 280, y: 320 },
      { type: 'race', x: 70, y: 120 }
    ],
    police: [ { x: 120, y: 300 } ],
    transfer: [ { x: 60, y: 360, label: '地铁 · 人民广场' } ],
    spawn: { x: 250, y: 226 }
  },

  xuhui: {
    id: 'xuhui', name: '徐汇', intro: '徐家汇源 · 衡山路',
    road: { main: 56, sub: 28, off: 4 },
    water: [
      { x: 0, y: 385, w: 400, h: 15 },           // 南侧黄浦江
      { x: 330, y: 330, w: 26, h: 30 }           // 植物园水塘
    ],
    landmarks: [
      { name: '徐家汇', x: 200, y: 200, color: '#e67e22' },
      { name: '衡山路', x: 150, y: 265, color: '#8e44ad' },
      { name: '龙华寺', x: 200, y: 330, color: '#c0392b' },
      { name: '上海南站', x: 110, y: 368, color: '#2980b9' },
      { name: '上海植物园', x: 330, y: 350, color: '#2ecc71' }
    ],
    businesses: [
      { id: 'xh1', type: 'shop', x: 280, y: 170 },
      { id: 'xh2', type: 'freight', x: 100, y: 120 },
      { id: 'xh3', type: 'garage', x: 60, y: 260 },
      { id: 'xh4', type: 'gym', x: 300, y: 280 }
    ],
    tasks: [
      { type: 'delivery', x: 320, y: 100 },
      { type: 'race', x: 60, y: 320 }
    ],
    police: [ { x: 250, y: 340 } ],
    transfer: [ { x: 340, y: 376, label: '地铁 · 上海南站' } ],
    spawn: { x: 200, y: 200 }
  },

  jingan: {
    id: 'jingan', name: '静安', intro: '南京西路 · 时尚商圈',
    road: { main: 56, sub: 28, off: 12 },
    water: [ { x: 80, y: 20, w: 240, h: 18 } ],  // 北侧苏州河
    landmarks: [
      { name: '静安寺', x: 150, y: 200, color: '#d35400' },
      { name: '南京西路', x: 190, y: 240, color: '#c0392b' },
      { name: '大宁公园', x: 330, y: 90, color: '#2ecc71' },
      { name: '久光百货', x: 200, y: 180, color: '#2980b9' }
    ],
    businesses: [
      { id: 'ja1', type: 'shop', x: 150, y: 200 },
      { id: 'ja2', type: 'club', x: 190, y: 240 },
      { id: 'ja3', type: 'gym', x: 280, y: 140 }
    ],
    tasks: [
      { type: 'escort', x: 120, y: 300 },
      { type: 'delivery', x: 300, y: 300 }
    ],
    police: [ { x: 260, y: 340 } ],
    transfer: [ { x: 340, y: 370, label: '地铁 · 静安寺' } ],
    spawn: { x: 150, y: 200 }
  },

  putuo: {
    id: 'putuo', name: '普陀', intro: '环球港 · 苏州河畔',
    road: { main: 56, sub: 28, off: 24 },
    water: [ { x: 0, y: 285, w: 400, h: 16 } ],  // 苏州河横穿
    landmarks: [
      { name: '环球港', x: 260, y: 170, color: '#e67e22' },
      { name: '长风公园', x: 180, y: 335, color: '#2ecc71' },
      { name: '真如寺', x: 100, y: 100, color: '#c0392b' }
    ],
    businesses: [
      { id: 'pt1', type: 'shop', x: 260, y: 170 },
      { id: 'pt2', type: 'gas', x: 90, y: 230 },
      { id: 'pt3', type: 'freight', x: 330, y: 100 }
    ],
    tasks: [
      { type: 'delivery', x: 200, y: 90 },
      { type: 'race', x: 60, y: 340 }
    ],
    police: [ { x: 300, y: 330 } ],
    transfer: [ { x: 100, y: 360, label: '地铁 · 曹杨路' } ],
    spawn: { x: 260, y: 170 }
  },

  changning: {
    id: 'changning', name: '长宁', intro: '中山公园 · 虹桥商圈',
    road: { main: 56, sub: 28, off: 30 },
    water: [ { x: 0, y: 24, w: 320, h: 16 } ],   // 北侧苏州河
    landmarks: [
      { name: '中山公园', x: 200, y: 240, color: '#2ecc71' },
      { name: '虹桥开发区', x: 310, y: 130, color: '#2980b9' },
      { name: '天山商圈', x: 280, y: 290, color: '#e67e22' }
    ],
    businesses: [
      { id: 'cn1', type: 'shop', x: 200, y: 240 },
      { id: 'cn2', type: 'garage', x: 100, y: 160 },
      { id: 'cn3', type: 'gym', x: 320, y: 300 }
    ],
    tasks: [
      { type: 'escort', x: 80, y: 300 },
      { type: 'delivery', x: 280, y: 80 }
    ],
    police: [ { x: 120, y: 340 } ],
    transfer: [ { x: 90, y: 366, label: '地铁 · 中山公园' } ],
    spawn: { x: 200, y: 240 }
  },

  /* ---------- 浦东 ---------- */
  lujiazui: {
    id: 'lujiazui', name: '陆家嘴', intro: '摩天三件套 · 金融中心',
    road: { main: 56, sub: 28, off: 6 },
    water: [ { x: 0, y: 0, w: 22, h: 400 } ],    // 西侧黄浦江
    landmarks: [
      { name: '上海中心', x: 200, y: 180, color: '#2980b9' },
      { name: '金茂大厦', x: 222, y: 196, color: '#8e44ad' },
      { name: '环球金融中心', x: 244, y: 178, color: '#e67e22' },
      { name: '东方明珠', x: 262, y: 215, color: '#c0392b' },
      { name: '正大广场', x: 275, y: 245, color: '#d35400' }
    ],
    businesses: [
      { id: 'lj1', type: 'shop', x: 200, y: 180 },
      { id: 'lj2', type: 'club', x: 275, y: 245 },
      { id: 'lj3', type: 'gas', x: 110, y: 320 },
      { id: 'lj4', type: 'garage', x: 330, y: 80 }
    ],
    tasks: [
      { type: 'escort', x: 60, y: 100 },
      { type: 'race', x: 300, y: 320 }
    ],
    police: [ { x: 150, y: 340 } ],
    transfer: [ { x: 30, y: 360, label: '地铁 · 陆家嘴' } ],
    spawn: { x: 200, y: 180 }
  },

  expo: {
    id: 'expo', name: '世博', intro: '中华艺术宫 · 世博源',
    road: { main: 56, sub: 28, off: 10 },
    water: [ { x: 0, y: 0, w: 400, h: 20 } ],    // 北侧黄浦江
    landmarks: [
      { name: '中华艺术宫', x: 150, y: 200, color: '#c0392b' },
      { name: '梅赛德斯奔驰文化中心', x: 260, y: 235, color: '#2980b9' },
      { name: '世博源', x: 200, y: 270, color: '#e67e22' }
    ],
    businesses: [
      { id: 'ex1', type: 'shop', x: 200, y: 270 },
      { id: 'ex2', type: 'gym', x: 90, y: 300 },
      { id: 'ex3', type: 'club', x: 260, y: 235 }
    ],
    tasks: [
      { type: 'delivery', x: 320, y: 100 },
      { type: 'escort', x: 100, y: 360 }
    ],
    police: [ { x: 300, y: 340 } ],
    transfer: [ { x: 40, y: 368, label: '地铁 · 世博园' } ],
    spawn: { x: 200, y: 270 }
  },

  qiantan: {
    id: 'qiantan', name: '前滩', intro: '前滩太古里 · 滨江新贵',
    road: { main: 56, sub: 28, off: 18 },
    water: [ { x: 0, y: 0, w: 400, h: 18 } ],    // 北侧黄浦江
    landmarks: [
      { name: '前滩太古里', x: 200, y: 200, color: '#e67e22' },
      { name: '晶耀前滩', x: 235, y: 245, color: '#2980b9' },
      { name: '东方体育中心', x: 150, y: 270, color: '#27ae60' }
    ],
    businesses: [
      { id: 'qt1', type: 'shop', x: 200, y: 200 },
      { id: 'qt2', type: 'club', x: 150, y: 270 },
      { id: 'qt3', type: 'garage', x: 320, y: 320 }
    ],
    tasks: [
      { type: 'race', x: 60, y: 120 },
      { type: 'delivery', x: 300, y: 360 }
    ],
    police: [ { x: 120, y: 340 } ],
    transfer: [ { x: 340, y: 370, label: '地铁 · 东方体育中心' } ],
    spawn: { x: 200, y: 200 }
  },

  /* ---------- 远郊 ---------- */
  chongming: {
    id: 'chongming', name: '崇明', intro: '生态之岛 · 森林公园',
    road: { main: 70, sub: 35, off: 5 },
    water: [ { x: 0, y: 385, w: 400, h: 15 } ],  // 南侧长江
    landmarks: [
      { name: '东平国家森林公园', x: 200, y: 110, color: '#2ecc71' },
      { name: '东滩湿地', x: 370, y: 260, color: '#16a085' },
      { name: '西沙湿地', x: 40, y: 250, color: '#16a085' },
      { name: '城桥镇', x: 200, y: 320, color: '#e67e22' }
    ],
    businesses: [
      { id: 'cm1', type: 'shop', x: 200, y: 320 },
      { id: 'cm2', type: 'gas', x: 320, y: 180 }
    ],
    tasks: [
      { type: 'delivery', x: 100, y: 340 },
      { type: 'race', x: 300, y: 60 }
    ],
    police: [ { x: 240, y: 340 } ],
    transfer: [ { x: 160, y: 372, label: '轮渡 · 南门码头' } ],
    spawn: { x: 200, y: 320 }
  },

  lingang: {
    id: 'lingang', name: '临港', intro: '滴水湖畔 · 未来之城',
    road: { main: 56, sub: 28, off: 14 },
    water: [
      { x: 120, y: 140, w: 160, h: 160, round: true }, // 滴水湖(圆)
      { x: 0, y: 385, w: 400, h: 15 }                  // 南侧杭州湾
    ],
    landmarks: [
      { name: '上海天文馆', x: 160, y: 180, color: '#8e44ad' },
      { name: '滴水湖', x: 200, y: 220, color: '#3498db' },
      { name: '临港新城', x: 200, y: 330, color: '#e67e22' },
      { name: '南汇嘴', x: 360, y: 370, color: '#16a085' }
    ],
    businesses: [
      { id: 'lg1', type: 'shop', x: 200, y: 330 },
      { id: 'lg2', type: 'freight', x: 60, y: 120 },
      { id: 'lg3', type: 'gas', x: 330, y: 260 }
    ],
    tasks: [
      { type: 'delivery', x: 60, y: 330 },
      { type: 'race', x: 340, y: 80 }
    ],
    police: [ { x: 250, y: 340 } ],
    transfer: [ { x: 60, y: 370, label: '地铁 · 滴水湖站' } ],
    spawn: { x: 200, y: 330 }
  }
};

/* ---------------- 总地图（上海全览 · 区域选择） ---------------- */
/* 一张示意地图：浦西区块在西、浦东在东、崇明为北部岛屿、临港在东南 */
const CITY_MAP = {
  id: 'city', name: '上海 · 全览',
  w: 400, h: 400,
  zones: [
    // 浦西（西侧，从上到下）
    { map: 'yangpu',   name: '杨浦',   x: 70,  y: 60,  color: '#e67e22' },
    { map: 'hongkou',  name: '虹口',   x: 90,  y: 120, color: '#d35400' },
    { map: 'putuo',    name: '普陀',   x: 20,  y: 130, color: '#2980b9' },
    { map: 'changning',name: '长宁',   x: 20,  y: 210, color: '#27ae60' },
    { map: 'jingan',   name: '静安',   x: 110, y: 190, color: '#8e44ad' },
    { map: 'huangpu',  name: '黄浦',   x: 140, y: 250, color: '#c0392b' },
    { map: 'xuhui',    name: '徐汇',   x: 60,  y: 300, color: '#e67e22' },
    // 浦东（东侧）
    { map: 'lujiazui', name: '陆家嘴', x: 210, y: 150, color: '#2980b9' },
    { map: 'expo',     name: '世博',   x: 210, y: 240, color: '#c0392b' },
    { map: 'qiantan',  name: '前滩',   x: 230, y: 310, color: '#27ae60' },
    { map: 'lingang',  name: '临港',   x: 340, y: 350, color: '#16a085' },
    // 崇明（北部岛屿）
    { map: 'chongming', name: '崇明',  x: 200, y: 30,  color: '#2ecc71' }
  ],
  // 黄浦江示意（浦东浦西之间）
  river: { x: 180, y: 0, w: 16, h: 400 }
};
