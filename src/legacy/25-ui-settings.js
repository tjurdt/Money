/* ===== 設定 ===== */
function renderSettings() {
  $('#countInfo').textContent = records.length;
  $('#osmToggle').checked = !!settings.osm;
  renderCloudStatus();
  const access = hasAdvancedAccess(),
    mo = $('#mapOriginDiag');
  if (mo) {
    if (access && APP_CONFIG.mapsApiKey)
      mo.innerHTML =
        '<span class="service-ok">✓ 白名單進階功能已啟用：Google Places</span> · 失敗時自動用 OpenStreetMap';
    else
      mo.innerHTML =
        '<span class="service-fallback">目前使用 OpenStreetMap</span> · 登入白名單 Google 帳號後才會啟用共用 Google Places';
  }
  const od = $('#ocrServiceDiag');
  if (od) {
    if (access && APP_CONFIG.visionApiKey)
      od.innerHTML =
        '<span class="service-ok">✓ 白名單進階功能已啟用：Google Cloud Vision</span> · 失敗會自動退回本機 OCR';
    else od.innerHTML = '目前使用 <b>本機 OCR</b>；登入白名單 Google 帳號後才會啟用 Google Vision';
  }
  const fd = $('#financeDiag');
  if (fd) {
    const n = Object.keys(tickerCacheMap()).length,
      oauthProj = oauthProjectNumber();
    fd.textContent = `股票名稱：${n > 500 ? '本機已有 ' + n.toLocaleString() + ' 筆代號快取' : '可自動下載台股代號表'}。價格：${access ? (settings.financeSheetId ? 'Google Finance 行情橋接已建立' : '白名單已登入；若 Google Finance 尚未建立會自動退回 TWSE／TPEx') : '目前使用 TWSE／TPEx／手動現價；Google Finance 僅限白名單登入後使用'}${oauthProj ? ' · OAuth 專案 ' + oauthProj : ''}`;
  }
  renderDataHealth();
  const nextColor = () => CAT_COLORS[Object.keys(catColors).length % CAT_COLORS.length];
  const renderCatBox = (box, list, key, label) => {
    box.innerHTML =
      catOrder(list)
        .map((v) => {
          const cur = catColor(v);
          return `<div class="catmanage"><div class="catline"><span class="tag cat" style="color:${cur};background:${colorBg(cur)}">${esc(v)}</span></div><input class="cat-color" type="color" value="${cur}" data-nativecolor="${esc(v)}" aria-label="${esc(v)} 顏色"><button class="rename" data-ren="${esc(v)}">改名</button><button class="x" data-del="${esc(v)}">刪除</button></div>`;
        })
        .join('') +
      `<button class="addtrip" data-addcat="1" style="margin-top:4px">＋ 新增${label}</button>`;
    box.querySelectorAll('[data-nativecolor]').forEach(
      (inp) =>
        (inp.oninput = () => {
          catColors[inp.dataset.nativecolor] = inp.value;
          save(K.cc, catColors);
          renderAll();
          if ($('#view-chart').classList.contains('active')) renderCharts();
          const tag = inp.closest('.catmanage')?.querySelector('.tag.cat');
          if (tag) {
            tag.style.color = inp.value;
            tag.style.background = colorBg(inp.value);
          }
        }),
    );
    box.querySelectorAll('[data-ren]').forEach(
      (b) =>
        (b.onclick = () => {
          const old = b.dataset.ren,
            n = (prompt('將「' + old + '」改名為：', old) || '').trim();
          if (!n || n === old || list.includes(n)) return;
          const i = list.indexOf(old);
          if (i >= 0) list[i] = n;
          const targetKind = key === K.ce ? 'expense' : 'income';
          records.forEach((r) => {
            if (r.kind !== targetKind) return;
            if (r.category === old) r.category = n;
            if (targetKind === 'expense')
              (r.items || []).forEach((it) => {
                if (it.category === old) it.category = n;
              });
          });
          if (key === K.ce && subcats[old]) {
            subcats[n] = subcats[old];
            delete subcats[old];
          }
          if (catColors[old]) {
            catColors[n] = catColors[old];
            const other = key === K.ce ? catsIncome : catsExpense;
            if (!other.includes(old)) delete catColors[old];
          }
          save(key, list);
          save(K.rec, records);
          save(K.sub, subcats);
          save(K.cc, catColors);
          renderSettings();
          renderAll();
        }),
    );
    box.querySelectorAll('[data-del]').forEach(
      (b) =>
        (b.onclick = () => {
          const v = b.dataset.del;
          if (!confirm('刪除「' + v + '」？')) return;
          const i = list.indexOf(v);
          if (i >= 0) list.splice(i, 1);
          if (key === K.ce) delete subcats[v];
          if (!catsExpense.includes(v) && !catsIncome.includes(v)) delete catColors[v];
          save(key, list);
          save(K.sub, subcats);
          save(K.cc, catColors);
          renderSettings();
        }),
    );
    box.querySelector('[data-addcat]').onclick = () => {
      const n = (prompt('新增' + label) || '').trim();
      if (n && !list.includes(n)) {
        list.push(n);
        if (!catColors[n]) catColors[n] = nextColor();
        save(key, list);
        save(K.cc, catColors);
        renderSettings();
      }
    };
  };
  renderCatBox($('#catIncManage'), catsIncome, K.ci, '收入分類');
  renderCatBox($('#catExpManage'), catsExpense, K.ce, '支出分類');
  const mk = (list) =>
    list.map((v) => `<button data-v="${esc(v)}">${esc(v)} ✕</button>`).join('') +
    `<button class="add" data-add="1">＋ 新增</button>`;
  $('#payManage').innerHTML = mk(payments);
  $('#payManage')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.add) {
            const n = (prompt('新增付款方式') || '').trim();
            if (n && !payments.includes(n)) {
              payments.push(n);
              save(K.pay, payments);
              renderSettings();
            }
            return;
          }
          if (confirm('刪除「' + b.dataset.v + '」？')) {
            payments = payments.filter((x) => x !== b.dataset.v);
            save(K.pay, payments);
            renderSettings();
          }
        }),
    );
  $('#subManage').innerHTML = catsExpense.length
    ? catsExpense
        .map((c) => {
          const subs = subcats[c] || [];
          return `<div class="subblock"><div class="subhdr"><span class="tag cat" style="color:${catColor(c)};background:${colorBg(catColor(c))}">${esc(c)}</span></div><div class="selectchips">${subs.map((s) => `<button data-c="${esc(c)}" data-s="${esc(s)}">${esc(s)} ✕</button>`).join('')}<button class="add" data-addsub="${esc(c)}">＋ 子分類</button></div></div>`;
        })
        .join('')
    : '<div class="empty" style="padding:8px;font-size:13px">先新增支出分類</div>';
  $('#subManage')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          if (b.dataset.addsub) {
            const c = b.dataset.addsub,
              v = (prompt('新增子分類到「' + c + '」') || '').trim();
            if (v) {
              (subcats[c] = subcats[c] || []).push(v);
              save(K.sub, subcats);
              renderSettings();
            }
            return;
          }
          const c = b.dataset.c,
            sub = b.dataset.s;
          if (confirm('刪除子分類「' + sub + '」？')) {
            subcats[c] = (subcats[c] || []).filter((x) => x !== sub);
            save(K.sub, subcats);
            renderSettings();
          }
        }),
    );
  const chains = [...new Set(settings.storeChains || [])].filter(Boolean);
  $('#chainManage').innerHTML = chains.length
    ? chains.map((c) => `<button data-chain="${esc(c)}">${esc(c)} ✕</button>`).join('')
    : '<span class="none">目前沒有額外釘選；常見品牌仍會顯示在連鎖店選單。</span>';
  $('#chainManage')
    .querySelectorAll('[data-chain]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          settings.storeChains = (settings.storeChains || []).filter((x) => x !== b.dataset.chain);
          save(K.set, settings);
          renderSettings();
          buildDatalists();
        }),
    );
  const az = $('#adminZone');
  if (az) {
    az.style.display = isSiteAdmin() ? 'block' : 'none';
    if (isSiteAdmin()) {
      $('#adminAllowlist').innerHTML = APP_CONFIG.advancedAllowlist
        .map(
          (e) =>
            `<div class="allowlist-row"><span>${esc(e)}</span><span class="access-badge">${e === APP_CONFIG.adminEmail ? '管理者' : '白名單'}</span></div>`,
        )
        .join('');
    }
  }
  $('#tripManage').innerHTML = trips.length
    ? sortedTrips()
        .map(
          (t) =>
            `<div class="brow" style="cursor:pointer" data-edit="${t.id}"><div><div class="who">${t.kind === 'overseas' ? '✈️' : '🚆'} ${esc(t.name)}</div>${tripDates(t) ? `<div class="dir">${tripDates(t)}</div>` : ''}</div><span style="color:var(--teal);font-size:13px;font-weight:600">編輯</span></div>`,
        )
        .join('')
    : '<div class="empty" style="padding:10px;font-size:13px">尚無行程</div>';
  $('#tripManage')
    .querySelectorAll('[data-edit]')
    .forEach((b) => (b.onclick = () => openTripSheet(b.dataset.edit)));

  renderRecurringRules();
}

$('#osmToggle').onchange = (e) => {
  settings.osm = e.target.checked;
  save(K.set, settings);
};
$('#addChainManage').onclick = () => {
  const n = $('#chainManageInput').value.trim();
  if (!n) return;
  settings.storeChains = unionUnique(settings.storeChains, [n]);
  save(K.set, settings);
  $('#chainManageInput').value = '';
  renderSettings();
  buildDatalists();
};

$('#testPlacesBtn').onclick = testGooglePlaces;
$('#testFinanceBtn').onclick = testGoogleFinance;
$('#refreshTickerCatalogBtn').onclick = refreshTickerCatalogUI;
$('#exportBtn').onclick = () =>
  dl(
    new Blob(
      [
        JSON.stringify(
          {
            records,
            catsExpense,
            catsIncome,
            payments,
            trips,
            subcats,
            catColors,
            prices,
            exportedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    ),
    '記帳備份_' + new Date().toISOString().slice(0, 10) + '.json',
  );
$('#exportCsv').onclick = () => {
  const head = [
    '日期',
    '類型',
    '情境',
    '店家/來源/標的',
    '品項明細',
    '金額',
    '我的花費',
    '分類',
    '子分類',
    '付款',
    '分帳對象',
    '分帳結算',
    '動作',
    '股數',
    '備註',
  ];
  const km = { expense: '支出', income: '收入', investment: '投資', settlement: '還款' };
  const rows = records.map((r) => {
    const s = r.inv || {},
      itemStr = (r.items || [])
        .map(
          (i) =>
            i.name +
            (i.price ? ':' + i.price : '') +
            (i.category ? '(' + i.category + (i.sub ? '/' + i.sub : '') + ')' : ''),
        )
        .join(' / '),
      bal = r.split ? splitBalance(r) : '';
    const settle =
      r.kind === 'settlement'
        ? r.settlement?.direction === 'received'
          ? '對方還我'
          : '我還對方'
        : '';
    return [
      r.date,
      km[r.kind],
      scopeLabel(r.scope || { type: 'daily' }),
      r.store || s.symbol || r.settlement?.partner || '',
      itemStr,
      r.total,
      r.kind === 'expense' ? myShareOf(r) : '',
      r.catMode === 'perItem' ? '逐項' : r.category || '',
      r.sub || '',
      r.payment || '',
      r.split ? r.split.partner : r.settlement?.partner || '',
      r.split
        ? r.split.settled
          ? '已結清'
          : bal > 0
            ? '對方欠' + Math.round(bal)
            : bal < 0
              ? '我欠' + Math.round(-bal)
              : ''
        : settle,
      s.action ? { buy: '買', sell: '賣', dividend: '股利' }[s.action] : '',
      s.shares || '',
      r.note || '',
    ]
      .map((c) => '"' + String(c).replace(/"/g, '""') + '"')
      .join(',');
  });
  dl(
    new Blob(['\uFEFF' + [head.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }),
    '記帳_' + new Date().toISOString().slice(0, 10) + '.csv',
  );
};
function dl(b, n) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = n;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$('#importBtn').onclick = () => $('#importFile').click();
$('#importFile').onchange = (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const d = JSON.parse(fr.result);
      if (!Array.isArray(d.records)) throw 0;

      // 匯入的檔案可能來自舊版、別的裝置，或被手動編輯過。
      // 先過驗證器：能用的留下、壞掉的剔除，不讓壞資料直接寫進帳本。
      const { records: incoming, dropped } = salvageRecords(d.records);
      const skipNote = dropped.length ? `\n（有 ${dropped.length} 筆格式無法讀取，將略過）` : '';

      if (
        confirm(
          '要匯入 ' +
            incoming.length +
            ' 筆嗎？會與現有資料合併，相同的帳目以匯入版本為準。' +
            skipNote,
        )
      ) {
        const by = {};
        [...records, ...incoming].forEach((r) => (by[r.id] = r));
        records = Object.values(by);
        if (Array.isArray(d.catsExpense))
          catsExpense = [...new Set([...catsExpense, ...d.catsExpense])];
        if (Array.isArray(d.catsIncome))
          catsIncome = [...new Set([...catsIncome, ...d.catsIncome])];
        if (Array.isArray(d.payments)) payments = [...new Set([...payments, ...d.payments])];
        if (Array.isArray(d.trips)) {
          const tb = {};
          // 只收有識別碼的物件，避免 null 或字串讓這裡拋錯。
          [...trips, ...d.trips]
            .filter((t) => t && typeof t === 'object' && t.id != null)
            .forEach((t) => (tb[t.id] = t));
          trips = Object.values(tb);
        }
        if (d.subcats) subcats = Object.assign({}, subcats, d.subcats);
        if (d.catColors) catColors = Object.assign({}, catColors, d.catColors);
        if (d.prices) prices = Object.assign({}, prices, d.prices);
        save(K.rec, records);
        save(K.ce, catsExpense);
        save(K.ci, catsIncome);
        save(K.pay, payments);
        save(K.trips, trips);
        save(K.sub, subcats);
        save(K.cc, catColors);
        save(K.prices, prices);
        renderAll();
        renderInvest();
        renderSettings();
        toast('匯入完成');
      }
    } catch (err) {
      toast('檔案格式錯誤');
    }
  };
  fr.readAsText(f);
  e.target.value = '';
};
$('#clearBtn').onclick = () => {
  if (
    confirm('清除全部帳目？無法復原。') &&
    confirm('再次確認：刪除全部 ' + records.length + ' 筆？')
  ) {
    records = [];
    save(K.rec, records);
    renderAll();
    renderInvest();
    renderSettings();
    toast('已清除');
  }
};

function renderFirstRunBanner() {
  const box = $('#firstRunBanner');
  if (!box) return;
  if (
    GOOGLE_SYNC.mode === 'google' ||
    records.length ||
    load('ledger.onboard.dismissed.v1', false)
  ) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = `<div class="onboard-card"><h3>☁ 可以先用單機，也可登入進階功能</h3><p>基本記帳、CSV、圖表、股票名稱、本機 OCR 與 OpenStreetMap 不需登入；白名單使用者登入 Google 後可再使用雲端同步、Google Places、Vision OCR 與 Google Finance。</p><div class="acts"><button class="btn-outline" id="onboardGoogle">白名單 Google 登入</button><button class="btn-outline" id="onboardLater">先用單機</button></div></div>`;
  $('#onboardGoogle').onclick = openCloudSheet;
  $('#onboardLater').onclick = () => {
    save('ledger.onboard.dismissed.v1', true);
    renderFirstRunBanner();
  };
}
function renderAll() {
  renderScopePill();
  renderMonthBar();
  renderSummary();
  renderFilterChips();
  renderList();
  renderFirstRunBanner();
  if ($('#view-chart').classList.contains('active')) renderCharts();
}
{
  const n = new Date();
  customFrom = new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
  customTo = todayISO();
  $('#chartFrom').value = customFrom;
  $('#chartTo').value = customTo;
}
renderAll();

// 背景預載台股代號／名稱，之後輸入代號可立即帶入名稱。失敗不影響記帳。
setTimeout(() => {
  if (navigator.onLine !== false) fetchTWSE().catch(() => {});
}, 1200);
setTimeout(() => {
  if (navigator.onLine !== false && Object.keys(tickerCacheMap()).length < 500)
    loadTickerCatalogFallback().catch(() => {});
}, 3500);

// 安裝到手機桌面時提供 PWA 圖示與獨立視窗；失敗不影響網頁本身。
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () =>
    navigator.serviceWorker.register('./ledger-sw.js').catch(() => {}),
  );
}

/**
 * 設定頁的資料健康狀態。
 *
 * 兩種需要讓使用者知道的情況：
 *   1. 瀏覽器儲存不可用 —— 資料只留在這個分頁，關掉就沒了。
 *   2. 載入時發現資料問題 —— 有值被隔離或修復過。
 *
 * 這些原本都是靜默處理的。資料出問題卻不告知使用者，
 * 等他們發現時往往已經來不及了。
 */
function renderDataHealth() {
  const box = $('#storageWarn');
  if (!box) return;

  const notes = [];

  if (!storageOK) {
    notes.push(
      '⚠️ 目前環境不支援瀏覽器儲存，資料只暫存於此分頁，關閉後就會消失。' +
        '請下載此檔或部署到 GitHub Pages / Netlify 後使用即可永久保存。',
    );
  }

  for (const issue of store.getIntegrityIssues()) {
    if (issue.kind === 'quarantined') {
      notes.push(
        `⚠️ 載入「${esc(issue.key)}」時發現資料格式不符，已改用預設值。` +
          '原始資料已完整保留在隔離區，沒有被刪除 —— 需要救回請聯絡維護者。',
      );
    } else if (issue.kind === 'repaired') {
      notes.push(
        `ℹ️ 載入「${esc(issue.key)}」時剔除了 ${issue.count} 筆無法讀取的項目，其餘資料正常。` +
          '被剔除的內容已保留在隔離區。',
      );
    } else if (issue.kind === 'migration-failed') {
      notes.push(
        `⚠️ 資料升級步驟「${esc(issue.key)}」執行失敗：${esc(issue.error)}。` +
          '既有資料未被更動。',
      );
    }
  }

  if (!notes.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = notes.map((n) => `<div>${n}</div>`).join('');
}
