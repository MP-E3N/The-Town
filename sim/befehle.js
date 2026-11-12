/**
 * befehle.js — Alle Spieleraktionen als JSON-Befehle (Multiplayer-Schnittstelle).
 *
 * ZWECK:    Eingaben von UI/Netz in Zustandsänderungen übersetzen, mit Prüfung.
 * REGEL:    Jeder Befehl trägt `spieler` (= Index des Herrn). Werte werden geprüft und auf Ganzzahlen
 *           gebracht, weil sie später aus dem Netz kommen können.
 *
 * Befehle:
 *   {typ:'zone', zone:0..5, x, y, r}             Land ausschreiben (x,y Milli-Kacheln, r Kacheln 1..8)
 *   {typ:'bauen', art, x, y, w}                   Auftrag: kaserne | turm | schmiede | speicher
 *   {typ:'mauer', art:'palisade'|'mauer', ax, ay, bx, by}
 *   {typ:'abreissen', id}
 *   {typ:'steuer', stufe:0..2}
 *   {typ:'anwerben', an:bool}
 *   {typ:'sammeln', x, y} | {typ:'sammeln'}       Sammelpunkt der Garnison (ohne x = aufheben)
 *   {typ:'weiter'}                                nach dem Sieg weiterspielen
 *   {typ:'einheiten', ids:[…], aktion:'gehe'|'angriff'|'frei', x, y, ziel}   Soldaten führen (wie im RTS)
 *   {typ:'transfer', von, nach, ware, menge}      Waren zwischen zwei eigenen Lagern umlagern
 *   {typ:'produktion', id, produkt}               Waffenschmiede: 'speere' | 'boegen'
 *   {typ:'ausbildung', id, art}                   Burg/Kaserne: 'speer' | 'bogen' | 'aus'
 */

import { KARTE_B, KARTE_H, LAND_RADIUS } from '../data/werte.js';
import { GEBAEUDE, ZONEN, WAREN, SCHMIEDE_PRODUKTE, AUSBILDUNG } from '../data/gebaeude.js';
import { TEMPO } from '../data/werte.js';
import { wegGecached, pfadLaenge } from './pfad.js';
import { tuerKachel } from './baumeister.js';
import { summieren } from './lager.js';
import { karteFuer } from './karte.js';
import { pruefePlatz, gebaeudeAnlegen, bezahlen } from './baumeister.js';
import { toreSetzen } from './strassen.js';
import { geben } from './lager.js';
import { abstand, winkelVon, wnorm, meldung, SIN, COS } from './lib.js';

export const AUFTRAEGE = ['kaserne', 'turm', 'schmiede', 'speicher'];

const ganz = (v, a, b) => Math.max(a, Math.min(b, Math.trunc(Number(v) || 0)));

export function fehlendeKosten(h, art) {
  const kosten = GEBAEUDE[art].kosten || {};
  const fehlt = [];
  for (const w in kosten) if ((h.lager[w] || 0) < kosten[w]) fehlt.push(w);
  return fehlt;
}

/** Prüft einen Auftrag (für Vorschau und Befehl). null = möglich. */
export function auftragPruefen(z, herr, art, o) {
  if (!AUFTRAEGE.includes(art)) return 'unbekannt';
  const grund = pruefePlatz(z, herr, o, { strRand: 80, steilMax: Math.max(80, Math.floor(Math.max(o.b, o.t) / 30)) });
  if (grund) return grund;
  const fehlt = fehlendeKosten(z.herren[herr], art);
  if (fehlt.length) return 'zu wenig ' + fehlt.join(', ');
  return null;
}

export function befehlAnwenden(z, b) {
  const herr = ganz(b.spieler, 0, z.herren.length - 1);
  const h = z.herren[herr];
  if (!h) return;
  switch (b.typ) {
    case 'zone': {
      const zone = ganz(b.zone, 0, ZONEN.length - 1), r = ganz(b.r, 1, 8);
      const x = ganz(b.x, 0, KARTE_B * 1000 - 1), y = ganz(b.y, 0, KARTE_H * 1000 - 1);
      const k = karteFuer(z.seed), burg = z.gebaeude[h.burg];
      const tx = Math.floor(x / 1000), ty = Math.floor(y / 1000);
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r + r) continue;
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= KARTE_B || ny >= KARTE_H) continue;
        const i = ny * KARTE_B + nx;
        if (k.wasser[i]) continue;
        if (abstand(nx * 1000 + 500, ny * 1000 + 500, burg.x, burg.y) > LAND_RADIUS * 1000) continue;
        z.zone[i] = zone;
      }
      z.zonenVersion++;
      break;
    }
    case 'bauen': {
      const art = String(b.art);
      if (!AUFTRAEGE.includes(art)) return;
      const typ = GEBAEUDE[art];
      const o = { x: ganz(b.x, 0, KARTE_B * 1000), y: ganz(b.y, 0, KARTE_H * 1000), b: typ.b, t: typ.t, w: wnorm(ganz(b.w, -720, 720)) };
      const grund = auftragPruefen(z, herr, art, o);
      if (grund) { meldung(z, herr, `${typ.name} geht hier nicht: ${grund}.`, 'warn'); return; }
      bezahlen(z, herr, art, o.x, o.y);
      gebaeudeAnlegen(z, herr, art, o, { auftrag: true });
      meldung(z, herr, `${typ.name} in Auftrag gegeben.`, 'info');
      break;
    }
    case 'mauer': {
      const art = b.art === 'mauer' ? 'mauer' : 'palisade';
      const typ = GEBAEUDE[art];
      const ax = ganz(b.ax, 0, KARTE_B * 1000), ay = ganz(b.ay, 0, KARTE_H * 1000), bx = ganz(b.bx, 0, KARTE_B * 1000), by = ganz(b.by, 0, KARTE_H * 1000);
      const len = abstand(ax, ay, bx, by);
      if (len < 500 || len > 40000) return;
      const n = Math.ceil(len / typ.b), w = winkelVon(bx - ax, by - ay);
      let gebaut = 0, ausgelassen = 0, geld = 0;
      for (let i = 0; i < n; i++) {
        const x = ax + Math.trunc((bx - ax) * (2 * i + 1) / (2 * n)), y = ay + Math.trunc((by - ay) * (2 * i + 1) / (2 * n));
        const o = { x, y, b: Math.floor(len / n) + 80, t: typ.t, w };
        if (pruefePlatz(z, herr, o, { mauer: true, keineStrasse: false, steilMax: 150, felsOk: true })) { ausgelassen++; continue; }
        if (fehlendeKosten(h, art).length) { geld++; continue; }
        bezahlen(z, herr, art, o.x, o.y);
        gebaeudeAnlegen(z, herr, art, o, { auftrag: true, keinWeg: true });
        gebaut++;
      }
      toreSetzen(z);
      if (gebaut) meldung(z, herr, `${gebaut} Stück ${typ.name} in Auftrag${ausgelassen ? `, ${ausgelassen} übersprungen (belegt/Wasser)` : ''}${geld ? `, ${geld} fehlt Material` : ''}.`, 'info');
      else meldung(z, herr, `Keine ${typ.name} möglich${geld ? ': zu wenig Material' : ': Platz belegt oder Wasser'}.`, 'warn');
      break;
    }
    case 'abreissen': {
      const g = z.gebaeude[ganz(b.id, 0, z.gebaeude.length - 1)];
      if (!g || g.besitzer !== herr || g.zustand === 'weg' || g.art === 'burg' || g.art === 'platz') return;
      const kosten = GEBAEUDE[g.art].kosten || {};
      g.zustand = 'weg';
      for (const w in kosten) if (w !== 'gold') geben(z, herr, null, w, Math.floor(kosten[w] / 2), g.x, g.y);
      if (g.inhalt) for (const w in g.inhalt) geben(z, herr, null, w, g.inhalt[w], g.x, g.y);
      for (const id of g.felder) z.felder[id].weg = true;
      for (const u of z.einheiten) if (u.heim === g.id) u.heim = h.burg;
      z.version++;
      meldung(z, herr, `${GEBAEUDE[g.art].name} abgerissen.`, 'info');
      break;
    }
    case 'steuer': h.steuer = ganz(b.stufe, 0, 2); break;
    case 'einheiten': {
      const ids = Array.isArray(b.ids) ? b.ids.slice(0, 200).map((v) => ganz(v, 0, 1e9)) : [];
      const eigene = z.einheiten.filter((u) => u.art === 'soldat' && u.besitzer === herr && ids.includes(u.id)).sort((a, c) => a.id - c.id);
      if (!eigene.length) return;
      if (b.aktion === 'frei') { for (const u of eigene) u.befehl = null; return; }
      if (b.aktion === 'angriff') {
        const ziel = z.einheiten.find((e) => e.id === ganz(b.ziel, 0, 1e9) && e.art === 'raeuber');
        if (ziel) { for (const u of eigene) u.befehl = { typ: 'angriff', ziel: ziel.id }; return; }
      }
      // Aufstellung: Reihen zu je 5, Abstand 0,7 Kacheln, quer zur Marschrichtung
      const x = ganz(b.x, 0, KARTE_B * 1000), y = ganz(b.y, 0, KARTE_H * 1000);
      let mx = 0, my = 0;
      for (const u of eigene) { mx += u.x; my += u.y; }
      mx = Math.trunc(mx / eigene.length); my = Math.trunc(my / eigene.length);
      const w = winkelVon(x - mx, y - my), reihe = 5;
      eigene.forEach((u, i) => {
        const r = Math.floor(i / reihe), s = (i % reihe) - Math.floor((Math.min(reihe, eigene.length) - 1) / 2);
        const qx = Math.trunc(-SIN[w] * s * 700 / 1024), qy = Math.trunc(COS[w] * s * 700 / 1024);
        const lx = Math.trunc(-COS[w] * r * 700 / 1024), ly = Math.trunc(-SIN[w] * r * 700 / 1024);
        u.befehl = { typ: 'gehe', x: x + qx + lx, y: y + qy + ly };
        u.pfad = null;
      });
      break;
    }
    case 'transfer': {
      const von = z.gebaeude[ganz(b.von, 0, z.gebaeude.length - 1)], nach = z.gebaeude[ganz(b.nach, 0, z.gebaeude.length - 1)];
      const ware = String(b.ware);
      if (!von || !nach || von === nach || !WAREN.includes(ware)) return;
      for (const g of [von, nach]) if (g.besitzer !== herr || g.zustand !== 'fertig' || !GEBAEUDE[g.art].lager) return;
      const menge = Math.min(ganz(b.menge, 0, 100000), von.inhalt[ware] || 0);
      if (menge <= 0) { meldung(z, herr, `Im ${GEBAEUDE[von.art].name} liegt keine Ware dieser Art.`, 'warn'); return; }
      von.inhalt[ware] -= menge;
      summieren(z, herr);
      const pfad = wegGecached(z, tuerKachel(von), tuerKachel(nach), 'buerger');
      const laenge = pfad ? pfadLaenge(pfad) : abstand(von.x, von.y, nach.x, nach.y) * 13 / 10;
      const dauer = Math.max(15, Math.floor(laenge / TEMPO.traeger));
      // Je Träger höchstens 20; sie gehen kurz nacheinander los.
      for (let rest = menge, i = 0; rest > 0; i++) {
        const m = Math.min(20, rest); rest -= m;
        z.lieferungen.push({ id: z.naechsteLieferung++, herr, von: von.id, nach: nach.id, ware, menge: m, start: z.tick + i * 12, dauer, angekommen: false, umlagern: true });
      }
      meldung(z, herr, `${menge} ${ware} werden umgelagert.`, 'info');
      break;
    }
    case 'produktion': {
      const g = z.gebaeude[ganz(b.id, 0, z.gebaeude.length - 1)];
      if (!g || g.besitzer !== herr || g.art !== 'schmiede' || !SCHMIEDE_PRODUKTE[b.produkt]) return;
      g.produkt = b.produkt;
      break;
    }
    case 'ausbildung': {
      const g = z.gebaeude[ganz(b.id, 0, z.gebaeude.length - 1)];
      if (!g || g.besitzer !== herr || !GEBAEUDE[g.art].plaetze) return;
      if (b.art !== 'aus' && !AUSBILDUNG[b.art]) return;
      g.ausbildung = b.art;
      break;
    }
    case 'weiter': if (z.ergebnis && z.ergebnis.sieg) { z.ergebnis = null; z.siegGemeldet = true; } break;
    case 'anwerben': h.anwerben = !!b.an; break;
    case 'sammeln':
      h.sammelpunkt = (b.x === undefined || b.x === null) ? null : { x: ganz(b.x, 0, KARTE_B * 1000), y: ganz(b.y, 0, KARTE_H * 1000) };
      break;
  }
}
