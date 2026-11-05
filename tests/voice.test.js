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
  assert.equal(V.numberWords(12500), 'বারো হাজার পাঁচশো');
  assert.equal(V.numberWords(125000), 'এক লাখ পঁচিশ হাজার');
});

test('chat lines become speakable text', () => {
  assert.equal(V.speechText('আচ্ছা যান, ৳১,৮০০ দেন।'), 'আচ্ছা যান, আঠারোশো টাকা দেন।');
  assert.equal(V.speechText('ইলিশ মাছ (১ কেজি)টা দেখো'), 'ইলিশ মাছ এক কেজি টা দেখো');
  assert.equal(V.speechText('উম্... ৳৯৮৬?'), 'উম্, নয়শো ছিয়াশি টাকা?');
  assert.equal(V.speechText('🦊 চালাক খদ্দের'), 'চালাক খদ্দের');
});

test('every character has a distinct voice', () => {
  const seen = new Set();
  for (const v of D.vendors) {
    assert.ok(V.PROFILES[v.id], 'missing voice profile for ' + v.id);
    const s = V.voiceSettings(v.id, null, V.PROFILES[v.id].gender);
    const key = s.pitch.toFixed(2) + '/' + s.rate.toFixed(2);
    assert.ok(!seen.has(key), v.id + ' sounds the same as another vendor');
    seen.add(key);
  }
});

test('angry lines are faster than happy ones; settings stay in range', () => {
  for (const id of Object.keys(V.PROFILES)) {
    const angry = V.voiceSettings(id, 'refuse', null);
    const happy = V.voiceSettings(id, 'deal', null);
    assert.ok(angry.rate > happy.rate);
    for (const s of [angry, happy, V.voiceSettings(id, null, 'f'), V.voiceSettings(id, null, 'm')]) {
      assert.ok(s.pitch >= 0.1 && s.pitch <= 2 && s.rate >= 0.5 && s.rate <= 1.6);
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
  await V.say('৳১,৮০০', 'rahim');
});
