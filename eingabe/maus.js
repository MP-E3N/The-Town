/**
 * maus.js — Maus und Tastatur.
 *
 * ZWECK:    Kamera bewegen, Werkzeuge anwenden (Zonen malen, Aufträge setzen, Mauern ziehen).
 * SCHREIBT: Kamera, ui-Objekt; Spielzustand nur über verbindung.senden()
 */

import { GEBAEUDE } from '../data/gebaeude.js';
import { zuWelt, zoomeUm, begrenze } from '../render/kamera.js';
import { auftragPruefen } from '../sim/befehle.js';
import { abgeleitet } from '../sim/abgeleitet.js';
import { punktIn, wnorm } from '../sim/lib.js';

export function verbindeEingabe(canvas, a) {
  const { kamera, ui } = a;
  let ziehen = null, malen = false, letzteKachel = -1;
  const tasten = new Set();

  const welt = (e) => zuWelt(kamera, e.clientX, e.clientY);

  function gebaeudeUnter(x, y) {
    const z = a.verbindung().zustand;
    let best = -1;
    for (const g of z.gebaeude) {
      if (g.zustand === 'weg' || g.art === 'platz' && best >= 0) continue;
      if (punktIn(g, Math.round(x * 1000), Math.round(y * 1000), 150)) best = g.id;
    }
    return best;
  }

  /** Winkel, damit die Front zur nächsten Straße zeigt. */
  function winkelZurStrasse(x, y) {
    const z = a.verbindung().zustand, c = abgeleitet(z);
    let best = null, bd = 25;
    for (const s of c.segmente) {
      const ax = s.ax / 1000, ay = s.ay / 1000, bx = s.bx / 1000, by = s.by / 1000;
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2));
      const qx = ax + dx * t, qy = ay + dy * t, d = (qx - x) ** 2 + (qy - y) ** 2;
      if (d < bd) { bd = d; best = { qx, qy }; }
    }
    if (!best) return 0;
    const d = Math.atan2(best.qy - y, best.qx - x) * 180 / Math.PI;
    return Math.round(d + 90);
  }

  function geistAktualisieren() {
    const w = ui.werkzeug;
    if (!w || w.typ !== 'bauen' || !ui.maus) { ui.geist = null; return; }
    const typ = GEBAEUDE[w.art];
    const o = { x: Math.round(ui.maus.x * 1000), y: Math.round(ui.maus.y * 1000), b: typ.b, t: typ.t, w: wnorm(winkelZurStrasse(ui.maus.x, ui.maus.y) + ui.drehung) };
    const grund = auftragPruefen(a.verbindung().zustand, a.verbindung().spieler, w.art, o);
    ui.geist = { ...o, grund };
  }

  function malenBei(p) {
    const k = Math.floor(p.y) * 1000 + Math.floor(p.x);
    if (k === letzteKachel) return;
    letzteKachel = k;
    a.verbindung().senden({ typ: 'zone', zone: ui.werkzeug.zone, x: Math.floor(p.x * 1000), y: Math.floor(p.y * 1000), r: ui.pinsel });
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    const p = welt(e);
    ui.maus = p;
    const w = ui.werkzeug;
    if (e.button === 1 || (e.button === 0 && !w) || (e.button === 2 && !w)) {
      ziehen = { sx: e.clientX, sy: e.clientY, kx: kamera.x, ky: kamera.y, bewegt: false, knopf: e.button };
      canvas.classList.add('ziehen');
      return;
    }
    if (e.button === 2) {
      if (w.typ === 'mauer' && ui.mauerStart) ui.mauerStart = null;
      else if (w.typ === 'sammeln') { a.verbindung().senden({ typ: 'sammeln' }); a.werkzeug(null); }
      else a.werkzeug(null);
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
      const q = { x: Math.round(p.x * 1000), y: Math.round(p.y * 1000) };
      if (ui.mauerStart) v.senden({ typ: 'mauer', art: w.art, ax: ui.mauerStart.x, ay: ui.mauerStart.y, bx: q.x, by: q.y });
      ui.mauerStart = q;
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
      if (Math.abs(dx) + Math.abs(dy) > 4) ziehen.bewegt = true;
      kamera.x = ziehen.kx - dx / kamera.zoom; kamera.y = ziehen.ky - dy / kamera.zoom;
      begrenze(kamera);
      return;
    }
    if (malen && ui.werkzeug && ui.werkzeug.typ === 'zone') malenBei(p);
    geistAktualisieren();
    ui.unterMaus = gebaeudeUnter(p.x, p.y);
  });
  addEventListener('mouseup', (e) => {
    if (ziehen) {
      if (!ziehen.bewegt && ziehen.knopf === 0) {
        const p = welt(e);
        ui.auswahl = gebaeudeUnter(p.x, p.y);
      }
      ziehen = null; canvas.classList.remove('ziehen');
    }
    malen = false;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.shiftKey && ui.werkzeug && ui.werkzeug.typ === 'bauen') { ui.drehung += e.deltaY > 0 ? 15 : -15; geistAktualisieren(); return; }
    zoomeUm(kamera, e.deltaY > 0 ? 1 / 1.15 : 1.15, e.clientX, e.clientY);
  }, { passive: false });

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const t = e.key.toLowerCase();
    tasten.add(t);
    if (t === ' ') { e.preventDefault(); a.setzeTempo(a.verbindung().pause ? a.letztesTempo() : 0); }
    else if (t === '1') a.setzeTempo(1);
    else if (t === '2') a.setzeTempo(2);
    else if (t === '3') a.setzeTempo(4);
    else if (t === 'q') { ui.drehung -= 15; geistAktualisieren(); }
    else if (t === 'e') { ui.drehung += 15; geistAktualisieren(); }
    else if (t === 'z') ui.zonenZeigen = !ui.zonenZeigen;
    else if (t === 'escape') { if (ui.mauerStart) ui.mauerStart = null; else { a.werkzeug(null); ui.auswahl = -1; } }
    else if (t === 'h') a.zurBurg();
  });
  addEventListener('keyup', (e) => tasten.delete(e.key.toLowerCase()));

  /** Tastatur-Verschieben (jedes Bild). */
  return {
    schritt(dt) {
      const s = 600 / kamera.zoom * dt;
      if (tasten.has('a') || tasten.has('arrowleft')) kamera.x -= s;
      if (tasten.has('d') || tasten.has('arrowright')) kamera.x += s;
      if (tasten.has('w') || tasten.has('arrowup')) kamera.y -= s;
      if (tasten.has('s') || tasten.has('arrowdown')) kamera.y += s;
      begrenze(kamera);
    },
    geistAktualisieren,
  };
}
