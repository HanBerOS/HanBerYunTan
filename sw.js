/* HanBer云坛 - Service Worker
 * 接收服务器推送 + 静态资源缓存（首次后秒开）
 * 部署：和 index.html 一起放到站点根目录 */
var CACHE = 'hanber-v6-1';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      return c.addAll(['./', './index.html']);
    }).catch(function () {})
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

/* 缓存策略：HTML 导航 network-first（更新后立即拿新版，离线才用缓存兜底）；静态资源 cache-first；API 直连 */
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // supabase / 后端 API 不缓存，保证实时
  if (url.hostname.indexOf('supabase') >= 0 || url.pathname.indexOf('/rest/v') >= 0 || url.pathname.indexOf('/auth/v1') >= 0) return;

  // 页面导航：优先网络拿最新版，失败再读缓存（离线可开）
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith(
      fetch(req).then(function (resp) {
        if (resp && resp.status === 200) {
          var clone = resp.clone();
          caches.open(CACHE).then(function (c) { c.put('./index.html', clone); });
        }
        return resp;
      }).catch(function () {
        return caches.match('./index.html');
      })
    );
    return;
  }

  // 其他静态资源（css/js/图片/游戏/音频）：cache-first，后台补缓存
  e.respondWith(
    caches.match(req).then(function (cached) {
      if (cached) return cached;
      return fetch(req).then(function (resp) {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          var clone = resp.clone();
          caches.open(CACHE).then(function (c) { c.put(req, clone); });
        }
        return resp;
      }).catch(function () { return cached; });
    })
  );
});

/* 收到推送 → 弹出系统通知 */
self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  var title = data.title || 'HanBer云坛';
  var options = {
    body: data.body || '你有一条新消息',
    icon: data.icon || 'data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27><text y=%27.9em%27 font-size=%2790%27>☁️</text></svg>',
    badge: data.badge || 'data:image/svg+xml,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27><text y=%27.9em%27 font-size=%2790%27>☁️</text></svg>',
    data: { url: data.url || '/', postId: data.postId || '' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

/* 点击通知 → 打开对应页面 */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) { list[i].focus(); return; }
      }
      return self.clients.openWindow(url);
    })
  );
});
