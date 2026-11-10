// Генератор страниц-подборок для поиска (SEO), русских /radio/ и английских /en/radio/. Запуск:  node tools/build_seo.mjs [slug]
// Берёт списки станций из PRESETS в index.html (и популярное по жанру/стране из каталога radio-browser),
// прогоняет их через тот же стоп-список allowed(), что и сайт, и пишет статические страницы radio/<slug>/index.html,
// хаб radio/index.html и обновляет sitemap.xml. Страницы можно перегенерировать в любой момент.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = process.env.SEO_SITE || "https://radioglob.com";
const TODAY = new Date().toISOString().slice(0, 10);
const SERVERS = ["https://de1.api.radio-browser.info", "https://nl1.api.radio-browser.info", "https://at1.api.radio-browser.info"];

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// --- стоп-список сайта: вырезаем константы и allowed() из index.html и выполняем как есть
const a = html.indexOf("const ADULT_OK");
const b = html.indexOf("function render(list)");
if (a < 0 || b < 0) throw new Error("не нашёл allowed() в index.html");
const ctx = vm.createContext({});
vm.runInContext(html.slice(a, b) + "\nthis.allowed = allowed;", ctx);
const allowed = ctx.allowed;

// --- ID станций ручной подборки из PRESETS
function presetIds(label) {
  const start = html.indexOf('{ label: "' + label + '"');
  if (start < 0) throw new Error("нет подборки " + label);
  const end = html.indexOf("] }", start);
  return [...html.slice(start, end).matchAll(/"([0-9a-f]{8}-[0-9a-f-]{27})"/g)].map(m => m[1]);
}

async function api(p) {
  let err;
  for (const s of SERVERS) {
    try {
      const r = await fetch(s + p, { headers: { "User-Agent": "RadioGlob-seo-build/1.0" } });
      if (r.ok) return await r.json();
      err = new Error(r.status);
    } catch (e) { err = e; }
  }
  throw err;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// JSON внутри <script>: экранируем < > &, чтобы название станции не закрыло тег
const BS = String.fromCharCode(92);
const safeJson = o => JSON.stringify(o).replace(/</g, BS + "u003c").replace(/>/g, BS + "u003e").replace(/&/g, BS + "u0026");
const isHttps = s => /^https:\/\//i.test(s.url_resolved || s.url || "");

// --- страницы. kind: ids (ручной список), tag (жанр из каталога), country (страна из каталога)
const PAGES = [
  { slug: "radio-dlya-meditacii", group: "Настроение и занятия", label: "Медитация", kind: "ids", pick: "radio-dlya-meditacii",
    title: "Радио для медитации и сна онлайн слушать бесплатно", h1: "Радио для медитации, релакса и сна",
    desc: "Онлайн-радио для медитации: эмбиент, тихая классика, звуки природы, мантры, музыка для сна. Слушать бесплатно без регистрации.",
    intro: ["Станции, под которые удобно медитировать, расслабляться и засыпать: спокойный эмбиент, тихая классика, звуки дождя, моря и леса, мантры.",
      "Включите станцию и закройте глаза. Чтобы засыпать под звуки природы, поставьте на телефоне таймер сна или убавьте громкость."],
    faq: [["Какое радио лучше для сна?", "Звуки природы и эмбиент без резких переходов. Начните со станций вверху списка и выберите ту, где нет голоса и ударных."],
      ["Можно слушать на телефоне?", "Да. Откройте страницу в браузере телефона и нажмите на станцию. Радио можно добавить на экран «Домой»."]] },
  { slug: "radio-dlya-izucheniya-yazykov", group: "Настроение и занятия", label: "Обучение", kind: "ids", pick: "radio-dlya-obucheniya",
    title: "Радио для изучения языков и обучения онлайн", h1: "Радио для изучения языков и учёбы",
    desc: "Онлайн-радио для обучения: английский для начинающих, корейский, китайский, лекции по истории. Слушать бесплатно.",
    intro: ["Подборка для тех, кто учит язык на слух или любит лекции: медленный английский, корейская образовательная станция, китайские уроки и чтения, история, наука.",
      "Слушайте как фон во время дел: так привыкает ухо. Станции открываются прямо в браузере, без установки и регистрации."],
    faq: [["Какое радио подойдёт для изучения английского?", "Начните со Slow English FM: речь там медленная и чёткая. Когда станет легко, переходите к обычным разговорным станциям."]] },
  { slug: "detskoe-radio", group: "Настроение и занятия", label: "Детям", kind: "ids", pick: "detskoe-radio",
    title: "Детское радио онлайн слушать бесплатно", h1: "Детское радио онлайн",
    desc: "Детские радиостанции онлайн: песни, сказки, весёлая музыка для малышей и школьников. Слушать бесплатно без регистрации.",
    intro: ["Станции для детей: песни, сказки, весёлая музыка. Подойдёт в дорогу, на кухню или перед сном.",
      "Перед тем как включить ребёнку, послушайте станцию сами: содержание каналов может меняться."],
    faq: [] },
  { slug: "radio-literatura", group: "Настроение и занятия", label: "Литература", kind: "ids", pick: "radio-literatura",
    title: "Радио с аудиокнигами, стихами и радиоспектаклями онлайн", h1: "Литературное радио: книги, стихи, спектакли",
    desc: "Онлайн-радио о литературе: аудиокниги, стихи, радиоспектакли, сказки на ночь. Слушать бесплатно.",
    intro: ["Станции, где читают книги и стихи, ставят радиоспектакли и рассказывают сказки на ночь.",
      "Это хороший способ слушать литературу за готовкой, в дороге или перед сном."],
    faq: [] },
  { slug: "nauchnoe-radio", group: "Настроение и занятия", label: "Наука", kind: "ids", pick: "nauchnoe-radio",
    title: "Научное радио онлайн: наука, космос, технологии", h1: "Научное радио онлайн",
    desc: "Онлайн-радио о науке: научно-популярные передачи, космос, технологии, лекции. Слушать бесплатно без регистрации.",
    intro: ["Станции с научно-популярными передачами, лекциями и новостями науки.", "Подойдёт, когда хочется узнать новое, а не просто включить музыку."],
    faq: [] },
  { slug: "yumor-radio", group: "Настроение и занятия", label: "Юмор", kind: "ids", pick: "yumor-radio",
    title: "Юмористическое радио онлайн слушать бесплатно", h1: "Радио с юмором онлайн",
    desc: "Юмористические радиостанции онлайн: шутки, скетчи, комедийные передачи. Слушать бесплатно без регистрации.",
    intro: ["Станции с юмором: шутки, скетчи, комедийные передачи и весёлая музыка. Русские станции в начале списка."], faq: [] },
  { slug: "folk-radio", group: "Музыка", label: "Фолк", kind: "ids", pick: "folk-radio",
    title: "Фолк-радио онлайн: народная музыка слушать бесплатно", h1: "Фолк и народная музыка онлайн",
    desc: "Фолк-радио онлайн: народная музыка разных стран, этника, кельтский и русский фолк. Слушать бесплатно.",
    intro: ["Подборка станций с народной и этнической музыкой разных стран."], faq: [] },
  { slug: "k-pop-radio", group: "Музыка", label: "K-pop", kind: "ids", pick: "k-pop-radio",
    title: "K-pop радио онлайн слушать бесплатно", h1: "K-pop радио онлайн",
    desc: "K-pop радио онлайн: корейская поп-музыка и азиатский поп. Слушать бесплатно без регистрации.",
    intro: ["Радиостанции с корейской поп-музыкой. Русскоязычные станции с k-pop — в начале списка."], faq: [] },
  { slug: "indiyskoe-radio", group: "Страны и регионы", label: "Индия", kind: "ids", pick: "indiyskoe-radio",
    title: "Индийское радио онлайн: Болливуд и индийская музыка", h1: "Индийское радио онлайн",
    desc: "Индийское радио онлайн: Болливуд, фильми, классическая индийская музыка. Слушать бесплатно.",
    intro: ["Станции с индийской музыкой: песни из болливудских фильмов, поп, классика."], faq: [] },
  { slug: "afrikanskoe-radio", group: "Страны и регионы", label: "Африка", kind: "ids", pick: "afrikanskoe-radio",
    title: "Африканское радио онлайн слушать бесплатно", h1: "Африканское радио онлайн",
    desc: "Радиостанции Африки онлайн: музыка и эфиры разных стран континента. Слушать бесплатно без регистрации.",
    intro: ["Станции из разных стран Африки: местная музыка и эфиры."], faq: [] },
  // Жанры: популярное из каталога
  { slug: "pop-radio", group: "Музыка", kind: "tag", tag: "pop", pick: "pop-radio",
    title: "Поп-радио онлайн слушать бесплатно", h1: "Поп-радио онлайн", desc: "Поп-радио онлайн: хиты и новинки поп-музыки. Слушать бесплатно без регистрации.",
    intro: ["Самые популярные станции с поп-музыкой: хиты, новинки и любимые песни последних лет."], faq: [] },
  { slug: "rok-radio", group: "Музыка", kind: "tag", tag: "rock", pick: "rok-radio",
    title: "Рок-радио онлайн слушать бесплатно", h1: "Рок-радио онлайн", desc: "Рок-радио онлайн: классический и современный рок, хард-рок, альтернатива. Слушать бесплатно.",
    intro: ["Популярные рок-станции: от классики до современного рока."], faq: [] },
  { slug: "dzhaz-radio", group: "Музыка", kind: "tag", tag: "jazz", pick: "dzhaz-radio",
    title: "Джаз-радио онлайн слушать бесплатно", h1: "Джаз-радио онлайн", desc: "Джаз-радио онлайн: классический джаз, смус-джаз, блюз, саксофон. Слушать бесплатно без регистрации.",
    intro: ["Станции с джазом: классика, смус-джаз и вечерние плейлисты."], faq: [] },
  { slug: "klassicheskaya-muzyka-radio", group: "Музыка", kind: "tag", tag: "classical", pick: "klassicheskaya-muzyka-radio",
    title: "Радио классической музыки онлайн", h1: "Радио классической музыки", desc: "Радио классической музыки онлайн: оркестры, опера, фортепиано. Слушать бесплатно без регистрации.",
    intro: ["Станции с классической музыкой: симфонии, фортепиано, опера и камерные программы."], faq: [] },
  { slug: "elektronnaya-muzyka-radio", group: "Музыка", kind: "tag", tag: "electronic", pick: "elektronnaya-muzyka-radio",
    title: "Радио электронной музыки онлайн: house, techno, trance", h1: "Радио электронной музыки", desc: "Радио электронной музыки онлайн: house, techno, trance, drum and bass. Слушать бесплатно.",
    intro: ["Популярные станции электронной музыки для работы, спорта и вечеринок."], faq: [] },
  { slug: "retro-radio", group: "Музыка", kind: "tag", tag: "oldies", pick: "retro-radio",
    title: "Ретро-радио онлайн: хиты прошлых лет слушать бесплатно", h1: "Ретро-радио онлайн", desc: "Ретро-радио онлайн: хиты 60-х, 70-х, 80-х и 90-х. Слушать бесплатно без регистрации.",
    intro: ["Станции со старыми хитами: песни, под которые выросло не одно поколение."], faq: [] },
  { slug: "chill-radio", group: "Музыка", kind: "tag", tag: "chillout", pick: "chill-radio",
    title: "Chillout и lounge радио онлайн слушать бесплатно", h1: "Chillout и lounge радио", desc: "Chillout и lounge радио онлайн: спокойная музыка для отдыха и работы. Слушать бесплатно.",
    intro: ["Спокойная музыка для отдыха и работы: чиллаут, лаунж, даунтемпо."], faq: [] },
  { slug: "novosti-radio", group: "Музыка", kind: "tag", tag: "news", pick: "novosti-radio",
    title: "Новостное радио онлайн слушать бесплатно", h1: "Новостное радио онлайн", desc: "Новостное радио онлайн: новости, обзоры и разговорные станции. Слушать бесплатно без регистрации.",
    intro: ["Станции с новостями и разговорными программами."], faq: [] },
  // Страны
  { slug: "radio-belarus", group: "Страны и регионы", kind: "country", cc: "BY", pick: "", title: "Радио Беларуси онлайн слушать бесплатно", h1: "Радио Беларуси онлайн",
    desc: "Белорусские радиостанции онлайн: Новое радио, РадиусFM, Душевное радио и другие. Слушать бесплатно без регистрации.",
    intro: ["Популярные радиостанции Беларуси онлайн. Работают в браузере на телефоне и компьютере, без регистрации."], faq: [] },
  { slug: "radio-kazahstan", group: "Страны и регионы", kind: "country", cc: "KZ", title: "Радио Казахстана онлайн слушать бесплатно", h1: "Радио Казахстана онлайн",
    desc: "Радиостанции Казахстана онлайн: популярная музыка и эфиры на русском и казахском. Слушать бесплатно.",
    intro: ["Популярные радиостанции Казахстана онлайн: музыка и разговорные эфиры на русском и казахском."], faq: [] },
  { slug: "radio-rossiya", group: "Страны и регионы", kind: "country", cc: "RU", title: "Радио России онлайн слушать бесплатно", h1: "Радио России онлайн",
    desc: "Российские радиостанции онлайн: Русское радио, DFM, Спутник и другие. Слушать бесплатно без регистрации.",
    intro: ["Популярные российские радиостанции онлайн. Слушайте в браузере без регистрации и скачивания приложений."], faq: [] },
];

// ---------- английская версия: /en/radio/<slug>/ и /en/radio/ (добавлено 10.11.2026 для иностранной аудитории)
// В блоке en: тексты страницы. src — если для английской страницы станции надо брать иначе, чем для русской
// (русские подборки вроде «Юмор» или «Детям» составлены из русских станций). Без блока en английская страница не строится.
const EN_GROUP = { "Настроение и занятия": "Mood and activities", "Музыка": "Music", "Страны и регионы": "Countries and regions" };
const EN = {
  "radio-dlya-meditacii": {
    title: "Meditation, Relaxation and Sleep Radio Online, Listen Free", h1: "Radio for meditation, relaxation and sleep",
    desc: "Free online radio for meditation: ambient, calm classical music, nature sounds, mantras and sleep music. Listen in your browser, no sign-up.",
    intro: ["Stations that are easy to meditate, relax and fall asleep to: calm ambient, quiet classical music, sounds of rain, sea and forest, mantras.",
      "Press play and close your eyes. To fall asleep to nature sounds, set the sleep timer in the player or turn the volume down."],
    faq: [["What is the best radio for sleep?", "Nature sounds and ambient music without sudden changes. Start with the stations at the top of the list and pick one with no voice and no drums."],
      ["Can I listen on my phone?", "Yes. Open this page in your phone's browser and tap a station. You can also add the radio to your home screen."]] },
  "radio-dlya-izucheniya-yazykov": {
    title: "Radio for Learning Languages Online, Listen Free", h1: "Radio for learning languages",
    desc: "Free online radio for language learners: slow English, Korean and Chinese programmes, history lectures. Listen in your browser, no sign-up.",
    intro: ["A collection for people who learn a language by ear or enjoy lectures: slow English, a Korean educational station, Chinese lessons and readings, history, science.",
      "Play it in the background while you do other things: that is how your ear gets used to a language. Stations open right in the browser, with no install and no sign-up."],
    faq: [["Which radio is good for learning English?", "Start with Slow English FM: the speech there is slow and clear. When that gets easy, move on to regular talk stations."]] },
  "detskoe-radio": {
    src: { kind: "tag", tag: "kids" },
    title: "Kids Radio Online, Songs and Stories, Listen Free", h1: "Kids radio online",
    desc: "Radio stations for children online: songs, stories and cheerful music for little ones and school kids. Listen free, no sign-up.",
    intro: ["Stations for children: songs, stories and cheerful music. Good for the car, the kitchen or bedtime.",
      "Listen to a station yourself before playing it for a child: what a channel broadcasts can change."],
    faq: [] },
  "nauchnoe-radio": {
    title: "Science Radio Online: Science, Space and Technology", h1: "Science radio online",
    desc: "Online radio about science: popular science programmes, space, technology and lectures. Listen free, no sign-up.",
    intro: ["Stations with popular science programmes, lectures and science news.", "A good choice when you want to learn something new instead of just playing music."],
    faq: [] },
  "yumor-radio": {
    src: { kind: "tag", tag: "comedy" },
    title: "Comedy Radio Online, Jokes and Sketches, Listen Free", h1: "Comedy radio online",
    desc: "Comedy radio stations online: jokes, sketches and comedy shows. Listen free in your browser, no sign-up.",
    intro: ["Stations with humour: jokes, sketches, comedy shows and funny music. Stations come from many countries and languages."], faq: [] },
  "folk-radio": {
    title: "Folk Radio Online: Traditional Music from Around the World", h1: "Folk and traditional music online",
    desc: "Folk radio online: traditional music from many countries, world and ethnic music, Celtic folk. Listen free.",
    intro: ["A collection of stations with folk and ethnic music from different countries."], faq: [] },
  "k-pop-radio": {
    src: { kind: "tag", tag: "kpop" },
    title: "K-pop Radio Online, Listen Free", h1: "K-pop radio online",
    desc: "K-pop radio online: Korean pop music and Asian pop. Listen free in your browser, no sign-up.",
    intro: ["Radio stations with Korean pop music: current hits, favourites and Asian pop."], faq: [] },
  "indiyskoe-radio": {
    title: "Indian Radio Online: Bollywood and Indian Music", h1: "Indian radio online",
    desc: "Indian radio online: Bollywood, film songs and classical Indian music. Listen free.",
    intro: ["Stations with Indian music: songs from Bollywood films, pop and classical."], faq: [] },
  "afrikanskoe-radio": {
    title: "African Radio Online, Listen Free", h1: "African radio online",
    desc: "Radio stations from Africa online: music and broadcasts from different countries of the continent. Listen free, no sign-up.",
    intro: ["Stations from different African countries: local music and broadcasts."], faq: [] },
  "pop-radio": {
    title: "Pop Radio Online, Listen Free", h1: "Pop radio online", desc: "Pop radio online: hits and new releases in pop music. Listen free, no sign-up.",
    intro: ["The most popular pop stations: hits, new releases and favourite songs of recent years."], faq: [] },
  "rok-radio": {
    title: "Rock Radio Online, Listen Free", h1: "Rock radio online", desc: "Rock radio online: classic and modern rock, hard rock, alternative. Listen free.",
    intro: ["Popular rock stations: from the classics to modern rock."], faq: [] },
  "dzhaz-radio": {
    title: "Jazz Radio Online, Listen Free", h1: "Jazz radio online", desc: "Jazz radio online: classic jazz, smooth jazz, blues and saxophone. Listen free, no sign-up.",
    intro: ["Stations with jazz: classics, smooth jazz and evening playlists."], faq: [] },
  "klassicheskaya-muzyka-radio": {
    title: "Classical Music Radio Online", h1: "Classical music radio", desc: "Classical music radio online: orchestras, opera and piano. Listen free, no sign-up.",
    intro: ["Stations with classical music: symphonies, piano, opera and chamber programmes."], faq: [] },
  "elektronnaya-muzyka-radio": {
    title: "Electronic Music Radio Online: House, Techno, Trance", h1: "Electronic music radio", desc: "Electronic music radio online: house, techno, trance and drum and bass. Listen free.",
    intro: ["Popular electronic music stations for work, sport and parties."], faq: [] },
  "retro-radio": {
    title: "Oldies and Retro Radio Online, Listen Free", h1: "Oldies and retro radio online", desc: "Oldies radio online: hits of the 60s, 70s, 80s and 90s. Listen free, no sign-up.",
    intro: ["Stations with old hits: songs that more than one generation grew up with."], faq: [] },
  "chill-radio": {
    title: "Chillout and Lounge Radio Online, Listen Free", h1: "Chillout and lounge radio", desc: "Chillout and lounge radio online: calm music for rest and work. Listen free.",
    intro: ["Calm music for rest and work: chillout, lounge and downtempo."], faq: [] },
  "novosti-radio": {
    title: "News Radio Online, Listen Free", h1: "News radio online", desc: "News radio online: news, reviews and talk stations. Listen free, no sign-up.",
    intro: ["Stations with news and talk programmes."], faq: [] },
  "radio-belarus": {
    title: "Belarus Radio Online, Listen Free", h1: "Belarus radio online", desc: "Radio stations of Belarus online: popular music and broadcasts. Listen free, no sign-up.",
    intro: ["Popular radio stations of Belarus online. They work in the browser on phone and desktop, with no sign-up."], faq: [] },
  "radio-kazahstan": {
    title: "Kazakhstan Radio Online, Listen Free", h1: "Kazakhstan radio online", desc: "Radio stations of Kazakhstan online: popular music and broadcasts in Russian and Kazakh. Listen free.",
    intro: ["Popular radio stations of Kazakhstan online: music and talk broadcasts in Russian and Kazakh."], faq: [] },
  "radio-rossiya": {
    title: "Russian Radio Online, Listen Free", h1: "Russian radio online", desc: "Russian radio stations online: popular music and broadcasts in Russian. Listen free, no sign-up.",
    intro: ["Popular Russian radio stations online. Listen in the browser, with no sign-up and no app to download."], faq: [] },
};
for (const pg of PAGES) pg.en = EN[pg.slug] || null;

// Подписи интерфейса страниц
const UI = {
  ru: {
    brand: "📻 РАДИО", brandHref: "/", all: "Все подборки", listen: "▶ Слушать в плеере", stations: "Станции", faq: "Частые вопросы", others: "Другие подборки", play: "▶ Слушать",
    ogLocale: "ru_RU", otherLang: "EN", otherLangHref: "en",
    footer: d => `RadioGlob — бесплатное интернет-радио: тысячи станций, избранное, записная книжка треков и микшер. Работает в браузере на телефоне и компьютере. Станции берутся из открытого каталога radio-browser.info; список обновляется при пересборке страницы (${d}).`,
    hubTitle: "Радиостанции онлайн по темам и странам", hubDesc: "Подборки интернет-радио: для медитации, учёбы, детям, поп, рок, джаз, классика, радио Беларуси, Казахстана и России. Слушать бесплатно.",
    hubIntro: "Выберите подборку и слушайте бесплатно прямо в браузере: без регистрации и скачивания.", openPlayer: "▶ Открыть плеер", hubFooter: "RadioGlob — бесплатное интернет-радио.",
  },
  en: {
    brand: "📻 RADIO", brandHref: "/?lang=en", all: "All collections", listen: "▶ Listen in the player", stations: "Stations", faq: "Frequently asked questions", others: "More collections", play: "▶ Listen",
    ogLocale: "en_US", otherLang: "RU", otherLangHref: "ru",
    footer: d => `RadioGlob is a free internet radio: thousands of stations, favourites, a song notebook and an audio mixer. It works in the browser on phone and desktop. Stations come from the open radio-browser.info catalogue; the list is refreshed when the page is rebuilt (${d}).`,
    hubTitle: "Online radio stations by theme and country", hubDesc: "Internet radio collections: meditation, learning, kids, pop, rock, jazz, classical, and radio from Belarus, Kazakhstan and Russia. Listen free.",
    hubIntro: "Pick a collection and listen free right in your browser: no sign-up, nothing to download.", openPlayer: "▶ Open the player", hubFooter: "RadioGlob is a free internet radio.",
  },
};
const txt = (pg, L) => (L === "en" ? pg.en : pg);
const pagePath = (slug, L) => (L === "en" ? `/en/radio/${slug}/` : `/radio/${slug}/`);
const hubPath = L => (L === "en" ? "/en/radio/" : "/radio/");
const dirFor = (slug, L) => (L === "en" ? path.join(ROOT, "en", "radio", slug) : path.join(ROOT, "radio", slug));

async function stationsFor(pg) {
  let list;
  if (pg.kind === "ids") {
    const ids = presetIds(pg.label);
    list = await api("/json/stations/byuuid?uuids=" + ids.join(","));
    list.sort((x, y) => ids.indexOf(x.stationuuid) - ids.indexOf(y.stationuuid));
  } else {
    const p = new URLSearchParams({ limit: 80, hidebroken: "true", order: "clickcount", reverse: "true" });
    if (pg.kind === "tag") p.set("tag", pg.tag);
    if (pg.kind === "country") p.set("countrycode", pg.cc);
    list = await api("/json/stations/search?" + p);
  }
  const seen = new Set(), out = [];
  for (const s of list) {
    if (!allowed(s) || !isHttps(s) || !/^[0-9a-f-]{36}$/i.test(s.stationuuid)) continue; // http-потоки на https-сайте не играют
    const key = s.name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= (pg.kind === "ids" ? 60 : 30)) break;
  }
  return out;
}

const CSS = `:root{--bg:#f3f5f9;--card:#fff;--ink:#1d2330;--mut:#5d6677;--acc:#2f6bff;--line:#e1e5ee}
@media (prefers-color-scheme:dark){:root{--bg:#14161c;--card:#1d2028;--ink:#e8ebf2;--mut:#9aa3b5;--acc:#6e9bff;--line:#2c303b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.w{max-width:760px;margin:0 auto;padding:16px}a{color:var(--acc)}
header.t{display:flex;align-items:center;gap:10px;padding:8px 0 4px;font-weight:700;letter-spacing:.04em}
header.t a{text-decoration:none;color:inherit}h1{font-size:1.6rem;line-height:1.25;margin:.6em 0 .4em}h2{font-size:1.15rem;margin:1.6em 0 .6em}
.cta{display:inline-block;background:var(--acc);color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;margin:6px 0 4px}
ol.st{list-style:none;margin:0;padding:0;display:grid;gap:8px}ol.st li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:10px;justify-content:space-between}
.n{font-weight:600}.m{color:var(--mut);font-size:.85rem}.pl{white-space:nowrap;text-decoration:none;border:1px solid var(--acc);border-radius:10px;padding:6px 12px;font-size:.9rem}
.tags{display:flex;flex-wrap:wrap;gap:8px}.tags a{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:6px 12px;text-decoration:none;font-size:.9rem}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:8px 0}summary{cursor:pointer;font-weight:600}
footer{margin:28px 0 8px;color:var(--mut);font-size:.85rem}`;

// Счётчики: GoatCounter и Яндекс.Метрика (одинаковые на всех страницах)
const ANALYTICS = `<script>window.goatcounter = { path: function (p) { return location.host + p; } };</script>
<script data-goatcounter="https://serhej.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
<!-- Яндекс.Метрика -->
<script>
(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(114096001,"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/114096001" style="position:absolute;left:-9999px" alt=""></div></noscript>`;

function metaLine(s, L) {
  let country = s.country;
  try { if (s.countrycode) country = new Intl.DisplayNames([L], { type: "region" }).of(s.countrycode) || country; } catch (e) {}
  const bits = [country, s.bitrate ? s.bitrate + " kbps" : "", s.codec].filter(Boolean);
  return bits.join(" · ");
}

function playUrl(pg, L) {
  const lang = L === "en" ? "&amp;lang=en" : "";
  return pg.kind === "country" ? `${SITE}/?country=${pg.cc}${lang}` : `${SITE}/?pick=${pg.pick}${lang}`;
}

// Ссылки hreflang: пара «русская ↔ английская страница». x-default — английская (универсальная)
function hreflangs(hasRu, hasEn, ruUrl, enUrl) {
  if (!(hasRu && hasEn)) return "";
  return `<link rel="alternate" hreflang="ru" href="${ruUrl}">\n<link rel="alternate" hreflang="en" href="${enUrl}">\n<link rel="alternate" hreflang="x-default" href="${enUrl}">\n`;
}

function page(pg, list, L, hasBoth) {
  const u = UI[L], c = txt(pg, L);
  const url = SITE + pagePath(pg.slug, L);
  const siblings = PAGES.filter(p => p.slug !== pg.slug && (L === "en" ? p.en : true) && (only ? true : p.built && p.built[L]));
  const others = siblings.filter(p => p.group === pg.group).concat(siblings.filter(p => p.group !== pg.group)).slice(0, 10);
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: c.h1, url,
    itemListElement: list.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name.trim() }))
  };
  const faq = c.faq.length ? {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: c.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
  } : null;
  const altL = L === "en" ? "ru" : "en";
  const langSwitch = hasBoth ? `<a href="${pagePath(pg.slug, altL)}" hreflang="${altL}" style="margin-left:auto;font-weight:400;font-size:.85rem">${u.otherLang}</a>` : "";
  return `<!doctype html>
<html lang="${L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)} — RadioGlob</title>
<meta name="description" content="${esc(c.desc)}">
<link rel="canonical" href="${url}">
${hreflangs(hasBoth, hasBoth, SITE + pagePath(pg.slug, "ru"), SITE + pagePath(pg.slug, "en"))}<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta property="og:type" content="website">
<meta property="og:locale" content="${u.ogLocale}">
<meta property="og:title" content="${esc(c.h1)} — RadioGlob">
<meta property="og:description" content="${esc(c.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/icon-512.png">
<style>${CSS}</style>
<script type="application/ld+json">${safeJson(ld)}</script>
${faq ? `<script type="application/ld+json">${safeJson(faq)}</script>` : ""}
${ANALYTICS}
</head>
<body>
<div class="w">
<header class="t"><a href="${u.brandHref}">${u.brand}</a> · <a href="${hubPath(L)}" style="font-weight:400">${u.all}</a>${langSwitch}</header>
<h1>${esc(c.h1)}</h1>
${c.intro.map(t => `<p>${esc(t)}</p>`).join("\n")}
<a class="cta" href="${playUrl(pg, L)}">${u.listen}</a>
<h2>${u.stations} (${list.length})</h2>
<ol class="st">
${list.map(s => `<li><div><div class="n">${esc(s.name.trim())}</div><div class="m">${esc(metaLine(s, L))}</div></div><a class="pl" href="${SITE}/?station=${s.stationuuid}${L === "en" ? "&amp;lang=en" : ""}">${u.play}</a></li>`).join("\n")}
</ol>
${c.faq.length ? `<h2>${u.faq}</h2>\n` + c.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n") : ""}
<h2>${u.others}</h2>
<div class="tags">
${others.map(p => `<a href="${pagePath(p.slug, L)}">${esc(txt(p, L).h1)}</a>`).join("\n")}
</div>
<footer>${esc(u.footer(TODAY))}</footer>
</div>
</body>
</html>
`;
}

function hub(L) {
  const u = UI[L];
  const shown = PAGES.filter(p => p.built && p.built[L]);
  const groups = [...new Set(shown.map(p => p.group))];
  const altL = L === "en" ? "ru" : "en";
  return `<!doctype html>
<html lang="${L}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(u.hubTitle)} — RadioGlob</title>
<meta name="description" content="${esc(u.hubDesc)}">
<link rel="canonical" href="${SITE}${hubPath(L)}">
${hreflangs(true, true, SITE + hubPath("ru"), SITE + hubPath("en"))}<link rel="icon" type="image/svg+xml" href="/icon.svg">
<style>${CSS}</style>
${ANALYTICS}
</head>
<body>
<div class="w">
<header class="t"><a href="${u.brandHref}">${u.brand}</a><a href="${hubPath(altL)}" hreflang="${altL}" style="margin-left:auto;font-weight:400;font-size:.85rem">${u.otherLang}</a></header>
<h1>${esc(u.hubTitle)}</h1>
<p>${esc(u.hubIntro)}</p>
<a class="cta" href="${L === "en" ? "/?lang=en" : "/"}">${u.openPlayer}</a>
${groups.map(g => `<h2>${esc(L === "en" ? EN_GROUP[g] || g : g)}</h2>\n<div class="tags">\n${shown.filter(p => p.group === g).map(p => `<a href="${pagePath(p.slug, L)}">${esc(txt(p, L).h1)}</a>`).join("\n")}\n</div>`).join("\n")}
<footer>${esc(u.hubFooter)}${L === "en" ? ' <a href="/en/about/">About RadioGlob</a>' : ""}</footer>
</div>
</body>
</html>
`;
}

// Страница «About» на английском (шаг 0.4 плана продвижения). Только факты из заметки проекта.
function aboutPage() {
  const title = "About RadioGlob: a free internet radio in your browser";
  const desc = "RadioGlob is a free internet radio: thousands of stations, genre and country collections, sleep timer, song notebook and an audio mixer. No sign-up.";
  const feats = [
    "Thousands of live stations from the open radio-browser.info catalogue, in genre and mood collections (jazz, classical, chill, K-pop, news, kids, language learning and more) and by country",
    "A “Station of the Day” on the home page",
    "A sleep timer (15, 30, 60 or 90 minutes) with a gentle fade-out, and an ambience panel",
    "Favourites and a song notebook: tap the heart while a track is playing to save the song and the station",
    "Installs like an app on phone and desktop, and the now-playing text scrolls in the window title",
    "12 visual themes and an English, French and Russian interface",
    "A separate audio mixer: load your own tracks, trim, fade, equalize, add echo, and export to WAV",
  ];
  const faq = [
    ["Is it free?", "Yes. There is nothing to buy and no account to create."],
    ["Where do the stations come from?", "From the open radio-browser.info community catalogue. A station plays only if its stream is secure (https), because browsers block insecure streams on a secure site. A small number of stations are intentionally not listed."],
    ["What do you store about me?", "Your favourites, song notebook, volume and settings stay in your own browser on your own device. The mixer processes your files in the browser: they are never uploaded. To count visits, the site uses GoatCounter (no cookies, no personal data) and Yandex Metrica (which uses cookies)."],
    ["A station does not play or is missing. What now?", "Write to support@radioglob.com with the station name. Streams change or go offline often, and we check what is reported."],
  ];
  const ld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${SITE}/en/about/">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta property="og:type" content="website">
<meta property="og:locale" content="en_US">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/en/about/">
<meta property="og:image" content="${SITE}/icon-512.png">
<style>${CSS}ul.f{padding-left:1.2em}ul.f li{margin:.35em 0}</style>
<script type="application/ld+json">${safeJson(ld)}</script>
${ANALYTICS}
</head>
<body>
<div class="w">
<header class="t"><a href="/?lang=en">📻 RADIO</a> · <a href="/en/radio/" style="font-weight:400">All collections</a></header>
<h1>About RadioGlob</h1>
<p>RadioGlob is a free internet radio that runs in your browser, on a phone or a computer. Pick a collection or a country, press play, and listen: no sign-up, nothing to install.</p>
<a class="cta" href="/?lang=en">▶ Open the player</a>
<h2>What it does</h2>
<ul class="f">
${feats.map(f => `<li>${esc(f)}</li>`).join("\n")}
</ul>
<h2>Questions</h2>
${faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
<h2>Contact</h2>
<p>Suggestions, a station to add, a stream that does not play: <a href="mailto:support@radioglob.com">support@radioglob.com</a></p>
<footer>RadioGlob is a free internet radio. Built by one person.</footer>
</div>
</body>
</html>
`;
}

// Станции для страницы на нужном языке; одинаковые запросы к каталогу не повторяем
const cache = new Map();
async function listFor(pg, L) {
  const src = L === "en" && pg.en && pg.en.src ? { ...pg, ...pg.en.src } : pg;
  const key = JSON.stringify([src.kind, src.label, src.tag, src.cc]);
  if (!cache.has(key)) cache.set(key, await stationsFor(src));
  return cache.get(key);
}

const only = process.argv[2];
for (const pg of PAGES) {
  if (only && pg.slug !== only) continue;
  pg.built = {};
  for (const L of ["ru", "en"]) {
    if (L === "en" && !pg.en) continue;
    const list = await listFor(pg, L);
    if (list.length < 3) { console.log("ПРОПУСК (мало станций):", L, pg.slug, list.length); continue; }
    pg.built[L] = list;
  }
}
let built = 0;
for (const pg of PAGES) {
  if (!pg.built) continue;
  const hasBoth = !!(pg.built.ru && pg.built.en);
  for (const L of ["ru", "en"]) {
    if (!pg.built[L]) continue;
    const dir = dirFor(pg.slug, L);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page(pg, pg.built[L], L, hasBoth));
    built++;
    console.log((L + " " + pg.slug).padEnd(36), pg.built[L].length, "станций");
  }
}
if (!only) {
  fs.mkdirSync(path.join(ROOT, "radio"), { recursive: true });
  fs.mkdirSync(path.join(ROOT, "en", "radio"), { recursive: true });
  // хабы и sitemap — только по реально собранным страницам
  fs.writeFileSync(path.join(ROOT, "radio", "index.html"), hub("ru"));
  fs.writeFileSync(path.join(ROOT, "en", "radio", "index.html"), hub("en"));
  fs.mkdirSync(path.join(ROOT, "en", "about"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "en", "about", "index.html"), aboutPage());
  const urls = [`${SITE}/`, `${SITE}/radio/`, `${SITE}/en/radio/`, `${SITE}/en/about/`];
  for (const L of ["ru", "en"]) for (const p of PAGES) if (p.built && p.built[L]) urls.push(SITE + pagePath(p.slug, L));
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n") + `\n</urlset>\n`);
  console.log("Собрано страниц:", built, "адресов в sitemap:", urls.length);
}
