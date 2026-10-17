/* HanBer云坛 - Service Worker
 * 策略：HTML 先读缓存秒开 → 后台静默拉新版 → 发现变化通知页面显示刷新条（不自动 reload）
 * 部署时如需强制更新所有人，改一下 CACHE 版本号即可 */
var CACHE = 'hanber-v6-4';

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

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // supabase / 后端 API 不缓存
  if (url.hostname.indexOf('supabase') >= 0 || url.pathname.indexOf('/rest/v') >= 0 || url.pathname.indexOf('/auth/v1') >= 0) return;

  // 页面导航：cache-first，然后后台比对新版
  if (req.mode === 'navigate' || (req.destination === 'document')) {
    e.respondWith(
      caches.open(CACHE).then(function (c) {
        return c.match('./index.html').then(function (cached) {
          // 后台静默拉新版，和缓存比对，不同就更新并通知页面刷新
          fetch(req).then(function (resp) {
            if (!resp || resp.status !== 200) return;
            var respClone = resp.clone();
            c.match('./index.html').then(function (old) {
              if (!old) { c.put('./index.html', respClone); return; }
              // 比较字节长度（简单可靠，省得读整个 body）
              respClone.arrayBuffer().then(function (buf) {
                old.arrayBuffer().then(function (oldBuf) {
                  if (buf.byteLength !== oldBuf.byteLength) {
                    c.put('./index.html', new Response(buf, { headers: resp.headers }));
                    // 通知所有标签页刷新
                    self.clients.matchAll({ type: 'window' }).then(function (clients) {
                      clients.forEach(function (win) {
                        try { win.postMessage({ type: 'hanber-new-version' }); } catch (e) {}
                      });
                    });
                  }
                });
              });
            });
          }).catch(function () {});
          return cached || fetch(req);
        });
      })
    );
    return;
  }

  // 静态资源：cache-first
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
