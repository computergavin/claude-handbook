#!/usr/bin/env python3
"""Build the handbook: chapters/*.md -> build/handbook.html (single self-contained file).

Usage:
    python build.py              # build once
    python build.py --serve      # build, then serve on http://localhost:8000
    python build.py --watch      # rebuild whenever a chapter or the CSS changes
"""

from __future__ import annotations

import html
import json
import re
import sys
import time
from datetime import date
from pathlib import Path

try:
    import markdown
except ImportError:
    sys.exit("Missing dependency. Run:  pip install -r requirements.txt")

ROOT = Path(__file__).parent
CHAPTERS = ROOT / "chapters"
ASSETS = ROOT / "assets"
BUILD = ROOT / "build"

CALLOUT_KINDS = {"warning", "caution", "note", "pattern", "field"}


# --------------------------------------------------------------------------
# front matter
# --------------------------------------------------------------------------

def parse_front_matter(text: str) -> tuple[dict, str]:
    """Minimal YAML-ish front matter: `key: value` and `- item` lists. No deps."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    raw, body = text[3:end], text[end + 4:]
    meta: dict = {}
    key = None
    for line in raw.splitlines():
        if not line.strip():
            continue
        if line.lstrip().startswith("- ") and key:
            meta.setdefault(key, [])
            if isinstance(meta[key], list):
                meta[key].append(line.lstrip()[2:].strip())
        elif ":" in line:
            key, _, value = line.partition(":")
            key = key.strip()
            value = value.strip()
            meta[key] = value if value else []
    return meta, body.lstrip("\n")


# --------------------------------------------------------------------------
# callouts:  > [!WARNING] Optional title
# --------------------------------------------------------------------------

CALLOUT_RE = re.compile(r"^> \[!(\w+)\]\s*(.*)$")


def extract_callouts(body: str) -> tuple[str, dict]:
    """Replace callout blocks with placeholders; return the rendered HTML separately."""
    lines = body.splitlines()
    out: list[str] = []
    stash: dict[str, str] = {}
    i = 0
    while i < len(lines):
        m = CALLOUT_RE.match(lines[i])
        if not m or m.group(1).lower() not in CALLOUT_KINDS:
            out.append(lines[i])
            i += 1
            continue
        kind = m.group(1).lower()
        title = m.group(2).strip() or kind.upper()
        i += 1
        inner: list[str] = []
        while i < len(lines) and lines[i].startswith(">"):
            inner.append(lines[i][1:].lstrip(" "))
            i += 1
        token = f"CALLOUTTOKEN{len(stash):04d}"
        stash[token] = (kind, title, "\n".join(inner))
        out.append("")
        out.append(token)
        out.append("")
    return "\n".join(out), stash


def render_callouts(rendered: str, stash: dict, md) -> str:
    for token, (kind, title, inner) in stash.items():
        md.reset()
        inner_html = md.convert(inner)
        block = (
            f'<aside class="callout callout--{kind}">'
            f'<p class="callout__label">{html.escape(title)}</p>'
            f'{inner_html}</aside>'
        )
        rendered = rendered.replace(f"<p>{token}</p>", block)
    return rendered


# --------------------------------------------------------------------------
# section numbering in the margin rail
# --------------------------------------------------------------------------

def number_sections(chapter_html: str, chapter_no: int) -> tuple[str, list]:
    """Prefix each <h2> with a rail number like 4.3 and collect them for the TOC."""
    entries: list = []
    counter = {"n": 0}

    def repl(match: re.Match) -> str:
        counter["n"] += 1
        num = f"{chapter_no}.{counter['n']}"
        attrs, text = match.group(1), match.group(2)
        entries.append((num, re.sub(r"<[^>]+>", "", text)))
        return (
            f'<h2{attrs}><span class="rail" aria-hidden="true">{num}</span>'
            f'<span class="h2-text">{text}</span></h2>'
        )

    return re.sub(r"<h2([^>]*)>(.*?)</h2>", repl, chapter_html, flags=re.S), entries


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------

def build() -> Path:
    book = json.loads((ROOT / "book.json").read_text(encoding="utf-8"))
    css = (ASSETS / "book.css").read_text(encoding="utf-8")
    js = "\n".join(
        (ASSETS / name).read_text(encoding="utf-8")
        for name in ("book.js", "warp.js", "theme.js")
    )

    md = markdown.Markdown(
        extensions=["extra", "sane_lists", "toc", "codehilite"],
        extension_configs={"codehilite": {"guess_lang": False, "noclasses": False}},
    )

    chapters_html: list[str] = []
    toc_html: list[str] = []
    stale: list[str] = []
    last_updated: date | None = None

    for idx, filename in enumerate(book["chapters"]):
        path = CHAPTERS / filename
        if not path.exists():
            print(f"  ! missing {filename} — skipped")
            continue

        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        title = meta.get("title", path.stem)
        status = str(meta.get("status", "draft")).lower()
        verified = str(meta.get("verified", "")).strip()
        sources = meta.get("sources", [])
        if isinstance(sources, str):
            sources = [sources] if sources else []

        body, stash = extract_callouts(body)
        md.reset()
        rendered = md.convert(body)
        rendered = render_callouts(rendered, stash, md)
        rendered, sections = number_sections(rendered, idx)

        if verified:
            try:
                vdate = date.fromisoformat(verified)
                age = (date.today() - vdate).days
                if age > 90:
                    stale.append(f"{filename} ({age}d)")
                if last_updated is None or vdate > last_updated:
                    last_updated = vdate
            except ValueError:
                pass

        chapter_id = f"ch{idx}"
        num_label = "—" if idx == 0 else f"{idx:02d}"

        meta_bits = [f'<span class="tag tag--{html.escape(status)}">{html.escape(status)}</span>']
        if verified:
            meta_bits.append(f'<span class="verified">verified {html.escape(verified)}</span>')
        if sources:
            links = " · ".join(
                f'<a href="{html.escape(s)}">{html.escape(re.sub(r"^https?://", "", s)[:52])}</a>'
                if s.startswith("http") else html.escape(s)
                for s in sources
            )
            meta_bits.append(f'<span class="sources">{links}</span>')

        chapters_html.append(
            f'<section class="sheet chapter" id="{chapter_id}">'
            f'<p class="chapter__tab">{num_label}</p>'
            f'<header class="chapter__head">'
            f'<h1>{html.escape(title)}</h1>'
            f'<p class="chapter__meta">{"".join(meta_bits)}</p>'
            f'</header>{rendered}'
            f'<a class="chapter__back" href="#contents">&uarr; Contents</a>'
            f'</section>'
        )

        subs = "".join(
            f'<li><span class="toc__num">{n}</span>{html.escape(t)}</li>' for n, t in sections
        )
        toc_html.append(
            f'<li class="toc__chapter"><a href="#{chapter_id}">'
            f'<span class="toc__num">{num_label}</span>'
            f'<span class="toc__title">{html.escape(title)}</span></a>'
            f'<ol class="toc__sections">{subs}</ol></li>'
        )

    doc = f"""<!DOCTYPE html>
<html lang="en" data-theme="dark"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(book["title"])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<script>try{{var t=localStorage.getItem('wwc-theme');
if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}}catch(e){{}}</script>
<style>{css}</style>
</head><body>

<header class="topbar">
  <span class="topbar__mark">Working&nbsp;With&nbsp;<span>Claude</span></span>
  <span class="topbar__spacer"></span>
  <a href="#contents">Contents</a>
  <label class="searchbox">
    <input id="q" type="search" placeholder="Search the handbook" autocomplete="off" spellcheck="false">
    <kbd>&#8984;K</kbd>
  </label>
</header>

<div class="results" id="results"><div class="results__inner" id="results-inner"></div></div>

<section class="sheet cover">
  <p class="cover__stamp">Internal &middot; living document</p>
  <h1 class="cover__title">{html.escape(book["title"])}</h1>
  <p class="cover__sub">{html.escape(book.get("subtitle", ""))}</p>
  <dl class="cover__plate">
    <div><dt>Compiled by</dt><dd>{html.escape(book.get("author", ""))}</dd></div>
    <div><dt>Edition</dt><dd>{html.escape(book.get("edition", ""))}</dd></div>
    <div><dt>Last updated</dt><dd>{last_updated.isoformat() if last_updated else "&mdash;"}</dd></div>
    <div><dt>Built</dt><dd>{date.today().isoformat()}</dd></div>
    <div><dt>Chapters</dt><dd>{len(chapters_html)}</dd></div>
  </dl>
  <p class="cover__note">This handbook describes tools that change monthly. Every chapter
  carries a verification date. Anything older than 90 days is suspect until re-checked
  against the primary source.</p>
</section>

<nav class="sheet toc" id="contents">
  <h2 class="toc__head">Contents</h2>
  <ol class="toc__list">{"".join(toc_html)}</ol>
</nav>

<main>{"".join(chapters_html)}</main>

<footer class="sheet colophon">
  <p>Set in Source Serif 4, IBM Plex Sans Condensed &amp; IBM Plex Mono &middot;
  built with <code>python build.py</code></p>
</footer>

<script>{js}</script>
</body></html>"""

    BUILD.mkdir(exist_ok=True)
    out = BUILD / "handbook.html"
    out.write_text(doc, encoding="utf-8")

    print(f"  built {out}  ({len(chapters_html)} chapters, {len(doc) // 1024} KB)")
    if stale:
        print("  stale (>90 days since verified): " + ", ".join(stale))
    return out


def watch() -> None:
    print("watching chapters/ and assets/ — Ctrl+C to stop")
    seen: dict = {}
    while True:
        changed = False
        for f in (list(CHAPTERS.glob("*.md")) + list(ASSETS.glob("*.css"))
                  + list(ASSETS.glob("*.js")) + [ROOT / "book.json"]):
            stamp = f.stat().st_mtime
            if seen.get(f) != stamp:
                seen[f] = stamp
                changed = True
        if changed:
            print(f"[{time.strftime('%H:%M:%S')}] rebuilding")
            try:
                build()
            except Exception as exc:  # keep the watcher alive through typos
                print(f"  ! {exc}")
        time.sleep(1)


if __name__ == "__main__":
    build()
    if "--watch" in sys.argv:
        watch()
    elif "--serve" in sys.argv:
        import http.server
        import socketserver

        class Handler(http.server.SimpleHTTPRequestHandler):
            def __init__(self, *a, **kw):
                super().__init__(*a, directory=str(BUILD), **kw)

        print("serving http://localhost:8000/handbook.html — Ctrl+C to stop")
        with socketserver.TCPServer(("", 8000), Handler) as httpd:
            httpd.serve_forever()
