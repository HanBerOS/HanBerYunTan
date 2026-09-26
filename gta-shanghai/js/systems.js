/* ============================================================
 * 交互系统：UI面板 / 产业经营 / 任务 / 传送 / 存档
 * ============================================================ */
const SAVE_KEY = 'gta-shanghai-save-v1';

/* ---------- 存档 ---------- */
/* 产业所有权全局记录：{ mapId: { businessId: level } }，跨地图持久 */
let OWNERSHIP = {};

function worldSave() {
  const w = gameWorld;
  if (!w) return;
  const data = {
    v: 1,
    money: w.player.money,
    wanted: w.player.wanted,
    mapId: w.mapId,
    px: w.player.px, py: w.player.py,
    ownership: OWNERSHIP
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
}
function worldLoad() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1) return null;
    return d;
  } catch (e) { return null; }
}
/* 用全局所有权记录恢复当前地图的产业状态 */
function restoreOwnership(w) {
  const o = OWNERSHIP[w.mapId];
  if (!o) return;
  w.businesses.forEach(b => {
    if (o[b.id]) { b.owned = true; b.level = o[b.id]; }
  });
}
function restoreBusinesses(w, save) {
  OWNERSHIP = (save && save.ownership) || {};
  restoreOwnership(w);
}

/* ---------- UI 面板 ---------- */
const UI = {
  panelEl: document.getElementById('panel'),
  overlayEl: document.getElementById('overlay'),
  open(title, html) {
    this.panelEl.innerHTML = '<h2>' + title + '</h2>' + html;
    this.overlayEl.classList.remove('hidden');
  },
  close() { this.overlayEl.classList.add('hidden'); },
  isOpen() { return !this.overlayEl.classList.contains('hidden'); },

  showArrest(msg, cb) {
    document.getElementById('arrest-msg').textContent = msg;
    document.getElementById('arrest-screen').classList.remove('hidden');
    document.getElementById('btn-respawn').onclick = () => {
      document.getElementById('arrest-screen').classList.add('hidden');
      cb && cb();
    };
  },

  /* ---- 产业面板 ---- */
  businessMenu() {
    const w = gameWorld;
    const rows = w.businesses.map(b => {
      const bt = CONFIG.BUSINESS_TYPES[b.type];
      const owned = b.owned;
      const upgradeCost = bt.price * b.level;
      return `<div class="row">
        <span class="name">${bt.icon} ${bt.name} <span class="muted">${bt.desc}</span></span>
        <span class="val">${owned ? 'Lv.' + b.level + ' ¥' + bt.income * b.level + '/10s' : ''}</span>
      </div>
      ${owned
        ? `<button class="owned" onclick="UI.upgradeBusiness('${b.id}')">升级至 Lv.${b.level + 1}<span class="price">¥${upgradeCost}</span></button>
           <button class="danger" onclick="UI.sellBusiness('${b.id}')">出售<span class="price">+¥${Math.floor(bt.price * b.level * 0.5)}</span></button>`
        : `<button onclick="UI.buyBusiness('${b.id}')">购买 ${bt.name}<span class="price">¥${bt.price}</span></button>`}`;
    }).join('');
    const total = w.businesses.filter(b => b.owned).reduce((s, b) => s + CONFIG.BUSINESS_TYPES[b.type].income * b.level, 0);
    this.open('🏢 产业经营', `
      <div class="row"><span class="name">现金</span><span class="val">¥${w.player.money}</span></div>
      <div class="row"><span class="name">当前营收</span><span class="val">+¥${total}/10s</span></div>
      <h3>可购买 / 已拥有</h3>${rows}
      <button class="back" onclick="UI.close()">关闭</button>`);
  },
  buyBusiness(id) {
    const w = gameWorld;
    const b = w.businesses.find(x => x.id === id);
    if (!b || b.owned) return;
    const bt = CONFIG.BUSINESS_TYPES[b.type];
    if (w.player.money < bt.price) { w.notice('❌ 现金不足！'); return; }
    w.player.money -= bt.price;
    b.owned = true;
    (OWNERSHIP[w.mapId] = OWNERSHIP[w.mapId] || {})[b.id] = b.level;
    w.notice('🏪 你收购了' + bt.name + '！每10秒产出 ¥' + bt.income);
    worldSave();
    UI.businessMenu();
  },
  upgradeBusiness(id) {
    const w = gameWorld;
    const b = w.businesses.find(x => x.id === id);
    if (!b || !b.owned) return;
    const bt = CONFIG.BUSINESS_TYPES[b.type];
    const cost = bt.price * b.level;
    if (w.player.money < cost) { w.notice('❌ 现金不足！'); return; }
    w.player.money -= cost;
    b.level++;
    if (OWNERSHIP[w.mapId]) OWNERSHIP[w.mapId][b.id] = b.level;
    w.notice('📈 ' + bt.name + ' 升级到 Lv.' + b.level);
    worldSave();
    UI.businessMenu();
  },
  sellBusiness(id) {
    const w = gameWorld;
    const b = w.businesses.find(x => x.id === id);
    if (!b || !b.owned) return;
    const bt = CONFIG.BUSINESS_TYPES[b.type];
    const refund = Math.floor(bt.price * b.level * 0.5);
    w.player.money += refund;
    b.owned = false; b.level = 1;
    if (OWNERSHIP[w.mapId]) delete OWNERSHIP[w.mapId][b.id];
    w.notice('💼 出售' + bt.name + '，回收 ¥' + refund);
    worldSave();
    UI.businessMenu();
  },

  /* ---- 任务面板 ---- */
  taskBoard(t) {
    const info = CONFIG.TASK_TYPES[t.type];
    this.open('📋 ' + info.name, `
      <div class="desc">${info.desc}</div>
      <div class="row"><span class="name">奖励</span><span class="val">¥${info.reward}</span></div>
      <div class="row"><span class="name">限时</span><span class="val">${info.time} 秒</span></div>
      <div class="muted" style="margin:8px 0">${t.type === 'delivery' ? '需要开车运送货物到目标点。' : t.type === 'escort' ? '护送运钞车，别让它离你太远。' : '和对手赛车，率先抵达终点。'}</div>
      <button onclick="UI.startTask()">开始任务</button>
      <button class="back" onclick="UI.close()">取消</button>`);
  },
  startTask() {
    const w = gameWorld;
    if (w.task && w.task.active) { w.notice('⚠️ 已有任务进行中'); UI.close(); return; }
    // 记住从哪个任务点接的
    const tp = w.interactingTask;
    if (tp) w.startTask(tp);
    UI.close();
  },

  /* ---- 城市传送（区内地铁站/按M） ---- */
  cityTransfer() {
    const w = gameWorld;
    const zones = CITY_MAP.zones.map(z => {
      const m = MAPS[z.map];
      return `<button onclick="UI.enterMap('${z.map}')">${z.name} <span class="muted">${m.intro}</span></button>`;
    }).join('');
    this.open('🗺️ 上海 · 区域选择', `
      <div class="muted">选择行政区传送（相当于地铁/轮渡）。</div>
      ${zones}
      ${w.mapId !== 'city' ? `<button class="back" onclick="UI.enterMap('city')">上海全览图</button>` : ''}
      <button class="back" onclick="UI.close()">关闭</button>`);
  },

  /* ---- 暂停菜单 ---- */
  pauseMenu() {
    const hasSave = !!worldLoad();
    this.open('⏸ 暂停', `
      <button onclick="UI.close()">继续游戏</button>
      <button onclick="worldSave(); UI.close(); notice('💾 已存档');">手动存档</button>
      ${hasSave ? `<button onclick="UI.loadAndGo()">读取存档</button>` : ''}
      <button class="danger" onclick="UI.backToTitle()">返回标题</button>`);
  },
  loadAndGo() {
    const d = worldLoad();
    if (!d) { UI.close(); notice('❌ 没有存档'); return; }
    gameWorld = new World(d.mapId || CONFIG.START_MAP);
    restoreBusinesses(gameWorld, d);
    gameWorld.player.money = d.money || 1000;
    gameWorld.player.px = d.px; gameWorld.player.py = d.py;
    if (gameWorld.mapId === 'city') { /* 总览无需精确位置 */ }
    UI.close();
  },
  backToTitle() {
    gameWorld = null;
    UI.close();
    document.getElementById('arrest-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  },

  /* ---- 进入地图 ---- */
  enterMap(mapId) {
    if (!MAPS[mapId] && mapId !== 'city') return;
    gameWorld = new World(mapId);
    restoreOwnership(gameWorld);
    worldSave();
    UI.close();
  }
};

/* ---------- 交互执行 ---------- */
function doInteract(target) {
  if (!target) return;
  const w = gameWorld;
  if (target.kind === 'car') {
    if (!w.player.car) {
      const c = target.car;
      c.occupied = true; c.mode = 'player';
      w.player.car = c;
      w.player.px = c.px; w.player.py = c.py;
      w.notice('🚗 你上了车：W加速 S刹车 A/D转向');
    }
  } else if (target.kind === 'exit') {
    const c = w.player.car;
    c.occupied = false; c.mode = 'patrol'; c.speed = 0;
    w.player.car = null;
    // 放在车旁（保证可走）
    const spot = MapGen.findWalkable(w.map,
      Math.floor((c.px + c.dx * 8) / P()), Math.floor((c.py + c.dy * 8) / P()));
    w.player.px = spot.x * P(); w.player.py = spot.y * P();
    w.notice('🚶 你下了车');
  } else if (target.kind === 'business') {
    UI.businessMenu();
  } else if (target.kind === 'task') {
    w.interactingTask = target.t;
    UI.taskBoard(target.t);
  } else if (target.kind === 'transfer') {
    UI.cityTransfer();
  } else if (target.kind === 'zone') {
    UI.enterMap(target.z.map);
  }
}

function notice(text) {
  if (gameWorld) gameWorld.notice(text);
}
