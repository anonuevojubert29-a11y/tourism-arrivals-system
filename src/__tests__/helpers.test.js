import { describe, it, expect } from '@jest/globals';
import {
  uid,
  todayStr,
  daysAgoStr,
  fmt,
  emptyRecord,
  computeTotals,
  COUNTRIES,
  VISIT_TYPES,
} from '../lib/helpers.js';

describe('helpers - uid generation', () => {
  it('generates unique identifiers', () => {
    const id1 = uid();
    const id2 = uid();
    expect(id1).not.toBe(id2);
  });

  it('generates base36 encoded IDs', () => {
    const id = uid();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    expect(/^[a-z0-9]+$/.test(id)).toBe(true);
  });
});

describe('helpers - date functions', () => {
  it('todayStr returns YYYY-MM-DD format', () => {
    const today = todayStr();
    expect(/^\d{4}-\d{2}-\d{2}$/.test(today)).toBe(true);
  });

  it('daysAgoStr returns date in past', () => {
    const oneWeekAgo = daysAgoStr(7);
    const today = todayStr();
    expect(oneWeekAgo).not.toBe(today);
    expect(oneWeekAgo < today).toBe(true);
  });

  it('daysAgoStr with 0 returns today', () => {
    const daysAgo0 = daysAgoStr(0);
    const today = todayStr();
    expect(daysAgo0).toBe(today);
  });

  it('daysAgoStr pads month and day with zeros', () => {
    const date = daysAgoStr(300);
    const parts = date.split('-');
    expect(parts[1].length).toBe(2);
    expect(parts[2].length).toBe(2);
  });
});

describe('helpers - number formatting', () => {
  it('fmt formats numbers with locale separators', () => {
    expect(fmt(1000)).toBe('1,000');
    expect(fmt(1000000)).toBe('1,000,000');
  });

  it('fmt returns "0" for null or undefined', () => {
    expect(fmt(null)).toBe('0');
    expect(fmt(undefined)).toBe('0');
  });

  it('fmt handles zero correctly', () => {
    expect(fmt(0)).toBe('0');
  });
});

describe('helpers - arrival records', () => {
  it('emptyRecord returns default counts', () => {
    const empty = emptyRecord();
    expect(empty.maleLocal).toBe(0);
    expect(empty.femaleLocal).toBe(0);
    expect(empty.maleDomestic).toBe(0);
    expect(empty.femaleDomestic).toBe(0);
    expect(Array.isArray(empty.foreignEntries)).toBe(true);
    expect(empty.foreignEntries.length).toBe(0);
  });
});

describe('helpers - compute totals', () => {
  it('computes totals for local visitors only', () => {
    const record = {
      maleLocal: 5,
      femaleLocal: 3,
      maleDomestic: 0,
      femaleDomestic: 0,
      foreignEntries: [],
    };
    const totals = computeTotals(record);
    expect(totals.totalLocal).toBe(8);
    expect(totals.totalDomestic).toBe(0);
    expect(totals.totalForeign).toBe(0);
    expect(totals.grandTotal).toBe(8);
  });

  it('computes totals for mixed visitor categories', () => {
    const record = {
      maleLocal: 5,
      femaleLocal: 3,
      maleDomestic: 10,
      femaleDomestic: 8,
      foreignEntries: [
        { country: 'Japan', male: 2, female: 1 },
        { country: 'USA', male: 3, female: 2 },
      ],
    };
    const totals = computeTotals(record);
    expect(totals.totalLocal).toBe(8);
    expect(totals.totalDomestic).toBe(18);
    expect(totals.totalForeign).toBe(8);
    expect(totals.totalMale).toBe(20);
    expect(totals.totalFemale).toBe(14);
    expect(totals.grandTotal).toBe(34);
  });

  it('computes gender breakdown correctly', () => {
    const record = {
      maleLocal: 5,
      femaleLocal: 3,
      maleDomestic: 4,
      femaleDomestic: 6,
      foreignEntries: [{ country: 'China', male: 10, female: 20 }],
    };
    const totals = computeTotals(record);
    expect(totals.totalMale).toBe(19);
    expect(totals.totalFemale).toBe(29);
    expect(totals.localMale).toBe(5);
    expect(totals.domesticMale).toBe(4);
    expect(totals.foreignMale).toBe(10);
  });

  it('handles missing foreignEntries gracefully', () => {
    const record = {
      maleLocal: 5,
      femaleLocal: 3,
      maleDomestic: 2,
      femaleDomestic: 1,
    };
    const totals = computeTotals(record);
    expect(totals.totalForeign).toBe(0);
    expect(totals.grandTotal).toBe(11);
  });

  it('handles non-numeric values by coercing to numbers', () => {
    const record = {
      maleLocal: '5',
      femaleLocal: '3',
      maleDomestic: 0,
      femaleDomestic: 0,
      foreignEntries: [],
    };
    const totals = computeTotals(record);
    expect(totals.totalLocal).toBe(8);
  });
});

describe('helpers - constants', () => {
  it('COUNTRIES array contains expected values', () => {
    expect(Array.isArray(COUNTRIES)).toBe(true);
    expect(COUNTRIES.length).toBeGreaterThan(40);
    expect(COUNTRIES).toContain('United States');
    expect(COUNTRIES).toContain('Japan');
    expect(COUNTRIES).toContain('Australia');
  });

  it('VISIT_TYPES has overnight and daytour', () => {
    expect(Array.isArray(VISIT_TYPES)).toBe(true);
    expect(VISIT_TYPES.length).toBe(2);
    expect(VISIT_TYPES[0].id).toBe('overnight');
    expect(VISIT_TYPES[1].id).toBe('daytour');
  });
});
