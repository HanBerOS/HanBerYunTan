/* ============================================================
 * 渲染引擎：输入、相机、实体绘制、标记层
 * ============================================================ */
const Input = {
  keys: {},
  init() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' ','Tab'].includes(e.key)) e.preventDefault();
      Input.keys[e.key.toLowerCase()] = true;
    });
    window.addEventListener('keyup', e => { Input.keys[e.key.toLowerCase()] = false; });
  },
  down(k) { return !!Input.keys[k]; },
  axis() {
    let x = 0, y = 0;
    if (Input.down('w') || Input.down('arrowup')) y -= 1;
    if (Input.down('s') || Input.down('arrowdown')) y += 1;
    if (Input.down('a') || Input.down('arrowleft')) x -= 1;
    if (Input.down('d') || Input.down('arrowright')) x += 1;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
  }
};

const Camera = {
  x: 0, y: 0, w: 1280, h: 720,
  follow(map, target) {
    const P = CONFIG.TILE;
    const halfW = this.w / 2, halfH = this.h / 2;
    this.x = target.px - halfW;
    this.y = target.py - halfH;
    this.x = Math.max(0, Math.min(map.w * P - this.w, this.x));
    this.y = Math.max(0, Math.min(map.h * P - this.h, this.y));
  }
};

const Engine = {
  /* 绘制一帧游戏画面 */
  draw(ctx, map, world, cam) {
    // 1) 地图位图裁剪
    const sx = cam.x, sy = cam.y;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(map.canvas,
      sx, sy, cam.w, cam.h,
      0, 0, cam.w, cam.h);

    // 1.5) 漂移胎痕（车底）
    if (world.driftMarks && world.driftMarks.length) {
      for (const mk of world.driftMarks) {
        const msx = mk.x - cam.x, msy = mk.y - cam.y;
        ctx.fillStyle = 'rgba(28,28,28,' + (0.32 * mk.life).toFixed(2) + ')';
        ctx.fillRect(msx - 1, msy - 1, 2, 2);
      }
    }

    // 2) 地面标记：业务点/任务点/传送点/警局/地标名称
    this.drawMarkers(ctx, map, world, cam);

    // 3) 实体：车（底层）、NPC、警察、玩家（顶层）
    const sorted = [];
    world.cars.forEach(c => sorted.push({ ent: c, z: 2 }));
    world.npcs.forEach(n => sorted.push({ ent: n, z: n.isPolice ? 3 : 2.5 }));
    sorted.push({ ent: world.player, z: 3 });
    sorted.sort((a, b) => (a.ent.py - a.ent.px * 0.01) - (b.ent.py - b.ent.px * 0.01));

    sorted.forEach(o => this.drawEntity(ctx, o.ent, cam, o.z, world));

    // 4) 当前任务目标标记
    if (world.task && world.task.active) this.drawTaskMarker(ctx, world, cam);

    // 5) 昼夜色调
    const na = Engine.nightAlpha(world.timeOfDay);
    if (na > 0.02) {
      ctx.fillStyle = 'rgba(8,18,46,' + na.toFixed(3) + ')';
      ctx.fillRect(0, 0, cam.w, cam.h);
    }

    // 6) 季节色调 + 覆雪（沈阳冬/雪天整体偏白）
    const season = world.season;
    if (season === 2) { ctx.fillStyle = 'rgba(224,182,64,0.07)'; ctx.fillRect(0, 0, cam.w, cam.h); }        // 秋意
    else if (season === 3 && world.mapId === 'shenyang') { ctx.fillStyle = 'rgba(226,234,242,0.12)'; ctx.fillRect(0, 0, cam.w, cam.h); } // 沈阳隆冬
    if (world.snowActive) {
      ctx.fillStyle = 'rgba(240,244,250,' + (0.06 + world.weather.power * 0.05).toFixed(2) + ')';
      ctx.fillRect(0, 0, cam.w, cam.h);
    }

    // 7) 雨丝（台风） / 雪花（雪天）
    if (world.typhoonActive) {
      ctx.save();
      ctx.strokeStyle = 'rgba(168,198,236,' + Math.min(0.5, 0.12 + world.weather.power * 0.03).toFixed(2) + ')';
      ctx.lineWidth = 1;
      const t = Date.now() / 40;
      for (let i = 0; i < 70; i++) {
        const wx = (i * 137.5 + t * world.weather.power * 0.6) % (cam.w + 40) - 20;
        const wy = ((i * 73.1 + t * 3.2) % (cam.h + 40)) - 20;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx - world.weather.power * 0.7, wy + 8 + world.weather.power * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (world.snowActive) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.5 + world.weather.power * 0.15).toFixed(2) + ')';
      const t = Date.now() / 100;
      for (let i = 0; i < 34 * world.weather.power; i++) {
        const wx = (i * 127.3 + t * (1 + world.weather.power)) % (cam.w + 20) - 10;
        const wy = (i * 57.9 + t * (0.8 + world.weather.power * 0.6)) % (cam.h + 20) - 10;
        ctx.fillRect(wx, wy, 2, 2);
      }
    }

    // 8) 严寒结霜（寒冷值越高，屏幕越冷蓝，四角结冰）
    if (world.cold > 0) {
      const a = (world.cold / 100) * 0.26;
      ctx.fillStyle = 'rgba(150,200,255,' + a.toFixed(3) + ')';
      ctx.fillRect(0, 0, cam.w, cam.h);
      const fa = Math.min(0.5, (world.cold / 100) * 0.5);
      ctx.strokeStyle = 'rgba(220,238,255,' + fa.toFixed(3) + ')';
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, cam.w - 10, cam.h - 10);
    }

    // 9) 迷你地图（右上角）
    if (map.id !== 'city') this.drawMinimap(ctx, map, world, cam);
  },

  /* 根据游戏小时(0-24)计算夜晚暗度 0~0.34 */
  nightAlpha(h) {
    if (h >= 7 && h < 19) return 0;
    if (h < 7) return 0.34 * Math.min(1, (7 - h) / 2);          // 黎明渐亮
    return 0.34 * Math.min(1, (h - 19) / 2);                    // 入夜渐暗
  },

  /* 迷你地图：当前区缩略图 + 玩家 + 任务目标 + 最近交互点 */
  drawMinimap(ctx, map, world, cam) {
    const size = 160, pad = 8, x0 = cam.w - size - pad, y0 = pad;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(10,14,20,.82)';
    ctx.fillRect(x0 - 2, y0 - 2, size + 4, size + 4);
    ctx.drawImage(map.canvas, x0, y0, size, size);
    // 玩家
    const px = x0 + (world.player.px / (map.w * P())) * size;
    const py = y0 + (world.player.py / (map.h * P())) * size;
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 2, py - 2, 4, 4);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(px - 2.5, py - 2.5, 5, 5);
    // 任务目标
    if (world.task && world.task.active) {
      const tx = x0 + (world.task.tx * P() / (map.w * P())) * size;
      const ty = y0 + (world.task.ty * P() / (map.h * P())) * size;
      ctx.fillStyle = (Math.floor(Date.now() / 350) % 2) ? '#ff0' : '#fa0';
      ctx.fillRect(tx - 2, ty - 2, 4, 4);
    }
    // 最近交互目标
    const it = world.findInteract && world.findInteract();
    if (it && it.kind !== 'car' && it.kind !== 'exit') {
      const tgt = it.b ? it.b : it.t ? it.t : it.tp ? it.tp : it.z ? it.z : null;
      if (tgt) {
        const ix = x0 + (tgt.x * P() / (map.w * P())) * size;
        const iy = y0 + (tgt.y * P() / (map.h * P())) * size;
        ctx.fillStyle = '#4f8';
        ctx.fillRect(ix - 1, iy - 1, 3, 3);
      }
    }
    ctx.restore();
    // 边框
    ctx.strokeStyle = 'rgba(90,255,160,.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 1.5, y0 - 1.5, size + 3, size + 3);
    ctx.font = '10px "Courier New",monospace';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(map.name, x0 + 3, y0 + 11);
  },

  /* 地面标记 */
  drawMarkers(ctx, map, world, cam) {
    const P = CONFIG.TILE;

    // 地标名称
    ctx.font = '11px "Courier New",monospace';
    ctx.textAlign = 'center';
    map.landmarks.forEach(lm => {
      const px = lm.x * P, py = lm.y * P;
      if (px < cam.x - 80 || px > cam.x + cam.w + 80 || py < cam.y - 20 || py > cam.y + cam.h + 20) return;
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(px - cam.x - 40, py - cam.y - 12, 80, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(lm.name, px - cam.x, py - cam.y);
    });

    // 业务点（未拥有的显示图标；已拥有的在面板管理）
    world.businesses.forEach(b => {
      if (b.owned) return;
      const px = b.x * P, py = b.y * P;
      if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
      const bt = CONFIG.BUSINESS_TYPES[b.type];
      ctx.font = '15px serif';
      ctx.fillText(bt.icon, px - cam.x, py - cam.y + 5);
      ctx.font = '10px "Courier New",monospace';
      ctx.fillStyle = '#ffe';
      ctx.fillText(bt.name, px - cam.x, py - cam.y + 20);
      ctx.fillStyle = '#8f8';
      ctx.fillText('¥' + bt.price, px - cam.x, py - cam.y + 31);
    });

    // 房产楼盘（未购：🏢 图标+价格；已购：🏠 图标+"我的家"）
    (world.homes || []).forEach(h => {
      const px = h.x * P, py = h.y * P;
      if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
      const ht = CONFIG.HOME_TYPES[h.type] || { icon: '🏠' };
      ctx.font = '15px serif';
      ctx.fillStyle = h.owned ? '#ffd700' : '#7fb3ff';
      ctx.fillText(h.owned ? '🏠' : (ht.icon || '🏢'), px - cam.x, py - cam.y + 5);
      ctx.font = '10px "Courier New",monospace';
      ctx.fillStyle = '#ffe';
      ctx.fillText(h.owned ? '我的家' : h.name, px - cam.x, py - cam.y + 20);
      if (!h.owned) {
        ctx.fillStyle = '#ffd';
        ctx.fillText('¥' + h.price, px - cam.x, py - cam.y + 31);
      }
    });

    // 任务点
    world.taskPoints.forEach(t => {
      const px = t.x * P, py = t.y * P;
      if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
      ctx.font = '14px serif';
      ctx.fillText('📋', px - cam.x, py - cam.y + 4);
    });

    // 随机街头失物包裹（金色闪烁箱）
    if (world.pickup) {
      const px = world.pickup.x * P, py = world.pickup.y * P;
      if (px >= cam.x - P && px <= cam.x + cam.w + P && py >= cam.y - P && py <= cam.y + cam.h + P) {
        const blink = Math.floor(Date.now() / 250) % 2 === 0;
        ctx.fillStyle = blink ? '#ffd700' : '#c9a227';
        ctx.fillRect(px - cam.x + 1, py - cam.y + 1, P - 2, P - 2);
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.fillRect(px - cam.x + 3, py - cam.y + 3, P - 6, P - 6);
        ctx.font = '11px "Courier New",monospace';
        ctx.fillStyle = '#ffe';
        ctx.fillText('失物包裹', px - cam.x, py - cam.y - 3);
      }
    }

    // 传送点
    map.transfers.forEach(tp => {
      const px = tp.x * P, py = tp.y * P;
      if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
      ctx.font = '13px serif';
      ctx.fillText('🚇', px - cam.x, py - cam.y + 4);
    });

    // 警局
    map.police.forEach(p => {
      const px = p.x * P, py = p.y * P;
      if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
      ctx.font = '13px serif';
      ctx.fillText('🚓', px - cam.x, py - cam.y + 4);
    });

    // 红绿灯：路口信号灯（东西向/南北向两盏小灯，随相位变色）
    if (world.trafficLights && world.trafficLights.length) {
      const ewGreen = world.trafficPhase === 0;
      world.trafficLights.forEach(lt => {
        const px = lt.x * P, py = lt.y * P;
        if (px < cam.x - 6 || px > cam.x + cam.w + 6 || py < cam.y - 6 || py > cam.y + cam.h + 6) return;
        const sx = px - cam.x, sy = py - cam.y;
        // 灯杆（横杆两侧各悬一灯）
        ctx.fillStyle = 'rgba(30,40,60,.9)';
        ctx.fillRect(sx - 5, sy - 1, 10, 2);
        // 东西向灯（左侧，控制横行车流）
        ctx.fillStyle = ewGreen ? '#2ecc40' : '#ff4136';
        ctx.fillRect(sx - 6, sy - 3, 3, 5);
        ctx.strokeStyle = 'rgba(0,0,0,.6)';
        ctx.strokeRect(sx - 6, sy - 3, 3, 5);
        // 南北向灯（右侧，控制纵行车流）
        ctx.fillStyle = ewGreen ? '#ff4136' : '#2ecc40';
        ctx.fillRect(sx + 3, sy - 3, 3, 5);
        ctx.strokeRect(sx + 3, sy - 3, 3, 5);
      });
    }

    // 总览地图：区块名称
    if (map.zones) {
      ctx.font = 'bold 14px "Courier New",monospace';
      map.zones.forEach(z => {
        const px = z.x * P, py = z.y * P;
        if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(px - cam.x - 26, py - cam.y - 7, 52, 14);
        ctx.fillStyle = '#fff';
        ctx.fillText(z.name, px - cam.x, py - cam.y);
      });
    }
  },

  /* 实体绘制 */
  drawEntity(ctx, ent, cam, z, world) {
    if (ent.hidden) return;   // 已上车乘客等不渲染
    const P = CONFIG.TILE;
    const sx = ent.px - cam.x, sy = ent.py - cam.y;
    if (sx < -40 || sx > cam.w + 40 || sy < -40 || sy > cam.h + 40) return;

    if (ent.isCar) { this.drawCar(ctx, ent, sx, sy); return; }
    // 交警：深蓝制服 + 白手套指挥棒 + 帽子徽
    if (ent.isTrafficPolice) {
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(sx - 3, sy - 1, 6, 2);
      ctx.fillStyle = '#1f3a5f';
      ctx.fillRect(sx - 3, sy - 6, 6, 6);
      ctx.fillStyle = '#e8c39a';
      ctx.fillRect(sx - 2, sy - 10, 4, 4);
      ctx.fillStyle = '#1f3a5f';
      ctx.fillRect(sx - 2, sy - 13, 4, 2);
      ctx.fillStyle = '#f1c40f';
      ctx.fillRect(sx - 1, sy - 13, 2, 2);
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx - 4, sy - 8, 2, 2);
      ctx.fillRect(sx + 3, sy - 8, 2, 2);
      // 红绿指挥棒（交警按相位挥动方向指示）
      const ewG = world ? world.trafficPhase === 0 : false;
      ctx.fillStyle = ewG ? '#2ecc40' : '#ff4136';
      ctx.fillRect(sx + (ewG ? 4 : -4), sy - 4, ewG ? 3 : 3, 2);
      return;
    }
    // 小人
    const c = ent.color;
    const facing = (ent.fx === 0 ? 0 : ent.fx || 0), fy = (ent.fy === 0 ? 0 : ent.fy || 1);
    // 阴影
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(sx - 3, sy - 1, 6, 2);
    // 身体
    ctx.fillStyle = c;
    ctx.fillRect(sx - 3, sy - 6, 6, 6);
    // 头
    ctx.fillStyle = '#e8c39a';
    ctx.fillRect(sx - 2, sy - 10, 4, 4);
    // 朝向指示
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(sx + facing * 4 - 1, sy + fy * 3 - 1, 2, 2);
    // 警察标识
    if (ent.isPolice) {
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(sx - 3, sy - 13, 6, 3);
    }
    // 对话气泡
    if (ent.sayT > 0 && ent.say) {
      ctx.font = '10px "Courier New",monospace';
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(sx - 22, sy - 26, 44, 13);
      ctx.fillStyle = '#fff';
      ctx.fillText(ent.say, sx, sy - 16);
    }
  },

  drawCar(ctx, car, sx, sy) {
    const dx = Math.round(car.dx), dy = Math.round(car.dy);
    const ct = CONFIG.CAR_TYPES[car.type] || CONFIG.CAR_TYPES.normal;
    const sw = ct.sw, sh = ct.sh;
    // 车身按朝向拉伸
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(sx - sw, sy - 2, sw * 2, 4);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(dy, dx));
    // 车身
    ctx.fillStyle = car.color;
    ctx.fillRect(-sw, -sh, sw * 2, sh * 2);
    // 车窗
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(-sw * 0.3, -sh, sw * 0.6, sh * 2);
    // 跑车尾翼
    if (car.type === 'sports') {
      ctx.fillStyle = '#222';
      ctx.fillRect(-sw, -sh - 1, sw * 2, 1);
    }
    // 出租车顶灯
    if (car.type === 'taxi') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-3, -sh - 2, 6, 2);
    }
    // 卡车货箱
    if (car.type === 'truck') {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(1, -sh, sw, sh * 2);
    }
    // 警车灯
    if (car.isPolice) {
      ctx.fillStyle = (Math.floor(Date.now() / 180) % 2) ? '#f22' : '#22f';
      ctx.fillRect(-sw, -sh, 3, 3);
    }
    // 转向灯（玩家车手动开启：Q左/R右，黄灯闪烁；局部系 +y=车左侧）
    if (car.turnSignal && car.occupied) {
      const blink = Math.floor(Date.now() / 250) % 2 === 0;
      if (blink) {
        ctx.fillStyle = '#ffd23f';
        const side = car.turnSignal === 1 ? 1 : -1;
        ctx.fillRect(sw * 0.55 - 1, side * (sh - 1), 2, 2);   // 前灯
        ctx.fillRect(-sw * 0.55 - 1, side * (sh - 1), 2, 2);  // 后灯
      }
    }
    ctx.restore();
  },

  /* 任务目标标记（闪烁箭头） */
  drawTaskMarker(ctx, world, cam) {
    const t = world.task;
    const P = CONFIG.TILE;
    const tx = t.tx * P, ty = t.ty * P;
    const px = tx - cam.x, py = ty - cam.y;
    if (px < -20 || px > cam.w + 20 || py < -20 || py > cam.h + 20) {
      // 屏幕边缘方向指示
      const cx = cam.w / 2, cy = cam.h / 2;
      const ang = Math.atan2(ty - cam.y - cy, tx - cam.x - cx);
      const ex = cx + Math.cos(ang) * (cam.w / 2 - 30);
      const ey = cy + Math.sin(ang) * (cam.h / 2 - 30);
      ctx.fillStyle = '#ff0';
      ctx.beginPath();
      ctx.arc(ex, ey, 8, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const blink = Math.floor(Date.now() / 350) % 2 === 0;
    if (blink) {
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2;
      ctx.strokeRect(px - 12, py - 12, 24, 24);
    }
  },

  /* 把世界坐标→屏幕坐标（供交互检测） */
  worldToScreen(cam, wx, wy) { return { x: wx - cam.x, y: wy - cam.y }; }
};
