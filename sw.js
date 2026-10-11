/* HanBer云坛 - Service Worker
 * 接收服务器推送，即使网页没打开也能弹出系统通知
 * 部署：和 index.html 一起放到 Netlify 站点根目录 */

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

/* ============ PWA 离线缓存（v6.4.6） ============
 * 缓存应用外壳，支持"安装成软件"后离线打开
 * 只缓存同源静态资源；API（supabase / wttr）一律走网络，绝不缓存 */
var CACHE_NAME = 'yuntan-pwa-v2';
var APP_SHELL = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (c) { return c.addAll(APP_SHELL); }).catch(function () {})
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k !== CACHE_NAME) return caches.delete(k);
        }));
      })
    ])
  );
});

self.addEventListener('fetch', function (e) {
  var url = e.request.url;
  /* 只处理同源 GET 静态请求（含相对路径），API/跨域请求一律放行走网络 */
  if (e.request.method !== 'GET') return;
  var same = url.indexOf(self.location.origin) === 0;
  var isApi = /supabase\.co|wttr\.in|aka\.doubaocdn\.com|googleapis|gstatic/i.test(url);
  if (!same || isApi) return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      if (hit) return hit;
      return fetch(e.request).then(function (res) {
        if (res && res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (c) { c.put(e.request, copy); });
        }
        return res;
      }).catch(function () {
        /* 离线兜底：index.html 及子资源 */
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return caches.match(e.request);
      });
    })
  );
});
