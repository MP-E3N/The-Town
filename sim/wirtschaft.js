/**
 * wirtschaft.js — Arbeit, Produktion, Felder, Träger, Baustellen, Anwerben, Tagesabschluss.
 *
 * ZWECK:    Die Stadt lebt: Arbeiter werden verteilt, Waren entstehen und werden getragen,
 *           einmal am Tag wird gegessen, geheizt, Steuer und Sold verrechnet, Leute ziehen zu/weg.
 * LIEST:    Karte, abgeleitete Raster, data/*
 * SCHREIBT: z.gebaeude (Zustände), z.felder, z.lieferungen, z.herren (Lager, Bewohner, Laune), z.wald
 * REGEL:    Arbeiterverteilung nach GEBAEUDE.gruppe: Nahrung → Holz → Baustellen → Stein → Eisen → Schmiede.
 */

import {
  TICKS_PRO_TAG, TAGE_PRO_JAHRESZEIT, KARTE_B, KARTE_H, TRAGEN, FELD, WALD, BEDARF, STEUER, ZUZUG,
  MILITAER, ZIEL, NIEDERLAGE_BEWOHNER, TEMPO, WAGEN,
} from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { karteFuer } from './karte.js';
import { abgeleitet } from './abgeleitet.js';
import { wegGecached, pfadLaenge } from './pfad.js';
import { tuer, tuerKachel, stadtStatus } from './baumeister.js';
import { abstand, datum, ereignis, meldung, kachel } from './lib.js';
import { neuerSoldat, soldatenVon } from './militaer.js';

const JAHR = TICKS_PRO_TAG * TAGE_PRO_JAHRESZEIT * 4;
const WINTER_START = TICKS_PRO_TAG * TAGE_PRO_JAHRESZEIT * 3;

export function jahreszeit(z) { return datum(z.tick).jahreszeit; }

/** Darf noch gesät werden (reicht die Zeit bis zum Winter)? */
export function saeenErlaubt(z) {
  const imJahr = z.tick % JAHR;
  return imJahr < WINTER_START && WINTER_START - imJahr >= FELD.reifeTicks;
}

function feldAufgabe(z, g) {
  if (g.aufgabeFeld >= 0) {
    const f = z.felder[g.aufgabeFeld];
    if (f && !f.weg && (f.phase === 'reif' || (f.phase === 'brach' && saeenErlaubt(z)))) return f;
    g.aufgabeFeld = -1; g.aufgabe = 0;
  }
  for (const id of g.felder) { const f = z.felder[id]; if (!f.weg && f.phase === 'reif') { g.aufgabeFeld = id; return f; } }
  if (saeenErlaubt(z)) for (const id of g.felder) { const f = z.felder[id]; if (!f.weg && f.phase === 'brach') { g.aufgabeFeld = id; return f; } }
  return null;
}

/** Braucht das Gebäude gerade Arbeiter? */
function hatArbeit(z, g, h) {
  const typ = GEBAEUDE[g.art];
  if (g.art === 'hof') return !!feldAufgabe(z, g);
  if (g.puffer >= TRAGEN * 2) return false;
  if (g.art === 'schmiede' && !g.material && (h.lager.holz < 1 || h.lager.eisen < 1)) return false;
  if (g.blockiert && z.tick % 600 !== 0) return false;
  return !!typ.arbeiter;
}

export function arbeitVerteilen(z, herr) {
  const h = z.herren[herr];
  let frei = h.bewohner;
  const betriebe = [], baustellen = [];
  for (const g of z.gebaeude) {
    if (g.besitzer !== herr || g.zustand === 'weg') continue;
    g.belegt = 0;
    if (g.zustand === 'bau') baustellen.push(g);
    else if (GEBAEUDE[g.art].arbeiter) betriebe.push(g);
  }
  betriebe.sort((a, b) => (GEBAEUDE[a.art].gruppe - GEBAEUDE[b.art].gruppe) || (a.id - b.id));
  baustellen.sort((a, b) => (Number(b.auftrag) - Number(a.auftrag)) || (a.id - b.id));
  const besetze = (g) => {
    if (!hatArbeit(z, g, h)) return;
    const n = Math.min(GEBAEUDE[g.art].arbeiter, frei);
    g.belegt = n; frei -= n;
  };
  for (const g of betriebe) if (GEBAEUDE[g.art].gruppe <= 1) besetze(g);
  for (const g of baustellen) {
    const n = Math.min(GEBAEUDE[g.art].auftrag ? 3 : 2, frei);
    g.belegt = n; frei -= n;
  }
  for (const g of betriebe) if (GEBAEUDE[g.art].gruppe > 1) besetze(g);
  h.arbeitslos = frei;
}

function naechstesLager(z, g) {
  let best = null, bd = Infinity;
  for (const s of z.gebaeude) {
    if (s.besitzer !== g.besitzer || s.zustand !== 'fertig') continue;
    if (s.art !== 'speicher' && s.art !== 'burg') continue;
    const d = abstand(g.x, g.y, s.x, s.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function startLieferung(z, g, ware) {
  const ziel = naechstesLager(z, g);
  if (!ziel) return;
  const wagen = g.art === 'hof';
  const menge = Math.min(wagen ? WAGEN.menge : TRAGEN, g.puffer);
  const pfad = wegGecached(z, tuerKachel(g), tuerKachel(ziel), 'buerger');
  const a = tuer(g), b = tuer(ziel);
  const laenge = pfad ? pfadLaenge(pfad) : Math.floor(abstand(a.x, a.y, b.x, b.y) * 13 / 10);
  const dauer = Math.max(15, Math.floor(laenge / TEMPO.traeger));
  g.puffer -= menge;
  g.seitLieferung = 0;
  const l = { id: z.naechsteLieferung++, herr: g.besitzer, von: g.id, nach: ziel.id, ware, menge, start: z.tick, dauer, angekommen: false, wagen };
  z.lieferungen.push(l);
  g.traeger++;
}

/** Fällt einen Baum in Reichweite des Holzfällers. */
function baumFaellen(z, g) {
  const tx = Math.floor(g.x / 1000), ty = Math.floor(g.y / 1000);
  const c = abgeleitet(z);
  let best = -1, bd = Infinity;
  for (let dy = -WALD.radius; dy <= WALD.radius; dy++) for (let dx = -WALD.radius; dx <= WALD.radius; dx++) {
    const x = tx + dx, y = ty + dy;
    if (x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
    const i = y * KARTE_B + x;
    if (z.wald[i] < 25 || c.belegt[i]) continue;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return -1;
  z.wald[best] = Math.max(0, z.wald[best] - WALD.proHolz);
  return best;
}

function produktion(z) {
  const jz = jahreszeit(z);
  for (const g of z.gebaeude) {
    if (g.zustand !== 'fertig') continue;
    const typ = GEBAEUDE[g.art];
    if (!typ.ware) continue;
    const h = z.herren[g.besitzer];
    g.seitLieferung++;
    if (g.art === 'hof') hofArbeit(z, g);
    else if (g.belegt > 0 && g.puffer < TRAGEN * 2) {
      if (g.art === 'schmiede' && !g.material) {
        if (h.lager.holz >= 1 && h.lager.eisen >= 1) { h.lager.holz--; h.lager.eisen--; g.material = 1; } else continue;
      }
      g.fortschritt += g.belegt;
      let tpe = typ.ticksProEinheit;
      if (g.art === 'fischer' && jz === 3) tpe *= 3;
      if (g.fortschritt >= tpe) {
        g.fortschritt -= tpe;
        if (g.art === 'holzfaeller') {
          const baum = baumFaellen(z, g);
          if (baum < 0) {
            g.blockiert = 'keine Bäume in Reichweite'; g.fortschritt = 0;
            meldung(z, g.besitzer, 'Ein Holzfäller findet keine Bäume mehr – schreib Forst in Waldnähe aus.', 'warn', 'baum' + g.id, 6000);
            continue;
          }
          g.blockiert = '';
          ereignis(z, { typ: 'baum', kachel: baum, von: g.id });
        }
        if (g.art === 'schmiede') g.material = 0;
        g.puffer++;
      }
    }
    const maxTraeger = g.art === 'hof' ? WAGEN.anzahl : 1;
    if (g.traeger < maxTraeger && (g.puffer >= TRAGEN || (g.puffer > 0 && g.seitLieferung > 400))) startLieferung(z, g, typ.ware);
  }
}

function hofArbeit(z, g) {
  if (g.belegt <= 0) return;
  const f = feldAufgabe(z, g);
  if (!f) return;
  g.aufgabe += g.belegt;
  const noetig = f.phase === 'reif' ? FELD.ernteArbeit : FELD.saeArbeit;
  if (g.aufgabe < noetig) return;
  g.aufgabe = 0; g.aufgabeFeld = -1;
  if (f.phase === 'reif') {
    const k = karteFuer(z.seed);
    const fr = k.frucht[kachel(f.x, f.y)];
    g.puffer += Math.floor(FELD.ertrag * (60 + fr) / 100);
    f.phase = 'brach'; f.stand = 0;
    ereignis(z, { typ: 'ernte', feld: f.id });
  } else {
    f.phase = 'wachsend'; f.stand = 0;
  }
}

function felderWachsen(z) {
  if (jahreszeit(z) === 3) return;
  for (const f of z.felder) {
    if (f.weg || f.phase !== 'wachsend') continue;
    f.stand++;
    if (f.stand >= FELD.reifeTicks) f.phase = 'reif';
  }
}

function lieferungen(z) {
  let raus = false;
  for (const l of z.lieferungen) {
    if (!l.angekommen && z.tick >= l.start + l.dauer) {
      l.angekommen = true;
      const h = z.herren[l.herr];
      const ziel = z.gebaeude[l.nach];
      if (ziel && ziel.zustand === 'fertig') {
        h.lager[l.ware] += l.menge;
        h.heute[l.ware] = (h.heute[l.ware] || 0) + l.menge;
      }
    }
    if (z.tick >= l.start + 2 * l.dauer) {
      const g = z.gebaeude[l.von];
      if (g && g.traeger > 0) g.traeger--;
      l.fertig = true; raus = true;
    }
  }
  if (raus) z.lieferungen = z.lieferungen.filter((l) => !l.fertig);
}

function baustellen(z) {
  for (const g of z.gebaeude) {
    if (g.zustand !== 'bau' || g.belegt <= 0) continue;
    const typ = GEBAEUDE[g.art];
    g.arbeit += g.belegt;
    g.hp = Math.floor(g.hpMax / 4 + (g.hpMax * 3 / 4) * Math.min(1, g.arbeit / typ.arbeit));
    if (g.arbeit >= typ.arbeit) {
      g.zustand = 'fertig'; g.hp = g.hpMax; g.belegt = 0;
      z.version++;
      if (typ.auftrag && !typ.mauer) meldung(z, g.besitzer, `${typ.name} ist fertig.`, 'gut');
      ereignis(z, { typ: 'fertig', id: g.id });
    }
  }
}

function anwerben(z) {
  for (const g of z.gebaeude) {
    if (g.zustand !== 'fertig') continue;
    const typ = GEBAEUDE[g.art];
    if (!typ.plaetze) continue;
    const h = z.herren[g.besitzer];
    if (g.anwerbung > 0) {
      g.anwerbung++;
      if (g.anwerbung >= MILITAER.anwerben.ticks) {
        g.anwerbung = 0;
        neuerSoldat(z, g.besitzer, g);
        const n = soldatenVon(z, g.besitzer);
        meldung(z, g.besitzer, `Ein Rekrut tritt in ${typ.name} an (Garnison ${n}).`, 'gut', 'rekrut', 200);
      }
      continue;
    }
    if (!h.anwerben) continue;
    let drin = 0;
    for (const u of z.einheiten) if (u.art === 'soldat' && u.heim === g.id) drin++;
    if (drin >= typ.plaetze) continue;
    const a = MILITAER.anwerben;
    const satt = vorratReicht(z, g.besitzer, stadtStatus(z, g.besitzer), 1);
    if (!satt) {
      meldung(z, g.besitzer, 'Anwerben pausiert: Der Vorrat reicht nicht bis zur nächsten Ernte.', 'warn', 'rekrutNahrung', 4000);
    } else if (h.lager.waffen >= a.waffen && h.lager.gold >= a.gold && h.arbeitslos >= 1 && h.bewohner > NIEDERLAGE_BEWOHNER + 2) {
      h.lager.waffen -= a.waffen; h.lager.gold -= a.gold;
      h.bewohner--; h.arbeitslos--;
      g.anwerbung = 1;
    } else if (h.lager.waffen < a.waffen) {
      meldung(z, g.besitzer, 'Anwerben stockt: keine Waffen im Lager (Waffenschmiede + Erz).', 'warn', 'waffen', 4000);
    } else if (h.arbeitslos < 1) {
      meldung(z, g.besitzer, 'Anwerben stockt: niemand ohne Arbeit – es braucht mehr Bewohner.', 'warn', 'rekrutLeute', 4000);
    }
  }
}

/** Wald wächst nach, Holzfäller forsten im Forst auf. */
function waldWachsen(z) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  for (let i = 0; i < z.wald.length; i++) {
    if (z.wald[i] > 0 && z.wald[i] < k.waldStart[i] && !c.belegt[i]) z.wald[i] = Math.min(k.waldStart[i], z.wald[i] + WALD.nachwachsen);
  }
  for (const g of z.gebaeude) {
    if (g.art !== 'holzfaeller' || g.zustand !== 'fertig') continue;
    const tx = Math.floor(g.x / 1000), ty = Math.floor(g.y / 1000);
    let gepflanzt = 0;
    for (let r = 2; r <= 5 && gepflanzt < 3; r++) {
      for (let dy = -r; dy <= r && gepflanzt < 3; dy++) for (let dx = -r; dx <= r && gepflanzt < 3; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= KARTE_B || y >= KARTE_H) continue;
        const i = y * KARTE_B + x;
        if (z.zone[i] !== 4 || k.wasser[i] || c.belegt[i] || c.strasse[i] || c.feld[i] || k.fels[i] > 40 || z.wald[i] >= 100) continue;
        if (z.wald[i] >= 75 && (dx + dy + z.tick) % 3) continue;
        z.wald[i] = Math.min(100, z.wald[i] + WALD.aufforsten); gepflanzt++;
      }
    }
  }
}

/** Einmal am Tag: essen, heizen, Steuer/Sold, Bedürfnisse, Laune, Zuzug/Wegzug, Sieg/Niederlage. */
export function tagesabschluss(z) {
  const d = datum(z.tick);
  // Winteranfang: Ernte auf dem Feld verdirbt.
  if (d.jahreszeit === 3 && d.tagInZeit === 0) {
    let verdorben = 0;
    for (const f of z.felder) if (!f.weg && f.art === 'acker' && f.phase !== 'brach') { if (f.phase === 'reif') verdorben++; f.phase = 'brach'; f.stand = 0; }
    for (let i = 0; i < z.herren.length; i++) {
      meldung(z, i, verdorben ? `Winter! ${verdorben} reife Felder wurden nicht geerntet und verderben.` : 'Der Winter beginnt. Jetzt zählt, was im Speicher liegt – und Brennholz.', verdorben ? 'warn' : 'info');
    }
  }
  if (d.jahreszeit === 0 && d.tagInZeit === 0 && d.tag > 0) for (let i = 0; i < z.herren.length; i++) meldung(z, i, 'Frühling: Die Bauern säen aus.', 'info');
  waldWachsen(z);
  for (let herr = 0; herr < z.herren.length; herr++) tagFuerHerr(z, herr, d);
}

function tagFuerHerr(z, herr, d) {
  const h = z.herren[herr];
  const st = stadtStatus(z, herr);
  const soldaten = st.soldaten;
  // Nahrung: Soldaten zuerst
  const essen = h.bewohner + soldaten;
  const gegessen = Math.min(h.lager.nahrung, essen);
  h.lager.nahrung -= gegessen;
  const nahrung = essen ? Math.floor(gegessen * 100 / essen) : 100;
  const hungernde = Math.max(0, essen - gegessen);
  // Wärme
  const bewohnteHaeuser = Math.min(st.haeuser, Math.ceil(h.bewohner / 5));
  const holzBedarf = Math.ceil(bewohnteHaeuser * BEDARF.brennholzFaktor[d.jahreszeit] / 2);
  const geheizt = Math.min(h.lager.holz, holzBedarf);
  h.lager.holz -= geheizt;
  const waerme = holzBedarf ? Math.floor(geheizt * 100 / holzBedarf) : 100;
  // Unterkunft
  const wohnen = h.bewohner ? Math.min(100, Math.floor(st.wohnKap * 100 / h.bewohner)) : 100;
  // Sicherheit
  const soll = Math.max(1, Math.ceil(h.bewohner / BEDARF.bewohnerProSoldat));
  const garn = Math.min(100, Math.floor(soldaten * 100 / soll));
  let gedeckt = 0, haeuser = 0;
  const schuetzer = z.gebaeude.filter((g) => g.besitzer === herr && g.zustand === 'fertig' && (g.art === 'turm' || g.art === 'burg' || g.art === 'kaserne'));
  for (const g of z.gebaeude) {
    if (g.besitzer !== herr || g.zustand !== 'fertig' || g.art !== 'haus') continue;
    haeuser++;
    if (schuetzer.some((s) => abstand(s.x, s.y, g.x, g.y) <= BEDARF.turmSchutzRadius)) gedeckt++;
  }
  const deckung = haeuser ? Math.floor(gedeckt * 100 / haeuser) : 100;
  const sicherheit = Math.max(0, Math.min(100, Math.floor(garn * 55 / 100) + Math.floor(deckung * 30 / 100) + Math.min(15, st.mauern) - h.ueberfallMalus));
  h.ueberfallMalus = Math.max(0, h.ueberfallMalus - BEDARF.ueberfallMalusAbbau);
  h.beduerfnisse = { nahrung, wohnen, waerme, sicherheit };
  const gw = BEDARF.gewicht;
  const ziel = Math.floor((nahrung * gw.nahrung + wohnen * gw.wohnen + waerme * gw.waerme + sicherheit * gw.sicherheit) / 100) + STEUER[h.steuer].laune;
  const diff = ziel - h.laune;
  h.laune = Math.max(0, Math.min(100, h.laune + (diff > 0 ? Math.ceil(diff / 3) : Math.floor(diff / 3))));
  // Gold
  const steuer = Math.floor(h.bewohner / STEUER[h.steuer].teiler);
  const sold = Math.ceil(soldaten / MILITAER.soldTeiler);
  h.lager.gold += steuer - sold;
  h.gestern = { ...h.heute, steuer, sold, gegessen, geheizt, holzBedarf, essen };
  h.heute = {};
  if (h.lager.gold < 0) {
    h.lager.gold = 0;
    const s = z.einheiten.find((u) => u.art === 'soldat' && u.besitzer === herr);
    if (s) { s.hp = 0; s.desertiert = true; h.bewohner++; meldung(z, herr, 'Kein Sold in der Kasse: ein Soldat desertiert.', 'schlecht'); }
  }
  // Bevölkerung
  let weg = 0, neu = 0;
  if (hungernde > 0) {
    weg += Math.ceil(hungernde / 3);
    meldung(z, herr, `Hunger! ${hungernde} Mäuler blieben leer.`, 'schlecht');
  }
  if (h.laune < ZUZUG.wegzugUnter) weg += 1 + Math.floor((ZUZUG.wegzugUnter - h.laune) / 8);
  if (h.bewohner > st.wohnKap + 5) weg += Math.floor((h.bewohner - st.wohnKap) / 5);
  const frei = st.wohnKap - h.bewohner;
  // WARUM Vorrat: Zuzügler kommen nur, wenn der Vorrat bis zur nächsten Ernte reicht.
  if (!weg && h.laune >= ZUZUG.abLaune && frei > 0 && vorratReicht(z, herr, st, 5)) {
    neu = Math.min(frei, 1 + Math.floor((h.laune - ZUZUG.abLaune) / 10), ZUZUG.maxProTag);
  }
  weg = Math.min(weg, h.bewohner);
  h.bewohner += neu - weg;
  if (neu) ereignis(z, { typ: 'zuzug', herr, n: neu });
  if (weg) { ereignis(z, { typ: 'wegzug', herr, n: weg }); if (!hungernde) meldung(z, herr, `${weg} Bewohner verlassen die Stadt.`, 'schlecht', 'wegzug', 1200); }
  const reichweite = essen ? Math.floor(h.lager.nahrung / Math.max(1, essen - Math.floor(st.nahrungProTag / 2))) : 99;
  if (reichweite < 6 && tageBisErnte(z) > reichweite) meldung(z, herr, `Die Vorräte reichen nur noch etwa ${reichweite} Tage – mehr Acker, Weide oder Fischer!`, 'schlecht', 'vorrat', 1100);
  h.chronik.push({ tag: d.tag, bewohner: h.bewohner, soldaten, laune: h.laune, nahrung: h.lager.nahrung });
  if (h.chronik.length > 80) h.chronik.shift();
  // Ziel
  h.satteTage = nahrung >= 100 ? h.satteTage + 1 : 0;
  if (soldaten >= ZIEL.garnison && h.satteTage >= ZIEL.satteTage && !z.ergebnis && !z.siegGemeldet) {
    z.ergebnis = { sieg: true, herr, tag: d.tag, titel: 'Eschenbrück steht', text: `Am ${d.tag + 1}. Tag ist die Stadt satt und die Garnison zählt ${soldaten} Mann. Der Herzog bestätigt dich als Lehnsherrn.` };
  } else if (h.bewohner < NIEDERLAGE_BEWOHNER && !z.ergebnis) {
    z.ergebnis = { sieg: false, herr, tag: d.tag, titel: 'Eschenbrück ist verlassen', text: `Nur noch ${h.bewohner} Menschen leben in der Stadt. Der Herzog gibt das Lehen an einen anderen.` };
  }
}

/** Tage bis zur nächsten Ernte (Spätsommer, Tag 9 im Jahr). */
export function tageBisErnte(z) {
  const t = datum(z.tick).tag % 20;
  return t < 9 ? 9 - t : 29 - t;
}

/** Reicht der Vorrat (plus Dauer-Nahrung von Vieh/Fisch) für zusaetzlich mehr Münder bis zur Ernte? */
export function vorratReicht(z, herr, st, mehr) {
  const h = z.herren[herr];
  const dauer = (st.anzahl.viehhof || 0) * 2 + (st.anzahl.fischer || 0) * (jahreszeit(z) === 3 ? 0 : 1);
  const bedarf = Math.max(0, st.verbrauch + mehr - dauer) * tageBisErnte(z);
  return h.lager.nahrung >= bedarf;
}

export function wirtschaftTick(z) {
  if (z.tick % 30 === 15) reparieren(z);
  if (z.tick % 30 === 0) for (let i = 0; i < z.herren.length; i++) arbeitVerteilen(z, i);
  produktion(z);
  felderWachsen(z);
  lieferungen(z);
  baustellen(z);
  anwerben(z);
}

/** Beschädigte Gebäude werden langsam ausgebessert, solange keine Räuber in der Nähe sind. */
function reparieren(z) {
  for (const g of z.gebaeude) {
    if (g.zustand !== 'fertig' || g.hp >= g.hpMax) continue;
    let gefahr = false;
    for (const u of z.einheiten) if (u.art === 'raeuber' && abstand(u.x, u.y, g.x, g.y) < 6000) { gefahr = true; break; }
    if (!gefahr) g.hp = Math.min(g.hpMax, g.hp + Math.max(2, Math.floor(g.hpMax / 60)));
  }
}
