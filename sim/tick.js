/**
 * tick.js — Ein Simulationsschritt in fester Reihenfolge.
 *
 * REGEL:    Befehle zuerst, dann Wirtschaft, Militär, Baumeister; danach Tick hochzählen und
 *           bei Tageswechsel den Tagesabschluss. Diese Reihenfolge nie ändern (Determinismus/Replays).
 */

import { TICKS_PRO_TAG, PLANUNG_TAKT } from '../data/werte.js';
import { befehlAnwenden } from './befehle.js';
import { wirtschaftTick, tagesabschluss } from './wirtschaft.js';
import { militaerTick } from './militaer.js';
import { planungsSchritt } from './baumeister.js';

export function tick(z, befehle) {
  for (const b of befehle) if (b.typ === 'weiter') befehlAnwenden(z, b);
  if (z.ergebnis) return;
  for (const b of befehle) if (b.typ !== 'weiter') befehlAnwenden(z, b);
  wirtschaftTick(z);
  militaerTick(z);
  if (z.tick % PLANUNG_TAKT === 50) for (let i = 0; i < z.herren.length; i++) planungsSchritt(z, i);
  z.tick++;
  if (z.tick % TICKS_PRO_TAG === 0) tagesabschluss(z);
}
