/**
 * Google / OSM 地標類型 → 本 App 的支出分類。
 *
 * 店家自動完成選到地標時，用地標的類型猜分類（便利商店 → 餐食、加油站 → 交通…）。
 * 只是「猜」：該店有歷史紀錄時以歷史為準（見 store-defaults.js），使用者自己選的更不會被覆蓋。
 *
 * 純函式：不碰 DOM、不讀全域狀態。
 */

/** 單一類型字串對應的分類；對不上回傳空字串。 */
export function placeTypeToCategory(type) {
  const t = String(type || '').toLowerCase();
  if (!t) return '';
  const inn = (arr) => arr.some((k) => t === k || t.includes(k));
  if (
    inn([
      'convenience',
      'restaurant',
      'cafe',
      'coffee',
      'bakery',
      'meal_takeaway',
      'meal_delivery',
      'fast_food',
      'food_court',
      'bar',
      'pub',
      'ice_cream',
      'deli',
      'food',
    ])
  )
    return '餐食';
  if (inn(['gas_station', 'fuel', 'parking', 'transit', 'bus_station', 'train_station', 'subway']))
    return '交通';
  if (inn(['pharmacy', 'drugstore', 'chemist', 'doctor', 'hospital', 'clinic', 'dentist']))
    return '醫療';
  if (
    inn([
      'movie',
      'cinema',
      'book',
      'fitness',
      'sports',
      'gym',
      'stadium',
      'amusement',
      'bowling',
      'karaoke',
    ])
  )
    return '娛樂';
  if (inn(['home_goods', 'furniture', 'hardware', 'laundry', 'dry_cleaning', 'florist']))
    return '居家';
  if (
    inn([
      'supermarket',
      'grocery',
      'food_store',
      'marketplace',
      'discount_store',
      'variety_store',
      'department_store',
      'shopping_mall',
    ])
  )
    return '日用品';
  return '';
}

/**
 * 一組類型（Google 的 types 陣列，主要類型排最前面）對應的分類。
 * 依序找第一個對得上的 —— 主要類型最能代表這個地方。
 * @param {string[]|string} types
 */
export function placeTypesToCategory(types) {
  const list = Array.isArray(types) ? types : [types];
  for (const t of list) {
    const c = placeTypeToCategory(t);
    if (c) return c;
  }
  return '';
}
