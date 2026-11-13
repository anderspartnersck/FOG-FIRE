// FOG AND FIRE — mech3d.js: the RENDER-ONLY drop-in (NOT wired into the game; it lives in the 3D PIPELINE until
// Joe says go, then goes into a COPY of the game first).
//
// v2 (Joe 2026-10-25: "the skins sorta flicker and in one case it reverted to the base rigging sprite").
//   The cause: v1 loaded one PNG per drawing, lazily, and returned false (=> the engine's procedural drawMech) until
//   each image decoded, so every NEW drawing flashed the old rig. v2 draws from per-suit ATLASES that are preloaded +
//   decoded behind the lead-in (preload()/allReady()), never hands a FINISHED suit back to drawMech, holds the last
//   good drawing if anything is ever not ready, and resolves a missing frame inside the suit (action_0, idle_0) — all
//   counted in M.stats so the skin gate (tools/faf_skin_gate.py) can fail the build on any of it.
//
// What it draws: finished 3D suits (manifest finished:true), Joe's open-call options (variants / guide models), the
// 3D line-art overlay, and the two environments (Lunar Crawler, New Qom plate).
// Contract with index.html (read, never changed): drawMech(f) does translate(f.x,f.y)·scale(f.face,1)·scale(S),
//   S = (boss?1.5:1)·scaleBase·(bigT>0?2.4:1). Same transform here; actor state is only READ.
// Hook (in the lab copy, guarded): the top of drawMech(f):
//   if(typeof Mech3D!=='undefined'&&Mech3D.draw(X,f)){Mech3D.overlay(X,f);return;}
(function (global) {
  const DMG = new Set(['idle', 'walk', 'jab', 'heavy', 'hit']);
  const M = { man: null, atlas: null, base: '', look: 'painted', wire: 0.55, ready: false, prev: new WeakMap(), img: {}, tint: {},
              variant: {}, guides: new Set(), scaleMul: {}, env: true,
              stats: { finished: 0, procedural: 0, fallbackFinished: 0, held: 0, missing: {}, notReady: 0 } };
  // ---------------------------------------------------------------------------------------------- loading ----
  M.load = function (base, manifest, atlasIndex) { M.base = base; M.man = manifest; M.atlas = atlasIndex || {}; M.ready = true; };
  // atlases: <base><sid>_<pass>_<res>x.png. "ok" = loaded AND force-decoded (drawn once to a 1px canvas) so the
  // first in-game draw never stalls or blanks.
  const warm = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas') : null;
  if (warm) { warm.width = warm.height = 1; }
  function sheet(sid, pass, res) {
    res = res || 1; const k = sid + '/' + pass + '/' + res; let im = M.img[k];
    if (!im) { im = new Image(); im._ok = false;
               im.onload = () => { try { warm && warm.getContext('2d').drawImage(im, 0, 0, 1, 1); } catch (e) {} im._ok = true; };
               im.onerror = () => { im._bad = true; }; im.src = M.base + sid + '_' + pass + '_' + res + 'x.webp'; M.img[k] = im; }
    return im;
  }
  function resOf(sid, S) { const a = M.atlas[sid]; return (S > 1.05 && a && a.res['2']) ? 2 : 1; }
  function ok(im) { return im && im._ok && !im._bad; }
  // preload every atlas the lab can show; resolves when ALL are decoded (the lead-in waits on this)
  M.preload = function (sids, passes) {
    const want = []; passes = passes || ['color', 'glow'];
    for (const sid of sids) { const a = M.atlas[sid]; if (!a) continue;
      for (const r in a.res) for (const ps of a.res[r].passes) if (passes.includes(ps)) want.push(sheet(sid, ps, +r)); }
    return Promise.all(want.map(im => new Promise(res => { const t = () => (ok(im) || im._bad) ? res() : setTimeout(t, 20); t(); })));
  };
  M.finishedSids = function () { return Object.keys(M.man || {}).filter(k => k !== '_' && M.man[k].finished && M.atlas[k]); };
  M.preloadSet = null;                                       // what the lead-in waits for (set by the host page)
  M.allReady = function (sids) {
    sids = sids || M.preloadSet || Object.keys(M.atlas);
    return sids.every(sid => { const a = M.atlas[sid]; if (!a) return true;
      return Object.keys(a.res).every(r => a.res[r].passes.filter(ps => ps !== 'wire').every(ps => ok(sheet(sid, ps, +r)))); })
      && (M.envMode !== 'bk' || !M.envReady || M.envReady());
  };
  M.setLook = function (look) { M.look = look; };          // 'finished' | 'painted' | 'proxy' | 'off'
  M.setWire = function (a) { M.wire = a; if (a > 0 && M.atlas) M.preload(Object.keys(M.atlas), ['wire']); };
  M.setVariant = function (base, v) { if (v) M.variant[base] = v; else delete M.variant[base]; };
  M.showGuide = function (base, on) { if (on) M.guides.add(base); else M.guides.delete(base); };
  M.setScale = function (base, k) { M.scaleMul[base] = k; };
  // heroes carry cfg.id; foes don't — the boss FOES.MORNING is the same suit as the MORNING STAR unlock
  const FOE2SUIT = { 'KYLE — MORNING STAR': 'morningstar' };
  function sidOf(f) { return (f.cfg && (f.cfg.id || FOE2SUIT[f.cfg.name])) || f.id; }
  // ---------------------------------------------------------------------------------------------- which drawing ----
  function pick(f, man, sid) {
    const st = f.state, m = man[sid] || {};
    const mem = M.prev.get(f) || { face: f.face, turnT: 0, jumps: 0, boostT: 0 };
    if (mem.face !== f.face) { mem.turnT = 12; mem.oldFace = mem.face; mem.face = f.face; }
    if ((f.jumps || 0) > mem.jumps && f.jumps > 1) mem.boostT = 12;
    mem.jumps = f.jumps || 0; if (mem.turnT > 0) mem.turnT--; if (mem.boostT > 0) mem.boostT--;
    M.prev.set(f, mem);
    const acts = m.actions || {};
    if (f.cfg && f.cfg.boss && f.windup > 0 && acts.tele) return ['tele', (f.windup >> 3) & 1, f.face];
    if ((st === 'jab' || st === 'heavy' || st === 'spec') && m.frames && m.frames[st]) { const t = m.frames[st]; return [st, t[Math.min(t.length - 1, Math.max(0, f.atkT | 0))], f.face]; }
    if (st === 'hit') return ['hit', f.hitLock > 4 ? 0 : 1, f.face];
    if (st === 'down') { const e = 360 - (f.downT || 0); return ['down', e < 10 ? 0 : e < 20 ? 1 : 2, f.face]; }
    if (st === 'block') return ['block', 0, f.face];
    if (f.air) {
      if (mem.boostT > 0) return ['boost', Math.sign(f.vx || 0) === f.face || !f.vx ? 0 : 1, f.face];
      return ['air', f.vy < 0 ? 0 : 1, f.face];
    }
    if (mem.turnT > 0) { const ph = mem.turnT > 8 ? 0 : mem.turnT > 4 ? 1 : 2; return ['turn', ph === 1 ? 1 : 0, ph === 0 ? mem.oldFace : f.face]; }
    if (st === 'walk') return ['walk', ((f.animT || 0) / 5 | 0) % 4, f.face];
    return ['idle', ((f.animT || 0) / 8 | 0) % 4, f.face];
  }
  function resolve(f) {
    const base = sidOf(f), sid = M.variant[base] || base;
    const S = (f.cfg && f.cfg.boss ? 1.5 : 1) * (f.scaleBase || 1) * (f.bigT > 0 ? 2.4 : 1) * (M.scaleMul[base] || 1);
    const [act, i, face] = pick(f, M.man, sid);
    const fr = f.hp / (f.maxhp || 1), tier = fr < 0.33 ? 2 : fr < 0.66 ? 1 : 0;
    return { base, sid, S, act, i, face, name: act + (tier && DMG.has(act) ? '_d' + tier : '') + '_' + i };
  }
  // a missing name resolves INSIDE the suit (counted): name -> undamaged -> action_0 -> idle_0. Never the rig.
  function cellOf(a, r) {
    const fr = a.frames, cands = [r.name, r.act + '_' + r.i, r.act + '_0', 'idle_0'];
    for (let n = 0; n < cands.length; n++) if (fr[cands[n]]) { if (n) M.stats.missing[r.sid + ':' + r.name] = (M.stats.missing[r.sid + ':' + r.name] || 0) + 1; return fr[cands[n]]; }
    return null;
  }
  function blitCell(X, e, im, cell, x, y, face, S, res) {
    const cw = e.cell[0], ch = e.cell[1], k = S / res;           // e = the atlas entry for this res
    X.save(); X.translate(x, y); X.scale(face, 1); X.scale(k, k); X.imageSmoothingEnabled = true;
    X.drawImage(im, cell[0] * cw, cell[1] * ch, cw, ch, -e.anchor[0], -e.anchor[1], cw, ch);
    X.restore(); X.imageSmoothingEnabled = false;
  }
  function wants3D(base, sid) {
    if (!M.ready || M.look === 'off' || !M.atlas[sid] || !M.man[sid]) return false;
    if (M.look === 'proxy') return true;
    return !!M.man[sid].finished || M.guides.has(base);
  }
  // ---------------------------------------------------------------------------------------------- the body ----
  M.draw = function (X, f) {
    if (!M.ready) return false;
    const r = resolve(f);
    if (!wants3D(r.base, r.sid)) {
      if (M.look !== 'off' && M.man[r.sid] && M.man[r.sid].finished) M.stats.fallbackFinished++;   // must stay 0 (gate)
      M.stats.procedural++; return false; }
    const a = M.atlas[r.sid], mem = M.prev.get(f) || {}; let res = resOf(r.sid, r.S), im = sheet(r.sid, 'color', res);
    mem.r = r; M.prev.set(f, mem);
    if (!ok(im) && res === 2 && ok(sheet(r.sid, 'color', 1))) { res = 1; im = sheet(r.sid, 'color', 1); }
    let cell = cellOf(a, r);
    if (!ok(im) || !cell) {                                    // never the rig: hold the last good drawing (counted)
      if (mem.last && ok(sheet(mem.last.sid, 'color', mem.last.res))) { M.stats.held++; cell = mem.last.cell; r.sid = mem.last.sid; res = mem.last.res; im = sheet(r.sid, 'color', res); }
      else { M.stats.notReady++; return true; }
    }
    const E = M.atlas[r.sid].res[String(res)];
    X.save(); X.translate(f.x, f.y); X.fillStyle = 'rgba(0,0,0,.4)'; X.beginPath(); X.ellipse(0, 4, 30 * r.S, 8, 0, 0, 7); X.fill(); X.restore();
    blitCell(X, E, im, cell, f.x, f.y, r.face, r.S, res);
    const g = sheet(r.sid, 'glow', res);
    if (ok(g)) { X.save(); X.globalCompositeOperation = 'lighter'; X.globalAlpha = 0.85; blitCell(X, E, g, cell, f.x, f.y, r.face, r.S, res); X.restore(); }
    mem.last = { sid: r.sid, cell, res }; M.stats.finished++;
    return true;
  };
  // ---------------------------------------------------------------------------------------------- the line-art layer ----
  function tinted(im, col) {
    const k = im.src + col; let c = M.tint[k]; if (c) return c;
    c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col;
    g.fillRect(0, 0, c.width, c.height); M.tint[k] = c; return c;
  }
  const ACC = { sandtrap: '#e8c878', backdraft: '#ffd24a', namor: '#7fd0ff', foxeylady: '#7fd0ff', holyroller: '#3affe0', poison: '#9bff5b', solitaire: '#7fd0ff', morningstar: '#b14bff' };
  M.overlay = function (X, f) {
    if (!M.ready || !(M.wire > 0)) return;
    const mem = M.prev.get(f), r = (mem && mem.r) || resolve(f), a = M.atlas[r.sid]; if (!a) return;
    const w = sheet(r.sid, 'wire', 1), cell = a.frames[r.act + '_' + r.i]; if (!ok(w) || !cell) return;
    X.save(); X.globalAlpha = M.wire; X.globalCompositeOperation = 'lighter'; blitCell(X, a.res['1'], tinted(w, ACC[r.base] || '#7fd0ff'), cell, f.x, f.y, r.face, r.S, 1); X.restore();
  };
  // ---------------------------------------------------------------------------------------------- destroyed ----
  const ghosts = [];
  M.kill = function (f) { const sid = sidOf(f); if (M.atlas && M.atlas[sid]) ghosts.push({ sid, x: f.x, y: f.y, face: f.face, t: 0, boss: !!(f.cfg && f.cfg.boss) }); };
  M.drawGhosts = function (X) {
    for (let j = ghosts.length - 1; j >= 0; j--) {
      const gh = ghosts[j], i = gh.t / 5 | 0; gh.t++;
      if (i > 9) { ghosts.splice(j, 1); continue; }
      const a = M.atlas[gh.sid], cell = a && a.frames['destroyed_' + i]; if (!cell) continue;
      const S = gh.boss ? 1.5 : 1, res = resOf(gh.sid, S), E = a.res[String(res)], im = sheet(gh.sid, 'color', res), g = sheet(gh.sid, 'glow', res);
      if (ok(im)) blitCell(X, E, im, cell, gh.x, gh.y, gh.face, S, res);
      if (ok(g)) { X.save(); X.globalCompositeOperation = 'lighter'; blitCell(X, E, g, cell, gh.x, gh.y, gh.face, S, res); X.restore(); }
    }
  };
  // ---------------------------------------------------------------------------------------------- environments ----
  // env images: <base>/../env/crawler/color_<k>.png (2x, 1200x400, anchor 600,380) · env/newqom/plate.png (2x, 1920x952)
  let envT = 0; const envImgs = {};
  function envImg(rel) {
    let im = envImgs[rel];
    if (!im) { im = new Image(); im._ok = false; im.onload = () => { im._ok = true; }; im.onerror = () => { im._bad = true; }; im.src = M.base + '../env/' + rel; envImgs[rel] = im; }
    return im._ok ? im : null;
  }
  M.preloadEnv = function () { for (let k = 0; k < 4; k++) envImg('crawler/color_' + k + '.webp'); envImg('newqom/plate.webp'); };
  M.crawler = function (X, cx, cy, a) {
    if (!M.ready || !M.env || M.look === 'off') return false;
    if (M.envMode === 'bk') {                              // the BLENDKIT crawler: one plate cut from its set (bottom-centre on cx,cy)
      const im = envImg('../env_bk/crawler/sprite.webp');
      if (im) { const w = 600, h = w * im.naturalHeight / im.naturalWidth;
        X.save(); X.globalAlpha = a; X.imageSmoothingEnabled = true; X.drawImage(im, cx - w / 2, cy - h + 10, w, h); X.restore(); X.imageSmoothingEnabled = false; return true; }
    }
    envT++; const im = envImg('crawler/color_' + ((envT / 5 | 0) % 4) + '.webp') || envImg('crawler/color_0.webp'); if (!im) return false;
    X.save(); X.globalAlpha = a; X.imageSmoothingEnabled = true; X.drawImage(im, cx - 300, cy - 190, 600, 200); X.restore(); X.imageSmoothingEnabled = false;
    return true;
  };
  // ---- BLENDKIT environments (ground-up 1110): layered plates per theater, render-only parallax ------------------------
  // env_bk/<theater>/1x/{far,mid,near}.png, 1056x540 (48 px overscan each side), GROUND row 476; parallax from the
  // heroes' centroid (read only). far+mid draw behind the fight (backdrop hook), near after the ground gradient (floor hook).
  M.envMode = 'r5';                                         // 'bk' = BLENDKIT plates · 'r5' = the round-5 plates
  M.BK_ENV = { pod19: 1, newqom: 1, underhive: 1, ishtar: 1 };
  const PAR = { far: 0.015, mid: 0.04, near: 0.09 };
  function bkImg(t, L) { return envImg('../env_bk/' + t + '/1x/' + L + '.webp'); }
  M.preloadEnvBK = function () { for (const t in M.BK_ENV) for (const L of ['far', 'mid', 'near']) bkImg(t, L); envImg('../env_bk/crawler/sprite.webp'); };
  M.envReady = function () {
    for (const t in M.BK_ENV) for (const L of ['far', 'mid', 'near']) { const k = '../env_bk/' + t + '/1x/' + L + '.webp'; if (!envImgs[k] || !(envImgs[k]._ok || envImgs[k]._bad)) return false; }   // a missing plate = resolved (that theater keeps round 5)
    return true;
  };
  function parX(heroes, W) {
    const hs = (heroes || []).filter(h => h && !h.dead); if (!hs.length) return 0;
    return hs.reduce((a, h) => a + h.x, 0) / hs.length - W / 2;
  }
  function plate(X, im, dx) { X.save(); X.imageSmoothingEnabled = true; X.drawImage(im, -48 - dx, 0, 1056, 540); X.restore(); X.imageSmoothingEnabled = false; }
  M.bkStats = { plates: 0 };
  M.backdropBK = function (X, s, GROUND, heroes) {
    if (!M.ready || !M.env || M.look === 'off' || M.envMode !== 'bk' || !s || !M.BK_ENV[s.id]) return false;
    const far = bkImg(s.id, 'far'), mid = bkImg(s.id, 'mid'); if (!far || !mid) return false;
    const px = Math.max(-480, Math.min(480, parX(heroes, 960)));
    plate(X, far, px * PAR.far); plate(X, mid, px * PAR.mid); M.bkStats.plates += 2;
    return true;
  };
  M.floor = function (X, s, GROUND, heroes) {
    if (!M.ready || !M.env || M.look === 'off' || M.envMode !== 'bk' || !s || !M.BK_ENV[s.id]) return;
    const near = bkImg(s.id, 'near'); if (!near) return;
    const px = Math.max(-480, Math.min(480, parX(heroes, 960)));
    plate(X, near, px * PAR.near); M.bkStats.plates++;
  };
  M.backdrop = function (X, s, GROUND, heroes) {
    if (M.backdropBK(X, s, GROUND, heroes)) return;
    if (!M.ready || !M.env || M.look === 'off' || !s || s.id !== 'newqom') return;
    const im = envImg('newqom/plate.webp'); if (!im) return;
    X.save(); X.globalAlpha = 0.8; X.imageSmoothingEnabled = true; X.drawImage(im, 0, GROUND - 476, 960, 476); X.restore(); X.imageSmoothingEnabled = false;
  };
  // direct draw for other hosts (the TEAM FIGHT prototype): suit + drawing name at the feet point; returns false only
  // if the atlas isn't decoded (the host preloads first, so it never happens in play — and the host counts it).
  M.drawFrame = function (X, sid, name, x, y, face, S, glow) {
    const a = M.atlas && M.atlas[sid]; if (!a) return false;
    const cell = a.frames[name] || a.frames[name.replace(/_d[12]_/, '_')] || a.frames['idle_0']; if (!cell) return false;
    let res = resOf(sid, S), im = sheet(sid, 'color', res);
    if (!ok(im) && res === 2) { res = 1; im = sheet(sid, 'color', 1); }
    if (!ok(im)) return false;
    const E = a.res[String(res)];
    blitCell(X, E, im, cell, x, y, face, S, res);
    const g = sheet(sid, 'glow', res);
    if (glow !== false && ok(g)) { X.save(); X.globalCompositeOperation = 'lighter'; X.globalAlpha = 0.85; blitCell(X, E, g, cell, x, y, face, S, res); X.restore(); }
    return true;
  };
  M.sidOf = sidOf; M.resolve = resolve;
  global.Mech3D = M;
})(this);
