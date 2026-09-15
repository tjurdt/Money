/**
 * vite build 之後把 service worker 裡的 __BUILD_ID__ 換成當次建置的識別碼。
 *
 * 目的：cache 名稱會隨每次部署改變，activate 時舊快取被清掉，
 * 使用者不會卡在舊版的 app shell（原本固定為 ledger-shell-v1，從不更新）。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const dist = resolve(process.cwd(), 'dist');
const swPath = resolve(dist, 'ledger-sw.js');
const htmlPath = resolve(dist, 'index.html');

if (!existsSync(swPath)) {
  console.error('[stamp-build] 找不到 dist/ledger-sw.js，請先執行 vite build');
  process.exit(1);
}

// 以建置產物的 index.html 內容做雜湊，內容沒變就不會產生新的 cache 名稱。
const buildId = createHash('sha256').update(readFileSync(htmlPath)).digest('hex').slice(0, 12);
const sw = readFileSync(swPath, 'utf8');

if (!sw.includes('__BUILD_ID__')) {
  console.warn('[stamp-build] service worker 內沒有 __BUILD_ID__ 佔位符，略過');
  process.exit(0);
}

writeFileSync(swPath, sw.replace('__BUILD_ID__', buildId));
console.log(`[stamp-build] service worker cache = ledger-shell-${buildId}`);
