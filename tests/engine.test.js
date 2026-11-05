'use strict';
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/data.js');

function legal(state, x) {
  const lim = E.offerLimits(state);
  return Math.max(lim.min, Math.min(lim.max, E.roundTo(x, lim.step)));
}

test('Bangla digits and taka formatting', () => {
  assert.equal(E.bn(2026), '২০২৬');
  assert.equal(E.taka(1800), '৳১,৮০০');
  assert.equal(E.taka(125000), '৳১,২৫,০০০');
});

test('daily deal numbering follows the Dhaka calendar', () => {
  // 5 Nov 2026, 00:30 in Dhaka is 4 Nov 18:30 UTC
  assert.equal(E.dayNumber(Date.UTC(2026, 10, 4, 18, 30)), 1);
  assert.equal(E.dayNumber(Date.UTC(2026, 10, 4, 17, 59)), 1); // before launch clamps to #1
  assert.equal(E.dayNumber(Date.UTC(2026, 10, 5, 18, 0)), 2);
  assert.equal(E.msToNextDay(Date.UTC(2026, 10, 5, 17, 0)), 3600 * 1000);
});

test('daily setup is identical for everyone and changes day to day', () => {
  assert.deepEqual(E.dailySetup(42), E.dailySetup(42));
  for (let d = 2; d < 200; d++) {
    const a = E.dailySetup(d - 1);
    const b = E.dailySetup(d);
    assert.notEqual(a.itemId === b.itemId && a.vendorId === b.vendorId, true, 'day ' + d + ' repeats');
  }
});

test('the same setup and actions replay to the same game', () => {
  const setup = E.dailySetup(7);
  const s1 = E.createGame(setup);
  E.act(s1, { t: 'offer', a: legal(s1, s1.opening * 0.3) });
  E.act(s1, { t: 'offer', a: legal(s1, s1.opening * 0.35), k: 'flatter' });
  const s2 = E.replay(setup, s1.actions);
  assert.deepEqual(s2.log, s1.log);
  assert.equal(s2.ask, s1.ask);
  assert.equal(s2.patience, s1.patience);
});

test('a deal is never below the secret floor, across many games', () => {
  for (const v of D.vendors) {
    for (let i = 0; i < 150; i++) {
      const s = E.createGame({ itemId: D.items[i % D.items.length].id, vendorId: v.id, seed: i + 1 });
      let o = s.opening * (0.2 + (i % 7) * 0.05);
      while (s.phase === 'haggle') {
        if (s.round === 3 && !s.used.walk && i % 2) E.act(s, { t: 'walk' });
        else E.act(s, { t: 'offer', a: legal(s, o) });
        o += s.opening * 0.04;
      }
      if (s.phase === 'walked') E.act(s, { t: 'leave' });
      if (s.phase === 'final') E.act(s, { t: 'accept' });
      assert.equal(s.phase, 'over');
      if (s.outcome === 'deal') assert.ok(s.paid >= s.floor, `${v.id} sold at ${s.paid} below floor ${s.floor}`);
      assert.ok(s.round <= E.MAX_ROUNDS + 1);
    }
  }
});

test('asks only ever go down, except after walking back in shame', () => {
  const s = E.createGame({ itemId: 'panjabi', vendorId: 'suman', seed: 99 });
  let prevAsk = s.ask;
  let o = s.opening * 0.25;
  while (s.phase === 'haggle') {
    E.act(s, { t: 'offer', a: legal(s, o) });
    assert.ok(s.ask <= prevAsk);
    prevAsk = s.ask;
    o += s.opening * 0.03;
  }
});

test('insulting offers make the vendor refuse', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'rahim', seed: 5 });
  while (s.phase === 'haggle') E.act(s, { t: 'offer', a: legal(s, 1) });
  assert.equal(s.outcome, 'refused');
  assert.equal(E.result(s).title.id, 'none');
});

test('paying the first price earns the tourist title', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'nasima', seed: 5 });
  E.act(s, { t: 'accept' });
  const r = E.result(s);
  assert.equal(r.paid, s.opening);
  assert.equal(r.title.id, 'tourist');
});

test('walking away with an offer above his stand closes the deal', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'tutul', seed: 3 });
  E.act(s, { t: 'offer', a: legal(s, s.ask - 100) });
  if (s.phase === 'haggle') {
    assert.equal(E.act(s, { t: 'walk' }), 'won');
    assert.equal(s.outcome, 'deal');
  }
});

test('a failed bluff can be undone by walking back, at a higher price', () => {
  for (let seed = 1; seed < 50; seed++) {
    const s = E.createGame({ itemId: 'jeans', vendorId: 'suman', seed });
    E.act(s, { t: 'offer', a: legal(s, s.floor * 0.5) });
    if (s.phase !== 'haggle') continue;
    const askBefore = s.ask;
    if (E.act(s, { t: 'walk' }) !== 'failed') continue;
    assert.equal(s.phase, 'walked');
    E.act(s, { t: 'back' });
    assert.equal(s.phase, 'haggle');
    assert.ok(s.ask > askBefore);
    return;
  }
  assert.fail('no failed bluff found');
});

test('each tactic card can be used once', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'suman', seed: 8 });
  E.act(s, { t: 'offer', a: legal(s, s.opening * 0.4), k: 'flatter' });
  assert.throws(() => E.act(s, { t: 'offer', a: legal(s, s.opening * 0.42), k: 'flatter' }));
});

test('the game ends with a last price after the maximum rounds', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'suman', seed: 11 });
  let o = s.floor * 0.95;
  while (s.phase === 'haggle') E.act(s, { t: 'offer', a: legal(s, o), k: s.round === 2 ? 'flatter' : null });
  assert.ok(['final', 'over'].includes(s.phase));
  if (s.phase === 'final') {
    assert.equal(s.round, E.MAX_ROUNDS);
    E.act(s, { t: 'accept' });
    assert.equal(s.outcome, 'deal');
  }
});

test('friend challenge codes round-trip, including Bangla names', () => {
  const code = E.encodeDuel({ itemId: 'ilish', vendorId: 'jamal', opening: 3200, floor: 1450, name: 'শাফায়েত', seed: 77 });
  assert.match(code, /^DM[A-Za-z0-9_-]+$/);
  const d = E.decodeDuel(code);
  assert.deepEqual(d, { mode: 'duel', itemId: 'ilish', vendorId: 'jamal', opening: 3200, floor: 1450, name: 'শাফায়েত', seed: 77 });
  assert.deepEqual(E.decodeDuel('https://example.com/#d=' + code), d);
  assert.equal(E.decodeDuel('DMgarbage'), null);
  assert.equal(E.decodeDuel(''), null);
  const g = E.createGame(d);
  assert.equal(g.opening, 3200);
  assert.equal(g.floor, 1450);
});

test('share text has the deal number, prices and title', () => {
  const s = E.createGame(E.dailySetup(3));
  E.act(s, { t: 'accept' });
  const text = E.shareText(s, { mode: 'daily', dayNo: 3 });
  assert.match(text, /^দামাদামি #৩ /);
  assert.match(text, /ট্যুরিস্ট/);
  assert.ok(!/\{\w+\}/.test(text));
});

test('Bangla possessives', () => {
  assert.equal(E.possessive('নাসিমা খালা'), 'নাসিমা খালার');
  assert.equal(E.possessive('শাফায়েত'), 'শাফায়েতের');
  assert.equal(E.possessive('সুমন ভাই'), 'সুমন ভাইয়ের');
  assert.equal(E.possessive('Nahid'), 'Nahid-এর');
});

test('a vendor never repeats the same counter line back to back', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'nasima', seed: 4 });
  let o = s.opening * 0.4;
  while (s.phase === 'haggle') { E.act(s, { t: 'offer', a: legal(s, o) }); o += s.opening * 0.02; }
  const vendorLines = s.log.filter((m) => m.who === 'vendor').map((m) => m.text);
  for (let i = 1; i < vendorLines.length; i++) assert.notEqual(vendorLines[i], vendorLines[i - 1]);
});

test('no dialogue line is left with an unfilled placeholder', () => {
  for (const v of D.vendors) {
    for (let i = 0; i < 60; i++) {
      const s = E.createGame({ itemId: D.items[i % D.items.length].id, vendorId: v.id, seed: 500 + i });
      const cards = ['student', 'competitor', 'flatter', 'cash', 'regular'];
      let o = s.opening * 0.2;
      while (s.phase === 'haggle') {
        if (s.round === 2 && !s.used.walk) E.act(s, { t: 'walk' });
        else E.act(s, { t: 'offer', a: legal(s, o), k: cards[s.round % 5] && !s.used[cards[s.round % 5]] ? cards[s.round % 5] : null });
        o += s.opening * 0.06;
      }
      if (s.phase === 'walked') E.act(s, { t: 'back' });
      for (const m of s.log) assert.ok(!/\{\w+\}/.test(m.text), `${v.id}: ${m.text}`);
    }
  }
});
