/* hero-scene.js — the ecosystem scene (iMac, TigerPOD ⇄ TigerScale ⇄ TigerSpool, Tiger Touch,
   iPhone — each its own layer, styled by css/72-hero-scene.css) drawn into every
   [data-hero-scene] of a page: the welcome page, the sign-in dialog, the account setup
   (inventory.js) and the launch splash (splash/splash.js).
     fillHeroScenes(root = document, base = "../assets/img/mockups/")
   `base` is where the mockup pictures are, relative to the page. */
export function fillHeroScenes(root = document, base = "../assets/img/mockups/") {
  const M = base;
  const html = `
      <div class="sph-item sph-imac"><img src="${M}imac-studio.webp" alt="" /></div>
      <div class="sph-item sph-pod"><div class="sph-flip">
        <img class="sph-face sph-face--pod" src="${M}tigerpod-mini.webp" alt="" />
        <img class="sph-face sph-face--scale" src="${M}tigerscale.webp" alt="" />
        <img class="sph-face sph-face--spool" src="${M}tigerspool.webp" alt="" />
      </div></div>
      <div class="sph-item sph-touch"><img src="${M}tigertouch-tour.webp" alt="" /></div>
      <div class="sph-item sph-phone"><img src="${M}iphone-connect.webp" alt="" /></div>`;
  root.querySelectorAll("[data-hero-scene]").forEach(el => { el.innerHTML = html; });
}
