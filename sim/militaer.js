/**
 * militaer.js — Soldaten, Räuberbanden, Türme, Kampf, Mauern einreißen.
 *
 * ZWECK:    Die Garnison schützt das Land; Räuber kommen in Wellen vom Kartenrand.
 * LIEST:    Karte, abgeleitete Raster, Wegsuche
 * SCHREIBT: z.einheiten, z.banden, Gebäude-HP, Lager (Beute), Ereignisse
 * REGEL:    Einheiten laufen gerade, wenn die Linie frei ist, sonst A* (neu alle ~2,5 s).
 *           Räuber gehen durch Mauern, indem sie sie einreißen (Wegsuche 'raeuber' zählt Mauer-HP als Kosten).
 */

import { KARTE_B, KARTE_H, LAND_RADIUS, KAMPF, TEMPO, UEBERFALL, TICKS_PRO_TAG, BEDARF, MILITAER } from '../data/werte.js';
import { GEBAEUDE } from '../data/gebaeude.js';
import { karteFuer } from './karte.js';
import { abgeleitet } from './abgeleitet.js';
import { findePfad, freieLinie, begehbar, naechsteBegehbare } from './pfad.js';
import { tuer } from './baumeister.js';
import { nehmen, geben, summieren } from './lager.js';
import { abstand, abstand2, kachel, kachelMitte, winkelVon, zufall, zufallZwischen, ereignis, meldung, lokal, COS, SIN } from './lib.js';

export function soldatenVon(z, herr) {
  let n = 0;
  for (const u of z.einheiten) if (u.art === 'soldat' && u.besitzer === herr && u.hp > 0) n++;
  return n;
}

function neueEinheit(z, art, besitzer, x, y) {
  const k = art === 'raeuber' ? KAMPF.raeuber : KAMPF.soldat;
  const u = { id: z.naechsteEinheit++, art, besitzer, x, y, hp: k.hp, hpMax: k.hp, zustand: 'ruhe', mauerPlatz: -1, ziel: -1, pfad: null, pi: 0, pfadZiel: -1, neuPfad: 0, cd: 0, blick: 90, heim: -1, bande: -1, beuteN: 0, beuteG: 0 };
  z.einheiten.push(u);
  return u;
}

export function neuerSoldat(z, herr, heim, typ = 'speer') {
  const p = tuer(heim);
  const u = neueEinheit(z, 'soldat', herr, p.x, p.y);
  u.heim = heim.id; u.typ = typ; u.befehl = null;
  const k = kampfwerte(u); u.hp = k.hp; u.hpMax = k.hp;
  return u;
}

/** Kampfwerte je Einheit (Bogenschützen schießen auf Abstand). */
export function kampfwerte(u) { return u.art === 'raeuber' ? KAMPF.raeuber : u.typ === 'bogen' ? KAMPF.bogner : KAMPF.soldat; }

/** Bewegt u auf (zx,zy) zu. Gibt 'da', 'unterwegs', 'mauer:<id>' oder 'kein' zurück. */
function bewegeZu(z, u, zx, zy, modus, tempo) {
  // Ziel in einem Haus, in der Mauer oder im Wasser? Dann zur nächsten begehbaren Kachel davor.
  let zielK = kachel(zx, zy);
  if (!begehbar(z, zielK, modus)) {
    const n = naechsteBegehbare(z, zielK, modus, 3);
    if (n < 0) return 'kein';
    if (n !== zielK) { zielK = n; const m = kachelMitte(n); zx = m.x; zy = m.y; }
  }
  const d = abstand(u.x, u.y, zx, zy);
  if (d <= tempo) { u.x = zx; u.y = zy; return 'da'; }
  let tx = zx, ty = zy;
  if (!freieLinie(z, u.x, u.y, zx, zy, modus)) {
    if (!u.pfad || u.pfadZiel !== zielK || z.tick >= u.neuPfad || u.pi >= u.pfad.length) {
      u.pfad = findePfad(z, kachel(u.x, u.y), zielK, modus, { max: 12000 });
      u.pfadZiel = zielK; u.pi = 1; u.neuPfad = z.tick + 25 + (u.id % 7);
      if (!u.pfad) { u.neuPfad = z.tick + 20; return 'kein'; }
    }
    if (u.pi < u.pfad.length) {
      const nk = u.pfad[u.pi];
      const c = abgeleitet(z);
      if (modus === 'raeuber' && c.mauer[nk]) return 'mauer:' + (c.mauer[nk] - 1);
      const m = kachelMitte(nk);
      tx = m.x; ty = m.y;
      if (abstand(u.x, u.y, tx, ty) <= tempo) { u.x = tx; u.y = ty; u.pi++; return 'unterwegs'; }
    }
  } else u.pfad = null;
  const dd = abstand(u.x, u.y, tx, ty) || 1;
  const nx = u.x + Math.trunc((tx - u.x) * tempo / dd), ny = u.y + Math.trunc((ty - u.y) * tempo / dd);
  u.blick = winkelVon(nx - u.x, ny - u.y);
  u.x = nx; u.y = ny;
  return 'unterwegs';
}

function angreifen(z, u, ziel) {
  if (u.cd > 0) return;
  const k = kampfwerte(u);
  u.cd = k.takt;
  u.blick = winkelVon(ziel.x - u.x, ziel.y - u.y);
  const s = zufallZwischen(z, k.schaden[0], k.schaden[1]);
  // Auf Mauer oder Turm: Nahkämpfer kommen nicht hinauf (kein Schaden), Fernkämpfer treffen hinter Zinnen nur halb.
  const oben = (ziel.mauerPlatz ?? -1) >= 0, fern = k.reichweite > 2000;
  ziel.hp -= oben ? (fern ? Math.floor(s / 2) : 0) : s;
  if (u.typ === 'bogen') ereignis(z, { typ: 'pfeil', vonEinheit: u.id, ax: u.x, ay: u.y, x: ziel.x, y: ziel.y });
}

/** Kämpft gegen e: Nahkämpfer laufen hin, Bogenschützen schießen aus Reichweite. */
function kaempfe(z, u, e) {
  u.zustand = 'kampf';
  if (abstand(u.x, u.y, e.x, e.y) <= kampfwerte(u).reichweite) angreifen(z, u, e);
  else bewegeZu(z, u, e.x, e.y, 'buerger', TEMPO.soldat);
}

function naechster(z, u, art, maxD, amBoden = false) {
  let best = null, bd = maxD * maxD;
  for (const e of z.einheiten) {
    if (e.art !== art || e.hp <= 0) continue;
    if (amBoden && (e.mauerPlatz ?? -1) >= 0) continue;
    const d = abstand2(u.x, u.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/** Burg oder Kaserne, in der ein Soldat geheilt wird: sein Heim, sonst die Burg. */
function heilort(z, u) {
  const g = z.gebaeude[u.heim];
  if (g && g.zustand === 'fertig' && (g.art === 'burg' || g.art === 'kaserne')) return g;
  return z.gebaeude[z.herren[u.besitzer].burg];
}

/** Steht u in oder an einer eigenen fertigen Burg/Kaserne? Dort heilt er schnell. */
function amHeilort(z, u) {
  for (const g of z.gebaeude) {
    if (g.besitzer !== u.besitzer || g.zustand !== 'fertig' || (g.art !== 'burg' && g.art !== 'kaserne')) continue;
    if (abstand(u.x, u.y, g.x, g.y) <= Math.max(g.b, g.t) / 2 + KAMPF.heilRadius) return true;
  }
  return false;
}

/** Ein Leben dazu: am Heilort jeden heilTakt-ten Tick, sonst nur jeden `draussen`-ten. */
function heilen(z, u, draussen) {
  if (u.hp >= u.hpMax) return;
  if (amHeilort(z, u) ? z.tick % KAMPF.heilTakt === 0 : z.tick % draussen === 0) u.hp++;
}

function postenVon(z, u, ohneSammelpunkt = false) {
  const h = z.herren[u.besitzer];
  let mx, my, r;
  if (h.sammelpunkt && !ohneSammelpunkt) { mx = h.sammelpunkt.x; my = h.sammelpunkt.y; r = 600 + (u.id % 3) * 450; }
  else {
    const g = z.gebaeude[u.heim] && z.gebaeude[u.heim].zustand === 'fertig' ? z.gebaeude[u.heim] : z.gebaeude[h.burg];
    if (g.art === 'burg') {
      // Im vorderen Burghof (zwischen Tor und Palas), nicht auf Dächern von Bergfried und Ställen
      return lokal(g, -2000 + ((u.id * 37) % 7) * 450, -2200 + ((u.id * 53) % 4) * 420);
    }
    const p = tuer(g); mx = p.x; my = p.y; r = 500 + (u.id % 3) * 400;
  }
  if (ohneSammelpunkt && h.sammelpunkt) {
    // Zum Heilen: an den Heilort (Heim oder Burg), nicht zum Sammelpunkt
    const g = heilort(z, u);
    if (g.art === 'burg') return lokal(g, -2000 + ((u.id * 37) % 7) * 450, -2200 + ((u.id * 53) % 4) * 420);
    const p = tuer(g); mx = p.x; my = p.y; r = 500 + (u.id % 3) * 400;
  }
  const w = (u.id * 73) % 360;
  return { x: mx + Math.trunc(COS[w] * r / 1024), y: my + Math.trunc(SIN[w] * r / 1024) };
}

/** Auf der Mauer: nicht von der Stelle, aber alles in Reichweite angreifen (Bogen +1,5, Speer +0,5 Kacheln). */
function mauerWache(z, u) {
  u.zustand = 'mauer';
  if (u.typ !== 'bogen') {
    // Speerträger oben werfen Steine auf alles in Wurfweite (WARUM: sonst stünden sie auf der Mauer nutzlos herum)
    const e = naechster(z, u, 'raeuber', KAMPF.steinwurf.reichweite);
    if (e && u.cd <= 0) {
      const sw = KAMPF.steinwurf;
      u.cd = sw.takt; u.blick = winkelVon(e.x - u.x, e.y - u.y);
      e.hp -= zufallZwischen(z, sw.schaden[0], sw.schaden[1]);
      ereignis(z, { typ: 'stein', ax: u.x, ay: u.y, x: e.x, y: e.y });
    } else if (!e && u.hp < u.hpMax && z.tick % 25 === 0) u.hp++;
    return;
  }
  const reichweite = kampfwerte(u).reichweite + KAMPF.mauerReichweiteBogen;
  const e = naechster(z, u, 'raeuber', reichweite);
  if (e) angreifen(z, u, e);
  else if (u.hp < u.hpMax && z.tick % 25 === 0) u.hp++;
}

/** Seite (+1/−1 entlang lokal v), auf der Soldaten auf- und absteigen: bei Mauern der Wehrgang innen, sonst zur Burg. */
function innenSeite(z, g, x, y) {
  if (g.art === 'mauer' || g.art === 'palisade') return 1;
  if (g.art === 'turm' && g.anMauer) return -1; // Eingang des eingeklinkten Turms liegt vorn (innen)
  const burg = z.gebaeude[z.herren[g.besitzer].burg];
  return (burg.x - x) * -SIN[g.w] + (burg.y - y) * COS[g.w] >= 0 ? 1 : -1;
}
/** Von der Mauer herunter auf die Innenseite. */
function herabsteigen(z, u, g) {
  let ziel = kachel(u.x, u.y);
  if (g) {
    const nx = -SIN[g.w], ny = COS[g.w];
    const sd = innenSeite(z, g, u.x, u.y);
    ziel = kachel(u.x + Math.trunc(nx * sd * (Math.trunc(g.t / 2) + 600) / 1024), u.y + Math.trunc(ny * sd * (Math.trunc(g.t / 2) + 600) / 1024));
  }
  const n = naechsteBegehbare(z, ziel, 'buerger', 3);
  if (n >= 0) { const m = kachelMitte(n); u.x = m.x; u.y = m.y; }
  u.mauerPlatz = -1; u.pfad = null;
  if (!g || g.zustand !== 'fertig') { u.hp -= 10; u.befehl = { typ: 'halten', x: u.x, y: u.y }; }
}

/** Zur Mauer gehen (Innenseite) und hinaufsteigen. */
function aufDieMauer(z, u) {
  const hb = u.befehl, g = z.gebaeude[hb.id];
  if (!g || g.zustand !== 'fertig') { u.befehl = { typ: 'halten', x: u.x, y: u.y }; return; }
  // Feinde ganz nah? Erst wehren.
  const e = naechster(z, u, 'raeuber', 1600);
  if (e) { kaempfe(z, u, e); return; }
  // Auf der Innenseite hinauf: bei Mauern der Wehrgang, beim eingeklinkten Turm der Eingang
  const nx = -SIN[g.w], ny = COS[g.w];
  const sd = innenSeite(z, g, hb.x, hb.y);
  const off = Math.trunc(g.t / 2) + 650;
  const ax = hb.x + Math.trunc(nx * sd * off / 1024), ay = hb.y + Math.trunc(ny * sd * off / 1024);
  u.zustand = 'marsch';
  const r = bewegeZu(z, u, ax, ay, 'buerger', TEMPO.soldat);
  if ((r === 'da' || abstand(u.x, u.y, ax, ay) < 400) && abstand(u.x, u.y, hb.x, hb.y) < 2400) {
    u.x = hb.x; u.y = hb.y; u.mauerPlatz = g.id; u.pfad = null; u.zustand = 'mauer';
  } else if (r === 'kein') u.befehl = { typ: 'halten', x: u.x, y: u.y };
}

function soldatKI(z, u) {
  const h = z.herren[u.besitzer];
  const burg = z.gebaeude[h.burg];
  if ((u.mauerPlatz ?? -1) >= 0) {
    const g = z.gebaeude[u.mauerPlatz];
    const bleibt = g && g.zustand === 'fertig' && u.befehl && u.befehl.typ === 'mauer' && u.befehl.id === g.id;
    if (bleibt) { mauerWache(z, u); return; }
    herabsteigen(z, u, g);
  }
  if (u.befehl && u.befehl.typ === 'mauer') { aufDieMauer(z, u); return; }
  if (u.befehl && u.befehl.typ === 'angriff') {
    const e = z.einheiten.find((x) => x.id === u.befehl.ziel && x.hp > 0);
    if (e) { kaempfe(z, u, e); return; }
    u.befehl = { typ: 'halten', x: u.x, y: u.y };
  }
  if (u.befehl) {
    // Befehl des Herrn: zum Punkt gehen und halten; nur Feinde in der Nähe werden angegriffen.
    const hb = u.befehl;
    const e = naechster(z, u, 'raeuber', Math.max(kampfwerte(u).reichweite, 2500));
    if (e && abstand(e.x, e.y, hb.x, hb.y) < 5000) { kaempfe(z, u, e); return; }
    if (abstand(u.x, u.y, hb.x, hb.y) > 250) {
      u.zustand = 'marsch';
      const r = bewegeZu(z, u, hb.x, hb.y, 'buerger', TEMPO.soldat);
      // 'da', aber nicht am Punkt: Der Punkt lag in einem Haus/im Wasser → hier stehen bleiben.
      if (r === 'kein' || r === 'da') u.befehl = hb.w !== undefined ? { typ: 'halten', x: u.x, y: u.y, w: hb.w } : { typ: 'halten', x: u.x, y: u.y };
    } else {
      // Formation: in die gezogene Richtung schauen
      u.zustand = 'halten'; if (hb.w !== undefined) u.blick = hb.w;
      heilen(z, u, 30);
    }
    return;
  }
  const e = naechster(z, u, 'raeuber', (LAND_RADIUS + 8) * 1000);
  if (e && abstand(e.x, e.y, burg.x, burg.y) <= (LAND_RADIUS + 6) * 1000) {
    kaempfe(z, u, e);
    return;
  }
  // Kein Kampf: Verwundete (unter heilenAb %) gehen zum Heilen in Burg/Kaserne, auch wenn ein Sammelpunkt gilt;
  // sie bleiben dort, bis sie wieder ganz gesund sind.
  if (u.hp * 100 < u.hpMax * KAMPF.heilenAb) u.heilen = true;
  if (u.heilen && u.hp >= u.hpMax) u.heilen = false;
  const p = postenVon(z, u, !!u.heilen);
  if (abstand(u.x, u.y, p.x, p.y) > 300) {
    u.zustand = 'marsch';
    if (bewegeZu(z, u, p.x, p.y, 'buerger', TEMPO.soldat) === 'kein') { u.x = p.x; u.y = p.y; }
  } else {
    u.zustand = u.heilen ? 'heilen' : 'ruhe';
  }
  heilen(z, u, 20);
}

function waehleZiel(z, u) {
  const bande = z.banden[u.bande];
  let best = -1, bw = Infinity;
  for (const g of z.gebaeude) {
    if (g.besitzer !== bande.herr || g.zustand !== 'fertig') continue;
    const typ = GEBAEUDE[g.art];
    if (typ.mauer || g.art === 'burg' || g.art === 'turm' || g.art === 'kaserne' || g.art === 'platz') continue;
    let w = abstand(u.x, u.y, g.x, g.y);
    if (g.art === 'speicher') w -= 7000;
    if (g.puffer > 4) w -= 2000;
    if (u.gemieden && u.gemieden.includes(g.id)) w += 50000;
    if (w < bw) { bw = w; best = g.id; }
  }
  return best;
}

function pluendern(z, u, g) {
  if (u.cd > 0) return;
  u.cd = KAMPF.pluenderTakt;
  const h = z.herren[g.besitzer];
  g.hp -= KAMPF.pluenderSchaden;
  h.ueberfallMalus = BEDARF.ueberfallMalus;
  if (g.art === 'speicher') { const n = Math.min(4, g.inhalt.nahrung); g.inhalt.nahrung -= n; u.beuteN += n; const gd = Math.min(2, g.inhalt.gold); g.inhalt.gold -= gd; u.beuteG += gd; summieren(z, g.besitzer); }
  else if (g.puffer > 0) { const n = Math.min(3, g.puffer); g.puffer -= n; if (GEBAEUDE[g.art].ware === 'nahrung') u.beuteN += n; else u.beuteG += 1; }
  else if (g.art === 'haus') { const gd = nehmen(z, g.besitzer, 'gold', 1, g.x, g.y); u.beuteG += gd + 1; }
  else u.beuteG += 1;
  if (g.hp <= 0) gebaeudeZerstoert(z, g);
}

export function gebaeudeZerstoert(z, g) {
  const typ = GEBAEUDE[g.art];
  if (g.art === 'hof' || g.art === 'viehhof') {
    // Höfe bleiben als Ruine stehen: kein sofortiger Neubau. Die Felder bleiben und verwildern mit der Zeit
    // (wirtschaft.js felderVerwittern); der Herr kann gegen Holz und Gold beim Wiederaufbau helfen.
    g.zustand = 'ruine'; g.hp = 0; g.belegt = 0; g.brandTick = z.tick;
    for (const id of g.felder) { const f = z.felder[id]; if (!f.weg) f.verfall = f.verfall || 0; }
    z.version++;
    ereignis(z, { typ: 'hofBrand', herr: g.besitzer, id: g.id });
    meldung(z, g.besitzer, `${typ.name} wurde niedergebrannt! Ohne deine Hilfe verwildern die Felder.`, 'schlecht');
    return;
  }
  g.zustand = 'weg'; g.hp = 0;
  for (const id of g.felder) z.felder[id].weg = true;
  z.version++;
  if (typ.lager) {
    summieren(z, g.besitzer);
    if (g.inhalt && Object.values(g.inhalt).some((v) => v > 0)) meldung(z, g.besitzer, `Die Vorräte in ${typ.name} sind verbrannt!`, 'schlecht');
  }
  z.ruinen.push({ x: g.x, y: g.y, b: g.b, t: g.t, w: g.w, tick: z.tick, mauer: !!typ.mauer });
  if (z.ruinen.length > 40) z.ruinen.shift();
  meldung(z, g.besitzer, typ.mauer ? `Räuber haben ein Stück ${typ.name} eingerissen!` : `${typ.name} wurde niedergebrannt!`, 'schlecht', typ.mauer ? 'mauerweg' : null, 300);
}

function raeuberKI(z, u) {
  const bande = z.banden[u.bande];
  if (bande.flucht && u.zustand !== 'flucht') { u.zustand = 'flucht'; u.pfad = null; }
  if (u.zustand !== 'flucht' || u.hp < u.hpMax / 2) {
    // WARUM nur Soldaten am Boden: Auf Mauer und Turm kommen Räuber mit Knüppel und Messer nicht hinauf.
    const s = naechster(z, u, 'soldat', KAMPF.sichtRaeuber, true);
    if (s) {
      if (abstand(u.x, u.y, s.x, s.y) <= KAMPF.raeuber.reichweite) angreifen(z, u, s);
      else bewegeZu(z, u, s.x, s.y, 'raeuber', TEMPO.raeuber);
      return;
    }
  }
  if (u.zustand === 'flucht') {
    const r = bewegeZu(z, u, bande.spawn.x, bande.spawn.y, 'raeuber', TEMPO.raeuber);
    if (r === 'da' || abstand(u.x, u.y, bande.spawn.x, bande.spawn.y) < 1500) { u.abgezogen = true; u.hp = 0; }
    else if (r.startsWith('mauer:')) mauerAngreifen(z, u, Number(r.slice(6)));
    return;
  }
  if (u.zustand === 'pluendern') {
    const g = z.gebaeude[u.ziel];
    if (!g || g.zustand !== 'fertig') { u.zustand = 'marsch'; u.ziel = -1; }
    else {
      pluendern(z, u, g);
      if (u.beuteN + u.beuteG >= KAMPF.beuteMax) { u.zustand = 'flucht'; u.pfad = null; }
      return;
    }
  }
  if (u.ziel < 0 || !z.gebaeude[u.ziel] || z.gebaeude[u.ziel].zustand !== 'fertig') {
    u.ziel = waehleZiel(z, u);
    u.pfad = null;
    if (u.ziel < 0) { u.zustand = 'flucht'; return; }
  }
  u.zustand = 'marsch';
  const g = z.gebaeude[u.ziel];
  const p = tuer(g);
  if (abstand(u.x, u.y, p.x, p.y) < 900 || abstand(u.x, u.y, g.x, g.y) < Math.max(g.b, g.t) / 2 + 700) { u.zustand = 'pluendern'; return; }
  const r = bewegeZu(z, u, p.x, p.y, 'raeuber', TEMPO.raeuber);
  if (r === 'kein') { u.gemieden = [...(u.gemieden || []), g.id].slice(-6); u.ziel = -1; }
  else if (r.startsWith('mauer:')) mauerAngreifen(z, u, Number(r.slice(6)));
}

function mauerAngreifen(z, u, id) {
  const g = z.gebaeude[id];
  if (!g || g.zustand !== 'fertig') return;
  if (u.cd > 0) return;
  u.cd = KAMPF.raeuber.takt;
  u.blick = winkelVon(g.x - u.x, g.y - u.y);
  g.hp -= KAMPF.mauerSchaden;
  if (g.hp <= 0) gebaeudeZerstoert(z, g);
}

function schuetzen(z) {
  for (const g of z.gebaeude) {
    if (g.zustand !== 'fertig') continue;
    const art = GEBAEUDE[g.art].schiesst;
    if (!art) continue;
    if (g.cd > 0) { g.cd--; continue; }
    const k = KAMPF[art];
    const e = naechster(z, g, 'raeuber', k.reichweite);
    if (!e) continue;
    g.cd = k.takt;
    e.hp -= k.schaden;
    ereignis(z, { typ: 'pfeil', von: g.id, x: e.x, y: e.y, ziel: e.id });
  }
}

/** Neue Räuberbande am Kartenrand, möglichst weit weg von der Burg. */
export function ueberfallStarten(z, herr) {
  const k = karteFuer(z.seed), h = z.herren[herr], burg = z.gebaeude[h.burg];
  let best = null, bd = -1;
  for (let v = 0; v < 14; v++) {
    const seite = zufall(z, 4);
    let tx, ty;
    if (seite === 0) { tx = zufallZwischen(z, 2, KARTE_B - 3); ty = 1; }
    else if (seite === 1) { tx = zufallZwischen(z, 2, KARTE_B - 3); ty = KARTE_H - 2; }
    else if (seite === 2) { tx = 1; ty = zufallZwischen(z, 2, KARTE_H - 3); }
    else { tx = KARTE_B - 2; ty = zufallZwischen(z, 2, KARTE_H - 3); }
    const i = ty * KARTE_B + tx;
    if (k.wasser[i]) continue;
    const d = abstand(tx * 1000, ty * 1000, burg.x, burg.y) + zufall(z, 20000);
    if (d > bd) { bd = d; best = { x: tx * 1000 + 500, y: ty * 1000 + 500 }; }
  }
  if (!best) return;
  const n = UEBERFALL.basis + z.ueberfallNr * UEBERFALL.proUeberfall + Math.floor(h.bewohner / UEBERFALL.proBewohner);
  const bande = { id: z.banden.length, herr, spawn: best, start: n, flucht: false, aktiv: true, beuteZurueck: 0 };
  z.banden.push(bande);
  for (let i = 0; i < n; i++) {
    const u = neueEinheit(z, 'raeuber', -1, best.x + zufallZwischen(z, -1500, 1500), best.y + zufallZwischen(z, -1500, 1500));
    u.x = Math.max(600, Math.min(KARTE_B * 1000 - 600, u.x)); u.y = Math.max(600, Math.min(KARTE_H * 1000 - 600, u.y));
    if (k.wasser[kachel(u.x, u.y)]) { u.x = best.x; u.y = best.y; }
    u.bande = bande.id; u.zustand = 'marsch';
  }
  const dx = best.x - burg.x, dy = best.y - burg.y;
  const richtung = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'Westen' : 'Osten') : (dy < 0 ? 'Norden' : 'Süden');
  z.ueberfallNr++;
  meldung(z, herr, `Räuber! Eine Bande von ${n} Mann kommt aus dem ${richtung}.`, 'gefahr');
  ereignis(z, { typ: 'ueberfall', bande: bande.id, x: best.x, y: best.y });
}

export function militaerTick(z) {
  for (const u of z.einheiten) {
    if (u.hp <= 0) continue;
    if (u.cd > 0) u.cd--;
    if (u.art === 'soldat') soldatKI(z, u); else raeuberKI(z, u);
  }
  schuetzen(z);
  trennen(z);
  // Tote wegräumen
  let tote = false;
  for (const u of z.einheiten) {
    if (u.hp > 0) continue;
    tote = true;
    if (u.art === 'raeuber') {
      const bande = z.banden[u.bande];
      if (!u.abgezogen) {
        const h = z.herren[bande.herr];
        geben(z, bande.herr, null, 'nahrung', u.beuteN, u.x, u.y); geben(z, bande.herr, null, 'gold', u.beuteG, u.x, u.y);
        bande.beuteZurueck += u.beuteN + u.beuteG;
        ereignis(z, { typ: 'tot', art: 'raeuber', x: u.x, y: u.y, blick: u.blick });
      }
    } else if (!u.desertiert) {
      ereignis(z, { typ: 'tot', art: 'soldat', x: u.x, y: u.y, blick: u.blick });
      meldung(z, u.besitzer, 'Ein Soldat ist gefallen.', 'schlecht', 'gefallen', 150);
    }
  }
  if (tote) z.einheiten = z.einheiten.filter((u) => u.hp > 0);
  // Banden: Flucht, Ende
  for (const b of z.banden) {
    if (!b.aktiv) continue;
    let leben = 0;
    for (const u of z.einheiten) if (u.bande === b.id) leben++;
    if (!b.flucht && leben * 2 < b.start) { b.flucht = true; meldung(z, b.herr, 'Die Räuber fliehen!', 'gut'); }
    if (leben === 0) {
      b.aktiv = false;
      meldung(z, b.herr, b.beuteZurueck ? `Bande zerschlagen, ${b.beuteZurueck} Beute zurückgeholt.` : 'Die Räuberbande ist fort.', 'gut');
    }
  }
  // Neuer Überfall?
  if (z.tick >= z.naechsterUeberfall) {
    for (let i = 0; i < z.herren.length; i++) ueberfallStarten(z, i);
    z.naechsterUeberfall = z.tick + zufallZwischen(z, UEBERFALL.abstandTage[0], UEBERFALL.abstandTage[1]) * TICKS_PRO_TAG;
  }
  void MILITAER;
}

/** Einheiten schieben sich auseinander, damit sie nicht auf einem Punkt stehen (ganzzahlig, feste Reihenfolge). */
function trennen(z) {
  const e = z.einheiten, R = 420;
  for (let i = 0; i < e.length; i++) {
    const a = e[i];
    if (a.hp <= 0) continue;
    for (let j = i + 1; j < e.length; j++) {
      const b = e[j];
      if (b.hp <= 0) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      if (dx > R || dx < -R || dy > R || dy < -R) continue;
      let d2 = dx * dx + dy * dy;
      if (d2 >= R * R) continue;
      if (d2 === 0) { dx = ((a.id * 37 + b.id * 11) % 7) - 3 || 2; dy = ((a.id * 13 + b.id * 29) % 7) - 3; d2 = dx * dx + dy * dy; }
      const d = Math.max(1, Math.floor(Math.sqrt(d2)));
      const schub = Math.floor((R - Math.min(d, R)) / 4);
      const px = Math.trunc(dx * schub / d), py = Math.trunc(dy * schub / d);
      // WARUM prüfen: Das Auseinanderschieben hat Figuren früher in Häuser, Mauern und den Fluss gedrückt.
      // Wer auf der Mauer steht, bleibt auf seinem Platz.
      if ((a.mauerPlatz ?? -1) < 0 && darfStehen(z, a, a.x - px, a.y - py)) { a.x -= px; a.y -= py; }
      if ((b.mauerPlatz ?? -1) < 0 && darfStehen(z, b, b.x + px, b.y + py)) { b.x += px; b.y += py; }
    }
  }
}

function darfStehen(z, u, x, y) {
  const neu = kachel(x, y);
  if (neu === kachel(u.x, u.y)) return true;
  return begehbar(z, neu, u.art === 'raeuber' ? 'raeuber' : 'buerger');
}
