# দামাদামি (Damadami)

**দোকানদার চাইলো ১৮০০, আপনি কত দিবেন?**

A daily bargaining game in Bangla. You're at a market stall, the vendor asks an inflated price, and you have to talk him down. Every vendor has a **secret lowest price** in mind. The closer you buy to it before his patience runs out, the better your title, from *ট্যুরিস্ট* 🧳 to *আম্মু-লেভেল* 👑.

It's a static web page: no install, no account, no backend. It runs on low-end phones and keeps working offline after the first visit.

## How to play

- **Make an offer** with the slider. The vendor counters with a lower price.
- **Read the vendor.** When he only drops a little, you're close to his limit.
- **Watch his patience.** Offers far below his floor, or lower than your last offer, make him angry. At zero he refuses to sell.
- **Play tactic cards.** Each can be used once per haggle, and each vendor reacts differently:
  | Card | Effect |
  |---|---|
  | 🚶 আমি গেলাম | Walk away at your last offer. He may call you back, meet you halfway, or let you go. You can walk back in, at a higher price. |
  | 🎓 স্টুডেন্ট মানুষ | Sympathy. Works best on নাসিমা খালা. |
  | 🏪 পাশের দোকানে কম | Competitor price. Only believable if your offer is near his floor. |
  | 😍 মাল তো সেরা! | Flattery restores patience. Useless on রহিম চাচা. |
  | 💵 এখনই ক্যাশ | Makes him more willing to close. জামাল মিয়া loves it. |
  | 🤝 পুরান কাস্টমার | Big discount if he plays along. Backfires on vendors who keep records. |
- **8 rounds** maximum, then he gives a final price.

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
js/ui.js              screens, animation, storage, sharing
sw.js                 offline cache
tests/engine.test.js  unit tests
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

`npm test` runs the engine unit tests. They cover replay determinism, never selling below the floor, the Dhaka day rollover, challenge codes and dialogue placeholders. `npm run sim` plays thousands of scripted games per vendor and prints deal rates and title spreads.
