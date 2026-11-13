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
 *   {typ:'sammeln', x, y} | {typ:'sammeln'}       Sammelpunkt der Garnison (ohne x = aufheben)
 *   {typ:'weiter'}                                nach dem Sieg weiterspielen
 *   {typ:'einheiten', ids:[…], aktion:'gehe'|'angriff'|'frei', x, y, ziel}   Soldaten führen (wie im RTS)
 *   {typ:'transfer', von, nach, ware, menge}      Waren zwischen zwei eigenen Lagern umlagern
 *   {typ:'produktion', id, produkt}               Waffenschmiede: 'speere' | 'boegen'
 *   {typ:'ausbildung', id, art}                   Burg/Kaserne automatisch auffüllen: 'speer' | 'bogen' | 'aus'
 *   {typ:'rekrutieren', id, art, anzahl}          Rekruten in Auftrag geben (anzahl 0 = Warteschlange leeren)
 *   {typ:'strasse', art:'weg'|'gasse'|'haupt', punkte:[x0,y0,x1,y1,…]}   Straße selbst anlegen (Linienzug)
 *   {typ:'strasseWeg', id}                        Straße entfernen
 *   {typ:'strasseArt', id, art}                   Straße umwidmen (Feldweg / Gasse / Hauptstraße)
 *   {typ:'cheat'}                                 Testhilfe: +200 von jeder Ware in die Burg
 *   einheiten mit aktion:'gehe' kennt optional w (Blickrichtung, Grad) und reihe (Mann je Reihe) = Formation
 */

import { KARTE_B, KARTE_H, LAND_RADIUS } from '../data/werte.js';
import { GEBAEUDE, ZONEN, WAREN, SCHMIEDE_PRODUKTE, AUSBILDUNG } from '../data/gebaeude.js';
import { TEMPO } from '../data/werte.js';
import { wegGecached, pfadLaenge } from './pfad.js';
import { tuerKachel } from './baumeister.js';
import { summieren } from './lager.js';
import { karteFuer } from './karte.js';
import { pruefePlatz, gebaeudeAnlegen, bezahlen } from './baumeister.js';
import { toreSetzen, mauerKreuztStrasse, strasseHinzufuegen, BREITE } from './strassen.js';
import { geben } from './lager.js';
import { abgeleitet, objekteNahe } from './abgeleitet.js';
import { abstand, winkelVon, wnorm, meldung, lokal, punktIn, kachel, ueberlappt, SIN, COS } from './lib.js';

export const STRASSEN_ARTEN = ['weg', 'gasse', 'haupt'];
export const STRASSEN_NAME = { weg: 'Feldweg', gasse: 'Gasse', haupt: 'Hauptstraße' };

/**
 * Darf hier ein Straßenstück liegen? null = ja, sonst der Grund (für Vorschau und Befehl).
 * Wasser ist erlaubt (wird zur Brücke, höchstens 6 Kacheln am Stück), Mauern auch (dort entsteht ein Tor).
 * WARUM die Mittellinie: Häuser stehen dicht an der Straße; nur wer mitten hindurch will, wird abgewiesen.
 */
export function strassePruefen(z, herr, ax, ay, bx, by) {
  const len = abstand(ax, ay, bx, by);
  if (len < 400) return 'zu kurz';
  if (len > 40000) return 'zu lang (höchstens 40 Kacheln je Stück)';
  const burg = z.gebaeude[z.herren[herr].burg];
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const naehe = objekteNahe(c, Math.min(ax, bx) - 3000, Math.min(ay, by) - 3000, Math.max(ax, bx) + 3000, Math.max(ay, by) + 3000);
  const schritte = Math.ceil(len / 250);
  let nass = 0;
  for (let i = 0; i <= schritte; i++) {
    const x = ax + Math.trunc((bx - ax) * i / schritte), y = ay + Math.trunc((by - ay) * i / schritte);
    if (x < 0 || y < 0 || x >= KARTE_B * 1000 || y >= KARTE_H * 1000) return 'Kartenrand';
    if (abstand(x, y, burg.x, burg.y) > LAND_RADIUS * 1000) return 'außerhalb deines Landes';
    if (k.wasser[kachel(x, y)]) { if (++nass > 24) return 'Wasser zu breit für eine Brücke'; } else nass = 0;
    for (const e of naehe) {
      if (e.typ === 'g') {
        const g = z.gebaeude[e.id];
        if (g.zustand === 'weg' || GEBAEUDE[g.art].mauer || GEBAEUDE[g.art].begehbar) continue;
        if (punktIn(g, x, y, -100)) return `${GEBAEUDE[g.art].name} im Weg`;
      } else {
        const f = z.felder[e.id];
        if (!f.weg && punktIn(f, x, y, -100)) return f.art === 'weide' ? 'Weide im Weg' : 'Feld im Weg';
      }
    }
  }
  return null;
}

/**
 * Plätze einer Formation: Front (erste Reihe) quer zur Blickrichtung w, Mitte der Front bei (x,y),
 * weitere Reihen dahinter. Abstand 0,7 Kacheln. Wird auch von der Vorschau (eingabe/maus.js) benutzt.
 */
export function formationsPlaetze(n, x, y, w, reihe) {
  const out = [];
  reihe = Math.max(1, Math.min(n, reihe));
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / reihe), inReihe = Math.min(reihe, n - r * reihe);
    // WARUM doppelt: Die letzte, kürzere Reihe steht mittig hinter der Front (ganzzahlig, halbe Abstände).
    const s2 = 2 * (i % reihe) - (inReihe - 1);
    const qx = Math.trunc(-SIN[w] * s2 * 350 / 1024), qy = Math.trunc(COS[w] * s2 * 350 / 1024);
    const lx = Math.trunc(-COS[w] * r * 700 / 1024), ly = Math.trunc(-SIN[w] * r * 700 / 1024);
    out.push({ x: x + qx + lx, y: y + qy + ly });
  }
  return out;
}

/** Enden eines Mauerstücks (Rasterpunkte); Türme haben ihren Mittelpunkt als Knoten. */
export function mauerEnden(g) {
  if (g.art === 'turm' || g.art === 'eckturm') return [g.x, g.y, g.x, g.y];
  if (g.ende) return g.ende;
  const a = lokal(g, -Math.trunc(g.b / 2), 0), b = lokal(g, Math.trunc(g.b / 2), 0);
  return [a.x, a.y, b.x, b.y];
}

/**
 * Stellungen für n Soldaten: Breitensuche über zusammenhängende Mauerstücke (Enden ≤ 0,6 Kacheln voneinander,
 * Türme ≤ 1 Kachel), je Stück zwei Plätze, auf Türmen und Torhäusern auf den Türmen.
 */
export function mauerPlaetze(z, start, n) {
  const istWehr = (g) => g.zustand === 'fertig' && g.besitzer === start.besitzer && (GEBAEUDE[g.art].mauer || g.art === 'turm');
  const reihe = [start], gesehen = new Set([start.id]), out = [];
  for (let qi = 0; qi < reihe.length && out.length < n; qi++) {
    const g = reihe[qi];
    if (g.art === 'turm' || g.art === 'eckturm') for (const [lu, lv] of [[0, 0], [-300, 250], [300, 250]]) { const p = lokal(g, lu, lv); out.push({ id: g.id, x: p.x, y: p.y }); }
    else if (g.art === 'tor') for (const sd of [-1, 1]) { const p = lokal(g, sd * (Math.trunc(g.b / 2) - 450), 0); out.push({ id: g.id, x: p.x, y: p.y }); }
    else for (const sd of [-1, 1]) { const p = lokal(g, sd * Math.trunc(g.b / 4), 0); out.push({ id: g.id, x: p.x, y: p.y }); }
    const e = mauerEnden(g);
    for (const h of z.gebaeude) {
      if (gesehen.has(h.id) || !istWehr(h)) continue;
      const rund = (x) => x.art === 'turm' || x.art === 'eckturm';
      const f = mauerEnden(h), r = (rund(g) || rund(h)) ? 1100 : 650;
      let nah = false;
      for (let i = 0; i < 4 && !nah; i += 2) for (let j = 0; j < 4; j += 2) if (abstand(e[i], e[i + 1], f[j], f[j + 1]) <= r) { nah = true; break; }
      if (nah) { gesehen.add(h.id); reihe.push(h); }
    }
  }
  return out.length ? out : [{ id: start.id, x: start.x, y: start.y }];
}

/** Wasser oder außerhalb der Karte? */
function wasserOderRand(k, x, y) {
  if (x < 300 || y < 300 || x >= KARTE_B * 1000 - 300 || y >= KARTE_H * 1000 - 300) return true;
  return !!k.wasser[kachel(x, y)];
}
/** Berg: Fels oder sehr steiler Hang. WARUM so steil: Die Uferböschung ist auch steil (≈ 50–90) — dort soll die
 *  Mauer bis ans Wasser hinunter, nicht oben an der Böschung enden. */
function berg(k, x, y) { const t = kachel(x, y); return k.fels[t] > 55 || k.steil[t] > 110; }

/**
 * Mauertürme an offenen Enden: Endet ein neues Mauerstück (ohne Anschluss an andere Mauern/Türme) höchstens
 * 4,5 Kacheln vor Wasser/Kartenrand oder 2,5 Kacheln vor Fels/sehr steilem Hang, wird bis dorthin verlängert und ein Turm gesetzt.
 * WARUM: Vorher blieb vor dem Ufer eine Lücke, durch die die Räuber einfach hindurchliefen; und eine Mauer, die
 * im Nichts aufhört, sieht unfertig aus. Der Turm reicht bis an das Hindernis heran (keine Lücke im Raster).
 * Kostet nichts extra (gehört zum Mauerzug). Gibt die Zahl der neuen Türme zurück.
 */
function endTuermeSetzen(z, herr, art, neu) {
  const k = karteFuer(z.seed), c = abgeleitet(z);
  const wehr = z.gebaeude.filter((g) => g.zustand !== 'weg' && g.besitzer === herr && (GEBAEUDE[g.art].mauer || g.art === 'turm'));
  let n = 0;
  for (const g of neu) {
    const e = mauerEnden(g);
    for (let j = 0; j < 4; j += 2) {
      const ex = e[j], ey = e[j + 1], ox = e[2 - j], oy = e[3 - j];
      // angeschlossen? (anderes Stück mit einem Ende in der Nähe, oder ein Turm)
      const verbunden = wehr.some((h) => h !== g && (() => { const f = mauerEnden(h), r = (h.art === 'turm' || h.art === 'eckturm') ? 1100 : 650; return abstand(ex, ey, f[0], f[1]) <= r || abstand(ex, ey, f[2], f[3]) <= r; })());
      if (verbunden) continue;
      const l = abstand(ex, ey, ox, oy) || 1, dx = ex - ox, dy = ey - oy;
      // Erst Wasser/Kartenrand (bis 4,5 Kacheln, auch über eine Böschung hinweg), sonst Berg (bis 2,5 Kacheln)
      let s = -1;
      for (let st = 0; st <= 18 && s < 0; st++) if (wasserOderRand(k, ex + Math.trunc(dx * st * 250 / l), ey + Math.trunc(dy * st * 250 / l))) s = st * 250;
      for (let st = 0; st <= 10 && s < 0; st++) if (berg(k, ex + Math.trunc(dx * st * 250 / l), ey + Math.trunc(dy * st * 250 / l))) s = st * 250;
      if (s < 0) continue;
      // Turmmitte so, dass seine Außenkante das Hindernis berührt (Turm 1,3 Kacheln breit)
      const halb = Math.trunc(GEBAEUDE.eckturm.b / 2), d = Math.max(0, s - halb + 100);
      const cx = ex + Math.trunc(dx * d / l), cy = ey + Math.trunc(dy * d / l), w = winkelVon(dx, dy);
      const o = { x: cx, y: cy, b: GEBAEUDE.eckturm.b, t: GEBAEUDE.eckturm.t, w };
      let frei = true;
      for (const q of objekteNahe(c, cx - 2500, cy - 2500, cx + 2500, cy + 2500)) {
        const obj = q.typ === 'g' ? z.gebaeude[q.id] : z.felder[q.id];
        if (q.typ === 'g' && (obj.zustand === 'weg' || GEBAEUDE[obj.art].mauer)) continue;
        if (q.typ === 'f' && obj.weg) continue;
        if (ueberlappt(o, obj, 0)) { frei = false; break; }
      }
      if (!frei) continue;
      // Lücke zwischen Mauerende und Turm mit einem Stück Mauer schließen
      if (d > halb) {
        const mx = ex + Math.trunc(dx * (d - halb) / 2 / l), my = ey + Math.trunc(dy * (d - halb) / 2 / l);
        const st = gebaeudeAnlegen(z, herr, art, { x: mx, y: my, b: d - halb + 160, t: GEBAEUDE[art].t, w }, { auftrag: true, keinWeg: true });
        st.ende = [ex, ey, ex + Math.trunc(dx * (d - halb) / l), ey + Math.trunc(dy * (d - halb) / l)];
      }
      const t = gebaeudeAnlegen(z, herr, 'eckturm', o, { auftrag: true, keinWeg: true });
      t.material = art;
      t.hpMax = art === 'mauer' ? GEBAEUDE.eckturm.hpStein : GEBAEUDE.eckturm.hp; t.hp = Math.floor(t.hpMax / 4);
      wehr.push(t);
      n++;
    }
  }
  return n;
}

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
  // Türme dürfen auf Mauerknoten sitzen (die Mauer läuft in den Turm hinein).
  const grund = pruefePlatz(z, herr, o, { strRand: 80, steilMax: Math.max(80, Math.floor(Math.max(o.b, o.t) / 30)), mauerOk: art === 'turm' });
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
      const neu = [];
      for (let i = 0; i < n; i++) {
        const x = ax + Math.trunc((bx - ax) * (2 * i + 1) / (2 * n)), y = ay + Math.trunc((by - ay) * (2 * i + 1) / (2 * n));
        const o = { x, y, b: Math.floor(len / n) + 80, t: typ.t, w };
        if (pruefePlatz(z, herr, o, { mauer: true, keineStrasse: false, steilMax: 150, felsOk: true })) { ausgelassen++; continue; }
        if (mauerKreuztStrasse(z, o, true) >= 0) { ausgelassen++; continue; } // nicht längs auf einem Weg
        if (fehlendeKosten(h, art).length) { geld++; continue; }
        bezahlen(z, herr, art, o.x, o.y);
        const g = gebaeudeAnlegen(z, herr, art, o, { auftrag: true, keinWeg: true });
        // Rasterpunkte: genaue Enden jedes Stücks, damit neue Mauern und Türme exakt ansetzen können
        g.ende = [ax + Math.trunc((bx - ax) * i / n), ay + Math.trunc((by - ay) * i / n), ax + Math.trunc((bx - ax) * (i + 1) / n), ay + Math.trunc((by - ay) * (i + 1) / n)];
        gebaut++; neu.push(g);
      }
      const tuerme = endTuermeSetzen(z, herr, art, neu);
      toreSetzen(z);
      if (gebaut) meldung(z, herr, `${gebaut} Stück ${typ.name} in Auftrag${tuerme ? `, ${tuerme} Mauerturm${tuerme > 1 ? 'türme' : ''} am Ende` : ''}${ausgelassen ? `, ${ausgelassen} übersprungen (belegt/Wasser)` : ''}${geld ? `, ${geld} fehlt Material` : ''}.`, 'info');
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
      if (b.aktion === 'mauer') {
        // Auf Mauer, Torhaus oder Turm stationieren: Plätze entlang der verbundenen Mauerstücke verteilen.
        const g = z.gebaeude[ganz(b.id, 0, z.gebaeude.length - 1)];
        if (!g || g.besitzer !== herr || g.zustand !== 'fertig' || !(GEBAEUDE[g.art].mauer || g.art === 'turm')) return;
        const plaetze = mauerPlaetze(z, g, eigene.length);
        eigene.forEach((u, i) => { const p = plaetze[i % plaetze.length]; u.befehl = { typ: 'mauer', id: p.id, x: p.x, y: p.y }; u.pfad = null; });
        meldung(z, herr, `${eigene.length} ${eigene.length === 1 ? 'Soldat bezieht' : 'Soldaten beziehen'} Stellung auf ${g.art === 'turm' ? 'dem Wachturm' : g.art === 'eckturm' ? 'dem Mauerturm' : g.art === 'tor' ? 'dem Torhaus' : 'der Mauer'}.`, 'info');
        return;
      }
      if (b.aktion === 'angriff') {
        const ziel = z.einheiten.find((e) => e.id === ganz(b.ziel, 0, 1e9) && e.art === 'raeuber');
        if (ziel) { for (const u of eigene) u.befehl = { typ: 'angriff', ziel: ziel.id }; return; }
      }
      // Aufstellung: Reihen, Abstand 0,7 Kacheln, quer zur Blickrichtung. Ohne Formation: 5 je Reihe,
      // Blick in Marschrichtung. Mit Formation (Rechtsklick ziehen): Breite und Blick wie gezogen.
      // Speerträger stehen vorn, Bogenschützen dahinter (schießen über die Front).
      const x = ganz(b.x, 0, KARTE_B * 1000), y = ganz(b.y, 0, KARTE_H * 1000);
      let mx = 0, my = 0;
      for (const u of eigene) { mx += u.x; my += u.y; }
      mx = Math.trunc(mx / eigene.length); my = Math.trunc(my / eigene.length);
      const formation = b.w !== undefined && b.w !== null;
      const w = formation ? wnorm(ganz(b.w, -720, 720)) : winkelVon(x - mx, y - my);
      const reihe = formation ? ganz(b.reihe, 1, 200) : 5;
      const geordnet = eigene.slice().sort((a, c) => (Number(a.typ === 'bogen') - Number(c.typ === 'bogen')) || (a.id - c.id));
      const plaetze = formationsPlaetze(geordnet.length, x, y, w, reihe);
      geordnet.forEach((u, i) => {
        u.befehl = { typ: 'gehe', x: plaetze[i].x, y: plaetze[i].y, w };
        u.pfad = null;
      });
      break;
    }
    case 'strasse': {
      const art = STRASSEN_ARTEN.includes(b.art) ? b.art : 'weg';
      const roh = Array.isArray(b.punkte) ? b.punkte.slice(0, 80) : [];
      const p = [];
      for (let i = 0; i + 1 < roh.length; i += 2) p.push(ganz(roh[i], 0, KARTE_B * 1000 - 1), ganz(roh[i + 1], 0, KARTE_H * 1000 - 1));
      if (p.length < 4) return;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const grund = strassePruefen(z, herr, p[i], p[i + 1], p[i + 2], p[i + 3]);
        if (grund) { meldung(z, herr, `Straße geht hier nicht: ${grund}.`, 'warn'); return; }
      }
      const s = strasseHinzufuegen(z, p, art, 'herr');
      if (s) { s.vomHerrn = true; meldung(z, herr, `${STRASSEN_NAME[art]} angelegt.`, 'info'); }
      break;
    }
    case 'strasseWeg': {
      const s = z.strassen[ganz(b.id, 0, z.strassen.length - 1)];
      if (!s || s.weg) return;
      // WARUM Punkte leeren: Alle Raster und Planer lesen nur die Punkte — eine leere Straße gibt es nicht.
      s.weg = true; s.punkte = [];
      for (const t of z.strassen) if (t.angeschlossen) delete t.angeschlossen;
      z.version++;
      meldung(z, herr, 'Straße entfernt.', 'info');
      break;
    }
    case 'strasseArt': {
      const s = z.strassen[ganz(b.id, 0, z.strassen.length - 1)];
      if (!s || s.weg || !STRASSEN_ARTEN.includes(b.art) || s.art === b.art) return;
      s.art = b.art; s.breite = BREITE[b.art];
      z.version++;
      meldung(z, herr, `Straße ist jetzt ${STRASSEN_NAME[b.art]}.`, 'info');
      break;
    }
    case 'cheat': {
      // Testhilfe für Spieltests: füllt die Burg auf (im Mehrspieler später abschaltbar).
      const burg = z.gebaeude[h.burg];
      for (const w of WAREN) geben(z, herr, burg, w, 200);
      meldung(z, herr, 'Schatzkammer aufgefüllt: +200 von jeder Ware.', 'gut');
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
      g.auto = b.art;
      break;
    }
    case 'rekrutieren': {
      const g = z.gebaeude[ganz(b.id, 0, z.gebaeude.length - 1)];
      if (!g || g.besitzer !== herr || g.zustand !== 'fertig' || !GEBAEUDE[g.art].plaetze) return;
      const n = ganz(b.anzahl, 0, 20);
      if (!g.warteschlange) g.warteschlange = [];
      if (n === 0) { g.warteschlange.length = 0; return; }
      if (!AUSBILDUNG[b.art]) return;
      for (let i = 0; i < n && g.warteschlange.length < 20; i++) g.warteschlange.push(b.art);
      break;
    }
    case 'weiter': if (z.ergebnis && z.ergebnis.sieg) { z.ergebnis = null; z.siegGemeldet = true; } break;
    case 'sammeln':
      h.sammelpunkt = (b.x === undefined || b.x === null) ? null : { x: ganz(b.x, 0, KARTE_B * 1000), y: ganz(b.y, 0, KARTE_H * 1000) };
      break;
  }
}
