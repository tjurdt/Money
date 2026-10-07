import { describe, it, expect } from 'vitest';
import {
  detachRecordsFromTrips,
  applyTripTombstones,
  dailyRecordsInTripRange,
  moveRecordsToTrip,
} from '../../src/domain/scope.js';

const rec = (id, trip, date = '2026-04-10', kind = 'expense') => ({
  id,
  kind,
  date,
  total: 100,
  scope: trip ? { type: 'overseas', trip } : { type: 'daily', trip: null },
});

describe('刪除行程', () => {
  it('帳目改回日常，未受影響的帳目維持原物件', () => {
    const a = rec('a', 't1'),
      b = rec('b', 't2'),
      c = rec('c', null);
    const out = detachRecordsFromTrips([a, b, c], ['t1']);
    expect(out[0].scope).toEqual({ type: 'daily', trip: null });
    expect(out[1]).toBe(b);
    expect(out[2]).toBe(c);
  });

  it('沒有要處理的行程時原樣回傳', () => {
    const list = [rec('a', 't1')];
    expect(detachRecordsFromTrips(list, [])).toBe(list);
  });

  it('墓碑：行程被移除、帳目改回日常；不在清單內的行程保留', () => {
    const data = {
      trips: [{ id: 't1' }, { id: 't2' }],
      records: [rec('a', 't1'), rec('b', 't2')],
    };
    const out = applyTripTombstones(data, ['t1']);
    expect(out.trips.map((t) => t.id)).toEqual(['t2']);
    expect(out.records[0].scope.type).toBe('daily');
    expect(out.records[1].scope.trip).toBe('t2');
  });

  it('套用墓碑是冪等的（雲端同步每次都會再套用一次）', () => {
    const data = { trips: [{ id: 't1' }], records: [rec('a', 't1')] };
    const once = applyTripTombstones(data, ['t1']);
    expect(applyTripTombstones(once, ['t1'])).toEqual(once);
  });

  it('沒有墓碑時資料原樣回傳', () => {
    const data = { trips: [{ id: 't1' }], records: [] };
    expect(applyTripTombstones(data, undefined)).toBe(data);
  });
});

describe('新增行程時納入期間內的既有消費', () => {
  const trip = { id: 'new', kind: 'overseas', start: '2026-04-08', end: '2026-04-15' };

  it('只挑出日期區間內、屬於日常的支出與收入', () => {
    const recs = [
      rec('in', null, '2026-04-10'),
      rec('edge1', null, '2026-04-08'),
      rec('edge2', null, '2026-04-15'),
      rec('before', null, '2026-04-07'),
      rec('after', null, '2026-04-16'),
      rec('other-trip', 't9', '2026-04-10'),
      rec('inv', null, '2026-04-10', 'investment'),
      rec('settle', null, '2026-04-10', 'settlement'),
      rec('income', null, '2026-04-10', 'income'),
    ];
    expect(dailyRecordsInTripRange(recs, trip).map((r) => r.id)).toEqual([
      'in',
      'edge1',
      'edge2',
      'income',
    ]);
  });

  it('沒有完整起訖日期就不做', () => {
    const recs = [rec('a', null)];
    expect(dailyRecordsInTripRange(recs, { ...trip, end: '' })).toEqual([]);
    expect(dailyRecordsInTripRange(recs, { ...trip, start: '' })).toEqual([]);
    expect(dailyRecordsInTripRange(recs, null)).toEqual([]);
  });

  it('moveRecordsToTrip 只改指定的帳目，情境類型跟著行程', () => {
    const a = rec('a', null),
      b = rec('b', null);
    const out = moveRecordsToTrip([a, b], ['a'], trip);
    expect(out[0].scope).toEqual({ type: 'overseas', trip: 'new' });
    expect(out[1]).toBe(b);
  });
});
