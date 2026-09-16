/**
 * 產生 PWA 圖示。
 *
 * 為什麼要分成兩種用途
 *   any      —— iOS 與部分桌面環境直接顯示整張圖，內容可以貼得比較滿。
 *   maskable —— Android 會把圖示裁成圓形或方圓形，只保證中央 80% 的直徑範圍
 *               不被裁掉（安全區）。若用同一張貼邊的圖當 maskable，
 *               角落的內容會被切掉，看起來像沒設計過。
 *
 * 先前兩個尺寸都標成 "any maskable" 並共用同一張貼邊的圖，
 * 在 Android 上就是這個問題。這裡改成各自產生。
 *
 * 執行：npm run icons
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const OUT = resolve(process.cwd(), 'public');

const TEAL = '#0d6e60';
const TEAL_DEEP = '#08554a';
const PAPER = '#f4f8f6';
const GOLD = '#e8b84b';

/**
 * 圖示主體：帳本 ＋ 硬幣。
 *
 * 設計取捨：家用畫面上的圖示通常只有 48–60px，細節會糊掉。
 * 因此只保留三個可辨識的元素 —— 深色底、白色帳本、金色硬幣，
 * 線條粗、對比高，縮到最小仍看得出是「記帳」。
 *
 * @param {number} size 畫布邊長
 * @param {number} inset 內容四周留白的比例（maskable 需要較大的安全區）
 */
function iconSvg(size, inset) {
  const s = size;
  const pad = s * inset;
  const box = s - pad * 2;

  // 帳本本體
  const bw = box * 0.74;
  const bh = box * 0.84;
  const bx = pad + (box - bw) / 2 - box * 0.04;
  const by = pad + (box - bh) / 2;
  const r = bw * 0.17;

  // 內頁橫線
  const lineX = bx + bw * 0.2;
  const lineW = bw * 0.52;
  const lineH = Math.max(2, bh * 0.065);
  const lineGap = bh * 0.185;
  const line1Y = by + bh * 0.26;

  // 書脊
  const spineW = bw * 0.1;

  // 硬幣
  const cr = box * 0.245;
  const cx = pad + box - cr * 0.92;
  const cy = pad + box - cr * 0.92;

  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${TEAL}"/>
      <stop offset="1" stop-color="${TEAL_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#bg)"/>

  <g>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${r}" fill="${PAPER}"/>
    <rect x="${bx}" y="${by}" width="${spineW}" height="${bh}" rx="${spineW / 2}" fill="${TEAL}" opacity=".26"/>
    <rect x="${lineX}" y="${line1Y}" width="${lineW}" height="${lineH}" rx="${lineH / 2}" fill="${TEAL}" opacity=".85"/>
    <rect x="${lineX}" y="${line1Y + lineGap}" width="${lineW}" height="${lineH}" rx="${lineH / 2}" fill="${TEAL}" opacity=".62"/>
    <rect x="${lineX}" y="${line1Y + lineGap * 2}" width="${lineW * 0.62}" height="${lineH}" rx="${lineH / 2}" fill="${TEAL}" opacity=".42"/>
  </g>

  <circle cx="${cx}" cy="${cy}" r="${cr}" fill="${GOLD}" stroke="${PAPER}" stroke-width="${s * 0.035}"/>
  <text x="${cx}" y="${cy}" font-family="Georgia, 'Times New Roman', serif" font-size="${cr * 1.5}"
        font-weight="700" fill="${TEAL_DEEP}" text-anchor="middle" dominant-baseline="central">$</text>
</svg>`);
}

/** 產生一個檔案並回報。 */
async function emit(name, size, inset) {
  const buf = await sharp(iconSvg(size, inset)).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(resolve(OUT, name), buf);
  console.log(`  ${name.padEnd(34)} ${size}x${size}  ${(buf.length / 1024).toFixed(1)} KB`);
}

console.log('產生 PWA 圖示：');

// 一般用途：內容貼得比較滿，四周留 8%。
await emit('ledger-icon-192.png', 192, 0.08);
await emit('ledger-icon-512.png', 512, 0.08);

// Android maskable：留 20% 安全區，裁成圓形後主體仍完整。
await emit('ledger-icon-maskable-192.png', 192, 0.2);
await emit('ledger-icon-maskable-512.png', 512, 0.2);

// iOS home screen：iOS 自己會加圓角，不裁切，所以用一般版本。
await emit('ledger-icon-180.png', 180, 0.08);

// 瀏覽器分頁的小圖示。
await emit('ledger-icon-32.png', 32, 0.04);

console.log('完成。');
