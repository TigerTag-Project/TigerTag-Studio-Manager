# i18n keys — complete reference (TigerTag Studio)

> Extracted from `CLAUDE.md` to keep the always-loaded instructions lean. **Read this on demand instead of re-reading the locale JSON files.** All **9 locales** (en/fr/de/es/it/zh/pt/pt-pt/pl) have every key below. To add/change keys use `npm run i18n:add` (never hand-edit the locale files) — see CLAUDE.md → *i18n — workflow*.

### App / status
| Key | Purpose |
|-----|---------|
| `appSubtitle` | Header subtitle |
| `backendIdle` | Health tooltip idle |
| `backendOk` | Health tooltip ok (also used with `— N ms` suffix) |
| `backendErr` | Health tooltip error `{{n}}` |
| `backendOffline` | Health tooltip offline |
| `rfidConnected` | RFID label `{{name}}` |
| `rfidNoReader` | RFID no reader |
| `rfidScanned` | RFID scanned `{{uid}}` |
| `rfidNotFound` | RFID unknown UID `{{uid}}` |
| `welcomeBack` | Array of random greeting strings |

### Community / links
| Key | Purpose |
|-----|---------|
| `githubBtn` | GitHub button |
| `discordBtn` | Discord button |
| `mobileApp` | QR label |
| `mobileScan` | QR sub-label |

### Settings panel
| Key | Purpose |
|-----|---------|
| `settingsOpenBtn` | Settings button label |
| `settingsTitle` | Panel title |
| `settingsAccount` | Account tab label |
| `settingsData` | Data & Export tab label |
| `settingsLang` | Language section label |
| `settingsDebug` | Debug tab label |
| `settingsSave` | Save & reload button |
| `settingsApiLink` | Export URL field label |
| `settingsExport` | Download JSON button |
| `settingsCopied` | Copy confirmation |
| `debugOpenBtn` | Open debug panel button |
| `fsExplorerOpenBtn` | Open Firestore explorer button (opens debug panel on the Firestore tab) |
| `sectionTags` | Detail-panel Tags/Balises section label |
| `tagAdd` | Tag input placeholder ("Add a tag…") |
| `tagRemove` | Remove-tag button tooltip |
| `tagMax` | Max-tags-per-spool notice (reserved; `{{n}}` count) |
| `sortBy` | Grid-view sort dropdown title |
| `sortDir` | Grid-view sort direction toggle title |
| `filterAllTags` | Tag filter dropdown — "All tags" default |
| `toolRepairPlus` / `toolRepairPlusTip` | Toolbox "Restore TigerTag+" action + tooltip (keys kept as `Repair*`; label reads "Restore") |
| `toolRepairNoChip` / `toolRepairNoBackup` | Restore guard messages (chip not on reader / no backup) |
| `toolRepairWriting` / `toolRepairDone` / `toolRepairAlready` / `toolRepairFailed` | Restore progress/result states |
| `toolFormatRfid` / `toolFormatRfid2` / `toolFormatRfidTip` | Toolbox "Erase the {{tier}}" action — 1 chip / 2 chips label (`{{tier}}` = TigerTag / TigerTag+) + ⓘ info bubble (writes the official TigerTag Init payload → reusable TigerTag) |
| `toolFormatWriting` / `toolFormatDone` / `toolFormatFailed` | Reset progress/result states (no-chip reuses `toolRepairNoChip`) |
| `toolEraseRfid` / `toolEraseRfid2` / `toolEraseRfidTip` | Toolbox "Recycle to NFC" action — 1 chip / 2 chips label + ⓘ info bubble (writes the SDK blank-NDEF payload → generic NFC tag) |
| `toolEraseWriting` / `toolEraseDone` / `toolEraseFailed` | Erase progress/result states (no-chip reuses `toolRepairNoChip`) |
| `toolMeasureColorTip` / `toolMeasureTdTip` / `toolEditImgTip` / `twinLinkActionTip` / `toolRemoveFromRackTip` / `encodeCloudTip` / `burnRfidTip` / `toolRefreshApiTip` / `toolDuplicateTip` / `twinLinkUnlinkHint` | ⓘ info-bubble text for the remaining toolbox actions (one per button) |
| `backupBadge` | "Signature backed up" tooltip on the shield-check badge |

### Account management
| Key | Purpose |
|-----|---------|
| `addAccountLabel` | Add account button / modal title |
| `addAccountSave` | Add & load (legacy, kept) |
| `addAccountAuthError` | Friendly error for invalid email/API key |
| `editAccountTitle` | Edit account modal title |
| `btnSignIn` | Sign in button |
| `btnEditAccount` | Edit account button |
| `btnDisconnect` | Disconnect button |
| `btnRefresh` | Refresh button |
| `btnSwitchAccount` | Switch account button |
| `noAccounts` | Empty accounts message |
| `accountActive` | "Active" badge |
| `btnActivate` | Switch button for other accounts |
| `btnDeleteAccount` | Trash button tooltip |
| `btnEditApiKey` | Edit API key (legacy) |
| `btnUpdateApiKey` | Update button in edit-account modal |
| `cancelAddAccount` | Cancel label |
| `otherAccounts` | "Other accounts" heading |
| `confirmDeleteAccount` | (legacy) |
| `delModalTitle` | Disconnect modal title |
| `delModalWarn` | Disconnect modal warning |
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
| `loginAccountCreated` | Account created confirmation |
| `loginEmailInUse` | Email already registered error |

### Credentials card
| Key | Purpose |
|-----|---------|
| `credTitle` | Section title |
| `credEmail` | Email label |
| `credApiKey` | API Key label |
| `credStatus` | Status label |
| `statusUntested` | Badge: untested |
| `statusValid` | Badge: valid |
| `statusInvalid` | Badge: invalid |
| `statusChecking` | Badge: checking… |
| `btnLoadInv` | Load inventory button |
| `btnTestKey` | Test API key button |
| `btnClearSaved` | Clear saved data button |

### Inventory / filters
| Key | Purpose |
|-----|---------|
| `invTitle` | Section title |
| `btnViewTable` | Table view button |
| `btnViewGrid` | Grid view button |
| `btnShowDeleted` | Show deleted toggle |
| `btnHideDeleted` | Hide deleted toggle |
| `btnExport` | Export JSON button |
| `searchPlaceholder` | Search input placeholder |
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
`thUid` `thType` `thMaterial` `thBrand` `thColor` `thName` `thWeight` `thCapacity` `thUpdated`

### Debug panel
| Key | Purpose |
|-----|---------|
| `debugLabel` | Panel title |
| `debugSubtitle` | Panel subtitle |
| `debugNoReqs` | Empty state |

### Detail panel — sections
`sectionColors` (plural object) `sectionPrint` `sectionWeight` `sectionLinks` `sectionContainer` `sectionDetails` `sectionRaw`

### Detail panel — print settings
`lbNozzle` `lbBed` `lbDryTemp` `lbDryTime` `lbDensity`

### Weight section
| Key | Purpose |
|-----|---------|
| `weightTotal` | Total capacity `{{cap}}` |
| `weightContainer` | Container weight `{{cw}}` (also used as change-container trigger label) |
| `weightOk` | Success result `{{wa}} {{w}} {{cw}}` |
| `weightOkTwin` | Twin updated suffix |
| `weightErr` | Error result `{{r}}` |
| `weightErrComputed` | Computed weight suffix `{{c}}` |
| `rawScaleLabel` | Raw scale input label |
| `rawScaleHint` | Raw scale hint text |
| `btnUpdate` | Update weight button |
| `btnEditManually` | Toggle manual input |
| `btnCloseManual` | Close manual input |
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
| `invError` | Inventory load error `{{r}}` |
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
| `friendsPublicLabel` | Public inventory toggle label |
| `friendsPublicSub` | Toggle sub-label ("Visible to everyone") |
| `friendsList` | "My friends" section heading |
| `friendsEmpty` | Empty state when no friends |
| `friendsAdd` | Add friend button |
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
| `friendRegenConfirm` | (kept in locales, no longer used in UI — reserved) |

### Notification center (local notices)
| Key | Purpose |
|-----|---------|
| `notifPaxxTitle` | Paxx firmware release notice title (Snapmaker owners) |
| `notifPaxxText {{version}}` | Paxx release notice body — click opens the .bin download |

> ⚠️ This table is a snapshot and can drift as keys are added. The authoritative key set is the locale files themselves; `npm run i18n:check` is the source of truth for "do all 9 locales agree". When you add keys via `npm run i18n:add`, append them to the relevant section here too.
