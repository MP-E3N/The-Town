/**
 * lokal.js — Einzelspieler-Verbindung. Gleiche Schnittstelle wie eine spätere Netz-Verbindung.
 *
 * ZWECK:    Befehle sammeln und mit dem nächsten Tick ausführen; Pause und Tempo verwalten.
 * SCHREIBT: den Zustand, nur über sim/tick.js und sim/befehle.js
 * REGEL:    UI/Eingabe rufen nur verbindung.senden(). Niemand außer der Verbindung ruft tick().
 *           Aufnahme {tick, befehl}: wird beim Abspielen im tick()-Aufruf angewendet, der bei z.tick === T startet.
 */

import { tick } from '../sim/tick.js';
import { befehlAnwenden } from '../sim/befehle.js';

export function lokaleVerbindung(zustand) {
  let warteschlange = [];
  const v = {
    spieler: 0, zustand, pause: true, tempo: 1, aufnahme: [],
    senden(b) {
      // WARUM hier: im Netz setzt der Server die Spielernummer, nie der Client selbst.
      const befehl = { ...b, spieler: v.spieler };
      v.aufnahme.push({ tick: v.zustand.tick, befehl });
      if (v.pause) befehlAnwenden(v.zustand, befehl);
      else warteschlange.push(befehl);
    },
    schritt() {
      const b = warteschlange; warteschlange = [];
      tick(v.zustand, b);
    },
  };
  return v;
}

/** Spielt eine Aufnahme ab (Tests, Desync-Suche). */
export function abspielen(z, aufnahme, bisTick) {
  let i = 0;
  while (z.tick < bisTick && !z.ergebnis) {
    const jetzt = [];
    while (i < aufnahme.length && aufnahme[i].tick <= z.tick) jetzt.push(aufnahme[i++].befehl);
    tick(z, jetzt);
  }
}
