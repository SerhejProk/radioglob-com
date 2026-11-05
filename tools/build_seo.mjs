// Генератор страниц-подборок для поиска (SEO). Запуск:  node tools/build_seo.mjs
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

function metaLine(s) {
  let country = s.country;
  try { if (s.countrycode) country = new Intl.DisplayNames(["ru"], { type: "region" }).of(s.countrycode) || country; } catch (e) {}
  const bits = [country, s.bitrate ? s.bitrate + " kbps" : "", s.codec].filter(Boolean);
  return bits.join(" · ");
}

function playUrl(pg) {
  return pg.kind === "country" ? `${SITE}/?country=${pg.cc}` : `${SITE}/?pick=${pg.pick}`;
}

function page(pg, list) {
  const url = `${SITE}/radio/${pg.slug}/`;
  const others = PAGES.filter(p => p.slug !== pg.slug && p.group === pg.group).concat(PAGES.filter(p => p.group !== pg.group)).slice(0, 10);
  const ld = {
    "@context": "https://schema.org", "@type": "ItemList", name: pg.h1, url,
    itemListElement: list.map((s, i) => ({ "@type": "ListItem", position: i + 1, name: s.name.trim() }))
  };
  const faq = pg.faq.length ? {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: pg.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))
  } : null;
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(pg.title)} — RadioGlob</title>
<meta name="description" content="${esc(pg.desc)}">
<link rel="canonical" href="${url}">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<link rel="apple-touch-icon" href="/icon-180.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(pg.h1)} — RadioGlob">
<meta property="og:description" content="${esc(pg.desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/icon-512.png">
<style>${CSS}</style>
<script type="application/ld+json">${safeJson(ld)}</script>
${faq ? `<script type="application/ld+json">${safeJson(faq)}</script>` : ""}
<script>window.goatcounter = { path: function (p) { return location.host + p; } };</script>
<script data-goatcounter="https://serhej.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</head>
<body>
<div class="w">
<header class="t"><a href="/">📻 РАДИО</a> · <a href="/radio/" style="font-weight:400">Все подборки</a></header>
<h1>${esc(pg.h1)}</h1>
${pg.intro.map(t => `<p>${esc(t)}</p>`).join("\n")}
<a class="cta" href="${playUrl(pg)}">▶ Слушать в плеере</a>
<h2>Станции (${list.length})</h2>
<ol class="st">
${list.map(s => `<li><div><div class="n">${esc(s.name.trim())}</div><div class="m">${esc(metaLine(s))}</div></div><a class="pl" href="${SITE}/?station=${s.stationuuid}">▶ Слушать</a></li>`).join("\n")}
</ol>
${pg.faq.length ? "<h2>Частые вопросы</h2>\n" + pg.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n") : ""}
<h2>Другие подборки</h2>
<div class="tags">
${others.map(p => `<a href="/radio/${p.slug}/">${esc(p.h1)}</a>`).join("\n")}
</div>
<footer>RadioGlob — бесплатное интернет-радио: тысячи станций, избранное, записная книжка треков и микшер. Работает в браузере на телефоне и компьютере. Станции берутся из открытого каталога radio-browser.info; список обновляется при пересборке страницы (${TODAY}).</footer>
</div>
</body>
</html>
`;
}

function hub() {
  const groups = [...new Set(PAGES.map(p => p.group))];
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Радиостанции онлайн по темам и странам — RadioGlob</title>
<meta name="description" content="Подборки интернет-радио: для медитации, учёбы, детям, поп, рок, джаз, классика, радио Беларуси, Казахстана и России. Слушать бесплатно.">
<link rel="canonical" href="${SITE}/radio/">
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<style>${CSS}</style>
<script>window.goatcounter = { path: function (p) { return location.host + p; } };</script>
<script data-goatcounter="https://serhej.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</head>
<body>
<div class="w">
<header class="t"><a href="/">📻 РАДИО</a></header>
<h1>Радиостанции онлайн по темам и странам</h1>
<p>Выберите подборку и слушайте бесплатно прямо в браузере: без регистрации и скачивания.</p>
<a class="cta" href="/">▶ Открыть плеер</a>
${groups.map(g => `<h2>${esc(g)}</h2>\n<div class="tags">\n${PAGES.filter(p => p.group === g).map(p => `<a href="/radio/${p.slug}/">${esc(p.h1)}</a>`).join("\n")}\n</div>`).join("\n")}
<footer>RadioGlob — бесплатное интернет-радио.</footer>
</div>
</body>
</html>
`;
}

const only = process.argv[2];
let built = 0;
for (const pg of PAGES) {
  if (only && pg.slug !== only) continue;
  const list = await stationsFor(pg);
  if (list.length < 3) { console.log("ПРОПУСК (мало станций):", pg.slug, list.length); continue; }
  const dir = path.join(ROOT, "radio", pg.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), page(pg, list));
  pg.built = true;
  built++;
  console.log(pg.slug.padEnd(32), list.length, "станций");
}
if (!only) {
  fs.mkdirSync(path.join(ROOT, "radio"), { recursive: true });
  const ok = PAGES.filter(p => p.built);
  // хаб и sitemap — только по реально собранным страницам
  const keep = PAGES.splice(0, PAGES.length, ...ok);
  fs.writeFileSync(path.join(ROOT, "radio", "index.html"), hub());
  const urls = [`${SITE}/`, `${SITE}/radio/`, ...ok.map(p => `${SITE}/radio/${p.slug}/`)];
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map(u => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n") + `\n</urlset>\n`);
  console.log("Собрано страниц:", built, "из", keep.length);
}
