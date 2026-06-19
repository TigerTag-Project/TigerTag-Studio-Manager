/**
 * printers/anycubic/settings.js — Anycubic brand metadata & form schema.
 * Pure data, no dependencies.
 *
 * Unlike other brands, the connection fields are NOT user-knowable: the
 * broker username/password, deviceId and numeric model id are cloud-issued
 * per pairing and live in AnycubicSlicerNext's on-disk config. The add-flow
 * therefore pre-fills all of them via "Import from Anycubic Slicer"
 * (see add-flow.js); manual entry is an escape hatch only.
 */

export const meta = {
  label: "Anycubic",
  accent: "#00a9e0",
  // `connection` is the brand-picker capability description (both modes).
  // `connLan` is the per-device chip label when the printer is in LAN mode —
  // the card already swaps to the cloud label when `p.mode === "cloud"`.
  connection: "MQTT (LAN / Cloud)",
  connLan: "MQTT (LAN)"
};

export const schema = {
  docsUrl: "https://wiki.anycubic.com/",
  sections: [
    { titleKey: "printerSecConnection", fields: [
      { key: "ip", labelKey: "printerLblIP", hintKey: "printerHintAnycubicIP",
        placeholder: "192.168.1.46", mono: true, required: true }
    ]},
    // All four values below come from the slicer pairing — the import flow
    // fills them automatically. `acuModelId` is Anycubic's NUMERIC model id
    // (e.g. 20027 = Kobra 3 V2) used to build the MQTT topics; it is distinct
    // from `printerModelId` (the local catalog id that picks the photo).
    { fields: [
      { key: "acuModelId", labelKey: "printerLblModelId",  hintKey: "printerHintAnycubicModelId",
        placeholder: "20027", mono: true, required: true },
      { key: "deviceId",   labelKey: "printerLblDeviceId", hintKey: "printerHintAnycubicDeviceId",
        placeholder: "32-char hex id", mono: true, required: true }
    ]},
    { fields: [
      { key: "username", labelKey: "printerLblUsername", hintKey: "printerHintAnycubicUsername",
        placeholder: "user12345678", mono: true, required: true },
      { key: "password", labelKey: "printerLblPassword", hintKey: "printerHintAnycubicPassword",
        placeholder: "••••••••", mono: true, required: true, secret: true }
    ]}
  ]
};

export const helper = {
  titleKey:   "printerHelperAnycubicTitle",
  bulletsKey: "printerHelperAnycubicBullets"
};
