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

/* Each character: gender of the Bangla Parler voice, the seed that picks their own
 * reference voice (Parler gives a different speaker per seed), and a pitch (semitones)
 * and speed applied at packing time for personality. */
const SPEAKERS = {
  tutul:    { gender: 'male',   refSeed: 11, pitch: 1.5,  tempo: 1.10 },
  nasima:   { gender: 'female', refSeed: 23, pitch: -1.0, tempo: 0.92 },
  suman:    { gender: 'male',   refSeed: 37, pitch: 0.5,  tempo: 1.12 },
  rahim:    { gender: 'male',   refSeed: 41, pitch: -2.0, tempo: 0.88 },
  jamal:    { gender: 'male',   refSeed: 53, pitch: -1.0, tempo: 0.95 },
  shirin:   { gender: 'female', refSeed: 67, pitch: 0.5,  tempo: 1.05 },
  buyer_m:  { gender: 'male',   refSeed: 71, pitch: 0.0,  tempo: 1.0 },
  buyer_f:  { gender: 'female', refSeed: 83, pitch: 0.0,  tempo: 1.0 },
  narrator: { gender: 'female', refSeed: 97, pitch: 0.0,  tempo: 0.97 },
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
