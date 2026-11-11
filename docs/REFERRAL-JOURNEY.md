# Referral journey — one line from the link to the first spool

> Status: **validated by the founder 2026-11-10, not built.** The reference for every surface of a
> referral: the Hub tunnel (`tigersystem.io/join/<CODE>`), Tiger Studio Manager 2 and, later, Tiger
> NFC Connect. Rules and data live in [`REFERRALS.md`](REFERRALS.md) and in the backend
> (`TigerTag_Firebase_Backend/functions/referrals.js`); this file decides the screens, the words, the
> states and the assets, so that every surface says the same thing. Mockups (ChatGPT) come next,
> then code. A change to this journey starts here, never in one surface alone.

Words: **referrer** (the member who invites), **invitee** (the new account), **station** (one step
of the line, the same four everywhere).

---

## 1. Why this rework

- The tunnel ended at "Download the app", but what pays the referrer (an app sign-in **and** a
  first spool) happens after, in the app. The invitee dropped off between the web and the app.
- The web promised "3 envelopes for you, 3 for {name}, released once your e-mail is confirmed":
  false since 2026-11-10 for the referrer.
- Many visitors open the link on a phone; Tiger Studio Manager 2 is a desktop app. The journey's
  job is to get the desktop app downloaded (founder, 2026-11-10): station 4 is a download on every
  device, the mobile app is a secondary path.
- Web and Studio did not use the same words, steps or pictures (an emoji envelope on the web).

## 2. The rules (backend `referrals`, deployed 2026-11-10, PR #11 merged into `main`)

| Who | Gets | When |
|---|---|---|
| — | validation, nothing paid | the e-mail is confirmed (within 7 days of the claim, else the referral expires) |
| Invitee | 3 envelopes | validated **and active**: signed in once in an app (Studio or mobile) **and** holds at least 1 spool |
| Referrer | 3 envelopes | the same moment, the invitee active |
| Referrer | at most 10 paid referrals a calendar month | over the cap the referral waits and is paid a later month |

Both are paid at the first spool (founder, 2026-11-10, after the audit: the invitee's envelopes
moved from the e-mail to the first spool the same day). A link can be claimed only by an account
younger than 7 days, one claim per e-mail address ever.
A referral is **not** a friendship: nobody becomes friends automatically.

No surface may promise anything else. In particular, the invitee is never told about the
referrer's monthly cap: it is the referrer's business.

## 3. The line — four stations, the same everywhere

```
 Invitation ──── Account ──── E-mail ──── First spool
   (web)          (web)       (web)       Studio or mobile
                                           3 envelopes each
```

| # | Station | FR label | EN label | Done when (server truth, never a click) |
|---|---|---|---|---|
| 1 | Invitation | Invitation | Invitation | the invitation is accepted (button) |
| 2 | Account | Compte | Account | signed in, display name set, claim recorded |
| 3 | E-mail | E-mail | E-mail | `emailVerified` (Google accounts: at once, the station shows done) |
| 4 | First spool | 1ʳᵉ bobine | First spool | `progress.appSignedIn` **and** `progress.firstSpool` |

A download, an app opening or a click on "Add" never moves a station by itself: only the account
state does.

The stepper is the same component on both surfaces: four stations on one line, labels under the
dots; states **to do** (hollow dot), **current** (orange dot), **done** (green dot with a check
icon). The state is never colour only: the check icon and the label weight carry it too. On a
phone the line stays horizontal with short labels.

## 4. Invitee screens

Strings: French is the source, English the reference for the other nine locales (short sentences,
one idea each, `{name}` = the referrer's display name, `{email}` = the account e-mail). Register:
friendly and plain, no jargon.

Ordinals are typeset with a superscript suffix, never on the baseline (founder, 2026-11-10): French
1ʳᵉ (bobine is feminine; 1ᵉʳ for a masculine noun), English 1ˢᵗ, or the word spelled out ("first
spool"). In the locale files the suffix is written with the Unicode superscript letters (`1ʳᵉ`,
`1ᵉʳ`), so no markup travels through i18n; each surface checks that its fonts draw them, else
renders the suffix in a `<sup>`.

### 4.1 Web · Invitation (`/join/<CODE>`)

| Element | FR | EN |
|---|---|---|
| Avatar | the referrer's photo, else the initial on their avatar colour (also while the photo loads) | |
| Title | {name} t'invite sur TigerSystem | {name} invites you to TigerSystem |
| Sub | Tes bobines et tes imprimantes dans une app gratuite pour ton ordinateur. | Your spools and your printers in a free app for your computer. |
| Gift title | 3 enveloppes pour toi, 3 pour {name} | 3 envelopes for you, 3 for {name} |
| Gift sub | Dès que tu ajoutes ta 1ʳᵉ bobine dans l'app. | As soon as you add your first spool in the app. |
| Reassurance | Gratuit, aucune carte demandée · Pas de pub, pas de spam : un seul mail pour confirmer ton adresse · Supprime ton compte quand tu veux, en quelques clics | Free, no card needed · No ads, no spam: one e-mail to confirm your address · Delete your account anytime, in a few clicks |
| Button | Accepter l'invitation | Accept the invitation |
| Link | Déjà un compte ? Connecte-toi | Already have an account? Sign in |

The gift block shows the envelope picture (§7), not an emoji. Share preview (meta description):
"{name} t'a gardé une place sur TigerSystem : 3 enveloppes pour toi à ta 1ʳᵉ bobine." / "{name}
saved you a seat on TigerSystem: 3 envelopes for you with your first spool."

Unknown or blocked code: title "Cette invitation n'existe pas", sub "Demande un nouveau lien à la
personne qui t'a invité.", button "Découvrir TigerSystem" / "This invitation doesn't exist" · "Ask
the person who invited you for a new link." · "Discover TigerSystem".

### 4.2 Web · Account

| Element | FR | EN |
|---|---|---|
| Header | the referrer card (avatar, name, TigerSquad badge) | |
| Title | Crée ton compte | Create your account |
| Sub | 30 secondes. Le même compte marche sur le site, dans Studio et sur l'app mobile. | 30 seconds. The same account works on the site, in Studio and in the mobile app. |
| Buttons | Continuer avec Google · Créer mon compte (e-mail + mot de passe) | Continue with Google · Create my account |
| Link | Déjà un compte ? Connecte-toi | Already have an account? Sign in |

Then the first-sign-in profile window (built, Hub v1.50.0, `features/account/ProfileSetup.tsx`):
language, then display name and avatar — the same two steps as Studio's onboarding. The claim waits
for the name, so the referrer's notification never shows an empty one.

Already signed in when the link opens:

| Case | Screen |
|---|---|
| Account < 7 days, no referral | "Accepter avec ce compte ?" + avatar, name, masked e-mail (`b•••@gmail.com`) · button "Accepter l'invitation" · link "Changer de compte" / "Accept with this account?" · "Accept the invitation" · "Switch account" |
| Already referred by this code | straight to the first station not done |
| Referred by someone else | "Tu as déjà un parrain." + button "Voir ma progression" / "You already have a referrer." · "See my progress" |
| Account ≥ 7 days | "Ce compte a plus de 7 jours : il ne peut plus être parrainé." · button "Aller à mon compte" · link "Changer de compte" / "This account is more than 7 days old: it can't be referred any more." · "Go to my account" · "Switch account" |
| No e-mail on the account | the existing `joinErrNoEmail` text |

The current "add {name} as a friend" offer on the too-old screen stays a plain secondary link at
most (founder: a referral is not a friendship; adding a friend stays a free choice elsewhere).

### 4.3 Web · E-mail

| Element | FR | EN |
|---|---|---|
| Title | Confirme ton e-mail | Confirm your e-mail |
| Sub | Un lien est parti vers {email}. Clique dessus pour valider ton compte. | A link is on its way to {email}. Click it to confirm your account. |
| Hint | À confirmer sous 7 jours. | Confirm within 7 days. |
| Button | C'est fait | Done |
| Link | Renvoyer le lien | Send the link again |
| Not yet | Pas encore confirmé. Le mail peut mettre une minute. | Not confirmed yet. The e-mail can take a minute. |
| Resent | Envoyé. Jette aussi un œil dans tes spams. | Sent. Check your spam folder too. |

The page also re-reads the account when the tab regains focus (the link is often opened on
another device). No envelope is promised on this station: they come with the first spool.

### 4.4 Web · First spool

Top line: envelope picture + "3 enveloppes pour toi, 3 pour {name} à ta 1ʳᵉ bobine" / "3 envelopes
for you, 3 for {name} with your first spool".

| Element | FR | EN |
|---|---|---|
| Title | Télécharge Tiger Studio Manager 2 | Download Tiger Studio Manager 2 |
| Sub | L'app de bureau gratuite pour Mac, Windows et Linux. Connecte-toi avec ce compte et ajoute ta 1ʳᵉ bobine, même sans puce RFID : c'est ce qui débloque tes enveloppes et celles de {name}. | The free desktop app for Mac, Windows and Linux. Sign in with this account and add your first spool, even one without an RFID chip: that's what releases your envelopes and {name}'s. |
| Picture | the desktop app as floating device layers (§7), not a flat picture | |
| Checklist | Connecté dans l'app · 1ʳᵉ bobine ajoutée (status icons ticked from `progress`, never checkboxes) | Signed in to the app · First spool added |

The goal of this station is the **desktop app download** (founder, 2026-11-10), on every device:

| Device | Primary | Secondary |
|---|---|---|
| Computer | "Télécharger pour Mac" (the OS detected: Mac, Windows, Linux) · "Autres versions" | "Déjà installé ? Ouvrir Studio" (Studio's deep-link scheme, `main.js` `DEEPLINK_SCHEME`) |
| Phone | sub line "Studio s'installe sur ton ordinateur. Envoie-toi le lien pour le télécharger." · button "M'envoyer le lien" (the native share sheet: mail, messages, notes) · button "Copier le lien" | a small line under the card: "Une bobine TigerTag sous la main ? Tiger NFC Connect l'ajoute d'un tap." · store links |

EN: Download for Mac · Other versions · Already installed? Open Studio · Studio installs on your
computer. Send yourself the link to download it. · Send me the link · Copy the link · Got a TigerTag
spool at hand? Tiger NFC Connect adds it with one tap.

The resume link is the same `/join/<CODE>` link: once signed in, it opens on the first station not
done. It carries no access to the account.

The page re-reads `status` when the tab regains focus and every 20 s while visible, for at most
10 minutes, then on focus only.

Done (both ticks): title "Bienvenue dans la bande !" · sub "Ta 1ʳᵉ bobine est dans ton inventaire :
tes 3 enveloppes t'attendent dans l'app. Merci pour {name}." · button "Voir mon inventaire" (opens
Studio, else `/account`) / "Welcome to the crew!" · "Your first spool is in your inventory: your 3
envelopes are waiting in the app. {name} says thanks." · "See my inventory". The
station line shows four done dots. Coming back to the link later shows this screen. When the
account has never signed in to Studio (first spool added from the mobile app), the done screen
still offers the desktop app: "Gère tout ton stock sur ordinateur" + "Télécharger Tiger Studio
Manager 2" / "Manage your whole stock on your computer" + "Download Tiger Studio Manager 2".

### 4.5 Studio · invitee's first launch

Shown while the signed-in account is an invitee whose station 4 is not done.

- **Inventory empty**: a card at the top of the inventory, above the usual empty state — the same
  stepper, title "Ajoute ta 1ʳᵉ bobine", sub "Même sans puce RFID : tu la remplis toi-même.", button
  "Ajouter une bobine" (opens the add-spool form with the manual entry — "Pas dans le catalogue ?
  Remplis-le toi-même" — in view), link "Plus tard" (hides the card for the session; it comes back
  at the next launch while the inventory is empty).
- **First spool saved**: Studio calls `referrals status`, which pays both sides (the referrer
  under the cap), then the invitee's ceremony (§8 of REFERRALS.md, now at the first spool: the
  `celebrate` entry with role `invitee`) and the card disappears for good.

An account created in Studio with a code ("Qui t'a invité ? (facultatif)", onboarding step 2) walks
the same line: stations 1–3 happen in Studio's onboarding, station 4 is this card.

### 4.6 Tiger NFC Connect (later)

A mobile sign-in counts as an app sign-in today (`mobileLastSeen`). The same card ("Scanne ta 1ʳᵉ
bobine", with "Pas de bobine RFID ? Continue sur ton ordinateur") is phase 2, in the mobile repo.

## 5. Referrer side

Studio's Invite view stays the referrer's home (REFERRALS.md §3); its four "how it works" steps
already match the line (share → account → e-mail → first spool), drawn as numbered steps 1–4, not
as the progress stepper (nothing is "in progress" in an explanation). Each invitee row shows **one
state** (avatar, name, date, a state dot and its sentence), the same words wherever it appears.
This replaces the current table (Account · E-mail · Envelopes columns, mockup 08) once the founder
approves the mockups; "E-mail à confirmer" as a row text and "Payé · 3 enveloppes" are new strings.
A missing name reads "Nouveau membre" in the name column and "ce membre" inside the sentence
("Payé quand ce membre ouvre Studio ou l'app et ajoute une 1ʳᵉ bobine.").

| Server state | FR | EN |
|---|---|---|
| `state: pending` | E-mail à confirmer | E-mail to confirm |
| `referrerState: waiting` | Payé quand {name} ouvre Studio ou l'app et ajoute une 1ʳᵉ bobine. | Paid when {name} opens Studio or the app and adds a first spool. |
| `referrerState: capped` | Limite du mois atteinte (10) : payé le mois prochain. | Monthly limit reached (10): paid next month. |
| `referrerState: paid` | Payé · 3 enveloppes | Paid · 3 envelopes |
| `state: expired` | Expiré | Expired |

Notifications: the referrer gets `referral_joined` ("{name} a rejoint avec ton lien") at the claim
and `referral_validated` (`data.envelopes`) when they are paid. The invitee gets their own
`referral_validated` at the same moment, the first spool — no notification at the e-mail any more. No
e-mail address, inventory detail or uid of the invitee is ever shown: a missing name reads
"Nouveau membre".

A web copy of the Invite view (Hub `/account`) is phase 2.

## 6. Backend change (built, deploy on the founder's go)

`referrals` `status` returns the caller's own progress, whether or not they are an invitee:

```
progress: { emailVerified: boolean, appSignedIn: boolean, firstSpool: boolean }
```

`appSignedIn` = `users/{uid}.studioLastSeen || mobileLastSeen`; `firstSpool` = the inventory holds
at least `minSpools` spools (`select().limit(minSpools)`, already read for the payment). No new
collection, no new index. The Hub ticks station 4 from it; Studio decides whether to show the card.

The invitee's payment moves to the first spool: validation pays nobody; `tryPayActive` pays the
invitee (never capped: `inviteeState` waiting → paid, `inviteePaidAt`, trophy `invited`,
notification) and the referrer (under the cap) in one transaction. `mine.inviteeState` /
`mine.inviteePaid` tell the invitee; `celebrate` (role `invitee`) waits for that payment. A
referral validated before this change has no `inviteeState` and counts as paid.
Branch `feat/referral-invitee-active`, deploy on the founder's go.

## 7. Shared assets

| Asset | Rule |
|---|---|
| Envelope | one picture everywhere: Studio's `assets/img/tigercoins/envelope.webp` (laddered sizes if needed per `docs/ART-DIRECTION.md`), copied into the Hub; never an emoji |
| Avatar fallback | the initial on the avatar colour, also while a photo loads, same on both surfaces; never a uid, never an e-mail |
| Stepper | §3, one look on both surfaces |
| Icons | inline SVG, one set: computer, phone, spool, NFC tap, QR, copy, check |
| Download picture | the Hub's floating device layers (`features/hero/HeroDevices.tsx`, the iMac with Studio first, `lazy`), never a flat composite (founder rule for every download call) |
| Picture of the line | optional banner art for the tunnel and the Studio card, per the art direction, shown to the founder before integration |

## 8. Out of scope for now (phase 2)

- One reminder e-mail ("Me rappeler demain") if the first spool is still missing.
- The referrer's Invite view on the web.
- The Tiger NFC Connect card.

## 9. Build order

1. Mockups of the screens of §4 and §5 in one style (ChatGPT, `generate-asset`), shown to the
   founder.
2. Backend `progress` (§6), deployed on the founder's go.
3. Hub tunnel (§4.1–4.4) and Studio card (§4.5), in parallel, both against this file; the strings
   land in the 11 locales of each repo.
4. One end-to-end test with a test account, a capture per station, on both surfaces.

## 10. Decisions

| Date | Decision |
|---|---|
| 2026-11-10 | Journey ends at the first spool, not at the download; four stations on every surface |
| 2026-11-10 | The invitee never sees the referrer's monthly cap |
| 2026-11-10 | No emoji: one envelope picture shared by the Hub and Studio |
| 2026-11-10 | Reminder e-mail, web Invite view and mobile card are phase 2 |
| 2026-11-10 | Station 4 invites to download the desktop app on every device; on a phone the user sends themselves the link |
| 2026-11-10 | Ordinals with a superscript suffix (1ʳᵉ, 1ˢᵗ) |
| 2026-11-10 | The invitee's 3 envelopes come with the first spool too, not with the e-mail |
