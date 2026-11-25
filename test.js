/* Headless playtest. Loaded only with ?test=1 */
(function () {
  const out = document.createElement('pre');
  out.id = 'test-out';
  out.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:99;max-height:30%;overflow:auto;background:#000c;color:#9f8;font:11px monospace;padding:6px;white-space:pre-wrap';
  document.body.appendChild(out);
  const lines = [];
  const errors = [];
  function log(s) { lines.push(s); out.textContent = lines.join('\n'); }
  window.addEventListener('error', (e) => { errors.push('err:' + (e.message || e)); log('ERROR ' + e.message); });
  window.addEventListener('unhandledrejection', (e) => { errors.push('rej:' + e.reason); log('REJ ' + e.reason); });
  const cErr = console.error.bind(console);
  console.error = function () { errors.push([].join.call(arguments, ' ')); cErr.apply(console, arguments); };

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  async function run() {
    const t0 = performance.now();
    let guard = 0;
    while (!window.PUNCHMAN || !window.PUNCHMAN.ready()) {
      await sleep(50);
      if (++guard > 80) { fail('not ready'); return; }
    }
    const P = window.PUNCHMAN;
    log('ready v' + P.version);
    const st0 = P.getState();
    if (typeof st0.gold !== 'number') return fail('no gold');
    if (st0.gold < 0) return fail('negative gold');
    if ('gems' in st0 || 'energy' in st0 || 'crystals' in st0) return fail('non-gold currency in state');
    log('gold ' + st0.gold + ' stage ' + st0.stage);

    const speeds = [];
    for (let i = 0; i < 8; i++) { P.cycleSpeed(); speeds.push(P.getState().speedIdx); }
    if (speeds.join(',') !== '1,2,3,4,5,6,7,0') return fail('speed cycle ' + speeds.join(','));
    P.setSpeedIdx(1);
    log('speed cycle ok');

    P.setGold(5000);
    const d0 = P.getState().ups.dmg;
    if (!P.buyUpgrade('dmg')) return fail('buy dmg');
    if (P.getState().ups.dmg !== d0 + 1) return fail('dmg not incremented');
    if (P.getState().gold >= 5000) return fail('gold not spent');
    ['range', 'rate', 'crit', 'critDmg'].forEach((k) => {
      if (!P.buyUpgrade(k)) throw new Error('buy ' + k);
    });
    log('upgrades ok');

    if (!P.buyTalent('heavy')) return fail('talent heavy');
    if (!P.getState().talents.heavy) return fail('talent not saved in state');
    if (P.buyTalent('deathbomb') === false && !P.getState().talents.heavy) return fail('deathbomb prereq');
    P.buyTalent('deathbomb');
    log('talents ok');

    P.setScreen('lobby');
    if (!document.getElementById('app').classList.contains('lobby')) return fail('lobby class');
    P.setScreen('talents');
    if (!document.getElementById('app').classList.contains('talents')) return fail('talents class');
    P.setScreen('expanded');
    if (!document.getElementById('app').classList.contains('expanded')) return fail('expanded class');
    P.setScreen('fight');
    log('screens ok');

    P.save();
    const raw = localStorage.getItem('punchman-save-v1');
    if (!raw || raw.indexOf('"talents"') < 0) return fail('save missing');
    const parsed = JSON.parse(raw);
    if (parsed.ups.dmg < 1) return fail('save ups');
    log('save ok');

    P.setSpeedIdx(7); // x10
    let kills = 0, waited = 0;
    while (waited < 6000) {
      await sleep(400);
      waited += 400;
      kills = P.getState().totalKills;
      if (kills >= 3) break;
    }
    const fps = P.fps();
    log('fps ' + fps.toFixed(1) + ' kills ' + kills + ' gold ' + Math.floor(P.getState().gold) + ' wait ' + waited);
    if (fps < 20) return fail('low fps ' + fps.toFixed(1));
    if (kills < 1) return fail('no kills in play loop');

    // reload-from-storage simulation
    const goldBefore = P.getState().gold;
    const P2raw = localStorage.getItem('punchman-save-v1');
    const P2 = JSON.parse(P2raw);
    if (Math.abs(P2.gold - goldBefore) > 5000) return fail('save gold drift');
    log('reload payload ok');

    if (errors.length) return fail('console ' + errors.join(' | '));
    const ms = Math.round(performance.now() - t0);
    log('PASS in ' + ms + 'ms');
    document.title = 'TEST_PASS';
    document.documentElement.dataset.test = 'PASS';
  }
  function fail(m) {
    log('FAIL ' + m);
    document.title = 'TEST_FAIL ' + m;
    document.documentElement.dataset.test = 'FAIL:' + m;
  }
  if (document.readyState === 'complete') run();
  else window.addEventListener('load', run);
})();
