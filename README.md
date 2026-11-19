# দামাদামি (Damadami)

**দোকানদার চাইলো ১৮০০, আপনি কত দিবেন?**

A daily bargaining game in Bangla. You're at a market stall, the vendor asks an inflated price, and you have to talk him down. Every vendor has a **secret lowest price** in mind. The closer you buy to it before his patience runs out, the better your title, from *ট্যুরিস্ট* 🧳 to *আম্মু-লেভেল* 👑.

It's a static web page: no install, no account, no backend. It runs on low-end phones and keeps working offline after the first visit.

## How to play

- **Make an offer** with the slider. The vendor counters with a lower price.
- **Read the vendor.** When he only drops a little, you're close to his limit.
- **Watch his patience.** Offers far below his floor, or lower than your last offer, make him angry. At zero he loses his temper: you can **apologise once** and carry on at a slightly higher price. The second time, he refuses to sell.
- **Play excuse cards.** Each game deals you 9 of the 15 cards (always including 🚶 আমি গেলাম). Each can be used once, and every vendor reacts differently:
  | Card | Effect |
  |---|---|
  | 🚶 আমি গেলাম | Walk away at your last offer. He may call you back, meet you halfway, or let you go. You can walk back in, at a higher price. |
  | 🎓 স্টুডেন্ট মানুষ · 👩 আম্মু পাঠাইছে · 🎁 বিয়ের উপহার · 🧑‍🤝‍🧑 বন্ধুদের আনবো | Sympathy. নাসিমা খালা melts; others shrug. |
  | 🏪 পাশের দোকানে কম · 📱 অনলাইনে কম · 👛 পকেটে এর বেশি নাই | Pressure. Only believable if your offer is near his floor, otherwise it backfires. |
  | 😍 মাল তো সেরা! | Flattery restores patience. Useless on রহিম চাচা. |
  | 💵 এখনই ক্যাশ | Makes him more willing to close. জামাল মিয়া loves it. |
  | 🤝 পুরান কাস্টমার · 📅 আগেরবার কম নিছিলেন | Big discount if he plays along; a telling-off if he doesn't. |
  | 🛍️ দুইটা নিবো | Buying two gets a better price per piece. |
  | 🔍 এইখানে দাগ আছে | Pointing out a flaw drops the price but annoys him. |
  | 🌙 দোকান বন্ধের সময় | Closing time: stronger the longer the haggle has gone on. |
- **Give your own excuse.** The ✍️ নিজের অজুহাত card lets you type a reason in Bangla or Banglish, e.g. "bondhu der anbo". It is matched by keyword to the card it resembles (and then works and is answered like that card, which also uses the card up). A reason that matches no card gets a small pity discount that fades with each use. Up to 3 per game. Your words are shown but not voiced; only the price that follows them is.
- **Don't like the product?** Tap 🔄 অন্য জিনিস to get the next one from the same shop. In practice you can switch any time; in the daily deal or a friend's challenge it is offered before your first move and switches you to practice.
- **14 rounds** maximum, then he gives a final price.
- **67 items** from New Market, Gausia, Bangabazar, Karwan Bazar, Motaleb Plaza, Nilkhet, Nawabpur, Chawkbazar and more.

### Modes

- **দৈনিক দামাদামি (Daily Deal):** the same item and vendor for everyone in the country, one attempt per day. The day starts at midnight Dhaka time. Results copy as a shareable card:
  ```
  দামাদামি #১ 🏏 ক্রিকেট ব্যাট
  ৳২,২০০ → ৳১,১৫০ (৪৮% কম)
  🟩🟩🟩🚶🤝
  🦊 চালাক খদ্দের
  ```
- **অনুশীলন (Practice):** unlimited random shops.
- **বন্ধুকে চ্যালেঞ্জ (Friend challenge):** pick an item, a vendor, an opening price and your own secret floor. Send the generated code or link. Your friend plays against your shop and sees your secret price at the end.

### Vendors

| Vendor | Style | Level |
|---|---|---|
| 🧑 টুটুল | New, nervous, gives big discounts | সহজ |
| 👵 নাসিমা খালা | Calls you "বাবা", soft spot for students | সহজ |
| 😎 সুমন ভাই | Sky-high opening price, smooth talker | মাঝারি |
| 👴 রহিম চাচা | Short temper, hates flattery | মাঝারি |
| 🧔 জামাল মিয়া | Barely moves, unless you show cash | কঠিন |
| 👩‍💼 শিরিন আপা | Keeps accounts, punishes lowballs hard | কঠিন |

### Voices

Every line in the conversation is spoken aloud, each character in their own voice. The voices are **built into the game**: every phrase is pre-recorded and ships in `voices/`, so players don't need to install or download anything.

| Character | Voice |
|---|---|
| 🧑 টুটুল | Male voice, higher and fast, nervous |
| 👵 নাসিমা খালা | Female voice, lower and slow |
| 😎 সুমন ভাই | Male voice, quick, a fast talker |
| 👴 রহিম চাচা | Male voice, deep and slow, gruff |
| 🧔 জামাল মিয়া | Male voice, low and steady |
| 👩‍💼 শিরিন আপা | Female voice, brisk |
| 🙋 You (buyer) | Female voice against male vendors, male voice against female vendors |
| Announcer | Reads your title at the end |

- Prices are spoken the way people say them at a stall: ৳১,৮০০ is "আঠারোশো টাকা", ৳৩,৫৫০ is "তিন হাজার পাঁচশো পঞ্চাশ টাকা". They're stitched from 75 recorded parts, so every price the game can produce is covered.
- Angry lines play slightly faster.
- The 🔊 button switches voices on or off, and the setting is remembered. Tap the chat to skip the line being spoken. The help sheet (?) has a ▶ sample for every character.
- Each character is one MP3 (about 0.3–0.9 MB) plus `voices/manifest.json`, which says where each clip sits in it. A game loads only its vendor, the buyer voice and the announcer, and the offline cache keeps them after the first play.
- The voices need the game served over http(s) (GitHub Pages, or `python3 -m http.server`). Opened straight from a file, the browser blocks loading them and the game plays silently.

**How they're made:** every phrase is recorded with **Bangla Parler-TTS** ([Tanmoyshome/bn-parler-tts](https://huggingface.co/Tanmoyshome/bn-parler-tts), Apache 2.0), a fine-tune of AI4Bharat's Indic Parler-TTS on SUST's Bangladeshi SUBAK.KO speech corpus. Parler gives a different speaker each time it speaks, so every clip is then converted onto one fixed reference voice per character with Resemble AI's **Chatterbox** voice converter ([ResembleAI/chatterbox](https://huggingface.co/ResembleAI/chatterbox), MIT; it adds Resemble's inaudible Perth watermark). Keep these credits wherever the game is published.

#### Regenerating the voices

Re-run this after changing any dialogue in `js/data.js` (a test fails if a line has no recording). It needs three Python environments, because the two models want different library versions:

- one with `parler_tts` (it installs transformers 4.46) and torch,
- one with `chatterbox-tts`,
- one with numpy and scipy, plus ffmpeg with the rubberband filter.

```bash
PARLER_PY=/path/to/parler/python VC_PY=/path/to/chatterbox/python PACK_PY=python3 tools/voices/record_all.sh /tmp/damadami-voices
```

It runs three resumable stages:

1. `parler_render.py` records each distinct phrase once per gender, one at a time (batching garbles short phrases), re-recording takes whose length doesn't fit the text, plus a 10-second reference voice per character (`refSeed` in `clips.js` picks which voice).
2. `vc_render.py` converts every clip onto its character's reference voice.
3. `build.py` trims and levels each clip, applies the character's pitch and speed, and packs one MP3 per character; `check.py` verifies every clip sits where the manifest says.

On a 4-core CPU with no GPU, a full run takes about 4–5 hours.

## Run it

Open `index.html` in a browser, or serve the folder so the offline cache and links work:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080.

**Deploy:** any static host works. For GitHub Pages: Settings → Pages → deploy from the `main` branch, root folder.

## Project layout

```
index.html            page structure
css/style.css         all styling (light and dark themes)
js/data.js            items, vendors, tactic cards, Bangla dialogue, titles
js/engine.js          negotiation rules (pure logic, no DOM; runs in Node too)
js/voice.js           plays the built-in voices; price-to-words
voices/               recorded character voices (one MP3 each + manifest.json)
tools/voices/         scripts that record the voices (record_all.sh runs them)
js/ui.js              screens, animation, storage, sharing
sw.js                 offline cache
tests/engine.test.js  engine unit tests
tests/voice.test.js   voice unit tests
tests/sim.js          balance simulator
```

### How the engine works

- Everything random comes from a **seeded generator** stored in the game state. The same setup plus the same moves always gives the same game. This keeps the daily deal fair, and an unfinished daily game is restored by replaying its saved moves.
- Each vendor has an opening price and a **secret floor**, both drawn from ranges around the item's fair price.
- Each round he concedes part of the gap toward a **stand price**: a level above his floor that shrinks as rounds pass or when a tactic lands. His asks never point straight at the floor, so you have to read how fast they shrink.
- **Patience** drops each round, and drops more for offers below his floor, for offering less than before, and for failed tactics.
- **Score** = how far above his floor you paid. Within 3% is আম্মু-লেভেল.

### Adding content

- **New item:** add `{ id, name, emoji, fair, market }` to `items` in `js/data.js`. `fair` is a realistic market price in taka.
- **New vendor:** copy a vendor entry and adjust the personality numbers (explained in the comment above `vendors`) and the dialogue lines. Lines can use `{price}`, `{offer}`, `{prev}`, `{item}` and `{addr}`.
- After changing numbers, check the balance with `npm run sim`.

## Tests

```bash
npm test
```

```bash
npm run sim
```

`npm test` runs the engine and voice unit tests. They cover replay determinism, never selling below the floor, the Dhaka day rollover, challenge codes and dialogue placeholders. `npm run sim` plays thousands of scripted games per vendor and prints deal rates and title spreads.
