# SPDX-License-Identifier: MIT
# Copyright (c) 2026 TigerTag

"""Check the built site for what search engines and answer engines need.

The rule behind each check is in .agents/rules/seo-geo.md. Run after
`site/build.py`, on the folder it wrote:

    python site/build.py --out _site && python site/seo_check.py _site

Errors fail the run (exit 1): they break indexing or mislead a reader.
Warnings are printed and do not: they cost snippet quality.
"""

import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import DOWNLOAD_URL, LANGS, HTML_LANG, SITE_URL, page_path  # noqa: E402

TITLE_MAX, TITLE_HARD = 60, 70          # characters shown by search results / clearly broken
DESC_MIN, DESC_MAX, DESC_HARD = 50, 160, 200
REQUIRED_LD = {"Organization", "WebSite", "SoftwareApplication", "SoftwareSourceCode", "FAQPage"}


class Page(HTMLParser):
    """Collects what the checks read, without a third-party parser."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.title, self.meta, self.links, self.imgs = "", {}, [], []
        self.ids, self.hrefs, self.h1, self.faq_items, self.ld = set(), [], 0, 0, []
        self._in_title = self._in_ld = False
        self._ld_buf = ""

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if "id" in a:
            self.ids.add(a["id"])
        if tag == "title":
            self._in_title = True
        elif tag == "meta" and ("name" in a or "property" in a):
            self.meta.setdefault(a.get("name") or a.get("property"), []).append(a.get("content", ""))
        elif tag == "link":
            self.links.append(a)
        elif tag == "img":
            self.imgs.append(a)
        elif tag == "a" and "href" in a:
            self.hrefs.append(a["href"])
        elif tag == "h1":
            self.h1 += 1
        elif tag == "details" and self._faq_depth():
            self.faq_items += 1
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld, self._ld_buf = True, ""
        if tag == "div" and "faq" in (a.get("class") or "").split():
            self._faq = True

    def _faq_depth(self):
        return getattr(self, "_faq", False)

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag == "script" and self._in_ld:
            self._in_ld = False
            self.ld.append(self._ld_buf)
        elif tag == "section":
            self._faq = False

    def handle_data(self, data):
        if self._in_title:
            self.title += data
        if self._in_ld:
            self._ld_buf += data


def check(out):
    errors, warnings = [], []
    expected_alternates = {HTML_LANG.get(l, l): SITE_URL + page_path(l) for l in LANGS}
    expected_alternates["x-default"] = SITE_URL
    titles, descs = {}, {}

    for lang in LANGS:
        rel = page_path(lang) + "index.html"
        path = out / rel
        if not path.exists():
            errors.append(f"{rel}: page missing")
            continue
        p = Page()
        p.feed(path.read_text(encoding="utf-8"))
        where = rel

        # Title and description: present, sized for a result snippet, unique per language.
        title = p.title.strip()
        desc = (p.meta.get("description") or [""])[0]
        for label, value, lo, hi, hard in (("title", title, 10, TITLE_MAX, TITLE_HARD), ("description", desc, DESC_MIN, DESC_MAX, DESC_HARD)):
            if not value:
                errors.append(f"{where}: no {label}")
            elif len(value) > hard:
                errors.append(f"{where}: {label} is {len(value)} characters (over {hard}): {value!r}")
            elif len(value) > hi:
                warnings.append(f"{where}: {label} is {len(value)} characters (results show ~{hi})")
            elif len(value) < lo and HTML_LANG.get(lang, lang) != "zh-Hans":
                warnings.append(f"{where}: {label} is only {len(value)} characters")
        titles.setdefault(title, []).append(lang)
        descs.setdefault(desc, []).append(lang)

        # One h1: the page's single subject.
        if p.h1 != 1:
            errors.append(f"{where}: {p.h1} <h1> (exactly one expected)")

        # Canonical and hreflang: every language points to every language, and x-default.
        canon = [l.get("href") for l in p.links if l.get("rel") == "canonical"]
        if canon != [SITE_URL + page_path(lang)]:
            errors.append(f"{where}: canonical is {canon}, expected {SITE_URL + page_path(lang)}")
        alts = {l.get("hreflang"): l.get("href") for l in p.links if l.get("rel") == "alternate" and l.get("hreflang")}
        if alts != expected_alternates:
            missing = sorted(set(expected_alternates) - set(alts))
            wrong = sorted(k for k in alts if alts[k] != expected_alternates.get(k))
            errors.append(f"{where}: hreflang set incomplete or wrong (missing {missing}, wrong {wrong})")

        # Sharing cards.
        for prop in ("og:title", "og:description", "og:image", "og:image:alt", "og:url", "twitter:card"):
            if not (p.meta.get(prop) or [""])[0]:
                errors.append(f"{where}: no {prop}")

        # Images: an alt attribute on every one (empty only for a decorative duplicate).
        for img in p.imgs:
            if "alt" not in img:
                errors.append(f"{where}: <img src={img.get('src')!r}> has no alt attribute")
        if not any(img.get("alt") and img.get("fetchpriority") == "high" for img in p.imgs):
            errors.append(f"{where}: the hero picture has no alt text")

        # Structured data: valid JSON, the expected types, the FAQ the reader sees.
        types = []
        for raw in p.ld:
            try:
                data = json.loads(raw)
            except ValueError as e:
                errors.append(f"{where}: JSON-LD does not parse ({e})")
                continue
            types.append(data.get("@type"))
            if data.get("@type") == "FAQPage" and len(data.get("mainEntity", [])) != p.faq_items:
                errors.append(f"{where}: FAQPage lists {len(data.get('mainEntity', []))} questions, the page shows {p.faq_items}")
        missing_ld = REQUIRED_LD - set(types)
        if missing_ld:
            errors.append(f"{where}: JSON-LD missing {sorted(missing_ld)}")

        # In-page links land somewhere.
        for href in p.hrefs:
            if href.startswith("#") and len(href) > 1 and href[1:] not in p.ids:
                errors.append(f"{where}: link {href} has no target")

        # Every download button leads to the published GitHub Release.
        if DOWNLOAD_URL not in p.hrefs:
            errors.append(f"{where}: no link to {DOWNLOAD_URL}")

        # The machine-readable description is advertised.
        if not any(l.get("rel") == "alternate" and (l.get("href") or "").endswith("llms.txt") for l in p.links):
            warnings.append(f"{where}: no <link rel=alternate> to llms.txt")

    for value, langs in list(titles.items()) + list(descs.items()):
        if value and len(langs) > 1:
            errors.append(f"same title or description in {', '.join(langs)}: {value!r} (an untranslated page?)")

    sitemap = (out / "sitemap.xml").read_text(encoding="utf-8") if (out / "sitemap.xml").exists() else ""
    for lang in LANGS:
        if f"<loc>{SITE_URL + page_path(lang)}</loc>" not in sitemap:
            errors.append(f"sitemap.xml: {SITE_URL + page_path(lang)} missing")
    if "<lastmod>" not in sitemap:
        warnings.append("sitemap.xml: no <lastmod>")
    robots = (out / "robots.txt").read_text(encoding="utf-8") if (out / "robots.txt").exists() else ""
    if f"Sitemap: {SITE_URL}sitemap.xml" not in robots:
        errors.append("robots.txt: no Sitemap line")
    if re.search(r"(?m)^Disallow: /\s*$", robots):
        errors.append("robots.txt: disallows the whole site")
    if not (out / "llms.txt").exists():
        errors.append("llms.txt missing at the site root")
    return errors, warnings


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "_site")
    errors, warnings = check(out)
    for w in warnings:
        print(f"warning: {w}")
    for e in errors:
        print(f"error: {e}")
    print(f"seo_check: {len(LANGS)} pages, {len(errors)} error(s), {len(warnings)} warning(s)")
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
