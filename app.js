const APP_VERSION = "2026.09.15.10";
const DATA_VERSION = 1;
const ITEMS_KEY = "fridge-calendar-items-v1";
const SETTINGS_KEY = "fridge-calendar-settings-v1";
const LAST_NOTICE_KEY = "fridge-calendar-last-notice";

const defaultSettings = {
  enabled: false,
  days: [7, 3, 1, 0, -1],
  time: "09:00",
  theme: "system"
};

const state = {
  items: loadJson(ITEMS_KEY, []),
  settings: sanitizeSettings(loadJson(SETTINGS_KEY, {})),
  filter: "all",
  selectedId: null
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const elements = {
  expiryList: $("#expiryList"),
  emptyState: $("#emptyState"),
  itemFormDialog: $("#itemFormDialog"),
  itemForm: $("#itemForm"),
  detailDialog: $("#detailDialog"),
  manageDialog: $("#manageDialog"),
  transferDialog: $("#transferDialog"),
  settingsDialog: $("#settingsDialog"),
  toast: $("#toast")
};

init();

function init() {
  sanitizeStoredItems();
  applyTheme(state.settings.theme);
  bindEvents();
  render();
  fillSettingsForm();
  registerServiceWorker();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkNotifications();
  });
  window.setInterval(checkNotifications, 30 * 60 * 1000);
}

function bindEvents() {
  $("#addButton").addEventListener("click", () => openItemForm());
  $("#manageButton").addEventListener("click", openManageDialog);
  $("#transferButton").addEventListener("click", openTransferDialog);
  $("#settingsButton").addEventListener("click", openSettingsDialog);
  $("#addFromManage").addEventListener("click", () => {
    elements.manageDialog.close();
    openItemForm();
  });
  $("#editFromDetail").addEventListener("click", () => {
    const id = state.selectedId;
    elements.detailDialog.close();
    openItemForm(id);
  });
  $("#deleteFromDetail").addEventListener("click", () => deleteItem(state.selectedId));
  $("#copyCodeButton").addEventListener("click", copyExportCode);
  $("#importCodeButton").addEventListener("click", importCode);
  $("#saveSettingsButton").addEventListener("click", saveSettings);
  $("#testNotificationButton").addEventListener("click", sendTestNotification);
  elements.itemForm.addEventListener("submit", saveItem);

  $$('input[name="theme"]').forEach((input) => {
    input.addEventListener("change", () => applyTheme(input.value));
  });

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => {
    if (state.settings.theme === "system") applyTheme("system");
  });

  $$(".filter-tab").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      $$(".filter-tab").forEach((tab) => tab.classList.toggle("is-active", tab === button));
      renderItems();
    });
  });

  $$('[data-close-dialog]').forEach((button) => {
    button.addEventListener("click", () => $(`#${button.dataset.closeDialog}`).close());
  });

  $$('dialog').forEach((dialog) => {
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function render() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("zh-TW", { weekday: "long" }).format(now);
  $("#todayLabel").textContent = `${toDateInput(now).replaceAll("-", "/")} ${weekday}`;
  renderItems();
  renderManageList();
  syncNotificationData();
}

function renderItems() {
  const items = state.items
    .filter((item) => state.filter === "all" || item.location === state.filter)
    .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.name.localeCompare(b.name, "zh-Hant"));
  elements.emptyState.hidden = items.length > 0;
  elements.expiryList.innerHTML = items.map(itemCardTemplate).join("");

  $$(".item-card", elements.expiryList).forEach((card) => {
    card.addEventListener("click", () => openDetail(card.dataset.id));
  });
}

function itemCardTemplate(item) {
  const info = expiryInfo(item.expiryDate);
  return `
    <button class="item-card ${info.className}" type="button" data-id="${escapeHtml(item.id)}">
      <span class="item-icon">${locationIcon(item.location)}</span>
      <span class="item-main">
        <span class="item-name">${escapeHtml(item.name)}</span>
        <span class="item-meta">${item.location === "freezer" ? "冷凍" : "冷藏"} · ${formatDate(item.expiryDate)}</span>
      </span>
      <span class="item-status">${info.status}<small>${info.substatus}</small></span>
    </button>
  `;
}

function expiryInfo(dateString) {
  const days = daysUntil(dateString);
  if (days < 0) {
    return { groupKey: "expired", groupLabel: "已過期", rank: 0, className: "expired", status: `已過期 ${Math.abs(days)} 天`, substatus: "請優先確認" };
  }
  if (days === 0) {
    return { groupKey: "week", groupLabel: "一週內到期", rank: 1, className: "urgent", status: "今天到期", substatus: "請優先使用" };
  }
  if (days <= 3) {
    return { groupKey: "week", groupLabel: "一週內到期", rank: 1, className: "urgent", status: `${days} 天內`, substatus: "即將到期" };
  }
  if (days <= 7) {
    return { groupKey: "week", groupLabel: "一週內到期", rank: 1, className: "week", status: `${days} 天內`, substatus: "一週內到期" };
  }
  if (days <= 14) {
    return { groupKey: "two-weeks", groupLabel: "兩週內到期", rank: 2, className: "two-weeks", status: "兩週內", substatus: `${days} 天後` };
  }
  if (days <= 21) {
    return { groupKey: "three-weeks", groupLabel: "三週內到期", rank: 3, className: "three-weeks", status: "三週內", substatus: `${days} 天後` };
  }
  const months = Math.ceil(days / 30);
  return { groupKey: `month-${months}`, groupLabel: `${months} 個月內到期`, rank: 3 + months, className: "normal", status: `${months} 個月內`, substatus: formatDate(dateString) };
}

function openItemForm(id = null) {
  elements.itemForm.reset();
  const item = state.items.find((entry) => entry.id === id);
  $("#itemFormTitle").textContent = item ? "編輯物品" : "新增物品";
  $("#saveItemButton").textContent = item ? "儲存變更" : "儲存物品";
  $("#itemId").value = item?.id || "";
  $("#itemName").value = item?.name || "";
  $("#expiryDate").value = item?.expiryDate || toDateInput(addDays(new Date(), 7));
  $("#itemNote").value = item?.note || "";
  const location = item?.location || "fridge";
  $(`input[name="location"][value="${location}"]`).checked = true;
  elements.itemFormDialog.showModal();
  window.setTimeout(() => $("#itemName").focus(), 150);
}

function saveItem(event) {
  event.preventDefault();
  if (!elements.itemForm.reportValidity()) return;
  const id = $("#itemId").value;
  const existing = state.items.find((item) => item.id === id);
  const item = {
    id: id || crypto.randomUUID(),
    name: $("#itemName").value.trim(),
    location: $('input[name="location"]:checked').value,
    expiryDate: $("#expiryDate").value,
    note: $("#itemNote").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (existing) Object.assign(existing, item);
  else state.items.push(item);
  saveItems();
  elements.itemFormDialog.close();
  render();
  showToast(existing ? "物品資料已更新" : "物品已加入冰箱");
}

function openDetail(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item) return;
  state.selectedId = id;
  const info = expiryInfo(item.expiryDate);
  $("#detailName").textContent = item.name;
  $("#detailLocation").textContent = item.location === "freezer" ? "冷凍" : "冷藏";
  $("#detailExpiry").textContent = `${formatDate(item.expiryDate, true)}（${info.status}）`;
  $("#detailNote").textContent = item.note || "無備註";
  const status = $("#detailStatus");
  status.className = `detail-status ${info.className}`;
  status.textContent = `${info.status}｜${info.substatus}`;
  elements.detailDialog.showModal();
}

function openManageDialog() {
  renderManageList();
  elements.manageDialog.showModal();
}

function renderManageList() {
  const sorted = [...state.items].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  $("#manageList").innerHTML = sorted.length ? sorted.map((item) => `
    <div class="manage-row">
      <span><b>${escapeHtml(item.name)}</b><small>${item.location === "freezer" ? "冷凍" : "冷藏"} · ${formatDate(item.expiryDate)}</small></span>
      <button class="mini-button edit" type="button" data-id="${escapeHtml(item.id)}" aria-label="編輯 ${escapeHtml(item.name)}">
        <svg viewBox="0 0 24 24"><path d="m4 20 4.5-1L19 8.5 15.5 5 5 15.5 4 20ZM13.5 7l3.5 3.5"/></svg>
      </button>
      <button class="mini-button delete" type="button" data-id="${escapeHtml(item.id)}" aria-label="刪除 ${escapeHtml(item.name)}">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>
      </button>
    </div>
  `).join("") : '<p class="manage-empty">目前沒有物品</p>';
  $$(".manage-row .edit").forEach((button) => button.addEventListener("click", () => {
    elements.manageDialog.close();
    openItemForm(button.dataset.id);
  }));
  $$(".manage-row .delete").forEach((button) => button.addEventListener("click", () => deleteItem(button.dataset.id)));
}

function deleteItem(id) {
  const item = state.items.find((entry) => entry.id === id);
  if (!item || !window.confirm(`確定要刪除「${item.name}」嗎？`)) return;
  state.items = state.items.filter((entry) => entry.id !== id);
  saveItems();
  if (elements.detailDialog.open) elements.detailDialog.close();
  render();
  showToast("物品已刪除");
}

function openTransferDialog() {
  $("#exportCode").value = createExportCode();
  $("#importCode").value = "";
  elements.transferDialog.showModal();
}

function createExportCode() {
  const payload = { version: DATA_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), items: state.items, settings: state.settings };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `FRIDGE1.${btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

async function copyExportCode() {
  const area = $("#exportCode");
  try {
    await navigator.clipboard.writeText(area.value);
  } catch {
    area.select();
    document.execCommand("copy");
  }
  showToast("特別碼已複製");
}

function importCode() {
  try {
    const value = $("#importCode").value.trim();
    if (!value.startsWith("FRIDGE1.")) throw new Error("格式不符");
    const encoded = value.slice(8).replace(/-/g, "+").replace(/_/g, "/");
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (payload.version !== 1 || !Array.isArray(payload.items)) throw new Error("版本不符");
    const importedItems = payload.items.map(sanitizeItem).filter(Boolean);
    const mode = $('input[name="importMode"]:checked').value;
    if (mode === "replace" && !window.confirm("這會取代目前所有物品與通知設定，確定繼續嗎？")) return;
    if (mode === "replace") {
      state.items = importedItems;
      state.settings = sanitizeSettings(payload.settings);
    } else {
      const byId = new Map(state.items.map((item) => [item.id, item]));
      importedItems.forEach((item) => byId.set(item.id, item));
      state.items = [...byId.values()];
      state.settings = sanitizeSettings(payload.settings);
    }
    saveItems();
    saveJson(SETTINGS_KEY, state.settings);
    fillSettingsForm();
    render();
    elements.transferDialog.close();
    showToast(`已匯入 ${importedItems.length} 項物品`);
  } catch {
    showToast("特別碼無法讀取，請確認是否完整貼上");
  }
}

function openSettingsDialog() {
  fillSettingsForm();
  updatePermissionStatus();
  elements.settingsDialog.showModal();
}

function fillSettingsForm() {
  $("#notificationsEnabled").checked = state.settings.enabled;
  $("#notificationTime").value = state.settings.time;
  $(`input[name="theme"][value="${state.settings.theme}"]`).checked = true;
  $$('input[name="noticeDays"]').forEach((input) => {
    input.checked = state.settings.days.includes(Number(input.value));
  });
}

async function saveSettings() {
  const enabled = $("#notificationsEnabled").checked;
  if (enabled && !("Notification" in window)) {
    showToast("這個瀏覽器不支援通知");
    return;
  }
  if (enabled && Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      $("#notificationsEnabled").checked = false;
      showToast("通知尚未獲得允許");
      updatePermissionStatus();
      return;
    }
  }
  const days = $$('input[name="noticeDays"]:checked').map((input) => Number(input.value));
  state.settings = {
    enabled,
    days,
    time: $("#notificationTime").value || "09:00",
    theme: $('input[name="theme"]:checked').value
  };
  applyTheme(state.settings.theme);
  saveJson(SETTINGS_KEY, state.settings);
  await syncNotificationData();
  if (enabled) await registerPeriodicSync();
  updatePermissionStatus();
  elements.settingsDialog.close();
  showToast("通知設定已儲存");
  checkNotifications();
}

function updatePermissionStatus() {
  let text = "尚未允許通知";
  if (!("Notification" in window)) text = "此瀏覽器不支援通知";
  else if (Notification.permission === "granted") text = "通知已允許";
  else if (Notification.permission === "denied") text = "通知已被系統封鎖";
  $("#permissionStatus").textContent = text;
}

async function sendTestNotification() {
  if (!("Notification" in window)) return showToast("這個瀏覽器不支援通知");
  if (Notification.permission !== "granted") {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return showToast("通知尚未獲得允許");
  }
  await showNotification("冰箱日曆｜測試通知", "通知設定完成，之後會依保存期限提醒。", "fridge-test");
  updatePermissionStatus();
}

async function checkNotifications() {
  if (!state.settings.enabled || !("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const todayKey = toDateInput(now);
  if (localStorage.getItem(LAST_NOTICE_KEY) === todayKey) return;
  if (now.toTimeString().slice(0, 5) < state.settings.time) return;
  const matching = state.items.filter((item) => {
    const days = daysUntil(item.expiryDate);
    return state.settings.days.includes(days) || (days < 0 && state.settings.days.includes(-1));
  });
  if (!matching.length) return;
  const body = matching.length === 1
    ? `${matching[0].name}：${expiryInfo(matching[0].expiryDate).status}`
    : `${matching.length} 項物品需要留意保存期限`;
  await showNotification("冰箱日曆｜期限提醒", body, `fridge-expiry-${todayKey}`);
  localStorage.setItem(LAST_NOTICE_KEY, todayKey);
  await syncNotificationData(todayKey);
}

async function showNotification(title, body, tag) {
  const registration = await navigator.serviceWorker?.ready;
  if (registration) return registration.showNotification(title, { body, tag, icon: "./icons/icon-192.png", badge: "./icons/icon-192.png" });
  return new Notification(title, { body, tag });
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register(`./service-worker.js?v=${APP_VERSION}`, { updateViaCache: "none" });
    await registration.update();
    await registerPeriodicSync();
    await syncNotificationData();
    checkNotifications();
  } catch (error) {
    console.warn("Service Worker registration failed", error);
  }
}

async function registerPeriodicSync() {
  if (!state.settings.enabled) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    if ("periodicSync" in registration) {
      await registration.periodicSync.register("check-expirations", { minInterval: 12 * 60 * 60 * 1000 });
    }
  } catch (error) {
    console.info("Periodic background sync is unavailable", error);
  }
}

async function syncNotificationData(lastNotificationDate = localStorage.getItem(LAST_NOTICE_KEY)) {
  if (!("indexedDB" in window)) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const transaction = db.transaction("state", "readwrite");
      transaction.objectStore("state").put({ items: state.items, settings: state.settings, lastNotificationDate }, "notificationData");
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (error) {
    console.info("Background notification data was not stored", error);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fridge-calendar", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("state");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function sanitizeStoredItems() {
  const sanitized = state.items.map(sanitizeItem).filter(Boolean);
  if (sanitized.length !== state.items.length) {
    state.items = sanitized;
    saveItems();
  }
}

function sanitizeSettings(settings) {
  const allowedDays = new Set([7, 3, 1, 0, -1]);
  const days = Array.isArray(settings?.days)
    ? [...new Set(settings.days.map(Number).filter((day) => allowedDays.has(day)))]
    : [...defaultSettings.days];
  return {
    enabled: settings?.enabled === true,
    days,
    time: typeof settings?.time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.time) ? settings.time : defaultSettings.time,
    theme: ["system", "light", "dark"].includes(settings?.theme) ? settings.theme : defaultSettings.theme
  };
}

function applyTheme(theme) {
  const isDark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  $("meta[name='theme-color']")?.setAttribute("content", isDark ? "#111713" : "#f7f4ec");
}

function sanitizeItem(item) {
  if (!item || typeof item.name !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(item.expiryDate || "")) return null;
  return {
    id: typeof item.id === "string" && item.id ? item.id : crypto.randomUUID(),
    name: item.name.trim().slice(0, 40),
    location: item.location === "freezer" ? "freezer" : "fridge",
    expiryDate: item.expiryDate,
    note: typeof item.note === "string" ? item.note.slice(0, 120) : "",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || new Date().toISOString()
  };
}

function saveItems() { saveJson(ITEMS_KEY, state.items); }
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

function daysUntil(dateString) {
  const today = startOfDay(new Date());
  const date = new Date(`${dateString}T00:00:00`);
  return Math.round((date - today) / 86400000);
}

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()); }
function addDays(date, days) { return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days); }
function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function formatDate(dateString) { return dateString.replaceAll("-", "/"); }

function locationIcon(location) {
  if (location === "freezer") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M4.2 6.5l15.6 11M19.8 6.5l-15.6 11M8 4l4 2 4-2M8 20l4-2 4 2M3 10l3 3-1 4M21 10l-3 3 1 4"/></svg>';
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10a2 2 0 0 1 2 2v16H5V5a2 2 0 0 1 2-2ZM5 10h14M8 6h3M8 14h3"/></svg>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
}
