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
  document.getElementById('title-screen').classList.add('hidden');
  gameWorld = new World(CONFIG.START_MAP);
  worldSave();
  gameWorld.notice('🚶 欢迎来到上海像素城！按 M 可查看全城地图。');
}

function continueGame() {
  const d = worldLoad();
  if (!d) {
    notice('❌ 没有存档，先开新游戏吧。');
    return;
  }
  document.getElementById('title-screen').classList.add('hidden');
  gameWorld = new World(d.mapId || CONFIG.START_MAP);
  restoreBusinesses(gameWorld, d);
  gameWorld.player.money = d.money || 1000;
  if (d.px && d.py) { gameWorld.player.px = d.px; gameWorld.player.py = d.py; }
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
  const spd = document.getElementById('hud-speed');
  if (p.car) {
    spd.style.display = 'block';
    spd.textContent = Math.round(Math.abs(p.car.speed) * 3.2) + ' km/h';
  } else spd.style.display = 'none';

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
  if (pressed.has('f')) {
    const t = w.findInteract();
    if (t && t.kind !== 'car' && t.kind !== 'exit') doInteract(t);
    pressed.delete('f');
  }
  if (pressed.has('b')) { UI.businessMenu(); pressed.delete('b'); }
  if (pressed.has('m')) { UI.cityTransfer(); pressed.delete('m'); }
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
  }
  Camera.follow(gameWorld.map, gameWorld.player);
  Engine.draw(ctx, gameWorld.map, gameWorld, Camera);
  updateHUD(gameWorld);
}

/* 启动 */
Input.init();
document.getElementById('btn-new').addEventListener('click', startNewGame);
document.getElementById('btn-continue').addEventListener('click', continueGame);
requestAnimationFrame(loop);
