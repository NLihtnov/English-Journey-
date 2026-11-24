#!/usr/bin/env python3
"""Atualiza os vídeos da jornada (roda todo dia no GitHub Actions).

1. Resolve o ID de cada canal curado (data/channels.json) a partir do @handle.
2. Lê o feed RSS público de cada canal e grava os vídeos recentes em data/videos.json.
3. Para cada aula do currículo, busca no YouTube o melhor vídeo para cada tema
   e grava em data/lesson_videos.json (com alternativas). Entradas com mais de
   REFRESH_DAYS dias são buscadas de novo, então a sequência evolui com o tempo.

Só usa a biblioteca padrão do Python. Nenhuma chave de API é necessária.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
HEADERS = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8", "Cookie": "CONSENT=YES+1; SOCS=CAI"}
MAX_PER_CHANNEL = 12
KEEP_DAYS = 45
REFRESH_DAYS = 30
MAX_MINUTES = 40
TODAY = dt.date.today().isoformat()


def fetch(url: str, timeout: int = 20) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def load(name: str, default):
    p = DATA / name
    if p.exists():
        try:
            return json.loads(p.read_text("utf-8"))
        except json.JSONDecodeError:
            pass
    return default


def save(name: str, obj) -> None:
    (DATA / name).write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", "utf-8")


# ---------------------------------------------------------------- canais
def resolve_channel_id(handle: str) -> str | None:
    try:
        html = fetch(f"https://www.youtube.com/@{handle}")
    except Exception as e:  # noqa: BLE001
        print(f"  ! @{handle}: {e}", file=sys.stderr)
        return None
    for pat in (r'"externalId":"(UC[\w-]{22})"', r'itemprop="identifier" content="(UC[\w-]{22})"',
                r'"browseId":"(UC[\w-]{22})"', r'channel_id=(UC[\w-]{22})'):
        m = re.search(pat, html)
        if m:
            return m.group(1)
    return None


NS = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
      "media": "http://search.yahoo.com/mrss/"}


def read_feed(channel_id: str) -> list[dict]:
    xml = fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}")
    root = ET.fromstring(xml)
    out = []
    for e in root.findall("a:entry", NS)[:MAX_PER_CHANNEL]:
        vid = e.findtext("yt:videoId", default="", namespaces=NS)
        title = e.findtext("a:title", default="", namespaces=NS)
        group = e.find("media:group", NS)
        desc = group.findtext("media:description", default="", namespaces=NS) if group is not None else ""
        stats = group.find("media:community/media:statistics", NS) if group is not None else None
        link = e.find("a:link", NS)
        href = link.get("href", "") if link is not None else ""
        if "/shorts/" in href or "#shorts" in title.lower():
            continue
        out.append({
            "id": vid,
            "title": title,
            "published": e.findtext("a:published", default="", namespaces=NS)[:10],
            "views": int(stats.get("views", 0)) if stats is not None else 0,
            "desc": re.sub(r"\s+", " ", desc)[:220],
        })
    return out


def update_channels() -> None:
    cfg = load("channels.json", {"channels": []})["channels"]
    ids = load("channel_ids.json", {})
    old = {v["id"]: v for v in load("videos.json", {}).get("videos", [])}
    videos: dict[str, dict] = {}
    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()

    for ch in cfg:
        h = ch["handle"]
        cid = ch.get("id") or ids.get(h) or resolve_channel_id(h)
        if not cid:
            print(f"  ! canal não resolvido: @{h}", file=sys.stderr)
            continue
        ids[h] = cid
        try:
            items = read_feed(cid)
        except Exception as e:  # noqa: BLE001
            print(f"  ! feed @{h}: {e}", file=sys.stderr)
            continue
        for it in items:
            it.update(channel=ch["name"], handle=h, levels=ch["levels"], lang=ch["lang"],
                      firstSeen=old.get(it["id"], {}).get("firstSeen", TODAY))
            videos[it["id"]] = it
        print(f"  ✓ @{h}: {len(items)} vídeos")
        time.sleep(0.5)

    # mantém vídeos que saíram do feed mas ainda são recentes
    for vid, v in old.items():
        if vid not in videos and v.get("published", "") >= cutoff:
            videos[vid] = v

    lst = sorted(videos.values(), key=lambda v: v.get("published", ""), reverse=True)
    save("channel_ids.json", ids)
    save("videos.json", {"updated": TODAY, "count": len(lst), "videos": lst})
    print(f"videos.json: {len(lst)} vídeos")


# ---------------------------------------------------------------- aulas
def walk(obj, key):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == key:
                yield v
            else:
                yield from walk(v, key)
    elif isinstance(obj, list):
        for v in obj:
            yield from walk(v, key)


def minutes(length: str) -> float:
    parts = [int(p) for p in length.split(":") if p.isdigit()]
    total = 0
    for p in parts:
        total = total * 60 + p
    return total / 60


def search_youtube(query: str) -> list[dict]:
    url = "https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": query})
    html = fetch(url)
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", html, re.S)
    if not m:
        return []
    data = json.loads(m.group(1))
    out = []
    for r in walk(data, "videoRenderer"):
        vid = r.get("videoId")
        length = (r.get("lengthText") or {}).get("simpleText", "")
        if not vid or not length:
            continue  # ao vivo / sem duração
        mins = minutes(length)
        if mins < 1.5 or mins > MAX_MINUTES:
            continue  # evita Shorts e vídeos longos demais
        title = "".join(x.get("text", "") for x in (r.get("title") or {}).get("runs", []))
        channel = "".join(x.get("text", "") for x in (r.get("ownerText") or {}).get("runs", []))
        out.append({"id": vid, "title": title, "channel": channel, "duration": length})
        if len(out) >= 4:
            break
    return out


def update_lessons() -> None:
    cur = load("curriculum.json", {"phases": []})
    store = load("lesson_videos.json", {}).get("lessons", {})
    stale = (dt.date.today() - dt.timedelta(days=REFRESH_DAYS)).isoformat()
    done = fails = 0
    for phase in cur["phases"]:
        for u in phase["units"]:
            entries = store.get(u["id"], {})
            for label, query in u["videos"]:
                e = entries.get(query)
                if e and e.get("checked", "") >= stale and e.get("results"):
                    continue
                try:
                    results = search_youtube(query)
                except Exception as ex:  # noqa: BLE001
                    print(f"  ! busca '{query}': {ex}", file=sys.stderr)
                    results = []
                if results:
                    entries[query] = {"label": label, "checked": TODAY, "results": results}
                    done += 1
                else:
                    fails += 1
                time.sleep(1.0)
            store[u["id"]] = entries
    save("lesson_videos.json", {"updated": TODAY, "lessons": store})
    print(f"lesson_videos.json: {done} temas atualizados, {fails} falhas")


if __name__ == "__main__":
    what = sys.argv[1:] or ["channels", "lessons"]
    if "channels" in what:
        update_channels()
    if "lessons" in what:
        update_lessons()
