/* ============================================================
 * 渲染引擎：输入、相机、实体绘制、标记层
 * ============================================================ */
const Input = {
  keys: {},
  init() {
    window.addEventListener('keydown', e => {
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault();
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

    // 2) 地面标记：业务点/任务点/传送点/警局/地标名称
    this.drawMarkers(ctx, map, world, cam);

    // 3) 实体：车（底层）、NPC、警察、玩家（顶层）
    const sorted = [];
    world.cars.forEach(c => sorted.push({ ent: c, z: 2 }));
    world.npcs.forEach(n => sorted.push({ ent: n, z: n.isPolice ? 3 : 2.5 }));
    sorted.push({ ent: world.player, z: 3 });
    sorted.sort((a, b) => (a.ent.py - a.ent.px * 0.01) - (b.ent.py - b.ent.px * 0.01));

    sorted.forEach(o => this.drawEntity(ctx, o.ent, cam, o.z));

    // 4) 当前任务目标标记
    if (world.task && world.task.active) this.drawTaskMarker(ctx, world, cam);
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

    // 任务点
    world.taskPoints.forEach(t => {
      const px = t.x * P, py = t.y * P;
      if (px < cam.x || px > cam.x + cam.w || py < cam.y || py > cam.y + cam.h) return;
      ctx.font = '14px serif';
      ctx.fillText('📋', px - cam.x, py - cam.y + 4);
    });

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
  drawEntity(ctx, ent, cam, z) {
    const P = CONFIG.TILE;
    const sx = ent.px - cam.x, sy = ent.py - cam.y;
    if (sx < -40 || sx > cam.w + 40 || sy < -40 || sy > cam.h + 40) return;

    if (ent.isCar) { this.drawCar(ctx, ent, sx, sy); return; }
    // 小人
    const c = ent.color;
    const facing = ent.fx || 0, fy = ent.fy || 1;
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
  },

  drawCar(ctx, car, sx, sy) {
    const dx = Math.round(car.dx), dy = Math.round(car.dy);
    // 车身按朝向拉伸
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(sx - 5, sy - 2, 10, 4);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = car.color;
    ctx.fillRect(-7, -4, 14, 8);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(-2, -4, 4, 8);
    // 警车灯
    if (car.isPolice) {
      ctx.fillStyle = (Math.floor(Date.now() / 180) % 2) ? '#f22' : '#22f';
      ctx.fillRect(-7, -4, 3, 3);
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
