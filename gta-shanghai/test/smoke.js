/* 冒烟测试：验证12区+总览地图生成无异常、关键点可达 */
const fs = require('fs');
const path = require('path');
const dir = '/home/user/Doubao/chats/38441668935770114/games/gta-shanghai/gta-shanghai/js';

let src = '';
['config.js', 'mapgen.js'].forEach(f => { src += fs.readFileSync(path.join(dir, f), 'utf8') + '\n'; });
const factory = new Function(src + '; return { MapGen, MAPS, CONFIG };');
const { MapGen, MAPS } = factory();

const results = [];
let fail = 0;

// 1) 12区 + city 生成
for (const id of [...Object.keys(MAPS), 'city']) {
  try {
    const map = id === 'city' ? MapGen.genCityMap() : MapGen.generate(id);
    // tiles 大小
    const okSize = map.tiles.length === map.w * map.h;
    // spawn 可行走
    const okSpawn = MapGen.isWalkable(map, map.spawn.x, map.spawn.y);
    // 道路存在
    let roadCount = 0;
    for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === 1 || map.tiles[i] === 7) roadCount++;
    const pass = okSize && okSpawn && roadCount > (id === 'city' ? 100 : 500);
    results.push({ id, name: map.name, tiles: map.tiles.length, road: roadCount, spawn: okSpawn, pass });
    if (!pass) fail++;
  } catch (e) {
    fail++;
    results.push({ id, error: e.message, pass: false });
  }
}

console.table(results);
console.log('\n失败数:', fail);
process.exit(fail ? 1 : 0);
