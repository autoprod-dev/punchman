(function () {
  const m = /(?:\?|&)shot=([a-z-]+)/.exec(location.search);
  if (!m) return;
  const kind = m[1];
  function go() {
    const P = window.PUNCHMAN;
    if (!P || !P.ready()) return setTimeout(go, 40);
    const S = P.getState();
    if (S.gold < 200) P.setGold(260);
    P.setSpeedIdx(6);
    for (var i=0;i<22;i++) { if (P.spawnEnemy) P.spawnEnemy(); }
    const app = document.getElementById('app');
    if (kind === 'expanded') {
      app.classList.add('expanded');
      const b = document.getElementById('btn-expand');
      if (b) b.textContent = '▴';
    } else if (kind === 'talents') {
      P.setScreen('talents');
    } else if (kind === 'lobby') {
      P.setScreen('lobby');
    } else {
      P.setScreen('fight');
    }
    var t=document.getElementById('toast'); if(t) t.style.display='none';
    document.title = 'SHOT_READY';
  }
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go);
})();
