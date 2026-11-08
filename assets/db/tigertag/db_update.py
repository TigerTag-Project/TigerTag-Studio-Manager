# SPDX-License-Identifier: Apache-2.0
#
# TigerTag NFC (RFID-compatible) Guide
# Copyright (c) 2025-2026 TigerSystem.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#
# Implementing the TigerTag protocol requires no licence and no payment.
# See LICENSING.md.

import json
import os
import sys

import requests

API_BASE = "https://api.tigertag.io/api:tigertag"
HTTP_TIMEOUT = 30

# last_update key  ->  (API endpoint path,           local filename)
DATASETS = {
    "versions":           ("version/get/all",            "id_version.json"),
    "types":              ("type/get/all",               "id_type.json"),
    "brands":             ("brand/get/all",              "id_brand.json"),
    "filament_diameters": ("diameter/filament/get/all",  "id_diameter.json"),
    "filament_materials": ("material/get/all",           "id_material.json"),
    "aspects":            ("aspect/get/all",             "id_aspect.json"),
    "measure_units":      ("measure_unit/get/all",       "id_measure_unit.json"),
}

TARGET_FOLDER = os.path.dirname(os.path.abspath(__file__))
LAST_UPDATE_PATH = os.path.join(TARGET_FOLDER, "last_update.json")


def load_local_last_update():
    if not os.path.exists(LAST_UPDATE_PATH):
        return {}
    try:
        with open(LAST_UPDATE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {}


def fetch_remote_last_update():
    response = requests.get(f"{API_BASE}/all/last_update", timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    return response.json(), response.text

def write_atomic(path, text):
    """Write via a temp file + rename, so a good file is never half-replaced.

    `open(path, "w")` truncates BEFORE writing: a crash, a full disk or a killed
    process between those two moments leaves a truncated JSON that the app then
    fails to parse. `os.replace` is atomic on POSIX and on Windows, so the file at
    `path` is either entirely the old one or entirely the new one.
    """
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            try:
                os.remove(tmp)
            except OSError:
                pass


def validate_dataset(data, filename):
    """Refuse anything that would silently destroy a good reference file.

    Every dataset here is a non-empty JSON array. A 200 response is NOT proof of
    a good payload: an API can answer `[]` during a migration, `{"error": ...}`
    on a soft failure, or an HTML page from a proxy — all of which parse or fail
    in ways that would otherwise overwrite live data. The bar is deliberately
    crude and absolute: a list, and not empty.
    """
    if not isinstance(data, list):
        raise RuntimeError(
            f"{filename}: expected a JSON array, got {type(data).__name__} — refusing to overwrite"
        )
    if not data:
        raise RuntimeError(f"{filename}: the API returned an EMPTY array — refusing to overwrite")


def download_dataset(endpoint, filename):
    url = f"{API_BASE}/{endpoint}"
    response = requests.get(url, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    try:
        data = response.json()
    except ValueError as e:
        raise RuntimeError(f"Invalid JSON received for {filename}: {e}")
    validate_dataset(data, filename)
    write_atomic(os.path.join(TARGET_FOLDER, filename),
                 json.dumps(data, ensure_ascii=False, indent=2))


# ── The product catalogue ───────────────────────────────────────────────────
# Not in DATASETS above, because it does not behave like the reference tables:
# it is a paged POST rather than a single GET, and `all/last_update` carries no
# `products` key, so there is no server timestamp to compare before downloading.
#
# Named `id_catalog.json` like its `id_*.json` neighbours: it is the same kind of
# reference data — it holds every TigerTag+ product id.
# It is bundled with the app so a fresh install has a catalogue on FIRST LAUNCH,
# offline, instead of an empty Search view until the first sync lands. Keeping it
# in git also makes the catalogue's own evolution reviewable — a new field shows
# up as a diff instead of silently reaching the renderer — and gives an entry
# count to tell users about, for new brands and filaments.
CATALOG_FILE = "id_catalog.json"
CATALOG_PER_PAGE = 1000
CATALOG_MAX_PAGES = 100   # runaway guard, NOT a catalogue-size limit


def fetch_catalog():
    """Walk every page of `product/get/all` and return the products as one list."""
    items, page, pages = [], 1, 0
    while page and pages < CATALOG_MAX_PAGES:
        response = requests.post(
            f"{API_BASE}/product/get/all",
            json={"page": page, "per_page": CATALOG_PER_PAGE},
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        payload = response.json()
        items.extend(payload.get("items") or [])
        pages += 1
        page = payload.get("nextPage")
    if page:
        raise RuntimeError(f"stopped after {CATALOG_MAX_PAGES} pages — raise CATALOG_MAX_PAGES")
    return items


def sync_catalog():
    """Rewrite id_catalog.json only when the catalogue actually differs.

    Products sorted by id and keys sorted within each product, so an unchanged
    catalogue renders byte-identical: no rewrite, no 1.5 MB diff in the repo, and
    the `git diff` that DOES appear is a real change worth reading.
    """
    items = sorted(
        ({k: p[k] for k in sorted(p)} for p in fetch_catalog() if p and p.get("id") is not None),
        key=lambda p: p["id"],
    )
    if not items:
        raise RuntimeError("the API returned no products — refusing to overwrite the bundled catalogue")

    fresh = json.dumps(items, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    path = os.path.join(TARGET_FOLDER, CATALOG_FILE)
    current = None
    if os.path.exists(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                current = f.read()
        except OSError:
            pass

    newest = max((p["updated_at"] for p in items if isinstance(p.get("updated_at"), int)), default=None)
    if fresh == current:
        print(f"[ok]   {CATALOG_FILE}: up to date ({len(items)} products)")
        return None, newest

    write_atomic(path, fresh)
    before = current.count('"id":') if current else 0
    print(f"[sync] {CATALOG_FILE}: {len(items)} products"
          + (f" (was {before})" if current else " (new file)"))
    return len(items), newest


def sync():
    remote_data, remote_text = fetch_remote_last_update()
    local_data = load_local_last_update()

    updated = []
    for key, (endpoint, filename) in DATASETS.items():
        remote_ts = remote_data.get(key)
        local_ts = local_data.get(key)
        local_file = os.path.join(TARGET_FOLDER, filename)

        if remote_ts is None:
            print(f"[skip] {key}: not present in API last_update payload")
            continue

        if remote_ts == local_ts and os.path.exists(local_file):
            print(f"[ok]   {filename}: up to date ({remote_ts})")
            continue

        print(f"[sync] {filename}: {local_ts} -> {remote_ts}")
        download_dataset(endpoint, filename)
        updated.append(filename)

    # The catalogue rides along: same command, same folder, one thing to run.
    catalog_count, catalog_newest = sync_catalog()
    if catalog_count is not None:
        updated.append(CATALOG_FILE)

    # `products` is OURS, not the API's — `all/last_update` has no such key. It
    # carries the catalogue's own newest `updated_at`, so it means the same thing
    # as its neighbours: when the DATA last changed, not when this script ran. It
    # is merged in rather than written from `remote_text`, which would drop it.
    if catalog_newest is not None:
        remote_data = {**remote_data, "products": catalog_newest}
        remote_text = json.dumps(remote_data, ensure_ascii=False)

    if updated or local_data != remote_data:
        write_atomic(LAST_UPDATE_PATH, remote_text)
        if "last_update.json" not in updated:
            updated.append("last_update.json")

    return updated


if __name__ == "__main__":
    try:
        changed = sync()
    except requests.RequestException as exc:
        print(f"error: API request failed: {exc}", file=sys.stderr)
        sys.exit(1)
    # A bad payload is not a network error, and it must not surface as a traceback:
    # this script is run by hand and in CI, where the message IS the diagnosis.
    # Nothing was written when it fires — the guards run before any write.
    except (RuntimeError, ValueError, OSError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        sys.exit(1)

    if changed:
        print(f"\nUpdated {len(changed)} file(s):")
        for name in changed:
            print(f"  {name}")
    else:
        print("\nAll datasets already up to date.")