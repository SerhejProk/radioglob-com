"""Автотест сценариев радио в настоящем браузере (Edge) с подменой сети.

Запуск:  python tests/test_scenarios.py [путь к index.html]   (по умолчанию ../index.html)
Код выхода: 0 — все сценарии прошли, 1 — есть провалы.

Каталог radio-browser, потоки и «что играет» подменяются, поэтому тест не зависит от интернета.
Сценарии — ошибки, найденные ревью 03.11.2026:
  1. первый адрес станции мёртв — пробуется запасной, а не сразу «не отвечает»;
  2. открыли «Избранное», пока грузится страна — опоздавший список не рисуется поверх;
  3. переключили станцию — песня прошлой станции не попадает в плеер и в книжку;
  4. радио открыто в двух вкладках — записи книжки и избранного из обеих сохраняются.
"""
import functools
import http.server
import json
import os
import sys
import threading
import time

from playwright.sync_api import sync_playwright

HTML = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..", "index.html"))


def station(i, **kw):
    s = {"stationuuid": f"test-{i}", "name": f"Тестовая станция {i}", "url": f"https://s{i}.test/live",
         "url_resolved": f"https://s{i}.test/live", "homepage": "", "favicon": "", "tags": "", "countrycode": "FR",
         "country": "France", "language": "french", "bitrate": 128, "codec": "MP3", "hls": 0}
    s.update(kw)
    return s


CATALOG = [station(i) for i in range(1, 4)]


class State:
    stream_hits = []      # какие адреса потоков запрашивал плеер
    catalog_delay = 0.0   # задержка ответа каталога, сек
    song_delay = 0.0      # задержка ответа «что играет», сек


def route(r):
    url = r.request.url
    if url.startswith("http://127.0.0.1"):
        return r.continue_()
    if "/json/stations/" in url:
        time.sleep(State.catalog_delay)
        return r.fulfill(status=200, content_type="application/json", body=json.dumps(CATALOG))
    if "/json/url/" in url:
        return r.fulfill(status=200, content_type="application/json", body="{}")
    if "status-json.xsl" in url:
        time.sleep(State.song_delay)
        return r.fulfill(status=200, content_type="application/json",
                         body=json.dumps({"icestats": {"source": {"title": "Песня станции A"}}}))
    if ".test/" in url:
        State.stream_hits.append(url)
        return r.fulfill(status=404, body="")
    return r.abort()  # шрифты, счётчик, CDN — в тесте не нужны


def serve(folder):
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=folder)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def open_page(ctx, url):
    p = ctx.new_page()
    p.route("**/*", route)
    p.goto(url, wait_until="load")
    p.wait_for_timeout(800)
    return p


def t1_fallback(ctx, url):
    p = open_page(ctx, url)
    State.stream_hits = []
    p.evaluate("""() => playStation({stationuuid: 'fb', name: 'Два адреса', countrycode: 'FR', tags: '',
        url_resolved: 'https://a.test/one', urls: ['https://a.test/one', 'https://b.test/two']})""")
    p.wait_for_timeout(2500)
    tried_second = any("b.test/two" in u for u in State.stream_hits)
    p.close()
    return tried_second, f"запрошены адреса: {sorted(set(State.stream_hits))}"


def t2_race(ctx, url):
    p = open_page(ctx, url)
    State.catalog_delay = 2.0
    p.evaluate("() => { loadCountry('FR'); }")
    p.wait_for_timeout(200)
    p.evaluate("() => document.querySelectorAll('.chip[data-p]')[PRESETS.findIndex(x => x.fav)].click()")
    p.wait_for_timeout(3500)
    State.catalog_delay = 0.0
    cards = p.evaluate("() => document.querySelectorAll('#grid .card').length")
    p.close()
    return cards == 0, f"в «Избранном» (пустом) карточек после опоздавшего ответа: {cards}"


def t3_stale_song(ctx, url):
    p = open_page(ctx, url)
    State.song_delay = 1.5
    p.evaluate("""() => {
        Object.defineProperty(audio, 'paused', { get: () => false, configurable: true });
        current = {stationuuid: 'A', name: 'Станция A', countrycode: 'FR', tags: '', url_resolved: 'https://a.test/live'};
        urlIndex = 0;
        watchSong();
        playStation({stationuuid: 'B', name: 'Станция B', countrycode: 'FR', tags: '', url_resolved: 'https://b.test/live'});
    }""")
    p.wait_for_timeout(2500)
    State.song_delay = 0.0
    song = p.evaluate("() => nowSong")
    p.close()
    return song == "", f"песня у станции B: {song!r}"


def t4_two_tabs(ctx, url):
    a, b = open_page(ctx, url), open_page(ctx, url)
    for p, song in ((a, "Песня из вкладки 1"), (b, "Песня из вкладки 2")):
        p.evaluate("""song => { current = {stationuuid: 'x', name: 'Станция X', countrycode: 'FR', tags: ''};
                       nowSong = song; $('save').onclick(); }""", song)
        p.wait_for_timeout(300)
    for p, i in ((a, 0), (b, 1)):
        p.evaluate(f"""() => {{ const s = {json.dumps(CATALOG[i])}; render([s]);
                        document.querySelector('#grid .card .fav').click(); }}""")
        p.wait_for_timeout(300)
    notes = a.evaluate("() => (JSON.parse(localStorage.getItem('radio.notes')) || []).map(n => n.song)")
    favs = a.evaluate("() => (JSON.parse(localStorage.getItem('radio.favs')) || []).map(s => s.stationuuid)")
    a.close(); b.close()
    ok = len(notes) == 2 and set(favs) == {"test-1", "test-2"}
    return ok, f"книжка: {notes}; избранное: {favs}"


def main():
    srv = serve(os.path.dirname(HTML))
    url = f"http://127.0.0.1:{srv.server_port}/{os.path.basename(HTML)}?theme=night"
    print("Тест:", HTML)
    fails = 0
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel="msedge", headless=True, args=["--autoplay-policy=no-user-gesture-required"])
        for name, fn in (("1. запасной адрес станции", t1_fallback), ("2. гонка списков", t2_race),
                         ("3. песня прошлой станции", t3_stale_song), ("4. две вкладки", t4_two_tabs)):
            ctx = br.new_context()
            try:
                ok, info = fn(ctx, url)
            except Exception as e:  # сломанный сценарий — тоже провал
                ok, info = False, f"исключение: {e}"
            ctx.close()
            fails += not ok
            print(f"  {'ПРОШЁЛ ' if ok else 'ПРОВАЛ  '} {name} — {info}")
        br.close()
    srv.shutdown()
    print("ИТОГ:", "все сценарии прошли" if not fails else f"провалов: {fails}")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
