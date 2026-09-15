# 記帳本 — 開發契約

這份檔案是給 AI 助手與人類開發者的**共同規則**。每次動工前先讀完。
目的只有一個：讓這個專案能長期靠 vibe coding 疊加新功能，而不會改 A 壞 B。

## 專案現況

正在從「單一 335KB 的 index.html」重構成模組化結構。進度見 `ARCHITECTURE.md`。

- **P0 已完成**：Vite + Vitest + GitHub Actions；特徵化測試釘住現有行為。
- **P1 已完成**：CSS 拆成 6 個 cascade 層（`src/styles/`），
  JS 拆成 27 個檔案（`src/legacy/`）。
- **P1b 已完成**：JS 以 Prettier 格式化（990 行 → 8,186 行，每行上限 100 字元）。
- **P2 已完成**：8 處版本疊加式 monkey-patch 已併回本體函式。
  目前共 116 條測試。

### 改程式碼要去哪裡

`index.html` 只剩外殼，不要往裡面加 CSS 或 JS。

- 樣式 → `src/styles/`，並在 `index.css` 註冊（順序即 cascade，不可調換）
- 應用邏輯 → `src/legacy/` 對應的檔案，並在 `build/legacy-manifest.json` 註冊

`src/legacy/` 的檔案在建置時**依序串接成單一 script**，所以彼此仍共用同一個
全域作用域 —— 這是為了讓 P1 做到零行為變更的過渡設計，不是最終型態。
現階段不要在這些檔案裡寫 `import` / `export`。

## 指令

```bash
npm run dev      # 本機開發（http://localhost:5173）
npm test         # 執行所有測試
npm run build    # 建置到 dist/ 並戳記 service worker 版本
npm run check    # 提交前必跑（先建置再測試）
```

## 六條鐵則

重構完成前，這些規則規範「新程式碼」；重構完成後，全面適用。

### 1. `src/domain/` 必須純淨
不得 import DOM、`localStorage`、`fetch` 或任何全域狀態。只吃參數、吐回傳值。
**理由**：分帳、折扣、投資損益這些核心計算一旦和 DOM 綁死就無法單獨驗證，
改動時只能靠手動點畫面確認，這正是目前顧此失彼的來源。

### 2. 禁止 monkey-patch
不准寫 `const _renderCharts_v24 = renderCharts; renderCharts = function () { ... }`。
要改行為就直接改本體函式。
**理由**：舊版用這招疊了 8 層，導致同一個函式的真實行為散在兩三個地方，
改本體的人看不到外層包裝，於是修好一處、壞掉另一處。

**這條規則由 `tests/no-monkey-patch.test.js` 自動檢查，違反會讓 CI 失敗。**

若要合併既有包裝，先確認本體函式沒有頂層 `return` ——
有的話直接把額外邏輯接在尾端並不等價（原本包裝是無條件執行的）。

### 3. 單向資料流
`事件 → domain 計算 → store.update() → 訂閱者重繪`。
UI 模組之間**不得互相呼叫對方的 render**。
**理由**：目前 `renderAll()` 是手工列舉所有 render 函式，新增畫面就得回頭改它；
漏改就是畫面不同步。改成訂閱制後，新模組只要自己訂閱，不必動既有程式碼。

### 4. 模組自治
每個 UI 模組只操作自己的 DOM 子樹，入口統一為 `mount(root, store)`。
不得用 `document.querySelector` 去抓別的模組的元素。

### 5. 檔案 300 行、函式 50 行為上限
超過就拆。
**理由**：AI 要能「完整讀懂一個檔案再修改」才不會誤傷。超過這個尺度就辦不到。

**目前有 11 個檔案不符合這條規則**（P1b 格式化後才顯現出來）。
這是已知技術債，不是可以援引的先例 —— 新檔案仍須遵守。
這些檔案會在 P3 抽出純函式、P4 拆解 UI 模組時自然縮小：

| 檔案 | 行數 | 由哪個階段處理 |
|---|---|---|
| `23-service-ocr.js` | 775 | P3：辨識邏輯與 DOM 分離 |
| `22-service-drive.js` | 747 | P5：同步與衝突處理重寫 |
| `21-ui-invest.js` | 739 | P3：損益計算抽成 domain 模組 |
| `19-ui-charts.js` | 617 | P3：統計聚合抽出 |
| `17-service-places.js` | 559 | P3：地點查詢與 DOM 分離 |
| `12-domain-discount.js` | 501 | P3：本來就是純邏輯，直接轉真模組 |
| `25-ui-settings.js` | 448 | P4：拆成各設定區塊模組 |
| `16-entry-form-toggle.js` | 437 | P4：表單狀態改走 store |
| `18-service-mrt.js` | 429 | P3：票價計算抽出 |
| `27-glue-v23.js` | 386 | P2：monkey-patch 併回本體後消失 |
| `10-entry-store-items.js` | 310 | P4 |

### 6. 資料格式改動一律走 `migrations.js`
新增一條遷移、補一條測試，不得就地改寫載入邏輯。
**理由**：使用者的帳本存在 localStorage 與 Google Drive，格式改錯等於資料遺失。

## 測試

`tests/legacy/` 是**特徵化測試**：釘住重構前的實際行為，不代表那是理想設計。

- 重構時如果這些測試變紅，預設是「你改壞了」，先回頭檢查。
- 若是刻意改變行為，更新期望值並在 commit 說明原因。
- `tests/harness.js` 把真實的 `index.html` 載進 jsdom 執行，藉此取得那 268 個全域函式。
  **重構期間不要改動這個檔案** —— 它是判斷有沒有改壞的基準線。
  注意：`function f(){}` 會掛上 window，但頂層 `const`／`let`（`nf`、`esc`、`$` …）不會，
  要用 `grab('nf')` 取得。

## 已知缺陷

- **資料型別未驗證會導致 App 變死殼**（P5 第一優先）
  `ledger.v2.records` 若存到「合法 JSON 但不是陣列」，啟動時會拋
  `records.forEach is not a function`，inline script 當場中止 ——
  事件監聽全部沒註冊，畫面空白且按鈕無反應，App 內無復原途徑。
  已由 `tests/legacy/storage.test.js` 釘住現況。

- `splitBalance()` 在「對方請客」情境回傳 `-0` 而非 `0`（無害，P3 順手正規化）。

## 部署

推上 `main` 會觸發 `.github/workflows/deploy.yml` 自動建置並發佈到 GitHub Pages。

⚠️ **首次合併前必做**：repo Settings → Pages → Source 改為 **GitHub Actions**。
icons／manifest／service worker 已移進 `public/`，不再位於 repo 根目錄；
沒切換就合併會讓這些檔案 404。

## API 金鑰

Maps 與 Vision 的金鑰寫在 `index.html` 的 meta 標籤。這是**瀏覽器端金鑰，本來就會外露**
——改用環境變數注入也一樣能從打包產物挖出來。
真正的防線是 Google Cloud Console 上的 **HTTP referrer 限制 + 每日配額**，請確保已設定。
