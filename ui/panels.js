/**
 * panels.js — Oberfläche: Warenleiste, Werkzeuge (Zonen/Aufträge), Stadt-Seite, Chronik, Info, Meldungen.
 *
 * ZWECK:    Zustand anzeigen, Werkzeuge wählen. Befehle nur über verbindung.senden().
 * LIEST:    Zustand, stadtStatus
 * SCHREIBT: nur das ui-Objekt (Werkzeug, Auswahl) und das DOM
 */

import { GEBAEUDE, ZONEN, WARENNAME } from '../data/gebaeude.js';
import { JAHRESZEITEN, ZIEL, STEUER, BEDARF, STADTNAME } from '../data/werte.js';
import { stadtStatus } from '../sim/baumeister.js';
import { tageBisErnte } from '../sim/wirtschaft.js';
import { datum } from '../sim/lib.js';

const $ = (id) => document.getElementById(id);
const SYMBOL = { nahrung: '🌾', holz: '🪵', stein: '🪨', eisen: '⛓️', waffen: '⚔️', gold: '🪙' };
const ZONEN_TEXT = [
  'Hebt die Ausschreibung auf (Gebautes bleibt stehen).',
  'Häuser für Zuzügler; am Wasser auch Fischerhütten.',
  'Bauernhöfe mit Feldern. Fruchtbare, flache Böden bringen mehr.',
  'Viehhöfe mit Weide: wenig, aber das ganze Jahr Nahrung.',
  'Holzfäller fällen Bäume in der Nähe und forsten wieder auf.',
  'Steinbruch auf Fels (grau), Erzgrube auf Erz (rostrot).',
];
const AUFTRAG_TEXT = {
  kaserne: 'Wirbt Soldaten an (10 Plätze). Je Rekrut: 1 Waffe, 8 Gold, 1 Bewohner ohne Arbeit.',
  turm: 'Schießt auf Räuber, schützt Häuser in der Nähe (Sicherheit).',
  schmiede: 'Macht Waffen aus Holz + Eisen. Eisen kommt aus der Erzgrube (Bergbau auf Erz).',
  speicher: 'Zusätzliches Lager: kürzere Wege für die Träger.',
  palisade: 'Holzwand. Klicke Punkte nacheinander; Rechtsklick beendet. Über Straßen wird ein Tor gebaut.',
  mauer: 'Steinmauer, viel stabiler. Klicke Punkte nacheinander; Rechtsklick beendet.',
  sammeln: 'Klick auf die Karte: Soldaten sammeln sich dort. Noch einmal wählen + Rechtsklick = aufheben.',
  abriss: 'Klick auf ein Gebäude reißt es ab (halbes Material zurück).',
};

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
    b.title = ZONEN_TEXT[i];
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
    b.title = AUFTRAG_TEXT[art];
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
    if (b.dataset.anwerben) verbindung().senden({ typ: 'anwerben', an: b.dataset.anwerben === '1' });
    aktualisiere(true);
  });
  $('info').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.abriss) { verbindung().senden({ typ: 'abreissen', id: Number(b.dataset.abriss) }); ui.auswahl = -1; }
    if (b.dataset.zu) ui.auswahl = -1;
    aktualisiere(true);
  });

  let letzteMeldung = z().ereignisNr;
  const chronik = [];

  function meldungen() {
    const zz = z();
    for (const e of zz.ereignisse) {
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

  function balken(name, wert, text) {
    const farbe = wert >= 75 ? 'var(--gut)' : wert >= 45 ? 'var(--warn)' : 'var(--schlecht)';
    return `<div class="bed" title="${text}"><div class="kopf"><span>${name}</span><span>${wert}</span></div><div class="balken"><i style="width:${wert}%;background:${farbe}"></i></div></div>`;
  }

  let zuletzt = '';
  function aktualisiere(sofort = false) {
    meldungen();
    const zz = z(), herr = verbindung().spieler, h = zz.herren[herr];
    const st = stadtStatus(zz, herr);
    const d = datum(zz.tick);
    $('datum').textContent = `Tag ${d.tag + 1} · ${JAHRESZEITEN[d.jahreszeit]} · Jahr ${d.jahr}`;
    const verbrauch = st.verbrauch;
    const waren = Object.keys(SYMBOL).map((w) => {
      const knapp = (w === 'nahrung' && h.lager.nahrung < verbrauch * 4) || (w === 'holz' && h.lager.holz < 10);
      return `<span class="${knapp ? 'knapp' : ''}" title="${WARENNAME[w]}">${SYMBOL[w]} ${h.lager[w]}</span>`;
    }).join('') + `<span title="Bewohner (ohne Arbeit)">👥 ${h.bewohner} <small class="klein">(${h.arbeitslos} frei)</small></span>`
      + `<span title="Garnison">🛡️ ${st.soldaten}/${ZIEL.garnison}</span><span title="Zufriedenheit">${h.laune >= 60 ? '🙂' : h.laune >= 35 ? '😐' : '☹️'} ${h.laune}</span>`;
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
    // Werkzeug-Hinweis
    const w = ui.werkzeug;
    let hinweis = 'Werkzeug wählen. Ohne Werkzeug: Klick auf ein Gebäude zeigt Details.';
    if (w && w.typ === 'zone') hinweis = `<b>${ZONEN[w.zone].name}:</b> ${ZONEN_TEXT[w.zone]} Linke Maustaste gedrückt halten und malen.`;
    else if (w && w.typ === 'bauen') hinweis = `<b>${GEBAEUDE[w.art].name}</b> (${kostenText(w.art)}): ${AUFTRAG_TEXT[w.art]} Q/E dreht.` + (ui.geist && ui.geist.grund ? `<br><span style="color:var(--schlecht)">Geht nicht: ${ui.geist.grund}</span>` : '');
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
      <h3>Bedürfnisse · Zufriedenheit ${h.laune}</h3>
      ${balken('🍞 Nahrung', bed.nahrung, 'Anteil satter Mäuler gestern')}
      ${balken('🏠 Unterkunft', bed.wohnen, 'Wohnplätze je Bewohner')}
      ${balken('🔥 Wärme', bed.waerme, 'Brennholz im Herbst und Winter')}
      ${balken('🛡️ Sicherheit', bed.sicherheit, `Soldaten je ${BEDARF.bewohnerProSoldat} Bewohner, Türme nahe den Häusern, Mauern; Überfälle senken sie`)}
      <h3>Vorrat</h3>
      <div class="zeile"><span class="w">Verbrauch pro Tag</span><span>${verbrauch} 🌾</span></div>
      <div class="zeile"><span class="w">Vorrat reicht</span><span style="color:${reicht < tbe ? 'var(--schlecht)' : 'var(--gut)'}">≈ ${reicht} Tage</span></div>
      <div class="zeile"><span class="w">Nächste Ernte in</span><span>${tbe} Tagen</span></div>
      <div class="zeile"><span class="w">Gestern geliefert</span><span>${h.gestern.nahrung || 0}🌾 ${h.gestern.holz || 0}🪵 ${h.gestern.stein || 0}🪨 ${h.gestern.eisen || 0}⛓️ ${h.gestern.waffen || 0}⚔️</span></div>
      <div class="zeile"><span class="w">Steuer / Sold gestern</span><span>+${h.gestern.steuer || 0} / −${h.gestern.sold || 0} 🪙</span></div>
      <h3>Stadt</h3>
      <div class="zeile"><span class="w">Häuser · Wohnplätze</span><span>${st.haeuser} · ${st.wohnKap} (${st.wohnFrei >= 0 ? st.wohnFrei + ' frei' : -st.wohnFrei + ' ohne Dach'})</span></div>
      <div class="zeile"><span class="w">Höfe · Vieh · Fischer</span><span>${st.anzahl.hof || 0} · ${st.anzahl.viehhof || 0} · ${st.anzahl.fischer || 0}</span></div>
      <div class="zeile"><span class="w">Holzfäller · Stein · Erz · Schmiede</span><span>${st.anzahl.holzfaeller || 0} · ${st.anzahl.steinbruch || 0} · ${st.anzahl.erzgrube || 0} · ${st.anzahl.schmiede || 0}</span></div>
      <div class="zeile"><span class="w">Baustellen</span><span>${Object.values(st.anzahlBau).reduce((a, b) => a + b, 0)}</span></div>
      <h3>Steuer</h3>
      <div class="steuer">${STEUER.map((s, i) => `<button data-steuer="${i}" class="${h.steuer === i ? 'an' : ''}" title="Gold/Tag = Bewohner ÷ ${s.teiler}, Laune ${s.laune >= 0 ? '+' : ''}${s.laune}">${s.name}</button>`).join('')}</div>
      <h3>Anwerben</h3>
      <div class="steuer"><button data-anwerben="1" class="${h.anwerben ? 'an' : ''}">an</button><button data-anwerben="0" class="${!h.anwerben ? 'an' : ''}">aus</button></div>
      <h3>Baumeister</h3>
      <div class="log">${h.planLog.slice().reverse().map((t) => `<div>${t}</div>`).join('') || '<div>…</div>'}</div>`;
    if (sofort || html !== zuletzt) { $('seite-stadt').innerHTML = html; zuletzt = html; }
    $('seite-chronik').innerHTML = `<div class="chronik">${chronik.map((c) => `<div class="${c.art}"><span class="klein">T${c.tag}</span> ${c.text}</div>`).join('')}</div>`;
    infoAnzeigen(zz);
  }

  function infoAnzeigen(zz) {
    const el = $('info');
    if (ui.auswahl < 0) { el.classList.add('versteckt'); return; }
    const g = zz.gebaeude[ui.auswahl];
    if (!g || g.zustand === 'weg') { ui.auswahl = -1; el.classList.add('versteckt'); return; }
    const typ = GEBAEUDE[g.art];
    const zeilen = [];
    if (g.zustand === 'bau') zeilen.push(`Baustelle: ${Math.floor(Math.min(1, g.arbeit / typ.arbeit) * 100)} % · ${g.belegt} Bauleute ${g.belegt ? '' : '(warten auf freie Hände)'}`);
    else {
      if (typ.arbeiter) zeilen.push(`Arbeiter: ${g.belegt} / ${typ.arbeiter}${g.blockiert ? ' · ' + g.blockiert : ''}`);
      if (typ.ware) zeilen.push(`Erzeugt ${WARENNAME[typ.ware]} · am Gebäude: ${g.puffer} · Träger unterwegs: ${g.traeger}`);
      if (typ.wohnplaetze) zeilen.push(`Wohnplätze: ${typ.wohnplaetze}`);
      if (typ.plaetze) {
        const n = zz.einheiten.filter((u) => u.art === 'soldat' && u.heim === g.id).length;
        zeilen.push(`Soldaten: ${n} / ${typ.plaetze}${g.anwerbung ? ' · Rekrut in Ausbildung' : ''}`);
      }
      if (g.art === 'hof') {
        const ph = { brach: 'brach', wachsend: 'wächst', reif: 'reif' };
        zeilen.push('Felder: ' + g.felder.map((id) => { const f = zz.felder[id]; return f.weg ? '—' : ph[f.phase] + (f.phase === 'wachsend' ? ` ${Math.floor(f.stand / 50)}%` : ''); }).join(', '));
      }
      zeilen.push(`Zustand: ${g.hp} / ${g.hpMax}`);
    }
    const abriss = g.art !== 'burg' && g.art !== 'platz';
    el.innerHTML = `<h3>${g.art === 'platz' ? 'Marktplatz von ' + STADTNAME : typ.name}</h3>${zeilen.map((t) => `<div class="klein">${t}</div>`).join('')}
      <div class="knoepfe">${abriss ? `<button data-abriss="${g.id}">Abreißen</button>` : ''}<button data-zu="1">Schließen</button></div>`;
    el.classList.remove('versteckt');
  }

  return { aktualisiere };
}
