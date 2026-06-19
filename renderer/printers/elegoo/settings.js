/**
 * printers/elegoo/settings.js — Elegoo brand metadata & form schema.
 * Pure data, no dependencies.
 */

export const meta = {
  label: "Elegoo",
  accent: "#00a3e0",
  connection: "MQTT (LAN)"
};

export const schema = {
  docsUrl: null,
  sections: [
    { titleKey: "printerSecConnection", fields: [
      { key: "ip", labelKey: "printerLblIP",     hintKey: "printerHintElegooIP",
        placeholder: "192.168.1.51", mono: true, required: true },
      { key: "sn", labelKey: "printerLblSerial", hintKey: "printerHintElegooSerial",
        placeholder: "0CCN201XXXX",  mono: true, required: true }
    ]},
    // The MQTT access code is REQUIRED on Elegoo: the printer's broker rejects
    // the CONNECT if the password is empty (silent disconnect, no error). The
    // factory default is "123456" — the user may change it from the printer's
    // network settings screen. Reuses the shared `printerLblAccessCode` /
    // `printerSecCredentials` strings so the UI stays consistent with Bambu.
    { fields: [
      { key: "mqttPassword", labelKey: "printerLblAccessCode", hintKey: "printerHintElegooMqtt",
        placeholder: "—", mono: true, required: true, secret: true }
    ]}
  ]
};

export const helper = {
  titleKey:   "printerHelperElegooTitle",
  bulletsKey: "printerHelperElegooBullets"
};
