/**
 * sprites.js — Alle Bilder werden hier EINMAL prozedural gezeichnet und zwischengespeichert.
 *
 * ZWECK:    Schnell zeichnen: im Bild nur noch drawImage (gedreht). Keine Bilddateien nötig.
 * REGEL:    Gebäude-Sprites: Front (Tür, Straße) oben. Auflösung PPT Pixel pro Kachel.
 *           Figuren schauen im Sprite nach oben (Norden); gedreht wird beim Zeichnen.
 *           Nur Darstellung — Math.random erlaubt, aber für Sprites mit festem Seed (gleiches Aussehen).
 */

export const PPT = 64;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

/** Kleiner fester Zufall für Sprites. */
function rnd(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function farbe(r, g, b, a = 1) { return `rgba(${r | 0},${g | 0},${b | 0},${a})`; }
function hell(c, f) { return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)]; }
const css = (c, a = 1) => farbe(c[0], c[1], c[2], a);

// ── Dächer ─────────────────────────────────────────────────────────────
const DACH = {
  stroh: [196, 160, 88], ziegel: [168, 82, 56], schiefer: [86, 94, 108], schindel: [122, 88, 58], dunkel: [70, 66, 70], rot: [150, 52, 44],
};

/**
 * Satteldach in ein Rechteck (x,y,w,h). First entlang der längeren Seite (oder 'laengs' erzwingen).
 */
function satteldach(ctx, x, y, w, h, art, r, opt = {}) {
  const c = DACH[art];
  const laengs = opt.first ?? (h >= w); // First vertikal
  ctx.save();
  // Traufe/Schatten-Rand
  ctx.fillStyle = css(hell(c, 0.55));
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  const a = hell(c, 1.12), b = hell(c, 0.78);
  if (laengs) {
    ctx.fillStyle = css(a); ctx.fillRect(x, y, w / 2, h);
    ctx.fillStyle = css(b); ctx.fillRect(x + w / 2, y, w / 2, h);
  } else {
    ctx.fillStyle = css(a); ctx.fillRect(x, y, w, h / 2);
    ctx.fillStyle = css(b); ctx.fillRect(x, y + h / 2, w, h / 2);
  }
  // Textur
  ctx.globalAlpha = 0.35;
  if (art === 'stroh') {
    ctx.strokeStyle = css(hell(c, 0.65)); ctx.lineWidth = 1;
    for (let i = 0; i < w * h / 18; i++) {
      const px = x + r() * w, py = y + r() * h, l = 3 + r() * 4;
      ctx.beginPath();
      if (laengs) { const d = px < x + w / 2 ? -1 : 1; ctx.moveTo(px, py); ctx.lineTo(px + d * l, py + 1); }
      else { const d = py < y + h / 2 ? -1 : 1; ctx.moveTo(px, py); ctx.lineTo(px + 1, py + d * l); }
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = css(hell(c, 0.6)); ctx.lineWidth = 1;
    const reihe = art === 'schiefer' ? 4 : 5;
    if (laengs) {
      for (let px = x + reihe; px < x + w; px += reihe) { if (Math.abs(px - (x + w / 2)) < 2) continue; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
      for (let py = y; py < y + h; py += reihe * 1.6) for (let px = x; px < x + w; px += reihe * 2) { ctx.beginPath(); ctx.moveTo(px + ((py / reihe) % 2) * reihe, py); ctx.lineTo(px + ((py / reihe) % 2) * reihe, py + reihe * 0.8); ctx.stroke(); }
    } else {
      for (let py = y + reihe; py < y + h; py += reihe) { if (Math.abs(py - (y + h / 2)) < 2) continue; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); }
    }
  }
  ctx.globalAlpha = 1;
  // First
  ctx.strokeStyle = css(hell(c, 0.5)); ctx.lineWidth = Math.max(1.5, Math.min(w, h) * 0.06);
  ctx.beginPath();
  if (laengs) { ctx.moveTo(x + w / 2, y + 1); ctx.lineTo(x + w / 2, y + h - 1); }
  else { ctx.moveTo(x + 1, y + h / 2); ctx.lineTo(x + w - 1, y + h / 2); }
  ctx.stroke();
  // Giebelkanten heller
  ctx.strokeStyle = css(hell(c, 1.3), 0.5); ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (opt.kamin) {
    const kx = laengs ? x + w * (0.62 + r() * 0.15) : x + w * (0.2 + r() * 0.6);
    const ky = laengs ? y + h * (0.2 + r() * 0.5) : y + h * (0.6 + r() * 0.15);
    const ks = Math.max(4, Math.min(w, h) * 0.17);
    ctx.fillStyle = '#5a5048'; ctx.fillRect(kx - ks / 2, ky - ks / 2, ks, ks);
    ctx.fillStyle = '#2a2420'; ctx.fillRect(kx - ks / 4, ky - ks / 4, ks / 2, ks / 2);
    opt.kamin.x = kx; opt.kamin.y = ky;
  }
  ctx.restore();
}

function erde(ctx, x, y, w, h, c = [128, 106, 74]) {
  ctx.fillStyle = css(c); ctx.fillRect(x, y, w, h);
  const r = rnd(w * 7 + h);
  for (let i = 0; i < w * h / 40; i++) { ctx.fillStyle = css(hell(c, 0.8 + r() * 0.4), 0.6); ctx.fillRect(x + r() * w, y + r() * h, 2, 2); }
}

function zaun(ctx, x, y, w, h, c = '#6b4a2a') {
  ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash([4, 2]);
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2); ctx.setLineDash([]);
}

function steinmauer(ctx, x, y, w, h, c = [150, 146, 136]) {
  ctx.fillStyle = css(hell(c, 0.6)); ctx.fillRect(x, y, w, h);
  ctx.fillStyle = css(c); ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = css(hell(c, 0.7), 0.7); ctx.lineWidth = 1;
  const s = 5;
  for (let py = y + s; py < y + h; py += s) { ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); }
  for (let py = y; py < y + h; py += s) for (let px = x + ((py / s) % 2) * 4; px < x + w; px += 8) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + s); ctx.stroke(); }
}

/** Zinnenkranz entlang eines Rechtecks. */
function zinnen(ctx, x, y, w, h, d, c = [178, 174, 164]) {
  ctx.fillStyle = css(c);
  const s = d * 1.6;
  for (let px = x; px < x + w - d / 2; px += s) { ctx.fillRect(px, y, d, d); ctx.fillRect(px, y + h - d, d, d); }
  for (let py = y; py < y + h - d / 2; py += s) { ctx.fillRect(x, py, d, d); ctx.fillRect(x + w - d, py, d, d); }
}

function turmRund(ctx, cx, cy, r, dach = null) {
  ctx.fillStyle = '#6e6a62'; ctx.beginPath(); ctx.arc(cx, cy, r + 1.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#a8a294'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill();
  if (dach) {
    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
    g.addColorStop(0, css(hell(DACH[dach], 1.3))); g.addColorStop(1, css(hell(DACH[dach], 0.7)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 0.82, 0, 7); ctx.fill();
    ctx.strokeStyle = css(hell(DACH[dach], 0.5), 0.6); ctx.lineWidth = 1;
    for (let a = 0; a < 6.28; a += 0.7) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); ctx.stroke(); }
  } else {
    ctx.fillStyle = '#7d6a50'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.68, 0, 7); ctx.fill();
    ctx.fillStyle = '#c4bdaa';
    for (let a = 0; a < 6.28; a += 0.62) ctx.fillRect(cx + Math.cos(a) * r * 0.84 - 2, cy + Math.sin(a) * r * 0.84 - 2, 4, 4);
  }
}

function fahne(ctx, x, y, s, c = '#b02a24') {
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - s * 0.2); ctx.stroke();
  ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x, y - s * 0.2); ctx.lineTo(x + s, y - s * 0.05); ctx.lineTo(x, y + s * 0.1); ctx.fill();
}

function holzstapel(ctx, x, y, n, s) {
  for (let i = 0; i < n; i++) {
    const px = x + (i % 4) * s * 0.9, py = y + Math.floor(i / 4) * s * 0.85;
    ctx.fillStyle = '#6a4626'; ctx.beginPath(); ctx.arc(px, py, s / 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#c49a64'; ctx.beginPath(); ctx.arc(px, py, s / 2 - 1.2, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(px, py, s / 4, 0, 7); ctx.stroke();
  }
}

// ── Gebäude ────────────────────────────────────────────────────────────
const DACHARTEN = ['stroh', 'ziegel', 'schindel', 'stroh'];

/** Zeichnet ein Gebäude (Front oben). Liefert {cv, kamine:[{x,y}] in Kachel-Einheiten relativ Mitte}. */
function zeichneGebaeude(art, variante, bT, tT, winter) {
  const w = bT * PPT, h = tT * PPT;
  const cv = canvas(w, h), ctx = cv.getContext('2d');
  const r = rnd(variante * 131 + Math.round(w * 3 + h));
  const kamine = [];
  let koerper = null; // optional: nur diese Form wirft Schatten (z. B. Kirche ohne Kirchhof)
  const kamin = () => { const k = { x: 0, y: 0 }; kamine.push(k); return k; };
  const dachart = DACHARTEN[variante % 4];
  switch (art) {
    case 'haus': {
      const k = kamin();
      satteldach(ctx, 2, 2, w - 4, h - 4, dachart, r, { kamin: k, first: (variante % 3 === 0) ? h < w : h >= w });
      break;
    }
    case 'hof': {
      erde(ctx, 0, 0, w, h, [136, 116, 78]);
      zaun(ctx, 0, 0, w, h);
      const k = kamin();
      satteldach(ctx, 3, 3, w * 0.46, h * 0.46, dachart, r, { kamin: k });
      satteldach(ctx, 3, h * 0.52, w - 6, h * 0.45, variante % 2 ? 'stroh' : 'schindel', r, { first: false });
      ctx.fillStyle = '#d8b850'; ctx.beginPath(); ctx.arc(w * 0.75, h * 0.25, w * 0.11, 0, 7); ctx.fill();
      ctx.strokeStyle = '#a88830'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w * 0.75, h * 0.25, w * 0.06, 0, 7); ctx.stroke();
      break;
    }
    case 'viehhof': {
      erde(ctx, 0, 0, w, h, [120, 104, 70]);
      satteldach(ctx, 2, h * 0.35, w * 0.55, h * 0.62, 'stroh', r);
      zaun(ctx, 0, 0, w, h * 0.38);
      ctx.fillStyle = '#5a4630'; ctx.fillRect(w * 0.62, h * 0.5, w * 0.3, h * 0.06);
      ctx.fillStyle = '#4a7090'; ctx.fillRect(w * 0.63, h * 0.505, w * 0.28, h * 0.04);
      const k = kamin();
      satteldach(ctx, w * 0.6, h * 0.62, w * 0.37, h * 0.35, dachart, r, { kamin: k });
      break;
    }
    case 'holzfaeller': {
      erde(ctx, 0, 0, w, h, [118, 98, 66]);
      const k = kamin();
      satteldach(ctx, w * 0.3, h * 0.3, w * 0.66, h * 0.66, 'schindel', r, { kamin: k });
      holzstapel(ctx, w * 0.1, h * 0.12, 7, w * 0.11);
      ctx.fillStyle = '#5a3a1e'; ctx.beginPath(); ctx.arc(w * 0.15, h * 0.72, w * 0.08, 0, 7); ctx.fill();
      ctx.fillStyle = '#b8905a'; ctx.beginPath(); ctx.arc(w * 0.15, h * 0.72, w * 0.06, 0, 7); ctx.fill();
      break;
    }
    case 'fischer': {
      erde(ctx, 0, 0, w, h, [150, 132, 96]);
      const k = kamin();
      satteldach(ctx, w * 0.05, h * 0.35, w * 0.62, h * 0.6, 'stroh', r, { kamin: k });
      ctx.strokeStyle = '#6a5034'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(w * 0.74, h * (0.3 + i * 0.2)); ctx.lineTo(w * 0.96, h * (0.3 + i * 0.2)); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(60,60,50,0.6)'; ctx.lineWidth = 0.7;
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(w * 0.75, h * (0.3 + i * 0.07)); ctx.lineTo(w * 0.95, h * (0.33 + i * 0.07)); ctx.stroke(); }
      break;
    }
    case 'steinbruch': {
      erde(ctx, 0, 0, w, h, [150, 144, 132]);
      for (let i = 0; i < 9; i++) { const s = w * (0.08 + r() * 0.08); ctx.fillStyle = css(hell([170, 166, 156], 0.8 + r() * 0.4)); ctx.fillRect(w * (0.08 + r() * 0.5), h * (0.1 + r() * 0.35), s, s * 0.8); }
      const k = kamin();
      satteldach(ctx, w * 0.45, h * 0.5, w * 0.5, h * 0.46, 'schindel', r, { kamin: k });
      break;
    }
    case 'erzgrube': {
      erde(ctx, 0, 0, w, h, [128, 96, 76]);
      ctx.fillStyle = '#6a5a4c'; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.62, w * 0.42, h * 0.34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#16120e'; ctx.beginPath(); ctx.ellipse(w * 0.5, h * 0.62, w * 0.16, h * 0.13, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a5630'; ctx.lineWidth = 3; ctx.strokeRect(w * 0.32, h * 0.47, w * 0.36, h * 0.3);
      ctx.fillStyle = '#9a4a30'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(w * (0.12 + r() * 0.2), h * (0.15 + r() * 0.2), w * 0.04, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#4a3a2a'; ctx.fillRect(w * 0.62, h * 0.12, w * 0.24, h * 0.16);
      ctx.fillStyle = '#7a3a26'; ctx.fillRect(w * 0.64, h * 0.14, w * 0.2, h * 0.08);
      break;
    }
    case 'speicher': {
      erde(ctx, 0, 0, w, h, [140, 120, 86]);
      satteldach(ctx, 3, h * 0.18, w - 6, h * 0.8, 'ziegel', r, { first: true });
      ctx.strokeStyle = 'rgba(40,20,10,0.5)'; ctx.lineWidth = 2;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(3, h * 0.18 + i * h * 0.2); ctx.lineTo(w - 3, h * 0.18 + i * h * 0.2); ctx.stroke(); }
      for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#c8b080' : '#b09868'; ctx.beginPath(); ctx.ellipse(w * (0.12 + i * 0.14), h * 0.08, w * 0.05, h * 0.04, 0, 0, 7); ctx.fill(); }
      break;
    }
    case 'schmiede': {
      erde(ctx, 0, 0, w, h, [110, 100, 90]);
      steinmauer(ctx, 2, h * 0.3, w - 4, h * 0.68, [120, 112, 104]);
      satteldach(ctx, 5, h * 0.33, w - 10, h * 0.62, 'schiefer', r, { first: false });
      const k = kamin(); k.x = w * 0.78; k.y = h * 0.45;
      ctx.fillStyle = '#3a3430'; ctx.fillRect(w * 0.72, h * 0.38, w * 0.14, w * 0.14);
      ctx.fillStyle = '#f07020'; ctx.fillRect(w * 0.75, h * 0.41, w * 0.08, w * 0.08);
      ctx.fillStyle = '#3c3c40'; ctx.fillRect(w * 0.3, h * 0.1, w * 0.18, h * 0.08);
      ctx.fillStyle = '#5c5c62'; ctx.fillRect(w * 0.34, h * 0.06, w * 0.1, h * 0.16);
      break;
    }
    case 'kaserne': {
      erde(ctx, 0, 0, w, h, [132, 118, 92]);
      steinmauer(ctx, 0, 0, w, h * 0.06); steinmauer(ctx, 0, 0, w * 0.06, h); steinmauer(ctx, w * 0.94, 0, w * 0.06, h); steinmauer(ctx, 0, h * 0.94, w, h * 0.06);
      ctx.fillStyle = '#5a4630'; ctx.fillRect(w * 0.4, 0, w * 0.2, h * 0.06);
      satteldach(ctx, w * 0.08, h * 0.55, w * 0.84, h * 0.37, 'ziegel', r, { first: false, kamin: kamin() });
      satteldach(ctx, w * 0.08, h * 0.1, w * 0.22, h * 0.42, 'ziegel', r, { first: true });
      for (let i = 0; i < 3; i++) { ctx.fillStyle = '#6a4a2a'; ctx.fillRect(w * (0.45 + i * 0.14), h * (0.22 + (i % 2) * 0.12), 3, 3); ctx.strokeStyle = '#c8a870'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(w * (0.45 + i * 0.14) + 1.5, h * (0.22 + (i % 2) * 0.12) - 3, 3, 0, 7); ctx.stroke(); }
      fahne(ctx, w * 0.07, h * 0.08, w * 0.12); fahne(ctx, w * 0.9, h * 0.08, w * 0.12);
      break;
    }
    case 'turm': {
      ctx.fillStyle = '#5e5a52'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#9e988a'; ctx.fillRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#7a6448'; ctx.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
      ctx.strokeStyle = 'rgba(40,30,20,0.5)'; ctx.lineWidth = 1;
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(w * 0.2, h * (0.2 + i * 0.12)); ctx.lineTo(w * 0.8, h * (0.2 + i * 0.12)); ctx.stroke(); }
      zinnen(ctx, 2, 2, w - 4, h - 4, w * 0.11, [196, 190, 176]);
      ctx.fillStyle = '#3a2a1a'; ctx.fillRect(w * 0.62, h * 0.62, w * 0.12, h * 0.12);
      fahne(ctx, w * 0.5, h * 0.5, w * 0.3);
      break;
    }
    case 'palisade': {
      const rr = h * 0.48, n = Math.max(2, Math.round(w / (rr * 1.7)));
      ctx.fillStyle = 'rgba(40,26,14,0.9)'; ctx.fillRect(0, h * 0.3, w, h * 0.4);
      for (let i = 0; i < n; i++) {
        const px = (i + 0.5) * w / n;
        ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.arc(px, h / 2, rr, 0, 7); ctx.fill();
        const g = ctx.createRadialGradient(px - rr * 0.3, h / 2 - rr * 0.3, 1, px, h / 2, rr);
        g.addColorStop(0, css(hell([176, 132, 84], 1 + r() * 0.15))); g.addColorStop(1, '#6a4626');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, h / 2, rr - 1.5, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(70,44,22,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(px, h / 2, rr * 0.45, 0, 7); ctx.stroke();
        ctx.fillStyle = '#4a3018'; ctx.beginPath(); ctx.arc(px, h / 2, rr * 0.18, 0, 7); ctx.fill();
      }
      break;
    }
    case 'mauer': {
      steinmauer(ctx, 0, 0, w, h, [156, 150, 140]);
      ctx.fillStyle = 'rgba(90,80,70,0.5)'; ctx.fillRect(0, h * 0.35, w, h * 0.3);
      ctx.fillStyle = '#c2bcae';
      for (let px = 0; px < w; px += h * 0.7) ctx.fillRect(px, 0, h * 0.4, h * 0.3);
      break;
    }
    case 'tor':
    case 'tor_mauer': {
      // Torhaus aus Stein: Mauerstümpfe, überdachter Torbau mit Fallgatter vorn und hinten, zwei runde Flankentürme
      const r2 = h * 0.34;
      steinmauer(ctx, 0, h * 0.36, w, h * 0.28, [150, 146, 136]);
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(w * 0.28 + 3, h * 0.08 + 3, w * 0.44, h * 0.84);
      steinmauer(ctx, w * 0.28, h * 0.08, w * 0.44, h * 0.84, [140, 134, 124]);
      satteldach(ctx, w * 0.31, h * 0.14, w * 0.38, h * 0.72, 'schiefer', r, { first: false });
      ctx.fillStyle = '#1e1a16'; ctx.fillRect(w * 0.4, h * 0.02, w * 0.2, h * 0.1); ctx.fillRect(w * 0.4, h * 0.88, w * 0.2, h * 0.1);
      ctx.strokeStyle = '#6a6460'; ctx.lineWidth = 1.2;
      for (let px = w * 0.42; px < w * 0.6; px += 4) { ctx.beginPath(); ctx.moveTo(px, h * 0.02); ctx.lineTo(px, h * 0.12); ctx.moveTo(px, h * 0.88); ctx.lineTo(px, h * 0.98); ctx.stroke(); }
      turmRund(ctx, r2 + 2, h / 2, r2);
      turmRund(ctx, w - r2 - 2, h / 2, r2);
      fahne(ctx, w / 2, h * 0.5, w * 0.12);
      break;
    }
    case 'tor_palisade': {
      // Holztor: Palisadenstümpfe, zwei hölzerne Tortürme mit Bretterdach, Bohlentor in der Mitte
      const rr = h * 0.2, n = Math.max(2, Math.round(w / (rr * 1.7)));
      for (let i = 0; i < n; i++) {
        const px = (i + 0.5) * w / n; if (px > w * 0.3 && px < w * 0.7) continue;
        ctx.fillStyle = '#3a2614'; ctx.beginPath(); ctx.arc(px, h / 2, rr, 0, 7); ctx.fill();
        ctx.fillStyle = '#9a6e42'; ctx.beginPath(); ctx.arc(px, h / 2, rr - 1.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#5a3e22'; ctx.fillRect(w * 0.3, h * 0.38, w * 0.4, h * 0.24);
      ctx.strokeStyle = '#3a2814'; ctx.lineWidth = 1;
      for (let px = w * 0.3; px < w * 0.7; px += 4) { ctx.beginPath(); ctx.moveTo(px, h * 0.38); ctx.lineTo(px, h * 0.62); ctx.stroke(); }
      for (const tx of [w * 0.17, w * 0.83]) {
        const s = h * 0.62;
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tx - s / 2 + 3, h / 2 - s / 2 + 3, s, s);
        ctx.fillStyle = '#4a321c'; ctx.fillRect(tx - s / 2, h / 2 - s / 2, s, s);
        satteldach(ctx, tx - s / 2 + 2, h / 2 - s / 2 + 2, s - 4, s - 4, 'schindel', r);
      }
      break;
    }
    case 'platz': {
      // Straßenmarkt: länglicher, gepflasterter Platz entlang der Handelsstraße (u-Achse = Bildbreite)
      const rnd2 = rnd(4711);
      const rx = Math.min(w, h) * 0.22;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(rx, 3); ctx.lineTo(w - rx, 3);
      ctx.quadraticCurveTo(w - 3, 3, w - 3, rx); ctx.lineTo(w - 3, h * 0.36); ctx.lineTo(w - 1, h * 0.5); ctx.lineTo(w - 3, h * 0.64);
      ctx.lineTo(w - 3, h - rx); ctx.quadraticCurveTo(w - 3, h - 3, w - rx, h - 3); ctx.lineTo(rx, h - 3);
      ctx.quadraticCurveTo(3, h - 3, 3, h - rx); ctx.lineTo(3, h * 0.64); ctx.lineTo(1, h * 0.5); ctx.lineTo(3, h * 0.36); ctx.lineTo(3, rx);
      ctx.quadraticCurveTo(3, 3, rx, 3); ctx.closePath();
      ctx.fillStyle = '#7a705e'; ctx.fill();
      ctx.clip();
      ctx.fillStyle = '#a39a86'; ctx.fillRect(0, 0, w, h);
      // Kopfsteinpflaster in versetzten Reihen
      const st = 5.2;
      for (let y = 0, r = 0; y < h + st; y += st * 0.82, r++) {
        for (let x = (r % 2) * st / 2; x < w + st; x += st) {
          const f = 0.78 + rnd2() * 0.38;
          ctx.fillStyle = css(hell([170, 160, 140], f));
          ctx.beginPath(); ctx.ellipse(x + (rnd2() - 0.5), y + (rnd2() - 0.5), st * 0.44, st * 0.36, rnd2() * 3, 0, 7); ctx.fill();
        }
      }
      // ausgefahrene Mitte (Handelsweg) und Rinne
      ctx.fillStyle = 'rgba(120,96,64,0.22)'; ctx.fillRect(0, h * 0.42, w, h * 0.16);
      ctx.strokeStyle = 'rgba(70,60,50,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, h * 0.5); ctx.lineTo(w, h * 0.5); ctx.stroke();
      ctx.restore();
      // Marktstände entlang der Längsseiten
      const markise = [[176, 58, 48], [216, 192, 96], [58, 106, 160], [90, 138, 58], [208, 112, 48], [232, 224, 200], [130, 70, 120]];
      const waren = ['#c83a2a', '#5a9a3a', '#b8864a', '#e0c050', '#8a5a3a', '#d8d0c0', '#6a3a7a'];
      const standB = w * 0.105, standT = h * 0.15;
      for (const reihe of [0, 1]) {
        for (let i = 0; i < 6; i++) {
          if (reihe === 0 && (i === 2 || i === 3)) continue; // Lücke vor dem Rathaus
          const sx = w * 0.12 + i * w * 0.135 + (rnd2() - 0.5) * 3, sy = reihe ? h * 0.79 : h * 0.06;
          const fa = markise[(i * 3 + reihe * 2) % markise.length];
          ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx + 2, sy + 2, standB, standT);
          ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx, sy + (reihe ? 0 : standT * 0.55), standB, standT * 0.45);
          for (let k = 0; k < 7; k++) { ctx.fillStyle = waren[(i + k) % waren.length]; ctx.beginPath(); ctx.arc(sx + 2 + k * standB / 7.5, sy + (reihe ? standT * 0.22 : standT * 0.78), 1.4, 0, 7); ctx.fill(); }
          ctx.fillStyle = css(fa); ctx.fillRect(sx, sy + (reihe ? standT * 0.45 : 0), standB, standT * 0.55);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          for (let s2 = 0; s2 < standB; s2 += 6) ctx.fillRect(sx + s2, sy + (reihe ? standT * 0.45 : 0), 3, standT * 0.55);
          if (i % 2 === 0) { ctx.fillStyle = '#7a5530'; ctx.beginPath(); ctx.arc(sx + standB + 3, sy + standT / 2, 2.6, 0, 7); ctx.fill(); ctx.strokeStyle = '#4a3018'; ctx.lineWidth = 0.8; ctx.stroke(); }
          else { ctx.fillStyle = '#9a7a4a'; ctx.fillRect(sx + standB + 1, sy + standT * 0.3, 5, 5); }
        }
      }
      // Marktbrunnen (achteckig) mit Säule
      const bx = w * 0.7, by = h * 0.5, br = h * 0.13;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.39; ctx.lineTo(bx + 2 + Math.cos(a) * br, by + 2 + Math.sin(a) * br); } ctx.fill();
      ctx.fillStyle = '#8e8a80';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.39; ctx.lineTo(bx + Math.cos(a) * br, by + Math.sin(a) * br); } ctx.fill();
      ctx.fillStyle = '#3c6c90';
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283 + 0.39; ctx.lineTo(bx + Math.cos(a) * br * 0.78, by + Math.sin(a) * br * 0.78); } ctx.fill();
      ctx.fillStyle = 'rgba(200,230,255,0.5)'; ctx.beginPath(); ctx.arc(bx - br * 0.25, by - br * 0.25, br * 0.18, 0, 7); ctx.fill();
      ctx.fillStyle = '#b8b2a4'; ctx.beginPath(); ctx.arc(bx, by, br * 0.26, 0, 7); ctx.fill();
      ctx.fillStyle = '#d8c070'; ctx.beginPath(); ctx.arc(bx, by, br * 0.12, 0, 7); ctx.fill();
      // Marktkreuz und Pranger
      const kx = w * 0.3, ky = h * 0.5;
      ctx.fillStyle = '#8a857a'; ctx.fillRect(kx - 5, ky - 5, 10, 10);
      ctx.fillStyle = '#b0aa9c'; ctx.fillRect(kx - 1.5, ky - 7, 3, 14); ctx.fillRect(kx - 5, ky - 1.5, 10, 3);
      ctx.fillStyle = '#5a4028'; ctx.fillRect(w * 0.47, h * 0.66, 3, 3);
      // Viehgatter am einen Ende (Viehmarkt)
      ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 2]);
      ctx.strokeRect(w * 0.04, h * 0.3, w * 0.09, h * 0.4); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(160,130,70,0.6)'; ctx.fillRect(w * 0.045, h * 0.31, w * 0.08, h * 0.38);
      break;
    }
    case 'rathaus': {
      // Laubengang (offene Verkaufshalle) zur Platzseite, darüber steiles Ziegeldach mit Treppengiebeln und Dachreiter
      erde(ctx, 0, 0, w, h, [150, 140, 124]);
      ctx.fillStyle = '#8a8274'; ctx.fillRect(0, 0, w, h * 0.24);
      ctx.fillStyle = '#26201a';
      for (let x = w * 0.06; x < w * 0.94; x += w * 0.11) { ctx.beginPath(); ctx.moveTo(x, h * 0.2); ctx.lineTo(x, h * 0.1); ctx.arc(x + w * 0.04, h * 0.1, w * 0.04, Math.PI, 0); ctx.lineTo(x + w * 0.08, h * 0.2); ctx.fill(); }
      satteldach(ctx, 2, h * 0.2, w - 4, h * 0.78, 'ziegel', r, { first: false, kamin: kamin() });
      ctx.fillStyle = '#9a9488';
      for (const gx of [2, w - 9]) for (let s2 = 0; s2 < 4; s2++) ctx.fillRect(gx, h * 0.24 + s2 * h * 0.18, 7, h * 0.1);
      const tx = w / 2, ty = h * 0.59, ts = w * 0.13;
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tx - ts / 2 + 3, ty - ts / 2 + 3, ts, ts);
      ctx.fillStyle = '#e8e0c8'; ctx.fillRect(tx - ts / 2, ty - ts / 2, ts, ts);
      ctx.fillStyle = '#4a5a6a'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ts / 2, ty - ts / 2); ctx.lineTo(tx + ts / 2, ty - ts / 2); ctx.fill();
      ctx.fillStyle = '#5a6a7a'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + ts / 2, ty - ts / 2); ctx.lineTo(tx + ts / 2, ty + ts / 2); ctx.fill();
      ctx.fillStyle = '#3a4a5a'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ts / 2, ty + ts / 2); ctx.lineTo(tx + ts / 2, ty + ts / 2); ctx.fill();
      ctx.fillStyle = '#d8b850'; ctx.beginPath(); ctx.arc(tx, ty, 2.2, 0, 7); ctx.fill();
      fahne(ctx, w * 0.12, h * 0.14, w * 0.12, '#2a5aa0');
      break;
    }
    case 'kirche': {
      // geostet: Turm/Portal im Westen (oben im Bild), Schiff mit Schieferdach, runde Apsis im Osten (unten).
      // Kirchhof mit niedriger Mauer und Grabsteinen; er wirft keinen Schatten (siehe koerper unten).
      ctx.fillStyle = '#7f9a5a'; ctx.fillRect(2, 2, w - 4, h - 4);
      ctx.strokeStyle = '#8e897c'; ctx.lineWidth = 2.5; ctx.strokeRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#7a6a52'; ctx.fillRect(w / 2 - 5, 0, 10, h * 0.1); // Weg zum Portal
      for (let i = 0; i < 14; i++) { ctx.fillStyle = '#a6a194'; ctx.fillRect(w * (i % 2 ? 0.06 : 0.84), h * (0.24 + Math.floor(i / 2) * 0.09), w * 0.07, h * 0.022); }
      for (const [bx, by] of [[0.1, 0.12], [0.88, 0.9]]) { ctx.fillStyle = '#4e7a3a'; ctx.beginPath(); ctx.arc(w * bx, h * by, w * 0.09, 0, 7); ctx.fill(); }
      const kw0 = w * 0.2, kw = w * 0.6;
      const ts = kw * 0.8, tx = w / 2, ty = ts / 2 + h * 0.03;
      koerper = (c2) => { c2.fillRect(kw0, h * 0.2, kw, h * 0.6); c2.beginPath(); c2.arc(w / 2, h * 0.8, kw * 0.42, 0, Math.PI); c2.fill(); c2.fillRect(tx - ts / 2, ty - ts / 2, ts, ts); };
      satteldach(ctx, kw0, h * 0.2, kw, h * 0.6, 'schiefer', r, { first: true });
      ctx.fillStyle = '#4e5664'; ctx.beginPath(); ctx.arc(w / 2, h * 0.8, kw * 0.42, 0, Math.PI); ctx.fill();
      ctx.strokeStyle = '#30363f'; ctx.lineWidth = 1;
      for (let a = 0.2; a < 3.0; a += 0.45) { ctx.beginPath(); ctx.moveTo(w / 2, h * 0.8); ctx.lineTo(w / 2 + Math.cos(a) * kw * 0.42, h * 0.8 + Math.sin(a) * kw * 0.42); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(tx - ts / 2 + 4, ty - ts / 2 + 4, ts, ts);
      ctx.fillStyle = '#8a8476'; ctx.fillRect(tx - ts / 2 - 1, ty - ts / 2 - 1, ts + 2, ts + 2);
      ctx.fillStyle = '#5c6472'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ts / 2, ty - ts / 2); ctx.lineTo(tx + ts / 2, ty - ts / 2); ctx.fill();
      ctx.fillStyle = '#6c7482'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ts / 2, ty - ts / 2); ctx.lineTo(tx - ts / 2, ty + ts / 2); ctx.fill();
      ctx.fillStyle = '#464e5a'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + ts / 2, ty - ts / 2); ctx.lineTo(tx + ts / 2, ty + ts / 2); ctx.fill();
      ctx.fillStyle = '#3a414c'; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - ts / 2, ty + ts / 2); ctx.lineTo(tx + ts / 2, ty + ts / 2); ctx.fill();
      ctx.fillStyle = '#e0c060'; ctx.fillRect(tx - 1, ty - 4, 2, 8); ctx.fillRect(tx - 3, ty - 1, 6, 2);
      break;
    }
    case 'stadthaus': {
      // Bürgerhaus: steiles Dach, Gauben zur Straße, Brandmauern an den Seiten
      const k = kamin();
      const art = ['ziegel', 'schiefer', 'ziegel', 'schindel'][variante % 4];
      ctx.fillStyle = '#8a8478'; ctx.fillRect(0, 0, w, h);
      satteldach(ctx, 3, 1, w - 6, h - 2, art, r, { kamin: k, first: false });
      ctx.fillStyle = '#9a968c'; ctx.fillRect(0, 0, 3, h); ctx.fillRect(w - 3, 0, 3, h);
      for (let i = 0; i < 2; i++) {
        const gx = w * (0.28 + i * 0.36), gy = h * 0.18;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(gx - 4, gy - 3 + 2, 9, 9);
        ctx.fillStyle = css(hell(DACH[art], 1.15)); ctx.beginPath(); ctx.moveTo(gx - 4, gy + 6); ctx.lineTo(gx, gy - 4); ctx.lineTo(gx + 4, gy + 6); ctx.fill();
        ctx.fillStyle = '#2a2620'; ctx.fillRect(gx - 1.5, gy + 1, 3, 4);
      }
      break;
    }
    case 'burg': {
      // Ringmauer mit Ecktürmen, Torhaus vorne (oben), Hof, Bergfried, Palas
      const m = w * 0.1;
      ctx.fillStyle = '#8a8070'; ctx.fillRect(m * 0.5, m * 0.5, w - m, h - m);
      ctx.fillStyle = '#9a8e78'; ctx.fillRect(m, m, w - 2 * m, h - 2 * m);
      for (let i = 0; i < w * h / 60; i++) { ctx.fillStyle = css(hell([150, 140, 120], 0.85 + r() * 0.3), 0.6); ctx.fillRect(m + r() * (w - 2 * m), m + r() * (h - 2 * m), 2, 2); }
      steinmauer(ctx, m * 0.5, m * 0.5, w - m, m * 0.7, [150, 144, 132]);
      steinmauer(ctx, m * 0.5, h - m * 1.2, w - m, m * 0.7, [150, 144, 132]);
      steinmauer(ctx, m * 0.5, m * 0.5, m * 0.7, h - m, [150, 144, 132]);
      steinmauer(ctx, w - m * 1.2, m * 0.5, m * 0.7, h - m, [150, 144, 132]);
      ctx.fillStyle = '#c0b8a6';
      for (let px = m; px < w - m; px += 9) { ctx.fillRect(px, m * 0.5, 4, 3); ctx.fillRect(px, h - m * 0.5 - 3, 4, 3); }
      for (let py = m; py < h - m; py += 9) { ctx.fillRect(m * 0.5, py, 3, 4); ctx.fillRect(w - m * 0.5 - 3, py, 3, 4); }
      // Palas (langes Haus hinten)
      satteldach(ctx, m * 1.4, h * 0.62, w * 0.5, h * 0.24, 'schiefer', r, { first: false, kamin: kamin() });
      // Ställe rechts
      satteldach(ctx, w * 0.7, h * 0.2, w * 0.17, h * 0.34, 'schindel', r, { first: true });
      // Bergfried
      const bx = w * 0.62, by = h * 0.6, bs = w * 0.27;
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(bx + 4, by + 4, bs, bs);
      ctx.fillStyle = '#6e685e'; ctx.fillRect(bx, by, bs, bs);
      ctx.fillStyle = '#a49e90'; ctx.fillRect(bx + 3, by + 3, bs - 6, bs - 6);
      satteldach(ctx, bx + bs * 0.22, by + bs * 0.22, bs * 0.56, bs * 0.56, 'schiefer', r);
      zinnen(ctx, bx + 3, by + 3, bs - 6, bs - 6, bs * 0.08, [196, 190, 176]);
      fahne(ctx, bx + bs / 2, by + bs * 0.2, bs * 0.4);
      // Brunnen
      ctx.fillStyle = '#5a5a5a'; ctx.beginPath(); ctx.arc(w * 0.32, h * 0.35, w * 0.035, 0, 7); ctx.fill();
      ctx.fillStyle = '#2a4a6a'; ctx.beginPath(); ctx.arc(w * 0.32, h * 0.35, w * 0.022, 0, 7); ctx.fill();
      // Ecktürme
      for (const [tx, ty] of [[m, m], [w - m, m], [m, h - m], [w - m, h - m]]) turmRund(ctx, tx, ty, m * 1.05, 'schiefer');
      // Torhaus vorne Mitte
      ctx.fillStyle = '#5a4a36'; ctx.fillRect(w * 0.44, 0, w * 0.12, m * 1.3);
      turmRund(ctx, w * 0.4, m * 0.7, m * 0.7); turmRund(ctx, w * 0.6, m * 0.7, m * 0.7);
      fahne(ctx, w * 0.4, m * 0.7, m); fahne(ctx, w * 0.6, m * 0.7, m);
      break;
    }
    default: {
      satteldach(ctx, 2, 2, w - 4, h - 4, 'schindel', r);
    }
  }
  if (winter && art !== 'platz') {
    // Schnee auf Dächern: helle Schicht über allem außer Erde (vereinfacht: überall, Ränder bleiben sichtbar)
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(240,244,250,0.55)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  let schattenCv = null;
  if (koerper) { schattenCv = canvas(w, h); const c2 = schattenCv.getContext('2d'); c2.fillStyle = '#000'; koerper(c2); }
  return { cv, schattenCv, kamine: kamine.map((k) => ({ x: k.x / PPT - bT / 2, y: k.y / PPT - tT / 2 })) };
}

function schattenVon(cv) {
  const s = canvas(cv.width, cv.height), c = s.getContext('2d');
  c.drawImage(cv, 0, 0);
  c.globalCompositeOperation = 'source-in';
  c.fillStyle = 'rgba(0,0,0,1)'; c.fillRect(0, 0, s.width, s.height);
  return s;
}

const gebCache = new Map();
/** Sprite eines Gebäudes (mit Schatten), gecacht. b,t in Milli-Kacheln. */
export function gebaeudeSprite(art, variante, b, t, winter) {
  const key = `${art}|${variante}|${b}|${t}|${winter ? 1 : 0}`;
  let s = gebCache.get(key);
  if (!s) {
    const g = zeichneGebaeude(art, variante, b / 1000, t / 1000, winter);
    s = { cv: g.cv, schatten: g.schattenCv || schattenVon(g.cv), kamine: g.kamine };
    gebCache.set(key, s);
  }
  return s;
}

// ── Bäume ──────────────────────────────────────────────────────────────
const BAUMFARBEN = [
  { laub: [[92, 150, 60], [120, 170, 70], [80, 140, 60]], bluete: true }, // Frühling
  { laub: [[58, 112, 44], [70, 124, 48], [48, 98, 40]] }, // Sommer
  { laub: [[196, 128, 40], [178, 84, 36], [206, 168, 60]] }, // Herbst
  { laub: null }, // Winter: kahl
];

function laubbaum(saison, v) {
  const S = 40, cv = canvas(S, S), ctx = cv.getContext('2d');
  const r = rnd(v * 977 + saison * 31);
  const cx = S / 2, cy = S / 2;
  const f = BAUMFARBEN[saison];
  if (!f.laub) {
    ctx.strokeStyle = '#5a4a3c'; ctx.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, l = S * (0.25 + r() * 0.2);
      ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * l * 0.6, cy + Math.sin(a) * l * 0.6); ctx.lineTo(cx + Math.cos(a + 0.5) * l, cy + Math.sin(a + 0.5) * l); ctx.stroke();
    }
    ctx.fillStyle = '#4a3a2c'; ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(245,248,252,0.7)';
    for (let i = 0; i < 10; i++) { ctx.beginPath(); ctx.arc(cx + (r() - 0.5) * S * 0.6, cy + (r() - 0.5) * S * 0.6, 1.4, 0, 7); ctx.fill(); }
    return cv;
  }
  const basis = f.laub[v % 3];
  const blobs = [];
  for (let i = 0; i < 7; i++) { const a = r() * 6.28, d = r() * S * 0.16; blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d, S * (0.17 + r() * 0.1)]); }
  ctx.fillStyle = css(hell(basis, 0.6));
  for (const [x, y, rr] of blobs) { ctx.beginPath(); ctx.arc(x + 1, y + 1, rr + 1, 0, 7); ctx.fill(); }
  for (const [x, y, rr] of blobs) {
    const g = ctx.createRadialGradient(x - rr * 0.4, y - rr * 0.4, rr * 0.1, x, y, rr);
    g.addColorStop(0, css(hell(basis, 1.35))); g.addColorStop(1, css(hell(basis, 0.85)));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 18; i++) { ctx.fillStyle = css(hell(basis, 1.2 + r() * 0.3), 0.6); ctx.beginPath(); ctx.arc(cx + (r() - 0.6) * S * 0.5, cy + (r() - 0.6) * S * 0.5, 1.3, 0, 7); ctx.fill(); }
  if (f.bluete && v % 2 === 0) { for (let i = 0; i < 12; i++) { ctx.fillStyle = 'rgba(250,236,240,0.9)'; ctx.beginPath(); ctx.arc(cx + (r() - 0.5) * S * 0.55, cy + (r() - 0.5) * S * 0.55, 1.3, 0, 7); ctx.fill(); } }
  return cv;
}

function nadelbaum(saison, v) {
  const S = 36, cv = canvas(S, S), ctx = cv.getContext('2d');
  const r = rnd(v * 313 + 7);
  const cx = S / 2, cy = S / 2;
  const basis = saison === 0 ? [52, 100, 58] : [40, 84, 52];
  for (let ring = 3; ring >= 1; ring--) {
    const rr = S * 0.15 * ring, n = 9;
    ctx.fillStyle = css(hell(basis, 0.75 + (3 - ring) * 0.18));
    ctx.beginPath();
    for (let i = 0; i <= n * 2; i++) {
      const a = i / (n * 2) * 6.28 + ring * 0.3 + v, d = i % 2 ? rr * 0.62 : rr;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.fill();
  }
  ctx.fillStyle = css(hell(basis, 1.4)); ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 2, 0, 7); ctx.fill();
  if (saison === 3) {
    ctx.fillStyle = 'rgba(244,248,252,0.75)';
    for (let i = 0; i < 16; i++) { const a = r() * 6.28, d = r() * S * 0.4; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d - 1, cy + Math.sin(a) * d - 1, 1.5, 0, 7); ctx.fill(); }
  }
  return cv;
}

function baumSchatten(S) {
  const cv = canvas(S, S), ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 1, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.42)'); g.addColorStop(0.7, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  return cv;
}

let baumSet = null;
export function baeume() {
  if (baumSet) return baumSet;
  baumSet = { laub: [], nadel: [], schatten: baumSchatten(40), stumpf: null, setzling: null };
  for (let s = 0; s < 4; s++) {
    baumSet.laub.push([0, 1, 2, 3, 4, 5].map((v) => laubbaum(s, v)));
    baumSet.nadel.push([0, 1, 2, 3].map((v) => nadelbaum(s, v)));
  }
  const st = canvas(10, 10), c = st.getContext('2d');
  c.fillStyle = '#5a3a1e'; c.beginPath(); c.arc(5, 5, 4, 0, 7); c.fill();
  c.fillStyle = '#c8a070'; c.beginPath(); c.arc(5, 5, 3, 0, 7); c.fill();
  baumSet.stumpf = st;
  return baumSet;
}

// ── Figuren ────────────────────────────────────────────────────────────
export const FIG = 32; // Pixel je Figur-Bild (Figur ≈ 0,42 Kacheln)

/**
 * Figurtypen: kleidung, kopf (Farbe), hut ('helm'|'kapuze'|'stroh'|null), werkzeug ('speer'|'schwert'|'axt'|'hammer'|'sack'|'hacke'|null)
 */
export const FIGUREN = {
  buerger: { kleidung: [120, 96, 70], kopf: [96, 70, 44] },
  buergerin: { kleidung: [150, 70, 64], kopf: [200, 180, 120], kleid: true },
  traeger: { kleidung: [110, 100, 80], kopf: [80, 60, 40], werkzeug: 'sack' },
  bauer: { kleidung: [130, 120, 70], kopf: [80, 60, 40], hut: 'stroh', werkzeug: 'hacke' },
  holzfaeller: { kleidung: [70, 100, 60], kopf: [90, 60, 30], werkzeug: 'axt' },
  bauarbeiter: { kleidung: [150, 120, 90], kopf: [70, 50, 30], werkzeug: 'hammer' },
  bergmann: { kleidung: [90, 80, 74], kopf: [60, 50, 40], hut: 'kapuze', werkzeug: 'hacke' },
  fischer: { kleidung: [70, 90, 110], kopf: [120, 90, 60], hut: 'stroh' },
  bogner: { kleidung: [60, 110, 60], kopf: [90, 110, 60], hut: 'kapuze', werkzeug: 'bogen' },
  marktfrau: { kleidung: [170, 120, 60], kopf: [230, 225, 210], kleid: true },
  soldat: { kleidung: [160, 40, 36], kopf: [150, 150, 156], hut: 'helm', werkzeug: 'speer', schild: true },
  raeuber: { kleidung: [60, 52, 44], kopf: [50, 44, 36], hut: 'kapuze', werkzeug: 'schwert' },
};

/** Ein Figurbild. phase: 0..3 Laufen, aktion 0..1 (Schlag/Arbeit). */
function figurBild(typ, phase, aktion) {
  const t = FIGUREN[typ];
  const cv = canvas(FIG, FIG), ctx = cv.getContext('2d');
  const cx = FIG / 2, cy = FIG / 2 + 2;
  const schwung = [0, 1, 0, -1][phase];
  // Beine (vor/zurück)
  ctx.fillStyle = '#3a2e24';
  if (!t.kleid) {
    ctx.beginPath(); ctx.ellipse(cx - 2.6, cy - schwung * 3.2, 1.8, 2.6, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx + 2.6, cy + schwung * 3.2, 1.8, 2.6, 0, 0, 7); ctx.fill();
  }
  // Körper (Schultern)
  ctx.fillStyle = css(hell(t.kleidung, 0.6));
  ctx.beginPath(); ctx.ellipse(cx, cy, 6.4, t.kleid ? 5.4 : 4.2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = css(t.kleidung);
  ctx.beginPath(); ctx.ellipse(cx - 0.4, cy - 0.4, 5.8, t.kleid ? 4.8 : 3.6, 0, 0, 7); ctx.fill();
  // Arme
  const haut = '#d8a880';
  const arm = aktion ? -1 : schwung;
  ctx.fillStyle = css(hell(t.kleidung, 0.85));
  ctx.beginPath(); ctx.arc(cx - 6, cy + arm * 2.5, 1.9, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, cy - (aktion ? 4 : arm * 2.5), 1.9, 0, 7); ctx.fill();
  ctx.fillStyle = haut;
  ctx.beginPath(); ctx.arc(cx - 6, cy + arm * 2.5 - 1.8, 1.3, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, cy - (aktion ? 4 : arm * 2.5) - 1.8, 1.3, 0, 7); ctx.fill();
  // Werkzeug in der rechten Hand
  const hx = cx + 6, hy = cy - (aktion ? 4 : arm * 2.5) - 2;
  ctx.lineCap = 'round';
  switch (t.werkzeug) {
    case 'speer': ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(hx, hy + 6); ctx.lineTo(hx, hy - (aktion ? 15 : 11)); ctx.stroke(); ctx.fillStyle = '#c8ccd4'; ctx.beginPath(); ctx.moveTo(hx, hy - (aktion ? 18 : 14)); ctx.lineTo(hx - 1.6, hy - (aktion ? 14 : 10)); ctx.lineTo(hx + 1.6, hy - (aktion ? 14 : 10)); ctx.fill(); break;
    case 'schwert': ctx.strokeStyle = '#b8bcc4'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + (aktion ? -3 : 1), hy - 8); ctx.stroke(); break;
    case 'axt': ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(hx, hy + 2); ctx.lineTo(hx, hy - 7); ctx.stroke(); ctx.fillStyle = '#a0a4ac'; ctx.fillRect(hx - 0.5, hy - 8, 3, 3); break;
    case 'hammer': ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx, hy + 2); ctx.lineTo(hx, hy - 5); ctx.stroke(); ctx.fillStyle = '#606068'; ctx.fillRect(hx - 2, hy - 7, 4, 2.4); break;
    case 'hacke': ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx, hy + 3); ctx.lineTo(hx, hy - 7); ctx.stroke(); ctx.strokeStyle = '#8a8c90'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 7); ctx.lineTo(hx + 2, hy - 7); ctx.stroke(); break;
    case 'bogen': ctx.strokeStyle = '#6a4a22'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(hx - 2, hy - 1, 6.5, aktion ? -2.6 : -2.2, aktion ? -0.5 : -0.9); ctx.stroke(); ctx.strokeStyle = 'rgba(230,230,210,0.8)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(hx - 2 + Math.cos(aktion ? -2.6 : -2.2) * 6.5, hy - 1 + Math.sin(aktion ? -2.6 : -2.2) * 6.5); ctx.lineTo(hx - 2 + Math.cos(aktion ? -0.5 : -0.9) * 6.5, hy - 1 + Math.sin(aktion ? -0.5 : -0.9) * 6.5); ctx.stroke(); break;
    case 'sack': ctx.fillStyle = '#c8b088'; ctx.beginPath(); ctx.ellipse(cx + 3.5, cy - 1, 3.6, 3, 0.4, 0, 7); ctx.fill(); ctx.strokeStyle = '#8a7050'; ctx.lineWidth = 0.8; ctx.stroke(); break;
  }
  if (t.schild) { ctx.fillStyle = '#7a2a24'; ctx.beginPath(); ctx.arc(cx - 6.5, cy - 0.5, 3.4, 0, 7); ctx.fill(); ctx.strokeStyle = '#d8c070'; ctx.lineWidth = 0.9; ctx.stroke(); }
  // Kopf
  ctx.fillStyle = haut; ctx.beginPath(); ctx.arc(cx, cy - 1.2, 3.2, 0, 7); ctx.fill();
  if (t.hut === 'helm') { ctx.fillStyle = '#8a8e96'; ctx.beginPath(); ctx.arc(cx, cy - 1.4, 3.4, 0, 7); ctx.fill(); ctx.fillStyle = '#c4c8d0'; ctx.beginPath(); ctx.arc(cx - 0.8, cy - 2.2, 1.4, 0, 7); ctx.fill(); }
  else if (t.hut === 'kapuze') { ctx.fillStyle = css(hell(t.kopf, 1)); ctx.beginPath(); ctx.arc(cx, cy - 0.6, 3.6, 0, 7); ctx.fill(); ctx.fillStyle = '#d8a880'; ctx.beginPath(); ctx.arc(cx, cy - 3, 1.4, 0, 7); ctx.fill(); }
  else if (t.hut === 'stroh') { ctx.fillStyle = '#d8c070'; ctx.beginPath(); ctx.arc(cx, cy - 1.2, 4.8, 0, 7); ctx.fill(); ctx.fillStyle = '#b89848'; ctx.beginPath(); ctx.arc(cx, cy - 1.2, 2.6, 0, 7); ctx.fill(); }
  else { ctx.fillStyle = css(t.kopf); ctx.beginPath(); ctx.arc(cx, cy - 0.2, 3, Math.PI * 0.05, Math.PI * 0.95); ctx.fill(); ctx.beginPath(); ctx.arc(cx, cy - 0.6, 2.8, 0, 7); ctx.fill(); ctx.fillStyle = haut; ctx.beginPath(); ctx.arc(cx, cy - 2.4, 1.6, 0, 7); ctx.fill(); }
  return cv;
}

const figCache = new Map();
/** Bilder einer Figur: lauf[4], aktion[2], schatten. */
export function figurSprites(typ) {
  let s = figCache.get(typ);
  if (!s) {
    s = { lauf: [0, 1, 2, 3].map((p) => figurBild(typ, p, 0)), aktion: [figurBild(typ, 0, 0), figurBild(typ, 0, 1)] };
    figCache.set(typ, s);
  }
  return s;
}

let figSchatten = null;
export function figurSchatten() {
  if (!figSchatten) {
    figSchatten = canvas(FIG, FIG);
    const c = figSchatten.getContext('2d');
    c.fillStyle = 'rgba(0,0,0,0.28)'; c.beginPath(); c.ellipse(FIG / 2, FIG / 2 + 2, 7.5, 5.5, 0, 0, 7); c.fill();
  }
  return figSchatten;
}

/** Tiere: schaf / kuh, 2 Bilder (Kopf unten/oben fressend). */
const tierCache = new Map();
export function tierSprite(art, phase) {
  const key = art + phase;
  let cv = tierCache.get(key);
  if (cv) return cv;
  cv = canvas(FIG, FIG); const ctx = cv.getContext('2d');
  const cx = FIG / 2, cy = FIG / 2;
  if (art === 'schaf') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx + 1, cy + 2, 6, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8e4da';
    for (const [dx, dy] of [[-2, 2], [2, 2], [-2, -2], [2, -2], [0, 4], [0, 0]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, 3.4, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#2a2622'; ctx.beginPath(); ctx.ellipse(cx, cy - 7 + phase, 2.2, 2.8, 0, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx + 1, cy + 2, 6.5, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#f0ece4'; ctx.beginPath(); ctx.ellipse(cx, cy, 5.8, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a4a30'; ctx.beginPath(); ctx.ellipse(cx - 2, cy + 2, 2.6, 3.4, 0.4, 0, 7); ctx.fill(); ctx.beginPath(); ctx.ellipse(cx + 2.5, cy - 4, 2, 2.6, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a4030'; ctx.beginPath(); ctx.ellipse(cx, cy - 11 + phase, 2.8, 3.2, 0, 0, 7); ctx.fill();
  }
  tierCache.set(key, cv);
  return cv;
}

// ── Straßenbeläge (nahtlos kachelbar, 128 px = 2 Kacheln) ───────────────
const belagCache = new Map();
/** art: 'pflaster' | 'erde' | 'kies'. Gibt ein Canvas zurück, das sich nahtlos wiederholt. */
export function strassenBelag(art) {
  if (belagCache.has(art)) return belagCache.get(art);
  const S = 128, cv = canvas(S, S), ctx = cv.getContext('2d');
  const r = rnd(art === 'pflaster' ? 11 : art === 'erde' ? 22 : 33);
  // an allen Rändern spiegeln, damit die Kachel nahtlos ist
  const punkt = (x, y, f) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) f(x + dx, y + dy); };
  if (art === 'pflaster') {
    ctx.fillStyle = '#6e6458'; ctx.fillRect(0, 0, S, S);
    const st = 9;
    for (let y = 0, reihe = 0; y < S; y += st * 0.8, reihe++) {
      for (let x = (reihe % 2) * st / 2; x < S; x += st) {
        const f = 0.78 + r() * 0.36, w = r() * 3, ex = (r() - 0.5) * 1.5, ey = (r() - 0.5) * 1.5;
        punkt(x + ex, y + ey, (px, py) => {
          ctx.fillStyle = css(hell([162, 152, 134], f));
          ctx.beginPath(); ctx.ellipse(px, py, st * 0.42, st * 0.34, w, 0, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(px - 1, py - 1, st * 0.2, st * 0.14, w, 0, 7); ctx.fill();
        });
      }
    }
  } else if (art === 'erde') {
    ctx.fillStyle = '#9c8460'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = r() * S, y = r() * S, g = 1 + r() * 3.5, f = 0.8 + r() * 0.35;
      punkt(x, y, (px, py) => { ctx.fillStyle = css(hell([150, 126, 92], f), 0.55); ctx.beginPath(); ctx.ellipse(px, py, g, g * 0.7, r(), 0, 7); ctx.fill(); });
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S;
      punkt(x, y, (px, py) => { ctx.fillStyle = r() < 0.5 ? 'rgba(200,190,170,0.8)' : 'rgba(90,74,54,0.7)'; ctx.fillRect(px, py, 1.6, 1.6); });
    }
  } else {
    ctx.fillStyle = '#a89878'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 520; i++) {
      const x = r() * S, y = r() * S, f = 0.7 + r() * 0.5;
      punkt(x, y, (px, py) => { ctx.fillStyle = css(hell([176, 164, 140], f)); ctx.beginPath(); ctx.arc(px, py, 0.9 + r() * 1.3, 0, 7); ctx.fill(); });
    }
  }
  belagCache.set(art, cv);
  return cv;
}
