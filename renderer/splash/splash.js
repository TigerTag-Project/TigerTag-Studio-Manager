/* The launch splash (splash.html, main.js createSplash). Main passes, in the query:
     v    the app version
     msg  a JSON array of loading lines in the user's language (locale key splashLoading)
   and drives it with executeJavaScript:
     splashStep(done, total)  the real startup steps done so far → the bar
     splashOut()              the fade before it closes */
import { fillHeroScenes } from "../hero-scene.js";

fillHeroScenes(document, "../../assets/img/mockups/");
const q = new URLSearchParams(location.search);
document.getElementById("ver").textContent = q.get("v") ? `v${q.get("v")}` : "";
let lines = [];
try { lines = JSON.parse(q.get("msg") || "[]"); } catch (_) {}
if (!Array.isArray(lines)) lines = [String(lines)];
document.getElementById("msg").textContent = lines.length ? lines[Math.floor(Math.random() * lines.length)] : "";
const bar = document.getElementById("bar");
window.splashStep = (done, total) => { bar.style.transform = `scaleX(${Math.max(.06, Math.min(1, done / total))})`; };
window.splashOut = () => document.querySelector(".card").classList.add("is-out");
