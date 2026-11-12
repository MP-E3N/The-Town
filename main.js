/**
 * main.js — Startet das Spiel: Zustand, Verbindung, Szene, Oberfläche, Takt.
 *
 * ZWECK:    Fester Simulationstakt (10 Ticks/s × Tempo) über einen Akkumulator; gezeichnet wird so oft
 *           der Browser will, Einheiten werden zwischen zwei Ticks überblendet.
 * SCHREIBT: Zustand nur über die Verbindung
 * DEBUG:    window.spiel.z = Zustand, spiel.v = Verbindung, spiel.vorspulen(n), spiel.szene.stat; ?seed=123
 */

import { erzeugeZustand } from './sim/zustand.js';
import { hashZustand } from './sim/lib.js';
import { lokaleVerbindung } from './netz/lokal.js';
import { TICKS_PRO_SEKUNDE } from './data/werte.js';
import { neueKamera, begrenze, setzeZoom, fliegeZu } from './render/kamera.js';
import { erzeugeSzene, zeichneSzene } from './render/szene.js';
import { erzeugePanels } from './ui/panels.js';
import { verbindeEingabe } from './eingabe/maus.js';

const param = new URLSearchParams(location.search);
const seed = Number(param.get('seed')) || (Math.floor(Math.random() * 90000) + 1000);
const zustand = erzeugeZustand(seed);
const verbindung = lokaleVerbindung(zustand);
const kamera = neueKamera();
const ui = { einheiten: new Set(), rahmen: null, befehlsZiel: null, trNach: '', trWare: 'nahrung', werkzeug: null, pinsel: 3, maus: null, mausSchirm: null, geist: null, mauerStart: null, auswahl: -1, unterMaus: -1, zonenZeigen: false, drehung: 0 };
let letztesTempo = 1;

const canvas = document.getElementById('welt');
const szene = erzeugeSzene(canvas, zustand);

function groesse() {
  // WARUM 1,5: doppelte Auflösung kostet 4× Pixel; ab 1,5 sieht man kaum Unterschied.
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  canvas.width = Math.round(innerWidth * dpr); canvas.height = Math.round(innerHeight * dpr);
  kamera.b = innerWidth; kamera.h = innerHeight;
}
addEventListener('resize', groesse);
groesse();

function setzeTempo(n) {
  if (zustand.ergebnis && !weiterGespielt) return;
  if (n === 0) verbindung.pause = true;
  else { verbindung.pause = false; verbindung.tempo = n; letztesTempo = n; }
  panels.aktualisiere();
}
function werkzeug(w) {
  ui.werkzeug = w; ui.mauerStart = null; ui.geist = null; ui.drehung = 0;
  canvas.classList.toggle('werkzeug', !!w);
  eingabe && eingabe.geistAktualisieren();
  panels.aktualisiere();
}
function zurBurg(sofort = false) {
  const b = zustand.gebaeude[zustand.herren[0].burg], m = zustand.gebaeude[zustand.herren[0].markt];
  if (sofort) { kamera.x = (b.x + m.x) / 2000; kamera.y = (b.y + m.y) / 2000; } else fliegeZu(kamera, (b.x + m.x) / 2000, (b.y + m.y) / 2000);
}

const panels = erzeugePanels(() => verbindung, ui, { setzeTempo, werkzeug });
const eingabe = verbindeEingabe(canvas, { verbindung: () => verbindung, kamera, ui, setzeTempo, werkzeug, zurBurg, letztesTempo: () => letztesTempo, szeneZeit: () => szene.zeit, auswahlGeaendert: () => panels.aktualisiere(true) });

document.getElementById('start').addEventListener('click', () => {
  document.getElementById('intro').classList.add('versteckt');
  setzeTempo(1);
});
document.getElementById('hilfeKnopf').addEventListener('click', () => {
  setzeTempo(0);
  document.getElementById('intro').classList.remove('versteckt');
});
document.getElementById('nochmal').addEventListener('click', () => { location.search = ''; });
let weiterGespielt = false;
document.getElementById('weiter').addEventListener('click', () => {
  weiterGespielt = true; verbindung.senden({ typ: 'weiter' });
  document.getElementById('ende').classList.add('versteckt');
  setzeTempo(1);
});

// ── Takt ──
let akku = 0, letzte = performance.now(), letztePanels = 0, endeGezeigt = false;

function bild(jetzt) {
  zeichneBild(jetzt);
  requestAnimationFrame(bild);
}

function zeichneBild(jetzt) {
  const dt = Math.min(250, jetzt - letzte);
  letzte = jetzt;
  const msProTick = 1000 / TICKS_PRO_SEKUNDE / verbindung.tempo;
  if (!verbindung.pause && (!zustand.ergebnis || weiterGespielt)) {
    akku += dt;
    let schritte = 0;
    while (akku >= msProTick && schritte < 12) { verbindung.schritt(); akku -= msProTick; schritte++; }
    if (schritte === 12) akku = 0;
  }
  eingabe.schritt(dt / 1000);
  begrenze(kamera);
  const alpha = verbindung.pause ? 1 : Math.min(1, akku / msProTick);
  const dtSpiel = verbindung.pause || zustand.ergebnis ? 0 : dt / 1000 * verbindung.tempo;
  zeichneSzene(szene, zustand, kamera, ui, alpha, dtSpiel, dt / 1000);
  if (jetzt - letztePanels > 250) {
    panels.aktualisiere(); letztePanels = jetzt;
    // Freie Bildfläche für Randpfeile (Angriffsmarker) neben den Leisten
    const re = document.getElementById('rechts').getBoundingClientRect(), ob = document.getElementById('oben').getBoundingClientRect();
    ui.rand = { r: re.width ? innerWidth - re.left : 0, o: ob.bottom, l: 0 };
  }
  panels.tipp();
  if (zustand.ergebnis && !endeGezeigt) zeigeEnde();
}

function zeigeEnde() {
  endeGezeigt = true;
  const e = zustand.ergebnis, h = zustand.herren[0];
  document.getElementById('endeTitel').textContent = e.titel;
  document.getElementById('endeText').textContent = e.text;
  document.getElementById('endeStatistik').textContent = `Bewohner ${h.bewohner} · Zufriedenheit ${h.laune} · Überfälle ${zustand.ueberfallNr} · Gebäude ${zustand.gebaeude.filter((g) => g.zustand === 'fertig').length}`;
  document.getElementById('weiter').classList.toggle('versteckt', !e.sieg);
  document.getElementById('ende').classList.remove('versteckt');
}

zurBurg(true);
setzeZoom(kamera, 34);
requestAnimationFrame(bild);

// Nur zum Debuggen in der Browser-Konsole.
window.spiel = {
  z: zustand, v: verbindung, kamera, ui, seed, szene, hash: () => hashZustand(zustand),
  vorspulen(n) {
    for (let i = 0; i < n && !zustand.ergebnis; i++) verbindung.schritt();
    akku = 0; letztePanels = 0; letzte = performance.now(); zeichneBild(letzte);
    return zustand.tick;
  },
};
