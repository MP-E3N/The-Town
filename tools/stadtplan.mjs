/**
 * stadtplan.mjs — Werkzeug des Stadtplaners: Stadt als Textkarte + Kennzahlen.
 *
 * Aufruf:  node tools/stadtplan.mjs [seed=42] [tage=0] [bot=0|1]
 * Zeigt:   Kartenausschnitt um den Markt (Legende unten) und Kennzahlen zur Straßen- und Bebauungsgüte.
 * ZWECK:   Gelände lesen lernen und Änderungen am Planer messbar machen (vorher/nachher vergleichen).
 */

import { erzeugeZustand } from '../sim/zustand.js';
import { tick } from '../sim/tick.js';
import { abgeleitet } from '../sim/abgeleitet.js';
import { karteFuer } from '../sim/karte.js';
import { stadtStatus } from '../sim/baumeister.js';
import { klugerBot } from '../tests/bots.js';
import { KARTE_B, KARTE_H } from '../data/werte.js';

const seed = Number(process.argv[2] || 42), tage = Number(process.argv[3] || 0), mitBot = process.argv[4] === '1';
const z = erzeugeZustand(seed);
const bot = mitBot ? klugerBot() : null;
for (let i = 0; i < tage * 600 && !z.ergebnis; i++) {
  const b = [];
  if (bot) bot(z, (x) => b.push({ ...x, spieler: 0 }));
  tick(z, b);
}
const c = abgeleitet(z), k = karteFuer(seed);
const m = z.gebaeude[z.herren[0].markt];
const mx = Math.floor(m.x / 1000), my = Math.floor(m.y / 1000);
let s = '';
for (let y = Math.max(0, my - 18); y < Math.min(KARTE_H, my + 18); y++) {
  for (let x = Math.max(0, mx - 32); x < Math.min(KARTE_B, mx + 32); x++) {
    const i = y * KARTE_B + x;
    let ch = '.';
    if (c.strasse[i]) ch = k.wasser[i] ? 'B' : '=';
    else if (c.belegt[i]) { const g = z.gebaeude[c.belegt[i] - 1]; ch = g.art === 'haus' ? (g.wohn === 8 ? 'H' : 'h') : g.art === 'burg' ? '#' : g.art[0].toUpperCase(); }
    else if (c.mauer[i]) ch = 'M';
    else if (c.feld[i]) ch = 'f';
    else if (k.wasser[i]) ch = '~';
    else if (z.zone[i] === 1) ch = 'w';
    else if (k.steil[i] > 45) ch = '^';
    else if (z.wald[i] >= 50) ch = 'T';
    s += ch;
  }
  s += '\n';
}
console.log(s);
console.log('Legende: = Straße  B Brücke  H Bürgerhaus  h Wohnhaus  # Burg  P Platz  R Rathaus  K Kirche/Kaserne  f Feld  w freies Wohnland  ^ steil  T Wald  ~ Wasser\n');

// Kennzahlen
let laenge = 0, knicke = 0, sackgassen = 0, sackWohn = 0;
const enden = [];
for (const st of z.strassen) {
  const p = st.punkte;
  for (let i = 0; i + 3 < p.length; i += 2) laenge += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]) / 1000;
  for (let i = 2; i + 3 < p.length; i += 2) {
    const a1 = Math.atan2(p[i + 1] - p[i - 1], p[i] - p[i - 2]), a2 = Math.atan2(p[i + 3] - p[i + 1], p[i + 2] - p[i]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > 0.35) knicke++;
  }
  enden.push([p[p.length - 2], p[p.length - 1], st.art, st]);
}
for (const [x, y, art, eigene] of enden) {
  if (art !== 'gasse') continue; // Feldwege zu Höfen dürfen enden
  const tx = Math.floor(x / 1000), ty = Math.floor(y / 1000);
  let andere = 0;
  for (const st of z.strassen) {
    if (st === eigene) continue;
    const p = st.punkte;
    for (let i = 0; i + 3 < p.length; i += 2) {
      const dx = p[i + 2] - p[i], dy = p[i + 3] - p[i + 1], l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - p[i]) * dx + (y - p[i + 1]) * dy) / l2));
      if (Math.hypot(x - p[i] - dx * t, y - p[i + 1] - dy * t) < st.breite / 2 + 600) { andere++; break; }
    }
  }
  if (!andere) { sackgassen++; if (z.zone[ty * KARTE_B + tx] === 1) sackWohn++; }
}
const st = stadtStatus(z, 0);
let wohnland = 0, wohnFrei = 0;
for (let i = 0; i < z.zone.length; i++) if (z.zone[i] === 1) { wohnland++; if (!c.belegt[i] && !c.strasse[i]) wohnFrei++; }
console.log(`Tag ${Math.floor(z.tick / 600)} · Straßen ${z.strassen.length} (${laenge.toFixed(0)} Kacheln) · scharfe Knicke ${knicke} (${(knicke / Math.max(1, laenge) * 10).toFixed(2)} je 10 Kacheln) · Gassen-Sackgassen ${sackgassen} (im Wohnland ${sackWohn})`);
console.log(`Häuser ${st.haeuser} · Wohnplätze ${st.wohnKap} · Wohnland ${wohnland} Kacheln, davon unbebaut ${wohnFrei} · Dichte ${(st.wohnKap / Math.max(1, wohnland - wohnFrei)).toFixed(2)} Plätze je bebauter Kachel`);
console.log('Baumeister:', z.herren[0].planLog.slice(-6).join(' | '));
