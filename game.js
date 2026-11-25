
/* Punchman v1.0.1 — Autoprod. Original three.js idle ring brawler. */
(function () {
  'use strict';
  const VERSION = '1.0.1';
  const SAVE_KEY = 'punchman-save-v1';
  const SPEEDS = [1, 2, 3, 5, 6, 8, 9, 10];
  const MAX_E = 40;
  const RING_R = 5.15;
  const PLAT_H = 0.42;
  const FLOOR_Y = PLAT_H + 0.012;

  if (typeof THREE === 'undefined') {
    document.title = 'Punchman (no WebGL library)';
    return;
  }

  function defaultState() {
    return {
      gold: 80,
      stage: 1,
      stageKills: 0,
      level: 1,
      xp: 0,
      hp: 100,
      recovering: 0,
      speedIdx: 0,
      ups: { dmg: 0, range: 0, rate: 0, crit: 0, critDmg: 0 },
      talents: {},
      petLv: 1,
      heroLv: 1,
      helperOn: true,
      items: { wraps: true, boots: false, belt: false },
      ringLv: 1,
      goals: {
        a: { id: 'kills', need: 10, have: 0, text: 'Defeat 10 enemies' },
        b: { id: 'buys', need: 3, have: 0, text: 'Buy 3 upgrades' }
      },
      unlocks: { speedHint: false },
      totalKills: 0,
      totalGold: 0
    };
  }

  let S = defaultState();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) S = Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* ignore */ }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }
  let saveTimer = 0;
  function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 600);
  }

  /* ---------- derived stats ---------- */
  function hasTal(id) { return !!S.talents[id]; }
  function maxHp() {
    let h = 100 + 18 * (S.level - 1) + (S.items.boots ? 40 : 0) + S.ringLv * 6 + S.heroLv * 4;
    return Math.round(h);
  }
  function goldFind() {
    let m = 1;
    if (S.level >= 5) m += 0.08;
    if (hasTal('goldfever')) m += 0.25;
    return m;
  }
  function dmgStat() {
    let d = 8 + 2.5 * S.ups.dmg + S.petLv * 0.4 + S.heroLv * 0.6 + (S.items.wraps ? 1 : 0);
    if (hasTal('heavy')) d *= 1.18;
    d *= 1 + S.ringLv * 0.01;
    return d;
  }
  function rangeFt() { return 3.6 + 0.22 * S.ups.range + (hasTal('long') ? 0.7 : 0); }
  function rangeWorld() { return 2.15 + rangeFt() * 0.28; }
  function rateSec() {
    let r = 0.92 - 0.045 * S.ups.rate;
    if (hasTal('quick')) r *= 0.86;
    return Math.max(0.20, r);
  }
  function critCh() {
    let c = 5 + 1.6 * S.ups.crit + (hasTal('lucky') ? 8 : 0) + (S.items.belt ? 5 : 0);
    return Math.min(60, c);
  }
  function critDmg() { return 1.5 + 0.08 * S.ups.critDmg; }
  function upCost(key) {
    const lv = S.ups[key] || 0;
    const base = { dmg: 12, range: 14, rate: 16, crit: 18, critDmg: 20 }[key] || 15;
    return Math.floor(base * Math.pow(1.155, lv));
  }
  function stageNeed() { return 12 + S.stage * 3; }
  function stageReward() { return 30 + S.stage * 8; }
  function xpNeed() { return Math.floor(40 * Math.pow(1.22, S.level - 1)); }
  function takenMul() { return hasTal('iron') ? 0.85 : 1; }
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.0+$/, '') + 'M';
    if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    if (n >= 1000) return (n / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'K';
    return String(n);
  }

  /* ---------- UI ---------- */
  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const toastEl = $('toast');
  let toastT = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }

  const SKILL_DEFS = [
    { id: 'shock', name: 'Shockwave', unlock: 1, cd: 5, icon: 'shock' },
    { id: 'star', name: 'Star smash', unlock: 2, cd: 7, icon: 'star' },
    { id: 'pulse', name: 'Pulse', unlock: 5, cd: 10, icon: 'pulse' },
    { id: 'lock', name: 'Locked', unlock: 12, cd: 14, icon: 'lock' }
  ];
  let skillCd = { shock: 0, star: 0, pulse: 0, lock: 0 };

  function skillIcon(id, locked) {
    if (id === 'shock') return '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M7 14c4-7 9-8 12-3" stroke="#ffd36a" stroke-width="2.2" fill="none"/><circle cx="8" cy="15" r="4.2" fill="#e24b4b"/><circle cx="17" cy="11" r="3.2" fill="#ff6b4a"/></svg>';
    if (id === 'star') return '<svg width="24" height="24" viewBox="0 0 24 24"><path d="M12 3l2.2 6.2L21 11l-5.2 3.4L17 21l-5-3.2L7 21l1.2-6.6L3 11l6.8-1.8L12 3Z" fill="#ffe27a"/></svg>';
    if (id === 'pulse') return '<svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#7ad0ff" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="#7ad0ff"/></svg>';
    return '<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="6" y="11" width="12" height="9" rx="2" stroke="#a090c0" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="#a090c0" stroke-width="2"/></svg>';
  }

  function renderSkills() {
    const el = $('skills');
    el.innerHTML = SKILL_DEFS.map((s) => {
      const locked = S.stage < s.unlock;
      const cd = skillCd[s.id] || 0;
      return '<div class="sk' + (locked ? ' locked' : '') + '" data-sk="' + s.id + '">' +
        (locked ? skillIcon('lock') : skillIcon(s.icon)) +
        (!locked && cd > 0.05 ? '<div class="cd">' + Math.ceil(cd) + 's</div>' : '') +
        '</div>';
    }).join('');
  }

  function renderPassives() {
    const items = [
      { on: S.level >= 3, t: 'Knockback<br>+12%' },
      { on: S.level >= 5, t: 'Gold find<br>+8%' },
      { on: hasTal('iron'), t: 'Iron Skin<br>-15%' },
      { on: hasTal('goldfever'), t: 'Gold Fever<br>+25%' }
    ];
    $('pas-row').innerHTML = items.map((p) => '<div class="pas' + (p.on ? '' : ' locked') + '">' + (p.on ? p.t : 'Locked') + '</div>').join('');
  }

  function refreshUI() {
    $('gold-amt').textContent = fmt(S.gold);
    $('stage-lbl').textContent = 'Stage-' + S.stage;
    $('stage-reward').textContent = String(stageReward());
    const need = stageNeed();
    const pct = Math.min(100, (S.stageKills / need) * 100);
    $('stage-fill').style.width = pct + '%';
    const tag = $('unlock-tag');
    if (S.stage <= 2) tag.innerHTML = 'UNLOCK<br>SPEED UP';
    else if (S.stage < 5) tag.innerHTML = 'UNLOCK<br>SKILL';
    else tag.innerHTML = 'UNLOCK<br>TALENT';
    const hpM = maxHp();
    if (S.hp > hpM) S.hp = hpM;
    $('hp-fill').style.width = (100 * S.hp / hpM) + '%';
    $('hp-lbl').textContent = Math.ceil(S.hp) + ' / ' + hpM;
    $('lv-lbl').textContent = 'Lv ' + S.level;
    const xn = xpNeed();
    $('xp-fill').style.width = (100 * S.xp / xn) + '%';
    $('xp-lbl').textContent = Math.floor(S.xp) + ' / ' + xn;
    $('st-dmg').textContent = dmgStat().toFixed(1);
    $('st-range').textContent = rangeFt().toFixed(1) + ' ft';
    $('st-rate').textContent = rateSec().toFixed(2) + 's';
    $('st-crit').textContent = critCh().toFixed(0) + '%';
    $('st-critDmg').textContent = Math.round(critDmg() * 100) + '%';
    ['dmg', 'range', 'rate', 'crit', 'critDmg'].forEach((k) => {
      const el = $('c-' + k);
      if (el) el.textContent = fmt(upCost(k));
    });
    $('btn-speed').textContent = 'x' + SPEEDS[S.speedIdx];
    $('g1-t').textContent = S.goals.a.text;
    $('g2-t').textContent = S.goals.b.text;
    $('g1-n').textContent = S.goals.a.have + '/' + S.goals.a.need;
    $('g2-n').textContent = S.goals.b.have + '/' + S.goals.b.need;
    $('g1-fill').style.width = (100 * S.goals.a.have / S.goals.a.need) + '%';
    $('g2-fill').style.width = (100 * S.goals.b.have / S.goals.b.need) + '%';
    $('ver').textContent = VERSION;
    renderSkills();
    renderPassives();
    if (rangeRing) {
      const rw = rangeWorld();
      rangeRing.scale.set(rw / 2.4, rw / 2.4, 1);
      rangeRing2.scale.set(rw / 2.4, rw / 2.4, 1);
    }
  }

  function gainGold(n) {
    const g = n * goldFind();
    S.gold += g;
    S.totalGold += g;
    saveSoon();
  }
  function addXp(n) {
    S.xp += n;
    let guard = 0;
    while (S.xp >= xpNeed() && guard++ < 8) {
      S.xp -= xpNeed();
      S.level++;
      S.hp = maxHp();
      toast('Level ' + S.level + '!');
    }
  }
  function goal(kind, amt) {
    ['a', 'b'].forEach((k) => {
      const g = S.goals[k];
      if (g.id === kind) g.have = Math.min(g.need, g.have + amt);
      if (g.have >= g.need) {
        gainGold(20 + S.stage * 4);
        toast('Goal done! +gold');
        rollGoal(k);
      }
    });
  }
  function rollGoal(slot) {
    const optsA = [
      { id: 'kills', need: 10 + S.stage * 2, text: 'Defeat ' + (10 + S.stage * 2) + ' enemies' },
      { id: 'kills', need: 20 + S.stage, text: 'Defeat ' + (20 + S.stage) + ' enemies' }
    ];
    const optsB = [
      { id: 'buys', need: 3, text: 'Buy 3 upgrades' },
      { id: 'stage', need: 1, text: 'Clear this stage' },
      { id: 'kills', need: 15, text: 'Defeat 15 enemies' }
    ];
    const pick = (slot === 'a' ? optsA : optsB)[Math.floor(Math.random() * (slot === 'a' ? optsA.length : optsB.length))];
    S.goals[slot] = { id: pick.id, need: pick.need, have: 0, text: pick.text };
  }

  function buyUpgrade(key) {
    if (!(key in S.ups)) return false;
    const c = upCost(key);
    if (S.gold < c) { toast('Need ' + fmt(c) + ' gold'); return false; }
    S.gold -= c;
    S.ups[key]++;
    goal('buys', 1);
    refreshUI();
    save();
    toast(key.toUpperCase() + ' up!');
    return true;
  }

  function setSpeedIdx(i) {
    S.speedIdx = ((i % SPEEDS.length) + SPEEDS.length) % SPEEDS.length;
    refreshUI();
    saveSoon();
  }
  function cycleSpeed() { setSpeedIdx(S.speedIdx + 1); }

  function setScreen(name) {
    app.classList.remove('lobby', 'talents', 'settings', 'expanded');
    if (name === 'lobby') app.classList.add('lobby');
    else if (name === 'talents') app.classList.add('talents');
    else if (name === 'settings') app.classList.add('settings');
    else if (name === 'expanded') app.classList.add('expanded');
    if (name === 'lobby') renderLobby(currentTab);
  }

  /* ---------- talents ---------- */
  const TALENTS = [
    { id: 'heavy', name: 'Heavy Hands', desc: 'Damage +18%', cost: 60, req: null, row: 0 },
    { id: 'long', name: 'Long Guard', desc: 'Range +16%', cost: 60, req: null, row: 0 },
    { id: 'quick', name: 'Quick Fists', desc: 'Punch rate +14%', cost: 80, req: null, row: 0 },
    { id: 'lucky', name: 'Lucky Hits', desc: 'Crit chance +8%', cost: 80, req: null, row: 0 },
    { id: 'deathbomb', name: 'Deathbomb', desc: 'Foes burst on defeat', cost: 140, req: 'heavy', row: 1 },
    { id: 'void', name: 'Void', desc: 'A void pulse every 8s', cost: 160, req: 'long', row: 1 },
    { id: 'thunder', name: 'Thunder', desc: 'Lightning jumps between foes', cost: 180, req: 'quick', row: 1 },
    { id: 'meteor', name: 'Meteor', desc: 'Meteors fall on the ring', cost: 200, req: 'lucky', row: 1 },
    { id: 'iron', name: 'Iron Skin', desc: 'Damage taken −15%', cost: 120, req: null, row: 2 },
    { id: 'goldfever', name: 'Gold Fever', desc: 'Gold from fights +25%', cost: 100, req: null, row: 2 }
  ];
  function canBuyTalent(t) {
    if (S.talents[t.id]) return false;
    if (t.req && !S.talents[t.req]) return false;
    return S.gold >= t.cost;
  }
  function buyTalent(id) {
    const t = TALENTS.find((x) => x.id === id);
    if (!t) return false;
    if (S.talents[t.id]) { toast('Already owned'); return false; }
    if (t.req && !S.talents[t.req]) { toast('Need ' + t.req); return false; }
    if (S.gold < t.cost) { toast('Need ' + fmt(t.cost) + ' gold'); return false; }
    S.gold -= t.cost;
    S.talents[t.id] = true;
    renderTalents();
    refreshUI();
    save();
    toast(t.name + ' unlocked!');
    return true;
  }
  function renderTalents() {
    const rows = [0, 1, 2].map((r) => {
      const nodes = TALENTS.filter((t) => t.row === r).map((t) => {
        const on = !!S.talents[t.id];
        const locked = t.req && !S.talents[t.req];
        return '<button class="tnode' + (on ? ' on' : '') + (locked ? ' locked' : '') + '" data-tal="' + t.id + '">' +
          '<h3>' + t.name + '</h3><p>' + t.desc + '</p>' +
          '<div class="cost">' + (on ? 'OWNED' : fmt(t.cost) + ' gold') + '</div></button>';
      }).join('');
      return '<div class="tree-row">' + nodes + '</div>';
    }).join('');
    $('talent-tree').innerHTML = rows;
  }

  /* ---------- lobby ---------- */
  let currentTab = 'pet';
  function petCost() { return Math.floor(25 * Math.pow(1.2, S.petLv - 1)); }
  function heroCost() { return Math.floor(30 * Math.pow(1.2, S.heroLv - 1)); }
  function ringCost() { return Math.floor(40 * Math.pow(1.22, S.ringLv - 1)); }

  function renderLobby(tab) {
    currentTab = tab;
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.getAttribute('data-tab') === tab));
    const titles = { pet: 'Pet', heroes: 'Heroes', inventory: 'Inventory', ring: 'The Ring', battle: 'Battle' };
    $('lobby-title').textContent = titles[tab] || 'Lobby';
    const body = $('lobby-body');
    if (tab === 'battle') { setScreen('fight'); return; }
    if (tab === 'pet') {
      body.innerHTML = '<div class="card" style="grid-column:1/-1"><h3>Nibble</h3>' +
        '<div class="lvl">Level ' + S.petLv + ' · +' + (S.petLv * 0.4).toFixed(1) + ' dmg</div>' +
        '<p>A small purple bat-like pal that hovers by you in the ring and adds a bit of punch power.</p>' +
        '<button class="buy" id="buy-pet">Upgrade · ' + fmt(petCost()) + ' gold</button></div>';
    } else if (tab === 'heroes') {
      body.innerHTML = '<div class="card" style="grid-column:1/-1"><h3>Grove</h3>' +
        '<div class="lvl">Level ' + S.heroLv + ' · helper in the ring</div>' +
        '<p>A green helper boxer who stands beside you and throws their own punches.</p>' +
        '<button class="buy" id="buy-hero">Upgrade · ' + fmt(heroCost()) + ' gold</button></div>';
    } else if (tab === 'inventory') {
      const boot = S.items.boots;
      const belt = S.items.belt;
      body.innerHTML = '<div class="card-grid">' +
        '<div class="card"><h3>Training Wraps</h3><div class="lvl">Owned</div><p>A little extra sting in every punch (+1 dmg).</p></div>' +
        '<div class="card"><h3>Iron Boots</h3><div class="lvl">' + (boot ? 'Owned · +40 HP' : 'Not owned') + '</div><p>Sturdy boots that raise max health.</p>' +
        (boot ? '' : '<button class="buy" data-item="boots">Buy · 80 gold</button>') + '</div>' +
        '<div class="card"><h3>Champion Belt</h3><div class="lvl">' + (belt ? 'Owned · +5% crit' : 'Not owned') + '</div><p>A belt that helps you land harder hits.</p>' +
        (belt ? '' : '<button class="buy" data-item="belt">Buy · 200 gold</button>') + '</div></div>';
    } else if (tab === 'ring') {
      body.innerHTML = '<div class="card" style="grid-column:1/-1"><h3>Stone Octagon</h3>' +
        '<div class="lvl">Level ' + S.ringLv + ' · +' + S.ringLv + '% damage, +' + (S.ringLv * 6) + ' HP</div>' +
        '<p>Our own eight-sided ring. Upgrade the stonework for a lasting edge — the look stays the same.</p>' +
        '<button class="buy" id="buy-ring">Upgrade · ' + fmt(ringCost()) + ' gold</button></div>';
    }
  }

  /* ---------- three.js scene ---------- */
  const canvas = $('view');
  const stageEl = $('stage');
  const DPR_CAP = 2;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else if (THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x14141a, 26, 56);
  const camera = new THREE.PerspectiveCamera(30, 390 / 844, 0.1, 90);
  const CAM_DIST = 33.5;
  const CAM_ELEV = THREE.MathUtils.degToRad(49);
  const CAM_AZIM = THREE.MathUtils.degToRad(45);
  function placeCamera() {
    camera.position.set(
      Math.sin(CAM_AZIM) * Math.cos(CAM_ELEV) * CAM_DIST,
      Math.sin(CAM_ELEV) * CAM_DIST,
      Math.cos(CAM_AZIM) * Math.cos(CAM_ELEV) * CAM_DIST
    );
    camera.lookAt(-0.2, 0.02, -0.2);
  }
  placeCamera();

  function resize() {
    const w = stageEl.clientWidth || window.innerWidth || 390;
    const h = stageEl.clientHeight || window.innerHeight || 844;
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setClearColor(0x14141a, 1);
  }
  resize();
  window.addEventListener('resize', resize);

  scene.add(new THREE.AmbientLight(0xb8b4ae, 0.74));
  scene.add(new THREE.HemisphereLight(0xe8e4dc, 0x2a2a32, 0.32));
  const sun = new THREE.DirectionalLight(0xf2efe6, 0.88);
  sun.position.set(7, 16, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 2;
  sun.shadow.camera.far = 44;
  sun.shadow.camera.left = -16;
  sun.shadow.camera.right = 16;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.bias = -0.0012;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x8a90a0, 0.16);
  fill.position.set(-8, 6, -3);
  scene.add(fill);

  function lamb(color, opts) { return new THREE.MeshLambertMaterial(Object.assign({ color: color }, opts || {})); }
  function basic(color, opts) { return new THREE.MeshBasicMaterial(Object.assign({ color: color }, opts || {})); }
  function M(geo, mat, x, y, z) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (x !== undefined) m.position.set(x, y, z);
    return m;
  }

  const ground = M(new THREE.PlaneGeometry(90, 90), lamb(0x1a1a20), 0, 0, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  scene.add(ground);

  function octPts(r, y) {
    const pts = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    return pts;
  }
  function octShape(r) {
    const s = new THREE.Shape();
    const pts = octPts(r, 0);
    s.moveTo(pts[0].x, pts[0].z);
    for (let i = 1; i < 8; i++) s.lineTo(pts[i].x, pts[i].z);
    s.closePath();
    return s;
  }
  const plat = new THREE.ExtrudeGeometry(octShape(RING_R), { depth: PLAT_H, bevelEnabled: false, steps: 1 });
  plat.rotateX(-Math.PI / 2);
  const platform = new THREE.Mesh(plat, lamb(0x8a8680));
  platform.castShadow = true; platform.receiveShadow = true;
  scene.add(platform);
  const lipShape = octShape(RING_R + 0.20);
  lipShape.holes.push(octShape(RING_R - 0.02));
  const lipGeo = new THREE.ExtrudeGeometry(lipShape, { depth: 0.22, bevelEnabled: false });
  lipGeo.rotateX(-Math.PI / 2);
  const lipMesh = new THREE.Mesh(lipGeo, lamb(0x6e6c66));
  lipMesh.position.y = PLAT_H - 0.02;
  lipMesh.castShadow = true; lipMesh.receiveShadow = true;
  scene.add(lipMesh);
  const fieldGeo = new THREE.ExtrudeGeometry(octShape(RING_R - 0.22), { depth: 0.03, bevelEnabled: false });
  fieldGeo.rotateX(-Math.PI / 2);
  const field = new THREE.Mesh(fieldGeo, lamb(0xd0ccc2));
  field.position.y = FLOOR_Y;
  field.receiveShadow = true; field.castShadow = false;
  scene.add(field);
  function band(rO, rI, color) {
    const sh = octShape(rO); sh.holes.push(octShape(rI));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, lamb(color));
    m.position.y = FLOOR_Y + 0.02; m.receiveShadow = true;
    scene.add(m);
  }
  band(RING_R - 0.22, RING_R - 0.55, 0xb0aca2);
  band(RING_R - 1.35, RING_R - 1.62, 0x9e9a90);
  band(RING_R - 2.55, RING_R - 2.78, 0xb8b2a6);
  const grout = lamb(0x9a968c);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    const g = M(new THREE.BoxGeometry(0.06, 0.02, RING_R - 0.4), grout);
    g.position.set(Math.cos(a) * (RING_R * 0.42), FLOOR_Y + 0.03, Math.sin(a) * (RING_R * 0.42));
    g.rotation.y = -a; g.castShadow = false;
    scene.add(g);
  }
  const med = new THREE.ExtrudeGeometry(octShape(0.85), { depth: 0.04, bevelEnabled: false });
  med.rotateX(-Math.PI / 2);
  const medMesh = new THREE.Mesh(med, lamb(0xa8a49a));
  medMesh.position.y = FLOOR_Y + 0.03; medMesh.receiveShadow = true; scene.add(medMesh);
  const medIn = new THREE.ExtrudeGeometry(octShape(0.52), { depth: 0.04, bevelEnabled: false });
  medIn.rotateX(-Math.PI / 2);
  const medInM = new THREE.Mesh(medIn, lamb(0x8e8a82));
  medInM.position.y = FLOOR_Y + 0.05; scene.add(medInM);
  scene.add(M(new THREE.BoxGeometry(0.7, 0.03, 0.12), lamb(0xbbb6ac), 0, FLOOR_Y + 0.08, 0));
  scene.add(M(new THREE.BoxGeometry(0.12, 0.03, 0.7), lamb(0xbbb6ac), 0, FLOOR_Y + 0.08, 0));

  const hatchMat = lamb(0x7a766e), hatchRim = lamb(0x4e4c48);
  for (let i = 0; i < 4; i++) {
    const ang = i * Math.PI / 2;
    const hx = Math.cos(ang) * RING_R * 0.62, hz = Math.sin(ang) * RING_R * 0.62;
    scene.add(M(new THREE.CylinderGeometry(0.50, 0.50, 0.08, 16), lamb(0x3a3834), hx, FLOOR_Y + 0.01, hz));
    scene.add(M(new THREE.CylinderGeometry(0.58, 0.58, 0.07, 16), hatchRim, hx, FLOOR_Y + 0.05, hz));
    scene.add(M(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 16), hatchMat, hx, FLOOR_Y + 0.09, hz));
    const split = M(new THREE.BoxGeometry(0.9, 0.02, 0.04), lamb(0x5e5a54), hx, FLOOR_Y + 0.10, hz);
    split.rotation.y = ang + Math.PI / 2;
    scene.add(split);
    scene.add(M(new THREE.BoxGeometry(0.22, 0.05, 0.06), lamb(0x4a4844), hx, FLOOR_Y + 0.13, hz));
  }

  const postMat = lamb(0x5c5a56), plinthMat = lamb(0x6e6c68), capMat = lamb(0x8a8680), steelMat = lamb(0x3a3e46);
  octPts(RING_R + 0.12, 0).forEach((p) => {
    const g = new THREE.Group();
    g.add(M(new THREE.BoxGeometry(0.38, 0.28, 0.38), plinthMat, 0, PLAT_H + 0.14, 0));
    g.add(M(new THREE.CylinderGeometry(0.11, 0.13, 1.15, 8), postMat, 0, PLAT_H + 0.28 + 0.57, 0));
    const c1 = M(new THREE.TorusGeometry(0.16, 0.035, 6, 12), steelMat, 0, PLAT_H + 0.55, 0); c1.rotation.x = Math.PI / 2;
    const c2 = M(new THREE.TorusGeometry(0.16, 0.035, 6, 12), steelMat, 0, PLAT_H + 0.95, 0); c2.rotation.x = Math.PI / 2;
    const cap = M(new THREE.ConeGeometry(0.16, 0.22, 4), capMat, 0, PLAT_H + 0.28 + 1.15 + 0.08, 0);
    cap.rotation.y = Math.PI / 4;
    g.add(c1, c2, cap);
    g.position.set(p.x, 0, p.z);
    scene.add(g);
  });
  function ropePath(r, y, sag) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = (i + 0.5) * Math.PI / 4;
      pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
    const rich = [];
    for (let i = 0; i < 8; i++) {
      const a = pts[i], b = pts[i + 1];
      rich.push(a);
      const midp = a.clone().lerp(b, 0.5);
      midp.y -= sag; midp.x *= 0.99; midp.z *= 0.99;
      rich.push(midp);
    }
    rich.push(pts[8]);
    return new THREE.CatmullRomCurve3(rich, false, 'catmullrom', 0.1);
  }
  const ropeMat = lamb(0x3e4450), ropeMatHi = lamb(0x4a5160);
  [0.52, 0.82, 1.12].forEach((yOff, idx) => {
    const curve = ropePath(RING_R + 0.12, PLAT_H + yOff, 0.10);
    const tube = new THREE.TubeGeometry(curve, 80, idx === 1 ? 0.045 : 0.04, 6, false);
    const mesh = new THREE.Mesh(tube, idx === 1 ? ropeMatHi : ropeMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
  });

  const rangeRing = M(new THREE.RingGeometry(2.28, 2.40, 64), basic(0xdedad2, { transparent: true, opacity: 0.38, side: THREE.DoubleSide }), 0, FLOOR_Y + 0.09, 0);
  rangeRing.rotation.x = -Math.PI / 2; rangeRing.castShadow = false; rangeRing.receiveShadow = false;
  scene.add(rangeRing);
  const rangeRing2 = M(new THREE.RingGeometry(2.50, 2.56, 64), basic(0xffffff, { transparent: true, opacity: 0.16, side: THREE.DoubleSide }), 0, FLOOR_Y + 0.09, 0);
  rangeRing2.rotation.x = -Math.PI / 2; rangeRing2.castShadow = false;
  scene.add(rangeRing2);

  const bCols = [0x8a8884, 0x7a7874, 0x6e6c68, 0x949088, 0x5e5c58, 0x82807a];
  function building(x, z, w, d, h, ci) {
    scene.add(M(new THREE.BoxGeometry(w, h, d), lamb(bCols[ci % bCols.length]), x, h / 2, z));
  }
  function column(x, z, r, h, ci) {
    scene.add(M(new THREE.CylinderGeometry(r, r * 1.08, h, 8), lamb(bCols[ci % bCols.length]), x, h / 2, z));
  }
  [
    [-7.2, -8.4, 1.8, 1.6, 3.6, 0], [-5.6, -9.2, 1.4, 1.5, 2.5, 1], [-8.8, -7.0, 1.6, 1.8, 4.4, 2],
    [-4.4, -9.6, 2.0, 1.3, 1.9, 3], [-9.4, -8.6, 1.3, 1.3, 3.2, 4], [-6.6, -7.4, 1.1, 1.1, 1.7, 5],
    [-3.6, -10.0, 1.5, 1.5, 2.8, 0], [-10.0, -6.2, 1.7, 1.4, 2.4, 1], [-8.0, -9.6, 1.5, 1.4, 2.1, 3],
    [-10.6, -7.8, 1.2, 1.6, 3.4, 4], [-5.0, -8.2, 0.9, 0.9, 1.4, 2]
  ].forEach((p) => building(p[0], p[1], p[2], p[3], p[4], p[5]));
  column(-6.4, -8.0, 0.26, 2.9, 0);
  column(-8.2, -7.8, 0.22, 2.5, 2);
  column(-5.2, -9.0, 0.24, 2.6, 4);
  column(-9.0, -8.0, 0.30, 3.4, 1);
  building(-7.4, -6.6, 2.8, 0.38, 0.95, 4);
  building(-9.6, -5.6, 0.38, 2.2, 1.2, 2);

  function makeHero(kind) {
    const g = new THREE.Group();
    const isHero = kind === 'hero';
    const bodyCol = isHero ? 0x5a92d8 : 0x3bbb68;
    const darkCol = isHero ? 0x3560a0 : 0x237844;
    const helmCol = isHero ? 0x3a7aee : 0x32b050;
    const accent = isHero ? 0xc43c3c : 0xd4c43a;
    const gloveCol = isHero ? 0xee4a42 : 0x45dd70;
    const body = lamb(bodyCol), dark = lamb(darkCol);
    g.add(M(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 8), dark, -0.11, 0.16, 0));
    g.add(M(new THREE.CylinderGeometry(0.11, 0.13, 0.32, 8), dark, 0.11, 0.16, 0));
    g.add(M(new THREE.BoxGeometry(0.18, 0.10, 0.26), dark, -0.11, 0.05, 0.04));
    g.add(M(new THREE.BoxGeometry(0.18, 0.10, 0.26), dark, 0.11, 0.05, 0.04));
    g.add(M(new THREE.SphereGeometry(0.16, 10, 8), body, 0, 0.34, 0));
    g.add(M(new THREE.CylinderGeometry(0.20, 0.23, 0.38, 10), body, 0, 0.56, 0));
    g.add(M(new THREE.SphereGeometry(0.20, 10, 8), body, 0, 0.72, 0.02));
    g.add(M(new THREE.SphereGeometry(0.20, 12, 10), lamb(0xe8c8a8), 0, 0.96, 0));
    const helm = M(new THREE.SphereGeometry(0.22, 12, 10), lamb(helmCol), 0, 0.99, 0);
    helm.scale.set(1, 0.85, 1.02); g.add(helm);
    g.add(M(new THREE.BoxGeometry(0.28, 0.08, 0.12), lamb(0x1a2430), 0, 0.98, 0.16));
    g.add(M(new THREE.SphereGeometry(0.10, 8, 6), lamb(accent), -0.20, 0.96, 0));
    g.add(M(new THREE.SphereGeometry(0.10, 8, 6), lamb(accent), 0.20, 0.96, 0));
    g.add(M(new THREE.BoxGeometry(0.06, 0.16, 0.40), lamb(accent), 0, 1.08, 0));
    const lArmL = new THREE.Group(); lArmL.position.set(-0.26, 0.74, 0.02);
    lArmL.add(M(new THREE.CylinderGeometry(0.08, 0.09, 0.28, 8), body, 0, -0.14, 0));
    const gloveL = M(new THREE.SphereGeometry(0.18, 10, 8), lamb(gloveCol), 0, -0.34, 0.10);
    gloveL.scale.set(1.3, 1.0, 1.35); lArmL.add(gloveL);
    lArmL.rotation.set(-0.85, 0.2, 0.7);
    const lArmR = new THREE.Group(); lArmR.position.set(0.22, 0.76, 0.06);
    const reach = 0.55;
    const armMesh = M(new THREE.CylinderGeometry(0.075, 0.10, reach, 8), body, 0, 0, 0);
    armMesh.rotation.x = Math.PI / 2; armMesh.position.z = reach / 2;
    lArmR.add(armMesh);
    const gloveR = M(new THREE.SphereGeometry(0.22, 10, 8), lamb(gloveCol), 0, 0, reach + 0.12);
    gloveR.scale.set(1.4, 1.15, 1.25); lArmR.add(gloveR);
    lArmR.rotation.set(-0.35, 0.05, -0.12);
    g.add(lArmL, lArmR);
    g.userData.armR = lArmR; g.userData.armL = lArmL; g.userData.gloveR = gloveR;
    g.scale.setScalar(isHero ? 1.0 : 0.82);
    return g;
  }
  const hero = makeHero('hero');
  hero.position.set(0, FLOOR_Y, 0);
  scene.add(hero);
  const helper = makeHero('helper');
  helper.position.set(-0.85, FLOOR_Y, 0.55);
  helper.rotation.y = 0.6;
  scene.add(helper);

  function makePet() {
    const g = new THREE.Group();
    const fur = lamb(0x7a4cc8), dark = lamb(0x4a2a88);
    const body = M(new THREE.SphereGeometry(0.16, 10, 8), fur, 0, 0, 0); body.scale.set(1, 0.85, 1.15);
    const head = M(new THREE.SphereGeometry(0.12, 10, 8), fur, 0, 0.08, 0.12);
    const earL = M(new THREE.ConeGeometry(0.06, 0.14, 6), fur, -0.07, 0.20, 0.10);
    const earR = M(new THREE.ConeGeometry(0.06, 0.14, 6), fur, 0.07, 0.20, 0.10);
    const wingL = M(new THREE.BoxGeometry(0.36, 0.04, 0.22), dark, -0.28, 0.04, -0.02);
    wingL.rotation.z = 0.35; wingL.rotation.y = 0.25;
    const wingR = M(new THREE.BoxGeometry(0.36, 0.04, 0.22), dark, 0.28, 0.04, -0.02);
    wingR.rotation.z = -0.35; wingR.rotation.y = -0.25;
    g.add(body, head, earL, earR, wingL, wingR);
    g.add(M(new THREE.SphereGeometry(0.025, 6, 6), basic(0xffee88), -0.04, 0.10, 0.22));
    g.add(M(new THREE.SphereGeometry(0.025, 6, 6), basic(0xffee88), 0.04, 0.10, 0.22));
    g.userData.wingL = wingL; g.userData.wingR = wingR;
    return g;
  }
  const pet = makePet();
  pet.position.set(0.75, FLOOR_Y + 0.85, -0.35);
  scene.add(pet);

  /* instanced enemies */
  const redMat = lamb(0xe12e2e);
  const parts = {
    torso: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.10, 0.11, 0.38, 7), redMat, MAX_E),
    head: new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 9, 8), redMat, MAX_E),
    lleg: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 6), redMat, MAX_E),
    rleg: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.42, 6), redMat, MAX_E),
    larm: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.40, 6), redMat, MAX_E),
    rarm: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.40, 6), redMat, MAX_E)
  };
  Object.values(parts).forEach((m) => { m.castShadow = false; m.receiveShadow = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); });
  const dummy = new THREE.Object3D();
  const hiddenMat = new THREE.Matrix4().makeScale(0, 0, 0);
  const enemies = [];
  for (let i = 0; i < MAX_E; i++) {
    enemies.push({
      live: false, x: 0, z: 0, y: 0, hp: 0, maxHp: 1, vx: 0, vz: 0,
      kind: 'run', balloon: false, chunky: false, t: 0, face: 0,
      rag: 0, rx: 0, ry: 0, rz: 0, seed: Math.random()
    });
  }
  function hideInst(i) {
    Object.values(parts).forEach((m) => { m.setMatrixAt(i, hiddenMat); m.instanceMatrix.needsUpdate = true; });
  }
  function setPart(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, ry, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  function writeEnemy(i) {
    const e = enemies[i];
    if (!e.live) { hideInst(i); return; }
    const s = e.chunky ? 1.15 : 1;
    const hs = (e.balloon ? 1.85 : 1) * s;
    const y0 = e.y;
    const fy = e.face;
    const run = e.kind === 'run' ? Math.sin(e.t * 8) : 0;
    if (e.kind === 'rag') {
      const bx = e.x, bz = e.z, by = y0;
      setPart(parts.torso, i, bx, by + 0.62 * s, bz, e.rx, e.ry, e.rz, s, s, s);
      setPart(parts.head, i, bx, by + 0.95 * s, bz, e.rx, e.ry, e.rz, hs, hs, hs);
      setPart(parts.lleg, i, bx - 0.08, by + 0.22, bz, 0.7 + e.seed, e.ry, 0.3, s, s, s);
      setPart(parts.rleg, i, bx + 0.08, by + 0.22, bz, -0.5, e.ry, -0.4, s, s, s);
      setPart(parts.larm, i, bx - 0.16, by + 0.72, bz, 1.1, e.ry, 0.7, s, s, s);
      setPart(parts.rarm, i, bx + 0.16, by + 0.72, bz, -0.7, e.ry, -0.9, s, s, s);
    } else {
      const x = e.x, z = e.z;
      setPart(parts.torso, i, x, y0 + 0.62 * s, z, 0.12, fy, 0, s, s, s);
      setPart(parts.head, i, x, y0 + 0.95 * s, z, 0, fy, 0, hs, hs, hs);
      setPart(parts.lleg, i, x - 0.08 * Math.cos(fy), y0 + 0.22 * s, z - 0.08 * Math.sin(fy), run * 0.7, fy, 0, s, s, s);
      setPart(parts.rleg, i, x + 0.08 * Math.cos(fy), y0 + 0.22 * s, z + 0.08 * Math.sin(fy), -run * 0.7, fy, 0, s, s, s);
      setPart(parts.larm, i, x - 0.16 * Math.cos(fy), y0 + 0.72 * s, z - 0.16 * Math.sin(fy), -run * 0.7, fy, 0.25, s, s, s);
      setPart(parts.rarm, i, x + 0.16 * Math.cos(fy), y0 + 0.72 * s, z + 0.16 * Math.sin(fy), run * 0.7, fy, -0.25, s, s, s);
    }
  }
  function flushEnemies() {
    for (let i = 0; i < MAX_E; i++) writeEnemy(i);
    Object.values(parts).forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  }
  for (let i = 0; i < MAX_E; i++) hideInst(i);
  flushEnemies();

  function enemyHp() { return Math.round((10 + S.stage * 3.2) * (1 + S.stage * 0.04)); }
  function spawnEnemy() {
    let slot = -1;
    for (let i = 0; i < MAX_E; i++) if (!enemies[i].live) { slot = i; break; }
    if (slot < 0) return null;
    const a = Math.random() * Math.PI * 2;
    const dist = RING_R + 1.15 + Math.random() * 1.9;
    const e = enemies[slot];
    e.live = true; e.kind = 'run';
    e.x = Math.cos(a) * dist; e.z = Math.sin(a) * dist; e.y = FLOOR_Y;
    e.hp = e.maxHp = enemyHp() * (Math.random() < 0.12 ? 1.6 : 1);
    e.balloon = Math.random() < 0.12;
    e.chunky = !e.balloon && Math.random() < 0.1;
    if (e.balloon) e.hp = e.maxHp = e.maxHp * 1.3;
    e.t = Math.random() * 10; e.rag = 0;
    e.face = Math.atan2(-e.x, -e.z);
    return e;
  }

  /* damage numbers */
  const dmgLayer = $('dmg-layer');
  const dmgPool = [];
  for (let i = 0; i < 24; i++) {
    const el = document.createElement('div');
    el.className = 'dmg'; el.style.display = 'none';
    dmgLayer.appendChild(el);
    dmgPool.push({ el, life: 0, x: 0, y: 0, z: 0 });
  }
  const _v = new THREE.Vector3();
  function floatNum(x, y, z, text, lg) {
    const slot = dmgPool.find((d) => d.life <= 0) || dmgPool[0];
    slot.life = 0.7; slot.x = x; slot.y = y; slot.z = z;
    slot.el.textContent = text;
    slot.el.className = 'dmg' + (lg ? ' lg' : '');
    slot.el.style.display = 'block';
  }
  function projectDmg(dt) {
    const pw = stageEl.clientWidth || 390, ph = stageEl.clientHeight || 844;
    dmgPool.forEach((d) => {
      if (d.life <= 0) { d.el.style.display = 'none'; return; }
      d.life -= dt; d.y += dt * 1.2;
      _v.set(d.x, d.y, d.z).project(camera);
      d.el.style.left = ((_v.x * 0.5 + 0.5) * pw) + 'px';
      d.el.style.top = ((-_v.y * 0.5 + 0.5) * ph) + 'px';
      d.el.style.opacity = String(Math.max(0, d.life / 0.7));
    });
  }

  /* sparks */
  const sparks = [];
  function sparkAt(x, y, z) {
    const g = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.22, 4), basic(i % 2 ? 0xfff8d8 : 0xffb040));
      sp.geometry.translate(0, 0.11, 0);
      sp.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      g.add(sp);
    }
    g.position.set(x, y, z);
    scene.add(g);
    sparks.push({ g, life: 0.18 });
  }
  const fxRings = [];
  function pulseRing(color, r0) {
    const m = M(new THREE.RingGeometry(r0, r0 + 0.12, 32), basic(color, { transparent: true, opacity: 0.7, side: THREE.DoubleSide }), 0, FLOOR_Y + 0.12, 0);
    m.rotation.x = -Math.PI / 2; m.castShadow = false;
    scene.add(m);
    fxRings.push({ m, life: 0.4, r: r0 });
  }

  /* combat */
  let punchCd = 0, helperCd = 0, spawnT = 0;
  let talentT = { void: 0, thunder: 0, meteor: 0 };
  let punchFlash = 0;
  let heroFace = 0.8;

  function hitEnemy(e, amount, crit) {
    if (!e || !e.live || e.kind === 'rag') return;
    e.hp -= amount;
    floatNum(e.x, e.y + 1.3, e.z, String(Math.round(amount)), !!crit);
    sparkAt(e.x, e.y + 0.85, e.z);
    const knock = (S.level >= 3 ? 0.55 : 0.2);
    const d = Math.hypot(e.x, e.z) || 1;
    e.x += (e.x / d) * knock;
    e.z += (e.z / d) * knock;
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    e.kind = 'rag'; e.rag = 0.7;
    e.rx = 1.0 + e.seed * 0.5; e.ry = e.seed * 4; e.rz = 0.5;
    const d = Math.hypot(e.x, e.z) || 1;
    e.vx = (e.x / d) * 3.2; e.vz = (e.z / d) * 3.2;
    S.totalKills++; S.stageKills++;
    gainGold(4 + S.stage * 0.8);
    addXp(5 + S.stage * 0.5);
    goal('kills', 1);
    if (hasTal('deathbomb')) {
      pulseRing(0xff6644, 0.4);
      const dmg = dmgStat() * 0.5;
      enemies.forEach((o) => {
        if (o.live && o.kind !== 'rag' && o !== e && Math.hypot(o.x - e.x, o.z - e.z) < 1.6) hitEnemy(o, dmg, false);
      });
    }
    if (S.stageKills >= stageNeed()) {
      const rew = stageReward();
      gainGold(rew);
      S.stage++;
      S.stageKills = 0;
      goal('stage', 1);
      toast('Stage ' + S.stage + '! +' + fmt(rew) + ' gold');
      save();
    }
  }
  function punchTarget(fromX, fromZ, range, dmgMul) {
    let best = null, bestD = range;
    for (let i = 0; i < MAX_E; i++) {
      const e = enemies[i];
      if (!e.live || e.kind === 'rag') continue;
      const d = Math.hypot(e.x - fromX, e.z - fromZ);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return null;
    const crit = Math.random() * 100 < critCh();
    const amt = dmgStat() * dmgMul * (crit ? critDmg() : 1);
    hitEnemy(best, amt, crit);
    heroFace = Math.atan2(best.x - fromX, best.z - fromZ);
    return best;
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  let fps = 60, fpsAccum = 0, fpsN = 0;
  let ready = false;
  let frames = 0;

  function tick(now) {
    requestAnimationFrame(tick);
    let raw = Math.min(0.05, (now - last) / 1000);
    last = now;
    const speed = SPEEDS[S.speedIdx];
    const dt = raw * speed;
    fpsAccum += raw; fpsN++;
    if (fpsAccum >= 0.5) { fps = fpsN / fpsAccum; fpsAccum = 0; fpsN = 0; }

    if (S.recovering <= 0 && S.hp < maxHp()) S.hp = Math.min(maxHp(), S.hp + 4 * dt);
    if (S.recovering > 0) {
      S.recovering -= dt;
      if (S.recovering <= 0) { S.hp = maxHp(); toast('Back up!'); }
    }

    spawnT -= dt;
    const spawnEvery = Math.max(0.20, 0.55 / (1 + S.stage * 0.05));
    if (spawnT <= 0) { spawnEnemy(); spawnT = spawnEvery; }

    const rw = rangeWorld();
    let meleeHits = 0;
    for (let i = 0; i < MAX_E; i++) {
      const e = enemies[i];
      if (!e.live) continue;
      if (e.kind === 'rag') {
        e.rag -= dt;
        e.x += e.vx * dt; e.z += e.vz * dt;
        e.y += 3.2 * dt; e.vx *= 0.98; e.vz *= 0.98;
        e.ry += dt * 3;
        if (e.rag <= 0) { e.live = false; hideInst(i); }
        continue;
      }
      e.t += dt;
      const dist = Math.hypot(e.x, e.z);
      const spd = (1.05 + S.stage * 0.03) * (e.balloon ? 0.8 : 1);
      if (dist > 0.55) {
        e.x -= (e.x / dist) * spd * dt;
        e.z -= (e.z / dist) * spd * dt;
      } else if (S.recovering <= 0 && meleeHits < 3) {
        meleeHits++;
        S.hp -= (2.0 + S.stage * 0.2) * takenMul() * dt;
        if (S.hp <= 0) { S.hp = 0; S.recovering = 1.6; toast('Recovering…'); }
      }
      e.face = Math.atan2(-e.x, -e.z);
      e.y = FLOOR_Y + Math.abs(Math.sin(e.t * 8)) * 0.04;
    }

    punchCd -= dt;
    if (punchCd <= 0 && S.recovering <= 0) {
      const t = punchTarget(0, 0, rw, 1);
      if (t) {
        punchCd = rateSec();
        punchFlash = 0.16;
        hero.userData.armR.rotation.x = -0.15;
      } else punchCd = 0.08;
    }
    if (punchFlash > 0) {
      punchFlash -= dt;
      hero.userData.armR.rotation.x = -0.15 + (0.16 - punchFlash) * 1.2;
    }
    hero.rotation.y = heroFace;

    helper.visible = !!S.helperOn;
    helperCd -= dt;
    if (S.helperOn && helperCd <= 0 && S.recovering <= 0) {
      const t = punchTarget(helper.position.x, helper.position.z, rw * 0.85, 0.45);
      helperCd = rateSec() * 1.35;
      if (t) helper.lookAt(t.x, helper.position.y, t.z);
    }

    pet.position.y = FLOOR_Y + 0.85 + Math.sin(now * 0.004) * 0.08;
    pet.userData.wingL.rotation.z = 0.35 + Math.sin(now * 0.012) * 0.25;
    pet.userData.wingR.rotation.z = -0.35 - Math.sin(now * 0.012) * 0.25;
    pet.rotation.y += dt * 0.6;

    skillCd.shock = Math.max(0, skillCd.shock - dt);
    skillCd.star = Math.max(0, skillCd.star - dt);
    skillCd.pulse = Math.max(0, skillCd.pulse - dt);
    if (S.stage >= 1 && skillCd.shock <= 0) {
      skillCd.shock = 5;
      pulseRing(0xffd36a, 0.5);
      const dmg = dmgStat() * 0.7;
      enemies.forEach((e) => { if (e.live && e.kind !== 'rag' && Math.hypot(e.x, e.z) < rw + 0.4) hitEnemy(e, dmg, false); });
    }
    if (S.stage >= 2 && skillCd.star <= 0) {
      skillCd.star = 7;
      punchTarget(0, 0, rw + 1.5, 1.8);
    }
    if (S.stage >= 5 && skillCd.pulse <= 0) {
      skillCd.pulse = 10;
      pulseRing(0x7ad0ff, 0.3);
      enemies.forEach((e) => { if (e.live && e.kind !== 'rag' && Math.hypot(e.x, e.z) < rw + 1.2) hitEnemy(e, dmgStat() * 0.9, false); });
    }

    if (hasTal('void')) {
      talentT.void += dt;
      if (talentT.void >= 8) {
        talentT.void = 0; pulseRing(0x7744cc, 0.4);
        enemies.forEach((e) => { if (e.live && e.kind !== 'rag' && Math.hypot(e.x, e.z) < 3.2) hitEnemy(e, dmgStat() * 0.8, false); });
      }
    }
    if (hasTal('thunder')) {
      talentT.thunder += dt;
      if (talentT.thunder >= 6) {
        talentT.thunder = 0;
        const list = enemies.filter((e) => e.live && e.kind !== 'rag').sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).slice(0, 3);
        list.forEach((e) => hitEnemy(e, dmgStat() * 1.1, false));
      }
    }
    if (hasTal('meteor')) {
      talentT.meteor += dt;
      if (talentT.meteor >= 12) {
        talentT.meteor = 0;
        const list = enemies.filter((e) => e.live && e.kind !== 'rag');
        for (let k = 0; k < 4 && list.length; k++) {
          const e = list.splice(Math.floor(Math.random() * list.length), 1)[0];
          hitEnemy(e, dmgStat() * 1.4, true);
        }
      }
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      sparks[i].life -= raw;
      sparks[i].g.scale.setScalar(1 + (0.18 - sparks[i].life) * 2);
      if (sparks[i].life <= 0) { scene.remove(sparks[i].g); sparks.splice(i, 1); }
    }
    for (let i = fxRings.length - 1; i >= 0; i--) {
      const f = fxRings[i];
      f.life -= raw;
      f.m.scale.setScalar(1 + (0.4 - f.life) * 4);
      f.m.material.opacity = Math.max(0, f.life / 0.4);
      if (f.life <= 0) { scene.remove(f.m); fxRings.splice(i, 1); }
    }

    flushEnemies();
    projectDmg(raw);
    renderer.render(scene, camera);
    frames++;
    if (!ready && frames >= 2) {
      ready = true;
      app.classList.add('ready');
      refreshUI();
    }
    if (frames % 30 === 0) refreshUI();
  }

  /* ---------- events ---------- */
  $('btn-speed').addEventListener('click', cycleSpeed);
  $('btn-expand').addEventListener('click', () => {
    app.classList.toggle('expanded');
    $('btn-expand').textContent = app.classList.contains('expanded') ? '▴' : '▾';
  });
  $('btn-book').addEventListener('click', () => { renderTalents(); setScreen('talents'); });
  $('btn-talents-back').addEventListener('click', () => setScreen('fight'));
  $('btn-gear').addEventListener('click', () => setScreen('settings'));
  $('btn-settings-back').addEventListener('click', () => setScreen('fight'));
  $('btn-lobby').addEventListener('click', () => { setScreen('lobby'); renderLobby('pet'); });
  $('btn-battle').addEventListener('click', () => setScreen('fight'));
  $('tabs').addEventListener('click', (ev) => {
    const t = ev.target.closest('.tab');
    if (!t) return;
    const tab = t.getAttribute('data-tab');
    if (tab === 'battle') setScreen('fight');
    else renderLobby(tab);
  });
  $('stats').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-up]');
    if (b) buyUpgrade(b.getAttribute('data-up'));
  });
  $('talent-tree').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tal]');
    if (b) buyTalent(b.getAttribute('data-tal'));
  });
  $('lobby-body').addEventListener('click', (ev) => {
    const t = ev.target;
    if (t.id === 'buy-pet') {
      const c = petCost();
      if (S.gold < c) return toast('Need ' + fmt(c) + ' gold');
      S.gold -= c; S.petLv++; renderLobby('pet'); refreshUI(); save(); toast('Nibble grew!');
    } else if (t.id === 'buy-hero') {
      const c = heroCost();
      if (S.gold < c) return toast('Need ' + fmt(c) + ' gold');
      S.gold -= c; S.heroLv++; renderLobby('heroes'); refreshUI(); save(); toast('Grove grew!');
    } else if (t.id === 'buy-ring') {
      const c = ringCost();
      if (S.gold < c) return toast('Need ' + fmt(c) + ' gold');
      S.gold -= c; S.ringLv++; renderLobby('ring'); refreshUI(); save(); toast('Ring upgraded!');
    } else if (t.getAttribute && t.getAttribute('data-item')) {
      const id = t.getAttribute('data-item');
      const cost = id === 'boots' ? 80 : 200;
      if (S.gold < cost) return toast('Need ' + fmt(cost) + ' gold');
      if (S.items[id]) return;
      S.gold -= cost; S.items[id] = true;
      if (id === 'boots') S.hp = maxHp();
      renderLobby('inventory'); refreshUI(); save(); toast('Item bought!');
    }
  });
  $('btn-reset').addEventListener('click', () => {
    if (!confirm('Reset all Punchman progress on this device?')) return;
    S = defaultState();
    localStorage.removeItem(SAVE_KEY);
    refreshUI();
    setScreen('fight');
    toast('Save reset');
  });

  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  renderTalents();
  refreshUI();
  requestAnimationFrame(tick);

  window.PUNCHMAN = {
    version: VERSION,
    getState() { return S; },
    setGold(n) { S.gold = n; refreshUI(); },
    buyUpgrade, buyTalent, cycleSpeed, setSpeedIdx, setScreen, save,
    reset() { S = defaultState(); localStorage.removeItem(SAVE_KEY); refreshUI(); },
    fps() { return fps; },
    ready() { return ready; },
    spawnEnemy,
    nextStage() { S.stageKills = stageNeed(); },
    fmt
  };
})();
