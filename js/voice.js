/* দামাদামি — built-in character voices.
 *
 * Every phrase, price and item name is pre-recorded (see tools/voices) and shipped
 * with the game as one audio file per character plus voices/manifest.json, which
 * says where each clip starts and how long it is. A line is played by stitching its
 * clips together with the Web Audio API, so nothing has to be installed on the
 * player's phone.
 *
 * The text helpers (numberWords, speechText, clipKey) are pure and also used by the
 * recording builder and the Node tests.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DamadamiVoice = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* ---------- Bangla number words ---------- */
  const UNITS = (
    'শূন্য এক দুই তিন চার পাঁচ ছয় সাত আট নয় দশ এগারো বারো তেরো চৌদ্দ পনেরো ষোলো সতেরো আঠারো উনিশ ' +
    'বিশ একুশ বাইশ তেইশ চব্বিশ পঁচিশ ছাব্বিশ সাতাশ আঠাশ উনত্রিশ ত্রিশ একত্রিশ বত্রিশ তেত্রিশ চৌত্রিশ পঁয়ত্রিশ ছত্রিশ সাঁইত্রিশ আটত্রিশ উনচল্লিশ ' +
    'চল্লিশ একচল্লিশ বিয়াল্লিশ তেতাল্লিশ চুয়াল্লিশ পঁয়তাল্লিশ ছেচল্লিশ সাতচল্লিশ আটচল্লিশ উনপঞ্চাশ পঞ্চাশ একান্ন বাহান্ন তিপ্পান্ন চুয়ান্ন পঞ্চান্ন ছাপ্পান্ন সাতান্ন আটান্ন উনষাট ' +
    'ষাট একষট্টি বাষট্টি তেষট্টি চৌষট্টি পঁয়ষট্টি ছেষট্টি সাতষট্টি আটষট্টি উনসত্তর সত্তর একাত্তর বাহাত্তর তিয়াত্তর চুয়াত্তর পঁচাত্তর ছিয়াত্তর সাতাত্তর আটাত্তর উনআশি ' +
    'আশি একাশি বিরাশি তিরাশি চুরাশি পঁচাশি ছিয়াশি সাতাশি আটাশি উননব্বই নব্বই একানব্বই বিরানব্বই তিরানব্বই চুরানব্বই পঁচানব্বই ছিয়ানব্বই সাতানব্বই আটানব্বই নিরানব্বই'
  ).split(' ');

  const hundreds = (h) => UNITS[h] + 'শো'; // একশো, পাঁচশো, আঠারোশো

  /* Market-style number words. 1,150 → "এগারোশো পঞ্চাশ", 2,000 → "দুই হাজার". */
  function numberWords(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    if (n < 100) return UNITS[n];
    if (n < 1000) {
      const rest = n % 100;
      return hundreds(Math.floor(n / 100)) + (rest ? ' ' + UNITS[rest] : '');
    }
    if (n < 3000 && Math.floor(n / 100) % 10 !== 0) {
      // the stall way of saying ৳1,100–৳2,999: এগারোশো, আঠারোশো, চব্বিশশো
      const rest = n % 100;
      return hundreds(Math.floor(n / 100)) + (rest ? ' ' + UNITS[rest] : '');
    }
    if (n < 10000) {
      const rest = n % 1000;
      return UNITS[Math.floor(n / 1000)] + ' হাজার' + (rest ? ' ' + numberWords(rest) : '');
    }
    if (n < 100000) {
      const rest = n % 1000;
      return UNITS[Math.floor(n / 1000)] + ' হাজার' + (rest ? ' ' + numberWords(rest) : '');
    }
    if (n < 10000000) {
      const rest = n % 100000;
      return UNITS[Math.floor(n / 100000)] + ' লাখ' + (rest ? ' ' + numberWords(rest) : '');
    }
    return String(n);
  }

  const BN = '০১২৩৪৫৬৭৮৯';
  const fromBn = (s) => Number(String(s).replace(/,/g, '').replace(/[০-৯]/g, (d) => BN.indexOf(d)));

  /* Turns display text into words a voice can read. */
  function speechText(text) {
    return String(text)
      .replace(/৳\s?([০-৯0-9][০-৯0-9,]*)/g, (m, num) => numberWords(fromBn(num)) + ' টাকা')
      .replace(/([০-৯0-9][০-৯0-9,]*)\s?%/g, (m, num) => numberWords(fromBn(num)) + ' শতাংশ')
      .replace(/[০-৯0-9][০-৯0-9,]*/g, (m) => numberWords(fromBn(m)))
      .replace(/[()]/g, ' ')
      .replace(/\.{2,}|…/g, ', ')
      .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function hash36(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  /* Manifest key for one piece of a speech plan (prices expand via priceKeys) */
  function clipKey(tok) {
    if (tok.i != null) return 'i' + tok.i;
    if (tok.s != null) return 's' + hash36(tok.s);
    return null;
  }

  /* Prices are spoken from reusable parts so every price doesn't need its own recording:
   *   ph18 "আঠারোশো"   pH18 "আঠারোশো টাকা"   pk3 "তিন হাজার"   pK3 "তিন হাজার টাকা"   pr50 "পঞ্চাশ টাকা"
   * ৳1,150 → ph11 + pr50 ("এগারোশো | পঞ্চাশ টাকা"); ৳3,550 → pk3 + ph5 + pr50. */
  function priceKeys(n) {
    n = Math.round(n);
    if (n < 100) return ['pr' + n];
    const tail = (h, rest) => (rest ? ['ph' + h, 'pr' + rest] : ['pH' + h]);
    const h = Math.floor(n / 100);
    if (n < 3000 && h % 10 !== 0) return tail(h, n % 100);
    const th = Math.floor(n / 1000);
    const rem = n % 1000;
    if (!rem) return ['pK' + th];
    const hr = Math.floor(rem / 100);
    const rest = rem % 100;
    return ['pk' + th].concat(hr ? tail(hr, rest) : ['pr' + rest]);
  }
  /* Every price part, as [key, text] pairs, for the recording builder. Covers prices
   * up to ৳9,990 in steps of ten. */
  function pricePieces() {
    const out = [];
    for (let h = 1; h < 30; h++) {
      if (h % 10 === 0) continue;
      out.push(['ph' + h, hundreds(h)], ['pH' + h, hundreds(h) + ' টাকা']);
    }
    for (let th = 1; th <= 9; th++) out.push(['pk' + th, UNITS[th] + ' হাজার'], ['pK' + th, UNITS[th] + ' হাজার টাকা']);
    for (let r = 10; r < 100; r += 10) out.push(['pr' + r, UNITS[r] + ' টাকা']);
    return out;
  }

  /* Who sounds like what (labels shown in the help sheet; the sound itself is baked
   * into the recordings by tools/voices/clips.js). */
  const SPEAKERS = {
    tutul:    { gender: 'm', label: 'তরুণ, নার্ভাস, তাড়াহুড়ো' },
    nasima:   { gender: 'f', label: 'নরম, মায়াভরা, ধীর' },
    suman:    { gender: 'm', label: 'চটপটে, কথার ফুলঝুরি' },
    rahim:    { gender: 'm', label: 'ভারী গলা, গম্ভীর' },
    jamal:    { gender: 'm', label: 'চাপা, এক কথার মানুষ' },
    shirin:   { gender: 'f', label: 'পরিষ্কার, হিসাবি' },
    buyer_m:  { gender: 'm', label: 'আপনি (ছেলে কণ্ঠ)' },
    buyer_f:  { gender: 'f', label: 'আপনি (মেয়ে কণ্ঠ)' },
    narrator: { gender: 'f', label: 'ঘোষক' },
  };
  /* The buyer always sounds different from the vendor */
  const buyerFor = (vendorId) => ((SPEAKERS[vendorId] || {}).gender === 'f' ? 'buyer_m' : 'buyer_f');

  // the mood of a line nudges its speed (and with it, pitch)
  const MOOD_RATE = { refuse: 1.07, warn: 1.04, deal: 1.0, final: 0.97 };

  /* ---------- playback ---------- */
  const AC = root && (root.AudioContext || root.webkitAudioContext);
  const supported = !!(AC && root.fetch);

  let base = 'voices/';
  let manifest = null;
  let manifestPromise = null;
  let failed = false;
  let ctx = null;
  let out = null;
  const buffers = {}; // speaker -> Promise<AudioBuffer>
  let enabled = true;
  let current = null;

  function context() {
    if (!supported) return null;
    if (!ctx) {
      try {
        ctx = new AC();
        out = ctx.createGain();
        out.gain.value = 1;
        out.connect(ctx.destination);
      } catch (e) {
        return null;
      }
    }
    return ctx;
  }

  function loadManifest() {
    if (!supported) return Promise.resolve(null);
    if (!manifestPromise) {
      manifestPromise = fetch(base + 'manifest.json')
        .then((r) => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
        .then((m) => (manifest = m))
        .catch((e) => { failed = true; manifestPromise = null; throw e; });
    }
    return manifestPromise;
  }

  function loadSpeaker(id) {
    if (!buffers[id]) {
      buffers[id] = loadManifest()
        .then((m) => {
          const sp = m && m.speakers[id];
          if (!sp) throw new Error('no voice for ' + id);
          return fetch(base + sp.file);
        })
        .then((r) => { if (!r.ok) throw new Error('audio ' + r.status); return r.arrayBuffer(); })
        .then((data) => new Promise((resolve, reject) => {
          const c = context();
          if (!c) return reject(new Error('no audio'));
          // callback form works on older Safari too
          const p = c.decodeAudioData(data, resolve, reject);
          if (p && p.catch) p.catch(reject);
        }))
        .catch((e) => { delete buffers[id]; failed = true; throw e; });
    }
    return buffers[id];
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise((resolve) => setTimeout(() => resolve(null), ms))]);
  }

  function finish() {
    if (!current) return;
    const c = current;
    current = null;
    clearTimeout(c.timer);
    for (const n of c.nodes) { try { n.stop(); } catch (e) { /* already stopped */ } }
    c.resolve();
  }

  /* Plays a speech plan in a character's voice. Resolves when it ends or is skipped.
   * `force` plays even while voices are switched off (help-sheet samples). */
  async function play(tokens, speaker, kind, force) {
    if ((!enabled && !force) || !supported || !tokens || !tokens.length) return;
    const c = context();
    if (!c) return;
    let buf = null;
    try { buf = await withTimeout(loadSpeaker(speaker), 8000); } catch (e) { return; }
    if (!buf || (!enabled && !force)) return;
    if (c.state === 'suspended') { try { await c.resume(); } catch (e) { /* needs a tap first */ } }
    finish();

    const clips = manifest.speakers[speaker].clips;
    const rate = MOOD_RATE[kind] || 1;
    let t = c.currentTime + 0.04;
    const nodes = [];
    const keys = [];
    for (const tok of tokens) {
      if (tok.gap) keys.push(null);
      else if (tok.p != null) keys.push(...priceKeys(tok.p));
      else keys.push(clipKey(tok));
    }
    for (const key of keys) {
      if (key === null) { t += 0.2 / rate; continue; }
      const clip = clips[key];
      if (!clip) continue;
      const dur = Math.min(clip[1], buf.duration - clip[0]);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(out);
      src.start(t, clip[0], dur);
      nodes.push(src);
      t += dur / rate + 0.015;
    }
    if (!nodes.length) return;
    return new Promise((resolve) => {
      current = { nodes, resolve, timer: setTimeout(finish, (t - c.currentTime) * 1000 + 40) };
    });
  }

  function stop() {
    finish();
  }

  /* Browsers only allow sound after the player has tapped something: call on a tap. */
  function unlock() {
    const c = context();
    if (c && c.state === 'suspended') c.resume().catch(() => {});
  }

  return {
    numberWords,
    speechText,
    clipKey,
    priceKeys,
    pricePieces,
    SPEAKERS,
    PROFILES: SPEAKERS,
    buyerFor,
    supported,
    init(path) { if (path) base = path; return loadManifest().catch(() => null); },
    preload(ids) { return Promise.all(ids.map((id) => loadSpeaker(id).catch(() => null))); },
    play,
    stop,
    skip: stop,
    unlock,
    isSpeaking: () => !!current,
    setEnabled(on) { enabled = !!on; if (!enabled) stop(); },
    isEnabled: () => enabled,
    status: () => (!supported ? 'unsupported' : manifest ? 'ready' : failed ? 'failed' : 'loading'),
  };
});
