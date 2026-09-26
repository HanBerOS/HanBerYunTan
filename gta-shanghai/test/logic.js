/* 逻辑测试：模拟DOM环境，验证任务/产业/通缉核心逻辑 */
const fs = require('fs');
const path = require('path');
const dir = '/home/user/Doubao/chats/38441668935770114/games/gta-shanghai/gta-shanghai/js';

/* --- mock 浏览器环境 --- */
const ctx2d = {
  fillRect(){}, fillStyle:'', strokeRect(){}, strokeStyle:'', font:'', textAlign:'',
  fillText(){}, beginPath(){}, arc(){}, fill(){}, stroke(){}, save(){}, restore(){},
  translate(){}, rotate(){}, drawImage(){}, imageSmoothingEnabled:false, lineWidth:1
};
global.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
global.window = {
  addEventListener(){}, localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  performance: { now: () => Date.now() }
};
global.requestAnimationFrame = () => {};

let src = '';
['config.js','mapgen.js','engine.js','world.js'].forEach(f => {
  src += fs.readFileSync(path.join(dir, f), 'utf8') + '\n';
});
const factory = new Function(src + '; return { MapGen, MAPS, CONFIG, World, Engine, Input };');
const { MapGen, MAPS, CONFIG, World, Engine, Input } = factory();

let fail = 0;
function check(name, cond, extra) {
  console.log((cond ? '✅' : '❌') + ' ' + name + (extra ? '  (' + extra + ')' : ''));
  if (!cond) fail++;
}

/* --- 用例1：创建陆家嘴世界 --- */
const w = new World('lujiazui');
check('世界创建', !!w.map && w.map.tiles.length === 160000, w.map.name);
check('出生点可走', MapGen.isWalkable(w.map, w.player.x, w.player.y));
check('NPC生成', w.npcs.length > 20, w.npcs.length + '人');
check('车辆生成', w.cars.length >= 14, w.cars.length + '辆');

/* --- 用例2：产业收益 --- */
const before = w.player.money;
const b = w.businesses[0];
b.owned = true; b.level = 1;
const incPer10s = CONFIG.BUSINESS_TYPES[b.type].income;
for (let i = 0; i < 100; i++) w.update(0.12);   // 模拟12秒
const gained = w.player.money - before;
check('产业收益累积', gained >= incPer10s, '收益+' + gained + ' 预期≥' + incPer10s);

/* --- 用例3：通缉与警察 --- */
w.player.wanted = 0;
w.addWanted(2);
check('通缉等级=2', w.player.wanted === 2);
// 模拟追捕生成
for (let i = 0; i < 30; i++) w.update(0.16);
const chaseCount = w.police.filter(c => c.mode === 'chase').length;
check('追捕警车生成', chaseCount >= 1, chaseCount + '辆追捕中');

/* --- 用例4：任务系统 --- */
// 直接调用 startTask 模拟从任务点接单
w.startTask({ type: 'delivery', x: w.taskPoints[0].x, y: w.taskPoints[0].y });
check('任务已激活', w.task && w.task.active, w.task ? w.task.type : 'none');
// 模拟玩家开车到终点附近完成
w.player.px = w.task.tx * 8; w.player.py = w.task.ty * 8;
for (let i = 0; i < 10 && w.task.active; i++) w.update(0.1);
check('任务完成', !w.task.active, 'money=' + w.player.money);
check('任务奖励入账', w.player.money > before + incPer10s);

/* --- 用例5：崇明/临港特殊地图 --- */
const cm = new World('chongming');
check('崇明生成', !!cm.map && cm.map.tiles.length === 160000);
const lg = new World('lingang');
check('临港生成(圆形滴水湖)', !!lg.map && lg.map.tiles.length === 160000);
let waterCells = 0;
for (let i = 0; i < lg.map.tiles.length; i++) if (lg.map.tiles[i] === CONFIG.TILES.WATER) waterCells++;
check('滴水湖水域存在', waterCells > 5000, waterCells + '格水域');

/* --- 用例6：驾驶速度单位（修复后应为格/秒，可达CAR_MAX=20） --- */
const wd = new World('xuhui');
const cv = wd.cars[0];
cv.px = 200 * 8; cv.py = 117 * 8; cv.dx = 1; cv.dy = 0;  // 放到主路上
cv.occupied = true; cv.mode = 'player';
wd.player.car = cv;
wd.player.px = cv.px; wd.player.py = cv.py;
Input.keys['w'] = true;
for (let i = 0; i < 150; i++) wd.player.updateDriving(1 / 30, wd);
Input.keys['w'] = false;
check('开车可达高速(格/秒)', cv.speed >= 18, 'speed=' + cv.speed.toFixed(1) + ' 格/秒（步行仅4.5）');
wd.player.car = null; cv.occupied = false;

/* --- 用例7：非警车撞人不逮捕 --- */
const wa = new World('huangpu');
const carA = wa.cars[0];
carA.speed = 12; carA.isPolice = false;
const aliveBefore = wa.player.alive;
for (let i = 0; i < 40; i++) carA.move(0.05, wa, null);
check('普通车撞人不逮捕', wa.player.alive === true, 'alive=' + wa.player.alive);

console.log(fail ? '\n失败 ' + fail + ' 项' : '\n全部通过');
process.exit(fail ? 1 : 0);