/* ============================================================
 * 主入口：启动 / 游戏主循环 / HUD / 按键处理
 * ============================================================ */
let gameWorld = null;
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

/* 边缘触发按键队列 */
const pressed = new Set();
window.addEventListener('keydown', e => {
  if (!e.repeat) pressed.add(e.key.toLowerCase());
  if (e.key === 'Escape') {
    if (UI.isOpen()) UI.close();
  }
});

function startNewGame() {
  document.getElementById('title-notice').textContent = '';
  document.getElementById('title-screen').classList.add('hidden');
  // 清空全局所有权（产业+房产）：全新存档不能继承旧档资产
  OWNERSHIP = {};
  HOME_OWNERSHIP = {};
  gameWorld = new World(CONFIG.START_MAP);
  worldSave();
  gameWorld.notice('🚶 欢迎来到上海像素城！按 M 可查看全城地图。');
}

function continueGame() {
  const d = worldLoad();
  if (!d) {
    document.getElementById('title-notice').textContent = '没有找到存档，请先点击「新游戏」。';
    return;
  }
  document.getElementById('title-notice').textContent = '';
  document.getElementById('title-screen').classList.add('hidden');
  gameWorld = new World(d.mapId || CONFIG.START_MAP);
  restoreBusinesses(gameWorld, d);
  restoreHomes(gameWorld, d);
  // 金钱：0 是合法值（破产），不能用 || 兜底否则读档变回1000
  gameWorld.player.money = (typeof d.money === 'number' && isFinite(d.money)) ? d.money : 1000;
  gameWorld.player.wanted = Math.max(0, Math.min(5, d.wanted || 0));
  gameWorld.dayCount = Math.max(0, d.dayCount | 0);   // 恢复季节
  if (d.px && d.py) {
    // 校验存档位置可走，不可走则矫正到最近可走格（优先非道路，防站路中央被创）
    const f = MapGen.findWalkableNotRoad(gameWorld.map, Math.floor(d.px / CONFIG.TILE), Math.floor(d.py / CONFIG.TILE));
    gameWorld.player.px = f.x * CONFIG.TILE + CONFIG.TILE / 2;
    gameWorld.player.py = f.y * CONFIG.TILE + CONFIG.TILE / 2;
  }
  gameWorld.notice('💾 存档已读取，欢迎回来！');
}

/* HUD 更新 */
function updateHUD(w) {
  const p = w.player;
  document.getElementById('hud-money').textContent = '¥ ' + p.money.toLocaleString();
  const star = document.getElementById('hud-wanted');
  star.textContent = p.wanted > 0 ? '★'.repeat(p.wanted) : '';
  document.getElementById('hud-loc').textContent =
    w.map.name + (w.map.intro ? ' · ' + w.map.intro : '');
  // 游戏时间（昼夜循环）
  const hod = w.timeOfDay;
  const hh = String(Math.floor(hod)).padStart(2, '0');
  const mms = String(Math.floor((hod - Math.floor(hod)) * 60)).padStart(2, '0');
  document.getElementById('hud-loc').textContent += ' · ' + hh + ':' + mms;
  const spd = document.getElementById('hud-speed');
  if (p.car) {
    spd.style.display = 'block';
    spd.textContent = Math.round(Math.abs(p.car.speed) * 3.2) + ' km/h';
  } else spd.style.display = 'none';
  // 档位 + 转向灯指示
  const gear = document.getElementById('hud-gear');
  if (p.car) {
    gear.style.display = 'block';
    const gl = p.car.g === 0 ? 'N' : p.car.g === 6 ? 'R' : String(p.car.g);
    gear.textContent = '档 ' + gl +
      (p.car.turnSignal === 1 ? ' ◀' : p.car.turnSignal === 2 ? ' ▶' : '') +
      (p.car.drift ? ' 💨漂移' : '');
  } else gear.style.display = 'none';
  // 天气
  const wth = document.getElementById('hud-weather');
  if (w.weather.kind === 'typhoon') {
    wth.style.display = 'block';
    wth.textContent = '🌪️ 台风 ' + w.weather.power + ' 级';
  } else if (w.weather.kind === 'snow') {
    wth.style.display = 'block';
    wth.textContent = { 1: '❄️ 小雪', 2: '❄️ 中雪', 3: '❄️ 大雪' }[w.weather.power];
  } else wth.style.display = 'none';
  // 寒冷值（沈阳冬/雪天）
  const cold = document.getElementById('hud-cold');
  if (w.cold > 0) {
    cold.style.display = 'block';
    cold.textContent = '🥶 寒冷 ' + Math.round(w.cold) + '%';
  } else cold.style.display = 'none';
  // 季节（提示当前季节与地域温度，仅沈阳寒冷时有用）
  const season = document.getElementById('hud-season');
  season.textContent = '🍃 ' + w.seasonName + '季' + (w.mapId === 'shenyang' ? (w.season === 3 ? ' · 严寒' : '') : '');

  // 任务栏
  const hint = document.getElementById('hud-hint');
  if (w.task && w.task.active) {
    const info = CONFIG.TASK_TYPES[w.task.type];
    hint.textContent = '📋 ' + info.name + ' · 剩余 ' + Math.max(0, Math.ceil(w.task.timer)) + 's';
    hint.classList.add('show');
  } else {
    const t = w.findInteract();
    if (t) { hint.textContent = t.label; hint.classList.add('show'); }
    else hint.classList.remove('show');
  }
  // 通告
  const note = document.getElementById('hud-notice');
  if (w.noticeTimer > 0) { note.textContent = w.noticeText; note.classList.add('show'); }
  else note.classList.remove('show');
}

/* 按键响应 */
function handleKeys(w) {
  if (pressed.has('e')) {
    const t = w.findInteract();
    if (t && (t.kind === 'car' || t.kind === 'exit')) doInteract(t);
    pressed.delete('e');
  }
  if (pressed.has('g')) {
    const t = w.findInteract();
    if (gameWorld.cold >= CONFIG.COLD.interactAt) {
      gameWorld.notice('❄️ 手冻僵了，无法交谈…');
    } else if (t && t.kind === 'talk') doInteract(t);
    pressed.delete('g');
  }
  if (pressed.has('f')) {
    const t = w.findInteract();
    if (gameWorld.cold >= CONFIG.COLD.interactAt) {
      gameWorld.notice('❄️ 手冻僵了，无法互动…');
    } else if (t && t.kind !== 'car' && t.kind !== 'exit') doInteract(t);
    pressed.delete('f');
  }
  // ---- 开车：档位 / 倒档 / 空档 / 转向灯 ----
  if (w.player.car) {
    const c = w.player.car;
    if (pressed.has('q')) { c.turnSignal = c.turnSignal === 1 ? 0 : 1; pressed.delete('q'); }
    if (pressed.has('r')) { c.turnSignal = c.turnSignal === 2 ? 0 : 2; pressed.delete('r'); }
    if (pressed.has('n')) { c.g = 0; pressed.delete('n'); }
    if (pressed.has('v')) { c.g = 6; pressed.delete('v'); }
    ['1', '2', '3', '4', '5'].forEach(k => {
      if (pressed.has(k)) { c.g = +k; pressed.delete(k); }
    });
  }
  if (pressed.has('b')) { UI.businessMenu(); pressed.delete('b'); }
  if (pressed.has('m')) { UI.cityTransfer(); pressed.delete('m'); }
  if (pressed.has('c')) { UI.statsMenu(); pressed.delete('c'); }
  if (pressed.has('h')) { UI.helpMenu(); pressed.delete('h'); }
  if (pressed.has('tab')) { UI.pauseMenu(); pressed.delete('tab'); }
  pressed.clear();
}

/* 主循环 */
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  const arrested = !document.getElementById('arrest-screen').classList.contains('hidden');
  const paused = UI.isOpen() || arrested || !gameWorld;
  if (!gameWorld) return;

  if (!paused) {
    gameWorld.update(dt);
    handleKeys(gameWorld);
  } else {
    pressed.clear();   // 面板/标题界面期间按键不滞留到关闭后误触发
  }
  Camera.follow(gameWorld.map, gameWorld.player);
  Engine.draw(ctx, gameWorld.map, gameWorld, Camera);
  updateHUD(gameWorld);
}

/* 启动 */
Object.assign(STATS, loadStats());   // 恢复生涯统计（跨会话）
Input.init();

/* 仅限电脑游玩：触屏设备 + 屏幕小于游戏画布(1280×720) 才拦截（手机/平板），
   触屏笔记本等大屏触屏设备（有键盘）不误伤 */
function detectMobile() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const small = window.innerWidth < 1280 || window.innerHeight < 700;
  return (coarse || touch) && small;
}
if (detectMobile()) {
  document.getElementById('mobile-block').classList.remove('hidden');
  document.getElementById('title-screen').classList.add('hidden');
}

document.getElementById('btn-new').addEventListener('click', startNewGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
requestAnimationFrame(loop);
