/**
 * services/demo/faces/flashforge.js — a demo printer seen as a FlashForge
 * (AD5X with its 4-slot material station) on the local HTTP API.
 *
 * Serves what the FlashForge driver uses (renderer/printers/flashforge/
 * PROTOCOL.md): POST /detail and /control with { serialNumber, checkCode },
 * the file endpoints, the MJPEG camera and the job thumbnail — all on ONE port:
 * the record's `ip` is a full URL (http://127.0.0.1:<port>), which the driver
 * accepts. The camera is fetched by the renderer, hence the CORS header.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');
const { mjpeg, snapshot, readBody, listen } = require('./common');

const STATUS = {   // engine phase → FlashForge detail.status
  idle: 'ready', heating: 'heating', leveling: 'preparing', printing: 'printing',
  paused: 'paused', complete: 'completed', cancelled: 'cancelled', error: 'error',
};
const CORS = { 'Access-Control-Allow-Origin': '*' };
const FILE = id => `${id}.gcode`;
const normSerial = s => (/^sn/i.test(String(s)) ? String(s) : `SN${s}`);

function detail(m, base, model) {
  const n = m.nozzles()[0], bed = m.heaters.bed, active = m.phase !== 'idle' && m.print;
  const slots = m.slots.map((s, i) => ({ slotId: i + 1, hasFilament: !s.empty, materialName: s.material, materialColor: s.color }));
  return {
    status: STATUS[m.phase] || 'ready',
    printProgress: active ? +m.progress.toFixed(4) : 0,
    printLayer: active ? m.layer : 0, targetPrintLayer: active ? m.print.layersTotal : 0,
    estimatedTime: active ? m.remainingSec : 0, printDuration: active ? m.elapsedSec : 0,
    printFileName: active ? FILE(m.print.id) : '',
    printFileThumbUrl: active ? `${base}/thumb/${m.print.id}.png` : '',
    rightTemp: +n.cur.toFixed(1), rightTargetTemp: n.target, leftTemp: 0, leftTargetTemp: 0,
    platTemp: +bed.cur.toFixed(1), platTargetTemp: bed.target,
    coolingFanSpeed: m.fan, chamberFanSpeed: 0, internalFanStatus: 'close', externalFanStatus: 'close',
    errorCode: m.phase === 'error' ? 'E0001' : '', doorStatus: 'close',
    model: `Flashforge ${model?.name || 'AD5X'}`, name: model?.name || 'AD5X', firmwareVersion: '1.1.7-demo',
    nozzleModel: '0.4mm', nozzleCnt: 1, measure: '220x220x220', location: 'Demo',
    ipAddr: '127.0.0.1', macAddr: '00:00:00:00:00:00',
    hasMatlStation: slots.length > 0,
    matlStationInfo: { currentSlot: m.activeSlot + 1, slotCnt: slots.length, slotInfos: slots },
    indepMatlInfo: { materialName: 'PLA', materialColor: '#FFFFFF' },
    hasLeftFilament: false, hasRightFilament: true,
    cameraStreamUrl: `${base}/?action=stream`,
  };
}

function start({ machine: m, address, library, record = {}, model }) {
  const [host, port = '8898'] = address.split(':');   // a bare host: the printer's own port
  const base = `http://${host}:${port}`;
  const serial = normSerial(record.serialNumber || ''), code = String(record.password || '').trim();
  const streams = new Set();
  const json = (res, body) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, base), p = u.pathname;
    if (req.method === 'GET') {
      if (u.searchParams.get('action') === 'stream') return mjpeg(res, library, m, streams, CORS);
      if (u.searchParams.get('action') === 'snapshot') return snapshot(res, library, m, CORS);
      const th = p.match(/^\/thumb\/(.+)\.png$/);
      const t = th && library.thumbnail(decodeURIComponent(th[1]));
      if (t) { res.writeHead(200, { 'Content-Type': 'image/png', ...CORS }); return res.end(t); }
      res.writeHead(404, CORS); return res.end();
    }
    const { json: body } = await readBody(req);
    // The login a Creator 5 / AD5X answers before anything else (the TigerSpool
    // calls it first): 0 = serial + code match, 5 = wrong serial, 1 = wrong code.
    if (p === '/checkCode') {
      if (normSerial(body.serialNumber || '') !== serial) return json(res, { code: 5, message: 'SN is different' });
      if (String(body.checkCode || '').trim() !== code) return json(res, { code: 1, message: 'access code is different' });
      return json(res, { code: 0, message: 'Success' });
    }
    // The printer's own refusals, word for word (the driver matches them).
    if (normSerial(body.serialNumber || '') !== serial) return json(res, { code: 1, message: 'SN is different' });
    if (String(body.checkCode || '').trim() !== code) return json(res, { code: 1, message: 'access code is different' });

    if (p === '/detail') return json(res, { code: 0, message: 'Success', detail: detail(m, base, model) });
    if (p === '/control') {
      const { cmd, args = {} } = body.payload || {};
      if (cmd === 'lightControl_cmd') m.setLight(args.status === 'open');
      else if (cmd === 'jobCtl_cmd') {
        if (args.action === 'pause') m.pause();
        else if (args.action === 'continue') m.resume();
        else if (args.action === 'cancel') m.stop();
      } else if (cmd === 'msConfig_cmd') {
        if (!m.setSlot(Number(args.slot) - 1, { material: args.mt, color: args.rgb })) return json(res, { code: 1, message: 'Invalid slot' });
      } else if (cmd === 'ipdMsConfig_cmd') { /* external spool: accepted */ }
      else return json(res, { code: 1, message: `Unknown command ${cmd}` });
      return json(res, { code: 0, message: 'Success' });
    }
    if (p === '/gcodeList') return json(res, { code: 0, message: 'Success', gcodeList: library.list().map(x => FILE(x.id)) });
    if (p === '/gcodeThumb') {
      const t = library.thumbnail(String(body.fileName || '').replace(/\.gcode$/, ''));
      return json(res, t ? { code: 0, message: 'Success', imageData: t.toString('base64') } : { code: 1, message: 'File not found' });
    }
    if (p === '/printGcode') {
      if (m.isBusy) return json(res, { code: 1, message: 'Printer is busy' });
      m.start(String(body.fileName || '').replace(/\.gcode$/, '') || undefined);
      return json(res, { code: 0, message: 'Success' });
    }
    return json(res, { code: 1, message: 'Unknown path' });
  });
  return listen(server, host, port).then(() => ({
    close() { for (const r of streams) { try { r.destroy(); } catch (_) {} } server.close(); },
  }));
}

module.exports = {
  brand: 'flashforge', slotCount: 4, start,
  // The driver takes a full URL in `ip`; serial + access code are checked like a real one.
  recordFields: address => ({
    ip: `http://${address}`,
    serialNumber: `SNDEMO${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    password: crypto.randomBytes(4).toString('hex').toUpperCase(),
  }),
  addressOf: rec => String(rec.ip || '').replace(/^https?:\/\//i, '').replace(/\/+$/, ''),
};
