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
import { grundstueck } from '../sim/baumeister.js';
import { ueberlappt, abstandStrecke, winkelVon } from '../sim/lib.js';
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
