/* HanBer云坛 - Service Worker
 * 接收服务器推送，即使网页没打开也能弹出系统通知
 * 部署：和 index.html 一起放到 Netlify 站点根目录 */
self.addEventListener('install', function (e) {
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
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
