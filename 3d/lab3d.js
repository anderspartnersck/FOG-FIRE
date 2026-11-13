// FOG AND FIRE 3D LAB — toggles + badge (render-only). Loaded in <head> before the game's own script.
//  3 = LOOK: BLENDKIT (ground-up 1110: BlenderKit suits + layered 3D theaters) -> 3D (round 5) -> ORIGINAL
//      ?look=r5 / ?look=off start on another look (?look=blendkit is the default)
//  4 = WIRE overlay on/off
//  5 = FOXEY LADY: 02 white heavy <-> 01 black pear        (Joe's open call)
//  6 = BACKDRAFTE: original -> white/red (script) -> red (game palette)   [guide-quality models]
//  7 = SOLITAIRE: original -> lifted blue-black -> engine black #0b0d12  [guide-quality models]
//  8 = SOLITAIRE size (render-only): 0.6 (engine) <-> 0.3 ("man-sized")
(function () {
  const LOOKS = [['blendkit', '3D'], ['finished', '3D (EARLIER SUITS)'], ['off', 'ORIGINAL']]; let badge = null;
  let lookI = Math.max(0, LOOKS.findIndex(l => l[0] === ({ r5: 'finished', off: 'off' }[new URLSearchParams(location.search).get('look')] || 'blendkit')));
  let BK = [];                                       // game suit ids that have a BLENDKIT build (<id>_bk, finished)
  function applyLook() {
    const L = LOOKS[lookI][0];
    Mech3D.setLook(L === 'off' ? 'off' : 'finished'); Mech3D.envMode = L === 'blendkit' ? 'bk' : 'r5';
    for (const b of BK) {
      if (L === 'blendkit') { Mech3D.setVariant(b, b + '_bk'); Mech3D.showGuide(b, true); }
      else { Mech3D.setVariant(b, null); Mech3D.showGuide(b, false); }
    }
    if (L !== 'blendkit') {                          // the round-5 option picks come back
      Mech3D.setVariant('foxeylady', FOX[foxI][0]); opt('backdraft', BD, bdI); opt('solitaire', SOL, solI);
    }
  }
  const FOX = [[null, '02 WHITE'], ['foxeylady_pear', '01 PEAR']]; let foxI = 0;
  const BD = [[null, 'ORIGINAL'], ['backdraft', 'WHITE/RED'], ['backdraft_red', 'GAME RED']]; let bdI = 0;
  const SOL = [[null, 'ORIGINAL'], ['solitaire', 'BLUE-BLACK'], ['solitaire_engine', 'ENGINE BLACK']]; let solI = 0;
  const SSC = [[1, '0.6'], [0.5, '0.3']]; let sscI = 0;
  function opt(base, list, i) {                      // pick an option: a variant id, or null = the game's procedural suit
    const v = list[i][0];
    if (v && !Mech3D.allReady([v])) return false;      // not decoded yet: keep the current look (no half-loaded skin)
    if (!v) { Mech3D.showGuide(base, false); Mech3D.setVariant(base, null); return; }
    Mech3D.showGuide(base, true); Mech3D.setVariant(base, v === base ? null : v);
  }
  function paint() {
    if (!badge) return;
    if (loading) { badge.innerHTML = 'LOADING SUITS…'; return; }
    badge.innerHTML = 'LOOK: ' + LOOKS[lookI][1] + ' [3] · WIRE: ' + (Mech3D.wire > 0 ? 'ON' : 'OFF') + ' [4]<br>' +
      (LOOKS[lookI][0] === 'blendkit' ? 'SOLITAIRE size ' + SSC[sscI][1] + ' [8]'
        : 'FOXEY: ' + FOX[foxI][1] + ' [5] · BACKDRAFTE: ' + BD[bdI][1] + ' [6] · SOLITAIRE: ' + SOL[solI][1] + ' [7] size ' + SSC[sscI][1] + ' [8]');
  }
  // skins: every atlas preloads + decodes at boot; the title/briefing won't advance until they all have (no rig flash)
  let loading = true;
  Promise.all([fetch(window.FAF3D + 'renders/mechs/manifest.json').then(r => r.json()), fetch(window.FAF3D + 'renders/atlas/index.json').then(r => r.json())])
    .then(([man, idx]) => {
      Mech3D.load(window.FAF3D + 'renders/atlas/', man, idx); Mech3D.setLook('finished'); Mech3D.setWire(0); Mech3D.preloadEnv(); Mech3D.preloadEnvBK();
      BK = Object.keys(man).filter(k => k.endsWith('_bk') && man[k].finished && idx[k]).map(k => k.slice(0, -3));
      applyLook(); paint();
      const fin = Mech3D.finishedSids(); Mech3D.preloadSet = fin;            // the lead-in waits for every finished suit
      Mech3D.preload(fin).then(() => { loading = false; paint();
        Mech3D.preload(['backdraft', 'backdraft_red', 'solitaire', 'solitaire_engine']); });   // Joe's options, in the background
    });
  addEventListener('DOMContentLoaded', () => {
    badge = document.createElement('div');
    badge.style.cssText = 'position:fixed;right:10px;bottom:8px;font:11px Courier New;color:#7fd0ff;background:rgba(0,0,0,.6);padding:4px 8px;letter-spacing:1px;z-index:9;pointer-events:none;text-align:right;line-height:1.5';
    document.body.appendChild(badge); paint();
  });
  addEventListener('keydown', e => {
    if (e.code === 'Digit3') { lookI = (lookI + 1) % LOOKS.length; applyLook(); }
    else if (LOOKS[lookI][0] === 'blendkit' && /Digit[567]/.test(e.code)) return;
    else if (e.code === 'Digit4') Mech3D.setWire(Mech3D.wire > 0 ? 0 : 0.55);
    else if (e.code === 'Digit5') { foxI = (foxI + 1) % FOX.length; Mech3D.setVariant('foxeylady', FOX[foxI][0]); }
    else if (e.code === 'Digit6') { const n = (bdI + 1) % BD.length; if (opt('backdraft', BD, n) !== false) bdI = n; }
    else if (e.code === 'Digit7') { const n = (solI + 1) % SOL.length; if (opt('solitaire', SOL, n) !== false) solI = n; }
    else if (e.code === 'Digit8') { sscI = (sscI + 1) % SSC.length; Mech3D.setScale('solitaire', SSC[sscI][0]); }
    else return;
    paint();
  });
})();
