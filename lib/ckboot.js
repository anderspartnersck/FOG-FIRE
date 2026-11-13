/* ckboot.js — CK BOOT GATE v1. The CASTLE KILLSCREEN boot standard in one copy-in file
   (rules: ANDERS CASTLE KILLSCREEN/BOOT-STANDARD.md). Canonical copy: ANDERS CASTLE KILLSCREEN/lib/ckboot.js;
   each game repo carries its own copy in its lib/ (like ghost.js). Zero deps, no build step.

   Load it FIRST (a plain <script src="lib/ckboot.js"> before the game's script) so its capture-phase
   listeners run before any game listener.

     CKBoot.target       'web' | 'arcade' | 'desktop' | 'app'  (?target=…, else window.CK_BUILD_TARGET, else Electron → 'desktop', else 'web')
     CKBoot.audioFree    true when audio needs no gesture (desktop/Electron/arcade kiosk, or the AudioContext probe starts 'running')
     CKBoot.unlocked     true once audio has been unlocked (always true when audioFree)
     CKBoot.onUnlock(fn) fn runs INSIDE the unlocking gesture (resume your AudioContext, re-kick a blocked <audio>.play()).
                         Runs immediately if already unlocked. Idempotent hooks please: it also re-runs on later real presses.
     CKBoot.hold(ms)     swallow every press for ms (logos/info cards: hold(Infinity) … release(); results: hold(900))
     CKBoot.release()    end a hold
     CKBoot.held()       true while a hold is active — games that poll pads directly check this in their press funnel

   THE RULES IT ENFORCES
     1. FIRST real press (key / click / tap) on a page that needs a gesture only unlocks audio: it is swallowed.
        With audioFree the first press is a normal press.
     2. During a hold every press is swallowed (it still unlocks audio).
     3. Synthetic presses (a pad poller dispatching KeyboardEvents) can't unlock audio in a browser, so they never
        spend the unlock; they ARE swallowed during holds.
     4. A game that ALREADY has its own press-to-start gate (a title card that waits for "press any key") sets
        window.CK_BOOT_OWN_GATE = true before loading this file: that gate press is the unlock, so it is not swallowed.
     5. Browser/OS chords (Cmd/Ctrl/Alt + key) and F-keys always pass.
   A tiny speaker glyph sits bottom-right until audio is unlocked (window.CK_BOOT_GLYPH = false hides it). */
(function () {
  "use strict";
  if (window.CKBoot) return;
  var Q; try { Q = new URLSearchParams(location.search); } catch (e) { Q = new URLSearchParams(""); }
  var ua = (navigator && navigator.userAgent) || "";
  var target = String(Q.get("target") || window.CK_BUILD_TARGET || (/Electron/i.test(ua) ? "desktop" : "web")).toLowerCase();
  var free = target === "desktop" || target === "arcade";
  if (!free) {
    try {                                              // Firefox exposes the policy; everyone else gets a silent probe context
      if (navigator.getAutoplayPolicy) free = navigator.getAutoplayPolicy("audiocontext") === "allowed";
      else { var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { var p = new AC(); free = p.state === "running"; try { p.close(); } catch (e) {} } }
    } catch (e) {}
  }
  var ownGate = !!window.CK_BOOT_OWN_GATE;
  var hooks = [], holdUntil = 0, upCodes = {}, ptrSwallow = 0, ptrDown = false, glyph = null;
  var B = { target: target, audioFree: free, ownGate: ownGate, unlocked: free };
  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function runHooks() { for (var i = 0; i < hooks.length; i++) { try { hooks[i](); } catch (e) {} } }
  B.onUnlock = function (fn) { if (typeof fn !== "function") return; hooks.push(fn); if (B.unlocked) { try { fn(); } catch (e) {} } };
  B.hold = function (ms) { holdUntil = Math.max(holdUntil, ms === Infinity ? Infinity : now() + (+ms || 0)); };
  B.release = function () { holdUntil = 0; };
  B.held = function () { return now() < holdUntil; };
  function stop(e) { try { e.stopImmediatePropagation(); e.preventDefault(); } catch (x) {} }
  function unlock() {
    var first = !B.unlocked; B.unlocked = true; runHooks();
    if (first && glyph) { glyph.style.opacity = "0"; setTimeout(function () { if (glyph && glyph.parentNode) glyph.parentNode.removeChild(glyph); }, 400); }
    return first;
  }
  function passThrough(e) { return e.metaKey || e.ctrlKey || e.altKey || /^F\d+$/.test(e.key || ""); }
  function onKeyDown(e) {
    if (passThrough(e)) return;
    var held = B.held();
    if (e.isTrusted === false) { if (held) stop(e); return; }
    var first = unlock() && !free && !ownGate;
    if (first || held) { upCodes[e.code || e.key] = 1; stop(e); }
  }
  function onKeyUp(e) { var k = e.code || e.key; if (upCodes[k]) { delete upCodes[k]; stop(e); } }
  function onPtrDown(e) {
    var held = B.held();
    if (e.isTrusted === false) { if (held) stop(e); return; }
    var first = unlock() && !free && !ownGate;
    if (first || held) { ptrDown = true; ptrSwallow = now() + 700; stop(e); }
  }
  function onPtrFollow(e) {                            // the rest of a swallowed gesture (touch/mouse compat events, click)
    if (!ptrDown && now() > ptrSwallow) return;
    if (e.type === "pointerup" || e.type === "touchend" || e.type === "mouseup") { ptrDown = false; ptrSwallow = Math.max(ptrSwallow, now() + 400); }
    stop(e);
  }
  var cap = { capture: true, passive: false };
  window.addEventListener("keydown", onKeyDown, cap);
  window.addEventListener("keyup", onKeyUp, cap);
  window.addEventListener("pointerdown", onPtrDown, cap);
  ["pointerup", "mousedown", "mouseup", "click", "touchstart", "touchend", "contextmenu"].forEach(function (t) { window.addEventListener(t, onPtrFollow, cap); });
  if (!free && !ownGate && window.CK_BOOT_GLYPH !== false) {      // the tiny "sound is off" speaker — gone on the first press
    var mk = function () {
      if (B.unlocked || !document.body) return;
      glyph = document.createElement("div"); glyph.setAttribute("aria-hidden", "true"); glyph.id = "ckboot-glyph";
      glyph.style.cssText = "position:fixed;right:10px;bottom:8px;z-index:2147483647;width:18px;height:18px;opacity:.42;pointer-events:none;transition:opacity .35s";
      glyph.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
        + '<path d="M4 9h4l5-4v14l-5-4H4z" fill="#fff"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
      document.body.appendChild(glyph);
    };
    if (document.body) mk(); else document.addEventListener("DOMContentLoaded", mk);
  }
  window.CKBoot = B;
})();
