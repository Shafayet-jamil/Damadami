/* দামাদামি — UI controller. Talks to DamadamiEngine; owns the DOM, storage and timing. */
(function () {
  'use strict';
  const D = window.DamadamiData;
  const E = window.DamadamiEngine;
  const V = window.DamadamiVoice;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TOP_LEVEL = (function () {
    try { return window.top === window.self && /^https?:$/.test(location.protocol); } catch (e) { return false; }
  })();

  /* ---------- storage (best effort; the game works without it) ---------- */
  const STORE_KEY = 'damadami:v1';
  function loadStore() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { s = {}; }
    s.daily = s.daily || {};
    s.practice = s.practice || { played: 0, deals: 0, best: null };
    return s;
  }
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* storage blocked */ }
  }
  const store = loadStore();
  V.setEnabled(store.voice !== false);

  /* ---------- app state ---------- */
  let game = null; // engine state
  let ctx = null; // { mode, setup, dayNo, shopName, code, recorded }
  let selectedTactic = null;
  let busy = false;
  let rendered = 0; // log lines already on screen
  let currentScreen = 'screen-home';
  let homeDay = 0;

  const SCREENS = ['screen-home', 'screen-game', 'screen-duel'];
  function show(id) {
    V.stop();
    for (const s of SCREENS) $(s).hidden = s !== id;
    currentScreen = id;
    window.scrollTo(0, 0);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, reduceMotion ? Math.min(ms, 150) : ms));

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const pad = (n) => String(n).padStart(2, '0');
    return E.bn(pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60));
  }

  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- home ---------- */
  function renderHome() {
    const dayNo = E.dayNumber();
    homeDay = dayNo;
    const setup = E.dailySetup(dayNo);
    const item = E.itemById(setup.itemId);
    const vendor = E.vendorById(setup.vendorId);
    $('daily-no').textContent = '#' + E.bn(dayNo);
    $('daily-market').textContent = item.market;
    $('daily-item-emoji').textContent = item.emoji;
    $('daily-item-name').textContent = item.name;
    $('daily-vendor').textContent = 'দোকানে ' + vendor.name + ', ' + vendor.title + ' · ' + vendor.level;

    const foot = $('daily-foot');
    foot.textContent = '';
    const rec = store.daily[dayNo];
    if (rec && rec.done) {
      const r = E.result(E.replay(setup, rec.actions));
      const row = el('div', 'daily-done');
      const left = el('div');
      left.append(el('div', 'daily-done-title', r.title.emoji + ' ' + r.title.name));
      left.append(el('div', 'muted', r.deal ? E.taka(r.opening) + ' → ' + E.taka(r.paid) : 'আজ কেনা হয়নি'));
      const btn = el('button', 'btn btn-ghost', 'ফলাফল দেখুন');
      btn.type = 'button';
      btn.addEventListener('click', () => startDaily());
      row.append(left, btn);
      foot.append(row, el('p', 'countdown', ''));
    } else {
      const btn = el('button', 'btn btn-primary', rec && rec.actions && rec.actions.length ? 'দামাদামি চালিয়ে যান' : 'দামাদামি শুরু করুন');
      btn.type = 'button';
      btn.addEventListener('click', () => startDaily());
      foot.append(btn);
    }
    tick();
  }

  function tick() {
    const left = E.msToNextDay();
    document.querySelectorAll('.countdown').forEach((n) => { n.textContent = 'পরের দোকান খুলবে ' + clock(left) + ' পরে'; });
    const nd = $('next-deal');
    if (!nd.hidden) nd.textContent = 'পরের দৈনিক দামাদামি ' + clock(left) + ' পরে';
    if (currentScreen === 'screen-home' && E.dayNumber() !== homeDay) renderHome();
  }

  /* ---------- starting games ---------- */
  function startDaily() {
    const dayNo = E.dayNumber();
    const setup = E.dailySetup(dayNo);
    const rec = store.daily[dayNo];
    startGame(setup, { dayNo, actions: rec ? rec.actions : [] });
  }
  function startPractice() {
    startGame(E.practiceSetup(), {});
  }
  function startDuel(setup, code) {
    startGame(setup, { shopName: setup.name || '', code });
  }

  function startGame(setup, extra) {
    ctx = { mode: setup.mode, setup, dayNo: extra.dayNo || null, shopName: extra.shopName || '', code: extra.code || '', recorded: false };
    try {
      game = E.replay(setup, extra.actions || []);
    } catch (e) {
      game = E.createGame(setup); // saved actions no longer valid
    }
    ctx.recorded = game.phase === 'over';
    rendered = 0;
    selectedTactic = null;
    busy = false;
    $('g-chat').textContent = '';
    renderStatic();
    renderLog(false);
    renderState();
    show('screen-game');
    if (game.phase === 'over') showResult();
    else if (!(extra.actions || []).length) greet();
  }

  // the vendor's opening line is spoken when a fresh game starts
  async function greet() {
    const node = $('g-chat').lastElementChild;
    const msg = game.log[0];
    if (!node || !msg) return;
    setBusy(true);
    await speakLine(msg, node);
    setBusy(false);
    renderState();
  }

  /* ---------- voices ---------- */
  function speakerFor(msg) {
    return msg.who === 'vendor' ? game.vendor.id : msg.who === 'buyer' ? 'buyer' : 'narrator';
  }

  async function speakLine(msg, node) {
    if (!V.isEnabled() || !V.hasBangla()) return false;
    if (node) node.classList.add('speaking');
    await V.say(msg.text, speakerFor(msg), msg.kind);
    if (node) node.classList.remove('speaking');
    return true;
  }

  function renderSoundButton() {
    const on = V.isEnabled() && V.supported;
    $('btn-sound').setAttribute('aria-pressed', String(on));
    $('btn-sound').setAttribute('aria-label', on ? 'কণ্ঠ বন্ধ করুন' : 'কণ্ঠ চালু করুন');
  }

  function toggleSound() {
    if (!V.supported) {
      toast('এই ব্রাউজারে কথা বলার সুবিধা নেই');
      return;
    }
    const on = !V.isEnabled();
    V.setEnabled(on);
    store.voice = on;
    saveStore();
    renderSoundButton();
    if (on && !V.hasBangla()) toast('এই ডিভাইসে বাংলা কণ্ঠ পাওয়া যায়নি। "?" চেপে দেখুন কীভাবে যোগ করবেন');
    else toast(on ? 'চরিত্রদের কণ্ঠ চালু' : 'কণ্ঠ বন্ধ');
  }

  function sampleLine(vendor) {
    return vendor.lines.greet[0]
      .replace(/\{item\}/g, 'পাঞ্জাবি')
      .replace(/\{price\}/g, '৳১,৮০০')
      .replace(/\{addr\}/g, vendor.addr);
  }

  function fillVoices() {
    const ul = $('help-voices');
    const people = D.vendors.map((v) => ({ id: v.id, avatar: v.avatar, name: v.name, line: sampleLine(v) }));
    people.push({ id: 'buyer', avatar: '🙋', name: 'আপনি (খদ্দের)', line: D.player.student.replace('{price}', '৳৯০০') });
    for (const p of people) {
      const li = el('li', 'voice-row');
      const who = el('span', 'voice-who');
      who.append(el('strong', null, p.name), el('span', null, V.PROFILES[p.id].label));
      const btn = el('button', 'voice-play', '▶');
      btn.type = 'button';
      btn.setAttribute('aria-label', p.name + '-এর কণ্ঠ শুনুন');
      btn.addEventListener('click', () => {
        if (!V.hasBangla()) { voiceStatus(); return; }
        V.say(p.line, p.id, null, true); // samples play even when voices are switched off
      });
      li.append(el('span', 'voice-avatar', p.avatar), who, btn);
      ul.append(li);
    }
  }

  function voiceStatus() {
    const box = $('voice-status');
    if (!V.supported) {
      box.textContent = 'এই ব্রাউজারে কথা বলার সুবিধা নেই। Chrome বা Edge দিয়ে খুলে দেখুন।';
    } else if (V.hasBangla()) {
      const names = V.voiceInfo().map((v) => v.name).slice(0, 3).join(', ');
      box.textContent = 'এই ডিভাইসের বাংলা কণ্ঠ: ' + names;
    } else {
      box.textContent =
        'এই ডিভাইসে বাংলা কণ্ঠ পাওয়া যায়নি, তাই কথা শোনা যাবে না। ' +
        'Android: সেটিংস → টেক্সট-টু-স্পিচ → Google → বাংলা ভয়েস ডাউনলোড করুন। ' +
        'Windows: Settings → Time & Language → Speech → Add voices → বাংলা। ' +
        'Microsoft Edge ব্রাউজারে সাধারণত বাংলা কণ্ঠ আগে থেকেই থাকে।';
    }
  }

  /* ---------- game rendering ---------- */
  function renderStatic() {
    const { item, vendor } = game;
    $('g-market').textContent = item.market;
    $('g-avatar').textContent = vendor.avatar;
    $('g-vendor-name').textContent = vendor.name;
    const lvl = $('g-level');
    lvl.textContent = vendor.level;
    lvl.dataset.level = vendor.level;
    $('g-vendor-title').textContent = vendor.title + ' · ' + vendor.blurb;
    $('g-item-emoji').textContent = item.emoji;
    $('g-item-name').textContent = item.name;
    const banner = $('duel-banner');
    if (ctx.mode === 'duel') {
      banner.hidden = false;
      banner.textContent = (ctx.shopName ? E.possessive(ctx.shopName) + ' দোকান! ' : 'বন্ধুর দোকান! ') + 'গোপন সর্বনিম্ন দামটা কত কাছে গিয়ে ধরতে পারবেন?';
    } else if (ctx.mode === 'daily') {
      banner.hidden = false;
      banner.textContent = 'দৈনিক দামাদামি #' + E.bn(ctx.dayNo) + ' · আজ সবার জন্য একই দোকান, খেলা যাবে একবার';
    } else {
      banner.hidden = true;
    }
    buildTactics();
  }

  function bubble(msg) {
    const b = el('div', 'bubble ' + msg.who, msg.text);
    if (msg.kind) b.dataset.kind = msg.kind;
    return b;
  }
  function scrollChat() {
    const c = $('g-chat');
    c.scrollTop = c.scrollHeight;
  }

  async function renderLog(animate, opts) {
    opts = opts || {};
    const chat = $('g-chat');
    while (rendered < game.log.length) {
      const msg = game.log[rendered++];
      if (animate && msg.who === 'vendor') {
        if (opts.suspense) {
          opts.suspense = false;
          await walkSuspense();
        }
        const typing = el('div', 'bubble vendor typing');
        typing.setAttribute('aria-hidden', 'true');
        typing.append(el('i'), el('i'), el('i'));
        chat.append(typing);
        scrollChat();
        await sleep(V.isEnabled() && V.hasBangla() ? 320 : 520);
        typing.remove();
      }
      const node = bubble(msg);
      chat.append(node);
      scrollChat();
      if (animate && msg.who === 'vendor') react(msg.kind);
      if (animate) {
        const spoke = await speakLine(msg, node);
        if (!spoke && msg.who === 'buyer') await sleep(180);
      }
    }
  }

  function react(kind) {
    const a = $('g-avatar');
    a.classList.remove('shake', 'happy');
    void a.offsetWidth; // restart animation
    if (kind === 'refuse' || kind === 'warn') a.classList.add('shake');
    else if (kind === 'deal') a.classList.add('happy');
  }

  async function walkSuspense() {
    const o = $('walk-overlay');
    o.hidden = false;
    try { if (navigator.vibrate) navigator.vibrate([60, 300, 60, 300, 60]); } catch (e) { /* ignore */ }
    await sleep(2300);
    o.hidden = true;
  }

  function moodFor(pct) {
    if (pct > 0.7) return ['😊', 'calm'];
    if (pct > 0.45) return ['😐', 'calm'];
    if (pct > 0.2) return ['😤', 'warn'];
    return ['🤬', 'angry'];
  }

  let lastAskShown = null;
  function renderState() {
    const g = game;
    $('g-round').textContent = 'দফা ' + E.bn(Math.min(g.round, g.maxRounds)) + '/' + E.bn(g.maxRounds);

    const pct = g.patience / g.maxPatience;
    const [face, mood] = moodFor(pct);
    $('g-face').textContent = face;
    $('g-patience').dataset.mood = mood;
    $('g-patience').setAttribute('aria-valuenow', String(Math.round(pct * 100)));
    $('g-patience-fill').style.width = Math.max(0, pct * 100) + '%';

    const askEl = $('g-ask');
    const shownAsk = g.phase === 'over' && g.outcome === 'deal' ? g.paid : g.ask;
    askEl.textContent = E.taka(shownAsk);
    if (lastAskShown !== null && lastAskShown !== shownAsk) {
      askEl.classList.remove('flip');
      void askEl.offsetWidth;
      askEl.classList.add('flip');
    }
    lastAskShown = shownAsk;
    const hist = $('g-tag-history');
    hist.textContent = '';
    const olds = g.asks.filter((a) => a !== shownAsk).slice(-3);
    for (const a of olds) hist.append(el('s', null, E.taka(a)));

    $('panel-haggle').hidden = g.phase !== 'haggle';
    $('panel-walked').hidden = g.phase !== 'walked';
    $('panel-final').hidden = g.phase !== 'final';
    $('panel-result').hidden = g.phase !== 'over';
    if (g.phase === 'final') $('final-price').textContent = E.taka(g.ask);
    if (g.phase === 'haggle') renderControls(true);
  }

  /* ---------- haggling controls ---------- */
  function buildTactics() {
    const box = $('tactics');
    box.textContent = '';
    for (const t of D.tactics) {
      const b = el('button', 'card');
      b.type = 'button';
      b.dataset.tactic = t.id;
      b.setAttribute('aria-pressed', 'false');
      b.append(el('span', 'card-icon', t.icon), el('span', 'card-name', t.name), el('span', 'card-hint', t.hint));
      b.addEventListener('click', () => {
        if (busy) return;
        selectedTactic = selectedTactic === t.id ? null : t.id;
        renderControls(false);
      });
      box.append(b);
    }
  }

  function renderControls(resetValue) {
    const g = game;
    const lim = E.offerLimits(g);
    const range = $('offer-range');
    range.min = String(lim.min);
    range.max = String(Math.max(lim.min, lim.max));
    range.step = String(lim.step);
    if (resetValue) {
      let v = g.lastOffer == null ? g.ask * 0.4 : g.lastOffer + (g.ask - g.lastOffer) * 0.15;
      v = E.roundTo(v, lim.step);
      range.value = String(Math.max(lim.min, Math.min(lim.max, v)));
    }
    const walking = selectedTactic === 'walk';
    range.disabled = walking;
    $('offer-minus').disabled = walking;
    $('offer-plus').disabled = walking;

    for (const b of $('tactics').children) {
      const id = b.dataset.tactic;
      const used = !!g.used[id];
      b.classList.toggle('used', used);
      b.disabled = used || (id === 'walk' && g.lastOffer == null);
      b.setAttribute('aria-pressed', String(selectedTactic === id));
      b.title = id === 'walk' && g.lastOffer == null ? 'আগে অন্তত একবার দাম বলুন' : '';
    }
    $('btn-accept').textContent = E.taka(g.ask) + '-তেই নিলাম';
    updateOfferLabel();
  }

  function offerValue() {
    return Number($('offer-range').value);
  }

  function updateOfferLabel() {
    const g = game;
    const range = $('offer-range');
    const walking = selectedTactic === 'walk';
    const v = walking ? g.lastOffer : offerValue();
    $('offer-value').textContent = E.taka(v);
    const min = Number(range.min);
    const max = Number(range.max);
    range.style.setProperty('--fill', (max > min ? ((offerValue() - min) / (max - min)) * 100 : 100) + '%');
    const t = D.tactics.find((x) => x.id === selectedTactic);
    const btn = $('btn-offer');
    if (walking) {
      btn.textContent = '🚶 ' + E.taka(g.lastOffer) + ' বলে হাঁটা দিন';
      $('offer-hint').textContent = 'আপনার শেষ বলা দামেই হাঁটা দেবেন। ডাকবে, নাকি যেতে দেবে?';
    } else {
      btn.textContent = (t ? t.icon + ' ' : '') + E.taka(v) + ' বলুন';
      const share = Math.round((v / g.ask) * 100);
      $('offer-hint').textContent = 'চাওয়া দামের ' + E.bn(share) + '%' + (g.lastOffer != null ? ' · আগে বলেছিলেন ' + E.taka(g.lastOffer) : '');
    }
  }

  function nudge(dir) {
    const range = $('offer-range');
    const step = Number(range.step);
    const v = Math.max(Number(range.min), Math.min(Number(range.max), offerValue() + dir * step));
    range.value = String(v);
    updateOfferLabel();
  }

  function setBusy(on) {
    busy = on;
    for (const id of ['btn-offer', 'btn-accept', 'offer-range', 'offer-minus', 'offer-plus', 'btn-back', 'btn-leave-walked', 'btn-final-accept', 'btn-final-leave']) {
      $(id).disabled = on;
    }
    for (const b of $('tactics').children) if (on) b.disabled = true;
  }

  async function doAction(action) {
    if (busy || !game) return;
    setBusy(true);
    try {
      E.act(game, action);
    } catch (e) {
      setBusy(false);
      renderState();
      toast('এই চালটা এখন দেওয়া যাবে না।');
      return;
    }
    selectedTactic = null;
    persist();
    await renderLog(true, { suspense: action.t === 'walk' });
    setBusy(false);
    renderState();
    if (game.phase === 'over') {
      record();
      showResult();
      const r = E.result(game);
      speakLine({ who: 'narrator', text: r.title.name + '! ' + r.title.note, kind: r.deal ? 'deal' : null }, null);
    }
  }

  function persist() {
    if (ctx.mode === 'daily') {
      store.daily[ctx.dayNo] = { actions: game.actions.slice(), done: game.phase === 'over' };
      saveStore();
    }
  }

  function record() {
    if (ctx.recorded) return;
    ctx.recorded = true;
    if (ctx.mode === 'practice') {
      const r = E.result(game);
      store.practice.played++;
      if (r.deal) store.practice.deals++;
      if (r.deal && (store.practice.best == null || r.over < store.practice.best)) store.practice.best = r.over;
      saveStore();
    }
  }

  /* ---------- result ---------- */
  function showResult() {
    const r = E.result(game);
    for (const id of ['panel-haggle', 'panel-walked', 'panel-final']) $(id).hidden = true;
    $('panel-result').hidden = false;

    $('r-kicker').textContent =
      ctx.mode === 'daily' ? 'দৈনিক দামাদামি #' + E.bn(ctx.dayNo) : ctx.mode === 'duel' ? E.possessive(ctx.shopName || 'বন্ধু') + ' চ্যালেঞ্জ' : 'অনুশীলন';
    $('r-emoji').textContent = r.title.emoji;
    $('r-title').textContent = r.title.name;
    $('r-note').textContent = r.title.note;

    const prices = $('r-prices');
    prices.textContent = '';
    if (r.deal) {
      prices.append(el('s', null, E.taka(r.opening)), el('span', null, '→'), el('span', 'paid', E.taka(r.paid)));
      prices.append(el('span', 'pct', r.saved > 0 ? E.taka(r.saved) + ' বাঁচালেন (' + E.bn(r.discountPct) + '%)' : 'এক টাকাও কমাননি'));
    } else {
      prices.append(el('span', null, game.outcome === 'refused' ? 'দোকানদার আর বেচতে রাজি না' : 'কিছু না কিনেই ফিরলেন'));
    }

    const span = r.opening - r.floor;
    $('r-scale').hidden = !r.deal;
    if (r.deal) {
      const paidMark = $('r-scale-paid');
      paidMark.style.left = '100%';
      const pos = Math.max(0, Math.min(100, ((r.paid - r.floor) / span) * 100));
      requestAnimationFrame(() => requestAnimationFrame(() => { paidMark.style.left = pos + '%'; }));
      $('r-scale-floor').textContent = 'গোপন দাম ' + E.taka(r.floor);
      $('r-scale-open').textContent = 'প্রথম দাম ' + E.taka(r.opening);
    }

    let secret;
    const whose = E.possessive(game.vendor.name);
    if (!r.deal) secret = whose + ' গোপন সর্বনিম্ন দাম ছিল ' + E.taka(r.floor) + '।';
    else if (r.overPct === 0) secret = 'অবিশ্বাস্য! একদম গোপন সর্বনিম্ন দাম ' + E.taka(r.floor) + '-এই কিনেছেন।';
    else secret = whose + ' গোপন সর্বনিম্ন দাম ছিল ' + E.taka(r.floor) + '। আপনি তার চেয়ে ' + E.bn(r.overPct) + '% বেশি দিয়েছেন।';
    $('r-secret').textContent = secret;
    $('r-row').textContent = r.row;

    $('share-fallback').hidden = true;
    const again = $('btn-again');
    again.textContent = ctx.mode === 'practice' ? 'আরেকটা দোকান' : ctx.mode === 'duel' ? 'নিজের চ্যালেঞ্জ বানান' : 'অনুশীলন করুন';
    $('next-deal').hidden = ctx.mode !== 'daily';
    tick();
  }

  function baseUrl() {
    return TOP_LEVEL ? location.origin + location.pathname : '';
  }

  function shareText() {
    return E.shareText(game, { mode: ctx.mode, dayNo: ctx.dayNo, shopName: ctx.shopName, url: baseUrl() });
  }

  function copyText(text, fallbackEl, okMsg) {
    const fallback = () => {
      fallbackEl.value = text;
      fallbackEl.hidden = false;
      fallbackEl.focus();
      fallbackEl.select();
      toast('লেখাটা সিলেক্ট করা আছে, কপি করে নিন');
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback);
      } else fallback();
    } catch (e) {
      fallback();
    }
  }

  /* ---------- duel builder ---------- */
  function openDuelBuilder() {
    const itemSel = $('duel-item');
    if (!itemSel.options.length) {
      for (const it of D.items) itemSel.append(new Option(it.emoji + ' ' + it.name, it.id));
      for (const v of D.vendors) $('duel-vendor').append(new Option(v.avatar + ' ' + v.name + ' (' + v.title + ')', v.id));
      itemSel.value = 'ilish';
      $('duel-vendor').value = 'suman';
    }
    $('duel-out').hidden = true;
    $('duel-form').hidden = false;
    setupDuelRanges();
    show('screen-duel');
  }

  function setupDuelRanges() {
    const it = E.itemById($('duel-item').value);
    const open = $('duel-open');
    const step = it.fair * 4 >= 2000 ? 50 : 10;
    open.min = String(E.roundTo(it.fair * 1.3, step));
    open.max = String(E.roundTo(it.fair * 4, step));
    open.step = String(step);
    open.value = String(E.roundTo(it.fair * 2.5, step));
    syncDuelFloor(true);
  }

  function syncDuelFloor(reset) {
    const it = E.itemById($('duel-item').value);
    const open = Number($('duel-open').value);
    const floor = $('duel-floor');
    const step = 10;
    floor.min = String(Math.max(step, E.roundTo(it.fair * 0.4, step)));
    floor.max = String(open - E.stepFor(open));
    floor.step = String(step);
    if (reset) floor.value = String(E.roundTo(it.fair * 0.9, step));
    if (Number(floor.value) > Number(floor.max)) floor.value = floor.max;
    $('duel-open-out').textContent = E.taka(open);
    $('duel-floor-out').textContent = E.taka(Number(floor.value));
    for (const r of [$('duel-open'), floor]) {
      const min = Number(r.min), max = Number(r.max);
      r.style.setProperty('--fill', (max > min ? ((Number(r.value) - min) / (max - min)) * 100 : 100) + '%');
    }
  }

  function createDuel(ev) {
    ev.preventDefault();
    const it = E.itemById($('duel-item').value);
    const name = $('duel-name').value.trim();
    const code = E.encodeDuel({
      itemId: it.id,
      vendorId: $('duel-vendor').value,
      opening: Number($('duel-open').value),
      floor: Number($('duel-floor').value),
      name,
      seed: (Math.random() * 4294967296) >>> 0,
    });
    const link = baseUrl() ? baseUrl() + '#d=' + code : '';
    const msg =
      'দামাদামি চ্যালেঞ্জ! ' + (name ? E.possessive(name) : 'আমার') + ' দোকান থেকে ' + it.emoji + ' ' + it.name +
      ' কিনে দেখাও। আমার গোপন দাম ধরতে পারবা?\n' + (link || 'কোড: ' + code);
    $('duel-code').value = msg;
    $('duel-form').hidden = true;
    $('duel-out').hidden = false;
  }

  /* ---------- dialogs ---------- */
  function openDialog(d) {
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }

  function fillHelp() {
    const tl = $('help-tactics');
    for (const t of D.tactics) {
      const li = el('li');
      li.append(el('strong', null, t.icon + ' ' + t.name + ':'), document.createTextNode(' ' + t.hint + '।'));
      tl.append(li);
    }
    const ti = $('help-titles');
    for (const t of D.titles.slice(1).reverse()) {
      const li = el('li');
      const rule = t.maxOver == null ? 'এর চেয়েও বেশি দিলে' : 'গোপন দামের ' + E.bn(Math.round(t.maxOver * 100)) + '%-এর মধ্যে';
      li.append(el('strong', null, t.emoji + ' ' + t.name + ':'), document.createTextNode(' ' + rule));
      ti.append(li);
    }
  }

  function openStats() {
    const days = Object.keys(store.daily).map(Number).filter((d) => store.daily[d] && store.daily[d].done).sort((a, b) => a - b);
    const results = {};
    for (const d of days) {
      try { results[d] = E.result(E.replay(E.dailySetup(d), store.daily[d].actions)); } catch (e) { /* skip */ }
    }
    const played = Object.keys(results).length;
    const dealDays = Object.keys(results).filter((d) => results[d].deal);
    const avg = dealDays.length ? Math.round(dealDays.reduce((s, d) => s + results[d].discountPct, 0) / dealDays.length) : 0;
    // streak = consecutive days with a deal, ending today or yesterday
    let streak = 0, best = 0, run = 0, prev = null;
    for (const d of days) {
      const ok = results[d] && results[d].deal;
      run = ok ? (prev != null && d === prev + 1 && run > 0 ? run + 1 : 1) : 0;
      best = Math.max(best, run);
      prev = d;
    }
    const today = E.dayNumber();
    const last = days[days.length - 1];
    if (last != null && last >= today - 1 && results[last] && results[last].deal) streak = run;

    const grid = $('stats-grid');
    grid.textContent = '';
    const stat = (n, label) => {
      const s = el('div', 'stat');
      s.append(el('b', null, n), el('span', null, label));
      grid.append(s);
    };
    stat(E.bn(played), 'দিন খেলেছেন');
    stat(E.bn(played ? Math.round((dealDays.length / played) * 100) : 0) + '%', 'দিন কিনতে পেরেছেন');
    stat(E.bn(streak), 'টানা দিন');
    stat(E.bn(avg) + '%', 'গড়ে কম দিয়েছেন');

    const dist = $('stats-dist');
    dist.textContent = '';
    const counts = {};
    for (const d in results) counts[results[d].title.id] = (counts[results[d].title.id] || 0) + 1;
    const maxCount = Math.max(1, ...Object.values(counts));
    for (const t of D.titles.slice().reverse()) {
      const row = el('div', 'dist-row');
      const n = counts[t.id] || 0;
      const bar = el('div', 'dist-bar');
      const fillEl = el('span', n ? null : 'zero', E.bn(n));
      if (n) fillEl.style.width = (n / maxCount) * 100 + '%';
      bar.append(fillEl);
      row.append(el('span', null, t.emoji + ' ' + t.name), bar);
      dist.append(row);
    }
    const p = store.practice;
    $('stats-note').textContent =
      'সেরা টানা: ' + E.bn(best) + ' দিন · অনুশীলনে ' + E.bn(p.played) + 'টা দোকান' +
      (p.best != null ? ', সেরা: গোপন দামের ' + E.bn(Math.round(p.best * 100)) + '% উপরে' : '');
    openDialog($('dlg-stats'));
  }

  /* ---------- wiring ---------- */
  function wire() {
    $('btn-home').addEventListener('click', () => { renderHome(); show('screen-home'); });
    $('btn-help').addEventListener('click', () => { voiceStatus(); openDialog($('dlg-help')); });
    $('btn-sound').addEventListener('click', toggleSound);
    $('g-chat').addEventListener('click', () => V.skip());
    $('dlg-help').addEventListener('close', () => V.stop());
    $('btn-stats').addEventListener('click', openStats);
    $('btn-practice').addEventListener('click', startPractice);
    $('btn-duel').addEventListener('click', openDuelBuilder);

    $('code-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      const setup = E.decodeDuel($('code-input').value);
      $('code-error').hidden = !!setup;
      if (setup) startDuel(setup, $('code-input').value.trim());
    });

    const range = $('offer-range');
    range.addEventListener('input', updateOfferLabel);
    range.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') $('btn-offer').click(); });
    $('offer-minus').addEventListener('click', () => nudge(-1));
    $('offer-plus').addEventListener('click', () => nudge(1));

    $('btn-offer').addEventListener('click', () => {
      if (selectedTactic === 'walk') doAction({ t: 'walk' });
      else doAction(selectedTactic ? { t: 'offer', a: offerValue(), k: selectedTactic } : { t: 'offer', a: offerValue() });
    });
    $('btn-accept').addEventListener('click', () => doAction({ t: 'accept' }));
    $('btn-back').addEventListener('click', () => doAction({ t: 'back' }));
    $('btn-leave-walked').addEventListener('click', () => doAction({ t: 'leave' }));
    $('btn-final-accept').addEventListener('click', () => doAction({ t: 'accept' }));
    $('btn-final-leave').addEventListener('click', () => doAction({ t: 'leave' }));

    $('btn-share').addEventListener('click', () => copyText(shareText(), $('share-fallback'), 'ফলাফল কপি হয়েছে! এখন যেকোনো জায়গায় পেস্ট করুন'));
    $('btn-again').addEventListener('click', () => {
      if (ctx.mode === 'duel') openDuelBuilder();
      else startPractice();
    });

    $('duel-item').addEventListener('change', setupDuelRanges);
    $('duel-open').addEventListener('input', () => syncDuelFloor(false));
    $('duel-floor').addEventListener('input', () => syncDuelFloor(false));
    $('duel-form').addEventListener('submit', createDuel);
    $('btn-copy-code').addEventListener('click', () => copyText($('duel-code').value, $('duel-code'), 'চ্যালেঞ্জ কপি হয়েছে! বন্ধুকে পাঠিয়ে দিন'));
    $('btn-duel-home').addEventListener('click', () => { renderHome(); show('screen-home'); });

    setInterval(tick, 1000);
  }

  function linkedDuel() {
    const s = (location.hash || '') + (location.search || '');
    return s.indexOf('DM') >= 0 ? E.decodeDuel(s) : null;
  }

  function boot(saved) {
    fillHelp();
    fillVoices();
    renderSoundButton();
    wire();
    renderHome();
    const fromLink = linkedDuel();
    if (fromLink) {
      startDuel(fromLink, '');
      try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignore */ }
    } else if (saved && saved.setup && saved.screen === 'screen-game') {
      if (saved.setup.mode === 'daily' && saved.setup.dayNo !== E.dayNumber()) show('screen-home');
      else startGame(saved.setup, { dayNo: saved.setup.dayNo, actions: saved.actions, shopName: saved.shopName });
    } else {
      show('screen-home');
    }
    if ('serviceWorker' in navigator && TOP_LEVEL && location.protocol === 'https:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  // Keep an in-progress game across live updates of the hosted page.
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    hot.snapshot(() => ({
      screen: currentScreen,
      setup: ctx ? ctx.setup : null,
      actions: game ? game.actions.slice() : [],
      shopName: ctx ? ctx.shopName : '',
    }));
  }
  if (hot && typeof hot.ready === 'function') hot.ready(boot);
  else boot(hot && hot.data ? hot.data : {});
})();
