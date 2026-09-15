const CACHE_NAME = "fridge-calendar-2026-09-15-7";
const APP_SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SHOW_EXPIRY_NOTIFICATION") {
    const { title, body, tag = "fridge-expiry" } = event.data;
    event.waitUntil(self.registration.showNotification(title, {
      body,
      tag,
      icon: "./icons/icon-192.png",
      badge: "./icons/icon-192.png",
      data: { url: "./" }
    }));
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "check-expirations") event.waitUntil(checkStoredExpirations());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      return existing ? existing.focus() : self.clients.openWindow("./");
    })
  );
});

async function checkStoredExpirations() {
  const data = await readNotificationData();
  if (!data?.settings?.enabled || Notification.permission !== "granted") return;
  const todayKey = toDateKey(new Date());
  if (data.lastNotificationDate === todayKey) return;
  const today = startOfDay(new Date());
  const matching = (data.items || []).filter((item) => {
    const days = Math.round((startOfDay(new Date(`${item.expiryDate}T00:00:00`)) - today) / 86400000);
    return data.settings.days.includes(days) || (days < 0 && data.settings.days.includes(-1));
  });
  if (!matching.length) return;
  await self.registration.showNotification("冰箱日曆｜期限提醒", {
    body: matching.length === 1 ? `${matching[0].name}需要留意保存期限` : `${matching.length} 項物品需要留意保存期限`,
    tag: `fridge-expiry-${todayKey}`,
    icon: "./icons/icon-192.png",
    badge: "./icons/icon-192.png",
    data: { url: "./" }
  });
  data.lastNotificationDate = todayKey;
  await writeNotificationData(data);
}

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fridge-calendar", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readNotificationData() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction("state").objectStore("state").get("notificationData");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function writeNotificationData(value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("state", "readwrite");
    transaction.objectStore("state").put(value, "notificationData");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
}
