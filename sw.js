/* HanBer云坛 - Service Worker（v6.5 精简版）
 * 只负责通知推送，不再缓存任何页面/资源：
 * - 去掉 App Shell 缓存（旧版缓存旧 index.html 导致刷新永远旧版）
 * - 去掉 fetch 拦截（页面一律走网络，更新即所见）
 * 部署：和 index.html 一起放到 GitHub Pages 站点根目录 */

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

/* 激活时清理旧版 PWA 缓存（yuntan-pwa-v1/v2 等），确保不残留旧页面 */
self.addEventListener('activate', function (e) {
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
          if (k.indexOf('yuntan-pwa') === 0) return caches.delete(k);
        }));
      })
    ])
  );
});

/* 不拦截任何网络请求：页面/资源一律走网络，绝不返回缓存旧版 */
