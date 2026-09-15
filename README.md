# 冰箱日曆

管理冷藏、冷凍物品保存期限的本機優先 PWA。資料只存於使用者的裝置，可用特別碼在裝置間轉移。

## 本機預覽

```bash
python3 -m http.server 8000
```

前往 `http://localhost:8000`。Service Worker、安裝與通知功能必須透過 localhost 或 HTTPS 使用。

## 發佈至 GitHub Pages

1. 將儲存庫推送至 GitHub 的 `main` 分支。
2. 在 GitHub 儲存庫開啟 **Settings → Pages**。
3. 將 **Source** 設成 **GitHub Actions**。
4. 等候 `Deploy PWA to GitHub Pages` workflow 完成。

之後每次推送 `main` 都會自動重新發佈。

## 通知限制

- App 開啟或仍在瀏覽器背景時會依設定檢查期限。
- 支援 Periodic Background Sync 的瀏覽器會嘗試在背景定期檢查，但執行時間由系統決定。
- iPhone/iPad 需先「加入主畫面」，再由主畫面開啟 PWA 並允許通知。
- 純靜態 GitHub Pages 沒有推播伺服器，因此無法保證 App 完全關閉後仍在指定時間送出通知。
