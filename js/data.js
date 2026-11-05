/* দামাদামি — game content: items, vendors, tactic cards, dialogue, titles.
 * All prices are in taka. `fair` is a realistic market price for the item;
 * each vendor's opening ask and secret floor are derived from it.
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.DamadamiData = data;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const items = [
    { id: 'panjabi',    name: 'পাঞ্জাবি',            emoji: '👘', fair: 650,  market: 'নিউমার্কেট' },
    { id: 'saree',      name: 'তাঁতের শাড়ি',        emoji: '🥻', fair: 1200, market: 'গাউছিয়া' },
    { id: 'sandal',     name: 'স্যান্ডেল',            emoji: '🩴', fair: 280,  market: 'ফুটপাত' },
    { id: 'keds',       name: 'কেডস',                emoji: '👟', fair: 1100, market: 'বঙ্গবাজার' },
    { id: 'handbag',    name: 'লেডিস ব্যাগ',          emoji: '👜', fair: 750,  market: 'নিউমার্কেট' },
    { id: 'watch',      name: 'হাতঘড়ি',              emoji: '⌚', fair: 550,  market: 'গুলিস্তান' },
    { id: 'sunglass',   name: 'সানগ্লাস',             emoji: '🕶️', fair: 220,  market: 'ফুটপাত' },
    { id: 'headphone',  name: 'হেডফোন',              emoji: '🎧', fair: 480,  market: 'মোতালেব প্লাজা' },
    { id: 'phonecover', name: 'ফোনের কভার',          emoji: '📱', fair: 120,  market: 'মোতালেব প্লাজা' },
    { id: 'powerbank',  name: 'পাওয়ার ব্যাংক',        emoji: '🔋', fair: 900,  market: 'মোতালেব প্লাজা' },
    { id: 'tshirt',     name: 'টি-শার্ট',             emoji: '👕', fair: 300,  market: 'বঙ্গবাজার' },
    { id: 'jeans',      name: 'জিন্স প্যান্ট',         emoji: '👖', fair: 800,  market: 'বঙ্গবাজার' },
    { id: 'orna',       name: 'ওড়না',                emoji: '🧣', fair: 320,  market: 'গাউছিয়া' },
    { id: 'umbrella',   name: 'ছাতা',                emoji: '☂️', fair: 380,  market: 'গুলিস্তান' },
    { id: 'schoolbag',  name: 'স্কুল ব্যাগ',           emoji: '🎒', fair: 950,  market: 'নিউমার্কেট' },
    { id: 'cap',        name: 'ক্যাপ',                emoji: '🧢', fair: 180,  market: 'ফুটপাত' },
    { id: 'toycar',     name: 'খেলনা গাড়ি',           emoji: '🚗', fair: 420,  market: 'চকবাজার' },
    { id: 'teddy',      name: 'টেডি বিয়ার',           emoji: '🧸', fair: 500,  market: 'চকবাজার' },
    { id: 'bat',        name: 'ক্রিকেট ব্যাট',          emoji: '🏏', fair: 1100, market: 'গুলিস্তান' },
    { id: 'football',   name: 'ফুটবল',               emoji: '⚽', fair: 650,  market: 'গুলিস্তান' },
    { id: 'frypan',     name: 'ফ্রাইপ্যান',             emoji: '🍳', fair: 600,  market: 'চকবাজার' },
    { id: 'wallclock',  name: 'দেয়াল ঘড়ি',            emoji: '🕰️', fair: 450,  market: 'চকবাজার' },
    { id: 'ilish',      name: 'ইলিশ মাছ (১ কেজি)',    emoji: '🐟', fair: 1600, market: 'কারওয়ান বাজার' },
    { id: 'mango',      name: 'হিমসাগর আম (১ কেজি)',  emoji: '🥭', fair: 130,  market: 'কারওয়ান বাজার' },
    { id: 'dab',        name: 'ডাব',                 emoji: '🥥', fair: 90,   market: 'ফুটপাত' },
    { id: 'attar',      name: 'আতর',                 emoji: '🧴', fair: 350,  market: 'বায়তুল মোকাররম' },
    { id: 'wallet',     name: 'মানিব্যাগ',             emoji: '👛', fair: 380,  market: 'নিউমার্কেট' },
    { id: 'churi',      name: 'চুড়ি (এক ডজন)',        emoji: '💍', fair: 150,  market: 'গাউছিয়া' },
    { id: 'plant',      name: 'ফুলের টব',             emoji: '🪴', fair: 250,  market: 'আগারগাঁও নার্সারি' },
    { id: 'kite',       name: 'ঘুড়ি-লাটাই',           emoji: '🪁', fair: 120,  market: 'শাঁখারী বাজার' },
  ];

  /* Vendor personality knobs
   *  markup      opening ask = fair × random(markup)
   *  floorRatio  secret lowest price = fair × random(floorRatio)
   *  patience    starting patience (bar is shown relative to this)
   *  temper      how much lowball offers hurt patience
   *  concession  share of the gap the vendor gives up each round
   *  acceptBand  how close your offer must be to his ask for him to say yes
   *  walkHurt    extra patience lost when you walk away
   *  tactics     effectiveness of each card (1 = normal, <1 weak, >1 strong)
   */
  const vendors = [
    {
      id: 'tutul', name: 'টুটুল', title: 'নতুন দোকানদার', avatar: '🧑', level: 'সহজ', addr: 'ভাইয়া',
      blurb: 'মামার দোকানে প্রথম সপ্তাহ। ভয়ে ভয়ে থাকে।',
      markup: [1.9, 2.9], floorRatio: [0.65, 0.95], patience: 85, temper: 0.9,
      concession: 0.40, acceptBand: 0.07, walkHurt: 0, stand: 0.25,
      tactics: { walk: 1.4, student: 1.3, competitor: 1.5, flatter: 1.2, cash: 1.0, regular: 1.3 },
      lines: {
        greet: ['{addr}, {item}... উম্, {price}? মানে, {price}।', 'মামা দোকানে নাই, আমি দেখতেছি। {item} {price}, {addr}।'],
        counter: ['{addr}, মালিক জানলে আমারে বকবে! {price} দেন।', 'আচ্ছা... {price}? চলবে {addr}?', 'মামা বলছিল এর নিচে না... আচ্ছা {price}।'],
        competitor: ['পাশের দোকানে কম?! আচ্ছা আচ্ছা, দাঁড়ান!'],
        deal: ['আচ্ছা {addr}, {price}... মালিককে বইলেন না প্লিজ!', 'ঠিক আছে, {price}। আমার প্রথম বড় বিক্রি!'],
        refuse: ['{addr}, আমি আর পারতেছি না! মামাকে ফোন দিতেছি... না থাক, যান।'],
        walkWin: ['{addr}! {addr}! যাইয়েন না! {price}-ই দেন!'],
      },
    },
    {
      id: 'nasima', name: 'নাসিমা খালা', title: 'মমতাময়ী', avatar: '👵', level: 'সহজ', addr: 'বাবা',
      blurb: 'সবাইকে "বাবা" ডাকেন। মায়া লাগলে দাম কমান।',
      markup: [2.0, 2.8], floorRatio: [0.75, 0.98], patience: 95, temper: 1.0,
      concession: 0.30, acceptBand: 0.05, walkHurt: 12,
      tactics: { walk: 1.2, student: 2.0, competitor: 0.8, flatter: 1.6, cash: 0.8, regular: 1.1 },
      lines: {
        greet: ['আসো {addr}, বসো। {item}টা দেখো, {price}।', '{addr}, একদম ভালো জিনিস। {price} দাও।'],
        counter: ['{addr}, খালার লাভ কই থাকে বলো? {price} দাও।', 'আচ্ছা যাও, {price}। তোমার মুখের দিকে তাকায় বললাম।'],
        student: ['আহারে, পড়ালেখা করো? আচ্ছা {addr}, তোমার জন্য কমায় রাখি।'],
        flatter: ['তোমার মুখে মধু, {addr}!'],
        deal: ['নাও {addr}, {price}। দোয়া করি, ভালো থাকো।'],
        refuse: ['{addr}, খালার সাথে এমন করো? যাও, আজকে বেচবো না।'],
        walkWin: ['{addr}, রাগ করো কেন? আসো, {price}-ই দাও।'],
        walkFail: ['যাও {addr}... খালার মনে কষ্ট দিলা।'],
      },
    },
    {
      id: 'suman', name: 'সুমন ভাই', title: 'কথার জাদুকর', avatar: '😎', level: 'মাঝারি', addr: 'বস',
      blurb: 'প্রথম দাম আকাশছোঁয়া। কথায় কেউ তাকে হারাতে পারে না।',
      markup: [2.5, 3.5], floorRatio: [0.70, 0.98], patience: 115, temper: 0.8,
      concession: 0.24, acceptBand: 0.04, walkHurt: 0, stand: 0.2,
      tactics: { walk: 0.7, student: 0.8, competitor: 0.4, flatter: 1.0, cash: 0.9, regular: 1.4 },
      lines: {
        greet: ['{addr}! একদম ফ্রেশ মাল, এক্সপোর্ট কোয়ালিটি। মাত্র {price}!', 'আসেন {addr}, {item} দেখেন। আপনার জন্য স্পেশাল প্রাইস {price}।'],
        counter: ['{addr}, এইটা সিঙ্গাপুরের মাল! {price}।', 'আপনি আমার ভাইয়ের মতো, {price} দেন।', 'লস দিয়া দিতেছি {addr}, {price}।'],
        competitorMeh: ['ওইটা দুই নম্বর মাল {addr}, এইটা অরিজিনাল!'],
        regular: ['আরে {addr}! চিনবো না? আপনার জন্য সবসময় স্পেশাল।'],
        deal: ['{addr}, আপনার সাথে পারা যায় না! {price}-ই দেন।'],
        refuse: ['{addr}, আজকে থাক। আরেকদিন আসেন, চা খাওয়াবো।'],
        walkWin: ['{addr} {addr} {addr}! রাগ করেন কেন? {price}-ই দেন।'],
        walkFail: ['যান {addr}, পুরা মার্কেট ঘুরে আবার এইখানেই আসবেন।'],
      },
    },
    {
      id: 'rahim', name: 'রহিম চাচা', title: 'গম্ভীর দোকানদার', avatar: '👴', level: 'মাঝারি', addr: 'ভাতিজা',
      blurb: 'কথা কম, মেজাজ গরম। তেল দিয়ে লাভ নেই।',
      markup: [1.8, 2.5], floorRatio: [0.82, 1.02], patience: 72, temper: 1.4,
      concession: 0.28, acceptBand: 0.05, walkHurt: 0,
      tactics: { walk: 1.3, student: 0.6, competitor: 1.1, flatter: 0.3, cash: 1.2, regular: 0.6 },
      lines: {
        greet: ['{item}? {price}। দাম নিয়া প্যাঁচাল পারবা না।', 'হুঁ। {price}। নিলে নাও।'],
        counter: ['{price}। আর কথা বাড়াইও না।', 'হুঁ... {price}।'],
        flatterMeh: ['তেল মাখাইয়া লাভ নাই, {addr}।'],
        deal: ['নাও, {price}। আর জীবনে এই দোকানে দামাদামি করবা না।'],
        refuse: ['যাও তো! সকাল সকাল মেজাজটাই খারাপ করে দিলা।'],
        walkWin: ['এই! দাঁড়াও... আচ্ছা নাও, {price}।'],
      },
    },
    {
      id: 'jamal', name: 'জামাল মিয়া', title: 'এক কথার মানুষ', avatar: '🧔', level: 'কঠিন', addr: 'ভাই',
      blurb: 'দাম সহজে নড়ে না। তবে নগদ টাকা দেখলে মন গলে।',
      markup: [1.7, 2.2], floorRatio: [0.90, 1.10], patience: 85, temper: 1.1,
      concession: 0.18, acceptBand: 0.05, walkHurt: 0, stand: 0.4,
      tactics: { walk: 0.9, student: 0.7, competitor: 0.7, flatter: 0.8, cash: 1.8, regular: 0.9 },
      lines: {
        greet: ['{price}। ফিক্সড প্রাইস... মোটামুটি।', '{addr}, {item} {price}। কথা কম।'],
        hold: ['জামাল মিয়া এক কথার মানুষ। {price}।'],
        cash: ['ক্যাশ? হাতে হাতে? ...আচ্ছা, এইটা অন্য কথা।'],
        deal: ['ঠিক আছে {addr}, {price}। জামাল মিয়া কথা রাখে।'],
        refuse: ['{addr}, আমার দোকানে এত দামাদামি চলে না। যান।'],
      },
    },
    {
      id: 'shirin', name: 'শিরিন আপা', title: 'হিসাবি', avatar: '👩‍💼', level: 'কঠিন', addr: 'ভাই সাহেব',
      blurb: 'সব দাম খাতায় লেখা। কম দাম বললে ক্যালকুলেটর বের করেন।',
      markup: [2.1, 2.9], floorRatio: [0.85, 1.05], patience: 100, temper: 1.8,
      concession: 0.26, acceptBand: 0.04, walkHurt: 0,
      tactics: { walk: 0.8, student: 0.9, competitor: 1.2, flatter: 0.7, cash: 1.3, regular: 0.4 },
      lines: {
        greet: ['{item}। খাতায় লেখা দাম {price}।', '{price}, {addr}। হিসাব পরিষ্কার।'],
        counter: ['হিসাব করে দেখলাম, {price} পর্যন্ত পারি।', '{price}। খাতায় এর নিচে লেখা নাই।'],
        lowball: ['ক্যালকুলেটর দেখেন, {offer}-এ আমার সরাসরি লস।'],
        regularFail: ['আমার খাতায় আপনার নাম নাই, {addr}।'],
        deal: ['{price}। খাতায় লিখে রাখলাম। ধন্যবাদ।'],
        refuse: ['সময়েরও দাম আছে, {addr}। আসেন।'],
      },
    },
  ];

  const tactics = [
    { id: 'walk',       icon: '🚶', name: 'আমি গেলাম',       hint: 'শেষ দাম বলে হাঁটা দিন' },
    { id: 'student',    icon: '🎓', name: 'স্টুডেন্ট মানুষ',  hint: 'মায়া লাগলে দাম নামে' },
    { id: 'competitor', icon: '🏪', name: 'পাশের দোকানে কম', hint: 'দাম কাছাকাছি হলে কাজে দেয়' },
    { id: 'flatter',    icon: '😍', name: 'মাল তো সেরা!',     hint: 'মেজাজ ঠান্ডা করে' },
    { id: 'cash',       icon: '💵', name: 'এখনই ক্যাশ',       hint: 'রাজি হওয়া সহজ করে' },
    { id: 'regular',    icon: '🤝', name: 'পুরান কাস্টমার',   hint: 'ধরা খেলে বিপদ' },
  ];

  /* Shared vendor lines. A vendor's own `lines` override these key by key.
   * Placeholders: {price} vendor's price, {offer} buyer's offer, {prev} earlier offer,
   * {item} item name, {addr} how the vendor addresses the buyer. */
  const lines = {
    greet: ['{item}? {price}।'],
    counter: [
      'না {addr}, {price}-এর নিচে হবে না।',
      'আচ্ছা যান, {price} দেন।',
      'কেনা দামই বেশি পড়ছে! {price} দেন।',
      '{price}। এর চেয়ে কমে কেউ দিবে না।',
      'আপনার জন্য {price}, আর কারো জন্য না।',
    ],
    nearFloor: [
      '{price}, এটাই শেষ কথা {addr}।',
      'বিশ্বাস করেন, {price}-তে লাভ থাকে না।',
      'আর কমাইতে বইলেন না, {price}।',
    ],
    hold: ['{price}, এক টাকাও কম না।', 'যত বলেন, {price}-ই থাকবে।'],
    lowball: ['{offer}?! মাল কি চুরি করে আনছি নাকি?', 'এই দামে তো সুতাও পাওয়া যায় না!', 'ফাজলামি করেন {addr}?'],
    insult: ['{offer}! দোকানের সামনে থেকে সরেন তো!', '{offer}? আমারে কি পাগলে কামড়াইছে?'],
    lowerThanBefore: ['আগে না {prev} বললেন? এখন কমাইতেছেন কেন?'],
    repeat: ['একই কথা বারবার বলেন কেন?', 'রেকর্ড বাজাইতেছেন নাকি?'],
    warn: ['দেখেন, মেজাজ কিন্তু খারাপ হইতেছে।', 'নিলে নেন, না নিলে সামনে আগান।'],
    deal: ['ঠিক আছে, {price}-ই দেন। নিয়ে যান!', 'যান, {price}। বউনিটা করলাম।'],
    closeOut: ['নেন, {price}-ই দেন। আর মাথা খাইয়েন না।'],
    refuse: ['যান, আপনার কাছে বেচবো না!', 'মাথা খারাপ করে দিলেন। সামনে যান।'],
    acceptAsk: ['এই তো ভালো খদ্দের! নেন, আবার আসবেন।'],
    lastPrice: ['অনেক কথা হইছে। লাস্ট প্রাইস {price}, নিলে নেন।'],
    walkWin: ['আরে আসেন আসেন! {price}-ই দেন, নিয়ে যান।'],
    walkCounter: ['আচ্ছা শোনেন শোনেন... {price} দেন, শেষ।'],
    walkFail: ['যান যান, এই দামে কেউ দিবে না!'],
    returnMock: ['ফিরে আসলেন? এখন দাম {price}!', 'হে হে, জানতাম আসবেন। {price}।'],
    student: ['স্টুডেন্ট? আচ্ছা, আপনার জন্য একটু কম রাখি।'],
    studentMeh: ['সবাই তো স্টুডেন্ট, {addr}!'],
    competitor: ['পাশের দোকান? ...আচ্ছা দেখি কত পারি।'],
    competitorMeh: ['তাইলে ওইখান থেকেই নেন না!'],
    competitorNo: ['ওই দামে কেউ দিলে আমারেও আইনা দিয়েন!'],
    flatter: ['হে হে, চোখ আছে আপনার!'],
    flatterMeh: ['তেল দিয়া লাভ নাই।'],
    cash: ['ক্যাশ? তাইলে কথা বলা যায়।'],
    cashMeh: ['ক্যাশ তো সবাই দেয়, {addr}।'],
    regular: ['আরে চিনছি তো! আপনি তো আমাদের পুরান খদ্দের।'],
    regularFail: ['আপনাকে তো জীবনে কোনোদিন দেখি নাই!'],
  };

  const player = {
    offer: ['{price} দিব।', '{price} হলে নিয়ে যাই।', '{price}-এর বেশি পারবো না।', '{price} দেই?'],
    walk: '{price}-এর বেশি এক টাকাও না। আমি গেলাম।',
    student: 'স্টুডেন্ট মানুষ, এত টাকা কই পাবো? {price} রাখেন।',
    competitor: 'পাশের দোকানে তো কম বলছে। {price} দেন।',
    flatter: 'আপনার দোকানের মালই সবচেয়ে সুন্দর। {price} রাখেন না!',
    cash: 'এখনই ক্যাশ দিচ্ছি, {price}।',
    regular: 'আমি তো আপনার পুরান কাস্টমার! {price} রাখেন।',
    acceptAsk: 'আচ্ছা ঠিক আছে, {price}-ই দিচ্ছি।',
    leave: 'থাক, লাগবে না।',
    goBack: 'ইয়ে... মানে... আরেকবার দেখি একটু?',
  };

  /* Score = how much you paid above the vendor's secret lowest price.
   * The tightest title whose `maxOver` you meet wins (0.05 = within 5%). */
  const titles = [
    { id: 'none',    maxOver: null, name: 'খালি হাতে বাড়ি',     emoji: '🏠', note: 'আজ দোকানদারের সাথে বনিবনা হলো না।' },
    { id: 'tourist', maxOver: null, name: 'ট্যুরিস্ট',           emoji: '🧳', note: 'দোকানদার আজ মহাখুশি।' },
    { id: 'new',     maxOver: 0.70, name: 'নতুন খদ্দের',        emoji: '🐣', note: 'শুরুটা ভালো, আরও শিখতে হবে।' },
    { id: 'clever',  maxOver: 0.30, name: 'চালাক খদ্দের',       emoji: '🦊', note: 'দোকানদার একটু চিন্তায় পড়ে গেছে।' },
    { id: 'ustad',   maxOver: 0.16, name: 'দরদামের ওস্তাদ',     emoji: '🎯', note: 'বাজারে আপনার নাম ছড়াচ্ছে।' },
    { id: 'legend',  maxOver: 0.08, name: 'নিউমার্কেট লেজেন্ড', emoji: '🔥', note: 'আপনাকে দেখলে দোকানদাররা শাটার নামায়।' },
    { id: 'ammu',    maxOver: 0.03, name: 'আম্মু-লেভেল',         emoji: '👑', note: 'একদম আম্মুর মতো দামাদামি!' },
  ];

  return { items, vendors, tactics, lines, player, titles };
});
