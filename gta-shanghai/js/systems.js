/* ============================================================
 * 交互系统：UI面板 / 产业经营 / 任务 / 传送 / 存档
 * ============================================================ */
const SAVE_KEY = 'gta-shanghai-save-v1';

/* ---------- 存档 ---------- */
/* OWNERSHIP 全局产业所有权在 world.js 声明，此处直接引用 */

function worldSave() {
  const w = gameWorld;
  if (!w) return;
  const data = {
    v: 1,
    money: w.player.money,
    wanted: w.player.wanted,
    mapId: w.mapId,
    px: w.player.px, py: w.player.py,
    dayCount: w.dayCount || 0,     // 季节跨会话延续
    ownership: OWNERSHIP,
    homes: HOME_OWNERSHIP          // 房产所有权（旧存档无此字段，读档默认空）
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  saveStats();
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
/* 用全局房产所有权恢复当前地图的房产状态；
   save 可选：带存档（读档/新开局）时重置全局所有权，仅恢复地图（换区/回家）时保留全局；
   防御：旧坏存档可能把 homes 存成数组（早期 enterMap bug），一律纠正为空对象 */
function restoreHomes(w, save) {
  if (save) {
    const h = save.homes;
    HOME_OWNERSHIP = (h && typeof h === 'object' && !Array.isArray(h)) ? h : {};
  }
  w.homes.forEach(h => {
    const o = HOME_OWNERSHIP[w.mapId];
    if (o && o[h.id]) h.owned = true;
  });
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

  showArrest(msg, cb, opts) {
    const o = opts || {};
    document.getElementById('arrest-title').textContent = o.title || '你被警方控制';
    document.getElementById('arrest-msg').textContent = msg;
    document.getElementById('btn-respawn').textContent = o.btn || '缴纳罚金继续';
    document.getElementById('arrest-screen').classList.remove('hidden');
    document.getElementById('btn-respawn').onclick = () => {
      document.getElementById('arrest-screen').classList.add('hidden');
      cb && cb();
    };
  },

  /* ---- 房产面板（按F靠近楼盘 / B菜单内） ---- */
  homeMenu(h) {
    const w = gameWorld;
    const ht = CONFIG.HOME_TYPES[h.type] || { name: '住宅', icon: '🏠' };
    const owned = h.owned;
    this.open(ht.icon + ' ' + h.name, `
      <div class="desc">${ht.name} · ${w.map.name} · 每 ${CONFIG.HOME_RENT_CYCLE} 秒收租 ¥${h.rent}</div>
      <div class="row"><span class="name">售价</span><span class="val">¥${h.price.toLocaleString()}</span></div>
      <div class="row"><span class="name">持有现金</span><span class="val">¥${w.player.money.toLocaleString()}</span></div>
      ${owned
        ? `<button onclick="UI.goHome('${h.id}')">🚪 回家</button>
           <button class="danger" onclick="UI.sellHome('${h.id}')">出售<span class="price">+¥${Math.floor(h.price * 0.5)}</span></button>`
        : `<button onclick="UI.buyHome('${h.id}')">🏡 购买 ${h.name}<span class="price">¥${h.price.toLocaleString()}</span></button>`}
      <button class="back" onclick="UI.close()">关闭</button>`);
  },
  buyHome(id) {
    const w = gameWorld;
    const h = w.homes.find(x => x.id === id);
    if (!h || h.owned) return;
    if (w.player.money < h.price) { w.notice('❌ 现金不足，买不起！'); return; }
    w.player.money -= h.price;
    h.owned = true;
    (HOME_OWNERSHIP[w.mapId] = HOME_OWNERSHIP[w.mapId] || {})[h.id] = true;
    w.notice('🏡 你买下了 ' + h.name + '！每 ' + CONFIG.HOME_RENT_CYCLE + ' 秒收租 ¥' + h.rent);
    worldSave();
    UI.homeMenu(h);
  },
  sellHome(id) {
    const w = gameWorld;
    const h = w.homes.find(x => x.id === id);
    if (!h || !h.owned) return;
    const refund = Math.floor(h.price * 0.5);
    w.player.money += refund;
    h.owned = false;
    if (HOME_OWNERSHIP[w.mapId]) delete HOME_OWNERSHIP[w.mapId][h.id];
    w.notice('🏠 你卖掉了 ' + h.name + '，回收 ¥' + refund);
    worldSave();
    UI.homeMenu(h);
  },
  goHome(id) {
    const w = gameWorld;
    // 在全局所有权里找房产所在区（支持跨区回家：沈阳买的房，在上海 B 菜单也能回）
    let mid = null;
    for (const k in HOME_OWNERSHIP) {
      if (HOME_OWNERSHIP[k] && HOME_OWNERSHIP[k][id]) { mid = k; break; }
    }
    if (!mid) return;
    if (mid !== w.mapId) UI.enterMap(mid);   // 跨区先进入该区（保留金钱，通缉-1）
    const w2 = gameWorld;
    const h = w2.homes.find(x => x.id === id);
    if (!h || !h.owned) return;
    // 传送到该房产门口（矫正到可走格）
    const f = MapGen.findWalkableNotRoad(w2.map, h.x, h.y);
    w2.player.px = f.x * CONFIG.TILE + CONFIG.TILE / 2;
    w2.player.py = f.y * CONFIG.TILE + CONFIG.TILE / 2;
    w2.player.x = f.x; w2.player.y = f.y;
    // 下车回家：车转回巡逻模式（防 mode='player' 的废车停在原地被 AI 开走）
    if (w2.player.car) { w2.player.car.occupied = false; w2.player.car.mode = 'patrol'; w2.player.car = null; }
    w2.cold = 0;   // 回家=进屋休整：沈阳冬天冻僵时点回家即回暖，不会门口继续冻
    w2.notice('🏠 你回到了' + h.name + '，安心休整一下');
    worldSave();   // 回家即存档：否则刷新后回到的是回家前的位置
    UI.close();
  },

  /* ---- 资产面板（产业 + 房产，按B） ---- */
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
    // 房产区块：本区已购房产 + 跨区已购房产汇总
    const homeRows = [];
    const allHomes = [];
    w.homes.forEach(h => { if (h.owned) allHomes.push({ map: w.map.name, h }); });
    for (const mid in HOME_OWNERSHIP) {
      if (mid === w.mapId || !MAPS[mid]) continue;
      (MAPS[mid].homes || []).forEach(cfg => {
        if (HOME_OWNERSHIP[mid][cfg.id]) allHomes.push({ map: MAPS[mid].name, h: cfg });
      });
    }
    allHomes.forEach(e => {
      const ht = CONFIG.HOME_TYPES[e.h.type] || { icon: '🏠' };
      homeRows.push(`<div class="row">
        <span class="name">${ht.icon} ${e.h.name} <span class="muted">${e.map} · ¥${e.h.rent}/${CONFIG.HOME_RENT_CYCLE}s</span></span>
        <span class="val"><button class="mini" onclick="UI.goHome('${e.h.id}')">🚪回家</button></span>
      </div>`);
    });
    this.open('🏢 资产经营', `
      <div class="row"><span class="name">现金</span><span class="val">¥${w.player.money}</span></div>
      <div class="row"><span class="name">产业营收</span><span class="val">+¥${total}/10s</span></div>
      <h3>🏠 我的房产（${allHomes.length} 套 · 每 ${CONFIG.HOME_RENT_CYCLE} 秒收租）</h3>
      ${homeRows.length ? homeRows.join('') : '<div class="muted">尚未购房——靠近地图上的 🏢 楼盘按 F 看房。</div>'}
      <h3>可购买 / 已拥有 · 产业</h3>${rows}
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
    const guide = {
      delivery: '需要开车运送货物到目标点。',
      escort: '护送运钞车，别让它离你太远。',
      race: '和对手赛车，率先抵达终点。',
      taxi: '开任意车到乘客身边接客，再把他送到目的地。',
      thief: '小偷跑得比人快，开车追上去撞停他；步行贴近按 F 也能制服。'
    }[t.type] || '';
    this.open('📋 ' + info.name, `
      <div class="desc">${info.desc}</div>
      <div class="row"><span class="name">奖励</span><span class="val">¥${info.reward}</span></div>
      <div class="row"><span class="name">限时</span><span class="val">${info.time} 秒</span></div>
      <div class="muted" style="margin:8px 0">${guide}</div>
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
    const inSy = w.mapId === 'shenyang';
    const zones = CITY_MAP.zones.map(z => {
      const m = MAPS[z.map];
      return `<button onclick="UI.enterMap('${z.map}')">${z.name} <span class="muted">${m.intro}</span></button>`;
    }).join('');
    this.open('🗺️ 城市传送', `
      <div class="muted">${inSy ? '当前在沈阳 · 可乘高铁返回上海' : '上海行政区传送（相当于地铁/轮渡）'}</div>
      ${inSy ? `<button onclick="UI.enterMap('huangpu')">🚄 高铁 · 返回上海（黄浦）</button>` : zones}
      <div class="muted city-split">── 第二城市 ──</div>
      ${inSy
        ? `<button disabled style="opacity:.5;cursor:default">🚄 沈阳 <span class="muted">（当前所在）</span></button>`
        : `<button onclick="UI.enterMap('shenyang')">🚄 沈阳 <span class="muted">丁香湖 · 中海城 · 万象汇</span></button>`}
      ${w.mapId !== 'city' && !inSy ? `<button class="back" onclick="UI.enterMap('city')">上海全览图</button>` : ''}
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
    restoreHomes(gameWorld, d);
    gameWorld.player.money = (typeof d.money === 'number' && isFinite(d.money)) ? d.money : 1000;
    gameWorld.player.wanted = Math.max(0, Math.min(5, d.wanted || 0));
    if (d.px && d.py) {
      // 读档位置矫正到可走格，且优先非道路（防站在路中央被车创）
      const f = MapGen.findWalkableNotRoad(gameWorld.map, Math.floor(d.px / CONFIG.TILE), Math.floor(d.py / CONFIG.TILE));
      gameWorld.player.px = f.x * CONFIG.TILE + CONFIG.TILE / 2;
      gameWorld.player.py = f.y * CONFIG.TILE + CONFIG.TILE / 2;
    }
    UI.close();
  },
  backToTitle() {
    gameWorld = null;
    UI.close();
    document.getElementById('arrest-screen').classList.add('hidden');
    document.getElementById('title-screen').classList.remove('hidden');
  },

  /* ---- 生涯统计（按C） ---- */
  statsMenu() {
    const h = Math.floor(STATS.playTime / 3600), m = Math.floor((STATS.playTime % 3600) / 60), s = Math.floor(STATS.playTime % 60);
    const time = (h > 0 ? h + '时' : '') + m + '分' + s + '秒';
    this.open('📊 生涯统计', `
      <div class="row"><span class="name">⏱ 游玩时间</span><span class="val">${time}</span></div>
      <div class="row"><span class="name">📋 完成任务</span><span class="val">${STATS.tasks} 次</span></div>
      <div class="row"><span class="name">🚨 被警方控制</span><span class="val">${STATS.arrests} 次</span></div>
      <div class="row"><span class="name">💥 被车撞进医院</span><span class="val">${STATS.crashed} 次</span></div>
      <div class="row"><span class="name">🚦 交通罚款</span><span class="val">${STATS.fines} 张罚单</span></div>
      <div class="row"><span class="name">🏠 持有房产</span><span class="val">${Object.keys(HOME_OWNERSHIP).reduce((n, mid) => n + Object.keys(HOME_OWNERSHIP[mid] || {}).length, 0)} 套</span></div>
      <div class="row"><span class="name">🏃 累计移动</span><span class="val">${Math.round(STATS.distance)} 米</span></div>
      <div class="row"><span class="name">💰 累计收入</span><span class="val">¥ ${STATS.earned.toLocaleString()}</span></div>
      <div class="muted" style="margin-top:10px">统计跨地图、跨会话保存。</div>
      <button class="back" onclick="UI.close()">关闭</button>`);
  },

  /* ---- 帮助（按H） ---- */
  helpMenu() {
    this.open('🎮 操作与玩法', `
      <div class="row"><span class="name"><span class="key">W A S D</span> / 方向键</span><span class="val">移动 / 开车转向（W加速 S刹车）</span></div>
      <div class="row"><span class="name"><span class="key">Shift</span> 跑</span><span class="val">加速行走</span></div>
      <div class="row"><span class="name"><span class="key">E</span> 上车 / 下车</span><span class="val">靠近车辆</span></div>
      <div class="row"><span class="name"><span class="key">F</span> 互动</span><span class="val">产业 / 任务 / 传送</span></div>
      <div class="row"><span class="name"><span class="key">G</span> 与路人交谈</span><span class="val">可能收到小费</span></div>
      <div class="row"><span class="name"><span class="key">1~5</span> 挂前进档</span><span class="val">档位越高极速越高（开车时）</span></div>
      <div class="row"><span class="name"><span class="key">N</span> 空档滑行</span><span class="val">无动力减速滑行</span></div>
      <div class="row"><span class="name"><span class="key">V</span> 倒档</span><span class="val">按 W 倒车</span></div>
      <div class="row"><span class="name"><span class="key">空格</span> 手刹</span><span class="val">急刹；跑车按住+转向=漂移</span></div>
      <div class="row"><span class="name"><span class="key">Q / R</span> 转向灯</span><span class="val">左 / 右转向灯（再按关闭）</span></div>
      <div class="row"><span class="name"><span class="key">M</span> 区域传送</span><span class="val">地铁 / 全城图</span></div>
      <div class="row"><span class="name"><span class="key">B</span> 资产经营</span><span class="val">产业 + 房产购买/升级/出售/回家</span></div>
      <div class="row"><span class="name"><span class="key">C</span> 生涯统计</span><span class="val">任务/收入/距离</span></div>
      <div class="row"><span class="name"><span class="key">Tab</span> 暂停菜单</span><span class="val">存档 / 读档</span></div>
      <div class="row"><span class="name"><span class="key">Esc</span> 关闭面板</span><span class="val">退出当前窗口</span></div>
      <div class="muted" style="margin-top:8px">赚钱：完成 📋 任务（货运/押运/竞速/载客/追捕小偷）、购买 🏢 产业收租，或购买 🏠 房产收房租（每 ${CONFIG.HOME_RENT_CYCLE} 秒一次，跨区照收；地图上的楼盘按 F 看房，B 菜单可回家）。路边 💼 失物包裹捡到有感谢金；被通缉时 ⭐ 越多警车追得越凶，躲过 6 秒降一星。</div>
      <div class="muted" style="margin-top:6px">交通：路口有 🚦 红绿灯，8 秒换向。NPC 车会等红灯；你开车闯红灯或撞人，会直接招来 🚓 警车追捕（闯灯有交警还罚 ¥150）；步行别乱穿马路——被快车撞到会进医院（住院费 ¥300）。</div>
      <div class="muted" style="margin-top:6px">天气季节：上海有小概率 🌪️ 台风（风力随机，行人被吹偏、开车极速下降）；沈阳冬天会下 ❄️ 雪（雪量随机，仅冬天）。沈阳冬/雪天在户外待太久会冻僵——先失去交互、再失去行动，最后冻死回医院（进车内或靠近便利店取暖可回暖）。</div>
      <button class="back" onclick="UI.close()">关闭</button>`);
  },

  /* ---- 进入地图（dest 可选：边界传送落点，用于跨区无缝衔接） ---- */
  enterMap(mapId, dest) {
    if (!MAPS[mapId] && mapId !== 'city') return;
    // 保留金钱；通缉跨区减一星（换了城区，风头小了些，避免落地即被贴脸追捕）
    const old = gameWorld;
    // 任务进行中跨区 = 任务取消（换城区了），明确提示避免"任务神秘消失"
    let taskLost = false;
    if (old && old.task && old.task.active) taskLost = true;
    const keepMoney = old ? old.player.money : 1000;
    const keepWanted = old ? Math.max(0, old.player.wanted - 1) : 0;
    gameWorld = new World(mapId);
    gameWorld.player.money = keepMoney;
    gameWorld.player.wanted = keepWanted;
    // 边界传送落点：矫正到可走格（防落到水上/界外）
    if (dest) {
      const f = MapGen.findWalkableNotRoad(gameWorld.map, dest.x, dest.y) || dest;
      gameWorld.player.x = f.x; gameWorld.player.y = f.y;
      gameWorld.player.px = f.x * P() + P() / 2;
      gameWorld.player.py = f.y * P() + P() / 2;
    }
    restoreOwnership(gameWorld);
    restoreHomes(gameWorld);
    worldSave();
    if (taskLost) gameWorld.notice('📋 你换城区了，原任务已取消');
    else if (keepWanted > 0) gameWorld.notice('🚨 换了城区，通缉降到 ' + keepWanted + ' 星');
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
      // 任务车（押运运钞车/竞速对手车）由任务AI驱动，禁止玩家开走避免双重控制
      if (c.mode === 'escort' || c.mode === 'race') {
        w.notice('🚫 这是任务车辆，不能借用');
        return;
      }
      c.occupied = true; c.mode = 'player';
      w.player.car = c;
      w.player.px = c.px; w.player.py = c.py;
      w.notice('🚗 你上了车：W加速 S刹车 A/D转向');
    }
  } else if (target.kind === 'exit') {
    const c = w.player.car;
    c.occupied = false; c.mode = 'patrol'; c.speed = 0;
    w.player.car = null;
    // 放在车旁（保证可走且非道路——站人行道，避免下车就站在路中央被车创）
    const spot = MapGen.findWalkableNotRoad(w.map,
      Math.floor((c.px + c.dx * 8) / P()), Math.floor((c.py + c.dy * 8) / P()));
    w.player.px = spot.x * P() + P() / 2; w.player.py = spot.y * P() + P() / 2;
    w.notice('🚶 你下了车');
  } else if (target.kind === 'business') {
    UI.businessMenu();
  } else if (target.kind === 'home') {
    UI.homeMenu(target.h);
  } else if (target.kind === 'task') {
    w.interactingTask = target.t;
    UI.taskBoard(target.t);
  } else if (target.kind === 'transfer') {
    UI.cityTransfer();
  } else if (target.kind === 'zone') {
    UI.enterMap(target.z.map);
  } else if (target.kind === 'thief') {
    // 步行制服小偷（同开车撞停）
    gameWorld.onThiefCaught(target.npc);
  } else if (target.kind === 'talk') {
    // 与路人交谈：随机台词 + 小概率小费（交警只执法不闲聊）
    if (target.npc.isTrafficPolice) {
      const policeLines = [
        '红灯停，绿灯行，侬伐要闯哦！', '过马路走人行道，当心车子！',
        '开车别超速，安全第一。', '前面路口有探头，悠着点。',
        '黄灯也要减速，勿急。', '路口指挥交关忙，侬配合好伐。'
      ];
      const say = policeLines[(Math.random() * policeLines.length) | 0];
      target.npc.say = say;
      target.npc.sayT = 3;
      gameWorld.notice('👮 ' + say);
      return;
    }
    const lines = [
      '今天天气不错，适合兜风。', '侬好呀，外地来白相啊？', '听说五角场新开了家店。',
      '阿拉上海人最讲究腔调。', '最近地铁人老多的。', '下班去喝咖啡伐？',
      '哎，那边有警车开过，出啥事体了？', '这城天天在变，越变越好看。',
      '侬开车当心点哦。', '夜宵去哪吃？寿宁路咯。', '朝九晚五，日子一天天过。',
      '外滩夜景老灵额。', '阿拉爷叔讲，做人要低调。', '台风天勿要出门。',
      '快递到了，我要赶回去拿。', '这儿的生煎包一绝，去试试。'
    ];
    const npc = target.npc;
    npc.say = lines[(Math.random() * lines.length) | 0];
    npc.sayT = 3;
    if (Math.random() < 0.12) {
      const tip = 10 + Math.floor(Math.random() * 3) * 10;
      gameWorld.player.money += tip;
      STATS.earned += tip;
      gameWorld.notice('💬 ' + npc.say + '（他给了你 ¥' + tip + ' 小费）');
    } else {
      gameWorld.notice('💬 ' + npc.say);
    }
  }
}

function notice(text) {
  if (gameWorld) gameWorld.notice(text);
}
