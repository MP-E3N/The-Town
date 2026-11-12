/**
 * lager.js — Waren liegen in echten Lagern (Speicher, Burg), nicht in einem unsichtbaren Topf.
 *
 * ZWECK:    Einlagern, Entnehmen (vom nächstgelegenen Lager zuerst), Summen je Herr, Umlagern.
 * LIEST:    z.gebaeude (art mit GEBAEUDE.lager), g.inhalt
 * SCHREIBT: g.inhalt, h.lager (= Summe aller Lager, nur zum Lesen für Prüfungen/Anzeige)
 * REGEL:    Nie h.lager direkt ändern — immer nehmen()/geben(). h.lager wird danach neu summiert.
 *           Brennt ein Speicher nieder, ist sein Inhalt verloren.
 */

import { GEBAEUDE, WAREN } from '../data/gebaeude.js';
import { abstand2 } from './lib.js';

export function leer() { const o = {}; for (const w of WAREN) o[w] = 0; return o; }

export function lagerVon(z, herr) {
  return z.gebaeude.filter((g) => g.besitzer === herr && g.zustand === 'fertig' && GEBAEUDE[g.art].lager);
}

export function summieren(z, herr) {
  const s = leer();
  for (const g of lagerVon(z, herr)) for (const w of WAREN) s[w] += g.inhalt[w] || 0;
  z.herren[herr].lager = s;
  return s;
}

/** Lager nach Abstand zu (x,y) sortiert (bei Gleichstand nach ID → deterministisch). */
function sortiert(z, herr, x, y) {
  return lagerVon(z, herr).sort((a, b) => (abstand2(a.x, a.y, x, y) - abstand2(b.x, b.y, x, y)) || (a.id - b.id));
}

/** Nimmt bis zu n Einheiten, nächstes Lager zuerst. Gibt die genommene Menge zurück. */
export function nehmen(z, herr, ware, n, x, y) {
  let rest = n;
  for (const g of sortiert(z, herr, x, y)) {
    if (rest <= 0) break;
    const m = Math.min(rest, g.inhalt[ware] || 0);
    g.inhalt[ware] -= m; rest -= m;
  }
  summieren(z, herr);
  return n - rest;
}

/** Legt n Einheiten in ein bestimmtes Lager (oder das nächste zu x,y, wenn g fehlt/weg ist). */
export function geben(z, herr, g, ware, n, x = 0, y = 0) {
  if (n <= 0) return;
  if (!g || g.zustand !== 'fertig' || !GEBAEUDE[g.art].lager) g = sortiert(z, herr, g ? g.x : x, g ? g.y : y)[0];
  if (!g) return;
  g.inhalt[ware] = (g.inhalt[ware] || 0) + n;
  summieren(z, herr);
}

export function naechstesLager(z, herr, x, y) { return sortiert(z, herr, x, y)[0] || null; }

/** Reicht der Bestand (Summe) für diese Kosten? */
export function hatKosten(h, kosten) {
  for (const w in kosten) if ((h.lager[w] || 0) < kosten[w]) return false;
  return true;
}
export function bezahleKosten(z, herr, kosten, x, y) {
  for (const w in kosten) nehmen(z, herr, w, kosten[w], x, y);
}
