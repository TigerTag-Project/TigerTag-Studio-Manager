# Referrals — invite a friend, both get a reward

> Status: **validated 2026-11-01 (answers in §12), built, not deployed** — backend function + rule,
> Studio, Hub page and admin tab. Left: deploy on the founder's go, the art (banner scene, ceremony
> picture, 6 stickers — placeholders until then).
> Founder's asks: invite through social networks; a reward for the referrer AND the invitee once the
> invitee's account is created and validated; the referrer earns a trophy at the 1st, 5th and 10th
> invite; both get **3 envelopes**.

Words used here: **referrer** (the member who invites), **invitee** (the new account),
**claim** (the invitee says who invited them), **validation** (the invitee proves to be a real
user, which releases the rewards).

---

## 1. The flow in one picture

```
Referrer (Studio)                 Web                               Invitee (Studio)
──────────────────                ───                               ────────────────
Invite view → share  ──link──▶  tigersystem.io/friend/<CODE>
(WhatsApp, X, Reddit…)           "Ben invites you · 3 envelopes
                                  waiting" · Download · code
                                  copied on Download
                                                          install ──▶ onboarding step 2:
                                                                       "Who invited you?" [XXX]-[XXX]
                                                                       (prefilled from the deep link,
                                                                        or Paste)
                                                                     ──▶ referrals "claim"  (server)
                                  both become friends ◀──────────────     state = pending
                                                                     e-mail verified (≤ 7 days) 
                                                                     ──▶ server validates
3 envelopes + trophy + ceremony ◀──────────── referral validated ──▶ 3 envelopes + "Invited" trophy
                                                                       + ceremony
```

---

## 2. The invite link

- **Same link as today**: `https://tigersystem.io/friend/<CODE>` (friend code `XXX-XXX`). One code per
  member, already published, already understood by Studio (`_handleFriendDeepLink`). No second code
  to learn; a referral is "a friend link opened by someone who has no account yet".
- The live landing page is the Hub's `app/[locale]/friend/[code]/page.tsx` (+
  `features/account/FriendInvite`). The backend's `public/friend.html` is the older cdn copy; it gets
  the same change or a redirect to the Hub page (to decide when building, see §11).

### Landing page becomes an invitation
- The referrer's avatar (the friends bar's look: initials + `color`, or the photo) and pseudo:
  *"Ben invites you to Tiger Studio"*.
- The gift: *"3 envelopes for you, 3 for Ben, as soon as your account is ready."*
- The download buttons for the visitor's OS (already there), then the code, big, with a copy button.
- **Download copies the code to the clipboard** — the install wipes the link, the clipboard
  survives it, and onboarding offers a Paste button (§4).
- Open Graph: `og:title` *"Ben invites you to Tiger Studio"* so the preview in WhatsApp / Discord /
  X is personal. The image stays `og-friend.png` (a per-referrer image is a later option).
- Data: none new — `publicKeys/{code}` and `userProfiles/{uid}` are already world-readable for
  this page (firestore.rules), and the Hub's inviter card already shows the pseudo and avatar.
  Built: a gift card under the title, a "No account yet?" line, the download copies the code.

---

## 3. The Invite view in Studio (referrer side)

**Where** — several entry points, all opening the same view (mode `squadInvite`, every account):
1. a button **"Invite friends"** in the Tiger Squad view group, next to Trophies;
2. an **Invite** button at the top of the Friends panel;
3. an **"+ Invite"** tile at the end of the sidebar friends quick-list;
4. an **Invite friends** row in the account dropdown's Friends section;
5. the **empty state** of the friends list ("No friends yet — invite one, you both get 3 envelopes").

**Look** (reuse, no new look — `.agents/rules/ui-ux-defaults.md`): the Tiger Squad banner like the
Deals / Trophies ones (eyebrow, big title, tagline, its own desk scene: the tiger handing an envelope
through a doorway — art per `docs/ART-DIRECTION.md`, shown before integration), the card on the
right (validated referrals · next trophy at n), then:

1. **The link**: the URL in the input + Copy, the QR code (the existing local QR generator,
   `inventory.js` ~L11320), "Download the QR".
2. **Share buttons** — real brand icons, each opens the network's share URL in the browser
   (`openExternal`) with a prefilled, localised message (`referral_shareMsg`):

   | Network | URL |
   |---|---|
   | WhatsApp | `https://wa.me/?text=<msg + url>` |
   | X | `https://x.com/intent/post?text=<msg>&url=<url>` |
   | Facebook | `https://www.facebook.com/sharer/sharer.php?u=<url>` |
   | Reddit | `https://www.reddit.com/submit?url=<url>&title=<msg>` |
   | Telegram | `https://t.me/share/url?url=<url>&text=<msg>` |
   | Bluesky | `https://bsky.app/intent/compose?text=<msg + url>` |
   | Discord | no share URL → **copies** the message + link, toast "Paste it in your server" |
   | E-mail | `mailto:?subject=<subject>&body=<msg + url>` |

3. **My invitees** — a list in the existing list-row style: avatar, pseudo, state pill
   (**Signed up** = claimed, waiting for validation · **Validated** + date · **Expired**),
   plus the counters "n validated · next trophy at 5".
4. **"Who invited you?"** card — only for an account younger than 7 days with no claim (§4).

Copy register: playful / deadpan (`.agents/rules/copy-registers.md`), e.g. *"Recruit your printing
buddies. You both get 3 envelopes. Nobody gets a pyramid scheme."*

---

## 4. Attribution — the invitee says who invited them

A desktop app cannot read the web link after an install, so attribution is **declared**, then
checked by the server.

- **Onboarding step 2** (profile, `ONBOARDING_VERSION` flow ~L39692) gets an optional field
  *"Who invited you?"* — the add-friend modal's two `XXX`-`XXX` inputs and live preview (avatar +
  pseudo of the code's owner), reused as is.
  - Prefilled when the app was opened from the link (`_pendingFriendCode`, already kept until the
    account is connected — a new account opening the link goes to the claim, not to the add-friend
    modal).
  - A **Paste** button reads the clipboard only on that tap (the landing page put the code there).
- **Later**: the same card in the Invite view while the account is **< 7 days old** and has no
  claim. After 7 days it disappears.
- **One claim per account, never changed.**

### Server: `referrals` function, action `claim { code }`
Checks, in one transaction, else an error code shown in the field's error bubble:

| Check | Error |
|---|---|
| signed in, account created < 7 days ago (Auth `creationTime`) | `TOO_LATE` |
| no claim yet for this uid | `ALREADY_CLAIMED` |
| the e-mail was never used by a claim before (hash, survives account deletion) | `ALREADY_CLAIMED` |
| the code exists (`publicKeys/{code}`) | `UNKNOWN_CODE` |
| not one's own code | `SELF` |
| the referrer did not block the invitee, nor the reverse | `UNKNOWN_CODE` (no leak) |
| the referrer is not the invitee's own invitee (no A↔B loop) | `LOOP` |

Then:
- writes `referrals/{inviteeUid}` (state `pending`) and `referralEmails/{sha256(email)}`;
- **makes them friends** at once, same writes as `autoAcceptFriendRequestForPublic` (both
  `friends` docs, `friendsCount` on both profiles, any pending request between them deleted);
- notifies the referrer (`notifications`, type `referral_joined`): *"Léa joined with your link —
  envelopes as soon as they verify their e-mail."*

---

## 5. Validation — what releases the rewards

A referral is **validated** when the **invitee verifies their e-mail address** (Auth
`emailVerified`; a Google sign-in is verified from the start, so it validates at the claim).
Founder's choice: e-mail only, no daily-set condition.

- Nobody validates by hand: the server checks it. `referrals.tryValidate(uid)` runs at the claim
  and from the `status` action, which Studio calls at launch while a claim is pending and right
  after the e-mail verification screen.
- **7-day window**: the invitee has 7 days after the claim to click the verification link. Past
  that, the referral turns `expired` — no envelopes, the friendship stays. Without a window an
  unverified account would sit "Signed up" in the referrer's list forever.
- Anti-farming without a cap rests on: one claim per e-mail ever (hash kept after deletion), a
  verified address, no self / loop, and the Hub's top-referrers list to spot abuse. `monthlyCap`
  stays in the config at `0` (= none) so a cap can be switched on from the Hub without a deploy.

---

## 6. Rewards

On validation, in one transaction:

| Who | Reward |
|---|---|
| Invitee | **3 envelopes** (kind `referral`), trophy `invited` |
| Referrer | **3 envelopes** (kind `referral`), counter `referrals` +1 → tier trophies (§7) |

- Envelopes go through the existing gift envelopes (`users/{uid}/envelopes`, `coinEnvelopes.js`
  `envelopeData`): **three separate envelopes**, each holding **one standard surprise envelope**,
  with a localised message (*"Thanks for bringing Léa!"* / *"Ben's welcome gift"*) and
  `from` = the other person. They show in the pile and open like any gift envelope.
  Config in `config/referrals { envelopes: 3, surpriseType: "standard", monthlyCap: 0,
  claimDays: 7, validateDays: 7, active: true }` so the Hub can tune it without a deploy.
- **No cap** (founder's choice): every validated referral pays both. If `monthlyCap` is ever set
  above 0 in the Hub, a referrer past it still gets the friend, the trophies and the list row but no
  envelopes, and the invitee is always paid.
- coinLog rows: `{ kind: "referral", envelopeId, from | to }` so the history reads
  *"Referral — Léa"*.

---

## 7. Trophies

Added to the backend `functions/trophyRules.js` (source of truth) and mirrored in
`renderer/quests/trophies.js`, family **Squad and friends**. Counted by a `COUNTERS` entry on
`users/{uid}/trophyCounters/main.referrals` (validated referrals). Ids are final.

| Id | When | Tier | Hidden |
|---|---|---|---|
| `referral1` | 1st validated referral | common | |
| `referral5` | 5th | rare | |
| `referral10` | 10th | epic | |
| `referral25` | 25th | epic | yes |
| `referral50` | 50th | legendary | yes |
| `invited` | invitee: one's referral validated | common | |

Names (pop-culture register, final wording at the i18n step): *"Plus one"*, *"Squad goals"*,
*"Recruiter"*, *"Influencer, apparently"*, *"Cult leader (friendly)"*, *"Came with a friend"*.
Each gets `trophy_<id>` + `trophyHow_<id>` in the 11 locales and a standalone sticker picture.

---

## 8. The ceremony

A referral validating is a **big, rare moment** → a modal with the art swelling behind it
(`backfire` from `renderer/quests/coin-pull.js`, like `fullset-modal.js`):

- **Invitee**: *"Welcome to the Squad"* — the referrer's avatar, *"Ben and you each get
  3 envelopes"*, button **Open my envelopes** (goes to the pile) — the trophy celebration follows
  as usual.
- **Referrer**: *"Léa is in!"* — the invitee's avatar, the 3 envelopes, the progress to the next
  trophy (`2 / 5`), button **Open them**.
- Shown once (server `seenAt` on the referral doc for that side), on the next launch if the app was
  closed. Art: one standalone picture (two tigers bumping fists over an open envelope), generated in
  the house style and shown to the founder first.

---

## 9. Data model (Firestore)

| Path | Fields | Access |
|---|---|---|
| `referrals/{inviteeUid}` | `referrerUid, code, claimedAt, state: "pending"\|"validated"\|"expired", validatedAt?, referrerPaid: bool, seenByInvitee?, seenByReferrer?` | read: the invitee or the referrer (`request.auth.uid in [inviteeUid, resource.data.referrerUid]`); write: server only |
| `referralEmails/{sha256}` | `uid, at` | server only |
| `users/{uid}/trophyCounters/main.referrals` | number | existing (server) |
| `config/referrals` | §6 | read signed-in, write admin (Hub) |
| `referralStats/{YYYY-MM}` | `claims, validated, expired` | admin read (Hub) |

The referrer's list = `referrals where referrerUid == uid` (single-field index, automatic).
Rules + `firestore-schema.md` + backend README + the integration guide only if third parties see it
(they do not) — `.agents/rules/firestore-changes.md`.

---

## 10. Admin (TigerHub)

A **Referrals** panel in `features/admin/`: claims / validated / expired per month (from
`referralStats`), conversion rate, top referrers (abuse watch), and the
`config/referrals` editor (envelopes, cap, windows, on/off).

---

## 11. Build plan (once validated)

1. **Backend** (`TigerTag_Firebase_Backend`): `functions/referrals.js` (`claim`, `status`,
   `list`, `tryValidate`), envelopes via `coinEnvelopes.js`, trophies in
   `trophyRules.js` + counter, `firestore.rules`, unit tests in `test/`. **Deploy on the founder's
   go only.**
2. **Hub**: public invite endpoint, landing page invitation (+ the old `public/friend.html`),
   admin panel.
3. **Studio**: Invite view + share buttons + QR, onboarding field + the 7-day card, deep link for a
   new account, ceremony modal, trophies mirror, notifications `referral_joined` /
   `referral_validated`, i18n in the 11 locales via `npm run i18n:add`, What's New, verified with
   dev-drive.
4. **Art**: Invite banner scene, ceremony picture, 6 stickers — shown before integration.

---

## 12. Founder's answers (2026-11-01)

1. **Envelopes**: three separate gift envelopes, one standard surprise each.
2. **Validation**: verified e-mail only.
3. **Cap**: none (`monthlyCap: 0`, switchable from the Hub).
4. **Placement**: several entry points (§3).
5. **Windows**: 7 days after sign-up to declare the referrer; 7 days after the claim to verify the
   e-mail.
