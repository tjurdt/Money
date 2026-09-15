/* ===== Google Drive 同步 ===== */
const GOOGLE_SYNC = {
  MODE_KEY: 'ledger.cloud.mode.v1',
  USER_KEY: 'ledger.cloud.user.v1',
  LOCAL_OWNER_KEY: 'ledger.cloud.localOwner.v1',
  SESSION_KEY: 'ledger.cloud.session.v2',
  CACHE_PREFIX: 'ledger.cloud.cache.v1:',
  FILE_NAME: 'ledger_cloud_v1.json',
  BACKUP_PREFIX: 'ledger_cloud_conflict_backup_',
  BACKUP_KEEP: 5,
  SCOPE: 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive.file',
  mode: load('ledger.cloud.mode.v1', 'local'),
  user: load('ledger.cloud.user.v1', null),
  userKey: null,
  token: null,
  expiresAt: 0,
  file: null,
  syncing: false,
  pending: false,
  timer: null,
  suspend: false,
  localRevision: 0,
  status: 'local',
  detail: '',
  lastBackupHash: '',
  lastBackupAt: 0,
};
if (GOOGLE_SYNC.user && isAllowlistedEmail(GOOGLE_SYNC.user.emailAddress))
  GOOGLE_SYNC.userKey = GOOGLE_SYNC.user.permissionId || GOOGLE_SYNC.user.emailAddress || null;
else if (GOOGLE_SYNC.user) {
  GOOGLE_SYNC.user = null;
  GOOGLE_SYNC.userKey = null;
  GOOGLE_SYNC.mode = 'local';
}
function googleClientId() {
  return (document.querySelector('meta[name="google-oauth-client-id"]')?.content || '').trim();
}
function syncCacheKey() {
  return GOOGLE_SYNC.userKey ? GOOGLE_SYNC.CACHE_PREFIX + GOOGLE_SYNC.userKey : null;
}
function readSyncCache() {
  const k = syncCacheKey();
  return k ? load(k, null) : null;
}
function writeSyncCache(v) {
  const k = syncCacheKey();
  if (k) {
    GOOGLE_SYNC.suspend = true;
    save(k, v);
    GOOGLE_SYNC.suspend = false;
  }
}
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + stableStringify(v[k]))
      .join(',') +
    '}'
  );
}
function deepClone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
function packLedger() {
  return {
    schema: 'ledger-v4',
    records: deepClone(records),
    catsExpense: [...catsExpense],
    catsIncome: [...catsIncome],
    payments: [...payments],
    trips: deepClone(trips),
    subcats: deepClone(subcats),
    catColors: deepClone(catColors),
    prices: deepClone(prices),
    settings: deepClone(safeUserSettings(settings)),
    savedAt: Date.now(),
  };
}
function normalizeLedger(d) {
  d = d && typeof d === 'object' ? d : {};
  return {
    schema: 'ledger-v4',
    records: Array.isArray(d.records) ? d.records : [],
    catsExpense: Array.isArray(d.catsExpense) ? d.catsExpense : [],
    catsIncome: Array.isArray(d.catsIncome) ? d.catsIncome : [],
    payments: Array.isArray(d.payments) ? d.payments : [],
    trips: Array.isArray(d.trips) ? d.trips : [],
    subcats: d.subcats && typeof d.subcats === 'object' ? d.subcats : {},
    catColors: d.catColors && typeof d.catColors === 'object' ? d.catColors : {},
    prices: d.prices && typeof d.prices === 'object' ? d.prices : {},
    settings: safeUserSettings(d.settings && typeof d.settings === 'object' ? d.settings : {}),
    savedAt: +d.savedAt || 0,
  };
}
function persistLedgerSnapshot(d) {
  d = normalizeLedger(d);
  GOOGLE_SYNC.suspend = true;
  records = d.records;
  catsExpense = d.catsExpense;
  catsIncome = d.catsIncome;
  payments = d.payments;
  trips = d.trips;
  subcats = d.subcats;
  catColors = d.catColors;
  prices = d.prices;
  settings = { ...settings, ...d.settings };
  save(K.rec, records);
  save(K.ce, catsExpense);
  save(K.ci, catsIncome);
  save(K.pay, payments);
  save(K.trips, trips);
  save(K.sub, subcats);
  save(K.cc, catColors);
  save(K.prices, prices);
  save(K.set, settings);
  GOOGLE_SYNC.suspend = false;
  renderAll();
  renderInvest();
  if ($('#view-settings').classList.contains('active')) renderSettings();
}
function recordMap(db) {
  const m = new Map();
  (db.records || []).forEach((r) => {
    if (r && r.id) m.set(r.id, r);
  });
  return m;
}
function makeBaseSnapshot(db) {
  const m = {};
  recordMap(db).forEach((r, id) => (m[id] = stableStringify(r)));
  return { records: m, globals: stableStringify({ ...db, records: [] }) };
}
function freshUserLedger() {
  const ce = ['餐食', '交通', '日用品', '娛樂', '居家', '醫療', '其他'],
    ci = ['薪資', '其他收入'],
    pay = ['信用卡', '現金', '行動支付', '轉帳'],
    sub = {
      餐食: ['早餐', '午餐', '晚餐', '點心／飲料'],
      交通: ['大眾運輸', '計程車／叫車', '加油'],
    },
    cc = {},
    dc = ['#0d6e60', '#3269c0', '#bb5c2c', '#6f56bd', '#3f9e6b', '#cf9a2b', '#bd5079'];
  ce.forEach((c, i) => (cc[c] = dc[i % dc.length]));
  cc['薪資'] = '#2c9968';
  cc['其他收入'] = '#3f9e6b';
  return normalizeLedger({
    records: [],
    catsExpense: ce,
    catsIncome: ci,
    payments: pay,
    trips: [],
    subcats: sub,
    catColors: cc,
    prices: {},
    settings: { osm: false, financeSheetId: '', storeChains: [], mrtRecentPairs: [] },
    savedAt: Date.now(),
  });
}
function unionUnique(a, b) {
  return [...new Set([...(a || []), ...(b || [])])];
}
function mergeGlobals(local, cloud) {
  const out = deepClone(cloud);
  out.catsExpense = unionUnique(cloud.catsExpense, local.catsExpense);
  out.catsIncome = unionUnique(cloud.catsIncome, local.catsIncome);
  out.payments = unionUnique(cloud.payments, local.payments);
  const tb = {};
  [...(cloud.trips || []), ...(local.trips || [])].forEach((t) => {
    if (t && t.id) tb[t.id] = t;
  });
  out.trips = Object.values(tb);
  out.subcats = { ...cloud.subcats };
  Object.entries(local.subcats || {}).forEach(
    ([k, v]) => (out.subcats[k] = unionUnique(out.subcats[k], v)),
  );
  out.catColors = { ...cloud.catColors, ...local.catColors };
  out.prices = { ...cloud.prices, ...local.prices };
  out.settings = { ...cloud.settings, ...local.settings };
  out.settings.recurringSkipped = unionUnique(
    cloud.settings?.recurringSkipped,
    local.settings?.recurringSkipped,
  );
  out.savedAt = Math.max(+cloud.savedAt || 0, +local.savedAt || 0, Date.now());
  return out;
}
function mergeLedgerThreeWay(local, cloud, base) {
  local = normalizeLedger(local);
  cloud = normalizeLedger(cloud);
  base = base || makeBaseSnapshot(cloud);
  const lm = recordMap(local),
    cm = recordMap(cloud),
    ids = new Set([...Object.keys(base.records || {}), ...lm.keys(), ...cm.keys()]),
    out = [],
    conflicts = [];
  ids.forEach((id) => {
    const l = lm.get(id) || null,
      c = cm.get(id) || null,
      b = (base.records || {})[id] ?? null,
      lh = l ? stableStringify(l) : null,
      ch = c ? stableStringify(c) : null,
      lc = lh !== b,
      cc = ch !== b;
    if (lc && cc && lh !== ch) {
      conflicts.push(id);
      if (l) out.push(l);
    } else if (lc) {
      if (l) out.push(l);
    } else if (cc) {
      if (c) out.push(c);
    } else if (l || c) out.push(l || c);
  });
  const globals = mergeGlobals(local, cloud);
  globals.records = out;
  return { data: globals, conflicts };
}
function tokenUsable() {
  return !!(GOOGLE_SYNC.token && Date.now() < GOOGLE_SYNC.expiresAt - 30000);
}
function cloudStatusView() {
  if (GOOGLE_SYNC.mode !== 'google') return { text: '單機', cls: '' };
  if (GOOGLE_SYNC.syncing) return { text: '同步中', cls: 'pending' };
  if (GOOGLE_SYNC.status === 'synced') return { text: '已同步', cls: 'ok' };
  if (GOOGLE_SYNC.status === 'offline') return { text: '離線', cls: 'warn' };
  if (GOOGLE_SYNC.status === 'pending') return { text: '待同步', cls: 'pending' };
  if (GOOGLE_SYNC.status === 'auth') return { text: '恢復同步', cls: 'warn' };
  return { text: '同步異常', cls: 'warn' };
}
function setCloudStatus(st, detail = '') {
  GOOGLE_SYNC.status = st;
  GOOGLE_SYNC.detail = detail;
  renderCloudStatus();
}
function renderCloudStatus() {
  const v = cloudStatusView(),
    b = $('#cloudPill'),
    t = $('#cloudPillText');
  if (b) {
    b.className = 'cloudpill ' + v.cls;
    t.textContent = v.text;
    b.title =
      (GOOGLE_SYNC.user?.emailAddress || GOOGLE_SYNC.user?.displayName || '') +
      (GOOGLE_SYNC.detail ? ' · ' + GOOGLE_SYNC.detail : '');
  }
  const st = $('#settingsCloudText');
  if (st)
    st.textContent =
      GOOGLE_SYNC.mode === 'google'
        ? `${GOOGLE_SYNC.user?.emailAddress || 'Google 帳號'} · ${v.text}${GOOGLE_SYNC.detail ? ' · ' + GOOGLE_SYNC.detail : ''}`
        : '目前為單機模式。登入 Google 後，資料會存到你的 Google Drive App Data。';
  const sb = $('#settingsSyncBtn');
  if (sb) sb.style.display = GOOGLE_SYNC.mode === 'google' ? 'inline-block' : 'none';
}
function restoreGoogleSession() {
  try {
    const x = JSON.parse(sessionStorage.getItem(GOOGLE_SYNC.SESSION_KEY) || 'null');
    if (
      x?.token &&
      x?.user &&
      Date.now() < +x.expiresAt - 30000 &&
      isAllowlistedEmail(x.user.emailAddress)
    ) {
      GOOGLE_SYNC.token = x.token;
      GOOGLE_SYNC.expiresAt = +x.expiresAt;
      GOOGLE_SYNC.user = x.user;
      GOOGLE_SYNC.userKey = x.user.permissionId || x.user.emailAddress;
      return true;
    }
    if (x?.user && !isAllowlistedEmail(x.user.emailAddress))
      sessionStorage.removeItem(GOOGLE_SYNC.SESSION_KEY);
  } catch (e) {}
  return false;
}
function saveGoogleSession() {
  try {
    sessionStorage.setItem(
      GOOGLE_SYNC.SESSION_KEY,
      JSON.stringify({
        token: GOOGLE_SYNC.token,
        expiresAt: GOOGLE_SYNC.expiresAt,
        user: GOOGLE_SYNC.user,
      }),
    );
  } catch (e) {}
}
async function authorizeGoogle(resume = false) {
  if (
    !/^https?:$/.test(location.protocol) ||
    (location.protocol === 'http:' && location.hostname !== 'localhost')
  )
    throw new Error(
      'Google 登入需要 HTTPS 網址（例如 GitHub Pages）；直接從下載檔開啟只能使用單機模式。',
    );
  if (!googleClientId()) throw new Error('尚未設定 Google OAuth Client ID。');
  if (!window.google?.accounts?.oauth2)
    throw new Error('Google 登入元件尚未載入，請確認網路後再試。');
  const expected = resume ? normEmail(GOOGLE_SYNC.user?.emailAddress) : '';
  const resp = await new Promise((resolve, reject) => {
    const c = google.accounts.oauth2.initTokenClient({
      client_id: googleClientId(),
      scope: GOOGLE_SYNC.SCOPE,
      callback: (r) => (r?.error ? reject(new Error(r.error_description || r.error)) : resolve(r)),
      error_callback: (e) =>
        reject(
          new Error(e?.type === 'popup_closed' ? '已關閉 Google 登入視窗' : 'Google 登入失敗'),
        ),
    });
    const cfg = resume
      ? { prompt: '', ...(expected ? { login_hint: expected } : {}) }
      : { prompt: 'select_account' };
    c.requestAccessToken(cfg);
  });
  GOOGLE_SYNC.token = resp.access_token;
  GOOGLE_SYNC.expiresAt = Date.now() + Math.max(60, +resp.expires_in || 3600) * 1000;
  const about = await driveJson(
    'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId,photoLink)',
  );
  const newUser = about.user || {},
    newEmail = normEmail(newUser.emailAddress);
  if (resume && expected && newEmail && newEmail !== expected) {
    GOOGLE_SYNC.token = null;
    GOOGLE_SYNC.expiresAt = 0;
    throw new Error('Google 回傳了不同帳號，請使用「重新選擇帳號」登入。');
  }
  GOOGLE_SYNC.user = newUser;
  GOOGLE_SYNC.userKey = GOOGLE_SYNC.user.permissionId || GOOGLE_SYNC.user.emailAddress;
  if (!GOOGLE_SYNC.userKey) throw new Error('無法識別 Google 帳號');
  if (!isAllowlistedEmail(GOOGLE_SYNC.user.emailAddress)) {
    const denied = GOOGLE_SYNC.user.emailAddress || '此 Google 帳號';
    GOOGLE_SYNC.token = null;
    GOOGLE_SYNC.expiresAt = 0;
    GOOGLE_SYNC.user = null;
    GOOGLE_SYNC.userKey = null;
    GOOGLE_SYNC.mode = 'local';
    try {
      sessionStorage.removeItem(GOOGLE_SYNC.SESSION_KEY);
    } catch (e) {}
    throw new Error(
      `${denied} 不在進階功能白名單。仍可使用單機記帳、CSV、圖表、OpenStreetMap 與本機 OCR。`,
    );
  }
  GOOGLE_SYNC.mode = 'google';
  GOOGLE_SYNC.suspend = true;
  save(GOOGLE_SYNC.MODE_KEY, 'google');
  save(GOOGLE_SYNC.USER_KEY, GOOGLE_SYNC.user);
  GOOGLE_SYNC.suspend = false;
  saveGoogleSession();
  return GOOGLE_SYNC.user;
}
async function resumeGoogle() {
  if (GOOGLE_SYNC.mode !== 'google' || !GOOGLE_SYNC.user?.emailAddress) return connectGoogle();
  if (tokenUsable()) {
    await performCloudSync();
    return;
  }
  try {
    setCloudStatus('pending', '正在恢復 Google 同步');
    await authorizeGoogle(true);
    await performCloudSync();
    toast('Google 同步已恢復');
    renderCloudPanel();
  } catch (e) {
    setCloudStatus('auth', '點一下恢復同步');
    toast(e.message || '無法恢復 Google 同步');
    renderCloudPanel();
  }
}
async function driveFetch(url, opts = {}) {
  if (!tokenUsable()) {
    setCloudStatus('auth', '點一下恢復同步');
    const e = new Error('Google 授權已到期');
    e.code = 'AUTH';
    throw e;
  }
  const o = {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + GOOGLE_SYNC.token },
  };
  let r;
  try {
    r = await fetch(url, o);
  } catch (e) {
    setCloudStatus('offline', '網路中斷，資料仍保存在此裝置');
    const x = new Error('無法連上 Google Drive');
    x.code = 'OFFLINE';
    throw x;
  }
  if (r.status === 401) {
    GOOGLE_SYNC.token = null;
    GOOGLE_SYNC.expiresAt = 0;
    try {
      sessionStorage.removeItem(GOOGLE_SYNC.SESSION_KEY);
    } catch (e) {}
    setCloudStatus('auth', '點一下恢復同步');
    const x = new Error('Google 授權已到期');
    x.code = 'AUTH';
    throw x;
  }
  if (!r.ok) {
    const tx = await r.text().catch(() => '');
    throw new Error('Google API ' + r.status + (tx ? '：' + tx.slice(0, 220) : ''));
  }
  return r;
}
async function driveJson(url, opts) {
  return (await driveFetch(url, opts)).json();
}
async function driveFindLedger() {
  const q = `name='${GOOGLE_SYNC.FILE_NAME}' and trashed=false`;
  const u =
    'https://www.googleapis.com/drive/v3/files?' +
    new URLSearchParams({
      spaces: 'appDataFolder',
      q,
      orderBy: 'modifiedTime desc',
      pageSize: '10',
      fields: 'files(id,name,modifiedTime,version,size)',
    });
  const x = await driveJson(u);
  return x.files?.[0] || null;
}
function cloudEnvelope(d) {
  return { schema: 'ledger-cloud-v1', savedAt: Date.now(), data: d };
}
async function driveReadLedger(file) {
  if (!file) return null;
  const x = await (
    await driveFetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`,
    )
  ).json();
  return normalizeLedger(x?.data || x);
}
async function driveCreateLedger(
  d,
  name = GOOGLE_SYNC.FILE_NAME,
  props = { app: 'personal-ledger', schema: '1' },
) {
  const boundary = 'ledger_' + Date.now().toString(36) + Math.random().toString(36).slice(2),
    meta = { name, parents: ['appDataFolder'], mimeType: 'application/json', appProperties: props },
    body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(cloudEnvelope(d))}\r\n--${boundary}--`;
  return driveJson(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,version',
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}
async function driveUpdateLedger(id, d) {
  return driveJson(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(id)}?uploadType=media&fields=id,name,modifiedTime,version`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify(cloudEnvelope(d)),
    },
  );
}
async function backupCloud(cloud, reason) {
  const h = stableStringify(cloud);
  if (h === GOOGLE_SYNC.lastBackupHash && Date.now() - GOOGLE_SYNC.lastBackupAt < 60000) return;
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    await driveCreateLedger(cloud, GOOGLE_SYNC.BACKUP_PREFIX + stamp + '.json', {
      app: 'personal-ledger',
      schema: '1',
      kind: 'conflict-backup',
      reason,
    });
    GOOGLE_SYNC.lastBackupHash = h;
    GOOGLE_SYNC.lastBackupAt = Date.now();
    const q = `name contains '${GOOGLE_SYNC.BACKUP_PREFIX}' and trashed=false`,
      u =
        'https://www.googleapis.com/drive/v3/files?' +
        new URLSearchParams({
          spaces: 'appDataFolder',
          q,
          orderBy: 'modifiedTime desc',
          pageSize: '100',
          fields: 'files(id,name,modifiedTime)',
        }),
      x = await driveJson(u);
    for (const f of (x.files || []).slice(GOOGLE_SYNC.BACKUP_KEEP))
      await driveFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(f.id)}`, {
        method: 'DELETE',
      }).catch(() => {});
  } catch (e) {
    console.warn('backup failed', e);
  }
}
function scheduleCloudSync(delay = 1300) {
  if (GOOGLE_SYNC.mode !== 'google' || !GOOGLE_SYNC.userKey) return;
  clearTimeout(GOOGLE_SYNC.timer);
  GOOGLE_SYNC.timer = setTimeout(() => performCloudSync().catch(() => {}), delay);
}
window.__ledgerCloudMutationHook = (k) => {
  if (GOOGLE_SYNC.suspend || GOOGLE_SYNC.mode !== 'google') return;
  if (!Object.values(K).includes(k)) return;
  GOOGLE_SYNC.localRevision++;
  GOOGLE_SYNC.pending = true;
  const c = readSyncCache() || {};
  writeSyncCache({
    ...c,
    data: packLedger(),
    dirty: true,
    base: c.base || null,
    localRevision: GOOGLE_SYNC.localRevision,
    user: GOOGLE_SYNC.user,
  });
  setCloudStatus(
    tokenUsable() ? 'pending' : 'auth',
    tokenUsable() ? '等待同步' : '本機已儲存；點雲朵恢復同步',
  );
  scheduleCloudSync();
};
async function performCloudSync() {
  if (GOOGLE_SYNC.mode !== 'google' || !GOOGLE_SYNC.userKey) return;
  if (GOOGLE_SYNC.syncing) {
    GOOGLE_SYNC.pending = true;
    return;
  }
  if (!tokenUsable()) {
    setCloudStatus('auth', '點一下恢復同步');
    return;
  }
  GOOGLE_SYNC.syncing = true;
  GOOGLE_SYNC.pending = false;
  setCloudStatus('syncing', '正在同步');
  try {
    let cache = readSyncCache(),
      local = normalizeLedger(cache?.data || packLedger()),
      base = cache?.base || null,
      file = await driveFindLedger(),
      cloud = file ? await driveReadLedger(file) : null,
      merged = local;
    if (!file) {
      file = await driveCreateLedger(local);
      merged = local;
    } else if (!cache?.data && cloud) {
      merged = cloud;
    } else {
      const m = mergeLedgerThreeWay(
        local,
        cloud || normalizeLedger({}),
        base || makeBaseSnapshot(normalizeLedger({})),
      );
      if (m.conflicts.length) await backupCloud(cloud, 'local-active-wins');
      merged = m.data;
      if (stableStringify(merged) !== stableStringify(cloud))
        file = await driveUpdateLedger(file.id, merged);
    }
    GOOGLE_SYNC.file = file;
    persistLedgerSnapshot(merged);
    writeSyncCache({
      data: deepClone(merged),
      dirty: false,
      base: makeBaseSnapshot(merged),
      localRevision: GOOGLE_SYNC.localRevision,
      user: GOOGLE_SYNC.user,
      file,
      lastSyncAt: Date.now(),
    });
    setCloudStatus('synced', '剛剛');
  } catch (e) {
    if (e.code !== 'AUTH' && e.code !== 'OFFLINE') setCloudStatus('error', e.message || '同步失敗');
    throw e;
  } finally {
    GOOGLE_SYNC.syncing = false;
    if (GOOGLE_SYNC.pending) scheduleCloudSync(300);
  }
}
async function connectGoogle() {
  const previousOwner = load(GOOGLE_SYNC.LOCAL_OWNER_KEY, null),
    before = packLedger();
  try {
    setCloudStatus('pending', '登入中');
    await authorizeGoogle();
    const accountCache = readSyncCache();
    if (accountCache?.data) {
      GOOGLE_SYNC.localRevision = +accountCache.localRevision || 0;
      persistLedgerSnapshot(accountCache.data);
    } else {
      const file = await driveFindLedger();
      if (file) {
        const cloud = await driveReadLedger(file);
        persistLedgerSnapshot(cloud);
        GOOGLE_SYNC.file = file;
        writeSyncCache({
          data: deepClone(cloud),
          dirty: false,
          base: makeBaseSnapshot(cloud),
          localRevision: 0,
          user: GOOGLE_SYNC.user,
          file,
          lastSyncAt: Date.now(),
        });
      } else {
        let seed = before;
        if (previousOwner && previousOwner !== GOOGLE_SYNC.userKey) seed = freshUserLedger();
        else if (!previousOwner && records.length) {
          const ok = confirm(
            `這台裝置目前有 ${records.length} 筆本機帳目。\n\n要把這些資料歸到 ${GOOGLE_SYNC.user?.emailAddress || '這個 Google 帳號'} 並同步嗎？\n\n按「取消」會為這個帳號建立全新的空白帳本。`,
          );
          if (!ok) {
            try {
              localStorage.setItem(
                'ledger.local.preGoogleBackup.' + Date.now(),
                JSON.stringify(before),
              );
            } catch (e) {}
            seed = freshUserLedger();
          }
        }
        persistLedgerSnapshot(seed);
        writeSyncCache({
          data: deepClone(seed),
          dirty: true,
          base: null,
          localRevision: 0,
          user: GOOGLE_SYNC.user,
        });
      }
    }
    GOOGLE_SYNC.suspend = true;
    save(GOOGLE_SYNC.LOCAL_OWNER_KEY, GOOGLE_SYNC.userKey);
    GOOGLE_SYNC.suspend = false;
    await performCloudSync();
    renderCloudPanel();
    renderFirstRunBanner();
    toast('已連線到自己的 Google Drive');
  } catch (e) {
    setCloudStatus(GOOGLE_SYNC.mode === 'google' ? 'auth' : 'local', e.message);
    toast(e.message);
    renderCloudPanel();
  }
}
function switchLocalMode() {
  GOOGLE_SYNC.mode = 'local';
  GOOGLE_SYNC.suspend = true;
  save(GOOGLE_SYNC.MODE_KEY, 'local');
  GOOGLE_SYNC.suspend = false;
  setCloudStatus('local', '');
  renderCloudPanel();
  toast('已切換為單機模式；目前資料保留在此裝置');
}
function clearGoogleDeviceCache() {
  if (
    !confirm(
      '登出後會把這個帳號的帳本從目前畫面移除；雲端資料仍保留在你的 Google Drive。確定登出？',
    )
  )
    return;
  const k = syncCacheKey();
  if (k) {
    const c = readSyncCache() || {};
    writeSyncCache({
      ...c,
      data: packLedger(),
      user: GOOGLE_SYNC.user,
      localRevision: GOOGLE_SYNC.localRevision,
    });
  }
  try {
    sessionStorage.removeItem(GOOGLE_SYNC.SESSION_KEY);
  } catch (e) {}
  GOOGLE_SYNC.token = null;
  GOOGLE_SYNC.expiresAt = 0;
  GOOGLE_SYNC.user = null;
  GOOGLE_SYNC.userKey = null;
  GOOGLE_SYNC.file = null;
  GOOGLE_SYNC.mode = 'local';
  GOOGLE_SYNC.suspend = true;
  try {
    localStorage.removeItem(GOOGLE_SYNC.USER_KEY);
    localStorage.removeItem(GOOGLE_SYNC.LOCAL_OWNER_KEY);
    localStorage.setItem(GOOGLE_SYNC.MODE_KEY, JSON.stringify('local'));
  } catch (e) {}
  persistLedgerSnapshot(freshUserLedger());
  GOOGLE_SYNC.suspend = false;
  setCloudStatus('local', '');
  renderCloudPanel();
  renderFirstRunBanner();
  toast('已登出；此帳號雲端資料未刪除');
}
function renderCloudPanel() {
  const box = $('#cloudPanel');
  if (!box) return;
  const v = cloudStatusView();
  if (GOOGLE_SYNC.mode === 'google') {
    box.innerHTML = `<div class="card"><h2>☁ Google Drive</h2><div class="storage-account">${esc(GOOGLE_SYNC.user?.emailAddress || GOOGLE_SYNC.user?.displayName || 'Google 帳號')}</div><div class="storage-status-line">${esc(v.text)}${GOOGLE_SYNC.detail ? ' · ' + esc(GOOGLE_SYNC.detail) : ''}</div><div class="storage-actions"><button class="primary" id="cloudSyncNow">${tokenUsable() ? '立即同步' : '恢復同步'}</button><button id="cloudReconnect">重新選擇帳號</button><button id="cloudSwitchLocal">切換單機</button><button id="cloudClearCache">登出此帳號</button></div><div class="storage-help">你的帳本只同步到目前登入帳號的 Google Drive App Data。其他使用者登入自己的帳號後會得到完全獨立的帳本。Google Finance 價格只使用 App 自己建立的行情試算表；不要求讀取整個雲端硬碟。</div></div>`;
    $('#cloudSyncNow').onclick = () =>
      tokenUsable()
        ? performCloudSync()
            .then(() => toast('同步完成'))
            .catch((e) => toast(e.message))
        : resumeGoogle();
    $('#cloudReconnect').onclick = connectGoogle;
    $('#cloudSwitchLocal').onclick = switchLocalMode;
    $('#cloudClearCache').onclick = clearGoogleDeviceCache;
  } else {
    box.innerHTML = `<div class="card"><h2>💻 單機模式</h2><div class="storage-status-line">資料目前只存在這台裝置的瀏覽器。</div><div class="storage-actions"><button class="primary" id="cloudConnect">白名單 Google 登入</button></div><div class="storage-help">白名單使用者登入 Google 後，帳本會同步到自己的 <b>Drive App Data</b>，並開啟 Places／Vision／Google Finance。非白名單帳號仍可使用單機基本功能，不需要任何 API 金鑰。</div></div>`;
    $('#cloudConnect').onclick = connectGoogle;
  }
}
function openCloudSheet() {
  renderCloudPanel();
  $('#cloudBackdrop').classList.add('show');
  $('#cloudSheet').classList.add('show');
}
function closeCloudSheet() {
  $('#cloudBackdrop').classList.remove('show');
  $('#cloudSheet').classList.remove('show');
}
$('#cloudPill').onclick = () => {
  if (GOOGLE_SYNC.mode === 'google' && !tokenUsable()) resumeGoogle();
  else openCloudSheet();
};
$('#cloudClose').onclick = closeCloudSheet;
$('#cloudBackdrop').onclick = closeCloudSheet;
$('#settingsCloudBtn').onclick = openCloudSheet;
$('#settingsSyncBtn').onclick = () =>
  tokenUsable()
    ? performCloudSync()
        .then(() => toast('同步完成'))
        .catch((e) => toast(e.message))
    : resumeGoogle();
(function initCloud() {
  restoreGoogleSession();
  if (GOOGLE_SYNC.mode === 'google' && GOOGLE_SYNC.userKey) {
    const c = readSyncCache();
    if (c?.data) {
      GOOGLE_SYNC.localRevision = +c.localRevision || 0;
      if (stableStringify(normalizeLedger(c.data)) !== stableStringify(packLedger()))
        persistLedgerSnapshot(c.data);
    }
    setCloudStatus(
      tokenUsable() ? 'pending' : 'auth',
      tokenUsable() ? '準備同步' : '點一下恢復同步',
    );
    if (tokenUsable()) scheduleCloudSync(500);
  } else setCloudStatus('local', '');
})();
