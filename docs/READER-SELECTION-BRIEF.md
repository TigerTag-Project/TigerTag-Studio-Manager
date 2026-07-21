# Reader selection panel — implementation brief

> The reference for the user-controlled RFID reader-management panel. Every design point was decided
> in conversation and is frozen unless this file is changed. Keep the *Progress* section current.

## The problem

Tiger Studio detects RFID readers through **PC/SC** (`nfc-pcsc`, in the `services/nfc-process.js`
utilityProcess). PC/SC enumerates *any* smart-card interface as a "reader" — so a **YubiKey** (a
security key that exposes a CCID interface over USB) is picked up exactly like an ACR122U, and the app
treats it as a filament reader (and would attempt card reads on it). Reported by a real user.

More generally, the user has **no control** over which detected readers the app uses. Two legitimate
needs beyond the YubiKey case:

- exclude a device that isn't a filament reader (YubiKey, other security tokens, PIV/CAC readers);
- with **two identical readers** (e.g. 2× ACR122U), use only one — deactivate the other when there's
  a single chip to write.

## Already shipped (the immediate fix — do not duplicate)

A tight name filter already skips known security keys at the reader-registration gate
(`nfc-process.js`, `nfc.on('reader')`): `if (/yubico|yubikey/i.test(name)) return;`. This unblocks the
reported user with zero action. It is deliberately **narrow** (Yubico only) — the panel below is the
general, user-controlled mechanism, and the filter becomes just a *smart default* within it.

## The design — one panel, active/inactive per reader

A reader-management panel lists **every** detected PC/SC device; each has an **active / inactive**
toggle. The set of **active** readers is what Tiger Studio considers usable — the burn flow,
card-present tracking, and the "no reader" prompt all key off the active set, never off "all detected".

```
┌ Readers ───────────────────────────────┐
│ ● ACS ACR122U  · chip present    [ on ] │
│ ○ ACS ACR122U  · empty           [ on ] │
│ ⚠ Yubico YubiKey · security key  [off ] │   ← default off, reason shown
└─────────────────────────────────────────┘
```

### Smart defaults (this is where the name filter lives)

A newly-detected reader's default toggle state:

| Detected device | Default | Why |
|---|---|---|
| ACR122U / unknown | **active** | works out of the box; an unknown reader might be a real one |
| Known security key (Yubico, …) | **inactive**, with the reason shown | never a filament reader; user can still force it on |

So a YubiKey shows up already-inactive with a note ("detected as a security key"), and the user rarely
touches it — but keeps full control in both directions (force a security key on, or ignore a real
reader). The default is a heuristic; the toggle is the truth.

### Persistence

The active/inactive choice persists across sessions, keyed by reader name, in localStorage
(`tigertag.readerState` → `{ [readerName]: "active" | "inactive" }`). A deactivated YubiKey stays
deactivated at the next plug-in. A device the user has never seen uses the smart default above.

### Two identical readers — the one subtlety

PC/SC distinguishes two identical readers by an **index** in the name (`ACS ACR122U … 00 00` vs
`… 01 00`). Persistence by name works while that index is stable; if the user unplugs/replugs and the
index order shuffles, the stored choice may apply to the *other* identical unit — but since they are
identical, the functional result is the same. For **distinct** devices (YubiKey vs ACR122U) the keying
is exact. Note the "use one of my two readers" need is often a *this-session* choice, but a single
persistent toggle covers it (re-activate when the second chip comes back) — do not add a separate
temporary mode unless a concrete need appears.

## Architecture

- **nfc-process keeps detecting everything.** It should report *all* devices it sees, including the
  ones it won't poll, so the panel can list them. Today it emits `reader-connected`; add a report of
  ignored/all devices (e.g. keep emitting `reader-connected` for every device and let the renderer
  decide, OR add a `reader-detected` carrying a `looksLikeSecurityKey` flag). The current hard `return`
  for Yubico should become "report but mark as default-inactive" once the panel exists, so a YubiKey is
  *visible and overridable* rather than invisible.
- **The renderer owns the active set.** It holds the persisted `readerState`, applies the smart
  defaults, and computes the active readers. `state.nfcReaders` becomes *detected ∩ active*. Only
  active readers drive the burn flow, `nfcCardPresent`, and the RFID badge / "no reader" prompt.
- **Inactive readers are never polled.** Tell the nfc-process which readers are inactive (IPC) so it
  does not attempt card reads on them — an inactive reader is dormant, not just hidden. (A YubiKey that
  is merely hidden but still polled could still error.)

## Where it lives

The panel belongs where readers are already surfaced — the **TigerPOD / RFID modal** (`main.js` opens
it; renderer `openTigerPodModal`). One row per reader: name + status pill (chip present / empty /
security key) + the active/inactive toggle. i18n: new keys via `npm run i18n:add` (9 locales),
register-3 playful voice — e.g. "This one's a security key, not a tag reader — off by default."

## Verification

Hardware-dependent → request a real-device test before proposing the commit:
1. With a YubiKey: appears in the panel, default off, reason shown; toggling it on/off changes whether
   the app tries to use it; the choice survives a replug.
2. With an ACR122U: appears active by default, works; deactivating it makes the app behave as if no
   reader (the "no reader" prompt / TigerPOD modal).
3. With **two** ACR122U: both listed and distinguishable; deactivating one leaves the burn flow using
   only the other.

## Conventions
- Reader-list / filter logic that can move out of the utilityProcess stays testable; the enumeration
  stays in `nfc-process.js`. Renderer logic in `inventory.js`; CSS in the matching section; 9-locale
  i18n via `npm run i18n:add`. Update `WORKLOG.md`; run the validators; no commit without an order;
  request the real-device test above at commit time.

---

## Progress

_Immediate YubiKey name-filter shipped in `nfc-process.js` (hardware test pending). Panel not started._
