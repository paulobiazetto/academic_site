/* ===================================================================
   Paulo Biazetto — Academic Website (v2)
   script.js  (Vanilla JavaScript, ES6+)

   One script, loaded on every page. It:
   • Injects the shared header (nav + appearance controls) and footer,
     so navigation lives in a single place (edit PAGES below).
   • Manages appearance: light/dark mode and a selectable accent color,
     both persisted in localStorage.
   • Renders dynamic content for whichever page is loaded — each render
     function is a no-op if its container is absent.

   Where to edit content
   ---------------------
   • Navigation items ....... PAGES (below)
   • Accent presets ......... ACCENTS (below)
   • LinkedIn profile/feed ... LINKEDIN (below)
   • Publications ........... data/publications.json
   • Projects ............... data/projects.json
   • News ................... data/news.json
   • LinkedIn highlights .... data/linkedin.json   (manual fallback)

   Running locally: serve over HTTP (browsers block fetch over file://):
        python3 -m http.server
   then open http://localhost:8000
   =================================================================== */

"use strict";

/* -------------------------------------------------------------------
   CONFIG
   ------------------------------------------------------------------- */

// Navigation (order shown in the header). "page" must match the
// data-page attribute on each page's <body> for active highlighting.
//
// MODULARITY: set enabled:false to remove an item from the menu without
// touching any other file. The corresponding HTML page keeps existing on
// disk, but visiting it directly will bounce to Home (see guardPage() —
// each page calls it on load) — so a disabled section never sits there
// half-broken or gets indexed while "off". Re-enable any time by flipping
// it back to true. Reorder items by reordering this array.
const PAGES = [
  { page: "home", label: "Home", href: "index.html", enabled: true },
  { page: "cv", label: "CV", href: "cv.html", enabled: true },
  { page: "projects", label: "Projects", href: "projects.html", enabled: true },
  { page: "publications", label: "Publications", href: "publications.html", enabled: true },
  { page: "orientations", label: "Orientations", href: "orientations.html", enabled: true },
  { page: "news", label: "News", href: "news.html", enabled: true },
  { page: "contact", label: "Contact", href: "contact.html", enabled: true },
];

// Home page sections (About is always shown — it's the core bio).
// Same idea as PAGES: flip enabled:false to hide a block on Home without
// editing index.html. Keys must match the data-section attribute on the
// corresponding <section> in index.html.
const HOME_SECTIONS = {
  position: true,
  interests: true,
  contact: true,
  linkedin: true,
};

// Accent presets. All are mid-to-dark tones that keep white text legible.
const ACCENTS = [
  { name: "Teal", value: "#0b5563" },
  { name: "Indigo", value: "#3d3f8f" },
  { name: "Wine", value: "#8c2f39" },
  { name: "Forest", value: "#246b45" },
  { name: "Steel", value: "#34618a" },
  { name: "Violet", value: "#6b3fa0" },
];
const DEFAULT_ACCENT = ACCENTS[0].value;

// LinkedIn integration.
//
//   IMPORTANT — what is and isn't possible on a static site:
//   LinkedIn does NOT let a web page read a profile's posts/activity from
//   the browser. The recent-activity page requires you to be logged in,
//   LinkedIn blocks cross-origin requests (CORS), and scraping is blocked
//   and against their terms. There is no public RSS feed for profiles.
//   So the posts below are either (a) curated by you in data/linkedin.json,
//   or (b) pulled from an OPTIONAL third-party feed you set in feedUrl.
//
//   profileUrl  : your public profile URL.
//   profileCard : data shown in the native, always-rendered profile card.
//   feedUrl     : OPTIONAL RSS/JSON feed that mirrors your posts (see chat).
//   fallbackData: curated highlights used when feedUrl is empty.
const LINKEDIN = {
  profileUrl: "https://www.linkedin.com/in/gustavo-artur-de-andrade-89a80355/",
  profileCard: {
    name: "Gustavo Artur de Andrade",
    headline: "Professor · Control",
    location: "Florianópolis, Brazil",
    avatar: "assets/profile/profile_2.jpeg",
  },
  feedUrl: "",
  fallbackData: "data/linkedin.json",
};

// Contact channels (rendered into both the Home contact block and the
// Contact page, and as the small social icons in the Home sidebar).
const CONTACTS = [
  { label: "Email", value: "gustavo.artur@ufsc.br", href: "mailto:gustavo.artur@ufsc.br", icon: "email" },
  { label: "LinkedIn", value: "linkedin.com/in/gustavo-artur-de-andrade", href: "https://www.linkedin.com/in/gustavo-artur-de-andrade-89a80355/", icon: "linkedin" },
  { label: "Lattes", value: "lattes.cnpq.br", href: "http://lattes.cnpq.br/9824493377082772", icon: "lattes" },
  { label: "GitHub", value: "github.com/", href: "https://github.com/example", icon: "github" },
  { label: "Google Scholar", value: "scholar.google.com", href: "https://scholar.google.com.br/citations?user=RXSFJBUAAAAJ&hl=pt-BR&oi=ao", icon: "scholar" },
  { label: "ORCID", value: "0000-0001-9560-8833", href: "https://orcid.org/0000-0001-9560-8833", icon: "orcid" },
];

// JSON data sources.
const DATA = {
  publications: "data/publications.json",
  projects: "data/projects.json",
  news: "data/news.json",
  orientations: "data/orientations.json",
};

const PUB_TYPE_ORDER = ["Journal", "Conference", "Book Chapter", "Preprint", "Dissertation/Thesis"];

// Keys used for persisting appearance choices.
const STORAGE = { theme: "site-theme", accent: "site-accent" };


/* -------------------------------------------------------------------
   UTILITIES
   ------------------------------------------------------------------- */
const $ = (sel, scope = document) => scope.querySelector(sel);
const $$ = (sel, scope = document) => Array.from(scope.querySelectorAll(sel));

// Create an element with attributes/children in one call.
function createEl(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(child));
  }
  return node;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Escape text, then wrap query matches in <mark> (for search results).
function highlight(text, query) {
  const safe = escapeHtml(text);
  if (!query) return safe;
  const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return safe.replace(new RegExp(`(${pattern})`, "ig"), "<mark>$1</mark>");
}

function debounce(fn, delay = 120) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" });
}

async function fetchJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json();
}

function renderError(container, message) {
  if (!container) return;
  container.innerHTML = "";
  container.append(createEl("p", { class: "pub-empty", text: message }));
}

// Safe localStorage helpers (storage may be disabled/unavailable).
const store = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, val); } catch {} },
};


/* -------------------------------------------------------------------
   REVEAL-ON-SCROLL
   ------------------------------------------------------------------- */
const revealObserver =
  "IntersectionObserver" in window
    ? new IntersectionObserver(
        (entries, obs) => {
          for (const e of entries) {
            if (e.isIntersecting) { e.target.classList.add("is-visible"); obs.unobserve(e.target); }
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.05 }
      )
    : null;

function observeReveal(elements) {
  if (!revealObserver) { elements.forEach((n) => n && n.classList.add("is-visible")); return; }
  elements.forEach((n) => { if (!n) return; n.setAttribute("data-reveal", ""); revealObserver.observe(n); });
}


/* ===================================================================
   LAYOUT — inject shared header & footer
   =================================================================== */

// Inline SVG icon set used by the header (kept tiny and dependency-free).
const ICONS = {
  sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3a9 9 0 1 0 0 18c1.7 0 2-1.3 1.2-2.2-.8-.9-.3-2.3 1-2.3H17a4 4 0 0 0 4-4c0-4.5-4-7.5-9-7.5Z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
};

function buildHeader() {
  const host = $("#site-header");
  if (!host) return;

  const currentPage = document.body.dataset.page || "";

  // Brand
  const brand = createEl("a", { class: "nav__brand", href: "index.html", "aria-label": "Home" }, [
    createEl("span", { class: "nav__brand-mark", "aria-hidden": "true", text: "P" }),
    createEl("span", { class: "nav__brand-name", text: "Gustavo Artur de Andrade" }),
  ]);

  // Primary links — only pages explicitly enabled in PAGES appear here.
  const menu = createEl("ul", { class: "nav__menu", id: "nav-menu" });
  PAGES.filter((p) => p.enabled).forEach((p) => {
    menu.append(
      createEl("li", {}, [
        createEl("a", {
          class: "nav__link" + (p.page === currentPage ? " is-active" : ""),
          href: p.href,
          "aria-current": p.page === currentPage ? "page" : false,
          text: p.label,
        }),
      ])
    );
  });

  // Appearance controls: theme toggle + palette popover
  const themeBtn = createEl("button", {
    class: "icon-btn",
    id: "theme-toggle",
    type: "button",
    "aria-label": "Toggle dark mode",
    html: ICONS.sun + ICONS.moon,
  });

  const paletteBtn = createEl("button", {
    class: "icon-btn",
    id: "palette-toggle",
    type: "button",
    "aria-label": "Change accent color",
    "aria-expanded": "false",
    html: ICONS.palette,
  });

  const swatches = createEl("div", { class: "swatches", id: "accent-swatches" });
  const customInput = createEl("input", { type: "color", id: "accent-custom", "aria-label": "Custom accent color" });
  const popover = createEl("div", { class: "palette-pop", id: "palette-pop", role: "dialog", "aria-label": "Appearance" }, [
    createEl("p", { class: "palette-pop__label", text: "Accent color" }),
    swatches,
    createEl("div", { class: "palette-custom" }, [
      createEl("label", { for: "accent-custom", text: "Custom" }),
      customInput,
    ]),
  ]);

  const appearance = createEl("div", { class: "appearance" }, [themeBtn, paletteBtn, popover]);

  // Hamburger (mobile)
  const toggle = createEl("button", {
    class: "nav__toggle",
    id: "nav-toggle",
    type: "button",
    "aria-label": "Open menu",
    "aria-expanded": "false",
    "aria-controls": "nav-menu",
    html: '<span class="nav__toggle-bar"></span><span class="nav__toggle-bar"></span><span class="nav__toggle-bar"></span>',
  });

  const nav = createEl("nav", { class: "nav", "aria-label": "Primary" }, [brand, menu, appearance, toggle]);
  host.append(nav);
}

function buildFooter() {
  const host = $("#site-footer");
  if (!host) return;
  const inner = createEl("div", { class: "container site-footer__inner" }, [
    createEl("p", { class: "site-footer__copy",
      text: `© ${new Date().getFullYear()} Gustavo Artur de Andrade · Department of Automation and Systems Engineering, Federal University of Santa Catarina` }),
    createEl("p", { class: "site-footer__note", html:
      'Built with HTML, CSS, and vanilla JavaScript. <a class="site-footer__top" href="#top">Back to top ↑</a>' }),
  ]);
  host.append(inner);
}


/* ===================================================================
   APPEARANCE — dark mode + accent color
   =================================================================== */
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}
function currentAccent() {
  return (store.get(STORAGE.accent) || DEFAULT_ACCENT).trim().toLowerCase();
}

function applyTheme(theme) {
  if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  store.set(STORAGE.theme, theme);
  const btn = $("#theme-toggle");
  if (btn) btn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
}

function applyAccent(value) {
  document.documentElement.style.setProperty("--color-primary", value);
  store.set(STORAGE.accent, value);
  // Reflect the active swatch + custom input.
  $$(".swatch").forEach((s) => {
    const active = s.dataset.value === value.toLowerCase();
    s.classList.toggle("is-active", active);
    s.setAttribute("aria-pressed", active ? "true" : "false");
  });
  const custom = $("#accent-custom");
  if (custom) custom.value = /^#[0-9a-f]{6}$/i.test(value) ? value : custom.value;
}

function initAppearance() {
  // Theme toggle
  const themeBtn = $("#theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => applyTheme(currentTheme() === "dark" ? "light" : "dark"));
    themeBtn.setAttribute("aria-pressed", currentTheme() === "dark" ? "true" : "false");
  }

  // Follow the OS setting only while the user hasn't chosen explicitly.
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      if (!store.get(STORAGE.theme)) applyTheme(e.matches ? "dark" : "light");
    });
  }

  // Build accent swatches
  const swatchHost = $("#accent-swatches");
  const accent = currentAccent();
  if (swatchHost) {
    ACCENTS.forEach((a) => {
      swatchHost.append(
        createEl("button", {
          class: "swatch" + (a.value.toLowerCase() === accent ? " is-active" : ""),
          type: "button",
          title: a.name,
          "aria-label": `${a.name} accent`,
          "aria-pressed": a.value.toLowerCase() === accent ? "true" : "false",
          "data-value": a.value.toLowerCase(),
          style: `background-color:${a.value}`,
          onClick: () => applyAccent(a.value),
        })
      );
    });
  }

  // Custom color input
  const custom = $("#accent-custom");
  if (custom) {
    custom.value = /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_ACCENT;
    custom.addEventListener("input", (e) => applyAccent(e.target.value));
  }

  // Popover open/close
  const paletteBtn = $("#palette-toggle");
  const pop = $("#palette-pop");
  if (paletteBtn && pop) {
    const close = () => { pop.classList.remove("is-open"); paletteBtn.setAttribute("aria-expanded", "false"); };
    paletteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.classList.toggle("is-open");
      paletteBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => { if (!pop.contains(e.target)) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
  }
}


/* ===================================================================
   NAVIGATION behavior (mobile menu + header state)
   =================================================================== */
function initNavigation() {
  const header = $("#site-header");
  const toggle = $("#nav-toggle");
  const menu = $("#nav-menu");

  if (toggle && menu) {
    const closeMenu = () => {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    };
    toggle.addEventListener("click", () => {
      const open = menu.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    $$(".nav__link", menu).forEach((l) => l.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  }

  // Header hairline/shadow on scroll (rAF-throttled).
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      if (header) header.classList.toggle("is-scrolled", window.scrollY > 8);
      ticking = false;
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}


/* ===================================================================
   RENDER: CONTACTS (shared by Home block, Contact page, and socials)
   =================================================================== */

// Brand/utility icons for contact channels.
const BRAND_ICONS = {
  email: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  linkedin: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6.94 5a1.94 1.94 0 1 1-3.88 0 1.94 1.94 0 0 1 3.88 0ZM3.3 8.4h3.28V21H3.3V8.4Zm5.2 0h3.14v1.72h.05c.44-.83 1.5-1.7 3.1-1.7 3.32 0 3.93 2.18 3.93 5.02V21h-3.28v-5.86c0-1.4-.03-3.2-1.95-3.2-1.95 0-2.25 1.52-2.25 3.1V21H8.5V8.4Z"/></svg>',
  github: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2A10 10 0 0 0 8.84 21.5c.5.09.68-.22.68-.48l-.01-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.36 1.09 2.94.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85l-.01 2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>',
  scholar: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2 1 8.5l11 6.5 9-5.32V16h2V8.5L12 2Z"/><path d="M5 13.4V17c0 1.66 3.13 3 7 3s7-1.34 7-3v-3.6l-7 4.14-7-4.14Z"/></svg>',
  orcid: '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM8.2 7.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2ZM7.3 10.6h1.8v6.9H7.3v-6.9Zm3.4 0h3.3c1.9 0 3.5 1.2 3.5 3.45 0 2.25-1.6 3.45-3.5 3.45h-3.3v-6.9Zm1.8 1.6v3.7h1.4c1.2 0 1.9-.74 1.9-1.85 0-1.1-.7-1.85-1.9-1.85h-1.4Z"/></svg>',
  lattes: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.5h9l3 3V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4.5 20V4A1.5 1.5 0 0 1 6 2.5Z"/><path d="M14.5 2.5V6h3.5"/><circle cx="9.5" cy="11" r="1.6"/><path d="M8 16.2c.4-1.4 1.6-2.2 2.9-2.1 1.1 0 2 .6 2.6 1.6M13.3 9.8h3.2M13.3 12.6h3.2"/></svg>',
};

// Fill any [data-contacts] container with the full contact cards.
function renderContacts() {
  $$("[data-contacts]").forEach((host) => {
    host.innerHTML = "";
    CONTACTS.forEach((c) => {
      host.append(
        createEl("li", {}, [
          createEl("a", {
            class: "contact-item", href: c.href,
            target: c.icon === "email" ? false : "_blank",
            rel: c.icon === "email" ? false : "noopener noreferrer",
          }, [
            createEl("span", { class: "contact-item__icon", "aria-hidden": "true", html: BRAND_ICONS[c.icon] || "" }),
            createEl("span", { class: "contact-item__body" }, [
              createEl("span", { class: "contact-item__label", text: c.label }),
              createEl("span", { class: "contact-item__value", text: c.value }),
            ]),
          ]),
        ])
      );
    });
  });
}

// Fill any [data-socials] container with compact icon links.
function renderSocials() {
  $$("[data-socials]").forEach((host) => {
    host.innerHTML = "";
    CONTACTS.forEach((c) => {
      host.append(
        createEl("a", {
          class: "social", href: c.href, "aria-label": c.label, title: c.label,
          target: c.icon === "email" ? false : "_blank",
          rel: c.icon === "email" ? false : "noopener noreferrer",
          html: BRAND_ICONS[c.icon] || "",
        })
      );
    });
  });
}


/* ===================================================================
   RENDER: PROJECTS
   =================================================================== */
function buildProjectCard(project, index) {
  const media = project.image
    ? createEl("div", { class: "project__media" }, [
        createEl("img", { src: project.image, alt: `${project.title} — project image`, loading: "lazy", width: "640", height: "260" }),
      ])
    : null;

  const head = createEl("div", { class: "project__head" }, [
    createEl("h3", { class: "project__title", text: project.title }),
    project.status ? createEl("span", { class: "project__status", "data-status": project.status, text: project.status }) : null,
  ]);

  const metaRows = [];
  if (project.funding) {
    metaRows.push(createEl("div", { class: "project__meta-row" }, [
      createEl("span", { class: "project__meta-key", text: "Funding" }),
      createEl("span", { text: project.funding }),
    ]));
  }
  if (Array.isArray(project.collaborators) && project.collaborators.length) {
    metaRows.push(createEl("div", { class: "project__meta-row" }, [
      createEl("span", { class: "project__meta-key", text: "With" }),
      createEl("span", { text: project.collaborators.join(", ") }),
    ]));
  }

  const linkDefs = [
    { key: "github", label: "GitHub ↗" },
    { key: "paper", label: "Paper ↗" },
    { key: "website", label: "Website ↗" },
  ];
  const linkNodes = linkDefs.filter((d) => project[d.key]).map((d) =>
    createEl("a", { class: "project__link", href: project[d.key], target: "_blank", rel: "noopener noreferrer", text: d.label })
  );

  const detailsInner = createEl("div", { class: "project__details-inner" }, [
    metaRows.length ? createEl("div", { class: "project__meta" }, metaRows) : null,
    linkNodes.length ? createEl("div", { class: "project__links" }, linkNodes) : null,
  ]);
  const detailsId = `project-details-${index}`;
  const details = createEl("div", { class: "project__details", id: detailsId }, [detailsInner]);

  let toggle = null;
  if (metaRows.length || linkNodes.length) {
    toggle = createEl("button", {
      class: "project__toggle", type: "button",
      "aria-expanded": "false", "aria-controls": detailsId,
      html: 'Details <span class="project__toggle-icon" aria-hidden="true">▾</span>',
      onClick: (e) => {
        const btn = e.currentTarget;
        const open = btn.getAttribute("aria-expanded") === "true";
        btn.setAttribute("aria-expanded", String(!open));
        details.classList.toggle("is-open", !open);
        btn.childNodes[0].nodeValue = open ? "Details " : "Hide ";
      },
    });
  }

  const body = createEl("div", { class: "project__body" }, [
    head,
    project.description ? createEl("p", { class: "project__desc", text: project.description }) : null,
    toggle, details,
  ]);

  const card = createEl("article", { class: "project", tabindex: project.website ? "0" : null }, [media, body]);

  // Whole-card click-through to the project's website, when one is set.
  // Projects without a "website" stay non-interactive at the card level —
  // nothing happens on click, as requested. Clicks on the Details toggle
  // or on any link inside the card (GitHub, Paper, Website button) must
  // NOT also trigger this, so they're excluded explicitly.
  if (project.website) {
    card.classList.add("project--linked");
    card.setAttribute("role", "link");
    card.setAttribute("aria-label", `${project.title} — open project website`);
    const go = () => window.open(project.website, "_blank", "noopener,noreferrer");
    card.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return; // let inner controls behave normally
      go();
    });
    card.addEventListener("keydown", (e) => {
      if ((e.key === "Enter" || e.key === " ") && !e.target.closest("a, button")) {
        e.preventDefault();
        go();
      }
    });
  }

  return card;
}

async function renderProjects() {
  const container = $("#projects-grid");
  if (!container) return;
  try {
    const projects = await fetchJSON(DATA.projects);
    const frag = document.createDocumentFragment();
    projects.forEach((p, i) => frag.append(buildProjectCard(p, i)));
    container.append(frag);
    observeReveal($$(".project", container));
  } catch (err) {
    console.error(err);
    renderError(container, "Projects could not be loaded. If you opened the file directly, serve the folder over HTTP (for example: python3 -m http.server).");
  }
}


/* ===================================================================
   RENDER: NEWS (timeline)
   =================================================================== */
async function renderNews() {
  const container = $("#news-timeline");
  if (!container) return;
  try {
    const news = await fetchJSON(DATA.news);
    news.sort((a, b) => new Date(b.date) - new Date(a.date));
    const frag = document.createDocumentFragment();
    news.forEach((item) => {
      const kids = [
        createEl("p", { class: "timeline__date", text: formatDate(item.date) }),
        createEl("h3", { class: "timeline__title", text: item.title }),
        item.description ? createEl("p", { class: "timeline__desc", text: item.description }) : null,
      ];
      if (item.link) kids.push(createEl("a", { class: "timeline__link", href: item.link, target: "_blank", rel: "noopener noreferrer", text: "Read more →" }));
      frag.append(createEl("li", { class: "timeline__item" }, kids));
    });
    container.append(frag);
    observeReveal($$(".timeline__item", container));
  } catch (err) {
    console.error(err);
    renderError(container, "News could not be loaded. If you opened the file directly, serve the folder over HTTP (for example: python3 -m http.server).");
  }
}


/* ===================================================================
   RENDER: ORIENTATIONS (Master's & PhD advisees, grouped by level)
   =================================================================== */
function buildOrientationItem(entry) {
  const nameNode = entry.url
    ? createEl("a", { class: "orient-item__name", href: entry.url, target: "_blank", rel: "noopener noreferrer", text: entry.name })
    : createEl("span", { class: "orient-item__name orient-item__name--plain", text: entry.name });

  return createEl("li", { class: "orient-item" }, [
    createEl("div", { class: "orient-item__head" }, [
      nameNode,
      entry.status ? createEl("span", { class: "orient-item__status", "data-status": entry.status, text: entry.status }) : null,
    ]),
    entry.started ? createEl("p", { class: "orient-item__meta", text: `Since ${entry.started}` }) : null,
    entry.description ? createEl("p", { class: "orient-item__desc", text: entry.description }) : null,
  ]);
}

async function renderOrientations() {
  const phdList = $("#orientations-phd");
  const masterList = $("#orientations-master");
  if (!phdList && !masterList) return; // only on the Orientations page

  try {
    const entries = await fetchJSON(DATA.orientations);

    const phd = entries.filter((e) => e.level === "PhD");
    const master = entries.filter((e) => e.level === "Master");

    if (phdList) {
      phdList.innerHTML = "";
      const frag = document.createDocumentFragment();
      phd.forEach((e) => frag.append(buildOrientationItem(e)));
      phdList.append(frag);
      const empty = $("#orientations-phd-empty");
      if (empty) empty.hidden = phd.length !== 0;
    }
    if (masterList) {
      masterList.innerHTML = "";
      const frag = document.createDocumentFragment();
      master.forEach((e) => frag.append(buildOrientationItem(e)));
      masterList.append(frag);
      const empty = $("#orientations-master-empty");
      if (empty) empty.hidden = master.length !== 0;
    }
    observeReveal($$(".orient-item", document));
  } catch (err) {
    console.error(err);
    if (phdList) renderError(phdList, "Orientations could not be loaded. If you opened the file directly, serve the folder over HTTP (for example: python3 -m http.server).");
  }
}


/* ===================================================================
   RENDER: PUBLICATIONS (list + search + filter + counter)
   =================================================================== */
const pubState = { all: [], query: "", type: "All" };

function toggleReveal(button, reveal) {
  const open = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!open));
  reveal.classList.toggle("is-open", !open);
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = original), 1400);
  } catch { button.textContent = "Copy failed"; }
}

function buildPublicationItem(pub, query) {
  const actions = [];

  if (pub.doi) {
    const href = pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`;
    actions.push(createEl("a", { class: "pub-action", href, target: "_blank", rel: "noopener noreferrer", text: "DOI" }));
  }

  // "pdf" is dual-purpose, by design — see the note in data/publications.json:
  //   • a relative path (assets/pdf/....pdf)  → local file, button reads "PDF"
  //   • a full URL (https://...)              → external page (publisher,
  //                                              preprint server, etc.), button
  //                                              reads "Article ↗" instead.
  //   • left empty                            → no PDF/article button at all,
  //                                              unless "doi" above already
  //                                              covers it.
  // This avoids a second near-duplicate field: most entries that lack a PDF
  // already have a DOI pointing at the journal page.
  if (pub.pdf) {
    const isExternal = /^https?:\/\//i.test(pub.pdf);
    actions.push(createEl("a", {
      class: "pub-action",
      href: pub.pdf,
      target: "_blank",
      rel: "noopener noreferrer",
      text: isExternal ? "Article ↗" : "PDF",
    }));
  }

  let abstractReveal = null;
  if (pub.abstract) {
    abstractReveal = createEl("div", { class: "pub-reveal" }, [
      createEl("div", { class: "pub-reveal__inner" }, [createEl("p", { class: "pub-abstract", text: pub.abstract })]),
    ]);
    actions.push(createEl("button", { class: "pub-action", type: "button", "aria-expanded": "false", text: "Abstract",
      onClick: (e) => toggleReveal(e.currentTarget, abstractReveal) }));
  }

  let bibtexReveal = null;
  if (pub.bibtex) {
    const copyBtn = createEl("button", { class: "pub-action", type: "button", text: "Copy", onClick: () => copyText(pub.bibtex, copyBtn) });
    bibtexReveal = createEl("div", { class: "pub-reveal" }, [
      createEl("div", { class: "pub-reveal__inner" }, [createEl("pre", { class: "pub-bibtex", text: pub.bibtex }), copyBtn]),
    ]);
    actions.push(createEl("button", { class: "pub-action", type: "button", "aria-expanded": "false", text: "BibTeX",
      onClick: (e) => toggleReveal(e.currentTarget, bibtexReveal) }));
  }

  const gutter = createEl("div", { class: "pub-item__gutter" }, [
    createEl("div", { class: "pub-item__year", text: String(pub.year) }),
    createEl("div", { class: "pub-item__type", text: pub.type }),
  ]);

  const main = createEl("div", { class: "pub-item__main" }, [
    createEl("h3", { class: "pub-item__title", html: highlight(pub.title, query) }),
    createEl("p", { class: "pub-item__authors", html: highlight(pub.authors, query) }),
    createEl("p", { class: "pub-item__venue", html: `${highlight(pub.venue, query)}, ${highlight(String(pub.year), query)}` }),
    createEl("div", { class: "pub-item__actions" }, actions),
    abstractReveal, bibtexReveal,
  ]);

  return createEl("li", { class: "pub-item" }, [gutter, main]);
}

function updatePublications() {
  const list = $("#publication-list");
  const counter = $("#pub-counter");
  const empty = $("#pub-empty");
  if (!list) return;

  const { all, query, type } = pubState;
  const filtered = all.filter((pub) => {
    if (type !== "All" && pub.type !== type) return false;
    if (!query) return true;
    return `${pub.title} ${pub.authors} ${pub.venue} ${pub.year}`.toLowerCase().includes(query);
  });

  list.innerHTML = "";
  const frag = document.createDocumentFragment();
  filtered.forEach((pub) => frag.append(buildPublicationItem(pub, query)));
  list.append(frag);

  if (counter) counter.textContent = `Showing ${filtered.length} of ${all.length} publications`;
  if (empty) empty.hidden = filtered.length !== 0;
}

function buildPublicationFilters() {
  const container = $("#pub-filters");
  if (!container) return;
  const present = new Set(pubState.all.map((p) => p.type));
  const ordered = ["All", ...PUB_TYPE_ORDER.filter((t) => present.has(t))];
  container.innerHTML = "";
  ordered.forEach((type) => {
    container.append(createEl("button", {
      class: "pub-filter" + (type === pubState.type ? " is-active" : ""),
      type: "button",
      "aria-pressed": type === pubState.type ? "true" : "false",
      text: type,
      onClick: () => {
        pubState.type = type;
        $$(".pub-filter", container).forEach((btn) => {
          const active = btn.textContent === type;
          btn.classList.toggle("is-active", active);
          btn.setAttribute("aria-pressed", String(active));
        });
        updatePublications();
      },
    }));
  });
}

async function renderPublications() {
  const list = $("#publication-list");
  if (!list) return;
  try {
    const raw = await fetchJSON(DATA.publications);
    // Skip documentation-only entries (e.g. a leading "_README" note).
    const pubs = raw.filter((p) => p.title);
    pubs.sort((a, b) => Number(b.year) - Number(a.year));
    pubState.all = pubs;
    buildPublicationFilters();
    updatePublications();
    const search = $("#pub-search-input");
    if (search) {
      search.addEventListener("input", debounce((e) => {
        pubState.query = e.target.value.trim().toLowerCase();
        updatePublications();
      }, 120));
    }
  } catch (err) {
    console.error(err);
    renderError(list, "Publications could not be loaded. If you opened the file directly, serve the folder over HTTP (for example: python3 -m http.server).");
  }
}


/* ===================================================================
   RENDER: LINKEDIN (native profile card + posts list)
   -------------------------------------------------------------------
   Why there is no automatic post feed:
   A browser cannot read a LinkedIn profile's activity. The recent-activity
   page is behind a login wall, LinkedIn blocks cross-origin requests, and
   scraping is blocked and against their terms — there is no public RSS for
   profiles either. So posts come from data/linkedin.json (curated, with an
   optional official embed per post — see toEmbedSrc below) or from an
   OPTIONAL third-party feed set in LINKEDIN.feedUrl.

   The profile box is a NATIVE card, styled to match the rest of the site,
   so it always renders and stays aligned with the block.
   =================================================================== */

// Build the profile block as a feed item (.li-post.li-post--profile) so it
// shares the same frame and the same auto-fill grid as the posts. It is
// prepended to the feed in renderLinkedInPosts().
function buildLinkedInProfilePost() {
  const p = LINKEDIN.profileCard;

  const meta = createEl("div", { class: "li-post__meta" }, [
    createEl("span", { class: "li-post__type", text: "Perfil" }),
  ]);

  const top = createEl("div", { class: "li-post__profile-top" }, [
    createEl("img", { class: "li-post__avatar", src: p.avatar, alt: `${p.name} profile photo`, width: "56", height: "56" }),
    createEl("span", { class: "li-post__brand", "aria-hidden": "true", html: BRAND_ICONS.linkedin }),
  ]);

  const kids = [
    meta,
    top,
    createEl("p", { class: "li-post__name", text: p.name }),
    p.headline ? createEl("p", { class: "li-post__headline", text: p.headline }) : null,
    p.location ? createEl("p", { class: "li-post__location", text: p.location }) : null,
    createEl("a", {
      class: "button button--primary button--sm li-post__cta",
      href: LINKEDIN.profileUrl, target: "_blank", rel: "noopener noreferrer",
      text: "View profile on LinkedIn",
    }),
  ];
  return createEl("article", { class: "li-post li-post--profile" }, kids);
}

// Normalize an external feed (JSON array, JSON Feed, or RSS/Atom XML).
function parseFeed(text) {
  const trimmed = text.trim();
  // JSON?
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const items = Array.isArray(data) ? data : data.items || [];
    return items.map((it) => ({
      date: it.date || it.date_published || it.pubDate || "",
      text: it.text || it.title || it.content_text || it.summary || "",
      link: it.link || it.url || LINKEDIN.profileUrl,
      type: it.type || "Post",
      embed: it.embed || "",
      height: it.height || 0,
    }));
  }
  // Otherwise treat as RSS/Atom XML.
  const doc = new DOMParser().parseFromString(text, "application/xml");
  const nodes = $$("item", doc).length ? $$("item", doc) : $$("entry", doc);
  return nodes.map((n) => {
    const get = (t) => n.querySelector(t)?.textContent?.trim() || "";
    const linkEl = n.querySelector("link");
    return {
      date: get("pubDate") || get("updated") || get("published"),
      text: get("title") || get("description") || get("summary"),
      link: (linkEl && (linkEl.getAttribute("href") || linkEl.textContent)) || LINKEDIN.profileUrl,
      type: "Post",
    };
  });
}

// Turn whatever the user pastes into a valid LinkedIn embed iframe src.
// Accepts: a full <iframe> snippet, an embed URL, a urn (activity/share/
// ugcPost), or a normal "Copy link to post" URL (…-activity-NNNNNN-xxxx).
// Returns null if nothing usable is found (then we fall back to text).
function toEmbedSrc(input) {
  if (!input || typeof input !== "string") return null;
  let s = input.trim();

  // If a full <iframe ... src="..."> was pasted, take the src.
  const iframeSrc = s.match(/src=["']([^"']+)["']/i);
  if (iframeSrc) s = iframeSrc[1];

  // Already an embed URL.
  if (/linkedin\.com\/embed\/feed\/update\//i.test(s)) return s.split(/[?#]/)[0];

  // Explicit URN.
  const urn = s.match(/urn:li:(?:activity|share|ugcPost):\d+/i);
  if (urn) return `https://www.linkedin.com/embed/feed/update/${urn[0]}`;

  // "Copy link to post" URL: the activity id follows "activity-" or "activity:".
  const act = s.match(/activity[-:](\d{6,})/i);
  if (act) return `https://www.linkedin.com/embed/feed/update/urn:li:activity:${act[1]}`;

  return null;
}

// Build one post: an official LinkedIn embed if a link is given, else text.
function buildLinkedInPost(post) {
  const src = toEmbedSrc(post.embed);

  if (src) {
    // Live, official embed (real content + reactions, updates automatically).
    const frame = createEl("div", { class: "li-embed__frame" }, [
      createEl("iframe", {
        class: "li-embed",
        src,
        title: "Embedded LinkedIn post",
        loading: "lazy",
        frameborder: "0",
        allowfullscreen: "",
        style: post.height ? `height:${post.height}px` : null,
      }),
    ]);
    return createEl("article", { class: "li-post li-post--embed" }, [frame]);
  }

  // Manual text card (fallback / curated highlight).
  const meta = createEl("div", { class: "li-post__meta" }, [
    post.type ? createEl("span", { class: "li-post__type", text: post.type }) : null,
    post.date ? createEl("span", { text: formatDate(post.date) }) : null,
  ]);
  const kids = [meta, createEl("p", { class: "li-post__text", text: post.text })];
  if (post.link) kids.push(createEl("a", { class: "li-post__link", href: post.link, target: "_blank", rel: "noopener noreferrer", text: "View on LinkedIn →" }));
  return createEl("article", { class: "li-post" }, kids);
}

function renderLinkedInPosts(items) {
  const host = $("#linkedin-feed");
  if (!host) return;
  host.innerHTML = "";

  const frag = document.createDocumentFragment();
  // Profile is the first .li-post in the feed so the auto-fill grid
  // distributes it together with the other posts.
  frag.append(buildLinkedInProfilePost());
  items.slice(0, 5).forEach((post) => frag.append(buildLinkedInPost(post)));
  host.append(frag);

  // "View all" CTA + transparency note about the data source.
  host.append(
    createEl("div", { class: "linkedin__cta" }, [
      createEl("a", { class: "button button--ghost button--sm", href: LINKEDIN.profileUrl, target: "_blank", rel: "noopener noreferrer", text: "See all activity on LinkedIn" }),
    ])
  );
  // if (!LINKEDIN.feedUrl) {
  //   host.append(createEl("p", { class: "linkedin__note",
  //     text: 'Add a post link to the "embed" field in data/linkedin.json to show the live post here; entries without a link show as text highlights.' }));
  // }
  observeReveal($$(".li-post", host));
}

async function renderLinkedIn() {
  const feedHost = $("#linkedin-feed");
  if (!feedHost) return; // only on the Home page

  try {
    if (LINKEDIN.feedUrl) {
      // Automatic mode: fetch the configured feed (RSS or JSON).
      const res = await fetch(LINKEDIN.feedUrl, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      renderLinkedInPosts(parseFeed(text));
    } else {
      // Manual mode: read curated highlights.
      const rawItems = await fetchJSON(LINKEDIN.fallbackData);
      const items = rawItems.filter((it) => it.text || it.embed);
      items.sort((a, b) => new Date(b.date) - new Date(a.date));
      renderLinkedInPosts(items);
    }
  } catch (err) {
    console.error(err);
    // Graceful fallback: at least offer the profile link.
    feedHost.innerHTML = "";
    feedHost.append(
      createEl("p", { class: "linkedin__note", text: "Latest LinkedIn posts are unavailable right now." }),
      createEl("a", { class: "button button--ghost button--sm", href: LINKEDIN.profileUrl, target: "_blank", rel: "noopener noreferrer", text: "Open LinkedIn profile" })
    );
  }
}


/* ===================================================================
   STATIC REVEALS
   =================================================================== */
function initStaticReveals() {
  const targets = [
    ...$$(".page-header"),
    ...$$(".home-aside"),
    ...$$(".home-block"),
    ...$$(".cv-section"),
    ...$$(".section__intro"),
    ...$$(".contact-item"),
    ...$$(".linkedin"),
  ];
  observeReveal(targets);
}


// Hide any Home section toggled off in HOME_SECTIONS. Runs only on Home
// (sections with [data-section] simply don't exist on other pages).
function applyHomeSections() {
  for (const [key, enabled] of Object.entries(HOME_SECTIONS)) {
    if (enabled) continue;
    document.querySelectorAll(`[data-section="${key}"]`).forEach((el) => el.remove());
  }
}

// If the current page was disabled in PAGES (enabled:false) or isn't
// listed there at all, bounce to Home. This is what makes a disabled
// page truly "off" rather than just hidden from the menu: it can't be
// browsed to directly and won't sit there half-configured.
// Returns true if the page is fine to render, false if it just redirected.
function guardPage() {
  const current = document.body.dataset.page || "";
  if (current === "home") return true; // Home is never disableable from here
  const entry = PAGES.find((p) => p.page === current);
  if (entry && entry.enabled) return true;
  window.location.replace("index.html");
  return false;
}

/* ===================================================================
   BOOTSTRAP
   =================================================================== */
function init() {
  // A disabled page redirects immediately; stop here so nothing else runs.
  if (!guardPage()) return;

  // Remove any Home sections toggled off (no-op on other pages).
  applyHomeSections();

  // Enable reveal animations only when JS runs and motion is allowed.
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) document.documentElement.classList.add("js-anim");

  // Shared chrome first.
  buildHeader();
  buildFooter();
  initAppearance();
  initNavigation();

  // Page-specific content (each is a no-op if its container is absent).
  renderContacts();
  renderSocials();
  renderProjects();
  renderPublications();
  renderOrientations();
  renderNews();
  renderLinkedIn();

  initStaticReveals();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
