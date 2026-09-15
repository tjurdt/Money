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
| **P1** | 機械搬運：CSS 拆 6 層、JS 拆 27 檔（只搬不改） | ✅ 完成 |
| **P1b** | Prettier 格式化（每行上限 100 字元） | ✅ 完成 |
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

## P1 產出（已完成）

### CSS：6 個 cascade 層

原本 297 行的 inline `<style>` 拆進 `src/styles/`，由 `index.css` 依序 `@import`。

**不是依主題拆分，而是依既有的覆寫層拆分。** 這份 CSS 有 4 層版本疊加
（`v3` / `v7.0` / `v22` / `v23`），`.appbar` 被宣告 4 次、`:root` 2 次、`.summary` 4 次，
後面的層刻意覆寫前面的層 —— 依主題重排會改變畫面。檔名以數字前綴標示順序，
`index.css` 的 `@import` 順序不可調換。

建置後的 CSS 經正規化比對與原始完全等價（55,848 字元）。
重構期間關閉 `cssMinify`：壓縮器會合併相鄰規則、重排宣告、簡寫數值，
這些變換雖然等價卻無法逐條驗證，而此專案的 cascade 順序是行為的一部分。
代價約 4KB gzip，待 P6 建立視覺回歸測試後再開啟。

### JS：27 個檔案，單一作用域

原本 990 行的 inline `<script>` 拆進 `src/legacy/`，檔名前綴即載入順序。

**為什麼是串接而不是 ES Module import：**
專案有 35 個頂層可變全域（`records`、`selCat`、`discountDraft` …），
全域共約 145 處對它們重新賦值。ES Module 不允許對 import 進來的綁定賦值，
因此真正的模組化必須等 P4 把狀態集中到 store 之後才能做。
在 P1 硬做等於把兩個高風險改動混在一起。

串接後仍是單一 script 作用域，與拆分前**語意完全等價** ——
已逐位元組驗證建置產物的 script 內容與 P0 版本相同（232,069 bytes）。

`build/legacy-bundle.js` 是唯一的串接來源，Vite plugin 與測試 harness 共用它，
確保測試跑的東西與實際產出一致。隨著 P3 把純函式抽成真正的 ES Module，
`src/legacy/` 會逐步縮小，P4 完成後整個目錄與串接機制一併移除。

### P1 過程中發現並修正的問題

**`replace()` 的替換字串把 `$$` 當成跳脫序列（嚴重）**

注入 bundle 時用字串當 `replace()` 的第二個參數，導致
`const $$=s=>document.querySelectorAll(s)` 被改寫成 `const $=s=>...`，
與前面的 `const $=s=>document.querySelector(s)` 重複宣告，產生 SyntaxError ——
整個 app 變成空白頁。改用 replacer 函式即可停用特殊樣式解讀。

這與 P0 的 service worker 戳記問題同屬一個家族：`replace()` 有兩個獨立陷阱，
一是只替換第一個出現處，二是替換字串中的 `$` 有特殊語意。

**`dist/` 過期會讓建置測試給出假綠燈（嚴重）**

上述 `$$` bug 一度通過本地測試，因為 `tests/build.test.js` 跑的是還沒重新建置的
舊產物。現在該檔會比對 `dist/index.html` 與 `src/`、`build/`、`index.html` 的
修改時間，產物較舊時直接失敗。`npm run check` 也改為先建置再測試。

## P1b 產出（已完成）

以 Prettier 格式化 `src/legacy/`（`printWidth: 100`）。

**990 行 → 8,186 行。** 原本平均每行 232 字元、109 行超過 500 字元（最長 2,660），
這是 AI 無法可靠修改此專案的直接原因 —— 一行裡塞了十幾個語句，
改其中一個就得重寫整行，極易誤傷相鄰邏輯。

### 零語意變更的證明

格式化前後的 bundle 各自以 esbuild 相同設定壓縮，結果**逐位元組相同**（225,548 字元）。
壓縮會抹平所有格式差異（空白、換行、引號、分號、括號），只保留語意，
因此兩者壓縮後相同即證明行為完全一致。

`src/styles/` 不納入格式化：CSS 的層邊界靠既有排版呈現，
且 P1 已驗證其與原始完全等價，留待 P6 合併重複宣告時一併處理。

### 格式漂移的防護

`npm run format:check` 已納入 `npm run check` 與兩條 CI 流程，
格式不符會讓建置失敗。`npm run format` 可一鍵修正。

### 顯現出來的技術債

格式化後有 **11 個檔案超過 CLAUDE.md 訂定的 300 行上限**，最大的 775 行。
原本擠在長行裡看不出規模，現在才顯現。這些不另行拆分 ——
P3 抽出純函式、P4 拆解 UI 模組時會自然縮小，現在做額外的機械拆分會被 P3 推翻。
各檔案對應的處理階段見 CLAUDE.md。

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
