/* ===== 發票 OCR：版面重建優先 ===== */
let ocrCancelled = false,
  ocrWorker = null,
  ocrParsed = null;
function loadReceiptImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(),
      url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}
function otsuThreshold(gray) {
  const hist = new Array(256).fill(0);
  gray.forEach((v) => hist[v]++);
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0,
    wB = 0,
    max = 0,
    thr = 165;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB,
      mF = (sum - sumB) / wF,
      v = wB * wF * (mB - mF) * (mB - mF);
    if (v > max) {
      max = v;
      thr = i;
    }
  }
  return Math.max(115, Math.min(215, thr));
}
async function prepareReceiptCanvas(file, forLocal = false) {
  const img = await loadReceiptImage(file),
    maxW = forLocal ? 2400 : 2800,
    scale = Math.min(1, maxW / img.naturalWidth),
    w = Math.max(1, Math.round(img.naturalWidth * scale)),
    h = Math.max(1, Math.round(img.naturalHeight * scale)),
    c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: forLocal });
  x.fillStyle = '#fff';
  x.fillRect(0, 0, w, h);
  x.drawImage(img, 0, 0, w, h);
  if (!forLocal) return c;
  const d = x.getImageData(0, 0, w, h),
    a = d.data,
    gray = new Uint8Array(w * h);
  for (let p = 0, i = 0; i < a.length; i += 4, p++) {
    let g = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    g = Math.max(0, Math.min(255, (g - 128) * 1.32 + 142));
    gray[p] = g;
  }
  const t = otsuThreshold(gray);
  for (let p = 0, i = 0; i < a.length; i += 4, p++) {
    const v = gray[p] > t ? 255 : 0;
    a[i] = a[i + 1] = a[i + 2] = v;
  }
  x.putImageData(d, 0, 0);
  return c;
}
function canvasBase64(c) {
  return c.toDataURL('image/jpeg', 0.9).split(',')[1] || '';
}
function vtxBox(vertices = []) {
  const xs = vertices.map((v) => Number(v.x) || 0),
    ys = vertices.map((v) => Number(v.y) || 0);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
function visionWords(ft) {
  const out = [];
  for (const pg of ft?.pages || [])
    for (const b of pg.blocks || [])
      for (const p of b.paragraphs || [])
        for (const w of p.words || []) {
          const text = (w.symbols || [])
            .map((s) => s.text || '')
            .join('')
            .trim();
          if (!text) continue;
          out.push({
            text,
            ...vtxBox(w.boundingBox?.vertices || []),
            conf: Number(w.confidence) || 0,
          });
        }
  return out;
}
async function cloudVisionReceipt(file) {
  const key = effectiveVisionKey();
  if (!key) throw new Error('網站未設定 Cloud Vision API 金鑰');
  const c = await prepareReceiptCanvas(file, false),
    body = {
      requests: [
        {
          image: { content: canvasBase64(c) },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['zh-TW', 'en'] },
        },
      ],
    };
  const r = await fetch(
    'https://vision.googleapis.com/v1/images:annotate?key=' + encodeURIComponent(key),
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.responses?.[0]?.error)
    throw new Error(
      d.responses?.[0]?.error?.message || d.error?.message || 'Vision API ' + r.status,
    );
  const ft = d.responses?.[0]?.fullTextAnnotation,
    text = ft?.text || d.responses?.[0]?.textAnnotations?.[0]?.description || '';
  if (!text.trim()) throw new Error('Google Vision 沒有辨識到文字');
  return { text, words: visionWords(ft), width: c.width, height: c.height, engine: 'vision' };
}
function parseTsvWords(tsv) {
  if (!tsv || typeof tsv !== 'string') return [];
  const rows = tsv.split(/\r?\n/),
    head = rows.shift()?.split('\t') || [],
    idx = (n) => head.indexOf(n),
    li = idx('left'),
    ti = idx('top'),
    wi = idx('width'),
    hi = idx('height'),
    ci = idx('conf'),
    xi = idx('text');
  if ([li, ti, wi, hi, xi].some((i) => i < 0)) return [];
  const out = [];
  for (const r of rows) {
    const a = r.split('\t'),
      text = (a[xi] || '').trim();
    if (!text) continue;
    const x0 = +a[li] || 0,
      y0 = +a[ti] || 0,
      w = +a[wi] || 0,
      h = +a[hi] || 0;
    out.push({ text, x0, y0, x1: x0 + w, y1: y0 + h, conf: +a[ci] || 0 });
  }
  return out;
}
function blockWords(blocks) {
  const out = [];
  for (const b of blocks || [])
    for (const p of b.paragraphs || [])
      for (const l of p.lines || [])
        for (const w of l.words || []) {
          const bb = w.bbox || {};
          if (!(w.text || '').trim()) continue;
          out.push({
            text: w.text.trim(),
            x0: +bb.x0 || 0,
            y0: +bb.y0 || 0,
            x1: +bb.x1 || 0,
            y1: +bb.y1 || 0,
            conf: +w.confidence || 0,
          });
        }
  return out;
}
function receiptDateFromText(text) {
  const m = String(text || '').match(/(20\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : todayISO();
}
function cleanReceiptToken(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[｜|]/g, '')
    .replace(/[“”‘’`´]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function tokenPrice(s) {
  let x = cleanReceiptToken(s)
    .replace(/,/g, '')
    .replace(/^NT\$/i, '')
    .replace(/^\$/, '')
    .replace(/(?:TX|T[XK]|含稅)$/i, '');
  if (/^\d{1,6}$/.test(x)) {
    const n = +x;
    return n >= 0 ? n : null;
  }
  return null;
}
function cjkCount(s) {
  return (String(s || '').match(/[\u3400-\u9fff]/g) || []).length;
}
function med(a) {
  if (!a.length) return 12;
  const x = [...a].sort((a, b) => a - b),
    m = Math.floor(x.length / 2);
  return x.length % 2 ? x[m] : (x[m - 1] + x[m]) / 2;
}
function wordsToRows(words, pageWidth) {
  const ws = (words || [])
    .filter((w) => (w.text || '').trim() && w.x1 > w.x0 && w.y1 > w.y0)
    .map((w) => ({
      ...w,
      text: cleanReceiptToken(w.text),
      cx: (w.x0 + w.x1) / 2,
      cy: (w.y0 + w.y1) / 2,
      h: w.y1 - w.y0,
    }))
    .sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  if (!ws.length) return [];
  const mh = med(ws.map((w) => w.h).filter((h) => h > 2)),
    rows = [];
  for (const w of ws) {
    let best = null,
      bestD = Infinity;
    for (const r of rows) {
      const overlap = Math.max(0, Math.min(r.y1, w.y1) - Math.max(r.y0, w.y0)),
        ratio = overlap / Math.max(1, Math.min(r.h, w.h)),
        d = Math.abs(r.cy - w.cy);
      if ((ratio > 0.32 || d < Math.max(7, mh * 0.62)) && d < bestD) {
        best = r;
        bestD = d;
      }
    }
    if (!best) {
      best = { tokens: [], y0: w.y0, y1: w.y1, cy: w.cy, h: w.h };
      rows.push(best);
    }
    best.tokens.push(w);
    best.y0 = Math.min(best.y0, w.y0);
    best.y1 = Math.max(best.y1, w.y1);
    best.cy = (best.y0 + best.y1) / 2;
    best.h = best.y1 - best.y0;
  }
  rows.sort((a, b) => a.cy - b.cy);
  return rows.map((r, i) => {
    r.tokens.sort((a, b) => a.x0 - b.x0);
    r.index = i;
    r.text = r.tokens.map((t) => t.text).join(' ');
    r.compact = r.text.replace(/\s+/g, '');
    r.pageWidth = pageWidth;
    return r;
  });
}
function isHeaderRow(r) {
  return /(消費明細|銷售|TEL|電話|收銀員|收銀|機\s*\d|序\s*\d|統一編號|統編|發票號碼|日期|時間)/i.test(
    r.text,
  );
}
function isFooterRow(r) {
  return /(共\s*\d*\s*項|小\s*計|總\s*計|發票金額|卡號|請妥善保管|商品退換貨|載具|條碼|代售證明|收款聯|信用卡)/i.test(
    r.text,
  );
}
function dominantPriceX(rows, pageWidth) {
  const cand = [];
  for (const r of rows) {
    if (isHeaderRow(r)) continue;
    for (const t of r.tokens) {
      const n = tokenPrice(t.text);
      if (n == null || n > 99999) continue;
      const x = (t.x0 + t.x1) / 2;
      if (x > pageWidth * 0.52) cand.push({ x, row: r.index });
    }
  }
  if (cand.length < 2) return pageWidth * 0.82;
  const bw = Math.max(18, pageWidth * 0.045),
    bins = new Map();
  for (const c of cand) {
    const k = Math.round(c.x / bw);
    if (!bins.has(k)) bins.set(k, []);
    bins.get(k).push(c);
  }
  const best =
    [...bins.values()].sort(
      (a, b) => new Set(b.map((x) => x.row)).size - new Set(a.map((x) => x.row)).size,
    )[0] || [];
  return best.reduce((s, x) => s + x.x, 0) / Math.max(1, best.length);
}
function rowPrice(r, priceX, pageWidth) {
  const nums = r.tokens
    .map((t, i) => ({ i, t, n: tokenPrice(t.text), x: (t.x0 + t.x1) / 2 }))
    .filter((z) => z.n != null);
  if (!nums.length) return null;
  let near = nums.filter(
    (z) => z.x > pageWidth * 0.48 && Math.abs(z.x - priceX) < pageWidth * 0.18,
  );
  if (!near.length) near = nums.filter((z) => z.x > pageWidth * 0.62);
  if (!near.length) return null;
  near.sort((a, b) => Math.abs(a.x - priceX) - Math.abs(b.x - priceX) || b.x - a.x);
  return near[0];
}
function cleanItemNameFromTokens(tokens, priceToken, pageWidth) {
  let use = tokens.filter((t) => !priceToken || t !== priceToken.t);
  if (priceToken) use = use.filter((t) => t.x0 < priceToken.t.x0 - pageWidth * 0.01);
  while (use.length && !/[A-Za-z\u3400-\u9fff]/.test(use[0].text)) use.shift();
  while (use.length && /^\s*[#*+&$]?\d{1,4}\s*$/.test(use[0].text)) use.shift();
  let name = use.map((t) => t.text).join('');
  name = name
    .replace(/^[^A-Za-z\u3400-\u9fff]+/, '')
    .replace(/^[#*+&$]?\d{1,3}(?=[\u3400-\u9fff])/, '')
    .replace(/\s+/g, '')
    .replace(/[·•_]+/g, '')
    .replace(/^[\-—–:：,，.。]+|[\-—–:：,，.。]+$/g, '');
  return name;
}
function candidateItemRow(r, priceX, pageWidth) {
  if (isHeaderRow(r) || isFooterRow(r)) return null;
  const p = rowPrice(r, priceX, pageWidth);
  if (!p || p.n <= 0) return null;
  const name = cleanItemNameFromTokens(r.tokens, p, pageWidth);
  if (!name || (!cjkCount(name) && !/[A-Za-z]{2}/.test(name))) return null;
  if (/^(發票|合計|小計|總計|信用卡|現金|找零|點數|折扣|折讓)/.test(name)) return null;
  return { name, price: p.n, row: r.index, raw: r.text };
}
function nameOnlyRow(r) {
  if (isHeaderRow(r) || isFooterRow(r)) return '';
  const s = cleanItemNameFromTokens(r.tokens, null, r.pageWidth);
  if (cjkCount(s) >= 2 && !/(發票|統編|收銀|信用卡|現金|找零|點數|折扣|折讓)/.test(s)) return s;
  return '';
}
function explicitTotalFromRows(rows, priceX, pageWidth) {
  const pri = [/總\s*計/i, /發票金額/i, /應付(?:金額)?/i, /小\s*計/i];
  for (const re of pri) {
    for (const r of rows) {
      if (!re.test(r.text)) continue;
      const p = rowPrice(r, priceX, pageWidth);
      if (p && p.n > 0) return p.n;
      const nums = r.tokens.map((t) => tokenPrice(t.text)).filter((n) => n != null && n > 0);
      if (nums.length) return nums[nums.length - 1];
      const m = r.compact.match(/(?:總計|發票金額|應付金額?|小計)[:：]?\$?(\d{1,6})/);
      if (m) return +m[1];
    }
  }
  return 0;
}
function expectedCountFromRows(rows) {
  for (const r of rows) {
    const m = r.compact.match(/共(\d{1,3})項/);
    if (m) return +m[1];
  }
  return null;
}
function findItemBounds(rows, priceX, pageWidth) {
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    if (isHeaderRow(rows[i])) continue;
    let hits = 0;
    for (let j = i; j < Math.min(rows.length, i + 5); j++)
      if (candidateItemRow(rows[j], priceX, pageWidth)) hits++;
    if (hits >= 2) {
      start = i;
      break;
    }
  }
  if (start < 0) start = rows.findIndex((r) => candidateItemRow(r, priceX, pageWidth));
  if (start < 0) return { start: 0, end: rows.length };
  let end = rows.length;
  for (let i = start + 1; i < rows.length; i++) {
    if (isFooterRow(rows[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}
function reconcilePrices(items, total) {
  if (!(total > 0) || !items.length) return { items, adjusted: 0 };
  const sum = items.reduce((s, x) => s + x.price, 0);
  if (Math.abs(sum - total) < 0.5) return { items, adjusted: 0 };
  let states = new Map([[0, { cost: 0, vals: [] }]]);
  for (const it of items) {
    let opts = [{ v: it.price, c: 0 }];
    if (it.price >= 100 && it.price <= 999) {
      const v = it.price % 100;
      if (v > 0) opts.push({ v, c: 1 });
    }
    if (it.price >= 1000) {
      const v = it.price % 1000;
      if (v > 0) opts.push({ v, c: 1 });
    }
    const next = new Map();
    for (const [s0, st] of states)
      for (const o of opts) {
        const ns = s0 + o.v;
        if (ns > total + 500) continue;
        const nc = st.cost + o.c,
          cur = next.get(ns);
        if (!cur || nc < cur.cost) next.set(ns, { cost: nc, vals: [...st.vals, o.v] });
      }
    states = next;
  }
  const exact = states.get(Math.round(total));
  if (!exact || exact.cost <= 0 || exact.cost > 2) return { items, adjusted: 0 };
  const out = items.map((x, i) => ({
    ...x,
    price: exact.vals[i],
    autoAdjusted: exact.vals[i] !== x.price,
  }));
  return { items: out, adjusted: out.filter((x) => x.autoAdjusted).length };
}
function parseReceiptLayout(ocr) {
  const words = ocr.words || [],
    pageWidth = ocr.width || Math.max(1, ...words.map((w) => w.x1 || 0)),
    rows = wordsToRows(words, pageWidth);
  if (!rows.length) return parseReceiptTextFallback(ocr.text || '');
  const priceX = dominantPriceX(rows, pageWidth),
    total = explicitTotalFromRows(rows, priceX, pageWidth),
    expectedCount = expectedCountFromRows(rows),
    { start, end } = findItemBounds(rows, priceX, pageWidth),
    body = rows.slice(start, end),
    items = [];
  let pending = '';
  for (let i = 0; i < body.length; i++) {
    const r = body[i],
      hit = candidateItemRow(r, priceX, pageWidth);
    if (hit) {
      let name = hit.name;
      if (pending) {
        name = (pending + name).replace(/\s+/g, '');
        pending = '';
      }
      items.push({ name, price: hit.price, raw: hit.raw });
      continue;
    }
    const p = rowPrice(r, priceX, pageWidth),
      nm = nameOnlyRow(r);
    if (nm && !p) {
      pending = pending ? pending + nm : nm;
      if (pending.length > 48) pending = nm;
      continue;
    }
    if (p && p.n > 0 && pending) {
      items.push({ name: pending, price: p.n, raw: r.text });
      pending = '';
      continue;
    }
    if (p && p.n === 0) pending = '';
  }
  const ded = [];
  for (const it of items) {
    const name = it.name.replace(/\s+/g, '');
    if (!name || it.price <= 0) continue;
    const prev = ded[ded.length - 1];
    if (prev && prev.name === name && prev.price === it.price) continue;
    ded.push({ ...it, name });
  }
  const rec = reconcilePrices(ded, total);
  return {
    date: receiptDateFromText(ocr.text),
    store: '',
    total,
    items: rec.items,
    expectedCount,
    rows,
    text: ocr.text,
    adjusted: rec.adjusted,
    structured: true,
  };
}
function cleanReceiptLine(l) {
  return cleanReceiptToken(l)
    .replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1')
    .trim();
}
function receiptPriceAtEnd(l) {
  let m = cleanReceiptLine(l).match(/(?:NT\$|\$)?\s*(\d{1,6})(?:\s*T[XK])?\s*$/i);
  return m ? +m[1] : null;
}
function fallbackCleanName(s) {
  return cleanReceiptLine(s)
    .replace(/^\s*[#*+&$]?\s*\d{1,3}\s+/, '')
    .replace(/^\s*[#*+&$]\s*/, '')
    .replace(/\s+/g, '')
    .replace(/^[^A-Za-z\u3400-\u9fff]+/, '')
    .trim();
}
function parseReceiptTextFallback(text) {
  const lines = String(text || '')
      .split(/\r?\n/)
      .map(cleanReceiptLine)
      .filter(Boolean),
    date = receiptDateFromText(text),
    expectedMatch = lines.map((l) => l.replace(/\s/g, '').match(/共(\d{1,3})項/)).find(Boolean),
    expectedCount = expectedMatch ? +expectedMatch[1] : null;
  let total = 0;
  for (const re of [/總\s*計/i, /發票金額/i, /應付(?:金額)?/i, /小\s*計/i]) {
    for (const l of lines) {
      if (!re.test(l)) continue;
      const n = receiptPriceAtEnd(l);
      if (n > 0) {
        total = n;
        break;
      }
    }
    if (total) break;
  }
  let start = -1;
  const itemish = (l) => {
    if (isHeaderRow({ text: l }) || isFooterRow({ text: l })) return false;
    const p = receiptPriceAtEnd(l),
      before = p != null ? l.replace(/(?:NT\$|\$)?\s*\d{1,6}(?:\s*T[XK])?\s*$/i, '') : l;
    return p > 0 && (cjkCount(before) >= 2 || /[A-Za-z]{2}/.test(before));
  };
  for (let i = 0; i < lines.length; i++) {
    let hits = 0;
    for (let j = i; j < Math.min(lines.length, i + 5); j++) if (itemish(lines[j])) hits++;
    if (hits >= 2) {
      start = i;
      break;
    }
  }
  if (start < 0) start = Math.max(0, lines.findIndex(itemish));
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++)
    if (isFooterRow({ text: lines[i] })) {
      end = i;
      break;
    }
  const items = [];
  let pending = '';
  for (let i = start; i < end; i++) {
    const l = lines[i];
    if (isHeaderRow({ text: l }) || isFooterRow({ text: l })) continue;
    const p = receiptPriceAtEnd(l);
    if (p > 0) {
      let before = l.replace(/(?:NT\$|\$)?\s*\d{1,6}(?:\s*T[XK])?\s*$/i, '').trim(),
        name = fallbackCleanName(before);
      if (pending) {
        name = (pending + name).replace(/\s+/g, '');
        pending = '';
      }
      if (name && (cjkCount(name) >= 2 || /[A-Za-z]{2}/.test(name))) items.push({ name, price: p });
      continue;
    }
    const pure = l.match(/^\s*(?:NT\$|\$)?\s*(\d{1,6})(?:\s*T[XK])?\s*$/i);
    if (pure && pending) {
      items.push({ name: pending, price: +pure[1] });
      pending = '';
      continue;
    }
    const nm = fallbackCleanName(l);
    if (cjkCount(nm) >= 2) pending = pending ? pending + nm : nm;
  }
  const rec = reconcilePrices(items, total);
  return {
    date,
    store: '',
    total,
    items: rec.items,
    expectedCount,
    lines,
    text,
    adjusted: rec.adjusted,
    structured: false,
  };
}
function guessItemCat(name) {
  const key = String(name || '')
    .replace(/\s/g, '')
    .toLowerCase();
  const counts = {};
  records.forEach((r) =>
    (r.items || []).forEach((i) => {
      const k = String(i.name || '')
        .replace(/\s/g, '')
        .toLowerCase();
      if (!k || !i.category) return;
      if (k === key || k.includes(key) || key.includes(k)) {
        const z = i.category + '\u0000' + (i.sub || '');
        counts[z] = (counts[z] || 0) + 1;
      }
    }),
  );
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (!best) return { cat: '', sub: '' };
  const [cat, sub] = best[0].split('\u0000');
  return { cat, sub };
}
function ocrReviewItems() {
  return [...$('#ocrReviewItems').querySelectorAll('.ocr-review-item')]
    .map((r) => ({
      name: r.querySelector('[data-oname]').value.trim(),
      price: +r.querySelector('[data-oprice]').value || 0,
    }))
    .filter((x) => x.name || x.price);
}
function updateOcrCheck() {
  const items = ocrReviewItems(),
    sum = items.reduce((s, x) => s + (+x.price || 0), 0),
    total = +$('#ocrTotal').value || 0,
    el = $('#ocrCheck'),
    exp = ocrParsed?.expectedCount;
  let bits = [
    `品項 ${items.length}${exp != null ? ` / 發票標示 ${exp}` : ''} 項`,
    `品項加總 ${nf(sum)}`,
    `發票總額 ${total ? nf(total) : '未可靠辨識'}`,
  ];
  let ok = !!total && Math.abs(sum - total) < 0.5 && (exp == null || items.length === exp);
  if (ocrParsed?.adjusted) bits.push(`已依總額校正 ${ocrParsed.adjusted} 筆疑似多辨識前綴`);
  el.textContent =
    bits.join(' · ') + (ok ? ' · ✓ 一致' : total ? ' · 請人工確認' : ' · 先確認品項，總額可手動補');
  el.className = 'ocr-check ' + (ok ? 'ok' : 'warn');
}
function addOcrReviewRow(name = '', price = '', adjusted = false) {
  const box = $('#ocrReviewItems'),
    row = document.createElement('div');
  row.className = 'ocr-review-item';
  row.innerHTML = `<input type="text" data-oname placeholder="品項名稱" value="${esc(name)}"><input type="number" data-oprice inputmode="decimal" placeholder="金額" value="${price || ''}"><button type="button" aria-label="刪除">×</button>`;
  if (adjusted) {
    row.title = '此價格曾依發票總額自動修正疑似 OCR 前綴';
    row.querySelector('[data-oprice]').style.borderColor = 'var(--teal)';
  }
  row.querySelector('button').onclick = () => {
    row.remove();
    updateOcrCheck();
  };
  row.querySelectorAll('input').forEach((i) => (i.oninput = updateOcrCheck));
  box.appendChild(row);
}
function renderOcrReview(parsed, source) {
  ocrParsed = parsed;
  $('#ocrTitle').textContent = '確認發票品項';
  $('#ocrStatus').textContent =
    `${source} 已完成。新版依「同一水平列＋右側價格欄」重建品項，不再猜店家。`;
  $('#ocrDate').value = parsed.date || todayISO();
  $('#ocrTotal').value = parsed.total || '';
  $('#ocrReviewItems').innerHTML = '';
  parsed.items.forEach((i) => addOcrReviewRow(i.name, i.price, !!i.autoAdjusted));
  if (!parsed.items.length) addOcrReviewRow();
  $('#ocrReview').classList.add('show');
  $('#ocrCancel').style.display = 'none';
  updateOcrCheck();
}
async function localTesseractReceipt(file) {
  if (!window.Tesseract) throw new Error('本機 OCR 元件尚未載入');
  const canvas = await prepareReceiptCanvas(file, true);
  ocrWorker = await Tesseract.createWorker(['chi_tra', 'eng'], 1, {
    logger: (m) => {
      if (ocrCancelled) return;
      const p = Math.round((m.progress || 0) * 100);
      $('#ocrProgress').style.width = Math.max(5, p) + '%';
      $('#ocrStatus').textContent =
        ({
          loading_tesseract_core: '載入 OCR 核心',
          initializing_tesseract: '初始化 OCR',
          loading_language_traineddata: '載入繁體中文模型',
          initializing_api: '準備辨識',
          recognizing_text: '辨識文字與版面中',
        }[String(m.status || '').replace(/ /g, '_')] ||
          m.status ||
          '辨識中') + (m.progress != null ? ` ${p}%` : '');
    },
  });
  try {
    await ocrWorker.setParameters({ preserve_interword_spaces: '1' });
  } catch (e) {}
  const ret = await ocrWorker.recognize(canvas, {}, { blocks: true, tsv: true }),
    data = ret.data || {},
    words = blockWords(data.blocks);
  return {
    text: data.text || '',
    words: words.length ? words : parseTsvWords(data.tsv),
    width: canvas.width,
    height: canvas.height,
    engine: 'tesseract',
  };
}
async function runReceiptOCR(file) {
  ocrCancelled = false;
  ocrParsed = null;
  $('#ocrOverlay').classList.add('show');
  $('#ocrReview').classList.remove('show');
  $('#ocrCancel').style.display = 'block';
  $('#ocrTitle').textContent = '正在辨識發票';
  $('#ocrProgress').style.width = '3%';
  $('#ocrStatus').textContent = '正在準備照片…';
  const old = $('#ocrPreview').src;
  if (old?.startsWith('blob:')) URL.revokeObjectURL(old);
  $('#ocrPreview').src = URL.createObjectURL(file);
  try {
    let ocr = null,
      source = '';
    if (effectiveVisionKey()) {
      try {
        $('#ocrStatus').textContent = 'Google Vision 文件 OCR 與版面辨識中…';
        $('#ocrProgress').style.width = '22%';
        ocr = await cloudVisionReceipt(file);
        source = 'Google Cloud Vision';
      } catch (e) {
        console.warn('Vision OCR failed', e);
        $('#ocrStatus').textContent = 'Google Vision 失敗，正在改用本機 OCR…';
        ocr = await localTesseractReceipt(file);
        source = '本機 OCR（Vision 失敗）';
      }
    } else {
      ocr = await localTesseractReceipt(file);
      source = '本機 OCR';
    }
    if (ocrCancelled) return;
    const parsed = parseReceiptLayout(ocr);
    $('#ocrProgress').style.width = '100%';
    renderOcrReview(parsed, source);
  } catch (e) {
    console.error(e);
    $('#ocrStatus').textContent = '辨識失敗：' + (e.message || '請換一張更清楚的照片');
    $('#ocrProgress').style.width = '0%';
  } finally {
    if (ocrWorker) {
      try {
        await ocrWorker.terminate();
      } catch (e) {}
      ocrWorker = null;
    }
  }
}
function applyOcrToForm() {
  const items = ocrReviewItems().filter((x) => x.name && x.price > 0),
    sum = items.reduce((s, x) => s + x.price, 0),
    total = +$('#ocrTotal').value || sum;
  document.querySelector('#k-expense').checked = true;
  updateKindUI();
  discountDraft = [];
  discountOverrideTotal = null;
  discountBaseAmount = total || 0;
  $('#f-date').value = $('#ocrDate').value || todayISO();
  $('#f-total').value = total || '';
  if (typeof updateEntryTotalMirror === 'function') updateEntryTotalMirror();
  $('#itemRows').innerHTML = '';
  if (items.length) {
    items.forEach((i) => {
      const g = guessItemCat(i.name);
      addItemRow(i.name, i.price, g.cat, g.sub);
    });
    catMode = 'perItem';
    setCatMode('perItem');
    setItemDetailOpen(true);
  } else setItemDetailOpen(false);
  refreshStoreItems();
  renderChipSelectors();
  renderSubChips();
  closeOcr();
  toast(`已套用 ${items.length} 個品項；店家可選填，請最後確認分類與金額`);
}
function closeOcr() {
  ocrCancelled = true;
  $('#ocrOverlay').classList.remove('show');
  $('#ocrReview').classList.remove('show');
  ocrParsed = null;
  const src = $('#ocrPreview').src;
  if (src?.startsWith('blob:')) URL.revokeObjectURL(src);
  $('#ocrPreview').removeAttribute('src');
}
$('#scanReceiptBtn').onclick = () => $('#receiptFile').click();
$('#receiptFile').onchange = (e) => {
  const f = e.target.files?.[0];
  if (f) runReceiptOCR(f);
  e.target.value = '';
};
$('#ocrCancel').onclick = closeOcr;
$('#ocrDiscard').onclick = closeOcr;
$('#ocrApply').onclick = applyOcrToForm;
$('#ocrAddItem').onclick = () => {
  addOcrReviewRow();
  updateOcrCheck();
};
$('#ocrTotal').oninput = updateOcrCheck;
