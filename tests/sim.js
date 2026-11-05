/* Balance simulator: plays thousands of games with scripted buyer strategies and
 * prints deal rate and average score per vendor. Run: node tests/sim.js
 * Not a pass/fail test; use it when tuning vendor numbers in js/data.js.
 */
'use strict';
const E = require('../js/engine.js');
const D = require('../js/data.js');

function legal(state, x) {
  const lim = E.offerLimits(state);
  return Math.max(lim.min, Math.min(lim.max, E.roundTo(x, lim.step)));
}

const strategies = {
  // pays the first price
  tourist(state) {
    E.act(state, { t: 'accept' });
  },
  // offers 10% of the ask every round
  lowballer(state) {
    while (state.phase === 'haggle') E.act(state, { t: 'offer', a: legal(state, state.opening * 0.1) });
    if (state.phase === 'final') E.act(state, { t: 'accept' });
  },
  // the usual instinct: start at half, creep up 5% of the opening each round
  half(state) {
    let o = state.opening * 0.5;
    while (state.phase === 'haggle') {
      E.act(state, { t: 'offer', a: legal(state, o) });
      o += state.opening * 0.05;
    }
    if (state.phase === 'final') E.act(state, { t: 'accept' });
    if (state.phase === 'walked') E.act(state, { t: 'leave' });
  },
  // reads the vendor: starts low, raises slowly, watches the drops, uses cards
  smart(state) {
    let o = state.opening * 0.33;
    let lastAsk = state.ask;
    const cards = ['flatter', 'student', 'cash', 'competitor'];
    while (state.phase === 'haggle') {
      const pct = state.patience / state.maxPatience;
      let card = null;
      if (pct < 0.5 && !state.used.flatter) card = 'flatter';
      else if (state.round === 1 && !state.used.student) card = 'student';
      else if (state.round >= 3) card = cards.find((c) => !state.used[c]) || null;
      E.act(state, { t: 'offer', a: legal(state, o), k: card });
      if (state.phase !== 'haggle') break;
      const drop = (lastAsk - state.ask) / state.opening;
      lastAsk = state.ask;
      if (drop < 0.03 && !state.used.walk && state.round >= 3) {
        E.act(state, { t: 'walk' });
        continue;
      }
      o += (state.ask - o) * (pct < 0.4 ? 0.3 : 0.12);
    }
    if (state.phase === 'walked') E.act(state, { t: 'back' });
    while (state.phase === 'haggle') E.act(state, { t: 'offer', a: legal(state, (state.ask + o) / 2) });
    if (state.phase === 'final') E.act(state, { t: 'accept' });
  },
};

const N = 400;
const rows = [];
for (const v of D.vendors) {
  for (const [name, play] of Object.entries(strategies)) {
    let deals = 0, effSum = 0, rounds = 0, overSum = 0;
    const titles = {};
    for (let i = 0; i < N; i++) {
      const item = D.items[i % D.items.length];
      const state = E.createGame({ mode: 'sim', itemId: item.id, vendorId: v.id, seed: 1000 + i });
      play(state);
      const r = E.result(state);
      if (r.deal) deals++;
      effSum += r.eff;
      if (r.deal) overSum += r.over;
      rounds += r.rounds;
      titles[r.title.id] = (titles[r.title.id] || 0) + 1;
    }
    rows.push({
      vendor: v.id,
      strategy: name,
      deal: ((deals / N) * 100).toFixed(0) + '%',
      score: (effSum / N).toFixed(2),
      overFloor: deals ? ((overSum / deals) * 100).toFixed(0) + "%" : "-",
      rounds: (rounds / N).toFixed(1),
      titles: Object.entries(titles).sort((a, b) => b[1] - a[1]).map(([k, c]) => k + ':' + c).join(' '),
    });
  }
}
console.table(rows);
