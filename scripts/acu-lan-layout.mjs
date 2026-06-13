/** Quick LAN getInfo layout dump — shows the full box/slot structure. */
import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto'; import mqtt from 'mqtt';
function deob(s){const o=Buffer.from(s,'base64');for(let i=0;i<o.length;i++)o[i]=(o[i]-5)&0xff;const n=Buffer.from(o.toString('ascii'),'base64');for(let i=0;i<n.length;i++)n[i]=(n[i]-5)&0xff;return n.toString('utf8');}
function confs(){const l=[];if(process.platform==='win32'&&process.env.APPDATA)l.push(path.join(process.env.APPDATA,'AnycubicSlicerNext','AnycubicSlicerNext.conf'));return l.flatMap(p=>[p,p+'.bak']);}
function readP(){const c=confs().find(p=>{try{return fs.existsSync(p);}catch{return false;}});const m=fs.readFileSync(c,'utf8').match(/"machine_list_of_LAN"\s*:\s*"([^"]*)"/);return JSON.parse(deob(m[1])).map(p=>{const b=String(p.broker||'').match(/mqtts?:\/\/([^:]+):(\d+)/);return{ip:b?b[1]:p.ip,port:b?+b[2]:9883,username:p.username,password:p.password,deviceId:p.deviceId,modelId:String(p.modeId||p.modelId||''),name:p.name};});}
const ip=process.argv[2];
const p=readP().find(x=>!ip||x.ip===ip);
if(!p){console.error('not found; have:',readP().map(x=>x.ip+' '+x.name));process.exit(1);}
console.log(`${p.name} (${p.ip}, model ${p.modelId})`);
const cmd=`anycubic/anycubicCloud/v1/web/printer/${p.modelId}/${p.deviceId}/multiColorBox`;
const rep=`anycubic/anycubicCloud/v1/printer/public/${p.modelId}/${p.deviceId}/#`;
const c=mqtt.connect({host:p.ip,port:p.port,protocol:'mqtts',username:p.username,password:p.password,rejectUnauthorized:false,minVersion:'TLSv1.2',maxVersion:'TLSv1.2',clientId:'lay_'+Math.random().toString(16).slice(2),clean:true,reconnectPeriod:0});
let done=false;const fin=()=>{if(done)return;done=true;c.end(true);process.exit(0);};
setTimeout(()=>{console.log('timeout');fin();},10000);
c.on('connect',()=>{c.subscribe(rep,{qos:0});c.publish(cmd,JSON.stringify({type:'multiColorBox',action:'getInfo',timestamp:Date.now(),msgid:crypto.randomUUID()}));});
c.on('message',(t,pl)=>{if(!t.endsWith('/multiColorBox/report'))return;let o;try{o=JSON.parse(pl);}catch{return;}const boxes=o.data?.multi_color_box;if(!Array.isArray(boxes))return;
  console.log(`\n${boxes.length} box(es):`);
  for(const b of boxes){const slots=Array.isArray(b.slots)?b.slots:[];console.log(`  box id=${b.id} model_id=${b.model_id} temp=${b.temp} slots=${slots.length}`);for(const s of slots)console.log(`    slot index=${s.index} type=${JSON.stringify(s.type)} color=${JSON.stringify(s.color)}`);}
  fin();});
c.on('error',e=>{console.error('err',e.message);fin();});
