/* Lists every audio clip each character needs, straight from the game's own dialogue,
 * and writes it as a job file for build.py.
 *
 *   node tools/voices/clips.js > jobs.json
 *
 * A clip is one of: a phrase from a dialogue template (the text between placeholders),
 * a price ("আঠারোশো টাকা"), or an item name. Keys match what js/voice.js looks up.
 */
'use strict';
const D = require('../../js/data.js');
const E = require('../../js/engine.js');
const V = require('../../js/voice.js');

/* Each character = one of the two base voices + their own pitch (semitones) and speed. */
const SPEAKERS = {
  tutul:    { model: 'male',   pitch: 2.5,  tempo: 1.10 },
  nasima:   { model: 'female', pitch: -1.5, tempo: 0.90 },
  suman:    { model: 'male',   pitch: 1.0,  tempo: 1.14 },
  rahim:    { model: 'male',   pitch: -3.0, tempo: 0.86 },
  jamal:    { model: 'male',   pitch: -1.5, tempo: 0.94 },
  shirin:   { model: 'female', pitch: 1.0,  tempo: 1.04 },
  buyer_m:  { model: 'male',   pitch: 0.5,  tempo: 1.02 },
  buyer_f:  { model: 'female', pitch: 0.0,  tempo: 1.02 },
  narrator: { model: 'female', pitch: 0.5,  tempo: 0.97 },
};

function vendorTemplates(v) {
  const out = [];
  for (const key of new Set([...Object.keys(D.lines), ...Object.keys(v.lines)])) {
    const own = v.lines[key];
    out.push(...(own && own.length ? own : D.lines[key]));
  }
  return out;
}
const playerTemplates = () => Object.values(D.player).flatMap((t) => [].concat(t));
const narratorLines = () => D.titles.map((t) => t.name + '! ' + t.note);

function collect(templates, addr, withItems) {
  const clips = new Map();
  const add = (key, text) => { if (!clips.has(key)) clips.set(key, text); };
  for (const t of templates) {
    for (const tok of E.speechParts(t, {}, addr, null)) {
      if (tok.s) add(V.clipKey(tok), V.speechText(tok.s));
    }
  }
  if (withItems) for (const it of D.items) add(V.clipKey({ i: it.id }), V.speechText(it.name));
  return clips;
}

const jobs = { rate: 22050, speakers: {} };
for (const [id, cfg] of Object.entries(SPEAKERS)) {
  let clips;
  if (id === 'narrator') clips = collect(narratorLines(), '', false);
  else if (id.startsWith('buyer')) clips = collect(playerTemplates(), '', false);
  else {
    const v = D.vendors.find((x) => x.id === id);
    clips = collect(vendorTemplates(v), v.addr, true);
  }
  if (id !== 'narrator') {
    for (const [key, text] of V.pricePieces()) clips.set(key, text);
  }
  jobs.speakers[id] = Object.assign({}, cfg, { clips: [...clips].map(([key, text]) => ({ key, text })) });
}

// a hash collision would make two phrases share one recording
for (const [id, s] of Object.entries(jobs.speakers)) {
  const seen = new Map();
  for (const c of s.clips) {
    if (seen.has(c.key) && seen.get(c.key) !== c.text) throw new Error(`key collision for ${id}: ${c.key}`);
    seen.set(c.key, c.text);
  }
}

process.stdout.write(JSON.stringify(jobs, null, 1));
const total = Object.values(jobs.speakers).reduce((n, s) => n + s.clips.length, 0);
process.stderr.write(`${Object.keys(jobs.speakers).length} speakers, ${total} clips\n`);
