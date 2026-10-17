/**
 * printers/elegoo/canvas.js — the Canvas (multi-filament hub) of an Elegoo
 * printer that speaks SDCP v3 (Centauri Carbon 1). Pure functions only: nothing
 * here touches the DOM, the socket or `ctx`, so they can be tested with plain
 * objects (scripts/test-elegoo-canvas.mjs).
 *
 * Source: the Home Assistant integration danielcherubini/elegoo-homeassistant —
 * NOT yet confirmed on a real CC1 with a Canvas (issue #98):
 *   - the status push carries `AmsConnectStatus` (1 = a Canvas is connected) — read
 *     from `Status` here; the integration reads it from `Data.Data.Status`, so the
 *     driver also asks once at connection instead of relying on it alone;
 *   - SDCP command 324 answers
 *     `{ Ack, active_canvas_id, active_tray_id, auto_refill,
 *        canvas_list: [{ canvas_id, connected, tray_list: [{ tray_id, brand,
 *        filament_type, filament_name, filament_color, min_nozzle_temp,
 *        max_nozzle_temp, status }] }] }` — the same vocabulary as the CC2's
 *     `canvas_info` (PROTOCOL.md §8).
 */

export const CMD_GET_CANVAS_STATUS = 324;

/** `true` / `false` from the status push, `null` when the printer does not say. */
export function sdcpCanvasPresent(status) {
  const v = status?.AmsConnectStatus;
  if (v === 1 || v === true) return true;
  if (v === 0 || v === false) return false;
  return null;
}

// A blank, "—…" (brand placeholder) or "?" (unknown type) means "not set".
const text = v => {
  const s = String(v ?? '').trim();
  return s && !s.startsWith('—') && s !== '?' ? s : null;
};
// Ends up in a style attribute: only a plain hex colour gets through.
const hex = v => {
  const s = text(v);
  if (!s) return null;
  const c = s.replace(/^#|^0x/i, '');
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(c) ? `#${c.toUpperCase()}` : null;
};
const temp = v => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

/**
 * The Canvas, from the `Data` of a command-324 answer.
 * Returns null when the answer is not usable (refused, empty, not an object);
 * `{ connected: false, trays: [] }` when the printer says no Canvas is plugged in.
 */
export function sdcpParseCanvas(data) {
  if (!data || typeof data !== 'object' || data.Ack !== 0) return null;
  const hub = Array.isArray(data.canvas_list) ? data.canvas_list[0] : null;
  if (!hub || typeof hub !== 'object') return null;
  const connected = hub.connected === 1 || hub.connected === true;
  if (!connected) return { connected: false, trays: [] };
  const list = Array.isArray(hub.tray_list) ? hub.tray_list : [];
  const activeTray = Number.isInteger(data.active_tray_id) && data.active_tray_id >= 0 ? data.active_tray_id : null;
  return {
    connected: true,
    autoRefill: data.auto_refill === 1 || data.auto_refill === true,
    activeTray,
    trays: list.map((t, i) => ({
      trayId: i,
      color: hex(t?.filament_color),
      type: text(t?.filament_type),
      vendor: text(t?.brand),
      name: text(t?.filament_name),
      minTemp: temp(t?.min_nozzle_temp),
      maxTemp: temp(t?.max_nozzle_temp),
      active: activeTray === i,
    })),
  };
}

/** The slots every brand hands to the board: `[{ key, label, color, material, detail, vendor, empty }]`. */
export function sdcpCanvasSlots(canvas) {
  if (!canvas?.connected || !canvas.trays?.length) return [];
  return canvas.trays.map((t, i) => ({
    key: `t${i}`,
    label: `${i + 1}`,
    color: t.color,
    material: t.type,
    detail: t.name,
    vendor: t.vendor,
    empty: !t.color && !t.type,
  }));
}
