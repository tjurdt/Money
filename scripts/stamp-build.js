/**
 * vite build 之後把 service worker 裡的佔位字串換成當次建置的識別碼。
 *
 * 目的：cache 名稱會隨每次部署改變，activate 時舊快取被清掉，
 * 使用者不會卡在舊版的 app shell。
 *
 * 注意：務必用 replaceAll。先前版本用 replace()，只換掉第一個出現處
 * ——而那個位置是檔頭的說明註解，真正的 const 反而沒被替換，
 * 導致 cache 名稱變成固定的 'ledger-shell-<佔位字串>'，版本化形同虛設。
 * 下方的驗證步驟就是為了讓這種情況直接讓建置失敗。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const PLACEHOLDER = '__BUILD_ID__';
const dist = resolve(process.cwd(), 'dist');
const swPath = resolve(dist, 'ledger-sw.js');
const htmlPath = resolve(dist, 'index.html');

const fail = (msg) => {
  console.error(`[stamp-build] ${msg}`);
  process.exit(1);
};

if (!existsSync(swPath)) fail('找不到 dist/ledger-sw.js，請先執行 vite build');
if (!existsSync(htmlPath)) fail('找不到 dist/index.html，請先執行 vite build');

// 以建置產物的 index.html 內容做雜湊，內容沒變就不會產生新的 cache 名稱。
const buildId = createHash('sha256').update(readFileSync(htmlPath)).digest('hex').slice(0, 12);
const source = readFileSync(swPath, 'utf8');

if (!source.includes(PLACEHOLDER)) fail(`service worker 內沒有 ${PLACEHOLDER} 佔位符`);

const stamped = source.replaceAll(PLACEHOLDER, buildId);

// 驗證：替換後不得殘留佔位符，且必須真的出現在 cache 名稱的定義上。
if (stamped.includes(PLACEHOLDER)) fail('替換後仍殘留佔位符');
if (!new RegExp(`const BUILD_ID = '${buildId}'`).test(stamped)) {
  fail('BUILD_ID 常數未被正確替換 —— cache 版本化不會生效');
}

writeFileSync(swPath, stamped);
console.log(`[stamp-build] service worker cache = ledger-shell-${buildId}`);
