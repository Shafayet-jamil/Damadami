/* দামাদামি — character voices.
 *
 * Uses the browser's built-in speech synthesis with a Bangla voice (bn-BD / bn-IN).
 * Each character has a voice profile (male/female voice, pitch, speed) and the mood
 * of a line (angry, closing a deal) shifts it a little. Prices are turned into the
 * words people actually say at a stall: ৳১,৮০০ → "আঠারোশো টাকা".
 *
 * The text helpers are pure and run in Node tests; everything that touches
 * speechSynthesis is guarded so the game works silently where it is missing.
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

  function hundreds(h) {
    return UNITS[h] + 'শো'; // একশো, পাঁচশো, আঠারোশো
  }

  /* Market-style number words. 1,150 → "এগারোশো পঞ্চাশ", 2,000 → "দুই হাজার". */
  function numberWords(n) {
    n = Math.round(Math.abs(Number(n) || 0));
    if (n < 100) return UNITS[n];
    if (n < 1000) {
      const rest = n % 100;
      return hundreds(Math.floor(n / 100)) + (rest ? ' ' + UNITS[rest] : '');
    }
    if (n < 10000) {
      const h = Math.floor(n / 100);
      const rest = n % 100;
      // "আঠারোশো" style for 1,100–9,999 unless it is a round thousand (দুই হাজার, দুই হাজার পঞ্চাশ)
      if (h % 10 !== 0) return hundreds(h) + (rest ? ' ' + UNITS[rest] : '');
      return UNITS[Math.floor(n / 1000)] + ' হাজার' + (rest ? ' ' + UNITS[rest] : '');
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
  function fromBn(s) {
    return Number(String(s).replace(/,/g, '').replace(/[০-৯]/g, (d) => BN.indexOf(d)));
  }

  /* Turns a chat line into what should be spoken. */
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

  /* ---------- character voice profiles ----------
   * gender picks a male or female Bangla voice when the device has both;
   * pitch and rate give each character their own sound on any voice. */
  const PROFILES = {
    tutul:    { gender: 'm', pitch: 1.3,  rate: 1.12, label: 'তরুণ, নার্ভাস, তাড়াহুড়ো' },
    nasima:   { gender: 'f', pitch: 1.12, rate: 0.86, label: 'নরম, মায়াভরা, ধীর' },
    suman:    { gender: 'm', pitch: 1.05, rate: 1.18, label: 'চটপটে, কথার ফুলঝুরি' },
    rahim:    { gender: 'm', pitch: 0.62, rate: 0.84, label: 'ভারী গলা, গম্ভীর' },
    jamal:    { gender: 'm', pitch: 0.8,  rate: 0.9,  label: 'চাপা, এক কথার মানুষ' },
    shirin:   { gender: 'f', pitch: 1.0,  rate: 1.04, label: 'পরিষ্কার, হিসাবি' },
    buyer:    { gender: 'n', pitch: 1.0,  rate: 1.02, label: 'আপনি' },
    narrator: { gender: 'n', pitch: 1.05, rate: 0.98, label: 'ঘোষক' },
  };

  // How the mood of a line bends the voice
  const MOODS = {
    refuse: { pitch: -0.08, rate: 0.1, volume: 1 },
    warn: { pitch: -0.04, rate: 0.06, volume: 1 },
    deal: { pitch: 0.08, rate: -0.02, volume: 1 },
    final: { pitch: -0.04, rate: -0.06, volume: 1 },
  };

  function voiceSettings(speaker, kind, voiceGender) {
    const p = PROFILES[speaker] || PROFILES.buyer;
    const m = MOODS[kind] || { pitch: 0, rate: 0, volume: 1 };
    let pitch = p.pitch + m.pitch;
    // if the device lacks a voice of the right gender, push the pitch further
    if (p.gender === 'm' && voiceGender === 'f') pitch *= 0.78;
    if (p.gender === 'f' && voiceGender === 'm') pitch *= 1.3;
    return {
      pitch: Math.max(0.1, Math.min(2, pitch)),
      rate: Math.max(0.5, Math.min(1.6, p.rate + m.rate)),
      volume: m.volume,
    };
  }

  /* ---------- browser speech ---------- */
  const synth = root && root.speechSynthesis ? root.speechSynthesis : null;
  const Utterance = root && root.SpeechSynthesisUtterance ? root.SpeechSynthesisUtterance : null;
  const supported = !!(synth && Utterance);

  const MALE = /\bmale\b|pradeep|bashkar|\bbnm\b|-bnm-|\bman\b/i;
  const FEMALE = /female|nabanita|tanishaa|\bbnf\b|-bnf-|woman/i;
  function genderOf(v) {
    if (!v) return null;
    if (FEMALE.test(v.name)) return 'f';
    if (MALE.test(v.name)) return 'm';
    return null;
  }

  let voices = { any: null, m: null, f: null, list: [] };
  function refreshVoices() {
    if (!supported) return voices;
    const list = synth.getVoices().filter((v) => /^bn([-_]|$)/i.test(v.lang || ''));
    const score = (v) => (/bd/i.test(v.lang) ? 4 : 0) + (/natural|online|neural|network/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
    list.sort((a, b) => score(b) - score(a));
    voices = {
      list,
      any: list[0] || null,
      m: list.find((v) => genderOf(v) === 'm') || null,
      f: list.find((v) => genderOf(v) === 'f') || null,
    };
    return voices;
  }
  if (supported) {
    refreshVoices();
    try { synth.addEventListener('voiceschanged', refreshVoices); } catch (e) { synth.onvoiceschanged = refreshVoices; }
  }

  let enabled = true;
  let current = null; // { resolve, timer }

  let characterVoice = null; // voice of the vendor currently talking
  function pickVoice(speaker) {
    const g = (PROFILES[speaker] || PROFILES.buyer).gender;
    if (g === 'm') return (characterVoice = voices.m || voices.any);
    if (g === 'f') return (characterVoice = voices.f || voices.any);
    // the buyer and the announcer use a different voice from the vendor, so the sides sound apart
    return voices.list.find((v) => v !== characterVoice) || voices.any;
  }

  function finishCurrent() {
    if (!current) return;
    const c = current;
    current = null;
    clearTimeout(c.timer);
    c.resolve();
  }

  /* Speaks one line; resolves when it ends, is skipped, or a safety timeout passes.
   * `force` plays it even while voices are switched off (used for samples). */
  function say(text, speaker, kind, force) {
    return new Promise((resolve) => {
      if ((!enabled && !force) || !supported) return resolve();
      if (!voices.any) refreshVoices();
      const voice = pickVoice(speaker);
      const words = speechText(text);
      if (!voice || !words) return resolve();
      finishCurrent();
      try { synth.cancel(); } catch (e) { /* ignore */ }
      const s = voiceSettings(speaker, kind, genderOf(voice));
      const u = new Utterance(words);
      u.voice = voice;
      u.lang = voice.lang;
      u.pitch = s.pitch;
      u.rate = s.rate;
      u.volume = s.volume;
      // some engines never fire `end`; don't let the game hang on them
      const timer = setTimeout(finishCurrent, Math.max(2500, (words.length * 95) / s.rate) + 1500);
      current = { resolve, timer };
      u.onend = finishCurrent;
      u.onerror = finishCurrent;
      try { synth.speak(u); } catch (e) { finishCurrent(); }
    });
  }

  function stop() {
    if (supported) { try { synth.cancel(); } catch (e) { /* ignore */ } }
    finishCurrent();
  }

  return {
    numberWords,
    speechText,
    voiceSettings,
    PROFILES,
    supported,
    say,
    stop,
    skip: stop,
    isSpeaking: () => !!current,
    setEnabled(on) { enabled = !!on; if (!enabled) stop(); },
    isEnabled: () => enabled,
    hasBangla: () => { if (supported && !voices.any) refreshVoices(); return !!voices.any; },
    voiceInfo() {
      if (supported && !voices.any) refreshVoices();
      return voices.list.map((v) => ({ name: v.name, lang: v.lang, gender: genderOf(v) }));
    },
  };
});
