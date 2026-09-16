/**
 * 優惠／折扣引擎。
 *
 * 全專案邏輯最密的一塊：5 種規則型別、疊加與擇優兩種套用模式、
 * 門檻與上限、覆寫實付金額、以及把折扣按比例攤回各品項。
 * 純函式：不碰 DOM、不讀全域狀態。
 *
 * 規則型別與欄位
 *   order_percent   整單打折      rate
 *   item_percent    單品打折      targetLineId, rate
 *   nth_percent     第 N 件折扣   targetLineId, nth, rate, repeat
 *   bundle_price    組合價        targetLineId, bundleQty, bundlePrice, repeat
 *   fixed           定額折抵      amount
 *
 * 共通欄位
 *   mode        'best' 表示與同組（bestGroup）互斥擇優，其餘為疊加
 *   minSpend    未達此金額不生效
 *   maxSaving   單條規則的折抵上限
 *
 * rate 採台式「保留比例」語意：8 → 八折 → 保留 0.8，折掉 0.2。
 * 輸入可寫 0.8 / 8 / 80，皆正規化為 0.8。
 *
 * 品項以 lineId 辨識；沒有品項時整筆視為單一列，lineId 為 '__order__'。
 */

/** 金額取到分，並夾在 0 以上。加 EPSILON 避免浮點進位少一分。 */
export const money2 = (n) => Math.round((Math.max(0, +n || 0) + Number.EPSILON) * 100) / 100;

export function normalizeDiscountRate(v) {
  let n = parseFloat(v);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 10 && n <= 100) n /= 100;
  else if (n > 1 && n <= 10) n /= 10;
  if (n < 0 || n > 1) return null;
  return n;
}

export function discountRateLabel(rate) {
  const p = Math.round((+rate || 0) * 1000) / 10;
  if (Math.abs(p % 10) < 0.001) return `${p / 10}折`;
  return `${p}折`;
}

export function cloneDiscounts(x) {
  return Array.isArray(x) ? x.map((d) => ({ ...d })) : [];
}

export function ruleEligible(rule, gross) {
  const min = Math.max(0, +rule?.minSpend || 0);
  return !min || gross + 1e-9 >= min;
}

export function cappedSaving(d, rule) {
  const cap = Math.max(0, +rule?.maxSaving || 0);
  return money2(cap > 0 ? Math.min(d, cap) : d);
}

export function rulePotential(rule, items, gross) {
  if (!rule || !ruleEligible(rule, gross)) return 0;
  const rate = normalizeDiscountRate(rule.rate);
  if (rule.type === 'fixed') return Math.min(gross, Math.max(0, +rule.amount || 0));
  if (rule.type === 'order_percent')
    return rate == null ? 0 : cappedSaving(gross * (1 - rate), rule);
  const it = items.find((x) => x.lineId === rule.targetLineId);
  if (!it) return 0;
  if (rule.type === 'bundle_price') {
    const n = Math.max(2, Math.floor(+rule.bundleQty || 2)),
      q = Math.max(0, +it.qty || 1),
      groups = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
      u = +it.unitPrice || 0 || (q ? it.grossPrice / q : it.grossPrice),
      d = Math.max(0, groups * (n * u - Math.max(0, +rule.bundlePrice || 0)));
    return Math.min(it.grossPrice, cappedSaving(d, rule));
  }
  if (rate == null) return 0;
  if (rule.type === 'item_percent') return cappedSaving(it.grossPrice * (1 - rate), rule);
  if (rule.type === 'nth_percent') {
    const n = Math.max(2, Math.floor(+rule.nth || 2)),
      q = Math.max(0, +it.qty || 1),
      count = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
      u = +it.unitPrice || 0 || (q ? it.grossPrice / q : it.grossPrice);
    return Math.min(it.grossPrice, cappedSaving(count * u * (1 - rate), rule));
  }
  return 0;
}

export function allocateDiscount(lines, amount) {
  let left = Math.min(
    lines.reduce((s, x) => s + x.net, 0),
    Math.max(0, amount || 0),
  );
  const total = lines.reduce((s, x) => s + x.net, 0);
  if (!(left > 0) || !(total > 0)) return 0;
  let applied = 0;
  const positive = lines.filter((x) => x.net > 0);
  positive.forEach((x, i) => {
    const d =
      i === positive.length - 1
        ? Math.min(x.net, left)
        : Math.min(x.net, money2(amount * (x.net / total)));
    x.net = money2(x.net - d);
    left = money2(left - d);
    applied = money2(applied + d);
  });
  return applied;
}

export function proportionalNetByLine(baseItems, gross, target) {
  const out = {};
  if (!baseItems.length) {
    out.__order__ = money2(target);
    return out;
  }
  const ratio = gross > 0 ? Math.max(0, target) / gross : 0;
  let left = money2(target);
  baseItems.forEach((x, i) => {
    const v = i === baseItems.length - 1 ? left : money2((+x.grossPrice || 0) * ratio);
    out[x.lineId] = Math.max(0, v);
    left = money2(left - v);
  });
  return out;
}

export function runDiscountRules(baseItems, gross, activeRules) {
  const lines = baseItems.length
      ? baseItems.map((x) => ({ ...x, net: money2(x.grossPrice) }))
      : [
          {
            lineId: '__order__',
            name: '整單',
            grossPrice: gross,
            net: gross,
            qty: 1,
            unitPrice: gross,
          },
        ],
    priority = { bundle_price: 1, item_percent: 2, nth_percent: 3, order_percent: 4, fixed: 5 },
    savings = {};
  [...(activeRules || [])]
    .filter((r) => ruleEligible(r, gross))
    .sort(
      (a, b) =>
        (priority[a.type] || 99) - (priority[b.type] || 99) ||
        (a.createdAt || 0) - (b.createdAt || 0),
    )
    .forEach((rule) => {
      let d = 0,
        rate = normalizeDiscountRate(rule.rate);
      if (rule.type === 'bundle_price') {
        const x = lines.find((z) => z.lineId === rule.targetLineId);
        if (x) {
          const n = Math.max(2, Math.floor(+rule.bundleQty || 2)),
            q = Math.max(0, +x.qty || 1),
            groups = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
            effUnit = q ? x.net / q : x.net,
            target = Math.max(0, +rule.bundlePrice || 0),
            raw = Math.max(0, groups * (n * effUnit - target));
          d = Math.min(x.net, cappedSaving(raw, rule));
          x.net = money2(x.net - d);
        }
      } else if (rule.type === 'item_percent' && rate != null) {
        const x = lines.find((z) => z.lineId === rule.targetLineId);
        if (x) {
          d = cappedSaving(x.net * (1 - rate), rule);
          x.net = money2(x.net - Math.min(x.net, d));
          d = Math.min(d, x.net + d);
        }
      } else if (rule.type === 'nth_percent' && rate != null) {
        const x = lines.find((z) => z.lineId === rule.targetLineId);
        if (x) {
          const n = Math.max(2, Math.floor(+rule.nth || 2)),
            q = Math.max(0, +x.qty || 1),
            count = rule.repeat === false ? (q >= n ? 1 : 0) : Math.floor(q / n),
            effUnit = q ? x.net / q : x.net;
          d = cappedSaving(Math.min(x.net, count * effUnit * (1 - rate)), rule);
          x.net = money2(x.net - d);
        }
      } else if (rule.type === 'order_percent' && rate != null) {
        const total = lines.reduce((s, x) => s + x.net, 0);
        d = allocateDiscount(lines, cappedSaving(total * (1 - rate), rule));
      } else if (rule.type === 'fixed') {
        d = allocateDiscount(lines, Math.max(0, +rule.amount || 0));
      }
      savings[rule.id] = money2(d);
    });
  const finalTotal = money2(lines.reduce((s, x) => s + x.net, 0)),
    netByLine = {};
  lines.forEach((x) => (netByLine[x.lineId] = money2(x.net)));
  return { finalTotal, netByLine, savings };
}

export function bestRuleCombinations(groups) {
  const arr = [...groups.values()];
  let combos = [[]];
  for (const g of arr) {
    const opts = [null, ...g];
    const next = [];
    for (const c of combos) {
      for (const o of opts) {
        next.push(o ? [...c, o] : c.slice());
        if (next.length > 512) return null;
      }
    }
    combos = next;
  }
  return combos;
}

export function calculateDiscountPlan(baseItems, baseAmount, rules, overrideTotal = null) {
  const items = (baseItems || []).map((x) => ({
      ...x,
      grossPrice: money2(x.grossPrice != null ? x.grossPrice : x.price),
    })),
    gross = items.length
      ? money2(items.reduce((s, x) => s + x.grossPrice, 0))
      : money2(baseAmount || 0),
    valid = (rules || []).filter(
      (r) =>
        r &&
        ['item_percent', 'nth_percent', 'order_percent', 'fixed', 'bundle_price'].includes(r.type),
    ),
    exclusive = valid.filter((r) => r.mode === 'best'),
    stack = valid.filter((r) => r.mode !== 'best'),
    baseline = runDiscountRules(items, gross, stack),
    groups = new Map();
  exclusive.forEach((r) => {
    const g = String(r.bestGroup || 'A').trim() || 'A';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  });
  let activeBest = [],
    bestRun = baseline,
    bestFinal = baseline.finalTotal;
  const combos = bestRuleCombinations(groups);
  if (combos) {
    for (const combo of combos) {
      const q = runDiscountRules(items, gross, stack.concat(combo));
      if (q.finalTotal < bestFinal - 0.001) {
        bestFinal = q.finalTotal;
        bestRun = q;
        activeBest = combo;
      }
    }
  } else {
    for (const rs of groups.values()) {
      let chosen = null,
        chosenRun = bestRun;
      for (const r of rs) {
        const q = runDiscountRules(items, gross, stack.concat(activeBest, [r]));
        if (q.finalTotal < chosenRun.finalTotal - 0.001) {
          chosen = r;
          chosenRun = q;
        }
      }
      if (chosen) {
        activeBest.push(chosen);
        bestRun = chosenRun;
      }
    }
  }
  const active = stack.concat(activeBest),
    run = runDiscountRules(items, gross, active),
    chosenIds = activeBest.map((r) => r.id),
    candidateExtraSavings = {};
  exclusive.forEach((r) => {
    const q = runDiscountRules(items, gross, stack.concat([r]));
    candidateExtraSavings[r.id] = money2(baseline.finalTotal - q.finalTotal);
  });
  let finalTotal = run.finalTotal,
    netByLine = run.netByLine,
    overrideApplied = false,
    overrideAdjustment = 0;
  if (overrideTotal !== null && overrideTotal !== '' && Number.isFinite(+overrideTotal)) {
    const ov = Math.max(0, money2(+overrideTotal));
    if (gross <= 0 || ov <= gross + 0.001) {
      overrideApplied = true;
      overrideAdjustment = Math.round((run.finalTotal - ov) * 100) / 100;
      finalTotal = ov;
      netByLine = proportionalNetByLine(items, gross, ov);
    }
  }
  const discountTotal = money2(gross - finalTotal);
  return {
    grossTotal: gross,
    discountTotal,
    finalTotal,
    netByLine,
    savings: run.savings,
    chosenId: chosenIds[0] || null,
    chosenIds,
    candidateExtraSavings,
    overrideApplied,
    overrideAdjustment,
  };
}

export function discountRuleTitle(r) {
  const items = draftItemsForDiscount(),
    it = items.find((x) => x.lineId === r.targetLineId),
    nm = it?.name || '品項';
  if (r.label) return r.label;
  if (r.type === 'item_percent') return `${nm} ${discountRateLabel(r.rate)}`;
  if (r.type === 'nth_percent') return `${nm} · 第 ${r.nth || 2} 件 ${discountRateLabel(r.rate)}`;
  if (r.type === 'bundle_price') return `${nm} · ${r.bundleQty || 2} 件 ${nf(r.bundlePrice || 0)}`;
  if (r.type === 'order_percent') return `整單 ${discountRateLabel(r.rate)}`;
  return `現折 ${nf(r.amount || 0)}`;
}
