// Throwaway capture tool — logs Moonraker WebSocket activity while the user
// triggers a CFS Feed/Retract from the printer screen, to reverse-engineer the
// exact load/unload command sequence + slot addressing. Read-only (listens only).
//   node scripts/cfs-capture.mjs <ip> [seconds]
import WebSocket from 'ws';

const ip   = process.argv[2] || '192.168.1.4';
const secs = parseInt(process.argv[3] || '120', 10);
const url  = `ws://${ip}:7125/websocket`;
const t0   = Date.now();
const ts   = () => `+${((Date.now() - t0) / 1000).toFixed(1)}s`;

const ws = new WebSocket(url);

ws.on('open', () => {
  console.log(`[open] ${url} — listening ${secs}s. Trigger the Feed now.`);
  // Subscribe to anything that might reveal slot state transitions.
  ws.send(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'printer.objects.subscribe',
    params: { objects: {
      filament_rack: null,
      'filament_switch_sensor filament_sensor': null,
      extruder: null,
      gcode_move: null,
      motion_report: null,
      idle_timeout: null,
      print_stats: null,
    } },
  }));
});

ws.on('message', (buf) => {
  let m; try { m = JSON.parse(buf.toString()); } catch { return; }
  // Klipper gcode responses (the `// [box] ...` lines, action_respond_info, etc.)
  if (m.method === 'notify_gcode_response') {
    for (const line of [].concat(m.params || [])) console.log(`${ts()} GCODE   ${line}`);
    return;
  }
  // Status updates for subscribed objects — show only what changed, and drop the
  // noisy idle temperature drift (only log extruder when something other than the
  // live temperature moves: target, can_extrude, etc.).
  if (m.method === 'notify_status_update') {
    const status = (m.params || [])[0] || {};
    for (const [obj, fields] of Object.entries(status)) {
      const keys = Object.keys(fields);
      if (obj === 'extruder' && keys.length === 1 && keys[0] === 'temperature') continue;
      console.log(`${ts()} STATUS  ${obj}: ${JSON.stringify(fields)}`);
    }
    return;
  }
  // Initial subscribe reply (baseline state) + anything else with a method.
  if (m.id === 1 && m.result) {
    console.log(`${ts()} BASE    ${JSON.stringify(m.result.status || m.result).slice(0, 400)}`);
    return;
  }
  if (m.method && !m.method.startsWith('notify_proc_stat')) {
    console.log(`${ts()} EVENT   ${m.method} ${JSON.stringify(m.params || '').slice(0, 200)}`);
  }
});

ws.on('error', (e) => console.log(`[error] ${e.message}`));
setTimeout(() => { console.log(`${ts()} [done]`); ws.close(); process.exit(0); }, secs * 1000);
