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
  const durch = findePfad(z, kachel(m.x - 14000, m.y), kachel(m.x - 3000, m.y), 'buerger');
  pruefe('Bürger gehen durchs Tor', !!durch && durch.length < 16);
  pruefe('Rasterpunkte: jedes Mauerstück kennt seine Enden', stuecke.every((g) => g.ende && g.ende.length === 4));
  const ids = z.einheiten.filter((u) => u.art === 'soldat').map((u) => u.id);
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'mauer', id: tore[0].id, spieler: 0 });
  for (let i = 0; i < 900; i++) tick(z, []);
  const oben = z.einheiten.filter((u) => ids.includes(u.id) && u.mauerPlatz >= 0).length;
  pruefe('Soldaten stehen auf der Mauer', oben === ids.length, `${oben}/${ids.length}`);
  befehlAnwenden(z, { typ: 'einheiten', ids, aktion: 'frei', spieler: 0 });
  for (let i = 0; i < 5; i++) tick(z, []);
  pruefe('… und steigen auf Befehl wieder herab', z.einheiten.filter((u) => ids.includes(u.id)).every((u) => u.mauerPlatz < 0 && begehbar(z, kachel(u.x, u.y), 'buerger')));
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
