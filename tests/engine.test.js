'use strict';
// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const D = require('../js/data.js');

function card(state, n) {
  const cards = state.hand.filter((id) => id !== 'walk' && !state.used[id]);
  return cards.length ? cards[(n || 0) % cards.length] : null;
}

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
      while (s.phase === 'haggle' || s.phase === 'angry') {
        if (s.phase === 'angry') { E.act(s, { t: i % 3 ? 'sorry' : 'leave' }); continue; }
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

test('insulting offers anger the vendor; one apology is allowed, then he refuses', () => {
  const s = E.createGame({ itemId: 'saree', vendorId: 'rahim', seed: 5 });
  while (s.phase === 'haggle') E.act(s, { t: 'offer', a: legal(s, 1) });
  assert.equal(s.phase, 'angry');
  const askBefore = s.ask;
  E.act(s, { t: 'sorry' });
  assert.equal(s.phase, 'haggle');
  assert.ok(s.ask >= askBefore);
  assert.throws(() => E.act(s, { t: 'sorry' }));
  while (s.phase === 'haggle') E.act(s, { t: 'offer', a: legal(s, 1) });
  assert.equal(s.phase, 'over');
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
  const k = card(s);
  E.act(s, { t: 'offer', a: legal(s, s.opening * 0.4), k });
  assert.throws(() => E.act(s, { t: 'offer', a: legal(s, s.opening * 0.42), k }));
  const missing = D.tactics.find((t) => !s.hand.includes(t.id));
  assert.throws(() => E.act(s, { t: 'offer', a: legal(s, s.opening * 0.43), k: missing.id }), 'cards outside the hand are refused');
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

test('every spoken price has a recording and every line has a speech plan', () => {
  const grid = new Set(E.spokenPrices());
  for (const v of D.vendors) {
    for (let i = 0; i < 120; i++) {
      const item = D.items[i % D.items.length];
      const s = E.createGame({ itemId: item.id, vendorId: v.id, seed: 3000 + i });
      let o = s.opening * (0.15 + (i % 5) * 0.06);
      while (s.phase === 'haggle' || s.phase === 'walked' || s.phase === 'angry') {
        if (s.phase === 'walked') { E.act(s, { t: 'back' }); continue; }
        if (s.phase === 'angry') { E.act(s, { t: 'sorry' }); continue; }
        if (s.round === 2 && !s.used.walk) E.act(s, { t: 'walk' });
        else E.act(s, { t: 'offer', a: legal(s, o), k: s.round % 2 ? card(s, i) : null });
        o += s.opening * 0.05;
      }
      if (s.phase === 'final') E.act(s, { t: 'accept' });
      for (const m of s.log) {
        assert.ok(m.speech.length > 0, 'no speech for: ' + m.text);
        for (const t of m.speech) {
          if ('p' in t) assert.ok(grid.has(t.p), `price ${t.p} not on the recorded grid (${v.id})`);
          if ('s' in t) assert.ok(!/[{}0-9০-৯৳]/.test(t.s), 'unspeakable phrase: ' + t.s);
          if ('i' in t) assert.equal(t.i, item.id);
        }
      }
    }
  }
});

test('templates never glue a placeholder to a suffix (it would sound broken when stitched)', () => {
  const all = [];
  for (const v of D.vendors) for (const k in v.lines) all.push(...v.lines[k]);
  for (const k in D.lines) all.push(...D.lines[k]);
  for (const k in D.player) all.push(...[].concat(D.player[k]));
  for (const t of all) assert.ok(!/\{(price|offer|prev|item)\}[-ঀ-৿]/.test(t), t);
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

test('every excuse card works with every vendor and has its lines', () => {
  for (const v of D.vendors) {
    for (const t of D.tactics.filter((x) => x.id !== 'walk')) {
      let s = null;
      for (let seed = 1; seed < 400 && !s; seed++) {
        const g = E.createGame({ itemId: 'panjabi', vendorId: v.id, seed });
        if (g.hand.includes(t.id)) s = g;
      }
      assert.ok(s, `${t.id} never dealt for ${v.id}`);
      E.act(s, { t: 'offer', a: legal(s, s.floor * 0.95), k: t.id });
      const reply = s.log[s.log.length - 1];
      assert.equal(reply.who, 'vendor');
      assert.ok(!/\{\w+\}/.test(reply.text) && reply.text.length > 3, `${v.id}/${t.id}: ${reply.text}`);
      assert.ok(D.player[t.id], 'buyer line for ' + t.id);
    }
  }
});

test('a hand has 9 different cards including the walk-away', () => {
  for (let seed = 1; seed < 50; seed++) {
    const s = E.createGame({ itemId: 'panjabi', vendorId: 'suman', seed });
    assert.equal(s.hand.length, E.HAND_SIZE);
    assert.equal(new Set(s.hand).size, s.hand.length);
    assert.ok(s.hand.includes('walk'));
  }
});

test('no dialogue line is left with an unfilled placeholder', () => {
  for (const v of D.vendors) {
    for (let i = 0; i < 60; i++) {
      const s = E.createGame({ itemId: D.items[i % D.items.length].id, vendorId: v.id, seed: 500 + i });
      let o = s.opening * 0.2;
      while (s.phase === 'haggle' || s.phase === 'angry') {
        if (s.phase === 'angry') { E.act(s, { t: 'sorry' }); continue; }
        if (s.round === 2 && !s.used.walk) E.act(s, { t: 'walk' });
        else E.act(s, { t: 'offer', a: legal(s, o), k: card(s, i + s.round) });
        o += s.opening * 0.06;
      }
      if (s.phase === 'walked') E.act(s, { t: 'back' });
      for (const m of s.log) assert.ok(!/\{\w+\}/.test(m.text), `${v.id}: ${m.text}`);
    }
  }
});

test('own excuses are matched to the card they resemble', () => {
  assert.equal(E.classifyReason('bundu der anbo'), 'friends');
  assert.equal(E.classifyReason('আমার বন্ধুদের নিয়ে আসবো'), 'friends');
  assert.equal(E.classifyReason('ami student vai'), 'student');
  assert.equal(E.classifyReason('পকেটে টাকা নাই'), 'budget');
  assert.equal(E.classifyReason('pasher dokane 300 bolse'), 'competitor');
  assert.equal(E.classifyReason('এইখানে ছেঁড়া'), 'defect');
  assert.equal(E.classifyReason('আমার বিয়ে সামনে'), 'gift'); // য় written as য + ়
  assert.equal(E.classifyReason('আমার বিয়ে সামনে'), 'gift'); // precomposed য়
  assert.equal(E.classifyReason('আজকে আমার মন খারাপ'), null);
});

test('an own excuse is spoken, reacted to, used up and replayable', () => {
  const setup = { mode: 'practice', itemId: 'panjabi', vendorId: 'nasima', seed: 7 };
  const s = E.createGame(setup);
  const a1 = { t: 'offer', a: legal(s, s.ask * 0.7), k: 'custom', x: '  bundu der   anbo ' };
  E.act(s, a1);
  const buyer = s.log.filter((m) => m.who === 'buyer').pop();
  assert.match(buyer.text, /^bundu der anbo, /);
  assert.ok(buyer.speech.some((p) => p.p) && !buyer.speech.some((p) => p.s && /bundu/.test(p.s)));
  assert.equal(s.used.friends, true, 'matched card counts as used');
  const vendor = s.log.filter((m) => m.who === 'vendor').pop();
  assert.ok(D.lines.friends.concat(D.lines.friendsMeh).some((l) => vendor.text.startsWith(l.split('{')[0].trim())), vendor.text);

  // same excuse again falls flat, a new one gets the general reaction
  if (s.phase === 'haggle') E.act(s, { t: 'offer', a: legal(s, s.ask * 0.85), k: 'custom', x: 'বন্ধুদের পাঠাবো' });
  if (s.phase === 'haggle') E.act(s, { t: 'offer', a: legal(s, s.ask * 0.9), k: 'custom', x: 'মন খারাপ আজকে' });
  if (s.phase === 'haggle') {
    assert.equal(s.customUsed, 3);
    assert.throws(() => E.act(s, { t: 'offer', a: legal(s, s.ask * 0.95), k: 'custom', x: 'আরেকটা কারণ' }));
  }
  const again = E.replay(setup, s.actions);
  assert.deepEqual(again.log, s.log);
});

test('own excuses must be a sensible length', () => {
  const s = E.createGame({ mode: 'practice', itemId: 'panjabi', vendorId: 'tutul', seed: 3 });
  assert.throws(() => E.act(s, { t: 'offer', a: legal(s, s.ask * 0.7), k: 'custom', x: ' a ' }));
  assert.throws(() => E.act(s, { t: 'offer', a: legal(s, s.ask * 0.7), k: 'custom', x: 'x'.repeat(81) }));
  assert.equal(s.round, 0);
  assert.equal(s.customUsed, 0);
});
