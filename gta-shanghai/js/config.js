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
    BRIDGE: 7,         // 桥梁
    OUTSKIRT: 8        // 区界外郊野（不可走）
  },

  // 速度（格/秒）
  WALK: 4.5,
  RUN: 7,
  CAR_MIN: 8,
  CAR_MAX: 20,
  DAY_LENGTH: 120,       // 一个昼夜循环=120秒（现实）

  // 交通与行人安全（红绿灯 / 交警 / 被创）
  TRAFFIC: {
    phaseLen: 8,       // 红绿灯相位切换秒数（8秒一换向：东西绿 ↔ 南北绿）
    fatalSpeed: 10,    // 撞到步行玩家的致命车速（格/秒），≥此值玩家被创死亡
    hospitalFee: 300,  // 被创死亡住院费
    trafficFine: 150,  // 交警开出的闯红灯罚单
    lightCooldown: 3   // 同一路口闯红灯冷却（秒），避免连续罚单刷屏
  },

  // 驾驶模拟（挂档 / 手刹 / 漂移）
  DRIVE: {
    gearMax: [0, 8, 13, 18, 24, 30],  // 档位1~5的极速(格/秒)，0位占位。实际受车型maxSpeed封顶
    reverseMax: 8,       // 倒档极速(格/秒)
    accel: 26,           // W加速增量(格/秒²)
    brake: 30,           // S刹车减量(格/秒²)
    coast: 1.2,          // 无油门滑行衰减系数
    gearCoast: 1.5,      // 空档滑行衰减
    handbrakeDecel: 4,   // 手刹强减速系数（非漂移时）
    turnRate: 2.6,       // 转向速率(弧度/秒)
    driftTurnBoost: 2.0, // 漂移时转向速率倍率
    driftMinSpeed: 14,   // 触发漂移的最低速度(格/秒)
    driftAlign: 1.6      // 漂移时动量追向车头的速度
  },

  // 季节系统：每季40个游戏日，一年160天（0春 1夏 2秋 3冬）
  SEASONS: { len: 40 },

  // 天气系统：台风（上海小概率） / 雪（沈阳冬天限定）
  WEATHER: {
    typhoonChance: 0.0015,  // 上海每现实秒台风触发概率（小概率，约10分钟一次）
    typhoonMin: 8, typhoonMax: 12,   // 风力范围（级）
    snowChance: 0.004,      // 沈阳·冬天每现实秒下雪概率
    snowMin: 1, snowMax: 3, // 雪量 1小雪 2中雪 3大雪
    durationMin: 40, durationMax: 80, // 天气持续（现实秒）
    windPush: 0.16,         // 台风推人(格/秒/级)，12级≈1.9格/秒
    carSlow: 0.2,           // 台风天开车极速-20%
    npcSlow: 0.4,           // 台风天NPC车减速40%
    snowNpcSlow: 0.7        // 大雪(≥3)时NPC车减速系数
  },

  // 严寒（沈阳·冬天/雪天·室外）：冻死机制
  COLD: {
    baseRate: 1.3,      // 室外基础冷速(%/秒)，约77秒冻到100
    snowRate: 0.5,      // 雪天额外冷速(%/秒/级)
    warmCar: 5,         // 车内回暖(%/秒)
    warmZone: 3,        // 取暖点（便利店/加油站/改装车行旁）回暖(%/秒)
    idleWarm: 0.4,      // 非寒冷区自然回暖(%/秒)
    interactAt: 60,     // 寒冷≥60：失去F/G交互
    moveAt: 80,         // 寒冷≥80：失去移动（行动能力）
    freezeFee: 300      // 冻死治疗费
  },

  // 载具类型：最大速度(格/秒) 与 车身尺寸(半宽,半高)
  CAR_TYPES: {
    normal: { max: 20, sw: 7, sh: 4, label: '轿车' },
    sports: { max: 24, sw: 7, sh: 3, label: '跑车' },
    taxi:   { max: 18, sw: 7, sh: 4, label: '出租车' },
    truck:  { max: 14, sw: 9, sh: 5, label: '卡车' },
    police: { max: 17, sw: 7, sh: 4, label: '警车' }
  },

  // 产业类型定义
  BUSINESS_TYPES: {
    shop:    { name: '便利店',   icon: '🏪', price: 5000,  income: 5,  desc: '稳定的小额日营收' },
    gas:     { name: '加油站',   icon: '⛽', price: 12000, income: 12, desc: '能源生意，收益中等' },
    garage:  { name: '改装车行', icon: '🔧', price: 20000, income: 20, desc: '修车改装，客源稳定' },
    freight: { name: '货运站',   icon: '🚚', price: 15000, income: 16, desc: '物流收入，周期短' },
    club:    { name: '夜店',     icon: '🎵', price: 30000, income: 30, desc: '高投入高回报' },
    gym:     { name: '健身房',   icon: '🏋', price: 8000,  income: 8,  desc: '社区生意，回报稳' }
  },

  // 房产类型（买房系统）
  HOME_TYPES: {
    apartment: { name: '公寓', icon: '🏢' },
    house:     { name: '洋房', icon: '🏡' },
    villa:     { name: '别墅', icon: '🏰' },
    mansion:   { name: '大平层', icon: '🌃' },
    home:      { name: '住宅', icon: '🏠' }
  },
  HOME_RENT_CYCLE: 30,   // 房租结算周期（秒）：买入后每30秒收租

  // 任务类型
  TASK_TYPES: {
    delivery: { name: '货运配送', desc: '把货物按时送到指定地点', reward: 1500, time: 90 },
    escort:   { name: '安保押运', desc: '护送运钞车安全抵达金库', reward: 3000, time: 120 },
    race:     { name: '街头竞速', desc: '和对手赛车，率先到达终点', reward: 2000, time: 60 },
    taxi:     { name: '出租车载客', desc: '开车接上乘客，准时送达目的地', reward: 1800, time: 90 },
    thief:    { name: '追捕小偷', desc: '市民报警：有小偷！追上他，撞停或按F制服', reward: 2500, time: 60 }
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
    shape: [[0.05,0.05],[0.60,0.03],[0.80,0.10],[0.90,0.25],[0.92,0.55],[0.85,0.80],[0.55,0.92],[0.30,0.88],[0.10,0.65],[0.04,0.35]],
    water: [
      { x: 0, y: 378, w: 400, h: 22 },   // 南侧黄浦江
      { x: 386, y: 330, w: 14, h: 70 }   // 东侧拐角江
    ],
    landmarks: [
      { name: '五角场', x: 200, y: 170, color: '#e67e22' },
      { name: '复旦大学', x: 120, y: 130, color: '#8e44ad' },
      { name: '同济大学', x: 250, y: 200, color: '#2980b9' },
      { name: '江湾体育场', x: 200, y: 105, color: '#27ae60' },
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
      { type: 'race', x: 280, y: 260 },
      { type: 'thief', x: 200, y: 200 }
    ],
    homes: [
      { id: 'yp_h', name: '五角场公寓', type: 'apartment', price: 12000, rent: 8, x: 168, y: 150 }
    ],
    police: [ { x: 120, y: 360 } ],
    transfer: [ { x: 100, y: 370, label: '地铁 · 杨浦站' } ],
    spawn: { x: 200, y: 170 }
  },

  hongkou: {
    id: 'hongkou', name: '虹口', intro: '北外滩 · 老城记忆',
    road: { main: 56, sub: 28, off: 16 },
    shape: [[0.20,0.28],[0.55,0.22],[0.72,0.30],[0.78,0.50],[0.75,0.75],[0.60,0.88],[0.35,0.90],[0.22,0.70],[0.16,0.50]],
    water: [ { x: 0, y: 378, w: 400, h: 22 } ],
    landmarks: [
      { name: '北外滩', x: 280, y: 310, color: '#d35400' },
      { name: '四川北路', x: 150, y: 250, color: '#e67e22' },
      { name: '鲁迅公园', x: 120, y: 130, color: '#2ecc71' },
      { name: '虹口足球场', x: 130, y: 175, color: '#2980b9' },
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
    homes: [
      { id: 'hk_h', name: '北外滩滨江公寓', type: 'apartment', price: 18000, rent: 12, x: 262, y: 302 }
    ],
    police: [ { x: 300, y: 360 } ],
    transfer: [ { x: 310, y: 368, label: '地铁 · 虹口站' } ],
    spawn: { x: 150, y: 250 }
  },

  /* ---------- 浦西 · 中部/南部 ---------- */
  huangpu: {
    id: 'huangpu', name: '黄浦', intro: '外滩万国 · 南京东路',
    road: { main: 56, sub: 28, off: 20 },
    shape: [[0.35,0.55],[0.55,0.50],[0.75,0.55],[0.88,0.68],[0.92,0.82],[0.80,0.95],[0.45,0.97],[0.35,0.88],[0.32,0.72]],
    water: [ { x: 376, y: 0, w: 24, h: 400 } ],   // 东侧黄浦江
    landmarks: [
      { name: '外滩', x: 355, y: 190, color: '#d35400' },
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
      { type: 'race', x: 70, y: 120 },
      { type: 'taxi', x: 250, y: 235 },
      { type: 'thief', x: 180, y: 250 },
    ],
    homes: [
      { id: 'hp_h', name: '外滩花园洋房', type: 'house', price: 30000, rent: 20, x: 350, y: 176 }
    ],
    police: [ { x: 120, y: 300 } ],
    transfer: [ { x: 60, y: 360, label: '地铁 · 人民广场' } ],
    spawn: { x: 250, y: 226 }
  },

  xuhui: {
    id: 'xuhui', name: '徐汇', intro: '徐家汇源 · 衡山路',
    road: { main: 56, sub: 28, off: 4 },
    shape: [[0.08,0.45],[0.40,0.42],[0.62,0.50],[0.68,0.62],[0.62,0.85],[0.45,0.98],[0.20,0.95],[0.05,0.80],[0.02,0.60]],
    water: [
      { x: 0, y: 385, w: 400, h: 15 },           // 南侧黄浦江
      { x: 330, y: 330, w: 26, h: 30 }           // 植物园水塘
    ],
    landmarks: [
      { name: '徐家汇', x: 200, y: 200, color: '#e67e22' },
      { name: '衡山路', x: 150, y: 265, color: '#8e44ad' },
      { name: '龙华寺', x: 200, y: 330, color: '#c0392b' },
      { name: '上海南站', x: 110, y: 368, color: '#2980b9' },
      { name: '上海植物园', x: 230, y: 330, color: '#2ecc71' }
    ],
    businesses: [
      { id: 'xh1', type: 'shop', x: 280, y: 170 },
      { id: 'xh2', type: 'freight', x: 100, y: 120 },
      { id: 'xh3', type: 'garage', x: 60, y: 260 },
      { id: 'xh4', type: 'gym', x: 300, y: 280 }
    ],
    tasks: [
      { type: 'delivery', x: 320, y: 100 },
      { type: 'race', x: 60, y: 320 },
      { type: 'taxi', x: 200, y: 200 },
      { type: 'thief', x: 150, y: 250 }
    ],
    homes: [
      { id: 'xh_h', name: '衡山路洋房', type: 'house', price: 26000, rent: 17, x: 136, y: 258 }
    ],
    police: [ { x: 250, y: 340 } ],
    transfer: [ { x: 340, y: 376, label: '地铁 · 上海南站' } ],
    spawn: { x: 200, y: 200 }
  },

  jingan: {
    id: 'jingan', name: '静安', intro: '南京西路 · 时尚商圈',
    road: { main: 56, sub: 28, off: 12 },
    shape: [[0.30,0.42],[0.55,0.38],[0.68,0.48],[0.65,0.68],[0.45,0.75],[0.28,0.68],[0.24,0.55]],
    water: [ { x: 80, y: 20, w: 240, h: 18 } ],  // 北侧苏州河
    landmarks: [
      { name: '静安寺', x: 150, y: 200, color: '#d35400' },
      { name: '南京西路', x: 190, y: 240, color: '#c0392b' },
      { name: '大宁公园', x: 260, y: 160, color: '#2ecc71' },
      { name: '久光百货', x: 200, y: 180, color: '#2980b9' }
    ],
    businesses: [
      { id: 'ja1', type: 'shop', x: 150, y: 200 },
      { id: 'ja2', type: 'club', x: 190, y: 240 },
      { id: 'ja3', type: 'gym', x: 280, y: 140 }
    ],
    tasks: [
      { type: 'escort', x: 120, y: 300 },
      { type: 'delivery', x: 300, y: 300 },
      { type: 'taxi', x: 190, y: 240 }
    ],
    homes: [
      { id: 'ja_h', name: '静安公寓', type: 'apartment', price: 28000, rent: 18, x: 136, y: 196 }
    ],
    police: [ { x: 260, y: 340 } ],
    transfer: [ { x: 340, y: 370, label: '地铁 · 静安寺' } ],
    spawn: { x: 150, y: 200 }
  },

  putuo: {
    id: 'putuo', name: '普陀', intro: '环球港 · 苏州河畔',
    road: { main: 56, sub: 28, off: 24 },
    shape: [[0.08,0.30],[0.45,0.25],[0.62,0.35],[0.60,0.60],[0.45,0.75],[0.20,0.78],[0.06,0.60],[0.02,0.42]],
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
      { type: 'race', x: 60, y: 340 },
      { type: 'taxi', x: 260, y: 170 }
    ],
    homes: [
      { id: 'pt_h', name: '长风公园住宅', type: 'home', price: 10000, rent: 7, x: 168, y: 330 }
    ],
    police: [ { x: 300, y: 330 } ],
    transfer: [ { x: 100, y: 360, label: '地铁 · 曹杨路' } ],
    spawn: { x: 260, y: 170 }
  },

  changning: {
    id: 'changning', name: '长宁', intro: '中山公园 · 虹桥商圈',
    road: { main: 56, sub: 28, off: 30 },
    shape: [[0.05,0.45],[0.35,0.42],[0.48,0.55],[0.45,0.80],[0.30,0.92],[0.08,0.85],[0.02,0.65]],
    water: [ { x: 0, y: 24, w: 320, h: 16 } ],   // 北侧苏州河
    landmarks: [
      { name: '中山公园', x: 190, y: 230, color: '#2ecc71' },
      { name: '虹桥开发区', x: 150, y: 120, color: '#2980b9' },
      { name: '天山商圈', x: 130, y: 280, color: '#e67e22' }
    ],
    businesses: [
      { id: 'cn1', type: 'shop', x: 175, y: 230 },
      { id: 'cn2', type: 'garage', x: 100, y: 160 },
      { id: 'cn3', type: 'gym', x: 150, y: 290 }
    ],
    tasks: [
      { type: 'escort', x: 80, y: 300 },
      { type: 'delivery', x: 120, y: 70 }
    ],
    homes: [
      { id: 'cn_h', name: '虹桥涉外公寓', type: 'apartment', price: 15000, rent: 10, x: 136, y: 116 }
    ],
    police: [ { x: 120, y: 340 } ],
    transfer: [ { x: 90, y: 366, label: '地铁 · 中山公园' } ],
    spawn: { x: 185, y: 230 }
  },

  /* ---------- 浦东 ---------- */
  lujiazui: {
    id: 'lujiazui', name: '陆家嘴', intro: '摩天三件套 · 金融中心',
    road: { main: 56, sub: 28, off: 6 },
    shape: [[0.55,0.30],[0.78,0.25],[0.92,0.35],[0.97,0.55],[0.90,0.70],[0.70,0.72],[0.58,0.58],[0.55,0.45]],
    water: [ { x: 0, y: 0, w: 22, h: 400 } ],    // 西侧黄浦江
    landmarks: [
      { name: '上海中心', x: 270, y: 165, color: '#2980b9' },
      { name: '金茂大厦', x: 275, y: 195, color: '#8e44ad' },
      { name: '环球金融中心', x: 295, y: 180, color: '#e67e22' },
      { name: '东方明珠', x: 300, y: 220, color: '#c0392b' },
      { name: '正大广场', x: 310, y: 250, color: '#d35400' }
    ],
    businesses: [
      { id: 'lj1', type: 'shop', x: 200, y: 180 },
      { id: 'lj2', type: 'club', x: 275, y: 245 },
      { id: 'lj3', type: 'gas', x: 110, y: 320 },
      { id: 'lj4', type: 'garage', x: 330, y: 80 }
    ],
    tasks: [
      { type: 'escort', x: 60, y: 100 },
      { type: 'race', x: 300, y: 320 },
      { type: 'taxi', x: 200, y: 180 },
      { type: 'thief', x: 250, y: 250 }
    ],
    homes: [
      { id: 'lj_h', name: '滨江大平层', type: 'mansion', price: 60000, rent: 40, x: 258, y: 172 }
    ],
    police: [ { x: 150, y: 340 } ],
    transfer: [ { x: 30, y: 360, label: '地铁 · 陆家嘴' } ],
    spawn: { x: 200, y: 180 }
  },

  expo: {
    id: 'expo', name: '世博', intro: '中华艺术宫 · 世博源',
    road: { main: 56, sub: 28, off: 10 },
    shape: [[0.55,0.60],[0.75,0.58],[0.88,0.65],[0.95,0.80],[0.85,0.90],[0.65,0.88],[0.55,0.78]],
    water: [ { x: 0, y: 0, w: 400, h: 20 } ],    // 北侧黄浦江
    landmarks: [
      { name: '中华艺术宫', x: 290, y: 270, color: '#c0392b' },
      { name: '梅赛德斯奔驰文化中心', x: 190, y: 260, color: '#2980b9' },
      { name: '世博源', x: 260, y: 330, color: '#e67e22' }
    ],
    businesses: [
      { id: 'ex1', type: 'shop', x: 280, y: 330 },
      { id: 'ex2', type: 'gym', x: 240, y: 260 },
      { id: 'ex3', type: 'club', x: 200, y: 280 }
    ],
    tasks: [
      { type: 'delivery', x: 300, y: 300 },
      { type: 'escort', x: 240, y: 350 }
    ],
    homes: [
      { id: 'ex_h', name: '世博滨江公寓', type: 'apartment', price: 16000, rent: 11, x: 272, y: 256 }
    ],
    police: [ { x: 280, y: 350 } ],
    transfer: [ { x: 250, y: 370, label: '地铁 · 世博园' } ],
    spawn: { x: 280, y: 300 }
  },

  qiantan: {
    id: 'qiantan', name: '前滩', intro: '前滩太古里 · 滨江新贵',
    road: { main: 56, sub: 28, off: 18 },
    shape: [[0.15,0.20],[0.55,0.15],[0.85,0.25],[0.95,0.55],[0.90,0.85],[0.50,0.95],[0.15,0.85],[0.05,0.50]],
    water: [ { x: 0, y: 0, w: 400, h: 18 } ],    // 北侧黄浦江
    landmarks: [
      { name: '前滩太古里', x: 300, y: 340, color: '#e67e22' },
      { name: '晶耀前滩', x: 320, y: 350, color: '#2980b9' },
      { name: '东方体育中心', x: 230, y: 280, color: '#27ae60' }
    ],
    businesses: [
      { id: 'qt1', type: 'shop', x: 310, y: 340 },
      { id: 'qt2', type: 'club', x: 240, y: 290 },
      { id: 'qt3', type: 'garage', x: 340, y: 330 }
    ],
    tasks: [
      { type: 'race', x: 280, y: 320 },
      { type: 'delivery', x: 320, y: 350 },
      { type: 'thief', x: 260, y: 300 }
    ],
    homes: [
      { id: 'qt_h', name: '前滩高端公寓', type: 'apartment', price: 32000, rent: 21, x: 288, y: 330 }
    ],
    police: [ { x: 300, y: 360 } ],
    transfer: [ { x: 270, y: 370, label: '地铁 · 东方体育中心' } ],
    spawn: { x: 300, y: 340 }
  },

  /* ---------- 远郊 ---------- */
  chongming: {
    id: 'chongming', name: '崇明', intro: '生态之岛 · 森林公园',
    road: { main: 56, sub: 28, off: 40 },
    shape: [[0.05,0.10],[0.45,0.09],[0.80,0.11],[0.95,0.15],[0.90,0.24],[0.55,0.25],[0.25,0.26],[0.02,0.18]],
    water: [
      { x: 0, y: 0, w: 400, h: 32 },    // 北侧长江
      { x: 0, y: 110, w: 400, h: 40 }   // 南侧长江
    ],
    landmarks: [
      { name: '东平国家森林公园', x: 200, y: 70, color: '#2ecc71' },
      { name: '东滩湿地', x: 360, y: 90, color: '#16a085' },
      { name: '西沙湿地', x: 40, y: 50, color: '#16a085' },
      { name: '城桥镇', x: 200, y: 95, color: '#e67e22' }
    ],
    businesses: [
      { id: 'cm1', type: 'shop', x: 170, y: 85 },
      { id: 'cm2', type: 'gas', x: 300, y: 60 }
    ],
    tasks: [
      { type: 'delivery', x: 100, y: 85 },
      { type: 'race', x: 300, y: 80 }
    ],
    homes: [
      { id: 'cm_h', name: '崇明生态别墅', type: 'villa', price: 14000, rent: 9, x: 186, y: 80 }
    ],
    police: [ { x: 240, y: 85 } ],
    transfer: [ { x: 150, y: 100, label: '轮渡 · 南门码头' } ],
    spawn: { x: 200, y: 95 }
  },

  lingang: {
    id: 'lingang', name: '临港', intro: '滴水湖畔 · 未来之城',
    road: { main: 56, sub: 28, off: 14 },
    shape: [[0.65,0.78],[0.85,0.75],[0.95,0.82],[0.98,0.95],[0.85,1.0],[0.65,0.98],[0.60,0.88]],
    water: [
      { x: 302, y: 310, w: 40, h: 40, round: true },  // 滴水湖(避开主路)
      { x: 0, y: 385, w: 400, h: 15 }                 // 南侧杭州湾
    ],
    landmarks: [
      { name: '滴水湖公园', x: 285, y: 335, color: '#16a085' },
      { name: '上海天文馆', x: 300, y: 345, color: '#8e44ad' },
      { name: '临港新城', x: 305, y: 385, color: '#e67e22' },
      { name: '南汇嘴观海公园', x: 380, y: 395, color: '#3498db' }
    ],
    businesses: [
      { id: 'lg1', type: 'shop', x: 290, y: 370 },
      { id: 'lg2', type: 'freight', x: 265, y: 320 },
      { id: 'lg3', type: 'gas', x: 350, y: 350 }
    ],
    tasks: [
      { type: 'delivery', x: 350, y: 310 },
      { type: 'race', x: 330, y: 385 }
    ],
    homes: [
      { id: 'lg_h', name: '滴水湖湖景公寓', type: 'apartment', price: 11000, rent: 8, x: 282, y: 348 }
    ],
    police: [ { x: 320, y: 340 } ],
    transfer: [ { x: 255, y: 390, label: '地铁 · 滴水湖站' } ],
    spawn: { x: 310, y: 350 }
  },

  /* ---------------- 第二城市：沈阳（丁香湖 · 中海城 · 三台子万象汇） ---------------- */
  shenyang: {
    id: 'shenyang', name: '沈阳', intro: '丁香湖 · 中海城 · 三台子万象汇',
    road: { main: 80, sub: 40, off: 12 },
    greens: [
      { x: 50, y: 50, w: 44, h: 44, round: true }   // 丁香湖环湖公园
    ],
    water: [
      { x: 56, y: 56, w: 32, h: 32, round: true }   // 丁香湖（椭圆，避开道路网格）
    ],
    estates: [
      { cx: 130, cy: 130, cols: 60, rows: 50 }  // 中海城（内部路网+楼栋）
    ],
    landmarks: [
      { name: '三台子万象汇', x: 250, y: 55, color: '#e67e22' },
      { name: '丁香湖公园', x: 72, y: 92, color: '#16a085' },
      { name: '中海城', x: 130, y: 160, color: '#c0392b' }
    ],
    businesses: [
      { id: 'sy1', type: 'shop', x: 170, y: 90 },
      { id: 'sy2', type: 'gas', x: 280, y: 160 },
      { id: 'sy3', type: 'garage', x: 100, y: 260 }
    ],
    tasks: [
      { type: 'delivery', x: 60, y: 220 },
      { type: 'race', x: 300, y: 300 },
      { type: 'taxi', x: 245, y: 80 },
      { type: 'thief', x: 150, y: 220 }
    ],
    homes: [
      { id: 'sy_h1', name: '丁香湖洋房', type: 'house', price: 8000, rent: 6, x: 86, y: 90 },
      { id: 'sy_h2', name: '中海城住宅', type: 'home', price: 6000, rent: 4, x: 118, y: 152 }
    ],
    police: [ { x: 330, y: 200 } ],
    transfer: [ { x: 340, y: 340, label: '高铁 · 沈阳站（回上海）' } ],
    spawn: { x: 130, y: 160 }
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
