/**
 * bots.js — Einfache Spieler-Bots für Balance-Tests (laufen ohne Browser).
 *
 * ZWECK:    Prüfen, ob das Ziel (Stadt satt + 25 Mann) erreichbar ist und Nichtstun scheitert.
 * REGEL:    Bots senden nur Befehle (wie ein Spieler), lesen den Zustand.
 */

import { karteFuer } from '../sim/karte.js';
import { befehlAnwenden, auftragPruefen } from '../sim/befehle.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { LAND_RADIUS, KARTE_B, KARTE_H } from '../data/werte.js';
import { stadtStatus } from '../sim/baumeister.js';

/** Sucht in Ringen um (x,y) einen gültigen Platz für einen Auftrag. */
export function platzFuerAuftrag(z, art, x, y, rMax = 12) {
  const typ = GEBAEUDE[art];
  for (let r = 0; r <= rMax; r++) {
    for (let a = 0; a < 360; a += 30) {
      const px = x + Math.round(Math.cos(a * Math.PI / 180) * r * 1000), py = y + Math.round(Math.sin(a * Math.PI / 180) * r * 1000);
      for (const w of [0, 45, 90, 135]) {
        const o = { x: px, y: py, b: typ.b, t: typ.t, w };
        if (!auftragPruefen(z, 0, art, o)) return o;
      }
    }
  }
  return null;
}

/** Bestes Gebiet (Summe einer Kachel-Bewertung im Radius 4) im eigenen Land. */
function gebiet(z, wert, abstandMin = 6) {
  const k = karteFuer(z.seed), burg = z.gebaeude[z.herren[0].burg];
  let best = null, bw = -Infinity;
  for (let ty = 3; ty < KARTE_H - 3; ty += 2) for (let tx = 3; tx < KARTE_B - 3; tx += 2) {
    const d = Math.hypot(tx * 1000 - burg.x, ty * 1000 - burg.y) / 1000;
    if (d > LAND_RADIUS - 5 || d < abstandMin) continue;
    let w = 0;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) w += wert((ty + dy) * KARTE_B + tx + dx, k);
    w -= d * 2;
    if (w > bw) { bw = w; best = { x: tx * 1000 + 500, y: ty * 1000 + 500 }; }
  }
  return best;
}

const frei = (z, k, i) => !k.wasser[i] && !z.zone[i] && k.steil[i] < 45;

/** Kluger Bot: schreibt früh Acker/Weide/Forst/Bergbau/Wohnland aus, baut Schmiede, 2 Kasernen, Türme. */
export function klugerBot() {
  const plan = { schritt: 0 };
  return (z, senden) => {
    const tag = Math.floor(z.tick / 600);
    const h = z.herren[0], burg = z.gebaeude[h.burg], markt = z.gebaeude[h.markt];
    const k = karteFuer(z.seed);
    // Je Tick ein Zonen-Befehl, damit jede Suche die vorige Zone schon sieht.
    if (plan.schritt === 0) {
      const z0 = plan.zonen = plan.zonen || 0;
      const aufgaben = [
        () => gebiet(z, (i, kk) => frei(z, kk, i) && z.wald[i] < 50 ? kk.frucht[i] : -30) && { zone: 2, ...gebiet(z, (i, kk) => frei(z, kk, i) && z.wald[i] < 50 ? kk.frucht[i] : -30), r: 6 },
        () => ({ zone: 2, ...gebiet(z, (i, kk) => frei(z, kk, i) && z.wald[i] < 50 ? kk.frucht[i] : -30), r: 6 }),
        () => ({ zone: 3, ...gebiet(z, (i, kk) => frei(z, kk, i) && z.wald[i] < 50 ? 40 + kk.frucht[i] / 3 : -30), r: 5 }),
        () => ({ zone: 5, x: k.steinOrt.x, y: k.steinOrt.y, r: 4 }),
        () => ({ zone: 5, x: k.erzOrt.x, y: k.erzOrt.y, r: 4 }),
        () => ({ zone: 4, ...gebiet(z, (i) => (z.zone[i] ? -60 : z.wald[i]), 4), r: 4 }),
        () => ({ zone: 1, x: markt.x + (markt.x > burg.x ? 5000 : -5000), y: markt.y + 4000, r: 5 }),
        () => ({ zone: 1, x: markt.x, y: markt.y - 5000, r: 4 }),
      ];
      const a = aufgaben[z0]();
      if (a && a.x !== undefined) senden({ typ: 'zone', ...a });
      plan.zonen++;
      if (plan.zonen >= aufgaben.length) plan.schritt = 1;
    }
    if (plan.schritt === 1 && tag >= 1) {
      const o = platzFuerAuftrag(z, 'schmiede', markt.x, markt.y, 16);
      if (o) { senden({ typ: 'bauen', art: 'schmiede', ...o }); plan.schritt = 2; return; }
    }
    if (plan.schritt === 2 && h.lager.stein >= 20 && h.lager.gold >= 40 && h.lager.holz >= 30) {
      const o = platzFuerAuftrag(z, 'kaserne', (burg.x + markt.x) / 2, (burg.y + markt.y) / 2, 18);
      if (o) { senden({ typ: 'bauen', art: 'kaserne', ...o }); plan.schritt = 3; return; }
    }
    if (plan.schritt === 3 && h.lager.stein >= 15 && h.lager.holz >= 10) {
      const hof = z.gebaeude.find((g) => g.art === 'hof' && g.zustand === 'fertig');
      const o = hof && platzFuerAuftrag(z, 'turm', hof.x, hof.y, 8);
      if (o) senden({ typ: 'bauen', art: 'turm', ...o });
      plan.schritt = 4;
      return;
    }
    if (plan.schritt === 4 && h.lager.stein >= 20 && h.lager.gold >= 40 && h.lager.holz >= 40) {
      const st = stadtStatus(z, 0);
      if (st.soldaten >= st.plaetze - 6) {
        const o = platzFuerAuftrag(z, 'kaserne', markt.x, markt.y, 18);
        if (o) { senden({ typ: 'bauen', art: 'kaserne', ...o }); plan.schritt = 5; return; }
      }
    }
    if (plan.schritt >= 2 && z.tick % 600 === 300) {
      // Mehr Land, wenn der Baumeister klagt
      const klage = z.ereignisse.filter((e) => e.typ === 'meldung' && e.tick > z.tick - 600 && /Kein Platz|Vorräte reichen/.test(e.text));
      if (klage.some((e) => /Bauernhof|Vorräte/.test(e.text))) {
        const a = gebiet(z, (i, kk) => frei(z, kk, i) && z.wald[i] < 50 ? kk.frucht[i] : -30);
        if (a) senden({ typ: 'zone', zone: 2, x: a.x, y: a.y, r: 6 });
      }
      if (klage.some((e) => /Wohnhaus/.test(e.text))) {
        const a = gebiet(z, (i, kk) => frei(z, kk, i) ? 30 - Math.hypot((i % KARTE_B) * 1000 - markt.x, Math.floor(i / KARTE_B) * 1000 - markt.y) / 1000 : -30, 3);
        if (a) senden({ typ: 'zone', zone: 1, x: a.x, y: a.y, r: 4 });
      }
    }
  };
}

/** Nichtstun-Bot. */
export function nichtsBot() { return () => {}; }
