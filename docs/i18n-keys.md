# i18n keys — complete reference (TigerTag Studio)

> Extracted from `CLAUDE.md` to keep the always-loaded instructions lean. **Read this on demand instead of re-reading the locale JSON files.** All **11 locales** (en/fr/de/es/it/zh/pt/pt-pt/pl/ru/nl) have every key below. To add/change keys use `npm run i18n:add` (never hand-edit the locale files) — see `.agents/rules/i18n-keys.md`.

### App / status
| Key | Purpose |
|-----|---------|
| `backendIdle` | Health tooltip idle |
| `backendOk` | Health tooltip ok (also used with `— N ms` suffix) |
| `backendErr` | Health tooltip error `{{n}}` |
| `backendOffline` | Health tooltip offline |
| `rfidNoReader` | RFID no reader |

### Community / links
| Key | Purpose |
|-----|---------|
| `githubBtn` | GitHub button |
| `discordBtn` | Discord button |
| `mobileApp` | QR label |

### Settings panel
| Key | Purpose |
|-----|---------|
| `settingsOpenBtn` | Settings button label |
| `settingsTitle` | Panel title |
| `settingsLang` | Language section label |
| `settingsExport` | Settings → Data: export the whole inventory as .ttag |
| `settingsExportXlsx` / `xlsxExportOk` | Settings → Data: export the whole inventory as an .xlsx spreadsheet + its confirmation |
| `settingsCopied` | Copy confirmation |
| `debugOpenBtn` | Open debug panel button |
| `fsExplorerOpenBtn` | Open Firestore explorer button (opens debug panel on the Firestore tab) |
| `sectionTags` | Detail-panel Tags/Balises section label |
| `tagAdd` | Tag input placeholder ("Add a tag…") |
| `tagRemove` | Remove-tag button tooltip |
| `sortBy` | Grid-view sort dropdown title |
| `sortDir` | Grid-view sort direction toggle title |
| `filterAllTags` | Tag filter dropdown — "All tags" default |
| `filterAllStates` | Printer State filter dropdown — "All states" default (online/offline) |
| `toolRepairPlus` / `toolRepairPlusTip` | Toolbox "Restore TigerTag+" action + tooltip (keys kept as `Repair*`; label reads "Restore") |
| `toolRepairNoChip` / `toolRepairNoBackup` | Restore guard messages (chip not on reader / no backup) |
| `toolRepairWriting` / `toolRepairDone` / `toolRepairAlready` / `toolRepairFailed` | Restore progress/result states |
| `chipRestoreNeedChip` | New-chip card, greyed "Restore TigerTag+" choice and the Restore card's empty state: put a worn or wiped TigerTag+ that has a backup on the TigerPOD |
| `chipRestoreCertified` | Restore card: badge on a backup whose factory signature checks out |
| `labelTitle` / `labelToolbox` / `labelToolboxTip` / `labelProductCta` / `roTabLabel` | Label card title; the spool toolbox row that opens it and its ⓘ; the "Print its label" button (catalogue card, QR buttons); the product sheet's "QR label" tab |
| `labelKindSpool` / `labelKindProduct` / `labelNoQr` | Label card: spool or product label; a legacy id printed without a QR |
| `labelTemplate` / `labelTpl_classic` / `labelTpl_expanded` / `labelTpl_compact` / `labelTpl_slim` / `labelTpl_slicer` / `labelTpl_vertical` / `labelTpl_verticalBold` / `labelTpl_verticalCompact` | Label card: the eight templates |
| `labelSlots` / `labelSlotNone` / `labelSlotTd` | Label card: the value slots (nozzle, bed, drying reuse `lbNozzle`, `lbBed`, `addProductDrying`; diameter `detDiameter`) |
| `labelDpi` / `labelPrint` / `labelOpenLink` / `labelExportFailed` | Label card: printer resolution, Print button, the preview's "see the QR's page" hint, export error |
| `linkValuesUpdate` / `linkValuesUpdateNote` / `linkValuesInfo` / `linkValuesHoldTip` / `spoolLinkNotMine` | Spool links (QR, `?spool=`, `tigertag://spool/`): the held banner proposing a link's weight / note, its ⓘ and hold tip; a link to a spool not in the inventory |
| `toolFormatRfid` / `toolFormatRfid2` / `toolFormatRfidTip` | Toolbox "Erase the {{tier}}" action — 1 chip / 2 chips label (`{{tier}}` = TigerTag / TigerTag+) + ⓘ info bubble (writes the official TigerTag Init payload → reusable TigerTag) |
| `toolEraseRfid` / `toolEraseRfid2` / `toolEraseRfidTip` | Toolbox "Recycle to NFC" action — 1 chip / 2 chips label + ⓘ info bubble (writes the SDK blank-NDEF payload → generic NFC tag) |
| `encErase` / `encRecycle` | Chip modal hold button when erasing a TigerTag or recycling it to NFC (the title reuses `toolFormatRfid` / `toolEraseRfid`) |
| `toolMeasureColorTip` / `toolMeasureTdTip` / `toolEditImgTip` / `twinLinkActionTip` / `toolRemoveFromRackTip` / `encodeCloudTip` / `burnRfidTip` / `toolRefreshApiTip` / `toolDuplicateTip` / `twinLinkUnlinkHint` | ⓘ info-bubble text for the remaining toolbox actions (one per button) |
| `toolDuplicateNeedContainer` | Red help bubble over the container picker's search when "Duplicate" is pressed on a spool with no container |
| `backupBadge` | "Signature backed up" tooltip on the shield-check badge |

### Account management
| Key | Purpose |
|-----|---------|
| `addAccountLabel` | Add account button / modal title |
| `addAccountAuthError` | Friendly error for invalid email/API key |
| `btnSignIn` | Sign in button |
| `btnDisconnect` | Disconnect button |
| `btnRefresh` | Refresh button |
| `btnSwitchAccount` | Switch account button |
| `noAccounts` | Empty accounts message |
| `accountActive` | "Active" badge |
| `cancelLabel` | Cancel button in modals |
| `displayNameLabel` | Display name field label in edit-account modal |

### Login modal
| Key | Purpose |
|-----|---------|
| `loginSignInTitle` | Modal title (sign-in mode) |
| `loginSignInSubtitle` | Modal subtitle (sign-in mode) |
| `loginCreateTitle` | Modal title (create account mode) |
| `loginCreateSubtitle` | Modal subtitle (create account mode) |
| `loginGoogle` | Google sign-in button |
| `loginOr` | Separator label |
| `loginEmailPlaceholder` | Email input placeholder |
| `loginPasswordPlaceholder` | Password input placeholder |
| `loginConfirmPasswordPlaceholder` | Confirm password placeholder |
| `loginForgotPassword` | Forgot password link |
| `loginRememberMe` | Stay signed in checkbox |
| `loginNoAccount` | "Don't have an account?" |
| `loginCreateAccount` | "Create account" toggle button |
| `loginHaveAccount` | "Already have an account?" |
| `loginResetSent` | Password reset email sent confirmation |
| `loginPasswordMismatch` | Passwords don't match error |
| `loginPasswordTooShort` | Password too short error |
| `loginEmailInUse` | Email already registered error |

### Credentials card
| Key | Purpose |
|-----|---------|

### Inventory / filters
| Key | Purpose |
|-----|---------|
| `btnViewTable` | Table view button |
| `btnViewGrid` | Grid view button |
| `btnExport` | Export JSON button |
| `searchPlaceholder` | Search input placeholder |
| `searchPlaceholderPrinter` | Search input placeholder in the printer view |
| `printerEndsAt` | Printer table column — wall-clock finish time of the current job |
| `printerPreview` | Printer table column — print-preview thumbnail header |
| `noInventory` | Empty state: no inventory |
| `noMatch` | Empty state: no match |
| `invLoading` | Loading spinner label |

### Stats
| Key | Purpose |
|-----|---------|
| `statActive` | Active spools label (full) |
| `statPlus` | TigerTag+ label |
| `statDiy` | TigerTag label |
| `statTotal` | Total available label |
| `statActiveMini` `statPlusMini` `statDiyMini` `statTotalMini` | Collapsed sidebar labels |

### Table headers
`thUid` `thType` `thMaterial` `thBrand` `thName` `thWeight` `thCapacity` `thUpdated` `thRack` `thPosition` (the last two: .xlsx export columns)

### Debug panel
| Key | Purpose |
|-----|---------|
| `debugLabel` | Panel title |
| `debugNoReqs` | Empty state |

### Detail panel — sections
`sectionColors` (plural object) `sectionPrint` `sectionWeight` `sectionLinks` `sectionContainer` `sectionDetails` `sectionRaw`

### Detail panel — print settings
`lbNozzle` `lbBed` `lbDryTemp` `lbDryTime` `lbDensity`

### Weight section
| Key | Purpose |
|-----|---------|
| `weightOk` | Success result `{{wa}} {{w}} {{cw}}` |
| `weightOkTwin` | Twin updated suffix |
| `btnUpdate` | Update weight button |
| `btnEditManually` | Toggle manual input |
| `enterNumeric` | Validation error |

### Container picker
| Key | Purpose |
|-----|---------|
| `containerPickerTitle` | Modal title |
| `btnChangeContainer` | Change button label / tooltip |

### Feedback / errors
| Key | Purpose |
|-----|---------|
| `loadedSpools` | Plural `{{n}}` |
| `invalidKey` | Key validation error `{{r}}` |
| `networkError` | Generic network error |

### Links (detail panel)
`linkYt` `linkFood`

### Detail rows
`detUid` `detProductId` (TigerTag+ `id_product`, shown under UID) `detSeries` `detBrand` `detMaterial` `detDiameter` `detTagType` `detSku` `detBarcode` `detContainer` `detTwin` `detUpdated` `detManufactured`

### Badges
`badgeRefill` `badgeRecycled` `badgeFilled` `badgeDeleted`

### Auto-update
`updateDownloading` `updateReady` `btnRestartUpdate`

### Twin tag
`twinBadge` `twinTitle` `twinTabThis` `twinTabTwin`

### Time ago
`agoNow` `agoMin {{n}}` `agoHour {{n}}` `agoDay {{n}}` `agoMonth {{n}}` `agoYear {{n}}` (object with one/other in most locales)

### Friends system
| Key | Purpose |
|-----|---------|
| `friendsTitle` | Section title / sidebar button label |
| `friendsMyCode` | "My code" label above publicKey display |
| `regenConfirmTitle` / `regenConfirmText` | the window confirming "New code" (Friends card, Invite view): the old link, code and QR stop working |
| `friendsPublicLabel` | Public inventory toggle label |
| `friendsPublicSub` | Toggle sub-label ("Visible to everyone") |
| `friendsList` | "My friends" section heading |
| `friendsEmpty` | Empty state when no friends |
| `friendsAdd` | Add friend button |
| `friendsShopTitle` | Goodies shop button title (Friends panel bottom) |
| `friendsShopSub` | Goodies shop button subtitle (Support the project) |
| `friendRemove` | Remove friend button on each row |
| `friendReqSub` | Subtitle on incoming request modal ("wants to view your inventory") |
| `friendReqBlock` | Block button on request modal |
| `friendReqRefuse` | Decline button on request modal |
| `friendReqAccept` | Accept button on request modal |
| `addFriendTitle` | Add friend modal title |
| `addFriendSub` | Add friend modal subtitle |
| `addFriendSend` | Send request button |
| `friendSearching` | Preview state: searching |
| `friendNotFound` | Preview state: no user found |
| `friendSelf` | Preview state: own code entered |
| `friendRequestSent` | Success message after sending |

### Notification center (local notices)
| Key | Purpose |
|-----|---------|
| `notifPaxxTitle` | Paxx firmware release notice title (Snapmaker owners) |
| `notifPaxxText {{version}}` | Paxx release notice body — click opens the .bin download |

> ⚠️ This table is a snapshot and can drift as keys are added. The authoritative key set is the locale files themselves; `npm run i18n:check` is the source of truth for "do all 11 locales agree". When you add keys via `npm run i18n:add`, append them to the relevant section here too.

### AI assistants: online connections (used by the Access and security view)
The old My profile section (`stgMcp*`, `eacMcpRow`, `eacMcpWeb*`) is gone: set-up lives in the AI assistant window. Kept, because the Access and security view still lists and cuts the online connections with them: `eacMcpGrantsNone`, `eacMcpGrantsLoading`, `eacMcpGrantsErr`, `eacMcpGrantSince` (`{{date}}`), `eacMcpGrantUsed` (`{{ago}}`), `eacMcpGrantUnnamed`, `eacMcpGrantCut`, `eacMcpGrantCutTip`

### AI assistant window (guided set-up, live feed, undo)
`aiTitle`, `eacAiLinkText`, `eacAiLinkBtn` (My profile card leading to the page), `aiNew`, `aiWelcomeKicker`, `aiWelcomeTitle`, `aiWelcomeText`, `aiEx3mf`, `aiExQr`, `aiExInvoice`, `aiStart`, `aiMarkWho`, `aiMarkWhere`, `aiMarkRights`, `aiMarkConnect`, `aiNoneLink`, `aiConnectTitleLocal`, `aiConnectTitleWeb`, `aiCopyAddress`, `aiAddressCopied`, `aiOpenGuide`, `aiWaitLocal`, `aiWaitWeb`, `aiWaitingFor`, `aiTroubleLocal`, `aiTroubleHelp`, `aiRetry`, `aiBack`, `aiNext`, `aiQWho`, `aiNoneHint`, `aiGetClaude`, `aiQWhere`, `aiWhereLocal`, `aiWhereLocalSub`, `aiWhereWeb`, `aiWhereWebSub`, `aiQRights`, `aiRightsRead`, `aiRightsReadSub`, `aiRightsWrite`, `aiRightsWriteSub`, `aiConnectLocal`, `aiConnectLocalBtn`, `aiConnectWeb`, `aiWaitPrompt`, `aiWaitDone`, `aiConnectedTitle`, `aiConnectedLocal`, `aiConnectedWeb`, `aiConnectedGo`, `aiStatusLocal`, `aiStatusOff`, `aiStatusRead`, `aiStatusWrite`, `aiStatusWeb`, `aiTryTitle`, `aiTryDone`, `aiTryStock`, `aiTry3mf`, `aiTryLow`, `aiTryWeight`, `aiFeedTitle`, `aiFeedEmpty`, `aiFeedWebNote`, `aiChangesTitle`, `aiUndo`, `aiUndone`, `aiUndoFailed`, `aiAnother`, `aiPageSub`, `aiManageAccess`, `aiTry3mfHint`, `aiEmptyTitle`, `aiEmptyText`, `aiNoChanges`

Activity feed and history (what the assistant did, shown in the feed and the changes list). Event labels: `aiEvRefused`, `aiEvSearch`, `aiEvResults` (plural, `{{n}}`), `aiEvResultsFor` (plural, `{{n}}`, `{{q}}`), `aiEvSpool`, `aiEvSummary`, `aiEvSpoolsKg` (plural, `{{n}}`, `{{kg}}`), `aiEvRacks`, `aiEvFree`, `aiEvFreeN` (plural), `aiEvPrinters`, `aiEvCatalog`, `aiEvMatch`, `aiEvMatchN` (`{{ok}}`, `{{n}}`), `aiEvIdentify`, `aiEvLabel`, `aiEvCreated` (plural), `aiEvRackCreated`, `aiEvOther`, `aiEvUndone`. Refusal reasons (lowercase, after "Refused"): `aiReasonReadOnly`, `aiReasonLimit`, `aiReasonNotFound`, `aiReasonOther`. Field names (shown as "Product · Weight left"): `aiFieldWeight`, `aiFieldNote`, `aiFieldTags`, `aiFieldTd`, `aiFieldContainer`, `aiFieldPlace`, `aiFieldPriceHt`, `aiFieldBuyLink`, `aiFieldMinStock`, `aiFieldProductNote`, `aiFieldLinks`, `aiFieldRackName`, `aiFieldRackSub`. Values: `aiValNotStored`, `aiValLinks` (plural), `aiValProduct`. History window: `aiSeeHistory` (`{{n}}`), `aiHistoryTitle`, `aiHistorySub`, `aiAccessTitle`, `aiAccessSub`, `aiAccessOff`, `aiAccessOffSub`, `aiAccessPrivacy`, `aiAdvanced`, `aiRenewKey`, `aiRenewKeyHint`, `aiRenewKeyDone`.

### Web build (Tiger Studio Web)
Install as an app (sidebar, web only): `sbInstallBtn`, `installIosHint` (iOS: Share → Add to Home Screen)

### Tiger Quests (renderer/quests/index.js)
Window and pill: `questsTitle`, `questsToday`, `questsJourney`, `questsOpenApp`, `questsFullSet`, `questsStreak` (`{{n}}`), `questsMissionDone`, `questsFullSetDone`, `questsLevelDone`, `questsWon`, `questsWaiting`, `questsLocked` (`{{xp}}`), `questsProgress` (`{{n}}`, `{{total}}`), `questsComingSoon`, `questsLoading`

Built from ids (dynamic): daily missions `questDaily_<id>` (`findBrand` takes `{{brand}}`, `filterMaterial` takes `{{material}}`), journey actions `questAct_<level>_<action>` (e.g. `questAct_d1_displayName`, 85 keys), level themes `questLevel_d1`…`questLevel_e5` and `questLevel_m1`…`questLevel_m5` (the Mountaineer rank), ranks `questRank_1`…`questRank_20` and their worlds `questWorld_1`…`questWorld_20`. XP history parts: `xpAch_daily`, `xpAch_updates`, `xpAch_journey`.

### TigerSquad country league (account modal → Ligue des pays)
`squadCountryChange` (the button beside the current flag), and its window: `squadCountryPickTitle`, `squadCountryPickSub`, `squadCountryCurrent`, `squadCountryDetected` (badge when the flag is the auto-detected one), `squadCountrySearch`, `squadCountryLockTitle` (`{{n}}` days), `squadCountryPickWarn` (the lock line), `squadCountryConfirm` (`{{country}}`, the held button), `squadCountryPickNone` (the button before a pick), `squadCountryKeep`

### Trophies (renderer/quests/trophies.js)
Generic labels only: `trophyTier_<tier>`, `trophyFamilyAll`, `trophyFilter_<all|got|locked>`, `trophyHidden`, `trophyHiddenHow`, `trophySeenAt` (`{{name}}`: the friend who revealed it), `trophyUnlocked`, `trophySeeAll`… No `trophy_<id>` / `trophyHow_<id>` / `trophyFamily_<family>` key: each trophy's name and mission and each family's label come from the backend (`trophyCatalog.json`, `trophyFamilies.json` → cdn catalogue, `trophyCards`), see `docs/TROPHIES.md`.
