# 架構與重構進度

## 為什麼要重構

原本整個 app 是單一 `index.html`（335KB / 1607 行）：CSS 57KB、HTML 約 10KB、
JS 232KB 共 268 個函式，平均每行 232 字元、109 行超過 500 字元。

四個讓「改 A 壞 B」必然發生的結構性原因：

1. **版本疊加式 monkey-patch** —— 8 處 `const _renderCharts_v23 = renderCharts; renderCharts = ...`。
   同一個函式的真實行為散在多個位置。
2. **24 個頂層可變全域** —— 任何函式都能讀寫任何狀態，波及範圍無法靜態推斷。
3. **沒有資料流方向** —— 62 處 `innerHTML` 直寫，render 函式互相呼叫，`renderAll()` 手工列舉。
4. **純邏輯與 DOM 黏死** —— 分帳、折扣、投資、統計無法單獨驗證。

## 目標結構

```
index.html              外殼：meta、mount 點
src/
  main.js               啟動與組裝
  core/                 config storage migrations store format date
  domain/               純函式：schema records split discount invest recurring stats
  services/             有副作用：drive places ocr quotes csv mrt
  ui/                   shell list chart invest settings sheets entry/
  styles/               tokens base components views
tests/                  Vitest
```

模組邊界沿用原始碼中既有的 32 個分區註解（`/* ===== 分帳 ===== */` 等），不另行設計。

## 進度

| 階段 | 內容 | 狀態 |
|---|---|---|
| **P0** | Vite + Vitest + Actions；特徵化測試安全網 | ✅ 完成 |
| **P1** | 機械搬運：CSS 拆 4 檔、JS 依分區拆模組（只搬不改） | ⬜ 待辦 |
| **P2** | 拆除 8 處 monkey-patch，合併回本體 | ⬜ 待辦 |
| **P3** | 抽出純函式 domain 層，與 DOM 解耦 | ⬜ 待辦 |
| **P4** | 單向資料流：24 個全域 → store + subscribe | ⬜ 待辦 |
| **P5** | 資料安全補強 | ⬜ 待辦 |
| **P6** | 防退化：ESLint 規則、`npm run check` | ⬜ 待辦 |

每一階段結束都必須是可直接上線的狀態。

## P0 產出（已完成）

- **建置**：Vite，`base: '/Money/'`，輸出 `dist/`。靜態資產移入 `public/`。
- **測試**：Vitest + jsdom，88 條測試涵蓋
  分帳（18）、折扣引擎（19）、投資損益（9）、統計聚合（9）、
  固定支出日期（4）、格式化（9）、儲存與遷移（14）、建置驗證（6）。
- **Harness**：`tests/harness.js` 把真實 `index.html` 載進 jsdom 執行，
  外部 CDN（Chart.js／Tesseract／PapaParse／Google）以 stub 取代，網路呼叫一律阻擋。
  「全域污染」在此反而成為優勢 —— 268 個函式可直接取用測試。
- **Service Worker 版本化**：`public/ledger-sw.js` 的 `__BUILD_ID__` 由
  `scripts/stamp-build.js` 在建置後替換成 index.html 內容雜湊。
  原本 cache 名稱固定為 `ledger-shell-v1`、從不更新，使用者可能卡在舊版殼。
- **CI/CD**：PR 跑測試；推 main 則測試 → 建置 → 驗證產物 → 發佈 Pages。

### P0 過程中發現的問題

**資料型別未驗證會讓 App 變成死殼（嚴重）**

`load()` 只防 JSON 解析失敗，不檢查型別。若 `ledger.v2.records` 存到合法 JSON
但非陣列的值（雲端同步寫壞、匯入異常、手動編輯），啟動時的正規化 IIFE 會拋
`records.forEach is not a function`，整段 inline `<script>` 當場中止。

函式宣告因 hoisting 仍然存在，但其後的**事件監聽註冊與初始渲染完全不執行**：
畫面空白、按鈕無反應，且 App 內沒有任何復原途徑，使用者只能手動清除網站資料。

已由 `tests/legacy/storage.test.js` 釘住現況，列為 P5 第一優先。

**`splitBalance()` 回傳 `-0`**

「對方請客」情境走 `-(myShareOf(r))`，myShare 為 0 時產生 `-0`。
數值上無害，但快照比對與 `Object.is` 會有差異。P3 順手正規化。

## 資料模型

localStorage 鍵名集中在 `K` 常數，**改動等同讓既有使用者資料消失**：

```
ledger.v2.records / catsExpense / catsIncome / payments / trips
        / scope / settings / subcats / prices / twse / catColors
```

雲端同步寫入使用者自己的 Google Drive App Data，各帳號彼此獨立。

### 現有遷移

1. `ledger.records.v1` → `ledger.v2.records`（僅在 v2 不存在時執行一次）
2. `lending` → `split`：`advance` → 我付款且不負擔；`debt` → 對方付款且我全額負擔

兩者目前都是沒有版本號的立即執行函式，P5 會改寫成有序的 `migrations.js`。
