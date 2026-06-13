/**
 * scripts/acu-cam-paths.mjs — probe an Anycubic printer's :18088 camera server
 * for a consumable local path after activating the stream. Dev tool.
 *
 * Activates the camera (video/startCapture), waits for pushStarted, then tries
 * a range of candidate HTTP paths on :18088 and prints status + a peek at the
 * body (and the 400 body for /flv, which may explain what it wants). Helps
 * decide whether a WebRTC model (e.g. Kobra X) has any pullable local stream.
 *
 * Usage: node scripts/acu-cam-paths.mjs 192.168.1.16
 */
import mqtt from 'mqtt';
import fs from 'fs';
import os from 'os';
import path from 'path';

function deob(s){const o=Buffer.from(s,'base64');for(let i=0;i<o.length;i++)o[i]=(o[i]-5)&0xff;const n=Buffer.from(o.toString('ascii'),'base64');for(let i=0;i<n.length;i++)n[i]=(n[i]-5)&0xff;return n.toString('utf8');}
function confs(){const l=[];if(process.platform==='win32'){if(process.env.APPDATA)l.push(path.join(process.env.APPDATA,'AnycubicSlicerNext','AnycubicSlicerNext.conf'));}else if(process.platform==='darwin')l.push(path.join(os.homedir(),'Library','Application Support','AnycubicSlicerNext','AnycubicSlicerNext.conf'));else l.push(path.join(os.homedir(),'.config','AnycubicSlicerNext','AnycubicSlicerNext.conf'));return l.flatMap(p=>[p,p+'.bak']);}
function readPrinters(){const c=confs().find(p=>{try{return fs.existsSync(p);}catch{return false;}});if(!c)throw new Error('conf not found');const m=fs.readFileSync(c,'utf8').match(/"machine_list_of_LAN"\s*:\s*"([^"]*)"/);if(!m)throw new Error('no list');return JSON.parse(deob(m[1])).map(p=>{const b=String(p.broker||'').match(/mqtts?:\/\/([^:]+):(\d+)/);return{ip:b?b[1]:String(p.ip||''),port:b?+b[2]:9883,username:String(p.username||''),password:String(p.password||''),deviceId:String(p.deviceId||''),modelId:String(p.modeId||p.modelId||''),name:String(p.name||'')};}).filter(p=>p.ip&&p.username);}

const ip = process.argv[2];
const p = readPrinters().find(x => !ip || x.ip === ip);
if (!p) { console.error('printer not found'); process.exit(1); }
console.log(`Probing camera paths on ${p.name} (${p.ip}, model ${p.modelId})\n`);

const CMD = `anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/video`;
const uuid = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const PATHS = ['/flv','/live','/live.flv','/live/stream','/stream','/stream.flv','/video','/video.flv',
  '/camera','/webrtc','/whep','/rtc','/0','/0.flv','/index.flv','/h264','/play.flv','/mainstream','/'];

async function tryPath(pth) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 2000);
  try {
    const res = await fetch(`http://${p.ip}:18088${pth}`, { signal: ctl.signal });
    let head = '';
    try { const { value } = await res.body.getReader().read(); ctl.abort();
      if (value) head = value.length >= 3 && value[0]===0x46&&value[1]===0x4C&&value[2]===0x56 ? 'FLV!' : value.slice(0,48).toString('utf8').replace(/[\r\n]+/g,' '); } catch {}
    const ct = res.headers.get('content-type') || '';
    return `${res.status} ${ct ? `[${ct}] ` : ''}${head}`;
  } catch (e) { return e.name === 'AbortError' ? 'timeout' : e.message; }
  finally { clearTimeout(t); }
}

const client = mqtt.connect({ host:p.ip, port:p.port, protocol:'mqtts', username:p.username, password:p.password,
  rejectUnauthorized:false, minVersion:'TLSv1.2', maxVersion:'TLSv1.2', clientId:`paths_${uuid()}`, clean:true, reconnectPeriod:0 });

client.on('connect', async () => {
  console.log('connected; startCapture…');
  client.publish(CMD, JSON.stringify({ type:'video', action:'startCapture', timestamp:Date.now(), msgid:uuid(), data:null }));
  await new Promise(r => setTimeout(r, 2500)); // let it push
  for (const pth of PATHS) console.log(`  ${pth.padEnd(16)} → ${await tryPath(pth)}`);
  console.log('\nstopCapture; done.');
  client.publish(CMD, JSON.stringify({ type:'video', action:'stopCapture', timestamp:Date.now(), msgid:uuid(), data:null }));
  setTimeout(() => { client.end(true); process.exit(0); }, 1200);
});
client.on('error', e => console.error('mqtt error:', e.message));
