/* দামাদামি — negotiation engine.
 *
 * Pure game logic with no DOM access, so it runs in the browser and in Node tests.
 * Everything random comes from a seeded generator stored on the state, so the same
 * setup plus the same actions always gives the same game. That keeps the daily deal
 * fair (everyone faces the same vendor) and lets a game be restored by replaying
 * its action list.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./data.js') : root.DamadamiData);
  if (isNode) module.exports = api;
  else root.DamadamiEngine = api;
})(typeof self !== 'undefined' ? self : this, function (DATA) {
  'use strict';

  const EPOCH = Date.UTC(2026, 10, 5); // Dhaka date of daily deal #1
  const DHAKA_OFFSET = 6 * 3600 * 1000;
  const DAY = 24 * 3600 * 1000;
  const MAX_ROUNDS = 8;
  const BASE_COST = 6;

  /* ---------- small helpers ---------- */

  const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
  function bn(value) {
    return String(value).replace(/[0-9]/g, (d) => BN_DIGITS[d]);
  }
  function group(n) {
    // Indian digit grouping: 1,25,000
    const s = String(Math.round(Math.abs(n)));
    if (s.length <= 3) return s;
    const last3 = s.slice(-3);
    const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    return rest + ',' + last3;
  }
  function taka(n) {
    return '৳' + bn(group(n));
  }
  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function stepFor(price) {
    return price >= 2000 ? 50 : 10;
  }
  function roundTo(x, step) {
    return Math.round(x / step) * step;
  }
  function ceilTo(x, step) {
    return Math.ceil(x / step) * step;
  }
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  // mulberry32, with its state kept on `holder.rng` so it serialises with the game
  function nextRand(holder) {
    holder.rng = (holder.rng + 0x6d2b79f5) | 0;
    let t = holder.rng;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(holder, arr) {
    return arr[Math.floor(nextRand(holder) * arr.length)];
  }
  function fill(template, vars) {
    return template.replace(/\{(\w+)\}/g, (m, key) => (key in vars ? vars[key] : m));
  }

  function itemById(id) {
    return DATA.items.find((x) => x.id === id) || null;
  }
  function vendorById(id) {
    return DATA.vendors.find((x) => x.id === id) || null;
  }
  // `over` = share paid above the vendor's secret floor (0.05 = 5% above)
  function titleFor(outcome, over) {
    if (outcome !== 'deal') return DATA.titles[0];
    let best = DATA.titles[1];
    for (const t of DATA.titles) if (t.maxOver != null && over <= t.maxOver + 1e-9) best = t;
    return best;
  }

  /* ---------- dialogue ---------- */

  function vendorLine(state, key) {
    const own = state.vendor.lines && state.vendor.lines[key];
    let pool = own && own.length ? own : DATA.lines[key];
    // don't say the same sentence twice in a row
    const last = state.lastLine[key];
    if (pool.length > 1 && last) pool = pool.filter((l) => l !== last);
    const line = pick(state, pool);
    state.lastLine[key] = line;
    return line;
  }

  /* Bangla possessive: খালা → খালার, শাফায়েত → শাফায়েতের, ভাই → ভাইয়ের; Latin names → name-এর */
  function possessive(name) {
    const n = String(name || '').trim();
    if (!n) return '';
    const last = n[n.length - 1];
    if (!/[ঀ-৿]/.test(last)) return n + '-এর';
    if ('ািীুূৃেৈোৌ'.includes(last)) return n + 'র';
    if ('অআইঈউঊএঐওঔ'.includes(last)) return n + 'য়ের';
    return n + 'ের';
  }
  function vars(state, extra) {
    const out = { item: state.item.name, addr: state.vendor.addr };
    for (const k in extra) out[k] = typeof extra[k] === 'number' ? taka(extra[k]) : extra[k];
    return out;
  }
  function say(state, who, text, kind) {
    state.log.push({ who, text, kind: kind || null, round: state.round });
  }
  function vendorSays(state, keys, extra, kind) {
    const text = keys
      .filter(Boolean)
      .map((k) => fill(vendorLine(state, k), vars(state, extra)))
      .join(' ');
    say(state, 'vendor', text, kind);
  }
  function buyerSays(state, template, extra) {
    say(state, 'buyer', fill(template, vars(state, extra)));
  }

  /* ---------- setup ---------- */

  function createGame(setup) {
    const item = itemById(setup.itemId);
    const vendor = vendorById(setup.vendorId);
    if (!item || !vendor) throw new Error('Unknown item or vendor');
    const gen = { rng: setup.seed >>> 0 || 1 };

    let opening = setup.opening;
    if (!opening) {
      const raw = item.fair * lerp(vendor.markup[0], vendor.markup[1], nextRand(gen));
      opening = roundTo(raw, raw >= 500 ? 50 : 10);
    }
    let floor = setup.floor;
    if (!floor) floor = Math.round(item.fair * lerp(vendor.floorRatio[0], vendor.floorRatio[1], nextRand(gen)));
    floor = clamp(Math.round(floor), 1, opening - stepFor(opening));

    const state = {
      setup: Object.assign({}, setup),
      item,
      vendor,
      opening,
      floor,
      ask: opening,
      asks: [opening],
      patience: vendor.patience,
      maxPatience: vendor.patience,
      round: 0,
      maxRounds: MAX_ROUNDS,
      lastOffer: null,
      used: {},
      row: [],
      log: [],
      actions: [],
      phase: 'haggle', // haggle | walked | final | over
      outcome: null, // deal | refused | left
      paid: null,
      standMult: 1,
      lastLine: {},
      rng: gen.rng,
    };
    vendorSays(state, ['greet'], { price: opening });
    return state;
  }

  /* ---------- turn logic ---------- */

  function finish(state, outcome, paid) {
    state.phase = 'over';
    state.outcome = outcome;
    state.paid = outcome === 'deal' ? paid : null;
  }

  /* The vendor's "stand": the price he defends this round. It sits above his secret
   * floor and shrinks as the haggle drags on or when a tactic lands, so his asks
   * never reveal the floor directly. */
  function standPrice(state) {
    const v = state.vendor;
    const s = (v.stand != null ? v.stand : 0.3) * state.standMult * Math.max(0.12, 1 - state.round / (MAX_ROUNDS + 2));
    return state.floor + (state.opening - state.floor) * s;
  }

  function offerLimits(state) {
    const step = stepFor(state.ask);
    return {
      min: Math.max(step, roundTo(state.opening * 0.15, step)),
      max: state.ask - step,
      step,
    };
  }

  function makeOffer(state, amount, tacticId) {
    if (state.phase !== 'haggle') throw new Error('Not haggling');
    const O = Math.round(amount);
    if (!(O > 0) || O >= state.ask) throw new Error('Offer must be below the asking price');
    if (tacticId === 'walk') throw new Error('Use walkAway for the walk-away card');
    if (tacticId) {
      if (!DATA.tactics.some((t) => t.id === tacticId)) throw new Error('Unknown tactic');
      if (state.used[tacticId]) throw new Error('Tactic already used');
      state.used[tacticId] = true;
    }

    const v = state.vendor;
    const F = state.floor;
    const A = state.ask;
    const eff = tacticId ? (v.tactics[tacticId] != null ? v.tactics[tacticId] : 1) : 1;
    state.round++;
    buyerSays(state, tacticId ? DATA.player[tacticId] : pick(state, DATA.player.offer), { price: O });

    let cost = BASE_COST;
    let restore = 0;
    let concMult = 1;
    let band = v.acceptBand + 0.015 * (state.round - 1);
    let reaction = null; // at most one reaction line before the counter
    let mood = null; // secondary reaction if no tactic reaction

    const lowball = Math.max(0, (F - O) / F);
    cost += lowball * 60 * v.temper;
    if (O < F * 0.45) {
      cost += 20;
      mood = 'insult';
    } else if (O < F * 0.7) mood = 'lowball';
    if (state.lastOffer != null && O < state.lastOffer) {
      cost += 15;
      mood = 'lowerThanBefore';
    } else if (state.lastOffer === O) {
      cost += 4;
      mood = mood || 'repeat';
    }

    switch (tacticId) {
      case 'student':
        concMult *= 1 + 0.5 * eff;
        cost -= 6 * eff;
        if (eff >= 1) state.standMult *= 1 - 0.15 * Math.min(eff, 2);
        reaction = eff >= 1 ? 'student' : 'studentMeh';
        break;
      case 'competitor':
        if (O >= F * 0.8) {
          concMult *= 1 + 0.8 * eff;
          cost += 4;
          if (eff >= 1) state.standMult *= 1 - 0.2 * Math.min(eff, 1.5);
          reaction = eff >= 1 ? 'competitor' : 'competitorMeh';
        } else {
          concMult *= 0.6;
          cost += 12;
          reaction = 'competitorNo';
        }
        break;
      case 'flatter':
        restore += 16 * eff;
        concMult *= 1 + 0.15 * eff;
        reaction = eff >= 1 ? 'flatter' : 'flatterMeh';
        break;
      case 'cash':
        band += 0.07 * eff;
        reaction = eff >= 1 ? 'cash' : 'cashMeh';
        break;
      case 'regular':
        if (eff >= 1) {
          concMult *= 1 + 0.6 * eff;
          state.standMult *= 1 - 0.2 * Math.min(eff, 1.5);
          reaction = 'regular';
        } else {
          concMult *= 0.5;
          cost += 18;
          reaction = 'regularFail';
        }
        break;
    }

    cost = Math.max(2, cost);
    const before = state.patience;
    state.patience = clamp(state.patience - cost + restore, 0, state.maxPatience);
    const prev = state.lastOffer;
    state.lastOffer = O;
    const lead = reaction || mood;
    const extra = { offer: O, prev: prev == null ? O : prev };

    if (state.patience <= 0) {
      vendorSays(state, [lead, 'refuse'], extra, 'refuse');
      state.row.push('💀');
      finish(state, 'refused');
      return;
    }

    // Vendor concedes part of the gap toward max(offer, his stand price)
    const step = stepFor(A);
    const askFloor = Math.min(A, ceilTo(F, step));
    const stand = standPrice(state);
    const target = Math.max(O, stand);
    const rate = Math.min(0.85, v.concession * (O >= F ? 1.6 : 1) * concMult);
    let next = A - (A - target) * rate + (nextRand(state) - 0.5) * 0.02 * A;
    next = clamp(roundTo(next, step), askFloor, A);
    if (next >= A && A - step >= askFloor && rate > 0.05) next = A - step;

    const closeOut = O >= F && state.patience < 25;
    const deal = O >= F && (O >= next || next - O <= next * band || closeOut);
    if (deal) {
      state.ask = next;
      vendorSays(state, [lead, closeOut && !(next - O <= next * band) ? 'closeOut' : 'deal'], Object.assign({}, extra, { price: O }), 'deal');
      state.row.push('🤝');
      finish(state, 'deal', O);
      return;
    }

    const drop = (A - next) / state.opening;
    state.row.push(cost >= 20 ? '🟥' : drop >= 0.08 ? '🟩' : drop > 0 ? '🟨' : '⬜');
    if (next !== A) state.asks.push(next);
    state.ask = next;

    const counterKey = next === A ? 'hold' : next <= Math.max(askFloor, stand) * 1.06 ? 'nearFloor' : 'counter';
    const warnKey = state.patience < 30 && before >= 30 ? 'warn' : null;

    if (state.round >= MAX_ROUNDS) {
      state.phase = 'final';
      vendorSays(state, [lead, 'lastPrice'], Object.assign({}, extra, { price: next }), 'final');
      return;
    }
    vendorSays(state, [lead, counterKey, warnKey], Object.assign({}, extra, { price: next }), warnKey ? 'warn' : null);
  }

  function walkAway(state) {
    if (state.phase !== 'haggle') throw new Error('Not haggling');
    if (state.used.walk) throw new Error('Already walked away once');
    if (state.lastOffer == null) throw new Error('Make an offer before walking away');
    state.used.walk = true;
    state.round++;

    const v = state.vendor;
    const O = state.lastOffer;
    const F = state.floor;
    const eff = v.tactics.walk != null ? v.tactics.walk : 1;
    buyerSays(state, DATA.player.walk, { price: O });
    state.patience = Math.max(1, state.patience - (v.walkHurt || 0));

    const step = stepFor(state.ask);
    const counter = Math.min(state.ask, Math.max(ceilTo(F, step), O + step, roundTo(F + (state.ask - F) * 0.35, step)));
    if (O >= standPrice(state) * 0.97 || (O >= F && counter <= O)) {
      vendorSays(state, ['walkWin'], { price: O }, 'deal');
      state.row.push('🚶', '🤝');
      finish(state, 'deal', O);
      return 'won';
    }
    if (O >= F * (1 - 0.1 * eff) && state.patience > 15) {
      state.patience = Math.max(1, state.patience - 8);
      if (counter !== state.ask) state.asks.push(counter);
      state.ask = counter;
      vendorSays(state, ['walkCounter'], { price: counter });
      state.row.push('🚶');
      checkRounds(state);
      return 'counter';
    }
    state.phase = 'walked';
    vendorSays(state, ['walkFail'], {}, 'refuse');
    state.row.push('🙈');
    return 'failed';
  }

  function checkRounds(state) {
    if (state.phase === 'haggle' && state.round >= MAX_ROUNDS) {
      state.phase = 'final';
      vendorSays(state, ['lastPrice'], { price: state.ask }, 'final');
    }
  }

  function goBack(state) {
    if (state.phase !== 'walked') throw new Error('You have not walked away');
    const step = stepFor(state.ask);
    const raised = Math.min(state.opening, roundTo(state.ask * 1.12, step));
    if (raised !== state.ask) state.asks.push(raised);
    state.ask = raised;
    state.patience = Math.max(5, state.patience - 25);
    state.phase = 'haggle';
    state.returned = true;
    buyerSays(state, DATA.player.goBack, {});
    vendorSays(state, ['returnMock'], { price: raised });
    state.row.push('😳');
    checkRounds(state);
  }

  function acceptAsk(state) {
    if (state.phase !== 'haggle' && state.phase !== 'final') throw new Error('Cannot buy now');
    buyerSays(state, DATA.player.acceptAsk, { price: state.ask });
    vendorSays(state, ['acceptAsk'], { price: state.ask }, 'deal');
    state.row.push('🤝');
    finish(state, 'deal', state.ask);
  }

  function leave(state) {
    if (state.phase === 'over') throw new Error('Game is over');
    buyerSays(state, DATA.player.leave, {});
    state.row.push('🏠');
    finish(state, 'left');
  }

  /* Single entry point that records actions, so games can be saved and replayed. */
  function act(state, action) {
    let res;
    switch (action.t) {
      case 'offer': res = makeOffer(state, action.a, action.k || null); break;
      case 'walk': res = walkAway(state); break;
      case 'back': res = goBack(state); break;
      case 'accept': res = acceptAsk(state); break;
      case 'leave': res = leave(state); break;
      default: throw new Error('Unknown action ' + action.t);
    }
    state.actions.push(action);
    return res;
  }

  function replay(setup, actions) {
    const state = createGame(setup);
    for (const a of actions || []) act(state, a);
    return state;
  }

  /* ---------- results ---------- */

  function result(state) {
    const deal = state.outcome === 'deal';
    const paid = deal ? state.paid : null;
    const span = state.opening - state.floor;
    const eff = deal ? clamp((state.opening - paid) / span, 0, 1) : 0;
    const over = deal ? Math.max(0, (paid - state.floor) / state.floor) : null;
    const title = titleFor(state.outcome, over);
    return {
      over,
      overPct: deal ? Math.round(over * 100) : null,
      outcome: state.outcome,
      deal,
      paid,
      opening: state.opening,
      floor: state.floor,
      saved: deal ? state.opening - paid : 0,
      discountPct: deal ? Math.round(((state.opening - paid) / state.opening) * 100) : 0,
      eff,
      title,
      rounds: state.round,
      row: state.row.join(''),
    };
  }

  function shareText(state, ctx) {
    ctx = ctx || {};
    const r = result(state);
    const head =
      ctx.mode === 'daily'
        ? 'দামাদামি #' + bn(ctx.dayNo) + ' ' + state.item.emoji + ' ' + state.item.name
        : ctx.mode === 'duel'
          ? 'দামাদামি চ্যালেঞ্জ ' + state.item.emoji + ' ' + (ctx.shopName ? possessive(ctx.shopName) + ' দোকান' : state.item.name)
          : 'দামাদামি ' + state.item.emoji + ' ' + state.item.name;
    const price = r.deal
      ? taka(r.opening) + ' → ' + taka(r.paid) + ' (' + bn(r.discountPct) + '% কম)'
      : taka(r.opening) + ' → কেনা হয়নি';
    const out = [head, price, r.row, r.title.emoji + ' ' + r.title.name];
    if (ctx.mode === 'duel' && r.deal) out.push('গোপন দাম ছিল ' + taka(r.floor));
    if (ctx.url) out.push(ctx.url);
    return out.join('\n');
  }

  /* ---------- daily deal ---------- */

  function dayNumber(now) {
    const t = now == null ? Date.now() : now;
    return Math.max(1, Math.floor((t + DHAKA_OFFSET - EPOCH) / DAY) + 1);
  }
  function msToNextDay(now) {
    const t = (now == null ? Date.now() : now) + DHAKA_OFFSET;
    return (Math.floor(t / DAY) + 1) * DAY - t;
  }
  function dailySetup(dayNo) {
    const seed = hashStr('damadami:daily:' + dayNo);
    // avoid the same vendor or item two days running
    const prev = dayNo > 1 ? dailyPicks(dayNo - 1) : null;
    let { item, vendor } = dailyPicks(dayNo);
    if (prev && item === prev.item) item = DATA.items[(DATA.items.indexOf(item) + 7) % DATA.items.length];
    if (prev && vendor === prev.vendor) vendor = DATA.vendors[(DATA.vendors.indexOf(vendor) + 1) % DATA.vendors.length];
    return { mode: 'daily', dayNo, itemId: item.id, vendorId: vendor.id, seed };
  }
  function dailyPicks(dayNo) {
    const g = { rng: hashStr('damadami:picks:' + dayNo) };
    return { item: pick(g, DATA.items), vendor: pick(g, DATA.vendors) };
  }

  function practiceSetup(seed) {
    const s = seed == null ? (Math.random() * 4294967296) >>> 0 : seed >>> 0;
    const g = { rng: s ^ 0x9e3779b9 };
    return { mode: 'practice', itemId: pick(g, DATA.items).id, vendorId: pick(g, DATA.vendors).id, seed: s };
  }

  /* ---------- friend challenge codes ---------- */

  const KEY = 'damadami';
  function toB64Url(bytes) {
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64Url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function xor(bytes) {
    const out = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ KEY.charCodeAt(i % KEY.length) ^ (i * 31 & 255);
    return out;
  }
  function encodeDuel(d) {
    const json = JSON.stringify({ i: d.itemId, v: d.vendorId, o: d.opening, f: d.floor, n: (d.name || '').slice(0, 24), s: d.seed >>> 0 });
    return 'DM' + toB64Url(xor(new TextEncoder().encode(json)));
  }
  function decodeDuel(code) {
    try {
      // accepts a bare code, a link with #d=…, or the whole shared message
      const m = String(code || '').match(/DM[A-Za-z0-9_-]{8,}/);
      if (!m) return null;
      const s = m[0];
      const json = new TextDecoder().decode(xor(fromB64Url(s.slice(2))));
      const o = JSON.parse(json);
      const item = itemById(o.i);
      const vendor = vendorById(o.v);
      const opening = Math.round(o.o);
      const floor = Math.round(o.f);
      if (!item || !vendor || !(opening > 0) || !(floor > 0) || floor >= opening) return null;
      return { mode: 'duel', itemId: item.id, vendorId: vendor.id, opening, floor, name: String(o.n || ''), seed: o.s >>> 0 };
    } catch (e) {
      return null;
    }
  }

  return {
    MAX_ROUNDS,
    bn,
    possessive,
    taka,
    stepFor,
    roundTo,
    itemById,
    vendorById,
    createGame,
    offerLimits,
    act,
    replay,
    result,
    shareText,
    dayNumber,
    msToNextDay,
    dailySetup,
    practiceSetup,
    encodeDuel,
    decodeDuel,
    titleFor,
  };
});
