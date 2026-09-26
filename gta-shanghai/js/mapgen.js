/* ============================================================
 * 地图程序化生成器
 * 步骤：铺水域 → 生成道路网格(遇水变桥) → 填充建筑街区 → 放置地标
 * 生成后立即预渲染成整张离屏位图，运行时只裁剪绘制，保证性能。
 * ============================================================ */
const T = CONFIG.TILES;

/* 简易确定性伪随机（同一格永远同色，建筑不闪烁） */
function hash2(x, y, seed) {
  let h = seed ^ (x * 374761393) ^ (y * 668265263);
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h >>> 0) / 4294967296;
}

const MapGen = {
  /* ---- 生成行政区地图 ---- */
  generate(id) {
    const cfg = MAPS[id];
    const w = CONFIG.MAP_W, h = CONFIG.MAP_H;
    const tiles = new Uint8Array(w * h);
    const roadGrid = new Uint8Array(w * h);
    tiles.fill(T.GROUND);

    // 1) 水域
    (cfg.water || []).forEach(r => this.fillWater(tiles, w, h, r));

    // 2) 道路网格（遇水自动成桥）
    this.genRoads(tiles, roadGrid, w, h, cfg.road);

    // 3) 建筑街区填充
    const density = id === 'chongming' ? 0.45 : id === 'lingang' ? 0.60 :
                    id === 'city' ? 0 : 0.82;
    this.fillBlocks(tiles, roadGrid, w, h, density);

    // 4) 地标
    const landmarks = (cfg.landmarks || []).map(lm => this.placeLandmark(tiles, w, h, lm));

    // 5) 业务点 / 任务点 / 警局 / 传送点 / 出生点
    const businesses = (cfg.businesses || []).map(b => Object.assign({}, b));
    const tasks      = (cfg.tasks || []).map(t => Object.assign({}, t));
    const police     = (cfg.police || []).map(p => Object.assign({}, p));
    const transfers  = (cfg.transfer || []).map(t => Object.assign({}, t));
    const spawn      = cfg.spawn || { x: w >> 1, y: h >> 1 };

    const map = { id, name: cfg.name, intro: cfg.intro, w, h, tiles, roadGrid,
             landmarks, businesses, tasks, police, transfers, spawn };
    this.normalizeSpawn(map);
    return map;
  },

  /* 出生点矫正：若落在不可走格（地标/水域），BFS找最近可走格 */
  findWalkable(map, sx, sy) {
    const queue = [[sx, sy]];
    const seen = new Set();
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
      const k = cy * map.w + cx;
      if (seen.has(k)) continue;
      seen.add(k);
      if (MapGen.isWalkable(map, cx, cy)) return { x: cx, y: cy };
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return { x: sx, y: sy };
  },
  normalizeSpawn(map) {
    if (MapGen.isWalkable(map, map.spawn.x, map.spawn.y)) return map.spawn;
    const f = MapGen.findWalkable(map, map.spawn.x, map.spawn.y);
    map.spawn.x = f.x; map.spawn.y = f.y;
    return map.spawn;
  },

  /* ---- 水域（矩形或圆形） ---- */
  fillWater(tiles, w, h, rect) {
    if (rect.round) {
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2, r = rect.w / 2;
      for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const dx = x - cx, dy = y - cy;
          if (dx * dx + dy * dy <= r * r) tiles[y * w + x] = T.WATER;
        }
    } else {
      for (let y = rect.y; y < Math.min(rect.y + rect.h, h); y++)
        for (let x = rect.x; x < Math.min(rect.x + rect.w, w); x++)
          tiles[y * w + x] = T.WATER;
    }
  },

  /* ---- 道路网格（主路宽3、次路宽2，遇水域为桥） ---- */
  genRoads(tiles, roadGrid, w, h, road) {
    const put = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      tiles[i] = (tiles[i] === T.WATER) ? T.BRIDGE : T.ROAD;
      roadGrid[i] = 1;
    };
    const { main, sub, off } = road;
    // 主路（水平+垂直）
    for (let y = off; y < h; y += main) for (let x = 0; x < w; x++) put(x, y), put(x, y + 1), put(x, y + 2);
    for (let x = off; x < w; x += main) for (let y = 0; y < h; y++) put(x, y), put(x + 1, y), put(x + 2, y);
    // 次路
    const subOff = off + Math.floor(main / 2);
    for (let y = subOff; y < h; y += sub) for (let x = 0; x < w; x++) put(x, y), put(x, y + 1);
    for (let x = subOff; x < w; x += sub) for (let y = 0; y < h; y++) put(x, y), put(x + 1, y);
  },

  /* ---- 建筑街区：4x4 块为单位填充 ---- */
  fillBlocks(tiles, roadGrid, w, h, density) {
    for (let by = 0; by < h; by += 4) {
      for (let bx = 0; bx < w; bx += 4) {
        // 块内若有道路/水域/桥则跳过
        let blocked = false;
        for (let dy = 0; dy < 4 && !blocked; dy++)
          for (let dx = 0; dx < 4 && !blocked; dx++) {
            const i = (by + dy) * w + (bx + dx);
            if (roadGrid[i] || tiles[i] === T.WATER || tiles[i] === T.BRIDGE) blocked = true;
          }
        if (blocked) continue;
        const r = hash2(bx, by, 7);
        const fill = r < density ? T.BUILDING : (r < density + 0.15 ? T.GRASS : T.GROUND);
        for (let dy = 0; dy < 4; dy++)
          for (let dx = 0; dx < 4; dx++) {
            const i = (by + dy) * w + (bx + dx);
            if (!roadGrid[i] && tiles[i] !== T.WATER && tiles[i] !== T.BRIDGE)
              tiles[i] = fill;
          }
      }
    }
  },

  /* ---- 地标放置 ---- */
  placeLandmark(tiles, w, h, lm) {
    const walkable = /公园|湿地|林|体育/.test(lm.name);
    const x = Math.max(3, Math.min(w - 4, Math.round(lm.x)));
    const y = Math.max(3, Math.min(h - 4, Math.round(lm.y)));
    const fill = walkable ? T.GRASS : T.LANDMARK;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        // 建筑地标覆盖道路？不覆盖主路，保留道路连通
        tiles[ny * w + nx] = fill;
      }
    return { name: lm.name, x, y, color: lm.color, walkable };
  },

  /* ---- 总览地图 ---- */
  genCityMap() {
    const w = CONFIG.MAP_W, h = CONFIG.MAP_H;
    const tiles = new Uint8Array(w * h);
    const roadGrid = new Uint8Array(w * h);
    tiles.fill(T.GROUND);
    // 黄浦江
    const r = CITY_MAP.river;
    for (let y = 0; y < h; y++) for (let x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = T.WATER;
    // 各区块：色块 + 周边道路
    const zones = CITY_MAP.zones.map(z => {
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = z.x + dx, ny = z.y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (tiles[ny * w + nx] !== T.WATER) tiles[ny * w + nx] = T.LANDMARK;
        }
      // 通往区块的小路
      for (let i = -8; i <= 8; i++) {
        const gx = z.x + i, gy = z.y + 6;
        if (gx >= 0 && gx < w && gy < h && tiles[gy * w + gx] !== T.WATER) { tiles[gy * w + gx] = T.ROAD; roadGrid[gy * w + gx] = 1; }
      }
      return { map: z.map, name: z.name, x: z.x, y: z.y, color: z.color };
    });
    const spawn = { x: 200, y: 210 };
    const map = { id: 'city', name: '上海 · 全览', intro: '选择区域进入', w, h, tiles, roadGrid,
             landmarks: [], businesses: [], tasks: [], police: [], transfers: [],
             zones, spawn };
    this.normalizeSpawn(map);
    return map;
  },

  /* ---- 预渲染整张地图到离屏位图 ---- */
  renderToCanvas(map) {
    const P = CONFIG.TILE;
    const c = document.createElement('canvas');
    c.width = map.w * P; c.height = map.h * P;
    const ctx = c.getContext('2d');

    const PALETTE = {
      [T.GROUND]:   ['#b8b0a4', '#b4ac9f'],
      [T.ROAD]:     ['#5a5f66', '#565b62'],
      [T.BRIDGE]:   ['#7a6a55', '#756550'],
      [T.BUILDING]: ['#d8cfc2', '#d2c9bc', '#cdd6e0', '#e0d2c8', '#c9cdd4', '#dcc9b5', '#cfd6c6'],
      [T.WATER]:    ['#3a6ea5', '#3a6ea5'],
      [T.GRASS]:    ['#6aab4c', '#639f47'],
      [T.LANDMARK]: ['#8a7f6a', '#847a66']
    };

    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.tiles[y * map.w + x];
        const palette = PALETTE[t] || PALETTE[T.GROUND];
        const color = palette[Math.floor(hash2(x, y, 11) * palette.length) | 0];
        ctx.fillStyle = color;
        ctx.fillRect(x * P, y * P, P, P);
        // 道路车道线（主路中点画浅色虚线感）
        if (t === T.ROAD && hash2(x, y, 23) < 0.22) {
          ctx.fillStyle = '#9aa0a6';
          ctx.fillRect(x * P + 3, y * P + 3, 2, 2);
        }
        // 水域波纹
        if (t === T.WATER && hash2(x, y, 31) < 0.12) {
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          ctx.fillRect(x * P + 2, y * P + 2, 4, 1);
        }
        // 建筑屋顶细节
        if (t === T.BUILDING && hash2(x, y, 43) < 0.15) {
          ctx.fillStyle = 'rgba(0,0,0,.10)';
          ctx.fillRect(x * P + 1, y * P + 1, P - 2, P - 2);
        }
      }
    }
    // 地标：画中心标识色块
    (map.landmarks || []).forEach(lm => {
      ctx.fillStyle = lm.color;
      ctx.fillRect((lm.x - 1) * P, (lm.y - 1) * P, 3 * P, 3 * P);
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.fillRect((lm.x - 1) * P + 3, (lm.y - 1) * P + 3, 3 * P - 6, 3 * P - 6);
    });
    // 总览区块
    (map.zones || []).forEach(z => {
      ctx.fillStyle = z.color;
      ctx.fillRect((z.x - 3) * P, (z.y - 3) * P, 7 * P, 7 * P);
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.strokeRect((z.x - 3) * P + .5, (z.y - 3) * P + .5, 7 * P - 1, 7 * P - 1);
    });
    map.canvas = c;
    return c;
  },

  /* ---- 工具 ---- */
  tileAt(map, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return T.WATER;
    return map.tiles[y * map.w + x];
  },
  isWalkable(map, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    const t = map.tiles[y * map.w + x];
    return t === T.GROUND || t === T.ROAD || t === T.ROAD_MARK || t === T.GRASS || t === T.BRIDGE;
  },
  isRoad(map, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= map.w || y >= map.h) return false;
    return map.roadGrid[y * map.w + x] === 1;
  }
};
