/* ============================================================
 * 世界实体与AI：玩家 / 路人NPC / 车辆 / 警察追捕 / 通缉系统
 * ============================================================ */
const P = () => CONFIG.TILE;

/* 全局产业所有权：{ mapId: { businessId: level } }，跨地图持久（systems.js 亦引用） */
let OWNERSHIP = {};
/* 全局房产所有权：{ mapId: { homeId: true } }，跨地图持久（systems.js 亦引用） */
let HOME_OWNERSHIP = {};

/* 全局生涯统计（跨地图/跨会话持久） */
const STATS_KEY = 'gta-shanghai-stats-v1';
let STATS = { tasks: 0, arrests: 0, earned: 0, distance: 0, playTime: 0, crashed: 0, fines: 0, frozen: 0 };
function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && typeof d === 'object') {
        // 全字段校验，防旧版/脏数据产生 NaN 污染统计
        const s = { tasks: 0, arrests: 0, earned: 0, distance: 0, playTime: 0, crashed: 0, fines: 0, frozen: 0 };
        ['tasks', 'arrests', 'earned', 'distance', 'playTime', 'crashed', 'fines', 'frozen'].forEach(k => {
          if (typeof d[k] === 'number' && isFinite(d[k])) s[k] = d[k];
        });
        return s;
      }
    }
  } catch (e) { /* 忽略 */ }
  return { tasks: 0, arrests: 0, earned: 0, distance: 0, playTime: 0, crashed: 0, fines: 0, frozen: 0 };
}
function saveStats() {
  try { localStorage.setItem(STATS_KEY, JSON.stringify(STATS)); } catch (e) { /* 忽略 */ }
}

/* ---------- 玩家 ---------- */
class Player {
  constructor(map) {
    this.map = map;
    // 出生点矫正：若恰落在道路格上，移到最近非道路可走格（防开局/传送后站路中央被车创）
    const f = MapGen.isRoad(map, map.spawn.x, map.spawn.y)
      ? MapGen.findWalkableNotRoad(map, map.spawn.x, map.spawn.y)
      : map.spawn;
    this.x = f.x; this.y = f.y;
    // 放到格中心，避免四角碰撞检测落在相邻障碍格上导致卡死
    this.px = this.x * P() + P() / 2;
    this.py = this.y * P() + P() / 2;
    this.r = 3;
    this.fx = 0; this.fy = 1;
    this.wanted = 0;
    this.money = 1000;
    this.car = null;            // 当前驾驶的车
    this.alive = true;
  }
  update(dt, world) {
    if (this.car) { this.updateDriving(dt, world); return; }
    // 严寒（沈阳冬/雪天）：寒冷≥moveAt 失去行动能力（动弹不得）
    if (world.cold >= CONFIG.COLD.moveAt) return;
    const a = Input.axis();
    let speed = (Input.down('shift') ? CONFIG.RUN : CONFIG.WALK) * P() * dt;
    // 寒冷减速：越冷走得越慢
    if (world.cold > 0) speed *= 1 - (world.cold / 100) * 0.5;
    if (a.x || a.y) { this.fx = a.x; this.fy = a.y; }
    this.tryMove(a.x * speed, a.y * speed);
    // 台风天狂风推人（把人往风向方向推）
    if (world.typhoonActive) {
      const w = world.weather;
      this.tryMove(Math.cos(w.windAngle) * CONFIG.WEATHER.windPush * w.power * P() * dt,
                   Math.sin(w.windAngle) * CONFIG.WEATHER.windPush * w.power * P() * dt);
    }
  }
  tryMove(dx, dy) {
    const r = this.r;
    const nx = this.px + dx, ny = this.py + dy;
    const ok = (x, y) => MapGen.isWalkable(this.map, Math.floor(x / P()), Math.floor(y / P()));
    if (ok(nx + r, ny + r) && ok(nx - r, ny + r) && ok(nx + r, ny - r) && ok(nx - r, ny - r)) {
      this.px = nx; this.py = ny;
    } else if (dx !== 0 && ok(nx + r, this.py + r) && ok(nx - r, this.py + r) && ok(nx + r, this.py - r) && ok(nx - r, this.py - r)) {
      this.px = nx;
    } else if (dy !== 0 && ok(this.px + r, ny + r) && ok(this.px - r, ny + r) && ok(this.px + r, ny - r) && ok(this.px - r, ny - r)) {
      this.py = ny;
    }
    this.px = Math.max(2, Math.min(this.map.w * P() - 2, this.px));
    this.py = Math.max(2, Math.min(this.map.h * P() - 2, this.py));
    // 同步格坐标（供警车生成定位等使用）
    this.x = Math.floor(this.px / P());
    this.y = Math.floor(this.py / P());
  }
  updateDriving(dt, world) {
    const c = this.car;
    // 加速/刹车/转向：WASD 与方向键都支持（避免"方向键开车无效"）
    const up = Input.down('w') || Input.down('arrowup');
    const down = Input.down('s') || Input.down('arrowdown');
    const left = Input.down('a') || Input.down('arrowleft');
    const right = Input.down('d') || Input.down('arrowright');
    const brake = Input.down(' ') || Input.down('space');   // 手刹
    c.handbrake = brake;

    // ---- 动力（受档位限制，模拟手动挡）----
    if (c.g === 0) {                 // 空档：无动力滑行
      c.speed *= (1 - CONFIG.DRIVE.gearCoast * dt);
      if (Math.abs(c.speed) < 0.05) c.speed = 0;
    } else if (c.g === 6) {          // 倒档：W=倒车，S=刹停
      if (up) c.speed = Math.max(-CONFIG.DRIVE.reverseMax, c.speed - 22 * dt);
      if (down) c.speed = Math.min(0, c.speed + CONFIG.DRIVE.brake * dt);
      if (!up && !down) c.speed *= (1 - CONFIG.DRIVE.coast * dt);
    } else {                         // 前进档
      let cap = c.gearMaxNow();
      if (world.typhoonActive) cap *= (1 - CONFIG.WEATHER.carSlow);  // 台风天极速下降
      if (up) {
        if (c.speed < cap) c.speed = Math.min(cap, c.speed + CONFIG.DRIVE.accel * dt);
        else c.speed *= (1 - 0.9 * dt);   // 档位极速已到：断油回落
      }
      if (down) c.speed = Math.max(-4, c.speed - CONFIG.DRIVE.brake * dt);
      if (!up && !down) c.speed *= (1 - CONFIG.DRIVE.coast * dt);
    }
    // 手刹：非漂移时强减速（漂移中手刹负责甩尾，不减速）
    if (brake && !c.drift) c.speed *= (1 - CONFIG.DRIVE.handbrakeDecel * dt);

    // ---- 转向 ----
    const turn = (right ? 1 : 0) - (left ? 1 : 0);
    const speedAbs = Math.abs(c.speed);
    // 漂移判定：跑车 + 按住手刹 + 有转向输入 + 速度足够
    const wantDrift = c.type === 'sports' && brake && turn !== 0 && speedAbs > CONFIG.DRIVE.driftMinSpeed;
    if (wantDrift && !c.drift) { c.drift = true; c.vx = c.dx; c.vy = c.dy; }
    if (!wantDrift && c.drift) c.drift = false;

    if (turn !== 0) {
      const rate = CONFIG.DRIVE.turnRate *
        (c.drift ? CONFIG.DRIVE.driftTurnBoost : 1) *
        (c.g === 6 ? 0.6 : 1);                    // 倒档转向迟钝
      const ang = Math.atan2(c.dy, c.dx) + turn * rate * dt;
      c.dx = Math.cos(ang); c.dy = Math.sin(ang);
    }

    // ---- 位移（漂移时用滞后动量方向：车头转得快、车身滑着追）----
    if (c.drift) {
      const l = Math.hypot(c.vx, c.vy) || 1;
      c.vx /= l; c.vy /= l;
      c.vx += (c.dx - c.vx) * Math.min(1, CONFIG.DRIVE.driftAlign * dt);
      c.vy += (c.dy - c.vy) * Math.min(1, CONFIG.DRIVE.driftAlign * dt);
      const vl = Math.hypot(c.vx, c.vy) || 1;
      c.vx /= vl; c.vy /= vl;
      const nx = c.px + c.vx * c.speed * P() * dt;
      const ny = c.py + c.vy * c.speed * P() * dt;
      // 漂移也检测可走：目标格不可走（建筑/水域）则不位移——车原地甩尾，不穿墙不进水
      const ok = (x, y) => MapGen.isWalkable(c.map, Math.floor(x / P()), Math.floor(y / P()));
      if (ok(nx + c.r, ny + c.r) && ok(nx - c.r, ny + c.r) && ok(nx + c.r, ny - c.r) && ok(nx - c.r, ny - c.r)) {
        c.px = nx; c.py = ny;
        world.driftMarks.push({ x: c.px - c.vy * 5, y: c.py + c.vx * 5, life: 1 });
        world.driftMarks.push({ x: c.px + c.vy * 5, y: c.py - c.vx * 5, life: 1 });
      }
    } else {
      c.move(dt, world, this);
    }
    c.px = Math.max(4, Math.min(c.map.w * P() - 4, c.px));
    c.py = Math.max(4, Math.min(c.map.h * P() - 4, c.py));

    // ---- 台风侧风：垂直于车头的风力推动车身（检测可走，防被吹进建筑/水域）----
    if (world.typhoonActive) {
      const w = world.weather;
      const side = Math.cos(w.windAngle) * (-c.dy) + Math.sin(w.windAngle) * c.dx;
      const sx = (-c.dy) * side * w.power * 0.12 * dt;
      const sy = (c.dx) * side * w.power * 0.12 * dt;
      const ok = (x, y) => MapGen.isWalkable(c.map, Math.floor(x / P()), Math.floor(y / P()));
      if (ok(c.px + sx + c.r, c.py + sy + c.r) && ok(c.px + sx - c.r, c.py + sy - c.r) &&
          ok(c.px + sx + c.r, c.py + sy - c.r) && ok(c.px + sx - c.r, c.py + sy + c.r)) {
        c.px += sx; c.py += sy;
      }
    }

    // 玩家坐标同步到车，否则相机/迷你地图/交互全部错位
    this.px = c.px; this.py = c.py;
    this.x = Math.floor(this.px / P()); this.y = Math.floor(this.py / P());
    this.fx = c.dx; this.fy = c.dy;
    // 撞NPC→通缉（隐身乘客/倒地者不参与碰撞）
    world.npcs.forEach(n => {
      if (n.down || n.hidden) return;
      const d = Math.hypot(n.px - c.px, n.py - c.py);
      if (d < 10 && c.speed > 8) {
        n.hitByCar(c, world);
      }
    });
  }
}

/* ---------- 路人NPC ---------- */
class Npc {
  constructor(map, x, y, color, isPolice) {
    this.map = map;
    this.px = x * P(); this.py = y * P();
    this.r = 3;
    this.fx = 0; this.fy = 1;
    this.color = color;
    this.isPolice = !!isPolice;
    this.speed = (1.5 + Math.random() * 1.5) * P();
    this.walkT = 0; this.walkDur = 0;
    this.down = 0;         // 倒地恢复倒计时
    this.angry = false;
    this.stand = false;    // 站定不动（如等车的乘客）
    this.boarded = false;  // 已上车（隐藏）
    this.hidden = false;   // 不渲染
    this.isThief = false;  // 追捕任务的小偷（被撞=制服，不涉通缉）
    this.isTrafficPolice = false;  // 交警（站在红绿灯路口指挥，闯红灯会被罚款）
    this.say = '';         // 头顶气泡
    this.sayT = 0;
  }
  update(dt, world) {
    if (this.hidden) return;
    if (this.down > 0) { this.down -= dt; return; }
    if (this.sayT > 0) this.sayT -= dt;   // 气泡计时在站定/倒下前递减：交警/乘客站定也能让气泡消失
    if (this.stand) { this.fx = 0; this.fy = 1; return; }
    const player = world.player;
    // 小偷：持续朝远离玩家的方向逃跑（速度比步行快，需开车追）
    if (this.isThief) {
      const a = Math.atan2(this.py - player.py, this.px - player.px);
      this.tryMove(Math.cos(a) * this.speed * 1.4 * dt, Math.sin(a) * this.speed * 1.4 * dt);
      this.fx = Math.cos(a); this.fy = Math.sin(a);
      return;
    }
    // 玩家被通缉且靠近→逃跑
    if (player.wanted > 0 && !this.isPolice) {
      const d = Math.hypot(player.px - this.px, player.py - this.py);
      if (d < 14 * P()) {
        const a = Math.atan2(this.py - player.py, this.px - player.px);
        this.tryMove(Math.cos(a) * this.speed * 1.6 * dt, Math.sin(a) * this.speed * 1.6 * dt);
        this.fx = Math.cos(a); this.fy = Math.sin(a);
        return;
      }
    }
    // 随机闲逛
    this.walkT -= dt;
    if (this.walkT <= 0) {
      this.walkDur = 0.6 + Math.random() * 1.6;
      this.walkT = this.walkDur + 1 + Math.random() * 2;
      const a = Math.random() * Math.PI * 2;
      this.fx = Math.cos(a); this.fy = Math.sin(a);
    }
    this.tryMove(this.fx * this.speed * dt, this.fy * this.speed * dt);
  }
  tryMove(dx, dy) {
    const r = this.r;
    const ok = (x, y) => MapGen.isWalkable(this.map, Math.floor(x / P()), Math.floor(y / P()));
    if (ok(this.px + dx + r, this.py + dy + r) && ok(this.px + dx - r, this.py + dy + r) &&
        ok(this.px + dx + r, this.py + dy - r) && ok(this.px + dx - r, this.py + dy - r)) {
      this.px += dx; this.py += dy;
    } else {
      this.fx = -this.fx; this.fy = -this.fy;
    }
    this.px = Math.max(4, Math.min(this.map.w * P() - 4, this.px));
    this.py = Math.max(4, Math.min(this.map.h * P() - 4, this.py));
  }
  hitByCar(car, world) {
    if (this.down > 0 || this.hidden) return;
    if (this.isThief) { world.onThiefCaught(this); return; }   // 撞停小偷=制服，不加通缉
    this.down = 5;
    this.angry = true;
    world.addWanted(1);
    world.notice('⚠️ 你撞到市民，目击者已报警！');
  }
}

/* ---------- 车辆 ---------- */
class Car {
  constructor(map, x, y, color, isPolice, type) {
    this.map = map;
    this.isCar = true;      // 渲染引擎据此绘制车形（否则会被画成小人）
    this.x = x; this.y = y;
    // 放格中心，避免碰撞半径5误判相邻格导致初始卡死
    this.px = x * P() + P() / 2;
    this.py = y * P() + P() / 2;
    this.dx = 1; this.dy = 0;
    this.speed = 0;
    this.color = color;
    this.isPolice = !!isPolice;
    this.type = type || (this.isPolice ? 'police' : 'normal');
    const ct = CONFIG.CAR_TYPES[this.type];
    this.maxSpeed = ct ? ct.max : CONFIG.CAR_MAX;
    this.r = 5;
    this.mode = 'patrol';     // patrol / chase / player
    this.turnT = 0;
    this.occupied = false;
    this.avoidT = 0;
    // ---- 驾驶模拟 ----
    this.g = 1;               // 档位：0=空档N 1~5=前进 6=倒档R
    this.turnSignal = 0;      // 转向灯：0关 1左 2右
    this.handbrake = false;   // 手刹（每帧由输入更新）
    this.drift = false;       // 漂移中（跑车专属）
    this.vx = 1; this.vy = 0; // 漂移动量方向（侧滑）
  }
  /* 当前档位允许的最高速度（格/秒），受车型极速封顶 */
  gearMaxNow() {
    return Math.min(CONFIG.DRIVE.gearMax[this.g] || 0, this.maxSpeed);
  }
  move(dt, world, driver) {
    const px = this.px + this.dx * this.speed * P() * dt;
    const py = this.py + this.dy * this.speed * P() * dt;
    const ok = (x, y) => MapGen.isWalkable(this.map, Math.floor(x / P()), Math.floor(y / P()));
    // 只检查车头方向两前角 + 车身中心格（车尾角允许悬空，避免路口对角卡死）。
    // 车头方向探测距离 probe 有下限：车在格边缘/速度接近0时，r=5px 探不到前方格，
    // 会误判"可走"导致车贴墙原地摩擦。probe 至少 5+4=9px，保证恒探到前方格。
    // （与 tryDir 用同一 probe 公式，杜绝探测与移动不一致）
    const mv = this.speed * P() * dt;
    const probe = this.r + Math.max(mv, 4);
    const hx = this.dx, hy = this.dy;
    const lx = -hy, ly = hx;
    const blocked =
      !(ok(this.px + hx * probe + lx * 3, this.py + hy * probe + ly * 3) &&
        ok(this.px + hx * probe - lx * 3, this.py + hy * probe - ly * 3) &&
        ok(px, py));
    if (blocked) {
      this.speed *= 0.75;
      // 玩家开车撞墙只减速、不抢方向盘（方向由玩家自己控制）。
      // NPC 车脱困由调用方 steerEscape() 统一处理（updateNpc/updateChase），
      // 这里不再 turnRandom，避免两套转向互相覆盖导致卡墙死循环。
    } else {
      this.px = px; this.py = py;
    }
    this.px = Math.max(4, Math.min(this.map.w * P() - 4, this.px));
    this.py = Math.max(4, Math.min(this.map.h * P() - 4, this.py));
    // 撞玩家（仅追捕模式的警车在撞到步行玩家时触发逮捕，巡逻车不误伤）
    if (this.isPolice && this.mode === 'chase' && driver !== world.player && world.player.alive) {
      const pl = world.player;
      const d = Math.hypot(pl.px - this.px, pl.py - this.py);
      if (d < 8 && this.speed > 6) {
        if (!pl.car) world.policeArrest(pl);
      }
    }
    return blocked;
  }
  turnRandom() {
    const dirs = [[this.dy, -this.dx], [-this.dy, this.dx], [-this.dx, -this.dy]];
    const d = dirs[(Math.random() * dirs.length) | 0];
    this.dx = d[0]; this.dy = d[1];
  }
  /* NPC车：沿道路巡游（遵守红绿灯；追捕/任务车不在此列） */
  updateNpc(dt, world) {
    if (this.occupied) return;
    if (this.mode === 'escort' || this.mode === 'race') return;   // 由任务系统驱动
    // 红灯停车：前方路口是红灯且本车朝该方向 → 减速停住等变灯（追捕警车不守灯）
    if (!this.isPolice) {
      const L = world.trafficLights;
      if (L && L.length) {
        const fgx = Math.floor((this.px + this.dx * 2 * P()) / P());
        const fgy = Math.floor((this.py + this.dy * 2 * P()) / P());
        const horiz = Math.abs(this.dx) >= Math.abs(this.dy);
        const red = horiz ? world.trafficPhase === 1 : world.trafficPhase === 0;
        const light = L.find(l => l.x === fgx && l.y === fgy);
        if (light && red) {
          this.speed += (0 - this.speed) * Math.min(1, 5 * dt);   // 急刹等灯
          return;
        }
      }
    }
    // 巡航速度渐变（不能每帧硬设，否则 move 的"减速→转向脱困"机制失效，撞墙会永久卡死）
    // 直路车速提高（10~15 格/秒），让路上车流有真实威胁：步行横穿马路会被创死
    // 台风天/大雪天全城减速（恶劣天气谨慎驾驶）
    let cruise = 10 + Math.random() * 5;
    if (world.typhoonActive) cruise *= (1 - CONFIG.WEATHER.npcSlow);
    if (world.snowActive && world.weather.power >= 3) cruise *= CONFIG.WEATHER.snowNpcSlow;
    this.speed += (cruise - this.speed) * Math.min(1, 2 * dt);
    this.turnT -= dt;
    // 前方不是路→路口转向
    const aheadX = this.px + this.dx * 2 * P(), aheadY = this.py + this.dy * 2 * P();
    if (!MapGen.isRoad(this.map, Math.floor(aheadX / P()), Math.floor(aheadY / P())) || this.turnT <= 0) {
      if (Math.random() < 0.7) {
        // 优先转向可走的垂直方向
        const left = [this.dy, -this.dx], right = [-this.dy, this.dx];
        const lx = this.px + left[0] * P(), ly = this.py + left[1] * P();
        const rx = this.px + right[0] * P(), ry = this.py + right[1] * P();
        if (MapGen.isRoad(this.map, Math.floor(lx / P()), Math.floor(ly / P()))) { this.dx = left[0]; this.dy = left[1]; }
        else if (MapGen.isRoad(this.map, Math.floor(rx / P()), Math.floor(ry / P()))) { this.dx = right[0]; this.dy = right[1]; }
        else { this.dx = -this.dx; this.dy = -this.dy; }
      } else {
        this.dx = -this.dx; this.dy = -this.dy;
      }
      this.turnT = 1 + Math.random() * 2;
    }
    // 被挡：重扫脱困方向（与 move 同源判定，avoidT 短暂抑制朝玩家转向避免拉回墙里）
    const blocked = this.move(dt, world, null);
    if (blocked) this.steerEscape(dt);
  }
  /* 该方向能否前进：与 move() 用完全相同的公式——同一帧 speed×P×dt 位移、同一个
     车头角探测距离 probe(=r+max(mv,4))、同一中心格。逐位一致，杜绝"探测说能走、
     move 说撞墙"死循环；同时 probe 有下限，speed 接近 0 / 车贴格边缘时仍能感知前方墙，
     避免车原地摩擦不转向。 */
  tryDir(dx, dy, dt) {
    const P8 = P();
    const ok = (x, y) => MapGen.isWalkable(this.map, Math.floor(x / P8), Math.floor(y / P8));
    const mv = this.speed * P8 * (dt || 1 / 60);
    const probe = this.r + Math.max(mv, 4);
    const hx = dx, hy = dy;
    const lx = -hy, ly = hx;
    return ok(this.px + hx * probe + lx * 3, this.py + hy * probe + ly * 3) &&
           ok(this.px + hx * probe - lx * 3, this.py + hy * probe - ly * 3) &&
           ok(this.px + hx * mv, this.py + hy * mv);
  }
  /* 脱困寻路：按 直行→左→右→掉头 顺序找 move 一定走得动的方向 */
  steerEscape(dt) {
    const cands = [
      [this.dx, this.dy],
      [this.dy, -this.dx], [-this.dy, this.dx],
      [-this.dx, -this.dy]
    ];
    for (const [dx, dy] of cands) {
      if (this.tryDir(dx, dy, dt)) { this.dx = dx; this.dy = dy; return; }
    }
    // 死胡同（四面全堵）：掉头向来路倒车挤出——来路必然可走
    this.reverseOut();
  }
  /* 死胡同兜底：调头+向来路倒车 2px。来路是车刚开过来的方向，必可走；
     即使双向死胡同，反复倒车也让车保持移动（不判卡死） */
  reverseOut() {
    this.dx = -this.dx; this.dy = -this.dy;
    this.px += this.dx * 2; this.py += this.dy * 2;
    this.px = Math.max(4, Math.min(this.map.w * P() - 4, this.px));
    this.py = Math.max(4, Math.min(this.map.h * P() - 4, this.py));
  }
  /* 追捕脱困：与 steerEscape 同构，但优先选"朝玩家方向"的可走方向，
     避免警车绕行绕到反方向去（无全局寻路时的局部最优） */
  chaseEscape(world, dt) {
    const pl = world.player;
    const wantAng = Math.atan2(pl.py - this.py, pl.px - this.px);
    const cands = [
      [this.dx, this.dy],
      [this.dy, -this.dx], [-this.dy, this.dx],
      [-this.dx, -this.dy]
    ];
    let best = null, bestScore = Infinity;
    for (const [dx, dy] of cands) {
      if (!this.tryDir(dx, dy, dt)) continue;
      const a = Math.atan2(dy, dx);
      const diff = Math.abs(Math.atan2(Math.sin(wantAng - a), Math.cos(wantAng - a)));
      if (diff < bestScore) { bestScore = diff; best = [dx, dy]; }
    }
    if (best) { this.dx = best[0]; this.dy = best[1]; return; }
    // 死胡同：掉头向来路倒车挤出（来路必然可走）
    this.reverseOut();
  }
  /* 警车：追捕玩家 */
  updateChase(dt, world) {
    const pl = world.player;
    if (!pl.alive) return;
    const d = Math.hypot(pl.px - this.px, pl.py - this.py);
    if (d < 2.5 * P()) { world.policeArrest(pl); return; }
    // 速度渐变（不能每帧硬设，否则 move 的"减速→脱困"机制失效，追捕会撞墙卡死）
    const target = Math.min(11 + world.player.wanted * 1.2, 17);
    this.speed += (target - this.speed) * Math.min(1, 2.5 * dt);
    // 被挡后保持脱困方向 avoidT 秒，避免平滑转向立刻把车拉回墙里
    if (this.avoidT > 0) {
      this.avoidT -= dt;
    } else {
      const ang = Math.atan2(pl.py - this.py, pl.px - this.px);
      const cur = Math.atan2(this.dy, this.dx);
      let diff = Math.atan2(Math.sin(ang - cur), Math.cos(ang - cur));
      const maxTurn = 4.2 * dt;
      const newAng = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
      this.dx = Math.cos(newAng); this.dy = Math.sin(newAng);
    }
    // 被挡：朝玩家方向智能绕行（与 move 同源判定；avoidT 短暂抑制朝玩家转向避免拉回墙里）
    if (this.move(dt, world, null)) { this.chaseEscape(world, dt); this.avoidT = 0.6; }
  }
}

/* ---------- 世界 ---------- */
class World {
  constructor(mapId) {
    this.mapId = mapId;
    this.map = mapId === 'city' ? MapGen.genCityMap() : MapGen.generate(mapId);
    MapGen.renderToCanvas(this.map);
    this.player = new Player(this.map);
    this.npcs = [];
    this.cars = [];
    this.police = [];
    this.businesses = this.map.businesses.map(b => Object.assign({ owned: false, level: 1, timer: 0 }, b));
    this.homes = (this.map.homes || []).map(h => Object.assign({ owned: false }, h));   // 房产（买房系统）
    this.taskPoints = this.map.tasks.map(t => Object.assign({}, t));
    this.task = null;           // 当前任务 {type, tx, ty, timer, ...}
    this.escapeTimer = 0;
    this.incomeTimer = 0;
    this.rentTimer = 0;         // 房租结算计时（30秒一次，全局房产都收租）
    this.noticeTimer = 0;
    this.noticeText = '';
    this.dayT = CONFIG.DAY_LENGTH * 8 / 24;  // 从早上8点开始，避免新游戏开场就是黑夜
    this.pickup = null;          // 随机街头失物包裹 {x,y,t}
    this.pickupT = 12 + Math.random() * 15;  // 首次刷包裹倒计时
    this.trafficLights = (this.map.trafficLights || []);  // 红绿灯路口
    this.redLightCooldown = {};  // 闯红灯冷却（避免同一灯连续罚单）
    // ---- 季节 / 天气 / 严寒 ----
    this.dayCount = 0;           // 累计游戏天数（季节演化，存档恢复）
    this.weather = { kind: 'none', power: 0, timer: 0, windAngle: 0 };
    this.cold = 0;               // 寒冷值 0~100（沈阳冬/雪天室外累积）
    this.driftMarks = [];        // 漂移胎痕 {x,y,life}
    this.generatePop();
    this.spawnTrafficPolice();
  }

  /* 当前季节：0春 1夏 2秋 3冬（每 SEASONS.len 游戏天换季，一年160天） */
  get season() { return Math.floor(this.dayCount / CONFIG.SEASONS.len) % 4; }
  get seasonName() { return ['春', '夏', '秋', '冬'][this.season]; }
  /* 台风进行中（上海等主城区特殊天气） */
  get typhoonActive() { return this.weather.kind === 'typhoon'; }
  /* 下雪进行中（沈阳冬天限定） */
  get snowActive() { return this.weather.kind === 'snow'; }

  /* 当前红绿灯相位：0=东西向绿/南北红，1=南北绿/东西红（随游戏时间推进） */
  get trafficPhase() { return Math.floor(this.dayT / CONFIG.TRAFFIC.phaseLen) % 2; }

  /* 生成交警：站在部分红绿灯路口旁的人行道上（站定指挥交通） */
  spawnTrafficPolice() {
    const m = this.map;
    const L = this.trafficLights;
    if (!L.length) return;
    const count = Math.max(1, Math.min(3, Math.floor(L.length / 4)));
    for (let i = 0; i < count; i++) {
      const lt = L[(Math.random() * L.length) | 0];
      let placed = false;
      for (let tries = 0; tries < 40 && !placed; tries++) {
        const a = Math.random() * Math.PI * 2;
        const x = Math.floor(lt.x + Math.cos(a) * 3);
        const y = Math.floor(lt.y + Math.sin(a) * 3);
        if (x > 2 && y > 2 && x < m.w - 2 && y < m.h - 2 &&
            MapGen.isWalkable(m, x, y) && !MapGen.isRoad(m, x, y)) {
          const tp = new Npc(m, x, y, '#1f3a5f');
          tp.isTrafficPolice = true;
          tp.stand = true;          // 站定指挥
          tp.assignedLight = lt;    // 关联所属路口
          this.npcs.push(tp);
          placed = true;
        }
      }
    }
  }

  /* 当前游戏小时 0-24（一天=DAY_LENGTH 秒） */
  get timeOfDay() { return (this.dayT / CONFIG.DAY_LENGTH) * 24 % 24; }

  /* ---- 交通玩法：闯红灯检测（玩家开车经过红灯路口时触发） ---- */
  checkRedLight(p) {
    const c = p.car;
    if (!c || !this.trafficLights.length) return;
    // 车在移动才算"闯"：停着等红灯/刚上车停在路口都不该挨罚
    if (c.speed < 3) return;
    // 玩家车的行驶方向主轴
    const horiz = Math.abs(c.dx) >= Math.abs(c.dy);
    const red = horiz ? this.trafficPhase === 1 : this.trafficPhase === 0;
    if (!red) return;
    const gx = Math.floor(c.px / P()), gy = Math.floor(c.py / P());
    // 检测范围放宽到灯格±1格（路口区域）：高速通过时车中心可能跳过灯格中心，
    // 只在灯格正中判定会漏检；同时避免"车头已过线"的视觉违和
    const light = this.trafficLights.find(l => Math.abs(l.x - gx) <= 1 && Math.abs(l.y - gy) <= 1);
    if (!light) return;
    const key = light.x + ',' + light.y;
    if ((this.redLightCooldown[key] || 0) > 0) return;   // 冷却防刷屏
    this.redLightCooldown[key] = CONFIG.TRAFFIC.lightCooldown;
    // 该路口是否有交警在场（关联本路口）
    const tp = this.npcs.find(n => n.isTrafficPolice && n.assignedLight === light);
    // 闯红灯一律通缉+1星 → 自动刷追捕警车（交警呼叫支援/监控记录）
    this.addWanted(1);
    if (tp) {
      const fine = CONFIG.TRAFFIC.trafficFine;
      p.money = Math.max(0, p.money - fine);
      STATS.fines++;
      this.notice('🚦 交警拦下你：闯红灯罚 ¥' + fine + '，呼叫支援追捕你（通缉+1星）！');
    } else {
      this.notice('🚦 你闯红灯了！交警追来了（通缉+1星）');
    }
  }

  /* ---- 被创会死：玩家步行在道路上被非追捕车高速撞到 → 送医 ---- */
  checkCarCrash(p) {
    if (!p.alive || p.car) return;
    // 只有站在道路格上才可能被创：站人行道/广场/草坪（合法位置）时，
    // 车在路中央擦过（车中心距人行道仅8px）不该把人创进医院
    if (!MapGen.isRoad(this.map, Math.floor(p.px / P()), Math.floor(p.py / P()))) return;
    const fatal = CONFIG.TRAFFIC.fatalSpeed;
    for (const c of this.cars) {
      if (c.mode === 'chase') continue;   // 追捕警车撞玩家走"逮捕"逻辑，不判被创死
      if (c.speed <= fatal) continue;
      const d = Math.hypot(c.px - p.px, c.py - p.py);
      if (d < 10) { this.crashPlayer(p); return; }
    }
  }
  /* 被创死亡结算 */
  crashPlayer(p) {
    if (!p.alive) return;
    p.alive = false;
    STATS.crashed++;
    // 追捕警车撤离转巡逻（玩家已昏迷送医，通缉清零后不该再被追）
    this.police.forEach(c => { if (c.mode === 'chase') c.mode = 'patrol'; });
    const fee = CONFIG.TRAFFIC.hospitalFee;
    p.money = Math.max(0, p.money - fee);
    p.wanted = 0;
    this.notice('💥 你被车撞飞了！伤势严重…');
    UI.showArrest('你被撞得昏迷过去，热心路人把你送进医院，住院费 ¥' + fee + '。', () => {
      p.alive = true;
      this.cold = 0;   // 住院回暖：否则沈阳冬天出院即冻僵、10秒又冻死
      const m = this.map;
      const s = m.spawn || { x: m.w >> 1, y: m.h >> 1 };
      // 重生到"非道路"的可走格（人行道/街区空地）：否则重生在路中央会被车
      // 立刻再撞进医院 → 无限"送医→重生→再送医"死循环
      const f = MapGen.findWalkableNotRoad(m, s.x, s.y);
      p.px = f.x * P() + P() / 2; p.py = f.y * P() + P() / 2;
      p.x = f.x; p.y = f.y;
      if (p.car) { p.car.occupied = false; p.car = null; }
      worldSave();
    }, { title: '🚑 你被送进医院', btn: '出院继续' });
  }

  generatePop() {
    const m = this.map;
    const W = m.w * P(), H = m.h * P();
    const colors = ['#e67e22','#8e44ad','#2980b9','#27ae60','#c0392b','#d35400','#7f8c8d'];
    let guard = 0;
    for (let i = 0; i < 46 && guard < 5000; i++, guard++) {
      const x = 10 + Math.floor(Math.random() * (m.w - 20));
      const y = 10 + Math.floor(Math.random() * (m.h - 20));
      if (MapGen.isWalkable(m, x, y)) {
        this.npcs.push(new Npc(m, x, y, colors[(Math.random() * colors.length) | 0]));
      } else i--;
    }
    // NPC车（随机类型：轿车/跑车/出租/卡车）
    const carPool = [
      { t: 'normal', c: '#e67e22' }, { t: 'normal', c: '#8e44ad' }, { t: 'normal', c: '#2980b9' },
      { t: 'normal', c: '#27ae60' }, { t: 'normal', c: '#7f8c8d' },
      { t: 'sports', c: '#e74c3c' }, { t: 'sports', c: '#c0392b' },
      { t: 'taxi',   c: '#f5c542' },
      { t: 'truck',  c: '#95a5a6' }, { t: 'truck',  c: '#839192' }
    ];
    for (let i = 0; i < 14 && guard < 6000; i++, guard++) {
      const x = 20 + Math.floor(Math.random() * (m.w - 40));
      const y = 20 + Math.floor(Math.random() * (m.h - 40));
      if (MapGen.isRoad(m, x, y)) {
        const pk = carPool[(Math.random() * carPool.length) | 0];
        this.cars.push(new Car(m, x, y, pk.c, false, pk.t));
      } else i--;
    }
    // 巡逻警车（2辆，在路上）
    const pc = ['#1e3a8a', '#16295c'];
    for (let i = 0; i < 2 && guard < 7000; i++, guard++) {
      const x = 30 + Math.floor(Math.random() * (m.w - 60));
      const y = 30 + Math.floor(Math.random() * (m.h - 60));
      if (MapGen.isRoad(m, x, y)) {
        const c = new Car(m, x, y, pc[i % 2], true);
        c.speed = 0;
        this.police.push(c);
        this.cars.push(c);
      } else i--;
    }
  }

  /* 交互目标检测：返回最近可交互对象 */
  findInteract() {
    const pl = this.player;
    const near = [];
    const d2 = 4.5 * P();
    // 车辆（步行时）
    if (!pl.car) {
      this.cars.forEach(c => {
        if (c.occupied) return;
        const d = Math.hypot(c.px - pl.px, c.py - pl.py);
        if (d < d2) near.push({ kind: 'car', car: c, label: '按 E 上车', d });
      });
    } else {
      near.push({ kind: 'exit', car: pl.car, label: '按 E 下车', d: 0 });
    }
    // 业务点（未拥有）
    this.businesses.forEach(b => {
      if (b.owned) return;
      const d = Math.hypot(b.x * P() - pl.px, b.y * P() - pl.py);
      if (d < d2 + 6) near.push({ kind: 'business', b, label: '按 F 查看产业', d });
    });
    // 房产（看房/回家）
    this.homes.forEach(h => {
      const d = Math.hypot(h.x * P() - pl.px, h.y * P() - pl.py);
      if (d < d2 + 6) near.push({ kind: 'home', h, label: h.owned ? '按 F 回家' : '按 F 看房', d });
    });
    // 任务点
    this.taskPoints.forEach(t => {
      const d = Math.hypot(t.x * P() - pl.px, t.y * P() - pl.py);
      if (d < d2 + 6) near.push({ kind: 'task', t, label: '按 F 接任务', d });
    });
    // 可交谈的路人（步行时，且非倒地/隐身/乘客；交警站岗可交谈——交通提示）
    if (!pl.car) {
      this.npcs.forEach(n => {
        if (n.down > 0 || n.hidden) return;
        if (n.stand && !n.isTrafficPolice) return;
        // 追捕任务的小偷：可走近按 F 制服
        if (n.isThief) {
          const d = Math.hypot(n.px - pl.px, n.py - pl.py);
          if (d < 3 * P()) near.push({ kind: 'thief', npc: n, label: '按 F 制服小偷', d });
          return;
        }
        const d = Math.hypot(n.px - pl.px, n.py - pl.py);
        if (d < 3 * P()) near.push({ kind: 'talk', npc: n, label: '按 G 交谈', d });
      });
    }
    // 传送点
    this.map.transfers.forEach(tp => {
      const d = Math.hypot(tp.x * P() - pl.px, tp.y * P() - pl.py);
      if (d < d2 + 4) near.push({ kind: 'transfer', tp, label: '按 F 打开地图传送', d });
    });
    // 总览区块
    if (this.map.zones) {
      this.map.zones.forEach(z => {
        const d = Math.hypot(z.x * P() - pl.px, z.y * P() - pl.py);
        if (d < d2 + 4) near.push({ kind: 'zone', z, label: '按 F 进入 ' + z.name, d });
      });
    }
    near.sort((a, b) => a.d - b.d);
    return near[0] || null;
  }

  /* 通缉 */
  addWanted(n) {
    const p = this.player;
    p.wanted = Math.min(5, p.wanted + n);
  }
  spawnChasePolice() {
    // 从玩家附近道路生成警车；200次随机采样，失败则全图找最近路格兜底，
    // 保证通缉后必有警车追（否则玩家被通缉却无警车是体验 bug）
    const m = this.map;
    const ppx = this.player.px / P(), ppy = this.player.py / P();
    for (let i = 0; i < 200; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = Math.floor(ppx + Math.cos(a) * (18 + Math.random() * 26));
      const y = Math.floor(ppy + Math.sin(a) * (18 + Math.random() * 26));
      if (x > 4 && y > 4 && x < m.w - 4 && y < m.h - 4 && MapGen.isRoad(m, x, y)) {
        const c = new Car(m, x, y, Math.random() < 0.5 ? '#1e3a8a' : '#16295c', true);
        c.mode = 'chase';
        this.police.push(c);
        this.cars.push(c);
        return;
      }
    }
    // 全图回退：找离玩家最近的可走道路格（从玩家位置螺旋/线性扫描）
    let bx = -1, by = -1, bd = Infinity;
    const psx = Math.max(2, Math.min(m.w - 3, Math.floor(ppx)));
    const psy = Math.max(2, Math.min(m.h - 3, Math.floor(ppy)));
    for (let r = 0; r <= 60 && bx < 0; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = psx + dx, y = psy + dy;
        if (x > 4 && y > 4 && x < m.w - 4 && y < m.h - 4 && MapGen.isRoad(m, x, y)) {
          const d = dx * dx + dy * dy;
          if (d < bd) { bd = d; bx = x; by = y; }
        }
      }
      if (bx >= 0) break;
    }
    if (bx < 0) { bx = 40; by = 40; }   // 极端兜底（几乎不会走到）
    const c = new Car(m, bx, by, '#1e3a8a', true);
    c.mode = 'chase';
    this.police.push(c);
    this.cars.push(c);
  }
  policeArrest(pl) {
    if (!pl.alive) return;
    pl.alive = false;
    STATS.arrests++;
    // 追捕结束：所有追捕警车撤离转巡逻——否则 wanted 清零后警车继续追，
    // 玩家重生在警局又被抓 → 无限"逮捕→重生→再逮捕"循环
    this.police.forEach(c => { if (c.mode === 'chase') c.mode = 'patrol'; });
    // 罚金
    const fine = 200 + pl.wanted * 150;
    pl.money = Math.max(0, pl.money - fine);
    this.notice('🚨 你被警方控制，罚款 ¥' + fine);
    UI.showArrest('因扰乱公共秩序，缴纳罚金 ¥' + fine + '。', () => {
      pl.alive = true;
      this.cold = 0;   // 警局内回暖：防止沈阳冬天刚出警局又冻僵
      pl.wanted = 0;
      // 传送到最近警局（站警局旁人行道，别站路中央）
      const m = this.map;
      const s = m.police[0] || { x: m.w >> 1, y: m.h >> 1 };
      const f = MapGen.findWalkableNotRoad(m, s.x, s.y);
      pl.px = f.x * P() + P() / 2; pl.py = f.y * P() + P() / 2;
      pl.x = f.x; pl.y = f.y;
      if (pl.car) { pl.car.occupied = false; pl.car.mode = 'patrol'; pl.car = null; }
      worldSave();
    });
  }

  /* 边界跨区传送：走到行政区边界（按住对应方向键）→ 进入相邻行政区。
     判定：玩家站立格在区界内，朝向的方向邻格已出区界（几何外）且非水/桥 → 传送。
     水域边界（江/海/运河）不会触发：水格在区界内或为不可走格，玩家走不到。 */
  checkBorderTravel(p) {
    const cfg = MAPS[this.mapId];
    if (!cfg || !cfg.borders) return;
    const tx = Math.floor(p.px / P()), ty = Math.floor(p.py / P());
    const B = cfg.borders;
    const ax = Input.axis();
    if (!ax.x && !ax.y) return;                       // 没按方向键不传送（防止贴边卡住误传）
    const m = this.map;
    const out = (x, y) => !MapGen.pointInShape(x / m.w, y / m.h, cfg.shape);
    const nx = tx + (ax.x > 0 ? 1 : ax.x < 0 ? -1 : 0);
    const ny = ty + (ax.y > 0 ? 1 : ax.y < 0 ? -1 : 0);
    let go = null;
    if (ax.x < 0 && B.west && out(nx, ty)) go = B.west;
    else if (ax.x > 0 && B.east && out(nx, ty)) go = B.east;
    else if (ax.y < 0 && B.north && out(tx, ny)) go = B.north;
    else if (ax.y > 0 && B.south && out(tx, ny)) go = B.south;
    if (!go) return;
    const t = MapGen.tileAt(this.map, nx, ny);
    if (t === CONFIG.TILES.WATER || t === CONFIG.TILES.BRIDGE) return;   // 水上不传送（防几何外水）
    UI.enterMap(go.to, go.dest);
  }

  /* 主更新循环 */
  update(dt) {
    const p = this.player;
    this.dayT += dt;
    if (this.dayT >= CONFIG.DAY_LENGTH) { this.dayT -= CONFIG.DAY_LENGTH; this.dayCount++; }
    STATS.playTime += dt;
    // 季节 / 天气 / 严寒 / 胎痕
    this.updateWeather(dt);
    this.updateCold(dt);
    this.updateDriftMarks(dt);
    // 闯红灯冷却递减
    for (const k in this.redLightCooldown) {
      this.redLightCooldown[k] -= dt;
      if (this.redLightCooldown[k] <= 0) delete this.redLightCooldown[k];
    }
    const px0 = p.px, py0 = p.py;
    p.update(dt, this);
    STATS.distance += (Math.abs(p.px - px0) + Math.abs(p.py - py0)) / P();
    // 边界跨区传送：走到行政区边界（按住对应方向键）→ 进入相邻行政区
    this.checkBorderTravel(p);
    this.npcs.forEach(n => n.update(dt, this));
    this.cars.forEach(c => {
      if (c.occupied) return;            // 玩家驾驶的由 player 更新
      if (c.mode === 'chase') c.updateChase(dt, this);
      else c.updateNpc(dt, this);
    });
    // 交通玩法：玩家开车闯红灯检测 / 步行被车创死
    this.checkRedLight(p);
    this.checkCarCrash(p);

    // ---- 通缉与警察管理 ----
    if (p.wanted > 0) {
      // 附近无警察→逃脱计时
      let seeing = false;
      this.police.forEach(c => {
        const d = Math.hypot(c.px - p.px, c.py - p.py);
        if (d < 22 * P() && c.mode === 'chase') seeing = true;
      });
      if (seeing) this.escapeTimer = 0;
      else this.escapeTimer += dt;
      if (this.escapeTimer > 6) {
        p.wanted = Math.max(0, p.wanted - 1);
        this.escapeTimer = 0;
        if (p.wanted === 0) this.notice('✅ 风头过去了，警察放弃追捕。');
      }
      // 追捕警车数量控制
      let chaseCount = this.police.filter(c => c.mode === 'chase').length;
      if (chaseCount < p.wanted) {
        this.spawnChasePolice();
      }
      // 通缉低时部分警车恢复巡逻
      this.police.forEach(c => {
        if (c.mode === 'chase' && chaseCount > p.wanted + 1) { c.mode = 'patrol'; chaseCount--; }
      });
    } else {
      this.escapeTimer = 0;
      this.police.forEach(c => { if (c.mode === 'chase') c.mode = 'patrol'; });
    }

    // ---- 产业收益（按全局所有权结算，跨区产业照常产出） ----
    this.incomeTimer += dt;
    if (this.incomeTimer >= 10) {
      this.incomeTimer = 0;
      let gained = 0;
      // 本区已拥有
      this.businesses.forEach(b => {
        if (b.owned) { const inc = CONFIG.BUSINESS_TYPES[b.type].income * b.level; gained += inc; }
      });
      // 其他区的产业
      for (const mid in OWNERSHIP) {
        if (mid === this.mapId || !MAPS[mid]) continue;
        const o = OWNERSHIP[mid];
        (MAPS[mid].businesses || []).forEach(cfg => {
          const lv = o[cfg.id];
          if (lv) gained += CONFIG.BUSINESS_TYPES[cfg.type].income * lv;
        });
      }
      if (gained > 0) { p.money += gained; STATS.earned += gained; this.notice('💰 产业收益 +¥' + gained); }
    }

    // ---- 房租结算（全局房产所有权，每 HOME_RENT_CYCLE 秒一次，跨区照常收租）----
    this.rentTimer += dt;
    if (this.rentTimer >= CONFIG.HOME_RENT_CYCLE) {
      this.rentTimer = 0;
      let rent = 0;
      // 本区已购房产
      this.homes.forEach(h => { if (h.owned) rent += h.rent; });
      // 其他区的房产
      for (const mid in HOME_OWNERSHIP) {
        if (mid === this.mapId || !MAPS[mid]) continue;
        (MAPS[mid].homes || []).forEach(cfg => {
          if (HOME_OWNERSHIP[mid][cfg.id]) rent += cfg.rent;
        });
      }
      if (rent > 0) { p.money += rent; STATS.earned += rent; this.notice('🏠 房租收入 +¥' + rent); }
    }

    // ---- 任务推进 ----
    if (this.task && this.task.active) this.updateTask(dt);

    // ---- 随机街头失物包裹 ----
    if (this.pickup) {
      this.pickup.t -= dt;
      if (this.pickup.t <= 0) { this.pickup = null; this.pickupT = 25 + Math.random() * 25; }
      else {
        const cx = this.pickup.x * P() + P() / 2, cy = this.pickup.y * P() + P() / 2;
        if (Math.hypot(p.px - cx, p.py - cy) < 14) {   // 步行或开车碰到即拾取
          const val = 80 + Math.floor(Math.random() * 3) * 60;   // ¥80/140/200
          p.money += val;
          STATS.earned += val;
          this.notice('💼 拾到失物包裹，感谢金 +¥' + val);
          this.pickup = null;
          this.pickupT = 25 + Math.random() * 25;
        }
      }
    } else if ((this.pickupT -= dt) <= 0) {
      this.spawnPickup();
    }

    // ---- 提示计时 ----
    if (this.noticeTimer > 0) this.noticeTimer -= dt;
  }

  /* ---- 天气系统：台风（上海小概率） / 雪（沈阳冬天限定） ---- */
  updateWeather(dt) {
    const W = CONFIG.WEATHER;
    if (this.weather.timer > 0) {
      this.weather.timer -= dt;
      if (this.weather.timer <= 0) this.weather = { kind: 'none', power: 0, timer: 0, windAngle: 0 };
      return;
    }
    const isSH = this.mapId !== 'shenyang' && this.mapId !== 'city';
    if (isSH && Math.random() < W.typhoonChance * dt) {
      const power = W.typhoonMin + Math.floor(Math.random() * (W.typhoonMax - W.typhoonMin + 1));
      this.weather = {
        kind: 'typhoon', power,
        timer: W.durationMin + Math.random() * (W.durationMax - W.durationMin),
        windAngle: Math.random() * Math.PI * 2
      };
      this.notice('🌪️ 台风来袭！风力 ' + power + ' 级，行人注意防风、司机减速慢行！');
    } else if (this.mapId === 'shenyang' && this.season === 3 && Math.random() < W.snowChance * dt) {
      // 沈阳下雪仅限冬天（用户指定）
      const power = W.snowMin + Math.floor(Math.random() * (W.snowMax - W.snowMin + 1));
      this.weather = {
        kind: 'snow', power,
        timer: W.durationMin + Math.random() * (W.durationMax - W.durationMin),
        windAngle: 0
      };
      const nm = { 1: '小雪', 2: '中雪', 3: '大雪' }[power];
      this.notice('❄️ 沈阳下' + nm + '了！户外注意保暖，别待太久');
    }
  }

  /* ---- 严寒：沈阳冬/雪天室外累积寒冷，冻僵→冻死送医 ---- */
  updateCold(dt) {
    const p = this.player;
    const C = CONFIG.COLD;
    const inSy = this.mapId === 'shenyang';
    const winter = this.season === 3;
    const snowing = this.weather.kind === 'snow';
    // 非寒冷区（或沈阳非冬天无雪）：自然回暖
    if (!inSy || !(winter || snowing)) {
      this.cold = Math.max(0, this.cold - C.idleWarm * dt);
      return;
    }
    // 车内：暖，快速回暖
    if (p.car) { this.cold = Math.max(0, this.cold - C.warmCar * dt); return; }
    // 取暖点：便利店/加油站/改装车行旁
    const nearWarm = this.businesses.some(b =>
      Math.hypot(b.x * P() - p.px, b.y * P() - p.py) < 12 * P());
    if (nearWarm) {
      this.cold = Math.max(0, this.cold - C.warmZone * dt);
      if (this.cold < 5 && Math.random() < dt) this.notice('🔥 靠近店铺取暖，暖和多了');
      return;
    }
    // 室外：越下雪冷得越快（雪量加成）
    const rate = C.baseRate + (snowing ? C.snowRate * this.weather.power : 0);
    this.cold = Math.min(100, this.cold + rate * dt);
    if (this.cold >= 100) { this.freezeDeath(); return; }
    if (this.cold >= C.moveAt && Math.random() < dt * 0.6) this.notice('🥶 你冻僵了，动弹不得！快找地方取暖！');
    else if (this.cold >= C.interactAt && Math.random() < dt * 0.6) this.notice('❄️ 手冻僵了，无法交互…');
  }

  /* 冻死：回医院（与送医同流程，文案/统计独立） */
  freezeDeath() {
    const p = this.player;
    if (!p.alive) return;
    p.alive = false;
    STATS.frozen++;
    const fee = CONFIG.COLD.freezeFee;
    p.money = Math.max(0, p.money - fee);
    this.police.forEach(c => { if (c.mode === 'chase') c.mode = 'patrol'; });
    this.notice('🥶 你在严寒中失去意识！');
    UI.showArrest('严寒中你在户外失去意识，好心人把你送进医院，治疗费 ¥' + fee + '。', () => {
      p.alive = true;
      this.cold = 0;
      const m = this.map;
      const s = m.spawn || { x: m.w >> 1, y: m.h >> 1 };
      const f = MapGen.findWalkableNotRoad(m, s.x, s.y);
      p.px = f.x * P() + P() / 2; p.py = f.y * P() + P() / 2;
      p.x = f.x; p.y = f.y;
      if (p.car) { p.car.occupied = false; p.car = null; }
      worldSave();
    }, { title: '🚑 你被送进医院', btn: '出院继续' });
  }

  /* 漂移胎痕淡出 */
  updateDriftMarks(dt) {
    if (!this.driftMarks.length) return;
    for (let i = this.driftMarks.length - 1; i >= 0; i--) {
      this.driftMarks[i].life -= dt * 0.5;
      if (this.driftMarks[i].life <= 0) this.driftMarks.splice(i, 1);
    }
  }

  /* 在玩家附近刷一个失物包裹（人行道等非道路可走格——放路中央玩家去捡会被车创） */
  spawnPickup() {
    const m = this.map;
    const ppx = this.player.px / P(), ppy = this.player.py / P();
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 12 + Math.random() * 45;
      const x = Math.floor(ppx + Math.cos(a) * r);
      const y = Math.floor(ppy + Math.sin(a) * r);
      if (x > 2 && y > 2 && x < m.w - 2 && y < m.h - 2 &&
          MapGen.isWalkable(m, x, y) && !MapGen.isRoad(m, x, y)) {
        this.pickup = { x, y, t: 30 };
        this.notice('💼 路边有个失物包裹！捡起来有感谢金');
        return;
      }
    }
    // 兜底：BFS 找最近非道路可走格（水域/建筑密集区随机采样可能落空）
    const f = MapGen.findWalkableNotRoad(m, Math.floor(ppx), Math.floor(ppy));
    if (f && !MapGen.isRoad(m, f.x, f.y)) {
      this.pickup = { x: f.x, y: f.y, t: 30 };
      this.notice('💼 路边有个失物包裹！捡起来有感谢金');
    }
  }

  /* 任务车朝目标点驾驶：前方不可走时自动绕行（试探垂直方向），掉头后短暂保持避免振荡 */
  steerToward(car, tx, ty) {
    const P8 = P();
    const ang = Math.atan2(ty * P8 - car.py, tx * P8 - car.px);
    const wdx = Math.cos(ang), wdy = Math.sin(ang);
    const walk = (x, y) => MapGen.isWalkable(car.map, Math.floor(x / P8), Math.floor(y / P8));
    if (walk(car.px + wdx * 2 * P8, car.py + wdy * 2 * P8)) { car.dx = wdx; car.dy = wdy; car.avoidT = 0; return; }
    for (const [vx, vy] of [[wdy, -wdx], [-wdy, wdx]]) {
      if (walk(car.px + vx * 2 * P8, car.py + vy * 2 * P8)) { car.dx = vx; car.dy = vy; car.avoidT = 0.5; return; }
    }
    car.dx = -wdx; car.dy = -wdy; car.avoidT = 0.8;
  }

  /* 任务系统 */
  startTask(t) {
    const m = this.map;
    // 找终点：必须在道路网格上、离起点够远、且在地图内部(边界留5格)
    // 1) 随机采样200次；2) 失败则遍历全图回退，保证永不落在图外/不可达处
    let tx = t.x, ty = t.y, found = false;
    for (let i = 0; i < 200 && !found; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 80;
      const nx = Math.floor(t.x + Math.cos(a) * r);
      const ny = Math.floor(t.y + Math.sin(a) * r);
      if (nx > 5 && ny > 5 && nx < m.w - 5 && ny < m.h - 5 &&
          MapGen.isRoad(m, nx, ny) && Math.hypot(nx - t.x, ny - t.y) >= 30) {
        tx = nx; ty = ny; found = true;
      }
    }
    if (!found) {
      let best = null, bestD = Infinity;
      for (let y = 5; y < m.h - 5; y++) for (let x = 5; x < m.w - 5; x++) {
        if (MapGen.isRoad(m, x, y)) {
          const d = (x - t.x) * (x - t.x) + (y - t.y) * (y - t.y);
          if (d >= 30 * 30 && d < bestD) { bestD = d; best = { x, y }; }
        }
      }
      if (best) { tx = best.x; ty = best.y; }
    }
    const info = CONFIG.TASK_TYPES[t.type];
    this.task = { type: t.type, sx: t.x, sy: t.y, tx, ty, timer: info.time, active: true, escortCar: null, raceCar: null };
    if (t.type === 'escort') {
      // 生成运钞车（矫正到可行走格，避免卡建筑/水域）
      const f = MapGen.findWalkable(m, t.x + 2, t.y);
      const ec = new Car(m, f.x, f.y, '#f1c40f', false, 'truck');
      ec.mode = 'escort';
      this.cars.push(ec);
      this.task.escortCar = ec;
    }
    if (t.type === 'race') {
      // 生成对手车（矫正到可行走格）
      const f = MapGen.findWalkable(m, t.x - 3, t.y);
      const rc = new Car(m, f.x, f.y, '#e74c3c', false, 'sports');
      rc.mode = 'race';
      this.cars.push(rc);
      this.task.raceCar = rc;
    }
    if (t.type === 'taxi') {
      // 生成等车乘客（站定在任务点旁）
      const f = MapGen.findWalkable(m, t.x + 1, t.y + 1);
      const pg = new Npc(m, f.x, f.y, '#f39c12');
      pg.stand = true;
      this.npcs.push(pg);
      this.task.passenger = pg;
    }
    if (t.type === 'thief') {
      // 生成小偷：任务点附近，速度9格/秒（步行追不上，需开车）
      const f = MapGen.findWalkable(m, t.x + 3, t.y);
      const th = new Npc(m, f.x, f.y, '#7f1d1d');
      th.isThief = true;
      th.speed = 9 * P();
      this.npcs.push(th);
      this.task.thiefNpc = th;
      this.notice('🚨 小偷出现在附近！开车追上并撞停/按F制服他！');
    }
    this.notice('📋 任务开始：' + info.name + ' — 限时 ' + info.time + ' 秒');
  }
  updateTask(dt) {
    const t = this.task;
    t.timer -= dt;
    if (t.timer <= 0) {
      this.notice('❌ 任务超时，失败了。');
      this.task.active = false;
      if (t.escortCar) this.cars = this.cars.filter(c => c !== t.escortCar);
      if (t.raceCar) this.cars = this.cars.filter(c => c !== t.raceCar);
      if (t.passenger) { t.passenger.hidden = true; this.npcs = this.npcs.filter(n => n !== t.passenger); }
      if (t.thiefNpc) { t.thiefNpc.hidden = true; this.npcs = this.npcs.filter(n => n !== t.thiefNpc); }
      return;
    }
    const info = CONFIG.TASK_TYPES[t.type];
    const p = this.player;
    const dist = Math.hypot(t.tx * P() - p.px, t.ty * P() - p.py);
    if (t.type === 'delivery') {
      if (dist < 2.5 * P()) {
        p.money += info.reward;
        STATS.tasks++; STATS.earned += info.reward;
        this.notice('✅ 货物送达！+¥' + info.reward);
        this.task.active = false;
      }
    } else if (t.type === 'escort') {
      const ec = t.escortCar;
      if (!ec) { this.task.active = false; return; }
      // 运钞车自动开向终点（遇墙绕行，掉头缓冲避免抖动）
      if (ec.avoidT > 0) ec.avoidT -= dt; else this.steerToward(ec, t.tx, t.ty);
      ec.speed = 7;
      ec.move(dt, this, null);
      const escortDist = Math.hypot(ec.px - p.px, ec.py - p.py);
      if (escortDist > 12 * P()) {
        this.notice('⚠️ 运钞车离你太远了！快跟上去！');
        this.task.escortLost = (this.task.escortLost || 0) + dt;
        if (this.task.escortLost > 6) { this.notice('❌ 押运失败：跟丢了运钞车。'); this.task.active = false; this.cars = this.cars.filter(c => c !== ec); }
      } else { this.task.escortLost = 0; }
      if (Math.hypot(t.tx * P() - ec.px, t.ty * P() - ec.py) < 2.5 * P()) {
        p.money += info.reward;
        STATS.tasks++; STATS.earned += info.reward;
        this.notice('✅ 押运完成！+¥' + info.reward);
        this.task.active = false;
        this.cars = this.cars.filter(c => c !== ec);
      }
    } else if (t.type === 'race') {
      const rc = t.raceCar;
      if (!rc) { this.task.active = false; return; }
      // 对手车向终点开（遇墙绕行，掉头缓冲避免抖动）
      if (rc.avoidT > 0) rc.avoidT -= dt; else this.steerToward(rc, t.tx, t.ty);
      rc.speed = 10 + Math.random() * 0.6;
      rc.move(dt, this, null);
      const rd = Math.hypot(t.tx * P() - rc.px, t.ty * P() - rc.py);
      if (rd < 2.5 * P()) { this.notice('❌ 对手先到终点，你输了。'); this.task.active = false; this.cars = this.cars.filter(c => c !== rc); }
      if (dist < 2.5 * P()) {
        p.money += info.reward;
        STATS.tasks++; STATS.earned += info.reward;
        this.notice('🏁 你赢了比赛！+¥' + info.reward);
        this.task.active = false;
        this.cars = this.cars.filter(c => c !== rc);
      }
    } else if (t.type === 'taxi') {
      const pg = t.passenger;
      if (!pg) { this.task.active = false; return; }
      if (!pg.boarded) {
        // 玩家开车靠近乘客 → 接客
        if (p.car && Math.hypot(pg.px - p.px, pg.py - p.py) < 2.5 * P()) {
          pg.boarded = true; pg.hidden = true;
          this.notice('🚕 乘客已上车，出发去目的地！');
        } else {
          // 3秒提示一次，避免刷屏
          if ((this.taxiHintT = (this.taxiHintT || 0) - dt) <= 0) {
            this.taxiHintT = 3;
            this.notice('🚕 请开车到乘客身边接他上车');
          }
        }
      } else {
        // 已接客：开到终点完成
        if (dist < 2.5 * P()) {
          p.money += info.reward;
          STATS.tasks++; STATS.earned += info.reward;
          this.notice('✅ 乘客已送达！+¥' + info.reward);
          this.task.active = false;
          this.npcs = this.npcs.filter(n => n !== pg);
        }
      }
    } else if (t.type === 'thief') {
      const th = t.thiefNpc;
      if (!th || th.hidden) { this.task.active = false; return; }
      // 小偷跑远提示（不影响进度，限时内追上即可）
      if (Math.hypot(th.px - p.px, th.py - p.py) > 55 * P() && (this.thiefWarnT = (this.thiefWarnT || 0) - dt) <= 0) {
        this.thiefWarnT = 4;
        this.notice('🚨 小偷快跑远了，快追！');
      }
    }
  }

  /* 小偷被制服（开车撞停 或 步行按F） */
  onThiefCaught(n) {
    if (!this.task || !this.task.active || this.task.type !== 'thief') return;
    if (this.task.thiefNpc !== n) return;
    const info = CONFIG.TASK_TYPES.thief;
    this.player.money += info.reward;
    STATS.tasks++; STATS.earned += info.reward;
    this.notice('🚨 小偷被制服！市民为你点赞 +¥' + info.reward);
    this.task.active = false;
    n.hidden = true;
    this.npcs = this.npcs.filter(x => x !== n);
  }

  /* 提示条 */
  notice(text) {
    this.noticeText = text;
    this.noticeTimer = 3.2;
  }
}

/* 全局存档句柄（在 systems.js 定义 worldSave） */
