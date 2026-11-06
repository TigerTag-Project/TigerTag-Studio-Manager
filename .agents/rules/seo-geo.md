# Search and answer engines (SEO / GEO) for the showcase site

**Rule.** The showcase site built from `site/` (published on GitHub Pages) is written to be
found, understood and quoted correctly by search engines and AI answer engines, **with
verifiable facts only**. `site/seo_check.py` checks it before every deploy; a failing check is
fixed, never bypassed.

**Why.** Engines reward pages that answer clearly, agree with their sources and can be
verified; they demote pages that claim without proof and treat text hidden for crawlers as
manipulation. One unsupported superlative costs more trust than it buys rank.

**How.**

1. **Facts, not claims.** Every statement comes from this repository (README, `FEATURES.md`,
   `CHANGELOG.md`, `package.json`) and can be checked there. Numbers say where they come from
   (the facts row names the README version). No "the best", no comparison with other projects
   or printer makers, no prices. Never text or instructions aimed only at crawlers.
2. **Answer first.** A section opens with a sentence that answers its heading. Questions people
   ask live in the visible FAQ, mirrored by the `FAQPage` JSON-LD (`build.py` generates both
   from the same `faqN_q` / `faqN_a` keys).
3. **One complete page per language.** `site/build.py` writes a static page for each of the
   eleven locales (`LANGS`): real text, no client-side translation, a self canonical,
   `hreflang` to every language plus `x-default`, `og:locale` with its alternates.
4. **Titles and descriptions.** Title ≤ 60 characters, description 50–160, unique per
   language; `seo_check.py` warns past 60 / 160 and fails past 70 / 200 or on a duplicate.
5. **Structured data mirrors the page.** `Organization`, `WebSite`, `SoftwareApplication`
   (version from `package.json`, download URL), `SoftwareSourceCode` and `FAQPage`. One `<h1>`.
6. **Downloads.** Every download button points to the latest GitHub Release
   (`DOWNLOAD_URL` in `site/build.py`); never an invented or versioned file URL.
7. **Images.** A descriptive `alt` in the page's language on every screenshot and product
   picture, width and height set, web-sized copies in `site/assets/`.
8. **Same names everywhere.** Tiger Studio Manager, Tiger Studio Web, TigerTag, TigerData+,
   TigerSquad, TigerPOD, TigerScale, TigerSpool, Tiger Touch, TigerTag RFID Connect — spelled
   as in the README in every language.
9. **Checks.** `python3 site/build.py --check`, then
   `python3 site/build.py --out _site && python3 site/seo_check.py _site`. The deploy workflow
   (`.github/workflows/pages.yml`) runs the same and refuses to publish a failing site.
