/**
 * lager.js — Waren liegen in echten Lagern (Speicher, Burg), nicht in einem unsichtbaren Topf.
 *
 * ZWECK:    Einlagern, Entnehmen (vom nächstgelegenen Lager zuerst), Summen je Herr, Umlagern.
 *           Runde 13: Die Burg ist das PRIVATE Lager des Herrn, solange sie gesperrt ist (g.gesperrt):
 *           - keine automatischen Lieferungen hinein (nur gezielt: Umlagern, Steuer),
 *           - die Stadt (Baumeister, Essen der Bürger, Brennholz) nimmt nichts heraus,
 *           - der Herr (Aufträge, Mauern, Rekruten, Sold, Garnison) nimmt ZUERST aus der Burg, dann aus der Stadt.
 *           Offen verhält sich die Burg wie jedes andere Lager.
 * LIEST:    z.gebaeude (art mit GEBAEUDE.lager), g.inhalt, g.gesperrt
 * SCHREIBT: g.inhalt, h.lager (= was die Stadt nutzen kann), h.privat (= Inhalt gesperrter Lager) — nur zum Lesen
 * REGEL:    Nie h.lager/h.privat direkt ändern — immer nehmen()/geben(). Danach wird neu summiert.
 *           wer = 'stadt' (Vorgabe) oder 'herr'. Brennt ein Speicher nieder, ist sein Inhalt verloren.
 */

import { GEBAEUDE, WAREN } from '../data/gebaeude.js';
import { abstand2 } from './lib.js';

export function leer() { const o = {}; for (const w of WAREN) o[w] = 0; return o; }

/** Fertige Lager eines Herrn; für die Stadt ohne gesperrte (private) Lager. */
export function lagerVon(z, herr, wer = 'herr') {
  return z.gebaeude.filter((g) => g.besitzer === herr && g.zustand === 'fertig' && GEBAEUDE[g.art].lager && (wer !== 'stadt' || !g.gesperrt));
}

export function summieren(z, herr) {
  const s = leer(), p = leer();
  for (const g of lagerVon(z, herr)) { const ziel = g.gesperrt ? p : s; for (const w of WAREN) ziel[w] += g.inhalt[w] || 0; }
  z.herren[herr].lager = s;
  z.herren[herr].privat = p;
  return s;
}

/**
 * Lager nach Abstand zu (x,y) sortiert (Gleichstand nach ID → deterministisch).
 * Für den Herrn kommen gesperrte (private) Lager zuerst — er zahlt aus seiner Kammer, bevor er die Stadt angreift.
 */
function sortiert(z, herr, x, y, wer) {
  return lagerVon(z, herr, wer).sort((a, b) => (wer === 'herr' ? (Number(!!b.gesperrt) - Number(!!a.gesperrt)) : 0)
    || (abstand2(a.x, a.y, x, y) - abstand2(b.x, b.y, x, y)) || (a.id - b.id));
}

/** Nimmt bis zu n Einheiten, nächstes Lager zuerst (wer: 'stadt' | 'herr'). Gibt die genommene Menge zurück. */
export function nehmen(z, herr, ware, n, x, y, wer = 'stadt') {
  let rest = n;
  for (const g of sortiert(z, herr, x, y, wer)) {
    if (rest <= 0) break;
    const m = Math.min(rest, g.inhalt[ware] || 0);
    g.inhalt[ware] -= m; rest -= m;
  }
  summieren(z, herr);
  return n - rest;
}

/**
 * Legt n Einheiten in ein bestimmtes Lager (gezielt — auch in die gesperrte Burg) oder, ohne Ziel, ins nächste
 * Lager, das die Stadt nutzt. WARUM nie automatisch in die gesperrte Burg: dorthin kommt nur, was der Herr einlagert.
 * Gibt es nur noch gesperrte Lager, landet die Ware dort (sonst ginge sie verloren).
 */
export function geben(z, herr, g, ware, n, x = 0, y = 0) {
  if (n <= 0) return;
  if (!g || g.zustand !== 'fertig' || !GEBAEUDE[g.art].lager) g = sortiert(z, herr, g ? g.x : x, g ? g.y : y, 'stadt')[0] || sortiert(z, herr, x, y, 'herr')[0];
  if (!g) return;
  g.inhalt[ware] = (g.inhalt[ware] || 0) + n;
  summieren(z, herr);
}

/** Nächstes Lager für Lieferungen der Betriebe (nie die gesperrte Burg, außer es gibt kein anderes). */
export function naechstesLager(z, herr, x, y) { return sortiert(z, herr, x, y, 'stadt')[0] || sortiert(z, herr, x, y, 'herr')[0] || null; }

/** Was steht zur Verfügung? Stadt: ohne private Lager; Herr: alles (Burg + Stadt). */
export function verfuegbar(h, ware, wer = 'stadt') { return (h.lager[ware] || 0) + (wer === 'herr' && h.privat ? h.privat[ware] || 0 : 0); }

/** Reicht der Bestand für diese Kosten? */
export function hatKosten(h, kosten, wer = 'stadt') {
  for (const w in kosten) if (verfuegbar(h, w, wer) < kosten[w]) return false;
  return true;
}
export function bezahleKosten(z, herr, kosten, x, y, wer = 'stadt') {
  for (const w in kosten) nehmen(z, herr, w, kosten[w], x, y, wer);
}
