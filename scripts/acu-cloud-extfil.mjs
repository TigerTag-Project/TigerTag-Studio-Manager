/** Probe a cloud printer's external-spool reporting (multiColorBox vs extfilbox). */
import https from 'https'; import crypto from 'crypto'; import mqtt from 'mqtt';
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
const certs = require('../services/anycubicCloudCerts.js');
const AID='f9b3528877c94d5c9c5af32245db46ef',SEC='0cf75926606049a3937f56b0373b99fb',VER='V3.0.0';
const API='https://cloud-universe.anycubic.com/p/p/workbench/api';
const md5=s=>crypto.createHash('md5').update(String(s),'utf8').digest('hex');
const FIND="function findStore(){try{var a=document.getElementById('app');if(a&&a.__vue__&&a.__vue__.$store)return a.__vue__.$store;}catch(e){}try{var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var v=all[i].__vue__;if(v&&v.$store)return v.$store;}}catch(e){}return null;}";
function cdpEval(u,e){return new Promise(r=>{let d=0,ws;const f=v=>{if(d)return;d=1;try{ws&&ws.close();}catch{}r(v);};try{ws=new WebSocket(u);}catch(x){return f({error:x.message});}const t=setTimeout(()=>f({error:'timeout'}),9000);ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:e,returnByValue:true,awaitPromise:true}})));ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}if(m.id!==1)return;clearTimeout(t);f({value:m.result&&m.result.result?m.result.result.value:undefined});});ws.addEventListener('error',()=>{clearTimeout(t);f({error:'ws'});});});}
async function token(){const ts=await(await fetch('http://127.0.0.1:9222/json/list',{signal:AbortSignal.timeout(5000)})).json();const wb=ts.find(t=>/workbench|orca-ac-web/i.test((t.url||'')+(t.title||''))&&t.webSocketDebuggerUrl);const r=await cdpEval(wb.webSocketDebuggerUrl,"(()=>{try{"+FIND+"var g=findStore().getters;return JSON.stringify({token:g.GET_TOKEN||'',email:(g.GET_USER_INFO||{}).email||''});}catch(e){return JSON.stringify({err:String(e)});}})()");return JSON.parse(r.value);}
function hdr(t){const n=crypto.randomUUID(),ts=Date.now();return{'Xx-Device-Type':'pcf','Xx-Is-Cn':'1','Xx-Nonce':n,'Xx-Signature':md5(AID+ts+VER+SEC+n+AID),'Xx-Timestamp':String(ts),'Xx-Version':VER,'XX-LANGUAGE':'US','XX-Token':t};}
function api(t,m,p,b){return new Promise(res=>{const u=new URL(API+p);const h=hdr(t);let bd=null;if(b){bd=JSON.stringify(b);h['Content-Type']='application/json';h['Content-Length']=Buffer.byteLength(bd);}const rq=https.request({hostname:u.hostname,path:u.pathname+u.search,method:m,headers:h},rp=>{let d='';rp.on('data',c=>d+=c);rp.on('end',()=>{try{res(JSON.parse(d));}catch{res({});}});});rq.on('error',()=>res({}));if(bd)rq.write(bd);rq.end();});}

const TARGET_ID = process.argv[2] || '99775';     // Kobra 3
const TARGET_MT = process.argv[3] || '20024';
const tk=await token(); if(tk.err){console.error(tk.err);process.exit(1);}
const list=(await api(tk.token,'GET','/work/printer/getPrinters?page=1',null)).data||[];
const tgt=list.find(p=>String(p.id)===String(TARGET_ID));
if(!tgt){console.error('printer',TARGET_ID,'not found; have:',list.map(p=>p.id+' '+p.name));process.exit(1);}
console.log(`${tgt.name} id=${tgt.id} machineType=${tgt.machine_type} key=${tgt.key}`);
const cid=md5(tk.email+'pcf')+'x'+Math.random().toString(16).slice(2,8);const pub=new crypto.X509Certificate(Buffer.from(certs.CA_DER_B64,'base64')).publicKey;const mt=crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(tk.token,'utf8')).toString('base64');
const c=mqtt.connect({host:'mqtt-universe.anycubic.com',port:8883,protocol:'mqtts',clientId:cid,username:`user|pcf|${tk.email}|${md5(cid+mt+cid)}`,password:mt,cert:certs.CLIENT_CERT_PEM,key:certs.CLIENT_KEY_PEM,rejectUnauthorized:false,ciphers:'DEFAULT:@SECLEVEL=0',minVersion:'TLSv1.2',maxVersion:'TLSv1.2',reconnectPeriod:0});
let done=false;const fin=()=>{if(done)return;done=1;c.end(true);process.exit(0);};setTimeout(()=>{console.log("\n(done listening)");fin();},42000);
c.on('connect',async()=>{
  c.subscribe(`anycubic/anycubicCloud/v1/+/public/${tgt.machine_type}/${tgt.key}/#`,{qos:0});
  console.log('subscribed; sending multiColorBox getInfo (1206) + extfilbox getInfo (1230)…\n');
  await api(tk.token,'POST','/work/operation/sendOrder',{order_id:1206,printer_id:Number(tgt.id),project_id:0,data:{multi_color_box:[]}});
  await new Promise(r=>setTimeout(r,800));
  await api(tk.token,'POST','/work/operation/sendOrder',{order_id:1230,printer_id:Number(tgt.id),project_id:0,data:{}});
});
c.on('message',(t,pl)=>{const leaf=t.split('/').slice(-2).join('/');let o;try{o=JSON.parse(pl);}catch{return;}
  // Show any report that carries filament/spool/box/extfil data.
  if(/multiColorBox\/report|extfilbox\/report|shelf|spool/i.test(t)||o.type==='extfilbox'||o.type==='multiColorBox'){
    console.log(`>>> ${leaf}  type=${o.type} action=${o.action} state=${o.state}`);
    console.log('    data=', JSON.stringify(o.data));
  }
});
c.on('error',e=>{console.error('mqtt',e.message);fin();});
