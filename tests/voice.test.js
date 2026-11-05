'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../js/voice.js');
const E = require('../js/engine.js');
const D = require('../js/data.js');

test('prices are spoken the market way', () => {
  assert.equal(V.numberWords(90), 'নব্বই');
  assert.equal(V.numberWords(350), 'তিনশো পঞ্চাশ');
  assert.equal(V.numberWords(1000), 'এক হাজার');
  assert.equal(V.numberWords(1150), 'এগারোশো পঞ্চাশ');
  assert.equal(V.numberWords(1800), 'আঠারোশো');
  assert.equal(V.numberWords(2000), 'দুই হাজার');
  assert.equal(V.numberWords(2050), 'দুই হাজার পঞ্চাশ');
  assert.equal(V.numberWords(2400), 'চব্বিশশো');
  assert.equal(V.numberWords(3550), 'তিন হাজার পাঁচশো পঞ্চাশ');
  assert.equal(V.numberWords(6400), 'ছয় হাজার চারশো');
  assert.equal(V.numberWords(12500), 'বারো হাজার পাঁচশো');
  assert.equal(V.numberWords(125000), 'এক লাখ পঁচিশ হাজার');
});

test('every spoken price is built from recorded parts that read the full number', () => {
  const pieces = new Map(V.pricePieces());
  for (const p of E.spokenPrices()) {
    const keys = V.priceKeys(p);
    for (const k of keys) assert.ok(pieces.has(k), `price ${p} needs missing part ${k}`);
    assert.equal(keys.map((k) => pieces.get(k)).join(' '), V.numberWords(p) + ' টাকা', 'price ' + p);
  }
});

test('chat lines become speakable text', () => {
  assert.equal(V.speechText('আচ্ছা যান, ৳১,৮০০ দেন।'), 'আচ্ছা যান, আঠারোশো টাকা দেন।');
  assert.equal(V.speechText('ইলিশ মাছ (১ কেজি)টা দেখো'), 'ইলিশ মাছ এক কেজি টা দেখো');
  assert.equal(V.speechText('উম্... ৳৯৮৬?'), 'উম্, নয়শো ছিয়াশি টাকা?');
  assert.equal(V.speechText('🦊 চালাক খদ্দের'), 'চালাক খদ্দের');
});

test('every vendor has a voice, and the buyer always sounds different from the vendor', () => {
  for (const v of D.vendors) {
    assert.ok(V.SPEAKERS[v.id], 'missing voice for ' + v.id);
    const buyer = V.buyerFor(v.id);
    assert.notEqual(V.SPEAKERS[buyer].gender, V.SPEAKERS[v.id].gender);
  }
});

test('every phrase a vendor can say is in that vendor\'s recording list', () => {
  const { execFileSync } = require('node:child_process');
  const jobs = JSON.parse(execFileSync('node', [require.resolve('../tools/voices/clips.js')], { stdio: ['ignore', 'pipe', 'ignore'] }));
  for (const v of D.vendors) {
    const keys = new Set(jobs.speakers[v.id].clips.map((c) => c.key));
    for (let i = 0; i < 30; i++) {
      const s = E.createGame({ itemId: D.items[i].id, vendorId: v.id, seed: 70 + i });
      let o = s.opening * 0.2;
      while (s.phase === 'haggle') {
        const lim = E.offerLimits(s);
        E.act(s, { t: 'offer', a: Math.max(lim.min, Math.min(lim.max, E.roundTo(o, lim.step))) });
        o += s.opening * 0.06;
      }
      for (const m of s.log) {
        const who = m.who === 'vendor' ? v.id : V.buyerFor(v.id);
        const own = new Set(jobs.speakers[who].clips.map((c) => c.key));
        for (const t of m.speech) {
          if (t.gap) continue;
          const ks = t.p != null ? V.priceKeys(t.p) : [V.clipKey(t)];
          for (const k of ks) assert.ok((who === v.id ? keys : own).has(k), `${who} has no recording for ${JSON.stringify(t)}`);
        }
      }
    }
  }
});

test('every line a game can produce is speakable with no digits or symbols left', () => {
  for (const v of D.vendors) {
    for (let i = 0; i < 40; i++) {
      const s = E.createGame({ itemId: D.items[i % D.items.length].id, vendorId: v.id, seed: 900 + i });
      let o = s.opening * 0.25;
      while (s.phase === 'haggle') {
        const lim = E.offerLimits(s);
        E.act(s, { t: 'offer', a: Math.max(lim.min, Math.min(lim.max, E.roundTo(o, lim.step))) });
        o += s.opening * 0.07;
      }
      for (const m of s.log) {
        const spoken = V.speechText(m.text);
        assert.ok(spoken.length > 0);
        assert.ok(!/[০-৯0-9৳]/.test(spoken), spoken);
      }
    }
  }
});

test('speaking is a no-op (and never hangs) where speech is unsupported', async () => {
  assert.equal(V.supported, false);
  await V.play([{ p: 1800 }], 'rahim');
  assert.equal(V.status(), 'unsupported');
});
