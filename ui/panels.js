/**
 * panels.js — Oberfläche: Warenleiste, Werkzeuge (Zonen/Aufträge), Stadt-Seite, Chronik, Info, Meldungen.
 *
 * ZWECK:    Zustand anzeigen, Werkzeuge wählen. Befehle nur über verbindung.senden().
 * LIEST:    Zustand, stadtStatus
 * SCHREIBT: nur das ui-Objekt (Werkzeug, Auswahl) und das DOM
 */

import { GEBAEUDE, ZONEN, WARENNAME, WAREN, SCHMIEDE_PRODUKTE, AUSBILDUNG } from '../data/gebaeude.js';
import { JAHRESZEITEN, ZIEL, STEUER, BEDARF, STADTNAME, MILITAER, NIEDERLAGE_BEWOHNER, FELD, KAMPF, HOF_BRAND } from '../data/werte.js';
import { stadtStatus, flurAuswertung, hofAusblick, FLUR_KLASSEN } from '../sim/baumeister.js';
import { tageBisErnte } from '../sim/wirtschaft.js';
import { datum, flaecheVon } from '../sim/lib.js';

const $ = (id) => document.getElementById(id);
const SYMBOL = { nahrung: '🌾', holz: '🪵', stein: '🪨', eisen: '⛓️', speere: '🔱', boegen: '🏹', gold: '🪙' };
const WAREN_TEXT = {
  nahrung: '1 pro Kopf und Tag, auch für Soldaten', holz: 'Bauen und Brennholz im Herbst/Winter', stein: 'Kaserne, Turm, Mauern',
  eisen: 'aus der Erzgrube, für Speere', speere: 'Waffe für Speerträger', boegen: 'Waffe für Bogenschützen', gold: 'Steuern; Rekruten und Sold',
};
const ZONEN_TEXT = [
  'Hebt die Ausschreibung auf (Gebautes bleibt stehen).',
  'Häuser für Zuzügler; am Wasser auch Fischerhütten.',
  'Bauernhöfe mit Feldern. Fruchtbare, flache Böden bringen mehr.',
  'Viehhöfe mit Weide: wenig, aber das ganze Jahr Nahrung.',
  'Holzfäller fällen Bäume in der Nähe und forsten wieder auf.',
  'Steinbruch auf Fels (grau), Erzgrube auf Erz (rostrot).',
];
const AUFTRAG_TEXT = {
  kaserne: 'Bildet Soldaten aus (10 Plätze). Rekrut: 1 Speer oder Bogen + 8 Gold + 1 Bewohner. Unterhalt je Soldat: 1 Nahrung + ⅓ Gold pro Tag. Rekrutieren: fertige Kaserne anklicken.',
  turm: 'Schießt auf Räuber, schützt Häuser in der Nähe (Sicherheit). Über einer Mauer oder Palisade rastet er IN die Mauer ein — Eingang auf der Innenseite.',
  schmiede: 'Macht Waffen aus Holz + Eisen. Eisen kommt aus der Erzgrube (Bergbau auf Erz).',
  speicher: 'Zusätzliches Lager: kürzere Wege für die Träger.',
  palisade: 'Holzwand mit Laufsteg innen. Klicke Punkte nacheinander; Rechtsklick beendet. Zinnen/Spitzen zeigen nach außen, R tauscht die Seite. Neue Stücke rasten an Mauer-Enden und Türmen ein (gelbe Punkte). Über Straßen entsteht ein Torhaus mit zwei Türmen.',
  mauer: 'Steinmauer, viel stabiler: Zinnen außen, Wehrgang innen. Klicke Punkte nacheinander; Rechtsklick beendet. R tauscht innen und außen. Rastet an Mauer-Enden und Türmen ein. Soldaten auswählen + Rechtsklick auf Mauer/Turm/Torhaus = Stellung beziehen (halber Schaden, größere Reichweite).',
  sammeln: 'Klick auf die Karte: Soldaten sammeln sich dort. Noch einmal wählen + Rechtsklick = aufheben.',
  abriss: 'Klick auf ein Gebäude reißt es ab (halbes Material zurück).',
};
const STRASSEN_TEXT = {
  weg: 'Schmaler Erdweg (Feldweg). Punkte klicken; Rechtsklick, Doppelklick oder Enter legt ihn an. Rastet an Straßen ein. Über Wasser entsteht eine Brücke, über Mauern ein Tor.',
  gasse: 'Gasse (mittel). Punkte klicken; Rechtsklick, Doppelklick oder Enter legt sie an. Am Weg baut der Baumeister Häuser, wenn dort Wohnland ist.',
  haupt: 'Hauptstraße (breit, im Stadtkern gepflastert). Punkte klicken; Rechtsklick, Doppelklick oder Enter legt sie an.',
  strasseArt: 'Klick auf eine Straße: Feldweg → Gasse → Hauptstraße → Feldweg.',
  strasseWeg: 'Klick auf eine Straße entfernt sie. Häuser daran bleiben stehen.',
  strasseEdit: 'Fahre über eine Straße: ihre Eckpunkte erscheinen. Klick auf eine Ecke = rund → stark rund → eckig. Punkt ziehen = verschieben.',
};

/** Knopf „beim Wiederaufbau helfen“ (Kosten aus HOF_BRAND), ausgegraut, wenn das Lager nicht reicht. */
function hilfeKnopf(zz, g) {
  const h = zz.herren[g.besitzer], k = HOF_BRAND.hilfe;
  const fehlt = Object.keys(k).filter((w) => (h.lager[w] || 0) < k[w]);
  const preis = Object.entries(k).map(([w, n]) => `${n} ${SYMBOL[w]}`).join(' + ');
  return `<div class="knoepfe"><button data-wiederaufbau="${g.id}" ${fehlt.length ? 'disabled' : ''} title="Die Bauern bauen sofort wieder auf, die Hälfte der Arbeit ist mit deiner Hilfe schon getan">⚒ Beim Wiederaufbau helfen (${preis})</button></div>` + (fehlt.length ? `<div class="klein" style="color:var(--schlecht)">Es fehlt: ${fehlt.map((w) => WARENNAME[w]).join(', ')}</div>` : '');
}

/**
 * Flur (Runde 11): Wie viel Acker-/Weideland ist genutzt, was ist Reserve und warum liegt etwas brach?
 * Gleiche Auswertung wie der Baumeister (sim/baumeister.js flurAuswertung) — Z zeigt dasselbe farbig auf der Karte.
 */
let flurCache = null;
function flurZeilen(zz, herr) {
  if (!flurCache || flurCache.version !== zz.version || flurCache.zonenVersion !== zz.zonenVersion) flurCache = flurAuswertung(zz);
  const zeile = (name, a) => {
    const nutzbar = a[1] + a[2] + a[3] + a[4] + a[7];
    if (!nutzbar) return '';
    const pz = Math.round(a[1] * 100 / nutzbar);
    const tipp = [1, 2, 7, 3, 4, 5, 6].filter((i) => a[i]).map((i) => `${FLUR_KLASSEN[i]}: ${a[i]} Kacheln`).join(' · ')
      + '. Reserve nutzen die Höfe daneben (Felder wachsen nach) oder ein neuer Hof. „Ohne Weg“ braucht erst einen Feldweg. Rest ist zu klein für einen Hof. Taste Z zeigt es auf der Karte.';
    return `<div class="zeile" data-tipp="${tipp}"><span class="w">${name}</span><span>${pz} % genutzt · Reserve ${a[2] + a[7]}${a[4] ? ' · steil ' + a[4] : ''}</span></div>`;
  };
  const z1 = zeile('Ackerland', flurCache.acker), z2 = zeile('Weideland', flurCache.weide);
  if (!z1 && !z2) return '';
  return z1 + z2 + `<div class="klein">${hofAusblick(zz, herr)}</div>`;
}

function kostenText(art) {
  const k = GEBAEUDE[art].kosten || {};
  return Object.entries(k).map(([w, n]) => `${n}${SYMBOL[w]}`).join(' ');
}

export function erzeugePanels(verbindung, ui, aktionen) {
  const z = () => verbindung().zustand;
  // Zonen-Knöpfe
  const zk = $('zonenKnoepfe');
  for (let i = 1; i < ZONEN.length; i++) {
    const f = ZONEN[i].farbe;
    const b = document.createElement('button');
    b.dataset.zone = String(i);
    b.innerHTML = `<span class="farbe" style="background:rgb(${f.join(',')})"></span>${ZONEN[i].name}`;
    b.dataset.tipp = ZONEN_TEXT[i];
    zk.appendChild(b);
  }
  const auf = document.createElement('button');
  auf.dataset.zone = '0'; auf.innerHTML = '✖ Aufheben'; auf.title = ZONEN_TEXT[0];
  zk.appendChild(auf);
  zk.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    aktionen.werkzeug({ typ: 'zone', zone: Number(b.dataset.zone) });
  });
  $('pinsel').addEventListener('input', (e) => { ui.pinsel = Number(e.target.value); $('pinselWert').textContent = e.target.value; });
  // Auftrags-Knöpfe
  const ak = $('auftragKnoepfe');
  const auftraege = [['kaserne', 'Kaserne'], ['turm', 'Wachturm'], ['schmiede', 'Waffenschmiede'], ['speicher', 'Speicher'], ['palisade', 'Palisade'], ['mauer', 'Steinmauer'], ['sammeln', '⚑ Sammelpunkt'], ['abriss', '⛏ Abreißen']];
  for (const [art, name] of auftraege) {
    const b = document.createElement('button');
    b.dataset.art = art;
    const kosten = GEBAEUDE[art] ? kostenText(art) + (GEBAEUDE[art].mauer ? ' /Stück' : '') : '';
    b.innerHTML = `${name}<small>${kosten || '&nbsp;'}</small>`;
    b.dataset.tipp = AUFTRAG_TEXT[art];
    ak.appendChild(b);
  }
  ak.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const art = b.dataset.art;
    if (art === 'palisade' || art === 'mauer') aktionen.werkzeug({ typ: 'mauer', art });
    else if (art === 'sammeln') aktionen.werkzeug({ typ: 'sammeln' });
    else if (art === 'abriss') aktionen.werkzeug({ typ: 'abriss' });
    else aktionen.werkzeug({ typ: 'bauen', art });
  });
  // Straßen-Knöpfe
  const sk = $('strassenKnoepfe');
  for (const [art, name] of [['weg', 'Feldweg'], ['gasse', 'Gasse'], ['haupt', 'Hauptstraße'], ['strasseArt', '⇅ Umwidmen'], ['strasseEdit', '✎ Bearbeiten'], ['strasseWeg', '✖ Entfernen']]) {
    const b = document.createElement('button');
    b.dataset.art = art; b.innerHTML = `${name}<small>&nbsp;</small>`; b.dataset.tipp = STRASSEN_TEXT[art];
    sk.appendChild(b);
  }
  sk.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const art = b.dataset.art;
    aktionen.werkzeug(art === 'strasseArt' || art === 'strasseWeg' || art === 'strasseEdit' ? { typ: art } : { typ: 'strasse', art });
  });
  // Reiter
  $('reiter').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    for (const x of $('reiter').querySelectorAll('button')) x.classList.toggle('an', x === b);
    for (const s of ['stadt', 'chronik']) $('seite-' + s).classList.toggle('versteckt', s !== b.dataset.reiter);
  });
  // Tempo
  $('tempo').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) aktionen.setzeTempo(Number(b.dataset.tempo)); });
  // Stadt-Seite: Klicks (Steuer, Anwerben)
  $('seite-stadt').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.steuer) verbindung().senden({ typ: 'steuer', stufe: Number(b.dataset.steuer) });
    aktualisiere(true);
  });
  $('info').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.wiederaufbau) verbindung().senden({ typ: 'wiederaufbau', id: Number(b.dataset.wiederaufbau) });
    if (b.dataset.abriss) { verbindung().senden({ typ: 'abreissen', id: Number(b.dataset.abriss) }); ui.auswahl = -1; }
    if (b.dataset.zu) { ui.auswahl = -1; ui.einheiten.clear(); }
    if (b.dataset.frei) verbindung().senden({ typ: 'einheiten', ids: [...ui.einheiten], aktion: 'frei' });
    if (b.dataset.rekrut) verbindung().senden({ typ: 'rekrutieren', id: ui.auswahl, art: b.dataset.rekrut, anzahl: Number(b.dataset.n) });
    if (b.dataset.produkt) verbindung().senden({ typ: 'produktion', id: ui.auswahl, produkt: b.dataset.produkt });
    if (b.dataset.ausbildung) verbindung().senden({ typ: 'ausbildung', id: ui.auswahl, art: b.dataset.ausbildung });
    if (b.dataset.transfer) {
      const g = z().gebaeude[ui.auswahl], ware = $('trWare').value;
      verbindung().senden({ typ: 'transfer', von: ui.auswahl, nach: Number($('trNach').value), ware, menge: b.dataset.transfer === 'alle' ? (g.inhalt[ware] || 0) : Number(b.dataset.transfer) });
    }
    aktualisiere(true);
  });
  $('info').addEventListener('change', (e) => {
    if (e.target.id === 'trNach') ui.trNach = e.target.value;
    if (e.target.id === 'trWare') ui.trWare = e.target.value;
  });

  let letzteMeldung = z().ereignisNr;
  const chronik = [];

  function meldungen() {
    const zz = z();
    for (const e of zz.ereignisse) {
      if (e.nr > letzteMeldung && e.typ === 'hofBrand' && e.herr === verbindung().spieler) { popupHofbrand(zz, e.id); continue; }
      if (e.nr <= letzteMeldung || e.typ !== 'meldung' || e.herr !== verbindung().spieler) continue;
      const d = datum(e.tick);
      chronik.unshift({ text: e.text, art: e.art, tag: d.tag + 1 });
      if (e.art !== 'info' || /Auftrag|fertig/.test(e.text)) {
        const m = document.createElement('div');
        m.className = 'm ' + e.art; m.textContent = e.text;
        $('meldungen').appendChild(m);
        setTimeout(() => m.remove(), e.art === 'gefahr' ? 7000 : 4500);
        while ($('meldungen').children.length > 4) $('meldungen').firstChild.remove();
      }
    }
    letzteMeldung = zz.ereignisNr;
    if (chronik.length > 120) chronik.length = 120;
  }

  /**
   * Popup, wenn Räuber einen Hof niedergebrannt haben: helfen (sofortiger Wiederaufbau) oder später entscheiden.
   * WARUM ein Popup: Der Hof wird nicht mehr von selbst neu gebaut — die Entscheidung soll man nicht verpassen.
   */
  function popupHofbrand(zz, id) {
    const g = zz.gebaeude[id];
    if (!g || g.zustand !== 'ruine') return;
    const el = $('popup');
    el.innerHTML = `<h3>🔥 ${GEBAEUDE[g.art].name} niedergebrannt</h3>
      <div class="klein">Räuber haben den Hof angezündet. Die Familie steht vor der Asche. Hilfst du beim Wiederaufbau, beginnen
      sie sofort — sonst verwildern die Felder in ${HOF_BRAND.verfallTage} Tagen und sind verloren.</div>
      <div class="klein">Später: Ruine anklicken (⚒-Zeichen über dem Hof).</div>
      ${hilfeKnopf(zz, g)}<div class="knoepfe"><button data-zeigen="${g.id}">Hinsehen</button><button data-schliessen="1">Später</button></div>`;
    el.classList.remove('versteckt');
  }
  $('popup').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.wiederaufbau) verbindung().senden({ typ: 'wiederaufbau', id: Number(b.dataset.wiederaufbau) });
    if (b.dataset.zeigen) { ui.auswahl = Number(b.dataset.zeigen); aktionen.zeigeGebaeude && aktionen.zeigeGebaeude(ui.auswahl); }
    $('popup').classList.add('versteckt');
  });

  function balken(name, wert, text) {
    const farbe = wert >= 75 ? 'var(--gut)' : wert >= 45 ? 'var(--warn)' : 'var(--schlecht)';
    return `<div class="bed" title="${text}"><div class="kopf"><span>${name}</span><span>${wert}</span></div><div class="balken"><i style="width:${wert}%;background:${farbe}"></i></div></div>`;
  }

  /**
   * Genaue Bevölkerung: wer arbeitet wo, wer ist frei, wer kann rekrutiert werden.
   * WARUM zwei Rekruten-Zahlen: Ein Auftrag des Herrn nimmt notfalls auch einen Arbeiter (sim/wirtschaft.js
   * anwerben), es müssen aber immer NIEDERLAGE_BEWOHNER + 3 Leute in der Stadt bleiben.
   */
  function bevoelkerung(zz, herr, h, st) {
    const arbeit = { nahrung: 0, pflege: 0, holz: 0, bau: 0, stein: 0, eisen: 0, schmiede: 0 };
    let ausbildung = 0, auftraege = 0;
    for (const g of zz.gebaeude) {
      if (g.besitzer !== herr || g.zustand === 'weg') continue;
      if (g.anwerbung > 0) ausbildung++;
      if (g.warteschlange) auftraege += g.warteschlange.length;
      if (!g.belegt) continue;
      if (g.zustand === 'bau') arbeit.bau += g.belegt;
      else if (g.art === 'hof' && !(g.aufgabeFeld >= 0) && g.pflegeFeld >= 0) arbeit.pflege += g.belegt;
      else if (g.art === 'hof' || g.art === 'viehhof' || g.art === 'fischer') arbeit.nahrung += g.belegt;
      else if (g.art === 'holzfaeller') arbeit.holz += g.belegt;
      else if (g.art === 'steinbruch') arbeit.stein += g.belegt;
      else if (g.art === 'erzgrube') arbeit.eisen += g.belegt;
      else if (g.art === 'schmiede') arbeit.schmiede += g.belegt;
    }
    const arbeitend = Object.values(arbeit).reduce((a, b) => a + b, 0);
    const leute = Math.max(0, h.bewohner - NIEDERLAGE_BEWOHNER - 2);
    const waffen = h.lager.speere + h.lager.boegen, goldFuer = Math.floor(h.lager.gold / MILITAER.anwerben.gold);
    const platz = Math.max(0, st.plaetze - st.soldaten - ausbildung);
    const jetzt = Math.min(leute, waffen, goldFuer, platz);
    const grenze = jetzt === leute ? 'Bewohner' : jetzt === waffen ? 'Waffen' : jetzt === goldFuer ? 'Gold' : 'Plätze in Burg/Kaserne';
    return { arbeit, arbeitend, frei: h.arbeitslos, leute, ohneAusfall: Math.min(leute, h.arbeitslos), waffen, goldFuer, platz, jetzt, grenze, ausbildung, auftraege };
  }

  let zuletzt = '', chronikZuletzt = '';
  function aktualisiere(sofort = false) {
    meldungen();
    const zz = z(), herr = verbindung().spieler, h = zz.herren[herr];
    const st = stadtStatus(zz, herr);
    const d = datum(zz.tick);
    $('datum').textContent = `Tag ${d.tag + 1} · ${JAHRESZEITEN[d.jahreszeit]} · Jahr ${d.jahr}`;
    const verbrauch = st.verbrauch;
    const bv = bevoelkerung(zz, herr, h, st);
    const waren = Object.keys(SYMBOL).map((w) => {
      const knapp = (w === 'nahrung' && h.lager.nahrung < verbrauch * 4) || (w === 'holz' && h.lager.holz < 10);
      return `<span class="${knapp ? 'knapp' : ''}" data-tipp="${WARENNAME[w]} – ${WAREN_TEXT[w]}">${SYMBOL[w]} ${h.lager[w]}</span>`;
    }).join('') + `<span data-tipp="Bewohner ${h.bewohner}: ${bv.arbeitend} arbeiten, ${bv.frei} ohne Arbeit · rekrutierbar jetzt ${bv.jetzt} (Details rechts unter Bevölkerung)">👥 ${h.bewohner} <small class="klein">(⚒${bv.arbeitend} · ${bv.frei} frei · 🛡${bv.jetzt})</small></span>`
      + `<span data-tipp="Garnison – Ziel: ${ZIEL.garnison} Mann. Sold: ${Math.ceil(st.soldaten / MILITAER.soldTeiler)} Gold/Tag">🛡️ ${st.soldaten}/${ZIEL.garnison}</span><span data-tipp="Zufriedenheit – ab 50 ziehen Leute zu, unter 35 ziehen sie weg">${h.laune >= 60 ? '🙂' : h.laune >= 35 ? '😐' : '☹️'} ${h.laune}</span>`;
    $('waren').innerHTML = waren;
    for (const b of $('tempo').querySelectorAll('button')) {
      const t = Number(b.dataset.tempo);
      b.classList.toggle('an', t === 0 ? verbindung().pause : !verbindung().pause && verbindung().tempo === t);
    }
    for (const b of $('zonenKnoepfe').querySelectorAll('button')) b.classList.toggle('an', !!ui.werkzeug && ui.werkzeug.typ === 'zone' && ui.werkzeug.zone === Number(b.dataset.zone));
    for (const b of $('auftragKnoepfe').querySelectorAll('button')) {
      const w = ui.werkzeug, a = b.dataset.art;
      b.classList.toggle('an', !!w && (w.art === a || w.typ === a));
    }
    for (const b of $('strassenKnoepfe').querySelectorAll('button')) {
      const w = ui.werkzeug, a = b.dataset.art;
      b.classList.toggle('an', !!w && (w.typ === 'strasse' ? w.art === a : w.typ === a));
    }
    // Werkzeug-Hinweis
    const w = ui.werkzeug;
    let hinweis = 'Werkzeug wählen. Ohne Werkzeug: Klick auf ein Gebäude zeigt Details.';
    if (w && w.typ === 'zone') hinweis = `<b>${ZONEN[w.zone].name}:</b> ${ZONEN_TEXT[w.zone]} Linke Maustaste gedrückt halten und malen.`;
    else if (w && w.typ === 'bauen') hinweis = `<b>${GEBAEUDE[w.art].name}</b> (${kostenText(w.art)}): ${AUFTRAG_TEXT[w.art]} Q/E dreht.` + (ui.geist && ui.geist.grund ? `<br><span style="color:var(--schlecht)">Geht nicht: ${ui.geist.grund}</span>` : '');
    else if (w && w.typ === 'strasse') hinweis = `<b>${{ weg: 'Feldweg', gasse: 'Gasse', haupt: 'Hauptstraße' }[w.art]}:</b> ${STRASSEN_TEXT[w.art]} Esc verwirft.`
      + (ui.strassenPunkte.length ? `<br>${ui.strassenPunkte.length} Punkt${ui.strassenPunkte.length > 1 ? 'e' : ''} gesetzt.` : '')
      + (ui.strassenGrund ? `<br><span style="color:var(--schlecht)">Geht nicht: ${ui.strassenGrund}</span>` : '');
    else if (w && STRASSEN_TEXT[w.typ]) hinweis = STRASSEN_TEXT[w.typ];
    else if (w && w.typ === 'mauer') hinweis = `<b>${GEBAEUDE[w.art].name}</b> (${kostenText(w.art)} je Stück): ${AUFTRAG_TEXT[w.art]}<br>Außenseite: <b>${ui.mauerTauschen ? 'getauscht' : 'automatisch (weg von Burg/Markt)'}</b> — Taste R`;
    else if (w) hinweis = AUFTRAG_TEXT[w.art || w.typ];
    $('werkzeugHinweis').innerHTML = hinweis;

    // Stadt-Seite
    const bed = h.beduerfnisse;
    const tbe = tageBisErnte(zz);
    const reicht = Math.floor(h.lager.nahrung / Math.max(1, verbrauch));
    const zielGarn = st.soldaten >= ZIEL.garnison, zielSatt = h.satteTage >= ZIEL.satteTage;
    const html = `
      <div class="ziel"><b>Ziel</b>
        <div class="zeile"><span>Garnison</span><span class="${zielGarn ? 'ok' : ''}">${st.soldaten} / ${ZIEL.garnison} Mann ${zielGarn ? '✔' : ''}</span></div>
        <div class="zeile"><span>Satte Tage am Stück</span><span class="${zielSatt ? 'ok' : ''}">${Math.min(h.satteTage, ZIEL.satteTage)} / ${ZIEL.satteTage} ${zielSatt ? '✔' : ''}</span></div>
        <div class="klein">Plätze für Soldaten: ${st.plaetze} (Burg 5, je Kaserne 10)</div>
      </div>
      <h3>Bevölkerung · ${h.bewohner} Bewohner + ${st.soldaten} Soldaten</h3>
      <div class="bev">
        <div class="zeile"><span class="w">Arbeiten</span><span><b>${bv.arbeitend}</b></span></div>
        <div class="zeile klein"><span>&nbsp;· Nahrung (Höfe, Vieh, Fischer)</span><span>${bv.arbeit.nahrung}</span></div>
        <div class="zeile klein" data-tipp="Zwischen Saat und Ernte hacken und jäten die Bauern — bis +${FELD.pflegeBonus} % Ertrag"><span>&nbsp;· Feldpflege</span><span>${bv.arbeit.pflege}</span></div>
        <div class="zeile klein"><span>&nbsp;· Holz</span><span>${bv.arbeit.holz}</span></div>
        <div class="zeile klein"><span>&nbsp;· Baustellen</span><span>${bv.arbeit.bau}</span></div>
        <div class="zeile klein"><span>&nbsp;· Stein · Erz · Schmiede</span><span>${bv.arbeit.stein} · ${bv.arbeit.eisen} · ${bv.arbeit.schmiede}</span></div>
        <div class="zeile"><span class="w">Ohne Arbeit</span><span style="color:${bv.frei ? 'var(--warn)' : 'inherit'}"><b>${bv.frei}</b></span></div>
        <div class="zeile" data-tipp="So viele dürfen zum Heer, ohne dass die Stadt unter ${NIEDERLAGE_BEWOHNER + 3} Bewohner fällt. Wer Arbeit hat, fehlt danach dort."><span class="w">Für Rekruten verfügbar</span><span><b>${bv.leute}</b> <small class="klein">(${bv.ohneAusfall} ohne Arbeitsausfall)</small></span></div>
        <div class="zeile" data-tipp="Begrenzt durch Leute, Waffen (${bv.waffen}), Gold (reicht für ${bv.goldFuer}) und freie Plätze (${bv.platz})"><span class="w">Jetzt rekrutierbar</span><span><b>${bv.jetzt}</b> <small class="klein">(Grenze: ${bv.grenze})</small></span></div>
        ${bv.ausbildung || bv.auftraege ? `<div class="zeile klein"><span>&nbsp;· in Ausbildung · in Auftrag</span><span>${bv.ausbildung} · ${bv.auftraege}</span></div>` : ''}
      </div>
      <h3>Bedürfnisse · Zufriedenheit ${h.laune}</h3>
      ${balken('🍞 Nahrung', bed.nahrung, 'Anteil satter Mäuler gestern')}
      ${balken('🏠 Unterkunft', bed.wohnen, 'Wohnplätze je Bewohner')}
      ${balken('🔥 Wärme', bed.waerme, 'Brennholz im Herbst und Winter')}
      ${balken('🛡️ Sicherheit', bed.sicherheit, `Soldaten je ${BEDARF.bewohnerProSoldat} Bewohner, Türme nahe den Häusern, Mauern; Überfälle senken sie`)}
      <h3>Vorrat</h3>
      <div class="zeile"><span class="w">Verbrauch pro Tag</span><span>${verbrauch} 🌾</span></div>
      <div class="zeile"><span class="w">Vorrat reicht</span><span style="color:${reicht < tbe ? 'var(--schlecht)' : 'var(--gut)'}">≈ ${reicht} Tage</span></div>
      <div class="zeile"><span class="w">Nächste Ernte in</span><span>${tbe} Tagen</span></div>
      <div class="zeile"><span class="w">Gestern geliefert</span><span>${h.gestern.nahrung || 0}🌾 ${h.gestern.holz || 0}🪵 ${h.gestern.stein || 0}🪨 ${h.gestern.eisen || 0}⛓️ ${h.gestern.speere || 0}🔱 ${h.gestern.boegen || 0}🏹</span></div>
      <div class="zeile"><span class="w">Steuer / Sold gestern</span><span>+${h.gestern.steuer || 0} / −${h.gestern.sold || 0} 🪙</span></div>
      <h3>Stadt</h3>
      <div class="zeile"><span class="w">Häuser · Wohnplätze</span><span>${st.haeuser} · ${st.wohnKap} (${st.wohnFrei >= 0 ? st.wohnFrei + ' frei' : -st.wohnFrei + ' ohne Dach'})</span></div>
      <div class="zeile"><span class="w">Höfe · Vieh · Fischer</span><span>${st.anzahl.hof || 0} · ${st.anzahl.viehhof || 0} · ${st.anzahl.fischer || 0}</span></div>
      <div class="zeile"><span class="w">Holzfäller · Stein · Erz · Schmiede</span><span>${st.anzahl.holzfaeller || 0} · ${st.anzahl.steinbruch || 0} · ${st.anzahl.erzgrube || 0} · ${st.anzahl.schmiede || 0}</span></div>
      <div class="zeile"><span class="w">Baustellen</span><span>${Object.values(st.anzahlBau).reduce((a, b) => a + b, 0)}</span></div>
      ${flurZeilen(zz, herr)}
      <h3>Steuer</h3>
      <div class="steuer">${STEUER.map((s, i) => `<button data-steuer="${i}" class="${h.steuer === i ? 'an' : ''}" title="Gold/Tag = Bewohner ÷ ${s.teiler}, Laune ${s.laune >= 0 ? '+' : ''}${s.laune}">${s.name}</button>`).join('')}</div>
      <h3>Militär</h3>
      <div class="zeile"><span class="w">Rekrut kostet</span><span>1 🔱/🏹 + ${MILITAER.anwerben.gold} 🪙 + 1 👥</span></div>
      <div class="zeile"><span class="w">Ausbildung</span><span>${MILITAER.anwerben.ticks / 10} s je Rekrut</span></div>
      <div class="zeile"><span class="w">Unterhalt je Soldat</span><span>1 🌾/Tag + ⅓ 🪙/Tag</span></div>
      <div class="zeile"><span class="w">Garnison kostet jetzt</span><span>${st.soldaten} 🌾 + ${Math.ceil(st.soldaten / MILITAER.soldTeiler)} 🪙 pro Tag</span></div>
      <div class="klein">Rekrutieren: Burg oder Kaserne anklicken.</div>
      <h3>Baumeister</h3>
      <div class="log">${h.planLog.slice().reverse().map((t) => `<div>${t}</div>`).join('') || '<div>…</div>'}</div>`;
    if (sofort || html !== zuletzt) { $('seite-stadt').innerHTML = html; zuletzt = html; }
    const chr = `<div class="chronik">${chronik.map((c) => `<div class="${c.art}"><span class="klein">T${c.tag}</span> ${c.text}</div>`).join('')}</div>`;
    if (chr !== chronikZuletzt) { $('seite-chronik').innerHTML = chr; chronikZuletzt = chr; }
    infoAnzeigen(zz);
    tippAnzeigen(zz);
  }

  function inhaltTabelle(g) {
    return `<div class="inhalt">${WAREN.map((w) => `<span data-tipp="${WAREN_TEXT[w]}">${SYMBOL[w]} ${WARENNAME[w]} <b>${g.inhalt[w] || 0}</b></span>`).join('')}</div>`;
  }

  /** Kleines Fenster beim Überfahren eines Lagers: was liegt drin? */
  function tippAnzeigen(zz) {
    const el = $('tipp');
    const g = ui.unterMaus >= 0 ? zz.gebaeude[ui.unterMaus] : null;
    if (!g || g.zustand !== 'fertig' || !GEBAEUDE[g.art].lager || !ui.mausSchirm || ui.werkzeug) { el.classList.add('versteckt'); return; }
    const unterwegs = zz.lieferungen.filter((l) => l.nach === g.id && !l.angekommen).reduce((s, l) => s + l.menge, 0);
    el.innerHTML = `<b>${GEBAEUDE[g.art].name}</b>${inhaltTabelle(g)}${unterwegs ? `<div class="klein">${unterwegs} unterwegs hierher</div>` : ''}`;
    el.style.left = (ui.mausSchirm.x + 16) + 'px'; el.style.top = (ui.mausSchirm.y + 12) + 'px';
    el.classList.remove('versteckt');
  }

  let infoZuletzt = '';
  function infoAnzeigen(zz) {
    const el = $('info');
    let html = '';
    const herr = verbindung().spieler;
    // Ausgewählte Soldaten
    for (const id of [...ui.einheiten]) if (!zz.einheiten.some((u) => u.id === id)) ui.einheiten.delete(id);
    if (ui.einheiten.size) {
      const sel = zz.einheiten.filter((u) => ui.einheiten.has(u.id));
      const speer = sel.filter((u) => u.typ !== 'bogen').length, bogen = sel.length - speer;
      const verletzt = sel.filter((u) => u.hp < u.hpMax).length;
      const frei = sel.filter((u) => !u.befehl).length;
      html = `<h3>${sel.length} Soldaten ausgewählt</h3>
        <div class="klein">${speer} Speerträger · ${bogen} Bogenschützen · ${verletzt} verletzt (heilen in Burg/Kaserne) · ${frei} auf eigene Faust</div>
        <div class="klein">Rechtsklick auf Boden = marschieren und halten · auf Räuber = angreifen · G = alle · F = auf eigene Faust</div>
        <div class="knoepfe"><button data-frei="1" title="Soldaten verteidigen wieder selbstständig und kehren zum Posten zurück">Auf eigene Faust (F)</button><button data-zu="1">Abwählen</button></div>`;
    } else if (ui.auswahl >= 0) {
      const g = zz.gebaeude[ui.auswahl];
      if (!g || g.zustand === 'weg') { ui.auswahl = -1; }
      else {
        const typ = GEBAEUDE[g.art];
        const zeilen = [];
        let extra = '';
        if (g.zustand === 'ruine') {
          const fl = g.felder.map((id) => zz.felder[id]).filter((f) => !f.weg);
          const wild = fl.length ? Math.round(fl.reduce((a, f) => a + (f.verfall || 0), 0) / fl.length / 10) : 100;
          zeilen.push('Abgebrannt. Die Bauern warten auf deine Hilfe — ohne sie baut niemand wieder auf.');
          zeilen.push(`Felder: ${fl.length} übrig, verwildert ${wild} % (ganz verwildert = verloren)`);
          extra += hilfeKnopf(zz, g);
        } else if (g.zustand === 'bau') zeilen.push(`Baustelle: ${Math.floor(Math.min(1, g.arbeit / typ.arbeit) * 100)} % · ${g.belegt} Bauleute ${g.belegt ? '' : '(warten auf freie Hände)'}`);
        else {
          if (typ.arbeiter) zeilen.push(`Arbeiter: ${g.belegt} / ${typ.arbeiter}${g.blockiert ? ' · ' + g.blockiert : ''}`);
          if (typ.ware && g.art !== 'schmiede') zeilen.push(`Erzeugt ${WARENNAME[typ.ware]} · am Gebäude: ${g.puffer} · Träger unterwegs: ${g.traeger}`);
          if (typ.wohnplaetze) zeilen.push(g.art === 'haus' ? `${g.wohn === 8 ? 'Bürgerhaus' : 'Wohnhaus'} · Wohnplätze: ${g.wohn || typ.wohnplaetze}` : `Hier wohnt auch die Familie: ${typ.wohnplaetze} Wohnplätze`);
          if (g.art === 'schmiede') {
            const p = g.pufferWaren || {};
            zeilen.push(`Am Gebäude: ${p.speere || 0} Speere, ${p.boegen || 0} Bögen`);
            extra += `<div class="wahl">Herstellen: ${Object.entries(SCHMIEDE_PRODUKTE).map(([k, v]) => `<button data-produkt="${k}" class="${g.produkt === k ? 'an' : ''}" title="je Stück ${Object.entries(v.material).map(([w, n]) => n + ' ' + WARENNAME[w]).join(' + ')}">${v.name}</button>`).join('')}</div>`;
          }
          if (typ.plaetze) {
            const n = zz.einheiten.filter((u) => u.art === 'soldat' && u.heim === g.id).length;
            const heil = zz.einheiten.filter((u) => u.art === 'soldat' && u.besitzer === herr && u.hp < u.hpMax && Math.hypot(u.x - g.x, u.y - g.y) <= Math.max(g.b, g.t) / 2 + KAMPF.heilRadius).length;
            if (heil) zeilen.push(`Verwundete in Pflege: ${heil} (heilen hier schnell)`);
            zeilen.push(`Soldaten: ${n} / ${typ.plaetze}${g.anwerbung ? ' · Rekrut in Ausbildung (' + Math.floor(g.anwerbung / 3) + ' %)' : ''}`);
            const ws = g.warteschlange || [];
            const zaehl = (a) => ws.filter((x) => x === a).length;
            extra += `<div class="rekrut">${Object.entries(AUSBILDUNG).map(([k, v]) => `<div class="rzeile" data-tipp="${v.text}"><span><b>${v.name}</b> <small>1 ${SYMBOL[v.waffe]} + ${MILITAER.anwerben.gold} 🪙 + 1 👥 · Sold ⅓ 🪙 + 1 🌾/Tag</small></span><span><button data-rekrut="${k}" data-n="1">+1</button><button data-rekrut="${k}" data-n="5">+5</button></span></div>`).join('')}
              <div class="klein">In Auftrag: ${ws.length ? Object.keys(AUSBILDUNG).filter(zaehl).map((a) => zaehl(a) + ' ' + AUSBILDUNG[a].name).join(', ') : 'niemand'} ${ws.length ? '<button data-rekrut="speer" data-n="0">leeren</button>' : ''}</div>
              <div class="wahl" data-tipp="Wenn an: Plätze werden selbstständig aufgefüllt, solange Waffen, Gold, freie Leute und Vorrat reichen.">Automatisch auffüllen: ${['aus', 'speer', 'bogen'].map((k) => `<button data-ausbildung="${k}" class="${(g.auto || 'aus') === k ? 'an' : ''}">${k === 'aus' ? 'aus' : AUSBILDUNG[k].name}</button>`).join('')}</div></div>`;
          }
          if (g.art === 'viehhof') zeilen.push(`Weide dieses Hofs (gelb markiert): ${Math.round(g.felder.reduce((a, id) => a + (zz.felder[id].weg ? 0 : flaecheVon(zz.felder[id])), 0) / 1e6)} Kacheln²`);
          if (g.art === 'hof') {
            const ph = { brach: 'brach', wachsend: 'wächst', reif: 'reif' };
            zeilen.push(`Felder dieses Hofs (gelb markiert): ${g.felder.filter((id) => !zz.felder[id].weg).length} · ${Math.round(g.felder.reduce((a, id) => a + (zz.felder[id].weg ? 0 : flaecheVon(zz.felder[id])), 0) / 1e6)} Kacheln²`);
            zeilen.push('Felder: ' + g.felder.map((id) => { const f = zz.felder[id]; return f.weg ? '—' : ph[f.phase] + (f.phase === 'wachsend' ? ` ${Math.floor(f.stand / 50)}% · gepflegt ${f.pflege || 0}%` : ''); }).join(', '));
            const tun = g.aufgabeFeld >= 0 ? (zz.felder[g.aufgabeFeld].phase === 'reif' ? 'ernten' : 'säen') : g.pflegeFeld >= 0 && g.belegt ? 'hacken und jäten (Feldpflege, bis +' + FELD.pflegeBonus + ' % Ertrag)' : 'nichts zu tun – helfen anderswo';
            zeilen.push('Bauern: ' + tun);
          }
          if (typ.lager) {
            extra += inhaltTabelle(g);
            const andere = zz.gebaeude.filter((x) => x.id !== g.id && x.besitzer === herr && x.zustand === 'fertig' && GEBAEUDE[x.art].lager);
            if (andere.length) {
              extra += `<div class="wahl transfer">Umlagern nach <select id="trNach">${andere.map((x) => `<option value="${x.id}" ${String(x.id) === ui.trNach ? 'selected' : ''}>${GEBAEUDE[x.art].name} (${Math.round(Math.hypot(x.x - g.x, x.y - g.y) / 1000)} Kacheln)</option>`).join('')}</select>
                <select id="trWare">${WAREN.map((w) => `<option value="${w}" ${w === ui.trWare ? 'selected' : ''}>${WARENNAME[w]} (${g.inhalt[w] || 0})</option>`).join('')}</select>
                <button data-transfer="10">10</button><button data-transfer="50">50</button><button data-transfer="alle">alle</button></div>`;
            }
          }
          zeilen.push(`Zustand: ${g.hp} / ${g.hpMax}`);
        }
        const abriss = !['burg', 'platz', 'rathaus', 'kirche'].includes(g.art);
        html = `<h3>${g.art === 'platz' ? 'Marktplatz von ' + STADTNAME : typ.name}</h3>${zeilen.map((t) => `<div class="klein">${t}</div>`).join('')}${extra}
          <div class="knoepfe">${abriss ? `<button data-abriss="${g.id}">Abreißen</button>` : ''}<button data-zu="1">Schließen</button></div>`;
      }
    }
    if (!html) { el.classList.add('versteckt'); infoZuletzt = ''; return; }
    // WARUM vergleichen: nicht neu aufbauen, solange der Spieler ein Auswahlfeld offen hat
    if (html !== infoZuletzt && !(document.activeElement && document.activeElement.tagName === 'SELECT' && el.contains(document.activeElement))) {
      el.innerHTML = html; infoZuletzt = html;
    }
    el.classList.remove('versteckt');
  }

  return { aktualisiere, tipp: () => tippAnzeigen(z()) };
}
