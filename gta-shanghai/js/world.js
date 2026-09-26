/* ============================================================
 * 世界实体与AI：玩家 / 路人NPC / 车辆 / 警察追捕 / 通缉系统
 * ============================================================ */
const P = () => CONFIG.TILE;

/* ---------- 玩家 ---------- */
class Player {
  constructor(map) {
    this.map = map;
    this.x = map.spawn.x; this.y = map.spawn.y;
    this.px = this.x * P(); this.py = this.y * P();
    this.r = 3;
    this.fx = 0; this.fy = 1;
    this.wanted = 0;
    this.money = 1000;
    this.car = null;            // 当前驾驶的车
    this.alive = true;
  }
  update(dt, world) {
    if (this.car) { this.updateDriving(dt, world); return; }
    const a = Input.axis();
    const speed = (Input.down('shift') ? CONFIG.RUN : CONFIG.WALK) * P() * dt;
    if (a.x || a.y) { this.fx = a.x; this.fy = a.y; }
    this.tryMove(a.x * speed, a.y * speed);
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
  }
  updateDriving(dt, world) {
    const c = this.car;
    // W加速 / S刹车 · A/D转向
    if (Input.down('w')) c.speed = Math.min(CONFIG.CAR_MAX, c.speed + 26 * dt);
    if (Input.down('s')) c.speed = Math.max(-CONFIG.CAR_MIN * 0.5, c.speed - 30 * dt);
    if (!Input.down('w') && !Input.down('s')) c.speed *= (1 - 1.2 * dt);
    const turn = (Input.down('a') ? 1 : 0) - (Input.down('d') ? 1 : 0);
    if (turn !== 0) {
      const ang = Math.atan2(c.dy, c.dx) + turn * 2.6 * dt;
      c.dx = Math.cos(ang); c.dy = Math.sin(ang);
    }
    c.move(dt, world, this);
    this.fx = c.dx; this.fy = c.dy;
    // 撞NPC→通缉
    world.npcs.forEach(n => {
      if (n.down) return;
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
  }
  update(dt, world) {
    if (this.down > 0) { this.down -= dt; return; }
    const player = world.player;
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
    if (this.down > 0) return;
    this.down = 5;
    this.angry = true;
    world.addWanted(1);
    world.notice('⚠️ 你撞到市民，目击者已报警！');
  }
}

/* ---------- 车辆 ---------- */
class Car {
  constructor(map, x, y, color, isPolice, controllable) {
    this.map = map;
    this.x = x; this.y = y;
    this.px = x * P(); this.py = y * P();
    this.dx = 1; this.dy = 0;
    this.speed = 0;
    this.color = color;
    this.isPolice = !!isPolice;
    this.r = 5;
    this.mode = 'patrol';     // patrol / chase / player
    this.turnT = 0;
    this.occupied = false;
  }
  move(dt, world, driver) {
    const px = this.px + this.dx * this.speed * P() * dt;
    const py = this.py + this.dy * this.speed * P() * dt;
    const r = this.r;
    const ok = (x, y) => MapGen.isWalkable(this.map, Math.floor(x / P()), Math.floor(y / P()));
    const blocked =
      !(ok(px + r, py + r) && ok(px - r, py + r) && ok(px + r, py - r) && ok(px - r, py - r));
    if (blocked) {
      this.speed *= 0.75;
      if (this.speed < 1) this.turnRandom();
    } else {
      this.px = px; this.py = py;
    }
    this.px = Math.max(4, Math.min(this.map.w * P() - 4, this.px));
    this.py = Math.max(4, Math.min(this.map.h * P() - 4, this.py));
    // 撞玩家（仅警车在追捕时触发逮捕）
    if (this.isPolice && driver !== world.player && world.player.alive) {
      const pl = world.player;
      const d = Math.hypot(pl.px - this.px, pl.py - this.py);
      if (d < 8 && this.speed > 6) {
        if (!pl.car) world.policeArrest(pl);
      }
    }
  }
  turnRandom() {
    const dirs = [[this.dy, -this.dx], [-this.dy, this.dx], [-this.dx, -this.dy]];
    const d = dirs[(Math.random() * dirs.length) | 0];
    this.dx = d[0]; this.dy = d[1];
  }
  /* NPC车：沿道路巡游 */
  updateNpc(dt, world) {
    if (this.occupied) return;
    if (this.mode === 'escort' || this.mode === 'race') return;   // 由任务系统驱动
    this.speed = 6 + Math.random() * 3;
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
    this.move(dt, world, null);
  }
  /* 警车：追捕玩家 */
  updateChase(dt, world) {
    const pl = world.player;
    if (!pl.alive) return;
    const d = Math.hypot(pl.px - this.px, pl.py - this.py);
    if (d < 2.5 * P()) { world.policeArrest(pl); return; }
    const target = { x: pl.px, y: pl.py };
    // 朝玩家移动，速度跟通缉等级相关
    this.speed = Math.min(11 + world.player.wanted * 1.2, 17);
    const ang = Math.atan2(target.y - this.py, target.x - this.px);
    const wantDx = Math.cos(ang), wantDy = Math.sin(ang);
    // 平滑转向
    const cur = Math.atan2(this.dy, this.dx);
    let diff = Math.atan2(Math.sin(ang - cur), Math.cos(ang - cur));
    const maxTurn = 4.2 * dt;
    const newAng = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
    this.dx = Math.cos(newAng); this.dy = Math.sin(newAng);
    this.move(dt, world, null);
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
    this.taskPoints = this.map.tasks.map(t => Object.assign({}, t));
    this.task = null;           // 当前任务 {type, tx, ty, timer, ...}
    this.escapeTimer = 0;
    this.incomeTimer = 0;
    this.noticeTimer = 0;
    this.noticeText = '';
    this.generatePop();
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
    // NPC车
    for (let i = 0; i < 14 && guard < 6000; i++, guard++) {
      const x = 20 + Math.floor(Math.random() * (m.w - 40));
      const y = 20 + Math.floor(Math.random() * (m.h - 40));
      if (MapGen.isRoad(m, x, y)) {
        this.cars.push(new Car(m, x, y, colors[(Math.random() * colors.length) | 0], false));
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
    // 任务点
    this.taskPoints.forEach(t => {
      const d = Math.hypot(t.x * P() - pl.px, t.y * P() - pl.py);
      if (d < d2 + 6) near.push({ kind: 'task', t, label: '按 F 接任务', d });
    });
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
    // 从玩家附近道路生成警车
    const m = this.map;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const x = Math.floor(this.player.x + Math.cos(a) * (18 + Math.random() * 20));
      const y = Math.floor(this.player.y + Math.sin(a) * (18 + Math.random() * 20));
      if (x > 4 && y > 4 && x < m.w - 4 && y < m.h - 4 && MapGen.isRoad(m, x, y)) {
        const c = new Car(m, x, y, Math.random() < 0.5 ? '#1e3a8a' : '#16295c', true);
        c.mode = 'chase';
        this.police.push(c);
        this.cars.push(c);
        return;
      }
    }
  }
  policeArrest(pl) {
    if (!pl.alive) return;
    pl.alive = false;
    // 罚金
    const fine = 200 + pl.wanted * 150;
    pl.money = Math.max(0, pl.money - fine);
    this.notice('🚨 你被警方控制，罚款 ¥' + fine);
    UI.showArrest('因扰乱公共秩序，缴纳罚金 ¥' + fine + '。', () => {
      pl.alive = true;
      pl.wanted = 0;
      // 传送到最近警局
      const m = this.map;
      const s = m.police[0] || { x: m.w >> 1, y: m.h >> 1 };
      const f = MapGen.findWalkable(m, s.x, s.y);
      pl.px = f.x * P(); pl.py = f.y * P();
      pl.x = s.x; pl.y = s.y;
      if (pl.car) { pl.car.occupied = false; pl.car = null; }
      worldSave();
    });
  }

  /* 主更新循环 */
  update(dt) {
    const p = this.player;
    p.update(dt, this);
    this.npcs.forEach(n => n.update(dt, this));
    this.cars.forEach(c => {
      if (c.occupied) return;            // 玩家驾驶的由 player 更新
      if (c.mode === 'chase') c.updateChase(dt, this);
      else c.updateNpc(dt, this);
    });

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

    // ---- 产业收益 ----
    this.incomeTimer += dt;
    if (this.incomeTimer >= 10) {
      this.incomeTimer = 0;
      let gained = 0;
      this.businesses.forEach(b => {
        if (b.owned) { const inc = CONFIG.BUSINESS_TYPES[b.type].income * b.level; p.money += inc; gained += inc; }
      });
      if (gained > 0) this.notice('💰 产业收益 +¥' + gained);
    }

    // ---- 任务推进 ----
    if (this.task && this.task.active) this.updateTask(dt);

    // ---- 提示计时 ----
    if (this.noticeTimer > 0) this.noticeTimer -= dt;
  }

  /* 任务系统 */
  startTask(t) {
    const m = this.map;
    // 找终点：任务点对面的道路
    let tx = t.x, ty = t.y;
    for (let i = 0; i < 30; i++) {
      const a = Math.random() * Math.PI * 2;
      const nx = t.x + Math.cos(a) * (40 + Math.random() * 80);
      const ny = t.y + Math.sin(a) * (40 + Math.random() * 80);
      if (nx > 5 && ny > 5 && nx < m.w - 5 && ny < m.h - 5 && MapGen.isRoad(m, nx, ny)) { tx = nx; ty = ny; break; }
    }
    const info = CONFIG.TASK_TYPES[t.type];
    this.task = { type: t.type, sx: t.x, sy: t.y, tx, ty, timer: info.time, active: true, escortCar: null, raceCar: null };
    if (t.type === 'escort') {
      // 生成运钞车
      const ec = new Car(m, t.x + 2, t.y, '#f1c40f', false);
      ec.mode = 'escort';
      this.cars.push(ec);
      this.task.escortCar = ec;
    }
    if (t.type === 'race') {
      const rc = new Car(m, t.x - 3, t.y, '#e74c3c', false);
      rc.mode = 'race';
      this.cars.push(rc);
      this.task.raceCar = rc;
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
      return;
    }
    const info = CONFIG.TASK_TYPES[t.type];
    const p = this.player;
    const dist = Math.hypot(t.tx * P() - p.px, t.ty * P() - p.py);
    if (t.type === 'delivery') {
      if (dist < 2.5 * P()) {
        p.money += info.reward;
        this.notice('✅ 货物送达！+¥' + info.reward);
        this.task.active = false;
      }
    } else if (t.type === 'escort') {
      const ec = t.escortCar;
      if (!ec) { this.task.active = false; return; }
      // 运钞车自动开向终点
      const ang = Math.atan2(t.ty * P() - ec.py, t.tx * P() - ec.px);
      ec.dx = Math.cos(ang); ec.dy = Math.sin(ang);
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
        this.notice('✅ 押运完成！+¥' + info.reward);
        this.task.active = false;
        this.cars = this.cars.filter(c => c !== ec);
      }
    } else if (t.type === 'race') {
      const rc = t.raceCar;
      if (!rc) { this.task.active = false; return; }
      // 对手车向终点开
      const ang = Math.atan2(t.ty * P() - rc.py, t.tx * P() - rc.px);
      rc.dx = Math.cos(ang); rc.dy = Math.sin(ang);
      rc.speed = 10 + Math.random() * 0.6;
      rc.move(dt, this, null);
      const rd = Math.hypot(t.tx * P() - rc.px, t.ty * P() - rc.py);
      if (rd < 2.5 * P()) { this.notice('❌ 对手先到终点，你输了。'); this.task.active = false; this.cars = this.cars.filter(c => c !== rc); }
      if (dist < 2.5 * P()) {
        p.money += info.reward;
        this.notice('🏁 你赢了比赛！+¥' + info.reward);
        this.task.active = false;
        this.cars = this.cars.filter(c => c !== rc);
      }
    }
  }

  /* 提示条 */
  notice(text) {
    this.noticeText = text;
    this.noticeTimer = 3.2;
  }
}

/* 全局存档句柄（在 systems.js 定义 worldSave） */
