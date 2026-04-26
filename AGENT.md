# AGENT.md — TigerTag Inventory Web Page

## Goal

Create a clean, single-page HTML application to manage a user's TigerTag inventory.

The page must allow a logged-in user to:

1. Authenticate with Firebase.
2. Generate or delete their Key6 API key.
3. Verify a Key6 API key.
4. Export their inventory as JSON.
5. Display inventory items in a readable table.
6. Test or update a spool weight using the public API.
7. Optionally link an RFID UID to a spool through Firebase callable function `indexRfidForSpool`.

This page is dedicated to **inventory management only**.

Do not include TigerTag Manager media/image/file administration endpoints such as:
- `UploadProductImg`
- `DeleteProductImg`
- `UploadFiles`
- `uploadFilesLocal`
- `DeleteFiles`
- `UploadMedia`
- `DeleteMedia`

Those endpoints are internal/backoffice tools and must not be exposed in this public inventory page.

---

## Base URLs

Prefer the CDN domain for public usage:

```txt
https://cdn.tigertag.io
```

Cloud Functions direct URL may be used only as fallback:

```txt
https://us-central1-tigertag-connect.cloudfunctions.net
```

---

## Useful Inventory Functions

### 1. `createAccessKey6`

Creates, rotates, or deletes the user's 6-character API key.

This endpoint requires a Firebase ID Token.

#### Endpoint

```txt
POST https://cdn.tigertag.io/createAccessKey6
```

#### Headers

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
Content-Type: application/json
```

#### Create Key Request

```json
{
  "data": {
    "action": "create",
    "label": "inventory-web"
  }
}
```

#### Create Key Response

```json
{
  "result": {
    "success": true,
    "key": "Tk237U",
    "label": "inventory-web"
  }
}
```

#### Delete Key Request

```json
{
  "data": {
    "action": "delete"
  }
}
```

#### Delete Key Response

```json
{
  "result": {
    "success": true,
    "message": "All API keys deleted (access disabled)"
  }
}
```

#### UI Requirements

The page must provide:
- a "Generate API Key" button;
- a "Delete API Key" button;
- a visible field showing the current generated key after creation;
- a warning that deleting the key disables external access such as TigerScale.

---

### 2. `pingByApiKey`

Validates a Key6 API key and returns the associated user information.

#### Endpoint

```txt
GET https://cdn.tigertag.io/pingbyapikey?ApiKey=<KEY6>
```

Also support:

```txt
GET https://cdn.tigertag.io/pingByApiKey?ApiKey=<KEY6>
```

depending on Hosting rewrites.

#### Example Request

```bash
curl "https://cdn.tigertag.io/pingbyapikey?ApiKey=Tk237U"
```

#### Success Response

```json
{
  "success": true,
  "uid": "xe1zTc8Op3dmV5mC9SfUnziuSaF2",
  "displayName": "Benoît",
  "message": "TigerTag API key valid"
}
```

#### Error Response

```json
{
  "success": false,
  "reason": "invalid_api_key"
}
```

#### UI Requirements

The page must provide:
- an input field for Key6;
- a "Test API Key" button;
- a status badge:
  - green if valid;
  - red if invalid;
  - grey if untested.

---

### 3. `exportInventoryByApiKey`

Exports the user's inventory as JSON.

This endpoint requires:
- a valid Key6 API key;
- the Firebase Auth email of the user.

#### Endpoint

```txt
GET https://cdn.tigertag.io/exportInventory?ApiKey=<KEY6>&email=<USER_EMAIL>
```

#### Example Request

```bash
curl "https://cdn.tigertag.io/exportInventory?ApiKey=Tk237U&email=user%40example.com"
```

#### Success Response

The response is an object keyed by spool UID:

```json
{
  "8396248126918784": {
    "uid": 8396248126918784,
    "measure_gr": 1000,
    "container_weight": 232,
    "weight_available": 519,
    "material": "PLA",
    "brand": "TigerTag",
    "color_name": "Red"
  },
  "8396248126918785": {
    "uid": 8396248126918785,
    "measure_gr": 750,
    "container_weight": 120,
    "weight_available": 380
  }
}
```

#### Error Responses

```json
{
  "success": false,
  "reason": "missing_email"
}
```

```json
{
  "success": false,
  "reason": "email_mismatch"
}
```

```json
{
  "success": false,
  "reason": "invalid_api_key"
}
```

#### UI Requirements

The page must:
- automatically use the logged-in Firebase user's email;
- ask for the Key6 API key;
- fetch the inventory;
- render the inventory in a table;
- show raw JSON in a collapsible `<details>` block;
- allow refresh.

Recommended table columns:
- UID / spool ID
- Material
- Brand
- Color
- Weight available
- Container weight
- Measure / capacity
- Last update
- Actions

Do not assume every field exists. Use graceful fallbacks such as `"-"`.

---

### 4. `setSpoolWeightByRfid`

Updates the weight of a spool through the public API.

Despite its name, the current implementation accepts the spool UID directly. The endpoint does not require Firebase login. It uses Key6.

#### Endpoint

```txt
GET https://cdn.tigertag.io/setSpoolWeightByRfid?ApiKey=<KEY6>&uid=<SPOOL_ID>&weight=<RAW_WEIGHT>
```

#### Example Request

```bash
curl "https://cdn.tigertag.io/setSpoolWeightByRfid?ApiKey=Tk237U&uid=8396248126918784&weight=500"
```

#### POST Alternative

```txt
POST https://cdn.tigertag.io/setSpoolWeightByRfid
```

#### POST Headers

```http
Content-Type: application/json
```

#### POST Body

```json
{
  "ApiKey": "Tk237U",
  "uid": "8396248126918784",
  "weight": 500
}
```

#### Success Response

```json
{
  "success": true,
  "UserID": "xe1zTc8Op3dmV5mC9SfUnziuSaF2",
  "uid": "8396248126918784",
  "weight": 500,
  "container_weight": 120,
  "weight_available": 380,
  "measure_gr": 750,
  "twin_uid": "8396248126918785",
  "twin_updated": true
}
```

#### Invalid Weight Response

```json
{
  "success": false,
  "reason": "invalid weight",
  "measure_gr": 750,
  "weight": 950,
  "computed_weight_available": 830,
  "container_weight": 120
}
```

#### Not Found Response

```json
{
  "success": false,
  "reason": "UID not found"
}
```

#### UI Requirements

The page must allow the user to:
- select a spool from the inventory table;
- enter a raw measured weight;
- send the update;
- display the computed `weight_available`;
- refresh inventory after successful update.

Important:
- `weight` is the raw total weight from the scale.
- `container_weight` is subtracted server-side.
- `weight_available = weight - container_weight`.

---

### 5. `indexRfidForSpool`

Links an RFID UID to a spool for the logged-in user.

This is a Firebase callable function, not a normal REST endpoint.

Use it only if the page uses the Firebase JS SDK.

#### Firebase SDK Example

```js
import { getFunctions, httpsCallable } from "firebase/functions";

const functions = getFunctions();
const indexRfidForSpool = httpsCallable(functions, "indexRfidForSpool");

const result = await indexRfidForSpool({
  rfidUid: "ABC123456",
  spoolId: "8396248126918784"
});

console.log(result.data);
```

#### Success Response

```json
{
  "success": true
}
```

#### Firestore Effect

```txt
rfidIndex/{rfidUid}
```

with:

```json
{
  "uid": "<firebase-user-uid>",
  "spoolId": "8396248126918784"
}
```

#### UI Requirements

Optional feature:
- Add a "Link RFID" action on each spool row.
- Ask the user to enter or scan an RFID UID.
- Call `indexRfidForSpool`.
- Show confirmation.

Do not call this function through plain `fetch()` unless implementing the Firebase callable protocol manually.

---

### 6. `ping`

Simple network check.

#### Endpoint

```txt
GET https://cdn.tigertag.io/ping?p=ok
```

#### Response

```txt
ok
```

#### UI Requirements

Optional:
- Add a "Connectivity Test" button.
- Display response time in ms.

---

### 7. `healthz`

Backend health check.

#### Endpoint

```txt
GET https://cdn.tigertag.io/healthz/
```

#### Basic Response

```json
{
  "ok": true
}
```

#### Deep Check

```txt
GET https://cdn.tigertag.io/healthz/?deep=1
```

#### Deep Response Example

```json
{
  "ok": true,
  "version": "healthz-v2",
  "service": "tigertag-connect",
  "region": "us-central1",
  "deep": {
    "firestore": "ok",
    "storage": "ok"
  }
}
```

#### UI Requirements

Optional:
- Add a small backend status indicator.
- Do not run deep checks too frequently.

---

## Page Architecture

Build a single HTML page with embedded CSS and JavaScript.

Suggested file:

```txt
inventory.html
```

The page must be simple, responsive, and usable on desktop and tablet.

### Required Sections

1. **Header**
   - Title: `TigerTag Inventory`
   - Small subtitle: `Manage your TigerTag inventory and API access`

2. **Firebase Login Section**
   - Email/password login or Google login, depending on Firebase config.
   - Show current user email after login.
   - Logout button.

3. **API Key Section**
   - Generate Key6
   - Delete Key6
   - Test Key6
   - Key input field

4. **Inventory Section**
   - Export / refresh inventory
   - Inventory table
   - Empty state if no inventory exists
   - Error state if API key/email mismatch

5. **Weight Update Panel**
   - Selected spool UID
   - Raw weight input
   - Update button
   - Last API response

6. **Optional RFID Link Panel**
   - Selected spool UID
   - RFID UID input
   - Link button
   - Last callable response

7. **Debug Panel**
   - Collapsible raw JSON output
   - Last request URL
   - Last response body

---

## Security Rules for the Page

Never hardcode secrets in the HTML.

Do not expose:
- `x-auth-token`
- `INGEST_SECRET`
- TigerTag Manager upload/delete endpoints
- admin/backoffice credentials

The public inventory page may expose only:
- Key6 user actions
- inventory export
- spool weight update
- API key validation
- ping/healthz checks

The user must understand that their Key6 API key gives access to inventory-related actions.

Show a warning:

```txt
Keep your API key private. Anyone with this key may update or access inventory endpoints depending on the endpoint requirements.
```

---

## UX Requirements

Use modern but simple UI:
- white background;
- cards;
- rounded corners;
- clear buttons;
- green success badges;
- red error badges;
- grey neutral states;
- monospace for API responses.

All labels and interface text must be in English unless explicitly requested otherwise.

Do not use heavy frameworks.
Vanilla HTML/CSS/JS is preferred.

---

## Error Handling

Every API call must:

1. Show loading state.
2. Disable the related button while loading.
3. Catch network errors.
4. Display HTTP status code.
5. Display parsed JSON response if available.
6. Display raw text if the response is not JSON.

Use a helper like:

```js
async function apiFetch(url, options = {}) {
  const started = performance.now();
  const response = await fetch(url, options);
  const text = await response.text();

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }

  return {
    ok: response.ok,
    status: response.status,
    durationMs: Math.round(performance.now() - started),
    body
  };
}
```

---

## Inventory Rendering Rules

The inventory export returns an object, not an array.

Convert it to rows:

```js
const rows = Object.entries(inventory).map(([spoolId, data]) => ({
  spoolId,
  ...data
}));
```

When rendering:
- prefer `spoolId` from object key;
- fallback to `data.uid`;
- do not crash if optional fields are missing.

Example:

```js
function valueOrDash(value) {
  return value === undefined || value === null || value === "" ? "-" : value;
}
```

---

## Recommended Implementation Steps

1. Create the base HTML structure.
2. Add Firebase initialization placeholders.
3. Implement login/logout.
4. Implement `createAccessKey6`.
5. Implement `pingByApiKey`.
6. Implement `exportInventoryByApiKey`.
7. Render inventory table.
8. Implement `setSpoolWeightByRfid`.
9. Add optional `indexRfidForSpool`.
10. Add debug panel.
11. Add responsive CSS.

---

## Firebase Placeholders

Use placeholders so the developer can fill the real Firebase config:

```js
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "tigertag-connect",
  storageBucket: "tigertag-connect.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

---

## Acceptance Criteria

The final page is valid if:

- A user can log in with Firebase.
- A user can generate a Key6 API key.
- A user can validate the Key6 key.
- A user can export their inventory using Key6 + email.
- Inventory appears in a clean table.
- A user can select a spool and send a test weight update.
- API responses are visible in a debug panel.
- No TigerTag Manager secret or upload endpoint is exposed.
- The page works from the CDN domain.
