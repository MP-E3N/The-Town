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
import { findePfad, freieLinie } from './pfad.js';
import { tuer } from './baumeister.js';
import { abstand, abstand2, kachel, kachelMitte, winkelVon, zufall, zufallZwischen, ereignis, meldung, COS, SIN } from './lib.js';

export function soldatenVon(z, herr) {
  let n = 0;
  for (const u of z.einheiten) if (u.art === 'soldat' && u.besitzer === herr && u.hp > 0) n++;
  return n;
}

function neueEinheit(z, art, besitzer, x, y) {
  const k = KAMPF[art];
  const u = { id: z.naechsteEinheit++, art, besitzer, x, y, hp: k.hp, hpMax: k.hp, zustand: 'ruhe', ziel: -1, pfad: null, pi: 0, pfadZiel: -1, neuPfad: 0, cd: 0, blick: 90, heim: -1, bande: -1, beuteN: 0, beuteG: 0 };
  z.einheiten.push(u);
  return u;
}

export function neuerSoldat(z, herr, heim) {
  const p = tuer(heim);
  const u = neueEinheit(z, 'soldat', herr, p.x, p.y);
  u.heim = heim.id;
  return u;
}

/** Bewegt u auf (zx,zy) zu. Gibt 'da', 'unterwegs', 'mauer:<id>' oder 'kein' zurück. */
function bewegeZu(z, u, zx, zy, modus, tempo) {
  const d = abstand(u.x, u.y, zx, zy);
  if (d <= tempo) { u.x = zx; u.y = zy; return 'da'; }
  let tx = zx, ty = zy;
  if (!freieLinie(z, u.x, u.y, zx, zy, modus)) {
    const zielK = kachel(zx, zy);
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
  const k = KAMPF[u.art];
  u.cd = k.takt;
  u.blick = winkelVon(ziel.x - u.x, ziel.y - u.y);
  ziel.hp -= zufallZwischen(z, k.schaden[0], k.schaden[1]);
}

function naechster(z, u, art, maxD) {
  let best = null, bd = maxD * maxD;
  for (const e of z.einheiten) {
    if (e.art !== art || e.hp <= 0) continue;
    const d = abstand2(u.x, u.y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function postenVon(z, u) {
  const h = z.herren[u.besitzer];
  let mx, my, r;
  if (h.sammelpunkt) { mx = h.sammelpunkt.x; my = h.sammelpunkt.y; r = 600 + (u.id % 3) * 450; }
  else {
    const g = z.gebaeude[u.heim] && z.gebaeude[u.heim].zustand === 'fertig' ? z.gebaeude[u.heim] : z.gebaeude[h.burg];
    if (g.art === 'burg') { mx = g.x; my = g.y; r = 900 + (u.id % 2) * 700; }
    else { const p = tuer(g); mx = p.x; my = p.y; r = 500 + (u.id % 3) * 400; }
  }
  const w = (u.id * 73) % 360;
  return { x: mx + Math.trunc(COS[w] * r / 1024), y: my + Math.trunc(SIN[w] * r / 1024) };
}

function soldatKI(z, u) {
  const h = z.herren[u.besitzer];
  const burg = z.gebaeude[h.burg];
  const e = naechster(z, u, 'raeuber', (LAND_RADIUS + 8) * 1000);
  if (e && abstand(e.x, e.y, burg.x, burg.y) <= (LAND_RADIUS + 6) * 1000) {
    u.zustand = 'kampf';
    if (abstand(u.x, u.y, e.x, e.y) <= KAMPF.soldat.reichweite) angreifen(z, u, e);
    else bewegeZu(z, u, e.x, e.y, 'buerger', TEMPO.soldat);
    return;
  }
  const p = postenVon(z, u);
  if (abstand(u.x, u.y, p.x, p.y) > 300) {
    u.zustand = 'marsch';
    if (bewegeZu(z, u, p.x, p.y, 'buerger', TEMPO.soldat) === 'kein') { u.x = p.x; u.y = p.y; }
  } else {
    u.zustand = 'ruhe';
    if (u.hp < u.hpMax && z.tick % 20 === 0) u.hp++;
  }
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
  if (g.art === 'speicher') { const n = Math.min(4, h.lager.nahrung); h.lager.nahrung -= n; u.beuteN += n; const gd = Math.min(2, h.lager.gold); h.lager.gold -= gd; u.beuteG += gd; }
  else if (g.puffer > 0) { const n = Math.min(3, g.puffer); g.puffer -= n; if (GEBAEUDE[g.art].ware === 'nahrung') u.beuteN += n; else u.beuteG += 1; }
  else if (g.art === 'haus') { const gd = Math.min(1, h.lager.gold); h.lager.gold -= gd; u.beuteG += gd + 1; }
  else u.beuteG += 1;
  if (g.hp <= 0) gebaeudeZerstoert(z, g);
}

export function gebaeudeZerstoert(z, g) {
  const typ = GEBAEUDE[g.art];
  g.zustand = 'weg'; g.hp = 0;
  for (const id of g.felder) z.felder[id].weg = true;
  z.version++;
  z.ruinen.push({ x: g.x, y: g.y, b: g.b, t: g.t, w: g.w, tick: z.tick, mauer: !!typ.mauer });
  if (z.ruinen.length > 40) z.ruinen.shift();
  meldung(z, g.besitzer, typ.mauer ? `Räuber haben ein Stück ${typ.name} eingerissen!` : `${typ.name} wurde niedergebrannt!`, 'schlecht', typ.mauer ? 'mauerweg' : null, 300);
}

function raeuberKI(z, u) {
  const bande = z.banden[u.bande];
  if (bande.flucht && u.zustand !== 'flucht') { u.zustand = 'flucht'; u.pfad = null; }
  if (u.zustand !== 'flucht' || u.hp < u.hpMax / 2) {
    const s = naechster(z, u, 'soldat', KAMPF.sichtRaeuber);
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
        h.lager.nahrung += u.beuteN; h.lager.gold += u.beuteG;
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
      a.x -= px; a.y -= py; b.x += px; b.y += py;
    }
  }
}
