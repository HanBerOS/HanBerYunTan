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

    // 1.5) 公园绿地（矩形/圆形/椭圆）
    (cfg.greens || []).forEach(r => this.fillGreens(tiles, w, h, r));

    // 2) 道路网格（水上不自动升路，桥由 water.bridgeY 显式指定）
    this.genRoads(tiles, roadGrid, w, h, cfg.road, cfg.water);

    // 3) 建筑街区填充
    const density = id === 'chongming' ? 0.45 : id === 'lingang' ? 0.60 :
                    id === 'city' ? 0 : 0.82;
    this.fillBlocks(tiles, roadGrid, w, h, density);

    // 3.5) 行政区形状裁剪（区外填郊野，形状如实还原）
    this.applyShape(tiles, roadGrid, w, h, cfg.shape);

    // 3.55) 江中岛（复兴岛等）步行空地：岛上撒空地/绿地，避免整岛全是建筑不可走
    (cfg.water || []).map(r => r.island).filter(Boolean).forEach(isl =>
      this.scatterIsland(tiles, roadGrid, w, h, isl));

    // 3.6) 住宅小区（中海城等内部结构）
    (cfg.estates || []).forEach(es => this.makeEstate(tiles, roadGrid, w, h, es.cx, es.cy, es.cols, es.rows));

    // 4) 地标
    const landmarks = (cfg.landmarks || []).map(lm => this.placeLandmark(tiles, roadGrid, w, h, lm));

    // 5) 业务点 / 任务点 / 警局 / 传送点 / 出生点 / 房产楼盘
    const businesses = (cfg.businesses || []).map(b => Object.assign({}, b));
    const tasks      = (cfg.tasks || []).map(t => Object.assign({}, t));
    const police     = (cfg.police || []).map(p => Object.assign({}, p));
    const transfers  = (cfg.transfer || []).map(t => Object.assign({}, t));
    const homes      = (cfg.homes || []).map(h => Object.assign({}, h));
    const spawn      = cfg.spawn || { x: w >> 1, y: h >> 1 };

    const map = { id, name: cfg.name, intro: cfg.intro, w, h, tiles, roadGrid,
             landmarks, businesses, tasks, police, transfers, homes, spawn };
    // 交互点矫正：所有可交互位置(便利店/任务/警局/传送点/楼盘)移到可行走格并挖出空地
    this.fixInteractPoints(map);
    this.normalizeSpawn(map);
    // 红绿灯：主路交叉口放置信号灯（必须落在可走道路格上）
    map.trafficLights = this.genTrafficLights(map, cfg.road);
    return map;
  },

  /* ---- 红绿灯：主路交叉口放信号灯（隔一个交叉口放一个，密度适中） ---- */
  genTrafficLights(map, road) {
    const w = map.w, h = map.h;
    const { main, off } = road;
    const lights = [];
    if (!main) return lights;
    for (let ky = 0; ; ky++) {
      const y0 = off + ky * main;
      if (y0 >= h - 2) break;
      for (let kx = 0; ; kx++) {
        const x0 = off + kx * main;
        if (x0 >= w - 2) break;
        if (((kx + ky) & 1) !== 0) continue;   // 隔一个交叉口，避免满城灯
        const cx = x0 + 1, cy = y0 + 1;
        const i = cy * w + cx;
        if (map.roadGrid[i]) lights.push({ x: cx, y: cy });
      }
    }
    return lights;
  },

  /* 交互点矫正：BFS找最近可走格，并在点周围1格挖出空地(不破坏道路/水域/区外) */
  fixInteractPoints(map) {
    [map.businesses, map.tasks, map.police, map.transfers, map.homes].forEach(list => {
      list.forEach(pt => {
        const f = MapGen.findWalkable(map, pt.x, pt.y);
        pt.x = f.x; pt.y = f.y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = pt.x + dx, ny = pt.y + dy;
          if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
          const i = ny * map.w + nx;
          if (map.roadGrid[i] || map.tiles[i] === T.WATER || map.tiles[i] === T.OUTSKIRT || map.tiles[i] === T.BRIDGE) continue;
          map.tiles[i] = T.GROUND;
        }
      });
    });
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
      if (MapGen.isWalkable(map, cx, cy)) {
        // 要求出生格上下左右四邻至少有2格可走，避免困在死角出不去
        let nb = 0;
        if (MapGen.isWalkable(map, cx + 1, cy)) nb++;
        if (MapGen.isWalkable(map, cx - 1, cy)) nb++;
        if (MapGen.isWalkable(map, cx, cy + 1)) nb++;
        if (MapGen.isWalkable(map, cx, cy - 1)) nb++;
        if (nb >= 2) return { x: cx, y: cy };
      }
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    return { x: sx, y: sy };
  },
  /* 找最近"非道路"可走格（人行道/街区空地）：被车撞进医院后重生用，
     避免重生到道路中央被车立刻再撞（无限送医循环） */
  findWalkableNotRoad(map, sx, sy) {
    const queue = [[sx, sy]];
    const seen = new Set();
    let head = 0;
    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) continue;
      const k = cy * map.w + cx;
      if (seen.has(k)) continue;
      seen.add(k);
      if (MapGen.isWalkable(map, cx, cy) && !MapGen.isRoad(map, cx, cy)) {
        // 要求四邻至少2格可走（同样防死角）
        let nb = 0;
        if (MapGen.isWalkable(map, cx + 1, cy)) nb++;
        if (MapGen.isWalkable(map, cx - 1, cy)) nb++;
        if (MapGen.isWalkable(map, cx, cy + 1)) nb++;
        if (MapGen.isWalkable(map, cx, cy - 1)) nb++;
        if (nb >= 2) return { x: cx, y: cy };
      }
      queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
    }
    // 全图无满足格（极小概率）：退化为任意可走格
    return MapGen.findWalkable(map, sx, sy);
  },
  normalizeSpawn(map) {
    if (MapGen.isWalkable(map, map.spawn.x, map.spawn.y)) return map.spawn;
    const f = MapGen.findWalkable(map, map.spawn.x, map.spawn.y);
    map.spawn.x = f.x; map.spawn.y = f.y;
    return map.spawn;
  },

  /* ---- 水域（矩形 / 圆形 / 椭圆）----
     rect.island: 水体内的陆地（如复兴岛），填水时跳过该矩形，保持原地面 */
  fillWater(tiles, w, h, rect) {
    const isl = rect.island;
    const skipIsland = (x, y) => {
      if (!isl) return false;
      return x >= isl.x && x < isl.x + isl.w && y >= isl.y && y < isl.y + isl.h;
    };
    if (rect.round) {
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const rx = rect.w / 2, ry = (rect.ry || rect.h) / 2;
      for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (skipIsland(x, y)) continue;
          const dx = x - cx, dy = y - cy;
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) tiles[y * w + x] = T.WATER;
        }
    } else {
      for (let y = rect.y; y < Math.min(rect.y + rect.h, h); y++)
        for (let x = rect.x; x < Math.min(rect.x + rect.w, w); x++)
          if (!skipIsland(x, y)) tiles[y * w + x] = T.WATER;
    }
  },

  /* ---- 行政区形状裁剪：区外填郊野(不可走)，自然水体保留 ---- */
  applyShape(tiles, roadGrid, w, h, shape) {
    if (!shape || !shape.length) return;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (this.pointInShape(x / w, y / h, shape)) continue;
      const i = y * w + x;
      if (tiles[i] === T.WATER || tiles[i] === T.BRIDGE || tiles[i] === T.OUTSKIRT) continue;
      tiles[i] = T.OUTSKIRT;
      roadGrid[i] = 0;
    }
    // 边界通行带：区界内缘紧贴区外的建筑清成空地，保证能沿区界走（边界跨区传送可达）
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (tiles[i] !== T.BUILDING) continue;
      if (tiles[i - 1] === T.OUTSKIRT || tiles[i + 1] === T.OUTSKIRT ||
          tiles[i - w] === T.OUTSKIRT || tiles[i + w] === T.OUTSKIRT)
        tiles[i] = T.GROUND;
    }
  },
  pointInShape(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  },

  /* ---- 小区生成器：外圈道路 + 内部 5x5 模块(3x3楼栋 + 十字路) ---- */
  makeEstate(tiles, roadGrid, w, h, cx, cy, cols, rows) {
    const x0 = Math.round(cx - cols / 2), y0 = Math.round(cy - rows / 2);
    const road = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (tiles[i] === T.WATER || tiles[i] === T.OUTSKIRT) return;  // 不越区界
      tiles[i] = T.ROAD; roadGrid[i] = 1;
    };
    const build = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (tiles[i] === T.OUTSKIRT) return;   // 不越区界
      tiles[i] = hash2(x, y, 71) < 0.28 ? T.GRASS : T.BUILDING;
      roadGrid[i] = 0;
    };
    // 外圈路
    for (let i = -1; i <= cols; i++) { road(x0 + i, y0 - 1); road(x0 + i, y0 + rows); }
    for (let j = -1; j <= rows; j++) { road(x0 - 1, y0 + j); road(x0 + cols, y0 + j); }
    // 内部 5x5 模块：中心 3x3 楼栋，模块边界为内部路
    for (let ry = 0; ry * 5 < rows; ry++) {
      for (let rx = 0; rx * 5 < cols; rx++) {
        const bx = x0 + rx * 5, by = y0 + ry * 5;
        for (let dy = 1; dy < 4; dy++) for (let dx = 1; dx < 4; dx++) build(bx + dx, by + dy);
        for (let i = 0; i < 5; i++) {
          road(bx + i, by); road(bx + i, by + 4);
          road(bx, by + i); road(bx + 4, by + i);
        }
      }
    }
  },

  /* ---- 江中岛步行空地：30% 空地 + 15% 绿地，其余保持建筑（不破坏岛内道路/水域/桥） ---- */
  scatterIsland(tiles, roadGrid, w, h, isl) {
    for (let y = isl.y; y < isl.y + isl.h; y++)
      for (let x = isl.x; x < isl.x + isl.w; x++) {
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (roadGrid[i] || tiles[i] === T.WATER || tiles[i] === T.BRIDGE) continue;
        const r = hash2(x, y, 97);
        if (r < 0.3) tiles[i] = T.GROUND;
        else if (r < 0.45) tiles[i] = T.GRASS;
      }
  },

  /* ---- 公园绿地（与水域同形，填 GRASS；用于湖畔/林带） ---- */
  fillGreens(tiles, w, h, rect) {
    const mark = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (tiles[i] !== T.WATER) tiles[i] = T.GRASS;   // 不覆盖水
    };
    if (rect.round) {
      const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
      const rx = rect.w / 2, ry = (rect.ry || rect.h) / 2;
      for (let y = rect.y; y < rect.y + rect.h; y++)
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const dx = x - cx, dy = y - cy;
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) mark(x, y);
        }
    } else {
      for (let y = rect.y; y < Math.min(rect.y + rect.h, h); y++)
        for (let x = rect.x; x < Math.min(rect.x + rect.w, w); x++) mark(x, y);
    }
  },

  /* ---- 道路网格（主路宽3、次路宽2；水上不再自动架桥，桥仅由 water.bridgeY 显式指定） ---- */
  genRoads(tiles, roadGrid, w, h, road, waters) {
    const put = (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (tiles[i] === T.WATER) return;   // 水上不自动升路
      tiles[i] = T.ROAD;
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
    // 显式桥：water 条目可配 bridgeY:[y,...]，把该行对应水段架成桥
    if (waters) for (const wt of waters) {
      if (!wt.bridgeY) continue;
      for (const by of wt.bridgeY) {
        for (let x = wt.x; x < Math.min(wt.x + wt.w, w); x++) {
          if (by < 0 || by >= h) continue;
          const i = by * w + x;
          if (tiles[i] === T.WATER) { tiles[i] = T.BRIDGE; roadGrid[i] = 1; }
        }
      }
    }
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
  placeLandmark(tiles, roadGrid, w, h, lm) {
    const walkable = /公园|湿地|林|体育/.test(lm.name);
    const x = Math.max(3, Math.min(w - 4, Math.round(lm.x)));
    const y = Math.max(3, Math.min(h - 4, Math.round(lm.y)));
    const fill = walkable ? T.GRASS : T.LANDMARK;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const i = ny * w + nx;
        // 跳过道路格：地标不切断道路，也不产生"伪道路"(标记是路但不可走)
        if (roadGrid[i]) continue;
        tiles[i] = fill;
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
      [T.LANDMARK]: ['#8a7f6a', '#847a66'],
      // 区界外：暗色空白（不加载的"图外"虚空），不再用绿色绿化带
      [T.OUTSKIRT]: ['#1d2024', '#1d2024']
    };
    MapGen.PALETTE = PALETTE;

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
    // 地标：画中心标识色块（跳过道路格，避免视觉上"道路被切断"）
    (map.landmarks || []).forEach(lm => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = lm.x + dx, ny = lm.y + dy;
        if (nx < 0 || ny < 0 || nx >= map.w || ny >= map.h) continue;
        if (map.roadGrid[ny * map.w + nx]) continue;
        ctx.fillStyle = lm.color;
        ctx.fillRect(nx * P, ny * P, P, P);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.fillRect(nx * P + 3, ny * P + 3, P - 6, P - 6);
      }
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
