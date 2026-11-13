/**
 * sim.test.js — Tests ohne Browser: node tests/sim.test.js
 *
 * Prüft: Startstadt, Determinismus, Abspielen einer Aufnahme, Speichern/Laden (JSON), Kollision, Torhaus,
 *        Mauerbesatzung,
 *        Befehls-Prüfung, Überfall wird abgewehrt, Balance (kluger Bot gewinnt, Nichtstun nicht).
 */

import { erzeugeZustand } from '../sim/zustand.js';
import { tick } from '../sim/tick.js';
import { hashZustand } from '../sim/lib.js';
import { abspielen } from '../netz/lokal.js';
import { stadtStatus } from '../sim/baumeister.js';
import { befehlAnwenden } from '../sim/befehle.js';
import { klugerBot, nichtsBot } from './bots.js';
import { summieren } from '../sim/lager.js';
import { begehbar, findePfad } from '../sim/pfad.js';
import { kachel } from '../sim/lib.js';
import { karteFuer } from '../sim/karte.js';
import { grundstueck, findePlatz, gebaeudeAnlegen, flurAuswertung } from '../sim/baumeister.js';
import { kernKennzahlen } from '../sim/stadtplaner.js';
import { ueberlappt, abstandStrecke, winkelVon, strassenLinie, SIN, COS } from '../sim/lib.js';
import { strasseHinzufuegen } from '../sim/strassen.js';
import { gebaeudeZerstoert } from '../sim/militaer.js';
import { abgeleitet } from '../sim/abgeleitet.js';
import { GEBAEUDE } from '../data/gebaeude.js';

let fehler = 0;
function pruefe(name, ok, info = '') {
  console.log(`${ok ? 'ok  ' : 'FEHL'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) fehler++;
}

function lauf(seed, bot, tage) {
  const z = erzeugeZustand(seed);
  const aufnahme = [];
  for (let i = 0; i < tage * 600 && !z.ergebnis; i++) {
    const b = [];
    bot(z, (x) => b.push({ ...x, spieler: 0 }));
    for (const x of b) aufnahme.push({ tick: z.tick, befehl: x });
    tick(z, b);
  }
  return { z, aufnahme };
}

// 1) Startstadt
{
  const z = erzeugeZustand(42);
  const st = stadtStatus(z, 0);
  pruefe('Start: Burg, Markt, Speicher', z.gebaeude[0].art === 'burg' && z.gebaeude[1].art === 'platz' && (st.anzahl.speicher || 0) >= 1);
  pruefe('Start: Wohnplätze für alle, Höfe ≥ 2, Holzfäller', st.wohnKap >= z.herren[0].bewohner && (st.anzahl.hof || 0) >= 2 && (st.anzahl.holzfaeller || 0) >= 1, JSON.stringify(st.anzahl));
  pruefe('Start: Straßen mit Brücke', z.strassen.length >= 3);
  pruefe('Start: 3 Soldaten', st.soldaten === 3);
  pruefe('Start: Felder', z.felder.length >= 4);
  for (const seed of [1, 7, 99, 1234, 5555]) {
    const zz = erzeugeZustand(seed), s2 = stadtStatus(zz, 0);
    pruefe(`Start Seed ${seed}`, s2.wohnKap >= zz.herren[0].bewohner && (s2.anzahl.hof || 0) >= 1, `Häuser ${s2.haeuser} (${s2.wohnKap} Plätze), Höfe ${s2.anzahl.hof || 0}`);
  }
}

// 2) Determinismus + Abspielen + Speichern/Laden
{
  const a = lauf(42, klugerBot(), 12), b = lauf(42, klugerBot(), 12);
  pruefe('Determinismus (2 Läufe gleich)', hashZustand(a.z) === hashZustand(b.z), hashZustand(a.z));
  const c = erzeugeZustand(42);
  abspielen(c, a.aufnahme, a.z.tick);
  pruefe('Abspielen der Aufnahme', hashZustand(c) === hashZustand(a.z));
  const kopie = JSON.parse(JSON.stringify(a.z));
  for (let i = 0; i < 1200; i++) { tick(a.z, []); tick(kopie, []); }
  pruefe('Speichern/Laden (JSON) rechnet gleich weiter', hashZustand(a.z) === hashZustand(kopie));
}

// 3) Befehle werden geprüft
{
  const z = erzeugeZustand(42);
  const vorher = z.gebaeude.length;
  befehlAnwenden(z, { typ: 'bauen', art: 'burg', x: 50000, y: 50000, w: 0, spieler: 0 });
  befehlAnwenden(z, { typ: 'bauen', art: 'kaserne', x: -5, y: 'quatsch', w: 0, spieler: 0 });
  befehlAnwenden(z, { typ: 'abreissen', id: 0, spieler: 0 });
  pruefe('Unerlaubte Befehle ändern nichts', z.gebaeude.length === vorher && z.gebaeude[0].zustand === 'fertig');
}

// 3b) Lager, Umlagern, Soldaten führen, Produktion wählen
{
  const z = erzeugeZustand(42);
  const burg = z.gebaeude[z.herren[0].burg], sp = z.gebaeude.find((g) => g.art === 'speicher');
  const vorher = burg.inhalt.holz;
  befehlAnwenden(z, { typ: 'transfer', von: sp.id, nach: burg.id, ware: 'holz', menge: 30, spieler: 0 });
  pruefe('Umlagern: Ware verlässt den Speicher sofort', sp.inhalt.holz === 40 && z.lieferungen.filter((l) => l.umlagern).length === 2);
  // Nur die Umlager-Träger zählen (Baustellen dürfen in der Zeit Holz aus der Burg nehmen)
  let angekommen = 0;
  for (let i = 0; i < 900; i++) {
    tick(z, []);
    for (const e of z.lieferungen) if (e.umlagern && e.angekommen && !e.gezaehlt) { e.gezaehlt = true; angekommen += e.menge; }
  }
  pruefe('Umlagern: Ware kommt in der Burg an', angekommen === 30 && burg.inhalt.holz >= vorher, `angekommen ${angekommen}, Burg-Holz ${burg.inhalt.holz}`);
  const ids = z.einheiten.filter((u) => u.art === 'soldat').map((u) => u.id);
  const ziel = { x: burg.x + 9000, y: burg.y + 9000 };
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'gehe', x: ziel.x, y: ziel.y, spieler: 0 });
  for (let i = 0; i < 400; i++) tick(z, []);
  const da = z.einheiten.filter((u) => ids.includes(u.id) && Math.hypot(u.x - ziel.x, u.y - ziel.y) < 2500).length;
  pruefe('Soldaten marschieren zum befohlenen Punkt', da === ids.length, `${da}/${ids.length}`);
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'frei', spieler: 0 });
  pruefe('Soldaten wieder auf eigene Faust', z.einheiten.filter((u) => ids.includes(u.id)).every((u) => !u.befehl));
  befehlAnwenden(z, { typ: 'ausbildung', id: burg.id, art: 'bogen', spieler: 0 });
  pruefe('Burg füllt automatisch mit Bogenschützen auf', burg.auto === 'bogen');
  const vorherS = z.einheiten.filter((u) => u.art === 'soldat').length;
  befehlAnwenden(z, { typ: 'ausbildung', id: burg.id, art: 'aus', spieler: 0 });
  for (let i = 0; i < 1200; i++) tick(z, []);
  pruefe('Ohne Auftrag wird niemand rekrutiert', z.einheiten.filter((u) => u.art === 'soldat').length <= vorherS);
  burg.inhalt.speere += 2; burg.inhalt.gold += 50; summieren(z, 0);
  befehlAnwenden(z, { typ: 'rekrutieren', id: burg.id, art: 'speer', anzahl: 1, spieler: 0 });
  for (let i = 0; i < 400; i++) tick(z, []);
  pruefe('Rekrut auf Befehl', z.einheiten.filter((u) => u.art === 'soldat').length >= Math.min(5, vorherS + 1), `vorher ${vorherS}`);
}

// 4) Überfall: Garnison wehrt eine kleine Bande ab
{
  const z = erzeugeZustand(42);
  z.naechsterUeberfall = 5;
  for (let i = 0; i < 3000; i++) tick(z, []);
  const b = z.banden[0];
  pruefe('Erster Überfall wird abgewehrt', b && !b.aktiv && z.einheiten.every((u) => u.art === 'soldat'), b ? `Beute zurück ${b.beuteZurueck}` : 'keine Bande');
}

// 4b) Niemand steht in Gebäuden, Mauern oder im Wasser (Soldaten, Räuber; Mauerbesatzung ausgenommen)
{
  const z = erzeugeZustand(7), bot = klugerBot();
  z.naechsterUeberfall = 1200;
  let schlecht = 0, gesamt = 0, bsp = '';
  for (let i = 0; i < 600 * 12; i++) {
    const b = []; bot(z, (x) => b.push({ ...x, spieler: 0 })); tick(z, b);
    if (i % 10) continue;
    for (const u of z.einheiten) {
      if (u.mauerPlatz >= 0) continue;
      gesamt++;
      if (!begehbar(z, kachel(u.x, u.y), u.art === 'raeuber' ? 'raeuber' : 'buerger')) { schlecht++; bsp = `${u.art} bei ${Math.round(u.x / 1000)},${Math.round(u.y / 1000)}`; }
    }
  }
  pruefe('Kollision: niemand in Gebäuden/Mauern/Wasser', schlecht === 0 && gesamt > 500, `${schlecht} von ${gesamt} ${bsp}`);
  const k = karteFuer(7), burg = z.gebaeude[z.herren[0].burg], markt = z.gebaeude[z.herren[0].markt];
  // Keine Überlappung: Haus + Garten (Grundstück) gegen alle anderen Gebäude/Grundstücke (Berühren erlaubt)
  {
    const geb = z.gebaeude.filter((g) => g.zustand !== 'weg' && !GEBAEUDE[g.art].mauer && !GEBAEUDE[g.art].begehbar);
    const form = (g) => (g.art === 'haus' ? grundstueck(g, g.wohn) : g);
    let n = 0, bsp = '';
    for (let i = 0; i < geb.length; i++) for (let j = i + 1; j < geb.length; j++) {
      if (geb[i].art !== 'haus' && geb[j].art !== 'haus') continue;
      if (ueberlappt(form(geb[i]), form(geb[j]), -30)) { n++; bsp = geb[i].art + '/' + geb[j].art; }
    }
    pruefe('Häuser: kein Grundstück überlappt ein anderes Gebäude', n === 0, n + ' ' + bsp);
  }
  pruefe('Burg steht abseits (≥ 15 Kacheln vom Markt)', Math.hypot(burg.x - markt.x, burg.y - markt.y) >= 15000);
  void k;
}

// 4c) Mauer über die Straße → Torhaus; Soldaten beziehen Stellung auf der Mauer und steigen wieder herab
{
  const z = erzeugeZustand(42);
  const h = z.herren[0], burg = z.gebaeude[h.burg], m = z.gebaeude[h.markt];
  burg.inhalt.stein += 200; summieren(z, 0);
  befehlAnwenden(z, { typ: 'mauer', art: 'mauer', ax: m.x - 9000, ay: m.y - 5000, bx: m.x - 9000, by: m.y + 5000, spieler: 0 });
  const stuecke = z.gebaeude.filter((g) => g.art === 'mauer' || g.art === 'tor');
  for (const g of stuecke) { g.zustand = 'fertig'; g.hp = g.hpMax; }
  z.version++;
  const tore = stuecke.filter((g) => g.art === 'tor');
  pruefe('Torhaus, wo die Mauer die Straße kreuzt (genau eins)', tore.length === 1 && tore[0].b >= 3000 && tore[0].material === 'mauer', `${tore.length} Tore`);
  // Tor steht quer zur Straße (Straßenrichtung ⟂ Torachse), mitten auf der Fahrbahn
  {
    const tor = tore[0], c = abgeleitet(z);
    let best = null, bd = Infinity;
    for (const s of c.segmente) { const d = abstandStrecke(tor.x, tor.y, s.ax, s.ay, s.bx, s.by); if (d < bd) { bd = d; best = s; } }
    const sw = winkelVon(best.bx - best.ax, best.by - best.ay);
    let dw = Math.abs(((tor.w - sw) % 180 + 180) % 180 - 90);
    pruefe('Torhaus rechtwinklig zur Straße, mitten auf der Fahrbahn', dw <= 6 && bd <= 300, 'Abweichung ' + dw + '°, ' + bd + ' von der Mitte');
  }
  const durch = findePfad(z, kachel(m.x - 14000, m.y), kachel(m.x - 3000, m.y), 'buerger');
  pruefe('Bürger gehen durchs Tor', !!durch && durch.length < 16);
  pruefe('Rasterpunkte: jedes Mauerstück kennt seine Enden', stuecke.every((g) => g.ende && g.ende.length === 4));
  const ids = z.einheiten.filter((u) => u.art === 'soldat').map((u) => u.id);
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'mauer', id: tore[0].id, spieler: 0 });
  for (let i = 0; i < 900; i++) tick(z, []);
  const oben = z.einheiten.filter((u) => ids.includes(u.id) && u.mauerPlatz >= 0).length;
  pruefe('Soldaten stehen auf der Mauer', oben === ids.length, `${oben}/${ids.length}`);
  // Räuber direkt unter der Mauer: Speerträger oben werfen Steine, bekommen selbst keinen Nahkampfschaden
  {
    const sold = z.einheiten.filter((u) => ids.includes(u.id));
    const s0 = sold[0], hpVor = sold.map((u) => u.hp);
    z.banden.push({ id: z.banden.length, herr: 0, spawn: { x: 1000, y: 1000 }, start: 1, flucht: false, aktiv: true, beuteZurueck: 0 });
    const r = { id: z.naechsteEinheit++, art: 'raeuber', besitzer: -1, x: s0.x + 1200, y: s0.y + 600, hp: 70, hpMax: 70, zustand: 'marsch', mauerPlatz: -1, ziel: -1, pfad: null, pi: 0, pfadZiel: -1, neuPfad: 0, cd: 0, blick: 90, heim: -1, bande: z.banden.length - 1, beuteN: 0, beuteG: 0 };
    z.einheiten.push(r);
    for (let i = 0; i < 60; i++) tick(z, []);
    pruefe('Mauer: Speerträger werfen Steine auf Räuber unten', r.hp < 70, 'Räuber ' + r.hp + '/70');
    pruefe('Mauer: kein Nahkampfschaden für die Besatzung', sold.every((u, i) => u.hp >= hpVor[i]), sold.map((u) => u.hp).join(','));
  }
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'frei', spieler: 0 });
  for (let i = 0; i < 5; i++) tick(z, []);
  pruefe('… und steigen auf Befehl wieder herab', z.einheiten.filter((u) => ids.includes(u.id)).every((u) => u.mauerPlatz < 0 && begehbar(z, kachel(u.x, u.y), 'buerger')));
}

// 4d) Runde 6: Straßen selbst setzen/umwidmen/entfernen, Cheat, Formation, Feldpflege
{
  const z = erzeugeZustand(42);
  const h = z.herren[0], m = z.gebaeude[h.markt], burg = z.gebaeude[h.burg];
  const gold0 = h.lager.gold;
  befehlAnwenden(z, { typ: 'cheat', spieler: 0 });
  pruefe('Cheat: +200 Gold in der Burg', h.lager.gold === gold0 + 200 && burg.inhalt.gold >= 200);
  const n0 = z.strassen.length, v0 = z.version;
  let s = null;
  for (const [dx, dy] of [[-8000, 0], [0, 8000], [6000, 6000], [-6000, 6000], [0, -8000]]) {
    befehlAnwenden(z, { typ: 'strasse', art: 'gasse', punkte: [m.x + dx, m.y + dy, m.x + dx * 3 / 2, m.y + dy * 3 / 2], spieler: 0 });
    if (z.strassen.length > n0) { s = z.strassen[z.strassen.length - 1]; break; }
  }
  pruefe('Straße selbst anlegen', !!s && s.art === 'gasse' && s.vomHerrn && z.version > v0);
  const haus = z.gebaeude.find((g) => g.art === 'haus');
  const vorH = z.strassen.length;
  befehlAnwenden(z, { typ: 'strasse', art: 'weg', punkte: [haus.x - 3000, haus.y, haus.x + 3000, haus.y], spieler: 0 });
  pruefe('Straße durch ein Haus wird abgelehnt', z.strassen.length === vorH);
  if (s) {
    befehlAnwenden(z, { typ: 'strasseArt', id: s.id, art: 'haupt', spieler: 0 });
    pruefe('Straße umwidmen', s.art === 'haupt' && s.breite === 950);
    befehlAnwenden(z, { typ: 'strasseWeg', id: s.id, spieler: 0 });
    pruefe('Straße entfernen', s.weg && s.punkte.length === 0);
  }
  for (let i = 0; i < 1300; i++) tick(z, []); // Rekruten der Burg (5 Plätze) dürfen nicht stören
  const ids = z.einheiten.filter((u) => u.art === 'soldat').map((u) => u.id);
  const ziel = { x: m.x - 2000, y: m.y + 4000 };
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'gehe', x: ziel.x, y: ziel.y, w: 90, reihe: 2, spieler: 0 });
  // Aufstellung direkt nach dem Befehl prüfen (später kann ein Platz in einem Feld/Haus liegen → steht davor)
  const vorne = z.einheiten.filter((u) => ids.includes(u.id) && u.befehl && u.befehl.y === ziel.y).length;
  pruefe('Formation: 2 breit (Front = Zielpunkt)', vorne === Math.min(2, ids.length), `${vorne} vorn`);
  for (let i = 0; i < 1500; i++) tick(z, []);
  const sol = z.einheiten.filter((u) => ids.includes(u.id));
  pruefe('Formation: alle schauen in die gezogene Richtung', sol.every((u) => u.blick === 90), sol.map((u) => u.blick).join(','));
  // Feldpflege: gepflegtes Feld bringt mehr
  const z2 = erzeugeZustand(42);
  let gepflegt = 0;
  for (let i = 0; i < 600 * 8; i++) { tick(z2, []); for (const f of z2.felder) gepflegt = Math.max(gepflegt, f.pflege || 0); }
  pruefe('Feldpflege: Bauern pflegen wachsende Felder', gepflegt > 30, `höchste Pflege ${gepflegt}`);
}

// 4f) Mauer bis ans Wasser: Mauerturm am Ende, keine Lücke zum Ufer (Stein und Holz; Holz: steile Böschung davor)
for (const mart of ['mauer', 'palisade']) {
  const z = erzeugeZustand(42), k = karteFuer(42);
  const h = z.herren[0], burg = z.gebaeude[h.burg], m = z.gebaeude[h.markt];
  burg.inhalt.stein += 400; burg.inhalt.holz += 400; summieren(z, 0);
  // erste Wasserkachel östlich/westlich vom Markt suchen, dann eine Mauer quer darauf zu (endet im Wasser)
  let ziel = null;
  for (let d = 2; d < 30 && !ziel; d++) for (const sx of [1, -1]) { const x = m.x + sx * d * 1000, y = m.y - 9000; if (k.wasser[kachel(x, y)]) { ziel = { x: x + sx * 1500, y, sx }; break; } }
  befehlAnwenden(z, { typ: 'mauer', art: mart, ax: ziel.x - ziel.sx * 9000, ay: ziel.y, bx: ziel.x, by: ziel.y, spieler: 0 });
  const tuerme = z.gebaeude.filter((g) => g.art === 'eckturm');
  pruefe('Mauerturm am Ende zum Wasser (' + mart + ')', tuerme.length >= 1 && tuerme[0].material === mart, tuerme.length + ' Türme');
  if (tuerme.length) {
    const t0 = tuerme[0];
    let luecke = 99999;
    for (let s = 0; s <= 3000; s += 100) { if (k.wasser[kachel(t0.x + ziel.sx * s, t0.y)]) { luecke = s - t0.b / 2; break; } }
    pruefe('… und reicht bis ans Ufer (Lücke < 0,4 Kacheln)', luecke < 400, 'Lücke ' + luecke);
  }
}

// 4e) Heilung: Verwundete gehen von selbst in die Burg und heilen dort schnell
{
  const z = erzeugeZustand(42);
  const u = z.einheiten.find((e) => e.art === 'soldat');
  const burg = z.gebaeude[z.herren[0].burg];
  u.x = burg.x + 12000; u.y = burg.y; u.hp = 30; u.pfad = null;
  befehlAnwenden(z, { typ: 'sammeln', x: burg.x + 12000, y: burg.y, spieler: 0 });
  for (let i = 0; i < 160; i++) tick(z, []);
  pruefe('Heilung: Verwundeter geht trotz Sammelpunkt zur Burg', u.zustand === 'heilen' && Math.hypot(u.x - burg.x, u.y - burg.y) < 6000, Math.round(Math.hypot(u.x - burg.x, u.y - burg.y) / 1000) + ' Kacheln');
  for (let i = 0; i < 160; i++) tick(z, []);
  pruefe('Heilung: in der Burg schnell wieder gesund (≈ 30 s)', u.hp === u.hpMax, u.hp + '/' + u.hpMax);
}

// 4g) Runde 9: Mauer-Außenseite, Turm in der Mauer, Trapezfelder, Hofbrand, Straßenecken, Kirche
{
  const z = erzeugeZustand(42);
  const h = z.herren[0], burg = z.gebaeude[h.burg], m = z.gebaeude[h.markt];
  burg.inhalt.stein += 400; burg.inhalt.holz += 400; burg.inhalt.gold += 400; summieren(z, 0);
  // Mauer südlich vom Markt, einmal in jede Richtung gezogen: Innenseite (+v) zeigt immer zum Markt
  const innenOk = [];
  for (const [ax, bx] of [[-4000, 4000], [4000, -4000]]) {
    const vor = z.gebaeude.length;
    befehlAnwenden(z, { typ: 'mauer', art: 'palisade', ax: m.x + ax, ay: m.y + 7000, bx: m.x + bx, by: m.y + 7000, spieler: 0 });
    const st = z.gebaeude.slice(vor).filter((g) => g.art === 'palisade');
    innenOk.push(st.length > 0 && st.every((g) => (m.x - g.x) * -SIN[g.w] + (m.y - g.y) * COS[g.w] > 0));
  }
  pruefe('Mauer: Innenseite (Wehrgang) zeigt zum Markt, egal wie gezogen', innenOk.every(Boolean), innenOk.join(','));
  const vor2 = z.gebaeude.length;
  befehlAnwenden(z, { typ: 'mauer', art: 'palisade', ax: m.x - 4000, ay: m.y + 10000, bx: m.x + 4000, by: m.y + 10000, tauschen: true, spieler: 0 });
  const getauscht = z.gebaeude.slice(vor2).filter((g) => g.art === 'palisade');
  pruefe('Mauer: R tauscht innen und außen', getauscht.length > 0 && getauscht.every((g) => (m.x - g.x) * -SIN[g.w] + (m.y - g.y) * COS[g.w] < 0));
  // Wachturm in die Mauer eingeklinkt: Eingang (Front, −v des Turms) zeigt zur Innenseite der Mauer
  const st = z.gebaeude.find((g) => g.art === 'palisade');
  st.zustand = 'fertig'; z.version++;
  const tw = (st.w + 180) % 360;
  befehlAnwenden(z, { typ: 'bauen', art: 'turm', x: st.x + Math.trunc(SIN[st.w] * 200 / 1024), y: st.y - Math.trunc(COS[st.w] * 200 / 1024), w: tw, anMauer: true, spieler: 0 });
  const turm = z.gebaeude.find((g) => g.art === 'turm' && g.anMauer);
  const frontInnen = turm && (SIN[turm.w] * -SIN[st.w] + -COS[turm.w] * COS[st.w]) > 900 * 1024;
  pruefe('Wachturm in der Mauer, Eingang innen', !!turm && frontInnen);
  // Straßenecken: gerundet, eckig, stark
  const s = strasseHinzufuegen(z, [m.x - 20000, m.y + 12000, m.x - 14000, m.y + 12000, m.x - 14000, m.y + 18000], 'weg', 'test');
  const rund = strassenLinie(s).length / 2;
  befehlAnwenden(z, { typ: 'strasseEcke', id: s.id, i: 1, rund: 0, spieler: 0 });
  const eckig = strassenLinie(s).length / 2;
  befehlAnwenden(z, { typ: 'strassePunkt', id: s.id, i: 1, x: m.x - 13000, y: m.y + 13000, spieler: 0 });
  pruefe('Straßenecke: rund (Bogen) / eckig / Punkt verschieben', rund > 5 && eckig === 3 && s.punkte[2] === m.x - 13000, `${rund} / ${eckig}`);
  // Kirche steht in der Flucht von Markt oder Straße
  const ki = z.gebaeude.find((g) => g.art === 'kirche');
  pruefe('Kirche steht in der Flucht des Marktes', !!ki && ((ki.w - m.w) % 90 + 90) % 90 === 0, ki ? `w ${ki.w}, Markt ${m.w}` : 'keine');
}
// 4h) Trapezfelder überlappen nichts; Hofbrand → Ruine, Felder verwildern; Hilfe baut wieder auf
{
  const { z } = lauf(42, klugerBot(), 12);
  const felder = z.felder.filter((f) => !f.weg);
  let ueber = 0;
  for (let i = 0; i < felder.length; i++) for (let j = i + 1; j < felder.length; j++) if (ueberlappt(felder[i], felder[j], 0)) ueber++;
  for (const f of felder) for (const g of z.gebaeude) if (g.zustand !== 'weg' && !GEBAEUDE[g.art].begehbar && !GEBAEUDE[g.art].mauer && ueberlappt(f, g, -50)) ueber++;
  pruefe('Felder (auch Trapeze) überlappen weder einander noch Gebäude', ueber === 0, `${felder.filter((f) => f.poly).length} Trapeze von ${felder.length}, ${ueber} Überlappungen`);
  const hof = z.gebaeude.find((g) => g.art === 'hof' && g.zustand === 'fertig' && g.felder.some((id) => !z.felder[id].weg));
  gebaeudeZerstoert(z, hof);
  pruefe('Hofbrand: Hof bleibt als Ruine, Felder bleiben', hof.zustand === 'ruine' && hof.felder.some((id) => !z.felder[id].weg));
  for (let i = 0; i < 600 * 2; i++) tick(z, []);
  const wild = Math.max(...hof.felder.map((id) => z.felder[id].verfall || 0));
  pruefe('… nach 2 Tagen: nicht wieder aufgebaut, Felder halb verwildert', hof.zustand === 'ruine' && wild >= 400 && wild <= 600, 'verfall ' + wild);
  const h = z.herren[0]; h.lager.holz += 50; h.lager.gold += 50; z.gebaeude[h.burg].inhalt.holz += 50; z.gebaeude[h.burg].inhalt.gold += 50;
  befehlAnwenden(z, { typ: 'wiederaufbau', id: hof.id, spieler: 0 });
  pruefe('Wiederaufbau mit Hilfe des Herrn beginnt sofort', hof.zustand === 'bau' && hof.arbeit > 0);
  // Ohne Hilfe: nach den Verfallstagen ist alles fort
  const z2 = lauf(42, klugerBot(), 12).z;
  const hof2 = z2.gebaeude.find((g) => g.art === 'hof' && g.zustand === 'fertig');
  gebaeudeZerstoert(z2, hof2);
  for (let i = 0; i < 600 * 5; i++) tick(z2, []);
  pruefe('Ohne Hilfe: Felder verwildert, Ruine aufgegeben', hof2.zustand === 'weg' && hof2.felder.every((id) => z2.felder[id].weg));
}

// 4i) Blockrand (Runde 10, Nutzerbild): Der Baumeister säumt den Marktplatz ringsum mit Häusern (Front zum Platz,
//     offen nur, wo Straßen einmünden) und setzt die Häuser im Kern Wand an Wand. 10 Häuser nach der Startstadt.
for (const seed of [42, 7]) {
  const z = erzeugeZustand(seed);
  for (let i = 0; i < 10; i++) {
    const p = findePlatz(z, 0, 'haus');
    if (!p) break;
    gebaeudeAnlegen(z, 0, 'haus', p.o, { sofort: true, wohn: p.wohn });
  }
  const kk = kernKennzahlen(z, 0), rand = Math.max(1, kk.punkte - kk.einmuendung);
  pruefe(`Markt Seed ${seed}: Häuser säumen den Platz (Hausfront ≥ 55 %, Gebäude ≥ 85 % des Platzrands ohne Einmündungen)`,
    kk.haus * 100 >= rand * 55 && kk.gebaeude * 100 >= rand * 85, `Häuser ${Math.round(kk.haus * 100 / rand)} %, Gebäude ${Math.round(kk.gebaeude * 100 / rand)} %, Einmündungen ${kk.einmuendung}/${kk.punkte}`);
  pruefe(`Kern Seed ${seed}: Häuser stehen Wand an Wand (≥ die Hälfte der Hausseiten, Zahnlücken ≤ 1 je 3 Häuser)`,
    kk.wand * 2 >= kk.seiten && kk.luecke * 6 <= kk.seiten, `Wand ${kk.wand}/${kk.seiten}, Zeilenende ${kk.ende}, Lücken ${kk.luecke}`);
}

// 4j) Runde 11: Flur-Auswertung zählt jede Acker-/Weidekachel genau einmal; Höfe nutzen freies Nachbarland (Nachwachsen)
{
  const z = lauf(42, klugerBot(), 20).z;
  const fa = flurAuswertung(z);
  let zonen = 0;
  const k = karteFuer(42);
  for (let i = 0; i < z.zone.length; i++) if ((z.zone[i] === 2 || z.zone[i] === 3) && !k.wasser[i]) zonen++;
  const summe = fa.acker.reduce((a, b) => a + b, 0) + fa.weide.reduce((a, b) => a + b, 0);
  pruefe('Flur-Auswertung: jede Acker-/Weidekachel genau einmal eingeordnet', summe === zonen, `${summe} von ${zonen}`);
  const genutzt = Math.round(fa.acker[1] * 100 / Math.max(1, fa.acker[1] + fa.acker[2] + fa.acker[3] + fa.acker[4] + fa.acker[7]));
  pruefe('Höfe nutzen freies Ackerland (Felder wachsen nach, Seed 42 Tag 20 ≥ 50 % genutzt, vor Runde 11: 42 %)', genutzt >= 50, genutzt + ' %');
}

// 5) Balance
{
  const ergebnisse = [];
  let siege = 0;
  for (const seed of [42, 7, 99, 5, 1234]) {
    const { z } = lauf(seed, klugerBot(), 60);
    const tag = Math.floor(z.tick / 600);
    ergebnisse.push(`${seed}:${z.ergebnis ? (z.ergebnis.sieg ? 'Sieg' : 'verloren') : 'offen'}@${tag}`);
    if (z.ergebnis && z.ergebnis.sieg) siege++;
  }
  pruefe('Kluger Bot gewinnt auf mindestens 3 von 5 Karten', siege >= 3, ergebnisse.join(' '));
  const n = lauf(42, nichtsBot(), 40);
  pruefe('Nichtstun gewinnt nicht', !(n.z.ergebnis && n.z.ergebnis.sieg), n.z.ergebnis ? n.z.ergebnis.titel + ' Tag ' + n.z.ergebnis.tag : 'offen, Bewohner ' + n.z.herren[0].bewohner);
}

console.log(fehler ? `\n${fehler} FEHLER` : '\nALLES GRUEN');
process.exitCode = fehler ? 1 : 0;
