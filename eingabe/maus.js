/**
 * maus.js — Maus und Tastatur (Steuerung wie in Echtzeit-Strategiespielen).
 *
 * ZWECK:    Linke Taste: auswählen (Klick) bzw. Rahmen um Soldaten ziehen; mit Werkzeug: anwenden.
 *           Rechte Taste: Klick = Befehl an ausgewählte Soldaten (Marsch / Angriff) bzw. Werkzeug ab;
 *           Ziehen = Karte verschieben; mit ausgewählten Soldaten = Formation ziehen (wie in Total War:
 *           die gezogene Linie ist die Front, lang = breite Linie, kurz = kompakter Block; von links nach
 *           rechts gezogen schauen sie nach oben). Mittlere Taste ziehen = verschieben. Rad = Zoom.
 *           Straßen-Werkzeug: Punkte klicken, Rechtsklick/Doppelklick/Enter legt die Straße an.
 * SCHREIBT: Kamera, ui-Objekt; Spielzustand nur über verbindung.senden()
 */

import { GEBAEUDE } from '../data/gebaeude.js';
import { zuWelt, zoomeUm, begrenze, kameraSchritt } from '../render/kamera.js';
import { auftragPruefen, mauerEnden, strassePruefen, formationsPlaetze, STRASSEN_ARTEN } from '../sim/befehle.js';
import { abgeleitet } from '../sim/abgeleitet.js';
import { punktIn, wnorm } from '../sim/lib.js';

/** Abstand der Soldaten in der Formation (Kacheln), wie in sim/befehle.js. */
const FORM_ABSTAND = 0.7;

export function verbindeEingabe(canvas, a) {
  const { kamera, ui } = a;
  let ziehen = null, malen = false, letzteKachel = -1;
  const tasten = new Set();
  ui.einheiten = new Set();

  const welt = (e) => zuWelt(kamera, e.clientX, e.clientY);
  const z = () => a.verbindung().zustand;

  function gebaeudeUnter(x, y) {
    let best = -1;
    for (const g of z().gebaeude) {
      if (g.zustand === 'weg') continue;
      if (g.art === 'platz' && best >= 0) continue;
      if (punktIn(g, Math.round(x * 1000), Math.round(y * 1000), 150)) best = g.id;
    }
    return best;
  }
  function einheitUnter(x, y, art) {
    let best = null, bd = 0.45 * 0.45;
    for (const u of z().einheiten) {
      if (art && u.art !== art) continue;
      const d = (u.x / 1000 - x) ** 2 + (u.y / 1000 - y) ** 2;
      if (d < bd) { bd = d; best = u; }
    }
    return best;
  }
  const eigeneSoldaten = () => z().einheiten.filter((u) => u.art === 'soldat' && u.besitzer === a.verbindung().spieler);

  /** Winkel, damit die Front zur nächsten Straße zeigt. */
  function winkelZurStrasse(x, y) {
    const c = abgeleitet(z());
    let best = null, bd = 25;
    for (const s of c.segmente) {
      const ax = s.ax / 1000, ay = s.ay / 1000, bx = s.bx / 1000, by = s.by / 1000;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const qx = ax + dx * t, qy = ay + dy * t, d = (qx - x) ** 2 + (qy - y) ** 2;
      if (d < bd) { bd = d; best = { qx, qy }; }
    }
    if (!best) return 0;
    return Math.round(Math.atan2(best.qy - y, best.qx - x) * 180 / Math.PI + 90);
  }

  /**
   * Rasterpunkte: Enden aller eigenen Mauerstücke und Mittelpunkte der Türme. Neue Mauern und Türme rasten
   * dort ein (Fangradius ≈ 18 Bildpunkte, mindestens 0,7 Kacheln).
   */
  function rasterpunkte() {
    const out = [], spieler = a.verbindung().spieler;
    for (const g of z().gebaeude) {
      if (g.zustand === 'weg' || g.besitzer !== spieler || !(GEBAEUDE[g.art].mauer || g.art === 'turm')) continue;
      const rund = g.art === 'turm' || g.art === 'eckturm';
      const e = mauerEnden(g), w = rund ? null : g.w;
      for (let i = 0; i < 4; i += 2) {
        if (rund && i) continue;
        const x = e[i] / 1000, y = e[i + 1] / 1000;
        const da = out.find((p) => Math.hypot(p.x - x, p.y - y) < 0.3);
        if (da) { if (rund) da.turm = true; continue; }
        out.push({ x, y, w, turm: rund });
      }
    }
    return out;
  }
  function einrasten(p) {
    const r = Math.max(0.7, 18 / kamera.zoom);
    let best = null, bd = r;
    for (const q of rasterpunkte()) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = q; } }
    return best;
  }

  /** Straße unter der Maus (für Entfernen/Umwidmen): nächstes Segment innerhalb der halben Breite + Rand. */
  function strasseUnter(x, y) {
    const c = abgeleitet(z());
    let best = -1, bd = Infinity;
    for (const s of c.segmente) {
      const ax = s.ax / 1000, ay = s.ay / 1000, bx = s.bx / 1000, by = s.by / 1000;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const d = Math.hypot(ax + dx * t - x, ay + dy * t - y);
      if (d < s.hb / 1000 + 0.35 && d < bd) { bd = d; best = s.strasse; }
    }
    return best;
  }
  /** Straßenpunkt einrasten: an Straßenenden, sonst auf die nächste Straße (zum Anschließen). */
  function strassenFang(p) {
    const r = Math.max(0.6, 14 / kamera.zoom);
    let best = null, bd = r;
    for (const s of z().strassen) {
      const q = s.punkte;
      if (s.weg || q.length < 4) continue;
      for (const i of [0, q.length - 2]) { const d = Math.hypot(q[i] / 1000 - p.x, q[i + 1] / 1000 - p.y); if (d < bd) { bd = d; best = { x: q[i] / 1000, y: q[i + 1] / 1000 }; } }
    }
    if (best) return best;
    for (const s of abgeleitet(z()).segmente) {
      const ax = s.ax / 1000, ay = s.ay / 1000, bx = s.bx / 1000, by = s.by / 1000;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / l2));
      const qx = ax + dx * t, qy = ay + dy * t, d = Math.hypot(qx - p.x, qy - p.y);
      if (d < bd) { bd = d; best = { x: qx, y: qy }; }
    }
    return best;
  }
  function strassenVorschau() {
    const w = ui.werkzeug;
    if (!w || w.typ !== 'strasse' || !ui.maus) { ui.strassenFang = null; ui.strassenGrund = null; return; }
    ui.strassenFang = strassenFang(ui.maus);
    const m = ui.strassenFang || ui.maus, pk = ui.strassenPunkte;
    ui.strassenGrund = pk.length ? strassePruefen(z(), a.verbindung().spieler, pk[pk.length - 1].x, pk[pk.length - 1].y, Math.round(m.x * 1000), Math.round(m.y * 1000)) : null;
  }
  function strasseAbschliessen() {
    const pk = ui.strassenPunkte;
    if (pk.length >= 2) a.verbindung().senden({ typ: 'strasse', art: ui.werkzeug.art, punkte: pk.flatMap((q) => [q.x, q.y]) });
    ui.strassenPunkte = [];
  }

  /** Vorschau der gezogenen Formation: Front von a nach b, Blick 90° gegen den Uhrzeigersinn zur Zugrichtung. */
  function formationBerechnen(ax, ay, bx, by) {
    const sel = z().einheiten.filter((u) => ui.einheiten.has(u.id));
    const n = sel.length;
    if (!n) return null;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    // WARUM mindestens 3 breit: Ein winziger Zug soll einen kompakten Block geben, keine Gänsemarsch-Kolonne.
    const reihe = Math.max(Math.min(n, 3), Math.min(n, Math.round(len / FORM_ABSTAND) + 1));
    const w = wnorm(Math.round(Math.atan2(-dx, dy) * 180 / Math.PI));
    const x = Math.round((ax + bx) / 2 * 1000), y = Math.round((ay + by) / 2 * 1000);
    const speer = sel.filter((u) => u.typ !== 'bogen').length;
    return { x, y, w, reihe, n, speer, plaetze: formationsPlaetze(n, x, y, w, reihe), ax, ay, bx, by };
  }

  function geistAktualisieren() {
    const w = ui.werkzeug;
    ui.fang = null;
    strassenVorschau();
    ui.strasseUnterMaus = w && (w.typ === 'strasseWeg' || w.typ === 'strasseArt') && ui.maus ? strasseUnter(ui.maus.x, ui.maus.y) : -1;
    if (w && (w.typ === 'mauer' || (w.typ === 'bauen' && w.art === 'turm')) && ui.maus) {
      ui.rasterpunkte = rasterpunkte();
      ui.fang = einrasten(ui.maus);
    } else ui.rasterpunkte = null;
    if (!w || w.typ !== 'bauen' || !ui.maus) { ui.geist = null; return; }
    const typ = GEBAEUDE[w.art];
    const o = { x: Math.round(ui.maus.x * 1000), y: Math.round(ui.maus.y * 1000), b: typ.b, t: typ.t, w: wnorm(winkelZurStrasse(ui.maus.x, ui.maus.y) + ui.drehung) };
    // Wachturm auf einem Mauerknoten: genau dort, ausgerichtet an der Mauer
    if (w.art === 'turm' && ui.fang) { o.x = Math.round(ui.fang.x * 1000); o.y = Math.round(ui.fang.y * 1000); o.w = wnorm((ui.fang.w ?? 0) + ui.drehung); }
    ui.geist = { ...o, grund: auftragPruefen(z(), a.verbindung().spieler, w.art, o) };
  }

  function malenBei(p) {
    const k = Math.floor(p.y) * 1000 + Math.floor(p.x);
    if (k === letzteKachel) return;
    letzteKachel = k;
    a.verbindung().senden({ typ: 'zone', zone: ui.werkzeug.zone, x: Math.floor(p.x * 1000), y: Math.floor(p.y * 1000), r: ui.pinsel });
  }

  function befehlAnAuswahl(p) {
    const ids = [...ui.einheiten].filter((id) => z().einheiten.some((u) => u.id === id));
    if (!ids.length) return false;
    const feind = einheitUnter(p.x, p.y, 'raeuber');
    const wehr = feind ? null : wehrUnter(p.x, p.y);
    if (feind) a.verbindung().senden({ typ: 'einheiten', ids, aktion: 'angriff', ziel: feind.id });
    else if (wehr) a.verbindung().senden({ typ: 'einheiten', ids, aktion: 'mauer', id: wehr.id });
    else a.verbindung().senden({ typ: 'einheiten', ids, aktion: 'gehe', x: Math.round(p.x * 1000), y: Math.round(p.y * 1000) });
    ui.befehlsZiel = { x: p.x, y: p.y, t: a.szeneZeit(), angriff: !!feind, mauer: !!wehr };
    return true;
  }
  /** Fertige eigene Mauer, Torhaus oder Wachturm unter der Maus (für „Stellung beziehen“). */
  function wehrUnter(x, y) {
    let best = null, bd = Infinity;
    for (const g of z().gebaeude) {
      if (g.zustand !== 'fertig' || g.besitzer !== a.verbindung().spieler || !(GEBAEUDE[g.art].mauer || g.art === 'turm')) continue;
      if (!punktIn(g, Math.round(x * 1000), Math.round(y * 1000), 250)) continue;
      const d = (g.x / 1000 - x) ** 2 + (g.y / 1000 - y) ** 2;
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    const p = welt(e);
    ui.maus = p;
    const w = ui.werkzeug;
    const lebende = [...ui.einheiten].some((id) => z().einheiten.some((u) => u.id === id));
    if (e.button === 2 && !w && lebende) {
      // Soldaten ausgewählt: Rechte Taste ziehen = Formation (Klick ohne Ziehen = normaler Befehl)
      ziehen = { art: 'formation', sx: e.clientX, sy: e.clientY, ax: p.x, ay: p.y, bewegt: false, knopf: 2 };
      return;
    }
    if (e.button === 1 || e.button === 2) {
      kamera.anker = null; kamera.zielZoom = kamera.zoom; kamera.flug = null;
      ziehen = { art: 'schieben', sx: e.clientX, sy: e.clientY, kx: kamera.x, ky: kamera.y, bewegt: false, knopf: e.button };
      return;
    }
    if (!w) {
      ziehen = { art: 'rahmen', sx: e.clientX, sy: e.clientY, ax: p.x, ay: p.y, bewegt: false, shift: e.shiftKey };
      return;
    }
    const v = a.verbindung();
    if (w.typ === 'zone') { malen = true; letzteKachel = -1; malenBei(p); }
    else if (w.typ === 'bauen') {
      geistAktualisieren();
      if (ui.geist && !ui.geist.grund) {
        v.senden({ typ: 'bauen', art: w.art, x: ui.geist.x, y: ui.geist.y, w: ui.geist.w });
        if (!e.shiftKey) a.werkzeug(null);
      }
    } else if (w.typ === 'mauer') {
      const f = einrasten(p);
      const q = f ? { x: Math.round(f.x * 1000), y: Math.round(f.y * 1000) } : { x: Math.round(p.x * 1000), y: Math.round(p.y * 1000) };
      if (ui.mauerStart) v.senden({ typ: 'mauer', art: w.art, ax: ui.mauerStart.x, ay: ui.mauerStart.y, bx: q.x, by: q.y });
      ui.mauerStart = q;
    } else if (w.typ === 'strasse') {
      const f = strassenFang(p) || p, pk = ui.strassenPunkte;
      const q = { x: Math.round(f.x * 1000), y: Math.round(f.y * 1000) };
      const letzter = pk[pk.length - 1];
      // Zweimal an dieselbe Stelle (Doppelklick) = fertig
      if (letzter && Math.hypot(letzter.x - q.x, letzter.y - q.y) < 350) { strasseAbschliessen(); strassenVorschau(); return; }
      if (letzter && strassePruefen(z(), v.spieler, letzter.x, letzter.y, q.x, q.y)) return; // rot: Punkt nicht setzen
      pk.push(q);
      strassenVorschau();
    } else if (w.typ === 'strasseWeg' || w.typ === 'strasseArt') {
      const id = strasseUnter(p.x, p.y);
      if (id >= 0) {
        const s = z().strassen[id];
        if (w.typ === 'strasseWeg') v.senden({ typ: 'strasseWeg', id });
        else v.senden({ typ: 'strasseArt', id, art: STRASSEN_ARTEN[(STRASSEN_ARTEN.indexOf(s.art) + 1) % STRASSEN_ARTEN.length] });
      }
    } else if (w.typ === 'sammeln') {
      v.senden({ typ: 'sammeln', x: Math.round(p.x * 1000), y: Math.round(p.y * 1000) });
      a.werkzeug(null);
    } else if (w.typ === 'abriss') {
      const id = gebaeudeUnter(p.x, p.y);
      if (id >= 0) v.senden({ typ: 'abreissen', id });
    }
  });
  addEventListener('mousemove', (e) => {
    const p = welt(e);
    ui.maus = p;
    ui.mausSchirm = { x: e.clientX, y: e.clientY };
    if (ziehen) {
      const dx = e.clientX - ziehen.sx, dy = e.clientY - ziehen.sy;
      if (Math.abs(dx) + Math.abs(dy) > (ziehen.art === 'formation' ? 10 : 5)) ziehen.bewegt = true;
      if (ziehen.art === 'formation') {
        ui.formation = ziehen.bewegt ? formationBerechnen(ziehen.ax, ziehen.ay, p.x, p.y) : null;
      } else if (ziehen.art === 'schieben') {
        kamera.x = ziehen.kx - dx / kamera.zoom; kamera.y = ziehen.ky - dy / kamera.zoom;
        begrenze(kamera);
        if (ziehen.bewegt) canvas.classList.add('ziehen');
      } else if (ziehen.bewegt) ui.rahmen = { ax: ziehen.ax, ay: ziehen.ay, bx: p.x, by: p.y };
      return;
    }
    if (malen && ui.werkzeug && ui.werkzeug.typ === 'zone') malenBei(p);
    geistAktualisieren();
    ui.unterMaus = gebaeudeUnter(p.x, p.y);
  });
  addEventListener('mouseup', (e) => {
    malen = false;
    if (!ziehen) return;
    const p = welt(e);
    if (ziehen.art === 'formation') {
      const f = ziehen.bewegt ? formationBerechnen(ziehen.ax, ziehen.ay, p.x, p.y) : null;
      if (f) {
        const ids = [...ui.einheiten].filter((id) => z().einheiten.some((u) => u.id === id));
        a.verbindung().senden({ typ: 'einheiten', ids, aktion: 'gehe', x: f.x, y: f.y, w: f.w, reihe: f.reihe });
        ui.befehlsZiel = { x: f.x / 1000, y: f.y / 1000, t: a.szeneZeit(), angriff: false, mauer: false };
        ui.formationNach = { ...f, t: a.szeneZeit() };
      } else befehlAnAuswahl(p);
      ui.formation = null;
    } else if (ziehen.art === 'schieben') {
      if (!ziehen.bewegt && ziehen.knopf === 2) {
        // Rechtsklick: Befehl an Soldaten, sonst Werkzeug/Mauerkette beenden
        const w = ui.werkzeug;
        if (w && w.typ === 'mauer' && ui.mauerStart) ui.mauerStart = null;
        else if (w && w.typ === 'strasse' && ui.strassenPunkte.length) { strasseAbschliessen(); strassenVorschau(); }
        else if (w && w.typ === 'sammeln') { a.verbindung().senden({ typ: 'sammeln' }); a.werkzeug(null); }
        else if (w) a.werkzeug(null);
        else befehlAnAuswahl(p);
      }
      canvas.classList.remove('ziehen');
    } else if (ziehen.art === 'rahmen') {
      if (ziehen.bewegt) {
        const x0 = Math.min(ziehen.ax, p.x), x1 = Math.max(ziehen.ax, p.x), y0 = Math.min(ziehen.ay, p.y), y1 = Math.max(ziehen.ay, p.y);
        if (!ziehen.shift) ui.einheiten.clear();
        for (const u of eigeneSoldaten()) if (u.x / 1000 >= x0 && u.x / 1000 <= x1 && u.y / 1000 >= y0 && u.y / 1000 <= y1) ui.einheiten.add(u.id);
        if (ui.einheiten.size) ui.auswahl = -1;
      } else {
        const u = einheitUnter(p.x, p.y, 'soldat');
        if (u && u.besitzer === a.verbindung().spieler) {
          if (!ziehen.shift) ui.einheiten.clear();
          if (ui.einheiten.has(u.id) && ziehen.shift) ui.einheiten.delete(u.id); else ui.einheiten.add(u.id);
          ui.auswahl = -1;
        } else {
          if (!ziehen.shift) ui.einheiten.clear();
          ui.auswahl = gebaeudeUnter(p.x, p.y);
        }
      }
      ui.rahmen = null;
      a.auswahlGeaendert();
    }
    ziehen = null;
  });
  canvas.addEventListener('dblclick', (e) => {
    // Doppelklick auf einen Soldaten: alle Soldaten desselben Typs im Bild auswählen
    const p = welt(e);
    const u = einheitUnter(p.x, p.y, 'soldat');
    if (!u) return;
    const v0 = { x0: kamera.x - kamera.b / 2 / kamera.zoom, x1: kamera.x + kamera.b / 2 / kamera.zoom, y0: kamera.y - kamera.h / 2 / kamera.zoom, y1: kamera.y + kamera.h / 2 / kamera.zoom };
    for (const s of eigeneSoldaten()) if (s.typ === u.typ && s.x / 1000 > v0.x0 && s.x / 1000 < v0.x1 && s.y / 1000 > v0.y0 && s.y / 1000 < v0.y1) ui.einheiten.add(s.id);
    a.auswahlGeaendert();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.shiftKey && ui.werkzeug && ui.werkzeug.typ === 'bauen') { ui.drehung += e.deltaY > 0 ? 15 : -15; geistAktualisieren(); return; }
    // WARUM exp(delta): Mausrad (große Schritte) und Touchpad (viele kleine) zoomen gleich weich.
    const d = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomeUm(kamera, Math.exp(-Math.max(-300, Math.min(300, d)) * 0.0016), e.clientX, e.clientY);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    if (!e.key) return; // z. B. Autofill-Ereignisse ohne Taste
    const t = e.key.toLowerCase();
    tasten.add(t);
    if (t === ' ') { e.preventDefault(); a.setzeTempo(a.verbindung().pause ? a.letztesTempo() : 0); }
    else if (t === '1') a.setzeTempo(1);
    else if (t === '2') a.setzeTempo(2);
    else if (t === '3') a.setzeTempo(4);
    else if (t === 'q') { ui.drehung -= 15; geistAktualisieren(); }
    else if (t === 'e') { ui.drehung += 15; geistAktualisieren(); }
    else if (t === 'z') ui.zonenZeigen = !ui.zonenZeigen;
    else if (t === 'g') { ui.einheiten.clear(); for (const u of eigeneSoldaten()) ui.einheiten.add(u.id); ui.auswahl = -1; a.auswahlGeaendert(); }
    else if (t === 'f' && ui.einheiten.size) a.verbindung().senden({ typ: 'einheiten', ids: [...ui.einheiten], aktion: 'frei' });
    else if (t === 'enter' && ui.werkzeug && ui.werkzeug.typ === 'strasse') { strasseAbschliessen(); strassenVorschau(); }
    else if (t === 'escape') {
      if (ziehen && ziehen.art === 'formation') { ziehen = null; ui.formation = null; }
      else if (ui.strassenPunkte && ui.strassenPunkte.length) { ui.strassenPunkte = []; strassenVorschau(); }
      else if (ui.mauerStart) ui.mauerStart = null;
      else if (ui.werkzeug) a.werkzeug(null);
      else { ui.einheiten.clear(); ui.auswahl = -1; a.auswahlGeaendert(); }
    } else if (t === 'h') a.zurBurg();
  });
  addEventListener('keyup', (e) => { if (e.key) tasten.delete(e.key.toLowerCase()); });
  addEventListener('blur', () => tasten.clear());

  return {
    /** Tastatur-Verschieben (jedes Bild). */
    schritt(dt) {
      const rx = (tasten.has('d') || tasten.has('arrowright') ? 1 : 0) - (tasten.has('a') || tasten.has('arrowleft') ? 1 : 0);
      const ry = (tasten.has('s') || tasten.has('arrowdown') ? 1 : 0) - (tasten.has('w') || tasten.has('arrowup') ? 1 : 0);
      const l = Math.hypot(rx, ry) || 1;
      kameraSchritt(kamera, Math.min(0.1, dt), { x: rx / l, y: ry / l });
    },
    geistAktualisieren,
  };
}
