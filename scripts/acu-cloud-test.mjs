/**
 * scripts/acu-cloud-test.mjs — Anycubic cloud path validator (dev tool).
 *
 * Grabs the workbench session token from a RUNNING bridge-mode slicer over CDP
 * (port 9222), then exercises the cloud control path end-to-end: signed REST
 * getPrinters, then a cloud-MQTT round-trip (bundled client cert + token creds)
 * issuing getInfo and printing the layout report. Confirms CDP + auth + certs +
 * MQTT all work before the UI is wired.
 *
 * Prereq: launch the slicer in bridge mode (signed in, Workbench open):
 *   $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
 *   & "C:\Program Files\AnycubicSlicerNext\AnycubicSlicerNext.exe"
 *
 * Usage: node scripts/acu-cloud-test.mjs
 */
import https from 'https';
import crypto from 'crypto';
import mqtt from 'mqtt';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const certs = require('../services/anycubicCloudCerts.js');

const AID='f9b3528877c94d5c9c5af32245db46ef', SEC='0cf75926606049a3937f56b0373b99fb', VER='V3.0.0';
const API='https://cloud-universe.anycubic.com/p/p/workbench/api';
const md5 = s => crypto.createHash('md5').update(String(s),'utf8').digest('hex');

const FIND_STORE="function findStore(){try{var a=document.getElementById('app');if(a&&a.__vue__&&a.__vue__.$store)return a.__vue__.$store;}catch(e){}try{var all=document.querySelectorAll('*');for(var i=0;i<all.length;i++){var v=all[i].__vue__;if(v&&v.$store)return v.$store;}}catch(e){}return null;}";

function cdpEval(wsUrl, expr){return new Promise((resolve)=>{let done=false,ws;const fin=v=>{if(done)return;done=true;try{ws&&ws.close();}catch{}resolve(v);};try{ws=new WebSocket(wsUrl);}catch(e){return fin({error:e.message});}const t=setTimeout(()=>fin({error:'timeout'}),9000);ws.addEventListener('open',()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true,awaitPromise:true,userGesture:true}})));ws.addEventListener('message',ev=>{let m;try{m=JSON.parse(ev.data);}catch{return;}if(m.id!==1)return;clearTimeout(t);if(m.result&&m.result.exceptionDetails)return fin({error:'js-exception'});fin({value:m.result&&m.result.result?m.result.result.value:undefined});});ws.addEventListener('error',()=>{clearTimeout(t);fin({error:'ws-error'});});ws.addEventListener('close',()=>{clearTimeout(t);fin({error:'ws-closed'});});});}

async function cdpGrabToken(port=9222){
  let targets;
  try { targets = await (await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(5000)})).json(); }
  catch { throw new Error('CDP unreachable on '+port+' — launch the slicer in bridge mode first'); }
  const wb = (targets||[]).find(t=>/workbench|orca-ac-web/i.test((t.url||'')+' '+(t.title||''))&&t.webSocketDebuggerUrl);
  if (!wb) throw new Error('Workbench page not found — open the Workbench tab in the slicer');
  const js="(()=>{try{"+FIND_STORE+"var s=findStore();if(!s)return JSON.stringify({err:'no-store'});var g=s.getters;var u=g.GET_USER_INFO||{};return JSON.stringify({token:g.GET_TOKEN||'',email:(u.email||u.user_email||'')});}catch(e){return JSON.stringify({err:String(e)});}})()";
  const r = await cdpEval(wb.webSocketDebuggerUrl, js);
  if (r.error) throw new Error('CDP eval failed: '+r.error);
  const p = JSON.parse(r.value);
  if (p.err) throw new Error('workbench: '+p.err);
  if (!p.token) throw new Error('no token (sign in to the slicer first)');
  return { token: p.token, email: p.email||'' };
}

function headers(token){const nonce=crypto.randomUUID(),ts=Date.now();return{'Xx-Device-Type':'pcf','Xx-Is-Cn':'1','Xx-Nonce':nonce,'Xx-Signature':md5(AID+ts+VER+SEC+nonce+AID),'Xx-Timestamp':String(ts),'Xx-Version':VER,'XX-LANGUAGE':'US','XX-Token':token};}
function api(token,method,p,body){return new Promise((resolve)=>{const u=new URL(API+p);const h=headers(token);let b=null;if(body){b=JSON.stringify(body);h['Content-Type']='application/json';h['Content-Length']=Buffer.byteLength(b);}const rq=https.request({hostname:u.hostname,path:u.pathname+u.search,method,headers:h},rp=>{let d='';rp.on('data',c=>d+=c);rp.on('end',()=>{try{resolve(JSON.parse(d));}catch{resolve({code:0,raw:d});}});});rq.on('error',e=>resolve({code:0,error:e.message}));if(b)rq.write(b);rq.end();});}

console.log('grabbing token via CDP (slicer must be running in bridge mode)…');
const { token, email } = await cdpGrabToken();
console.log(`token grabbed: email=${email}  len=${token.length}`);

const printers = await api(token,'GET','/work/printer/getPrinters?page=1',null);
if (Number(printers.code)!==1){console.error('getPrinters failed:',printers.msg||printers.code);process.exit(1);}
const list = (printers.data||[]).map(p=>({id:String(p.id),name:p.name,machineType:Number(p.machine_type),key:p.key,status:p.device_status,reason:p.reason}));
console.log(`getPrinters → ${list.length} printer(s):`);
for (const p of list) console.log(`  ${p.name}  id=${p.id} machineType=${p.machineType} status=${p.status} ${p.reason?`(${p.reason})`:''}`);

const target = list.find(p=>p.status===1) || list[0];
if (!target){console.log('no printers to query');process.exit(0);}
console.log(`\nquerying layout for "${target.name}" over cloud MQTT…`);

const clientId = md5(email+'pcf');
const pub = new crypto.X509Certificate(Buffer.from(certs.CA_DER_B64,'base64')).publicKey;
const mqttToken = crypto.publicEncrypt({key:pub,padding:crypto.constants.RSA_PKCS1_PADDING},Buffer.from(token,'utf8')).toString('base64');
const username = `user|pcf|${email}|${md5(clientId+mqttToken+clientId)}`;
const client = mqtt.connect({host:'mqtt-universe.anycubic.com',port:8883,protocol:'mqtts',clientId,username,password:mqttToken,
  pfx:Buffer.from(certs.CLIENT_PFX_B64,'base64'),passphrase:'',ciphers:'DEFAULT:@SECLEVEL=0',rejectUnauthorized:false,minVersion:'TLSv1.2',maxVersion:'TLSv1.2',connectTimeout:12000,reconnectPeriod:0});

let done=false;
const finish=(c)=>{if(done)return;done=true;try{client.end(true);}catch{}process.exit(c);};
setTimeout(()=>{console.log('timeout — no layout report');finish(0);},12000);

client.on('connect',async()=>{
  console.log('cloud MQTT connected; subscribing + sending getInfo (order 1206)…');
  client.subscribe(`anycubic/anycubicCloud/v1/+/public/${target.machineType}/${target.key}/#`,{qos:0});
  await api(token,'POST','/work/operation/sendOrder',{order_id:1206,printer_id:Number(target.id),project_id:0,data:{multi_color_box:[]}});
});
client.on('message',(topic,payload)=>{
  const leaf=topic.split('/').slice(-2).join('/');
  let body=payload.toString();try{const o=JSON.parse(body);body=JSON.stringify(o);
    if(topic.endsWith('/multiColorBox/report')&&body.includes('multi_color_box')){console.log(`\nLAYOUT report on ${leaf}:`);console.log(JSON.stringify(o.data?.multi_color_box,null,1).slice(0,1200));finish(0);return;}
  }catch{}
  console.log(`  << ${leaf}: ${body.slice(0,120)}`);
});
client.on('error',e=>{console.error('cloud MQTT error:',e.message);finish(1);});
