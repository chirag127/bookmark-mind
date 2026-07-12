#!/usr/bin/env node
/**
 * Build the BookmarkMind marketing site into ./public.
 *
 * Stdlib-only static generator. Assembles two hand-designed pages
 * (index.html + privacy-policy.html) around the shared "Synapse Honey"
 * knowledge-map design system, then copies the Chrome-Web-Store assets
 * (docs/cws-assets/*.png) into public/assets so the built site is fully
 * self-contained and deployable to Cloudflare Pages.
 *
 * Design system: warm parchment / deep-ink base, honey primary, moss +
 * teal "synapse" accents, geometric Space Grotesk display + Inter body +
 * JetBrains Mono data chips. Signature element = an animated SVG node
 * cluster (scattered bookmark dots wiring into organized clusters).
 */
import { readdirSync, mkdirSync, rmSync, copyFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = resolve(root, 'public')
const assetsSrc = resolve(root, 'docs/cws-assets')

// ---- providers (kept in sync with docs/PRIVACY.md provider catalog) -------
const providers = [
  ['Groq', 'free'], ['Cerebras', 'free'], ['Google Gemini', 'free'],
  ['OpenRouter', 'free'], ['Mistral', 'free'], ['HuggingFace', 'free'],
  ['DeepSeek', 'trial'], ['OpenAI', 'trial'], ['Novita', 'trial'],
  ['LM Studio', 'local'], ['Ollama', 'local'], ['LiteLLM', 'local'],
  ['OmniRoute', 'local'],
]

const features = [
  ['13 built-in providers', 'Bring your own key for any OpenAI-compatible LLM — Groq, Cerebras, Gemini, OpenRouter, Mistral, HuggingFace, DeepSeek, OpenAI, Novita, plus localhost runtimes.'],
  ['Add any custom endpoint', 'Point at a self-hosted vLLM box, a corporate proxy, or a niche vendor. Configure base URL + auth scheme and it just works.'],
  ['Fallback ordering', 'Drag providers into a preference chain. Hit a 429? BookmarkMind cools that provider for 5 minutes and tries the next one.'],
  ['Encrypted keys', 'API keys are AES-256-GCM encrypted before touching chrome.storage.sync — defense-in-depth against key-harvesting extensions.'],
  ['Functional folders', 'FMHY-style hierarchy by what a site DOES — "Tools › File › Cloud Storage" — not by who provides it. Generated from your actual bookmarks.'],
  ['Learns your moves', 'Records the folder corrections you make by hand and feeds them into future runs. It gets sharper the more you use it.'],
  ['Snapshot before reorg', 'A full backup is taken before anything moves, so a re-categorization is always reversible. Nothing is ever lost.'],
  ['Zero telemetry', 'No server, no analytics, no phone-home. The only network calls go to the provider endpoints you configured. Fully open source.'],
]

const steps = [
  ['Connect a brain', 'Open Options, pick from 13 built-in providers or add your own endpoint, paste a key, hit Test.'],
  ['Map the chaos', 'Click "Categorize All Bookmarks". BookmarkMind reads your tree and asks the LLM for a functional folder map.'],
  ['Watch it organize', 'Every bookmark slides into the right cluster. A snapshot means you can undo the whole run in one click.'],
]

// ---- shared design system -------------------------------------------------
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">`

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --ink:#221a13;--paper:#f9f3e9;--card:#fffaf1;--line:#e6d8c3;
  --honey:#c9761a;--honey-lit:#e08a1e;--moss:#4f7355;--synapse:#2f7c8f;
  --muted:#857567;--text:#2b2019;--head:#1c150e;
  --shadow:0 12px 40px -12px rgba(60,40,15,.28);
  --radius:18px;
}
[data-theme=dark]{
  --ink:#0d0b08;--paper:#171310;--card:#1f1a14;--line:#33291f;
  --honey:#e79433;--honey-lit:#f4a836;--moss:#7aa981;--synapse:#4fb0c4;
  --muted:#a1907d;--text:#ece2d2;--head:#fbf3e5;
  --shadow:0 18px 50px -16px rgba(0,0,0,.65);
}
html{scroll-behavior:smooth}
body{
  font-family:Inter,system-ui,sans-serif;background:var(--paper);color:var(--text);
  line-height:1.65;-webkit-font-smoothing:antialiased;
  background-image:radial-gradient(circle at 15% -10%,color-mix(in srgb,var(--honey) 14%,transparent),transparent 45%),radial-gradient(circle at 90% 5%,color-mix(in srgb,var(--synapse) 12%,transparent),transparent 40%);
  background-attachment:fixed;
}
h1,h2,h3,.brand{font-family:'Space Grotesk',sans-serif;color:var(--head);letter-spacing:-.02em;line-height:1.1}
a{color:var(--synapse);text-decoration:none}
.wrap{max-width:1140px;margin:0 auto;padding:0 24px}
.mono{font-family:'JetBrains Mono',monospace;font-size:.82em}

/* nav */
nav{position:sticky;top:0;z-index:50;backdrop-filter:blur(12px);
  background:color-mix(in srgb,var(--paper) 82%,transparent);border-bottom:1px solid var(--line)}
nav .wrap{display:flex;align-items:center;gap:20px;height:66px}
.brand{font-weight:700;font-size:1.22rem;display:flex;align-items:center;gap:10px}
.brand .glyph{width:26px;height:26px}
.navlinks{margin-left:auto;display:flex;gap:26px;align-items:center}
.navlinks a{color:var(--muted);font-weight:500;font-size:.94rem}
.navlinks a:hover{color:var(--head)}
.btn{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-family:'Space Grotesk',sans-serif;
  padding:11px 20px;border-radius:12px;border:1px solid transparent;cursor:pointer;font-size:.95rem;transition:transform .15s,box-shadow .15s}
.btn-primary{background:linear-gradient(135deg,var(--honey-lit),var(--honey));color:#fff;box-shadow:0 8px 22px -8px var(--honey)}
.btn-primary:hover{transform:translateY(-2px);box-shadow:0 12px 28px -8px var(--honey)}
.btn-ghost{background:var(--card);color:var(--head);border-color:var(--line)}
.btn-ghost:hover{border-color:var(--honey)}
.themebtn{background:var(--card);border:1px solid var(--line);color:var(--head);width:40px;height:40px;border-radius:11px;cursor:pointer;display:grid;place-items:center;font-size:1.1rem}

/* hero */
.hero{padding:76px 0 40px}
.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:50px;align-items:center}
.eyebrow{display:inline-flex;align-items:center;gap:9px;font-family:'JetBrains Mono',monospace;font-size:.76rem;letter-spacing:.08em;text-transform:uppercase;color:var(--moss);
  background:color-mix(in srgb,var(--moss) 12%,transparent);border:1px solid color-mix(in srgb,var(--moss) 30%,transparent);padding:6px 13px;border-radius:100px}
.hero h1{font-size:clamp(2.5rem,5.4vw,4rem);margin:20px 0 18px}
.hero h1 .hl{background:linear-gradient(120deg,var(--honey),var(--synapse));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.hero p.lead{font-size:1.16rem;color:var(--muted);max-width:34ch}
.hero .cta{display:flex;gap:14px;margin-top:30px;flex-wrap:wrap}
.hero .stats{display:flex;gap:30px;margin-top:34px;flex-wrap:wrap}
.stat b{font-family:'Space Grotesk',sans-serif;font-size:1.55rem;color:var(--head);display:block}
.stat span{font-size:.82rem;color:var(--muted)}

/* signature map card */
.mapcard{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);padding:14px;position:relative;overflow:hidden}
.mapcard svg{display:block;width:100%;height:auto}
.mapcard .caption{position:absolute;bottom:14px;left:16px;font-family:'JetBrains Mono',monospace;font-size:.7rem;color:var(--muted)}

/* section shell */
section{padding:64px 0}
.sec-head{max-width:60ch;margin-bottom:40px}
.sec-head .eyebrow{margin-bottom:14px}
.sec-head h2{font-size:clamp(1.8rem,3.4vw,2.6rem)}
.sec-head p{color:var(--muted);margin-top:12px;font-size:1.05rem}

/* steps as connected nodes */
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;position:relative}
.step{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:26px;position:relative}
.step .n{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;font-family:'Space Grotesk',sans-serif;font-weight:700;
  background:color-mix(in srgb,var(--honey) 16%,transparent);color:var(--honey);border:1px solid color-mix(in srgb,var(--honey) 35%,transparent);margin-bottom:16px}
.step h3{font-size:1.2rem;margin-bottom:8px}
.step p{color:var(--muted);font-size:.96rem}

/* feature nodes */
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:18px}
.node{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px;transition:transform .18s,border-color .18s,box-shadow .18s}
.node:hover{transform:translateY(-4px);border-color:var(--honey);box-shadow:var(--shadow)}
.node .dot{width:14px;height:14px;border-radius:50%;background:var(--synapse);box-shadow:0 0 0 5px color-mix(in srgb,var(--synapse) 18%,transparent);margin-bottom:16px}
.node:nth-child(3n) .dot{background:var(--moss);box-shadow:0 0 0 5px color-mix(in srgb,var(--moss) 18%,transparent)}
.node:nth-child(3n+1) .dot{background:var(--honey);box-shadow:0 0 0 5px color-mix(in srgb,var(--honey) 18%,transparent)}
.node h3{font-size:1.04rem;margin-bottom:7px}
.node p{color:var(--muted);font-size:.9rem;line-height:1.55}

/* provider constellation */
.constellation{display:flex;flex-wrap:wrap;gap:11px}
.chip{display:inline-flex;align-items:center;gap:8px;background:var(--card);border:1px solid var(--line);border-radius:100px;padding:9px 16px;font-family:'JetBrains Mono',monospace;font-size:.84rem;color:var(--text)}
.chip::before{content:"";width:8px;height:8px;border-radius:50%;background:var(--muted)}
.chip.free::before{background:var(--moss)}
.chip.trial::before{background:var(--honey)}
.chip.local::before{background:var(--synapse)}
.legend{display:flex;gap:20px;margin-top:20px;flex-wrap:wrap;font-size:.82rem;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:7px}
.legend i{width:9px;height:9px;border-radius:50%;display:inline-block}

/* gallery */
.gallery{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.gallery figure{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:var(--shadow)}
.gallery img{width:100%;display:block;aspect-ratio:16/10;object-fit:cover;background:var(--paper)}
.gallery figcaption{padding:11px 15px;font-size:.82rem;color:var(--muted);font-family:'JetBrains Mono',monospace}

/* privacy callout */
.callout{background:linear-gradient(135deg,color-mix(in srgb,var(--moss) 14%,var(--card)),var(--card));
  border:1px solid color-mix(in srgb,var(--moss) 30%,var(--line));border-radius:var(--radius);padding:40px;display:grid;grid-template-columns:1fr auto;gap:30px;align-items:center}
.callout h2{font-size:1.9rem;margin-bottom:10px}
.callout p{color:var(--muted);max-width:52ch}
.callout ul{list-style:none;display:flex;flex-direction:column;gap:10px}
.callout li{display:flex;gap:10px;align-items:center;font-size:.95rem;white-space:nowrap}
.callout li::before{content:"✓";color:var(--moss);font-weight:700}

/* final cta */
.finalcta{text-align:center;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:60px 30px;box-shadow:var(--shadow)}
.finalcta h2{font-size:clamp(2rem,4vw,3rem);margin-bottom:14px}
.finalcta p{color:var(--muted);max-width:46ch;margin:0 auto 28px}

/* footer */
footer{border-top:1px solid var(--line);padding:44px 0;margin-top:20px;color:var(--muted);font-size:.9rem}
footer .wrap{display:flex;justify-content:space-between;gap:20px;flex-wrap:wrap;align-items:center}
footer a{color:var(--muted)}footer a:hover{color:var(--head)}

/* article (privacy) */
.article{max-width:760px;margin:0 auto;padding:40px 0 20px}
.article h1{font-size:clamp(2rem,4vw,2.8rem);margin-bottom:8px}
.article .updated{color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:.82rem;margin-bottom:34px}
.article h2{font-size:1.5rem;margin:38px 0 12px;padding-top:12px;border-top:1px solid var(--line)}
.article h3{font-size:1.14rem;margin:22px 0 8px}
.article p,.article li{color:var(--text);margin-bottom:12px}
.article ul,.article ol{padding-left:22px;margin-bottom:14px}
.article li{margin-bottom:6px}
.article strong{color:var(--head)}
.article code{font-family:'JetBrains Mono',monospace;font-size:.85em;background:var(--card);border:1px solid var(--line);padding:2px 6px;border-radius:6px}
.article table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.86rem}
.article th,.article td{text-align:left;padding:9px 12px;border:1px solid var(--line)}
.article th{background:var(--card);font-family:'Space Grotesk',sans-serif}
.summary-box{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--honey);border-radius:12px;padding:22px 24px;margin-bottom:20px}
.summary-box ul{margin:0;list-style:none;padding:0}
.summary-box li{margin-bottom:10px;padding-left:22px;position:relative}
.summary-box li::before{content:"◆";position:absolute;left:0;color:var(--honey)}

@media (max-width:900px){
  .hero-grid{grid-template-columns:1fr;gap:36px}
  .steps{grid-template-columns:1fr}
  .grid{grid-template-columns:repeat(2,1fr)}
  .gallery{grid-template-columns:1fr 1fr}
  .callout{grid-template-columns:1fr}
  .navlinks a:not(.btn){display:none}
}
@media (max-width:560px){
  .grid,.gallery{grid-template-columns:1fr}
  .hero{padding:48px 0 20px}
  .brand span.txt{display:none}
}
:focus-visible{outline:3px solid var(--synapse);outline-offset:3px;border-radius:6px}
@media (prefers-reduced-motion:reduce){
  *{animation:none!important;transition:none!important;scroll-behavior:auto}
}
`

// mind-map signature (the ONE signature element): scattered bookmark dots
// on the left wiring into three organized clusters on the right.
const MAP_SVG = `<svg viewBox="0 0 560 400" role="img" aria-label="Scattered bookmarks reorganizing into three labeled clusters">
  <defs>
    <style>
      .edge{stroke:var(--synapse);stroke-width:1.4;opacity:.55;fill:none}
      .bk{fill:var(--muted)}
      .cluster{fill:var(--card);stroke:var(--line);stroke-width:1.5}
      @keyframes pulse{0%,100%{opacity:.35}50%{opacity:.9}}
      @keyframes drift{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
      .p1{animation:pulse 3.2s ease-in-out infinite}
      .p2{animation:pulse 3.2s ease-in-out .8s infinite}
      .p3{animation:pulse 3.2s ease-in-out 1.6s infinite}
      .float{animation:drift 5s ease-in-out infinite}
    </style>
  </defs>
  <!-- edges from scatter to clusters -->
  <path class="edge p1" d="M70 90 C160 90 200 96 250 96"/>
  <path class="edge p2" d="M52 150 C150 150 200 110 250 104"/>
  <path class="edge p3" d="M84 210 C170 210 210 200 260 196"/>
  <path class="edge p1" d="M60 268 C160 268 210 204 262 202"/>
  <path class="edge p2" d="M96 320 C190 320 220 300 268 296"/>
  <path class="edge p3" d="M64 356 C180 356 220 306 268 302"/>
  <!-- scattered bookmark dots (left) -->
  <g class="float">
    <circle class="bk" cx="70" cy="90" r="6"/><circle class="bk" cx="52" cy="150" r="6"/>
    <circle class="bk" cx="84" cy="210" r="6"/><circle class="bk" cx="60" cy="268" r="6"/>
    <circle class="bk" cx="96" cy="320" r="6"/><circle class="bk" cx="64" cy="356" r="6"/>
    <circle class="bk" cx="40" cy="120" r="4"/><circle class="bk" cx="110" cy="170" r="4"/>
    <circle class="bk" cx="42" cy="300" r="4"/>
  </g>
  <!-- organized clusters (right) -->
  <g>
    <circle class="cluster" cx="330" cy="96" r="34"/>
    <circle cx="330" cy="96" r="10" fill="var(--honey)"/>
    <circle cx="360" cy="80" r="6" fill="var(--honey-lit)"/><circle cx="300" cy="82" r="6" fill="var(--honey-lit)"/><circle cx="356" cy="116" r="6" fill="var(--honey-lit)"/>
    <text x="330" y="150" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="12" fill="var(--muted)">Dev</text>
  </g>
  <g>
    <circle class="cluster" cx="336" cy="200" r="30"/>
    <circle cx="336" cy="200" r="9" fill="var(--moss)"/>
    <circle cx="366" cy="188" r="6" fill="var(--moss)"/><circle cx="308" cy="190" r="6" fill="var(--moss)"/><circle cx="360" cy="220" r="6" fill="var(--moss)"/>
    <text x="336" y="250" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="12" fill="var(--muted)">Tools</text>
  </g>
  <g>
    <circle class="cluster" cx="340" cy="300" r="28"/>
    <circle cx="340" cy="300" r="9" fill="var(--synapse)"/>
    <circle cx="368" cy="290" r="6" fill="var(--synapse)"/><circle cx="314" cy="292" r="6" fill="var(--synapse)"/>
    <text x="340" y="346" text-anchor="middle" font-family="'JetBrains Mono',monospace" font-size="12" fill="var(--muted)">Media</text>
  </g>
  <!-- AI core node -->
  <g class="float">
    <circle cx="480" cy="200" r="42" fill="none" stroke="var(--honey)" stroke-width="2" stroke-dasharray="4 6" opacity=".7"/>
    <circle cx="480" cy="200" r="22" fill="var(--honey)"/>
    <text x="480" y="205" text-anchor="middle" font-family="'Space Grotesk',sans-serif" font-weight="700" font-size="15" fill="#fff">AI</text>
    <path class="edge" d="M364 96 C420 120 440 170 458 190"/>
    <path class="edge" d="M366 200 C410 200 430 200 458 200"/>
    <path class="edge" d="M368 300 C420 280 440 230 458 212"/>
  </g>
</svg>`

const LOGO = `<svg class="glyph" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="8" r="4" fill="var(--honey)"/><circle cx="7" cy="23" r="4" fill="var(--moss)"/><circle cx="25" cy="23" r="4" fill="var(--synapse)"/><path d="M16 12 L7 19 M16 12 L25 19 M11 23 L21 23" stroke="var(--muted)" stroke-width="1.6" fill="none"/></svg>`

const THEME_SCRIPT = `<script>
(function(){var k='bm-theme',s=localStorage.getItem(k);
if(s)document.documentElement.setAttribute('data-theme',s);
else if(matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.setAttribute('data-theme','dark');})();
function toggleTheme(){var d=document.documentElement,n=d.getAttribute('data-theme')==='dark'?'light':'dark';d.setAttribute('data-theme',n);localStorage.setItem('bm-theme',n);}
</script>`

const REPO = 'https://github.com/chirag127/bookmark-mind-bs-ext'

function shell({ title, desc, body }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${desc}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:type" content="website">
<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='8' r='4' fill='%23e08a1e'/%3E%3Ccircle cx='7' cy='23' r='4' fill='%234f7355'/%3E%3Ccircle cx='25' cy='23' r='4' fill='%232f7c8f'/%3E%3Cpath d='M16 12 L7 19 M16 12 L25 19' stroke='%23857567' stroke-width='1.6' fill='none'/%3E%3C/svg%3E">
${FONTS}
<style>${CSS}</style>
${THEME_SCRIPT}
</head>
<body>
<nav><div class="wrap">
  <a class="brand" href="/">${LOGO}<span class="txt">BookmarkMind</span></a>
  <div class="navlinks">
    <a href="/#features">Features</a>
    <a href="/#providers">Providers</a>
    <a href="/#privacy">Privacy</a>
    <a href="${REPO}">GitHub</a>
    <button class="themebtn" onclick="toggleTheme()" aria-label="Toggle dark mode">◑</button>
    <a class="btn btn-primary" href="${REPO}">Get it</a>
  </div>
</div></nav>
${body}
<footer><div class="wrap">
  <span>© ${new Date().getFullYear()} BookmarkMind — MIT licensed. Built by <a href="https://github.com/chirag127">chirag127</a>.</span>
  <span><a href="/">Home</a> · <a href="/privacy-policy.html">Privacy</a> · <a href="${REPO}">Source</a></span>
</div></footer>
</body>
</html>`
}

function indexPage() {
  const featureNodes = features.map(([h, p]) => `<article class="node"><div class="dot"></div><h3>${h}</h3><p>${p}</p></article>`).join('')
  const stepNodes = steps.map(([h, p], i) => `<div class="step"><div class="n">${i + 1}</div><h3>${h}</h3><p>${p}</p></div>`).join('')
  const chips = providers.map(([n, t]) => `<span class="chip ${t}">${n}</span>`).join('')
  const shots = [
    ['assets/screenshot-1-providers.png', 'Provider setup'],
    ['assets/screenshot-4-categorize.png', 'Live categorization'],
    ['assets/screenshot-5-before-after.png', 'Before / after'],
  ].map(([s, c]) => `<figure><img src="${s}" alt="${c}" width="1280" height="800"><figcaption>${c}</figcaption></figure>`).join('')

  const body = `
<header class="hero"><div class="wrap"><div class="hero-grid">
  <div>
    <span class="eyebrow">◆ Knowledge-map for your bookmarks</span>
    <h1>Turn bookmark chaos into a <span class="hl">mind-map</span>.</h1>
    <p class="lead">BookmarkMind uses any OpenAI-compatible LLM to sort your Chrome bookmarks into clean, functional folders — grouped by what sites <em>do</em>, not who made them.</p>
    <div class="cta">
      <a class="btn btn-primary" href="${REPO}">⬇ Install from source</a>
      <a class="btn btn-ghost" href="#how">See how it works</a>
    </div>
    <div class="stats">
      <div class="stat"><b>13</b><span>built-in providers</span></div>
      <div class="stat"><b>AES-256</b><span>encrypted keys</span></div>
      <div class="stat"><b>0</b><span>telemetry / servers</span></div>
    </div>
  </div>
  <div class="mapcard">${MAP_SVG}<div class="caption">scattered → clustered · powered by your LLM</div></div>
</div></div></header>

<section id="how"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">◆ Three steps</span><h2>From a thousand loose links to a tidy map.</h2>
  <p>No account, no upload to us. Your key, your model, your bookmarks — organized locally.</p></div>
  <div class="steps">${stepNodes}</div>
</div></section>

<section id="features"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">◆ Every node, deliberate</span><h2>What makes it click.</h2></div>
  <div class="grid">${featureNodes}</div>
</div></section>

<section><div class="wrap">
  <div class="sec-head"><span class="eyebrow">◆ Screens</span><h2>See it in motion.</h2></div>
  <div class="gallery">${shots}</div>
</div></section>

<section id="providers"><div class="wrap">
  <div class="sec-head"><span class="eyebrow">◆ Bring your own key</span><h2>A constellation of providers.</h2>
  <p>Pick a permanent free tier, spend trial credits, or run entirely on localhost. Or wire up any custom OpenAI-compatible endpoint.</p></div>
  <div class="constellation">${chips}</div>
  <div class="legend">
    <span><i style="background:var(--moss)"></i> Permanent free</span>
    <span><i style="background:var(--honey)"></i> Trial credits</span>
    <span><i style="background:var(--synapse)"></i> Localhost</span>
  </div>
</div></section>

<section id="privacy"><div class="wrap"><div class="callout">
  <div>
    <h2>Your bookmarks never touch our servers.</h2>
    <p>There are no BookmarkMind servers. The only outbound calls go to the LLM provider you chose — with your key, over your connection. Everything else stays on your device.</p>
    <a class="btn btn-ghost" href="/privacy-policy.html" style="margin-top:18px">Read the privacy policy</a>
  </div>
  <ul>
    <li>No analytics</li><li>No telemetry</li><li>No phone-home</li><li>Encrypted keys</li><li>Fully open source</li>
  </ul>
</div></div></section>

<section><div class="wrap"><div class="finalcta">
  <h2>Give your bookmarks a brain.</h2>
  <p>Free, open source, and MV3-ready for Chrome, Edge, Brave &amp; Opera.</p>
  <div class="cta" style="justify-content:center">
    <a class="btn btn-primary" href="${REPO}">⬇ Get BookmarkMind</a>
    <a class="btn btn-ghost" href="${REPO}/stargazers">★ Star on GitHub</a>
  </div>
</div></div></section>
`
  return shell({
    title: 'BookmarkMind — AI Bookmark Organizer',
    desc: 'Auto-organize your Chrome bookmarks into intelligent, functional folders using any OpenAI-compatible LLM. 13 providers built in. Bring your own key. Zero telemetry.',
    body,
  })
}

function privacyPage() {
  const rows = [
    ['Groq', 'Permanent free', 'api.groq.com', '30 RPM, 500K tokens/day. No card.'],
    ['Cerebras', 'Permanent free', 'api.cerebras.ai', '1M tokens/day. 8K context on free.'],
    ['Google Gemini', 'Permanent free', 'generativelanguage.googleapis.com', 'Prompts train models. Not in EU/UK/CH.'],
    ['OpenRouter', 'Permanent free', 'openrouter.ai', '20+ :free models. 20 RPM / 50 RPD.'],
    ['Mistral', 'Permanent free', 'api.mistral.ai', 'Experiment plan. Prompts train unless opted out.'],
    ['HuggingFace', 'Permanent free', 'router.huggingface.co', 'Free with HF account. Cold starts 30s+.'],
    ['Novita', 'Trial credits', 'api.novita.ai', '$0.50 signup credit. 120+ models.'],
    ['DeepSeek', 'Trial credits', 'api.deepseek.com', '5M tokens on signup, 30 days.'],
    ['OpenAI', 'Trial credits', 'api.openai.com', 'Card required past trial.'],
    ['LM Studio', 'Localhost', 'localhost:1234', 'Local models. No key needed.'],
    ['Ollama', 'Localhost', 'localhost:11434', 'Set OLLAMA_ORIGINS for the extension.'],
    ['LiteLLM', 'Localhost', 'localhost:4000', 'Route anywhere via self-hosted proxy.'],
    ['OmniRoute', 'Localhost', 'localhost:20128', '60+ free models via local dev server.'],
  ].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td><code>${r[2]}</code></td><td>${r[3]}</td></tr>`).join('')

  const body = `<div class="wrap"><article class="article">
  <h1>Privacy Policy</h1>
  <div class="updated">Last updated: 2026-07-04</div>

  <div class="summary-box"><ul>
    <li><strong>We collect nothing.</strong> No server, no analytics, no telemetry, no phone-home.</li>
    <li><strong>Your API keys are encrypted</strong> with AES-256-GCM before storage in Chrome sync.</li>
    <li><strong>Bookmark data leaves your device only</strong> when you start a categorization — and only to the provider you configured.</li>
    <li><strong>We're open source</strong> — audit everything at <a href="${REPO}">the repo</a>.</li>
  </ul></div>

  <h2>What data does BookmarkMind read?</h2>
  <ol>
    <li><strong>Your bookmark tree</strong> (<code>chrome.bookmarks</code>) — titles, URLs, hierarchy. Read only when you click "Categorize All Bookmarks".</li>
    <li><strong>Open tab titles</strong> (<code>chrome.tabs</code>) — to enrich stale bookmark titles with live ones during categorization.</li>
    <li><strong>Your provider API keys</strong> — encrypted before storing.</li>
  </ol>

  <h2>What data does BookmarkMind write?</h2>
  <p>Everything is stored via Chrome's storage APIs on <strong>your</strong> device:</p>
  <ul>
    <li><code>storage.sync.providerKeys</code> — keys, AES-256-GCM encrypted (PBKDF2 over a per-install random nonce).</li>
    <li><code>storage.sync.providerOrder</code> — your fallback order.</li>
    <li><code>storage.sync.customProviders</code> — custom endpoints (base URL + metadata, never keys).</li>
    <li><code>storage.sync.bookmarkMindSettings</code> — preferences.</li>
    <li><code>storage.local.categorizationState</code> — resume state for long runs.</li>
  </ul>

  <h2>What data leaves your device?</h2>
  <p><strong>Only when you explicitly click "Categorize All Bookmarks", and only to the provider(s) you configured:</strong></p>
  <ol>
    <li>Titles and URLs of your uncategorized bookmarks (in the LLM prompt).</li>
    <li>A sample of ~150 bookmark titles + URLs (once per run, to build the folder hierarchy).</li>
    <li>Optionally, live titles from your open tabs (if "enrich with live titles" is on).</li>
    <li>Your API key for the chosen provider (<code>Authorization: Bearer</code> header).</li>
  </ol>
  <p><strong>Nothing else. Ever.</strong></p>

  <h2>What BookmarkMind does NOT do</h2>
  <ul>
    <li>No analytics, heartbeats, or phone-home (there is no BookmarkMind server).</li>
    <li>No selling, sharing, or transferring your data to third parties.</li>
    <li>No advertising or targeting.</li>
    <li>No reading of sites you visit — unless you add that URL as a custom provider.</li>
  </ul>

  <h2>Third-party LLM providers</h2>
  <p>When you configure a provider, your bookmark titles + URLs + your API key are sent to <em>that</em> provider on each run. Each has its own privacy policy. For maximum privacy, use a <strong>localhost provider</strong> (Ollama, LM Studio, OmniRoute, LiteLLM).</p>
  <table><thead><tr><th>Provider</th><th>Tier</th><th>Base URL</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>

  <h2>Host permission <code>&lt;all_urls&gt;</code></h2>
  <p>Chrome asks for <code>&lt;all_urls&gt;</code> because you may configure <em>any</em> OpenAI-compatible endpoint — self-hosted proxies, corporate URLs, localhost. We cannot enumerate them upfront. BookmarkMind only calls endpoints you configure, never injects scripts, and never observes your browsing.</p>

  <h2>Data retention & your rights</h2>
  <ul>
    <li><strong>Delete:</strong> remove each provider in Options (clears encrypted keys), then uninstall (clears all local storage). Revoke keys at each provider's dashboard.</li>
    <li><strong>Access:</strong> everything is visible in Chrome DevTools → Application → Storage → chrome.storage.</li>
    <li><strong>Export bookmarks:</strong> Chrome bookmark manager (Ctrl+Shift+O) → Export.</li>
  </ul>

  <h2>Contact</h2>
  <ul>
    <li>Bugs / security: <a href="${REPO}/issues">${REPO.replace('https://', '')}/issues</a></li>
    <li>General: <code>chirag127@users.noreply.github.com</code></li>
    <li>Source: <a href="${REPO}">${REPO.replace('https://', '')}</a></li>
  </ul>
</article></div>`

  return shell({
    title: 'Privacy Policy — BookmarkMind',
    desc: 'BookmarkMind privacy policy: no server, no analytics, no telemetry. Encrypted keys, open source. Your bookmarks leave your device only to the LLM provider you choose.',
    body,
  })
}

// ---- build ----------------------------------------------------------------
rmSync(out, { recursive: true, force: true })
mkdirSync(resolve(out, 'assets'), { recursive: true })

writeFileSync(resolve(out, 'index.html'), indexPage())
writeFileSync(resolve(out, 'privacy-policy.html'), privacyPage())

let copied = 0
if (existsSync(assetsSrc)) {
  for (const f of readdirSync(assetsSrc)) {
    if (f.endsWith('.png')) { copyFileSync(resolve(assetsSrc, f), resolve(out, 'assets', f)); copied++ }
  }
}
// 404 → home (harmless for a 2-page static site)
writeFileSync(resolve(out, '404.html'), indexPage())

console.log(`✓ built public/  (index.html, privacy-policy.html, 404.html + ${copied} assets)`)
