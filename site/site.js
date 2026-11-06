/* The theme button and the remembered language. Everything else on the site is
   static HTML: each language is its own page, built by site/build.py. */
(function () {
  const root = document.documentElement;
  const media = window.matchMedia("(prefers-color-scheme: light)");

  function shown() {
    const chosen = root.dataset.theme;
    root.dataset.shown = chosen || (media.matches ? "light" : "dark");
  }
  shown();
  media.addEventListener("change", shown);

  const btn = document.getElementById("themebtn");
  if (btn) {
    btn.addEventListener("click", function () {
      const next = root.dataset.shown === "light" ? "dark" : "light";
      root.dataset.theme = next;
      try { localStorage.setItem("tigerstudio-theme", next); } catch (e) {}
      shown();
    });
  }

  /* The language menu closes on a click outside it, or on Escape. */
  const box = document.querySelector(".langbox");
  if (box) {
    document.addEventListener("click", function (e) { if (box.open && !box.contains(e.target)) box.open = false; });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") box.open = false; });
  }

  /* A language picked in the menu is kept for the next visit to the English
     root page, which then forwards to it. Search engines read every page as it
     is: the redirect only follows a choice the reader made. */
  document.querySelectorAll(".langlist a[data-lang]").forEach(function (a) {
    a.addEventListener("click", function () {
      try { localStorage.setItem("tigerstudio-lang", a.dataset.lang); } catch (e) {}
    });
  });
  if (root.dataset.lang === "en") {
    let saved = null;
    try { saved = localStorage.getItem("tigerstudio-lang"); } catch (e) {}
    const target = saved && saved !== "en" && document.querySelector('.langlist a[data-lang="' + saved + '"]');
    if (target) window.location.replace(target.href + window.location.hash);
  }
})();
