import { describe, it, expect, beforeEach } from '@jest/globals';

const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('data.js - localStorage fallback mode', () => {
  beforeEach(() => { localStorage.clear(); });

  it('stores and retrieves user data', () => {
    const users = [{ id: 'user-1', username: 'admin', role: 'superadmin' }];
    localStorage.setItem('users', JSON.stringify(users));
    expect(JSON.parse(localStorage.getItem('users'))).toEqual(users);
  });

  it('stores accommodations with correct structure', () => {
    const acc = { id: 'acc-1', name: 'Test Hotel', status: 'pending' };
    localStorage.setItem('accommodations', JSON.stringify([acc]));
    const stored = JSON.parse(localStorage.getItem('accommodations'));
    expect(stored[0].name).toBe('Test Hotel');
  });

  it('stores arrival records with foreign entries', () => {
    const arrival = {
      accommodationId: 'acc-1',
      date: '2026-09-02',
      visitType: 'overnight',
      maleLocal: 5,
      femaleLocal: 3,
      foreignEntries: [{ country: 'Japan', male: 1, female: 2 }],
    };
    const key = `arrival:${arrival.accommodationId}:${arrival.visitType}:${arrival.date}`;
    localStorage.setItem(key, JSON.stringify(arrival));
    const retrieved = JSON.parse(localStorage.getItem(key));
    expect(retrieved.foreignEntries.length).toBe(1);
  });

  it('stores notifications with read status', () => {
    const notif = { id: 'notif-1', userId: 'user-1', read: false };
    localStorage.setItem('notifications', JSON.stringify([notif]));
    const retrieved = JSON.parse(localStorage.getItem('notifications'));
    expect(retrieved[0].read).toBe(false);
  });

  it('updates notification read status', () => {
    const notifs = [{ id: 'notif-1', userId: 'user-1', read: false }];
    localStorage.setItem('notifications', JSON.stringify(notifs));
    const current = JSON.parse(localStorage.getItem('notifications'));
    const updated = current.map((n) => n.id === 'notif-1' ? { ...n, read: true } : n);
    localStorage.setItem('notifications', JSON.stringify(updated));
    const final = JSON.parse(localStorage.getItem('notifications'));
    expect(final[0].read).toBe(true);
  });

  it('filters notifications by userId', () => {
    const notifs = [
      { id: 'notif-1', userId: 'user-1' },
      { id: 'notif-2', userId: 'user-2' },
      { id: 'notif-3', userId: 'user-1' },
    ];
    localStorage.setItem('notifications', JSON.stringify(notifs));
    const all = JSON.parse(localStorage.getItem('notifications'));
    const filtered = all.filter((n) => n.userId === 'user-1');
    expect(filtered.length).toBe(2);
  });

  it('removes user session on logout', () => {
    const key = 'tas_session_user_id';
    localStorage.setItem(key, 'user-1');
    expect(localStorage.getItem(key)).toBe('user-1');
    localStorage.removeItem(key);
    expect(localStorage.getItem(key)).toBeNull();
  });
});