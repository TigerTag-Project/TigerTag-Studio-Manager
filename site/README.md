# The showcase site

The public page of Tiger Studio Manager, published on GitHub Pages:
<https://tigertag-project.github.io/TigerTag-Studio-Manager/>

It presents the app, shows its screenshots and leads to the download (the latest GitHub
Release). It is static HTML, one page per language, built by [`build.py`](build.py) and
published by [`pages.yml`](../.github/workflows/pages.yml) on every push to `main` that
touches `site/`, the pictures it uses, `llms.txt` or `package.json` (a release commit
bumps it, so the page shows the new version).

## Files

| File | Contents |
|---|---|
| [`template.html`](template.html) | The page. Every `{{key}}` is replaced by the text of that key in the page's language; `{{@…}}` keys are filled by `build.py` (language menu, `hreflang` links, JSON-LD, FAQ, version, download URL). |
| [`i18n/en.json`](i18n/en.json) | The English text, the reference: every other language has exactly its keys. |
| `i18n/<lang>.json` | One file per app locale: `fr`, `de`, `es`, `it`, `zh` (Simplified Chinese), `pt` (Brazil), `pt-pt` (Portugal), `pl`, `ru`, `nl`. |
| [`site.css`](site.css), [`site.js`](site.js) | The look of the TigerTag protocol site (dark by default, light on request) and the theme / language buttons. Loaded with `?v=` and a hash of the file, so a new version is never hidden by a browser cache. |
| [`assets/`](assets/) | Web-sized copies of the README screenshots (WebP) and the sharing card `og.jpg` (1200 × 630). The other pictures are copied from `assets/` at build time (`ASSETS` in `build.py`). |

The download buttons all point to `DOWNLOAD_URL` in `build.py`, the latest GitHub Release —
the same link as the README's release badge. The version shown comes from `package.json`.

## Editing

- **Change a text**: edit `i18n/en.json`, then the same key in every other language.
- **Add a text**: add the key to every `i18n/*.json` file and use `{{key}}` in `template.html`.
  The build refuses a language that misses a key, has an unknown one or an empty value.
- **Add a FAQ entry**: add `faqN_q` / `faqN_a` in every language; the page and the `FAQPage`
  JSON-LD follow.
- **Check and preview**:

  ```bash
  python3 site/build.py --check
  python3 site/build.py && python3 -m http.server 8000 --directory _site
  python3 site/build.py --out _site && python3 site/seo_check.py _site
  ```

  `seo_check.py` checks every page (title and description length, one `h1`, canonical and
  `hreflang`, sharing cards, `alt` text, JSON-LD types and the FAQ they mirror, in-page links,
  the download link, sitemap, robots, `llms.txt`); the rule behind it is
  [`.agents/rules/seo-geo.md`](../.agents/rules/seo-geo.md).

The English page is the root (`/`), every other language has its own folder (`/fr/`,
`/zh/`…). A language chosen in the menu is remembered, and the English root forwards to it on
the next visit.
