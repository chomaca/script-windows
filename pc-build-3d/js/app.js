/*
 * Bancada 3D — cena, interface e salvamento.
 * Depende de: catalogo.js, build-padrao.js, modelos3d.js, montagem.js,
 * verificacao.js e do Three.js (carregado pelo index.html).
 */
window.PCBApp = (function () {
  'use strict';

  const CHAVE = 'bancada3d.v1';
  const CAT = window.PCB_CATALOGO;
  const PADRAO = window.PCB_BUILD_PADRAO;
  const VIS_PADRAO = {
    paineis: true, vidro: true, fluxo: false, cotas: true, girar: true, rgb: '#7cc8ff',
    qualidade: (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ? 'leve' : 'alta'
  };

  let THREE, M, MONT, VER, OrbitControls, CSS2DRenderer, CSS2DObject, RoomEnvironment;
  let D = {};
  let composer = null, passoAO = null, sol = null;
  let cena, camera, renderer, controles, rotulos, grupoCotas, destaque;
  let grades = [];
  let luzInterna = null;
  let atual = null;
  let checagem = null;
  let rotores = [];
  let precisaRender = true;
  let explodirAlvo = 0, explodirAtual = 0;
  let tween = null;
  let reconstruirPendente = false;
  let iniciou = false;

  const E = { build: null, vis: null, aba: 'pecas', sel: null, ocultas: new Set() };
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ============================== utilidades ============================== */
  function clonar(o) { return JSON.parse(JSON.stringify(o)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(n, casas = 1) {
    if (typeof n !== 'number' || !isFinite(n)) return '—';
    const f = Math.pow(10, casas);
    return (Math.round(n * f) / f).toLocaleString('pt-BR');
  }
  function token(nome) { return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || '#888'; }
  const ler = (o, c) => c.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  function gravar(o, c, v) {
    const ps = c.split('.');
    let a = o;
    for (let i = 0; i < ps.length - 1; i++) {
      if (a[ps[i]] == null || typeof a[ps[i]] !== 'object') a[ps[i]] = {};
      a = a[ps[i]];
    }
    a[ps[ps.length - 1]] = v;
  }

  /* ============================== salvamento ============================== */
  function normalizar(b) {
    const out = clonar(PADRAO);
    if (!b || typeof b !== 'object') return out;
    for (const k of ['gabinete', 'placaMae', 'cpu', 'memoria', 'refrigeracao', 'fonte', 'gpu']) {
      if (b[k] && typeof b[k] === 'object') out[k] = Object.assign({}, out[k], b[k]);
    }
    if (b.gpu && b.gpu.fans) out.gpu.fans = Object.assign({}, PADRAO.gpu.fans, b.gpu.fans);
    if (b.fans && typeof b.fans === 'object') out.fans = b.fans;
    if (b.medidas && typeof b.medidas === 'object') out.medidas = b.medidas;
    return out;
  }
  function carregarEstado() {
    try {
      const t = localStorage.getItem(CHAVE);
      if (t) {
        const o = JSON.parse(t);
        return { build: normalizar(o.build), vis: Object.assign({}, VIS_PADRAO, o.vis || {}), aba: o.aba || 'pecas' };
      }
    } catch (e) { /* armazenamento indisponível */ }
    return { build: clonar(PADRAO), vis: Object.assign({}, VIS_PADRAO), aba: 'pecas' };
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ build: E.build, vis: E.vis, aba: E.aba })); } catch (e) { /* ignorado */ }
  }

  /* ============================== cena 3D ============================== */
  function montarCena() {
    const el = $('#vista');
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    rotulos = new CSS2DRenderer();
    rotulos.domElement.className = 'rotulos';
    el.appendChild(rotulos.domElement);

    cena = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    camera = new THREE.PerspectiveCamera(30, 1, 5, 20000);
    controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.dampingFactor = 0.09;
    controles.minDistance = 180;
    controles.maxDistance = 4200;
    controles.maxPolarAngle = Math.PI * 0.49;
    controles.addEventListener('change', () => { precisaRender = true; });

    cena.environmentIntensity = 0.85;
    cena.add(new THREE.HemisphereLight(0xfff6ec, 0x2a2e34, 0.45));
    sol = new THREE.DirectionalLight(0xfff4e8, 1.75);
    sol.position.set(-520, 980, 640);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -420, right: 420, top: 560, bottom: -160, near: 200, far: 2400 });
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.5;
    sol.target.position.set(0, 200, 0);
    cena.add(sol, sol.target);
    const contra = new THREE.DirectionalLight(0xd6e4ff, 0.6);
    contra.position.set(700, 420, -700);
    cena.add(contra);
    const recorte = new THREE.DirectionalLight(0xffffff, 0.35);
    recorte.position.set(-200, 260, -900);
    cena.add(recorte);

    const chao = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.2 }));
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    cena.add(chao);

    grupoCotas = new THREE.Group();
    cena.add(grupoCotas);
    aplicarTema();

    new ResizeObserver(redimensionar).observe(el);
    redimensionar();
    montarPosProcesso();
    ligarPonteiro();
  }

  /* Qualidade alta: oclusão de ambiente (sombras de contato), brilho do RGB e sombras mais nítidas. */
  function montarPosProcesso() {
    if (composer) { composer.passes.forEach((p) => p.dispose && p.dispose()); composer.dispose && composer.dispose(); }
    composer = null;
    passoAO = null;
    const alta = E.vis.qualidade !== 'leve';
    renderer.setPixelRatio(alta ? Math.min(window.devicePixelRatio || 1, 2) : 1);
    if (sol) {
      const tam = alta ? 4096 : 1536;
      if (sol.shadow.mapSize.x !== tam) {
        sol.shadow.mapSize.set(tam, tam);
        if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null; }
      }
    }
    const b = $('#qualidade');
    if (b) { b.textContent = 'Qualidade: ' + (alta ? 'alta' : 'leve'); b.setAttribute('aria-pressed', String(alta)); }
    redimensionar();
    if (!alta || !D.EffectComposer || !D.RenderPass || !D.OutputPass) return;
    try {
      const el = $('#vista');
      const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
      const pr = renderer.getPixelRatio();
      const alvo = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
      composer = new D.EffectComposer(renderer, alvo);
      composer.setPixelRatio(pr);
      composer.setSize(w, h);
      composer.addPass(new D.RenderPass(cena, camera));
      if (D.GTAOPass) {
        passoAO = new D.GTAOPass(cena, camera, w, h);
        passoAO.updateGtaoMaterial({ radius: 24, distanceExponent: 1.5, thickness: 9, scale: 1.25, samples: 16, distanceFallOff: 1 });
        if (passoAO.updatePdMaterial) passoAO.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
        passoAO.blendIntensity = 0.95;
        // vidro, telas e setas não entram no cálculo da oclusão
        const esconder = passoAO.overrideVisibility.bind(passoAO);
        passoAO.overrideVisibility = function () {
          esconder();
          cena.traverse((o) => {
            if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent && !o.material.isShadowMaterial) o.visible = false;
          });
        };
        composer.addPass(passoAO);
      }
      if (D.UnrealBloomPass) composer.addPass(new D.UnrealBloomPass(new THREE.Vector2(w, h), 0.6, 0.45, 2.2));
      composer.addPass(new D.OutputPass());
    } catch (err) {
      console.warn('Pós-processamento desligado:', err);
      composer = null;
    }
    precisaRender = true;
  }

  function aplicarTema() {
    if (!cena) return;
    const fundo = new THREE.Color(token('--palco'));
    cena.background = fundo;
    cena.fog = new THREE.Fog(fundo, 2600, 7000);
    for (const g of grades) { cena.remove(g); g.geometry.dispose(); g.material.dispose(); }
    const fina = new THREE.GridHelper(4000, 200, token('--grade'), token('--grade'));
    const grossa = new THREE.GridHelper(4000, 40, token('--grade-forte'), token('--grade-forte'));
    fina.position.y = 0.2;
    grossa.position.y = 0.3;
    grades = [fina, grossa];
    cena.add(fina, grossa);
    if (atual) desenharCotas();
    if (destaque) destaque.material.color.set(token('--acento'));
    precisaRender = true;
  }

  function redimensionar() {
    const el = $('#vista');
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    rotulos.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    precisaRender = true;
  }

  function reconstruir() {
    if (atual) { cena.remove(atual.raiz); MONT.descartar(atual.raiz); }
    try {
      atual = MONT.montar(E.build, CAT, { rgb: E.vis.rgb, fotos });
    } catch (err) {
      console.error(err);
      atual = null;
      mostrarFalha('Não consegui montar a build: ' + err.message + ' Confira o catalogo.js.');
      return;
    }
    atual.raiz.traverse((o) => {
      const t = o.material && o.material.userData && o.material.userData.tipo;
      if (o.isMesh && (t === 'vidro' || t === 'tela')) o.castShadow = false;
    });
    cena.add(atual.raiz);
    if (!luzInterna) {
      luzInterna = new THREE.PointLight(0xffffff, 0.85, 950, 0);
      cena.add(luzInterna);
    }
    luzInterna.position.set(-atual.Q.W * 0.15, atual.Q.H * 0.6, atual.Q.D * 0.05);
    rotores = [];
    atual.raiz.traverse((o) => { if (o.userData.rotor) rotores.push(o.userData.rotor); });
    checagem = VER.verificar(atual, E.build);
    aplicarVisibilidade();
    aplicarExplosao(true);
    desenharCotas();
    if (E.sel && !atual.partes.some((p) => p.id === E.sel && p.obj)) E.sel = null;
    atualizarDestaque();
    renderStatus();
    precisaRender = true;
  }

  function agendarReconstrucao() {
    if (reconstruirPendente) return;
    reconstruirPendente = true;
    requestAnimationFrame(() => {
      reconstruirPendente = false;
      reconstruir();
    });
  }

  function aplicarVisibilidade() {
    if (!atual) return;
    for (const p of atual.paineis) p.obj.visible = E.vis.paineis && (p.tipo !== 'vidro' || E.vis.vidro);
    for (const p of atual.partes) if (p.obj && p.id !== 'gabinete') p.obj.visible = !E.ocultas.has(p.id) && !(p.id === 'riser' && E.ocultas.has('gpu')) && !(p.id === 'conectorRiser' && E.ocultas.has('gpu'));
    const mt = $('#mostrar-tudo');
    if (mt) mt.hidden = !E.ocultas.size;
    atual.raiz.traverse((o) => { if (o.userData.fluxo) o.visible = E.vis.fluxo; });
    grupoCotas.visible = E.vis.cotas;
    $('#legenda-fluxo').hidden = !E.vis.fluxo;
    for (const b of $$('[data-vis]')) b.setAttribute('aria-pressed', String(!!E.vis[b.dataset.vis]));
    precisaRender = true;
  }

  function aplicarExplosao(imediato) {
    if (!atual) return;
    if (imediato) explodirAtual = explodirAlvo;
    for (const p of atual.paineis) p.obj.position.copy(p.dir).multiplyScalar(explodirAtual * 230);
  }

  /* ---------- cotas (linhas de dimensão) ---------- */
  function desenharCotas() {
    for (const c of grupoCotas.children.slice()) {
      grupoCotas.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
      if (c.element && c.element.remove) c.element.remove();
    }
    if (!atual) return;
    const { W, H, D } = atual.Q;
    const V = THREE.Vector3;
    const o = 46;
    const pts = [];
    const tique = (p, u) => { const t = 7; pts.push(p.clone().addScaledVector(u, -t), p.clone().addScaledVector(u, t)); };
    // largura (frente, embaixo)
    const la = new V(-W / 2, 0.5, D / 2 + o), lb = new V(W / 2, 0.5, D / 2 + o);
    pts.push(la, lb, new V(-W / 2, 0.5, D / 2 + 6), new V(-W / 2, 0.5, D / 2 + o + 10), new V(W / 2, 0.5, D / 2 + 6), new V(W / 2, 0.5, D / 2 + o + 10));
    tique(la, new V(1, 0, 1).normalize()); tique(lb, new V(1, 0, 1).normalize());
    // profundidade (lado do vidro, embaixo)
    const pa = new V(-W / 2 - o, 0.5, -D / 2), pb = new V(-W / 2 - o, 0.5, D / 2);
    pts.push(pa, pb, new V(-W / 2 - 6, 0.5, -D / 2), new V(-W / 2 - o - 10, 0.5, -D / 2), new V(-W / 2 - 6, 0.5, D / 2), new V(-W / 2 - o - 10, 0.5, D / 2));
    tique(pa, new V(1, 0, 1).normalize()); tique(pb, new V(1, 0, 1).normalize());
    // altura (canto frontal esquerdo)
    const ha = new V(-W / 2 - o * 0.7, 0, D / 2 + o * 0.7), hb = new V(-W / 2 - o * 0.7, H, D / 2 + o * 0.7);
    pts.push(ha, hb, new V(-W / 2 - 4, H, D / 2 + 4), hb.clone().add(new V(-8, 0, 8)));
    tique(ha, new V(1, 1, 0).normalize()); tique(hb, new V(1, 1, 0).normalize());
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const linhas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: token('--acento'), depthTest: false, transparent: true }));
    linhas.renderOrder = 20;
    grupoCotas.add(linhas);
    const rotulo = (valor, pos) => {
      const d = document.createElement('span');
      d.className = 'cota';
      d.innerHTML = esc(fmt(valor, 0)) + ' <small>mm</small>';
      const obj = new CSS2DObject(d);
      obj.position.copy(pos);
      grupoCotas.add(obj);
    };
    rotulo(W, la.clone().lerp(lb, 0.5));
    rotulo(D, pa.clone().lerp(pb, 0.5));
    rotulo(H, ha.clone().lerp(hb, 0.5));
    grupoCotas.visible = E.vis.cotas;
  }

  /* ---------- seleção ---------- */
  function atualizarDestaque() {
    if (destaque) { cena.remove(destaque); destaque.geometry.dispose(); destaque.material.dispose(); destaque = null; }
    const p = atual && E.sel && atual.partes.find((x) => x.id === E.sel);
    if (!p) { renderFicha(); return; }
    const caixa = new THREE.Box3();
    if (p.id === 'gabinete') caixa.set(new THREE.Vector3(-atual.Q.W / 2, 0, -atual.Q.D / 2), new THREE.Vector3(atual.Q.W / 2, atual.Q.H, atual.Q.D / 2));
    else for (const c of p.caixas) caixa.union(c);
    caixa.expandByScalar(1.5);
    destaque = new THREE.Box3Helper(caixa, token('--acento'));
    destaque.material.depthTest = false;
    destaque.material.transparent = true;
    destaque.renderOrder = 30;
    cena.add(destaque);
    renderFicha();
    precisaRender = true;
  }

  function selecionar(id) {
    E.sel = id || null;
    atualizarDestaque();
  }

  function visivel(o) {
    while (o) { if (!o.visible) return false; o = o.parent; }
    return true;
  }

  function parteNoPonto(x, y) {
    if (!atual) return null;
    const r = renderer.domElement.getBoundingClientRect();
    const ponto = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ponto, camera);
    const hits = ray.intersectObject(atual.raiz, true).filter((h) => visivel(h.object) && h.object.userData.parteId);
    const solido = hits.find((h) => {
      const t = h.object.material && h.object.material.userData && h.object.material.userData.tipo;
      return t !== 'vidro' && t !== 'tela';
    });
    const alvo = solido || hits[0];
    return alvo ? alvo.object.userData.parteId : null;
  }

  function ligarPonteiro() {
    const cv = renderer.domElement;
    const tip = $('#tooltip');
    let inicio = null;
    let ultimo = 0;
    cv.addEventListener('pointerdown', (e) => { inicio = { x: e.clientX, y: e.clientY }; tip.hidden = true; });
    cv.addEventListener('pointerup', (e) => {
      if (!inicio) return;
      const moveu = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 5;
      inicio = null;
      if (!moveu) selecionar(parteNoPonto(e.clientX, e.clientY));
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const agora = performance.now();
      if (agora - ultimo < 60) return;
      ultimo = agora;
      const id = parteNoPonto(e.clientX, e.clientY);
      const p = id && atual.partes.find((x) => x.id === id);
      if (!p) { tip.hidden = true; cv.style.cursor = ''; return; }
      const r = $('#palco').getBoundingClientRect();
      tip.textContent = p.nome;
      tip.style.left = (e.clientX - r.left) + 'px';
      tip.style.top = (e.clientY - r.top) + 'px';
      tip.hidden = false;
      cv.style.cursor = 'pointer';
    });
    cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  }

  /* ---------- câmera ---------- */
  const VISTAS = {
    iso: [-0.95, 0.62, 1.05], vidro: [-1, 0.12, 0.02], frente: [0.02, 0.14, 1],
    traseira: [0.02, 0.14, -1], topo: [0.001, 1, 0.02]
  };
  function irVista(nome, instantaneo) {
    if (!atual) return;
    const { W, H, D } = atual.Q;
    const alvo = new THREE.Vector3(0, H * 0.46, 0);
    const raio = Math.sqrt(W * W + H * H + D * D) / 2;
    const meio = THREE.MathUtils.degToRad(camera.fov / 2);
    let dist = (raio / Math.sin(meio)) * 1.08;
    if (camera.aspect < 1) dist /= Math.max(0.55, camera.aspect);
    const dir = new THREE.Vector3(...VISTAS[nome]).normalize();
    const pos = alvo.clone().addScaledVector(dir, dist);
    for (const b of $$('[data-vista]')) b.setAttribute('aria-pressed', String(b.dataset.vista === nome));
    if (instantaneo) {
      camera.position.copy(pos);
      controles.target.copy(alvo);
      controles.update();
      precisaRender = true;
      return;
    }
    tween = { t0: performance.now(), dur: 650, p0: camera.position.clone(), p1: pos, a0: controles.target.clone(), a1: alvo };
  }

  /* ---------- laço de renderização ---------- */
  let ultimoQuadro = performance.now();
  function animar(agora) {
    requestAnimationFrame(animar);
    const dt = Math.min(0.05, (agora - ultimoQuadro) / 1000);
    ultimoQuadro = agora;
    if (tween) {
      let t = Math.min(1, (agora - tween.t0) / tween.dur);
      t = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(tween.p0, tween.p1, t);
      controles.target.lerpVectors(tween.a0, tween.a1, t);
      if (t >= 1) tween = null;
      precisaRender = true;
    }
    if (Math.abs(explodirAlvo - explodirAtual) > 0.0005) {
      explodirAtual += (explodirAlvo - explodirAtual) * Math.min(1, dt * 10);
      aplicarExplosao(false);
      precisaRender = true;
    }
    if (E.vis.girar && rotores.length) {
      for (const r of rotores) r.rotation.z += dt * 7;
      precisaRender = true;
    }
    controles.update();
    if (precisaRender) {
      precisaRender = false;
      if (composer) composer.render(); else renderer.render(cena, camera);
      rotulos.render(cena, camera);
    }
  }

  /* ---------- foto real do topo da placa-mãe (guardada no navegador) ---------- */
  const fotos = {};
  function abrirBanco() {
    return new Promise((ok, erro) => {
      try {
        const req = indexedDB.open('bancada3d', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('fotos');
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error);
      } catch (e) { erro(e); }
    });
  }
  async function bancoOp(modo, fn) {
    const db = await abrirBanco();
    return new Promise((ok, erro) => {
      const tx = db.transaction('fotos', modo);
      const req = fn(tx.objectStore('fotos'));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => erro(tx.error);
    });
  }
  const fotoLer = (id) => bancoOp('readonly', (st) => st.get(id)).catch(() => null);
  const fotoGravar = (id, blob) => bancoOp('readwrite', (st) => st.put(blob, id)).catch(() => null);
  const fotoApagar = (id) => bancoOp('readwrite', (st) => st.delete(id)).catch(() => null);
  function carregarImagem(blob) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não consegui abrir essa imagem.')); };
      img.src = url;
    });
  }
  async function prepararFoto(id) {
    if (!id || id in fotos) return false;
    fotos[id] = null;
    const blob = await fotoLer(id);
    if (!blob) return false;
    try { fotos[id] = await carregarImagem(blob); return true; } catch (e) { return false; }
  }
  function aoPrepararFoto(id) {
    prepararFoto(id).then((achou) => { if (achou) { reconstruir(); renderAba(); } });
  }

  /* Aproxima a câmera de uma peça, mantendo o ângulo pelo lado do vidro. */
  function enquadrar(id) {
    const p = atual && atual.partes.find((x) => x.id === id);
    if (!p) return;
    if (p.id === 'gabinete') { irVista('iso'); return; }
    if (p.id === 'fonte' && !E.ocultas.has('caixaFonte')) { E.ocultas.add('caixaFonte'); aplicarVisibilidade(); }
    const caixa = new THREE.Box3();
    for (const c of p.caixas) caixa.union(c);
    if (caixa.isEmpty()) return;
    const centro = caixa.getCenter(new THREE.Vector3());
    const tam = caixa.getSize(new THREE.Vector3()).length();
    const PREF = { placaMae: [-1, 0.14, 0.18], gpu: [-0.86, 0.3, 0.4], radiador: [-0.7, -0.45, 0.55], fonte: [-0.75, 0.3, 0.6] };
    let dir = camera.position.clone().sub(controles.target).normalize();
    if (p.id.startsWith('memoria-')) dir.set(-0.72, 0.28, 0.62);
    else if (PREF[p.id]) dir.set(...PREF[p.id]);
    else if (dir.x > -0.25) dir.set(-0.82, 0.36, 0.45);
    dir.normalize();
    const dist = Math.max(200, (tam * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    tween = { t0: performance.now(), dur: 700, p0: camera.position.clone(), p1: centro.clone().addScaledVector(dir, dist), a0: controles.target.clone(), a1: centro };
    for (const b of $$('[data-vista]')) b.setAttribute('aria-pressed', 'false');
  }

  /* ============================== interface ============================== */
  function opcoes(colecao, sel, filtro) {
    return Object.entries(colecao)
      .filter(([id, s]) => !filtro || filtro(s, id))
      .map(([id, s]) => '<option value="' + esc(id) + '"' + (id === sel ? ' selected' : '') + '>' + esc(s.nome) + '</option>')
      .join('');
  }
  function seg(caminho, atualV, itens, aria, num) {
    return '<div class="seg" role="group" aria-label="' + esc(aria) + '">' + itens.map(([v, r]) =>
      '<button type="button" data-bind="' + caminho + '" data-valor="' + esc(v) + '"' + (num ? ' data-num="1"' : '') +
      ' aria-pressed="' + (String(v) === String(atualV)) + '">' + esc(r) + '</button>').join('') + '</div>';
  }
  function slider(id, caminho, valor, min, max, passo, rotulo, un = 'mm') {
    return '<div class="campo campo-slider"><label for="' + id + '">' + esc(rotulo) + '</label>' +
      '<output id="' + id + '-v" for="' + id + '">' + fmt(Number(valor), 0) + ' ' + un + '</output>' +
      '<input type="range" id="' + id + '" data-bind="' + caminho + '" data-un="' + un + '" min="' + min + '" max="' + max + '" step="' + passo + '" value="' + valor + '"></div>';
  }
  function campoSelect(id, caminho, rotulo, html) {
    return '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label><select id="' + id + '" data-bind="' + caminho + '">' + html + '</select></div>';
  }

  /* Campos de "Editar medidas" por peça (caminhos dentro do catálogo). */
  const CAMPOS = {
    gabinete: [
      ['limites.gpuComprimento', 'Comprimento máximo da GPU'], ['limites.fonteComprimento', 'Comprimento máximo da fonte'],
      ['limites.coolerAltura', 'Altura máxima do cooler'], ['placaMae.topoY', 'Borda de cima da placa-mãe (altura do chão)'],
      ['bandeja.x', 'Bandeja: distância da lateral direita']
    ],
    placaMae: [['largura', 'Largura'], ['altura', 'Altura'], ['soquete.x', 'Soquete: distância da borda traseira'], ['soquete.y', 'Soquete: distância da borda de cima']],
    memoria: [['altura', 'Altura do pente'], ['espessura', 'Espessura do pente']],
    cooler: [
      ['radiador.comprimento', 'Radiador: comprimento'], ['radiador.largura', 'Radiador: largura'], ['radiador.espessura', 'Radiador: espessura'],
      ['bomba.largura', 'Bomba: largura', ['bomba.profundidade']], ['bomba.altura', 'Bomba: altura']
    ],
    fonte: [['comprimento', 'Comprimento'], ['largura', 'Largura'], ['altura', 'Altura']],
    gpu: [
      ['deshroud.comprimento', 'Sem shroud: comprimento'], ['deshroud.altura', 'Sem shroud: altura (com os contatos)'],
      ['deshroud.espessura', 'Sem shroud: espessura (backplate → aletas)'],
      ['comprimento', 'Com shroud: comprimento'], ['altura', 'Com shroud: altura'], ['espessura', 'Com shroud: espessura']
    ]
  };
  const COLECAO = { gabinete: 'gabinetes', placaMae: 'placasMae', memoria: 'memorias', cooler: 'coolers', fonte: 'fontes', gpu: 'gpus' };

  function blocoMedidas(cat, id) {
    const base = CAT[COLECAO[cat]][id];
    const aj = (E.build.medidas && E.build.medidas[id]) || {};
    const n = Object.keys(aj).length;
    const linhas = CAMPOS[cat].map(([cam, rot, tambem]) => {
      const orig = ler(base, cam);
      if (typeof orig !== 'number') return '';
      const val = aj[cam] != null ? aj[cam] : orig;
      const alt = aj[cam] != null && aj[cam] !== orig;
      const idc = 'm-' + cat + '-' + cam.replace(/\./g, '-');
      return '<label class="medida' + (alt ? ' alterada' : '') + '" for="' + idc + '"><span>' + esc(rot) +
        (alt ? '<small>original: ' + fmt(orig) + ' mm</small>' : '') + '</span>' +
        '<input type="number" id="' + idc + '" step="0.1" min="0" value="' + val + '" data-medida="' + esc(id) + '" data-caminho="' + cam + '"' +
        (tambem ? ' data-tambem="' + tambem.join(',') + '"' : '') + ' inputmode="decimal"></label>';
    }).join('');
    return '<details class="medidas"' + (n ? ' open' : '') + '><summary>Editar medidas' + (n ? ' (' + n + ' alterada' + (n > 1 ? 's' : '') + ')' : '') + '</summary>' +
      '<div class="grade-medidas">' + linhas + '</div>' +
      (n ? '<div class="acoes" style="margin-top:8px"><button type="button" class="botao" data-restaurar="' + esc(id) + '">Voltar às medidas originais</button></div>' : '') +
      '</details>';
  }

  function blocoFoto(id, spec) {
    const tem = !!fotos[id];
    const nota = tem
      ? 'Usando a sua foto no topo da placa e de cada dissipador.'
      : (spec.estilo === 'maxsun-terminator'
        ? 'Desenho baseado na MAXSUN branca: PCB preto e armadura prata-branca jateada e escovada com linhas vermelho-escuras.'
        : 'Desenho genérico.') + ' Para ficar idêntica, envie a foto oficial de cima da placa, reta e recortada rente às bordas.';
    return '<div class="campo"><span class="rotulo">Acabamento do topo</span><div class="acoes">' +
      '<label class="botao" for="foto-mb">' + (tem ? 'Trocar foto' : 'Usar foto da placa') + '</label>' +
      '<input type="file" id="foto-mb" accept="image/*" hidden>' +
      (tem ? '<button type="button" class="botao" id="foto-mb-remover">Voltar ao desenho</button>' : '') +
      '</div><p class="nota" id="foto-mb-msg">' + esc(nota) + '</p></div>';
  }

  function cabecalhoCartao(titulo, dim, parte) {
    return '<header><h3>' + esc(titulo) + '</h3>' +
      (parte ? '<button type="button" class="link-3d" data-localizar="' + parte + '">Mostrar no 3D</button>' : '') + '</header>' +
      (dim ? '<span class="dim">' + esc(dim) + '</span>' : '');
  }

  function renderPecas() {
    const b = E.build;
    const R = atual ? atual.R : MONT.resolver(b, CAT);
    const G = R.gabinete;
    const gv = G.gpuVertical;
    const zonasRad = Object.entries(G.montagens).filter(([, z]) => z.radiador > 0);
    const classe = R.cooler.fans.quantidade * R.coolerFan.tamanho;
    const eixoRad = G.montagens[b.refrigeracao.local] ? G.montagens[b.refrigeracao.local].eixo : 'frente';
    const tubosItens = eixoRad === 'cima' ? [[1, 'Para cima'], [-1, 'Para baixo']] : [[1, 'Para a frente'], [-1, 'Para trás']];
    const folgaEixo = atual && atual.radInfo ? atual.radInfo.folgaEixo : 30;
    const lim = Math.max(1, Math.floor(folgaEixo));
    const deshroud = b.gpu.modo !== 'original';
    const vertical = b.gpu.orientacao !== 'horizontal';
    const fansGpu = Object.entries(CAT.fans);
    const gpuMed = atual ? atual.partes.find((p) => p.id === 'gpu') : null;
    const gm = gpuMed ? gpuMed.obj.userData.medidas : null;

    return [
      '<section class="cartao">', cabecalhoCartao('Gabinete', G.medidas.profundidade + ' × ' + G.medidas.largura + ' × ' + G.medidas.altura + ' mm', 'gabinete'),
      campoSelect('s-gab', 'gabinete.modelo', 'Modelo', opcoes(CAT.gabinetes, b.gabinete.modelo)),
      '<div class="cores"><label>Cor do gabinete <input type="color" data-bind="gabinete.cor" value="' + esc(b.gabinete.cor || G.cor) + '"></label>',
      '<label>Cor do RGB <input type="color" data-vis-cor="rgb" value="' + esc(E.vis.rgb) + '"></label></div>',
      blocoMedidas('gabinete', R.ids.gabinete), '</section>',

      '<section class="cartao">', cabecalhoCartao('Placa-mãe', R.placaMae.formato + ' · ' + R.placaMae.largura + ' × ' + R.placaMae.altura + ' mm', 'placaMae'),
      campoSelect('s-mb', 'placaMae.modelo', 'Modelo', opcoes(CAT.placasMae, b.placaMae.modelo)),
      campoSelect('s-cpu', 'cpu.modelo', 'Processador (para estimar o consumo)', opcoes(CAT.cpus, b.cpu.modelo)),
      blocoFoto(R.ids.placaMae, R.placaMae),
      blocoMedidas('placaMae', R.ids.placaMae), '</section>',

      '<section class="cartao">', cabecalhoCartao('Memória', R.memoria.capacidade * (b.memoria.quantidade || 2) + ' GB · ' + fmt(R.memoria.altura) + ' mm', 'memoria-0'),
      campoSelect('s-ram', 'memoria.modelo', 'Modelo', opcoes(CAT.memorias, b.memoria.modelo)),
      '<div class="campo"><span class="rotulo">Quantidade de pentes</span>' + seg('memoria.quantidade', b.memoria.quantidade, [[1, '1'], [2, '2'], [4, '4']], 'Quantidade de pentes', true) + '</div>',
      blocoMedidas('memoria', R.ids.memoria), '</section>',

      '<section class="cartao">', cabecalhoCartao('Watercooler', classe + ' mm', 'radiador'),
      campoSelect('s-aio', 'refrigeracao.modelo', 'Modelo', opcoes(CAT.coolers, b.refrigeracao.modelo)),
      '<div class="linha2">', campoSelect('s-aio-local', 'refrigeracao.local', 'Posição do radiador', zonasRad.map(([zid, z]) =>
        '<option value="' + zid + '"' + (zid === b.refrigeracao.local ? ' selected' : '') + '>' + esc(z.nome) + ' (até ' + z.radiador + ')</option>').join('')),
      '<div class="campo"><span class="rotulo">Fluxo dos fans</span>' + seg('refrigeracao.fluxo', b.refrigeracao.fluxo, [['saida', 'Saída'], ['entrada', 'Entrada']], 'Fluxo dos fans do radiador') + '</div></div>',
      '<div class="campo"><span class="rotulo">Fans do radiador</span>' + seg('refrigeracao.fansPosicao', b.refrigeracao.fansPosicao, [['dentro', 'Entre radiador e placa'], ['painel', 'Colados no painel']], 'Posição dos fans do radiador') + '</div>',
      '<div class="campo"><span class="rotulo">Mangueiras saem</span>' + seg('refrigeracao.tubos', b.refrigeracao.tubos, tubosItens, 'Lado das mangueiras', true) + '</div>',
      slider('r-aio-desl', 'refrigeracao.deslocamento', Math.max(-lim, Math.min(lim, b.refrigeracao.deslocamento || 0)), -lim, lim, 1, 'Deslocar o radiador ao longo da posição'),
      blocoMedidas('cooler', R.ids.cooler), '</section>',

      '<section class="cartao">', cabecalhoCartao('Fonte', R.fonte.largura + ' × ' + R.fonte.altura + ' × ' + R.fonte.comprimento + ' mm', 'fonte'),
      campoSelect('s-psu', 'fonte.modelo', 'Modelo', opcoes(CAT.fontes, b.fonte.modelo)),
      '<p class="nota">O ' + esc(G.nome) + ' aceita fonte de até <strong>' + G.limites.fonteComprimento + ' mm</strong> de comprimento.</p>',
      blocoMedidas('fonte', R.ids.fonte), '</section>',

      '<section class="cartao">', cabecalhoCartao('Placa de vídeo', gm ? fmt(gm.comprimento) + ' × ' + fmt(gm.altura) + ' × ' + fmt(gm.espessura) + ' mm' : '', 'gpu'),
      campoSelect('s-gpu', 'gpu.modelo', 'Modelo', opcoes(CAT.gpus, b.gpu.modelo)),
      '<div class="linha2"><div class="campo"><span class="rotulo">Cooler</span>' + seg('gpu.modo', b.gpu.modo, [['deshroud', 'Sem shroud'], ['original', 'Original']], 'Cooler da placa de vídeo') + '</div>',
      '<div class="campo"><span class="rotulo">Montagem</span>' + seg('gpu.orientacao', b.gpu.orientacao, [['vertical', 'Vertical'], ['horizontal', 'Horizontal']], 'Orientação da placa de vídeo') + '</div></div>',
      vertical ? slider('r-gpu-dist', 'gpu.distanciaBandeja', b.gpu.distanciaBandeja, gv.distanciaMin, gv.distanciaMax, 1, 'Distância da bandeja até a backplate') : '',
      vertical ? slider('r-gpu-alt', 'gpu.alturaDoChao', b.gpu.alturaDoChao, gv.alturaMin, Math.round(G.medidas.altura * 0.5), 1, 'Altura da borda de baixo da placa (do chão)') : '',
      deshroud ? [
        campoSelect('s-gpu-fan', 'gpu.fans.modelo', 'Fans presos no dissipador', fansGpu.map(([id, f]) => '<option value="' + id + '"' + (id === b.gpu.fans.modelo ? ' selected' : '') + '>' + esc(f.nome) + '</option>').join('')),
        '<div class="campo"><span class="rotulo">Quantidade de fans</span>' + seg('gpu.fans.quantidade', b.gpu.fans.quantidade, [[1, '1'], [2, '2'], [3, '3']], 'Quantidade de fans na GPU', true) + '</div>',
        slider('r-gpu-esp', 'gpu.fans.espacamento', b.gpu.fans.espacamento, 0, 40, 1, 'Espaço entre os fans'),
        slider('r-gpu-fdes', 'gpu.fans.deslocamento', b.gpu.fans.deslocamento, -80, 80, 1, 'Deslocar os fans ao longo da placa')
      ].join('') : '',
      blocoMedidas('gpu', R.ids.gpu), '</section>'
    ].join('');
  }

  function zonaCfg(zid, zona) {
    const z = E.build.fans[zid];
    if (z) return z;
    const tams = MONT.tamanhosDaZona(zona);
    return { tamanho: tams.includes(140) ? 140 : tams[0], fluxo: ['topo', 'traseira'].includes(zid) ? 'saida' : 'entrada', vagas: [] };
  }

  function renderFans() {
    const G = atual ? atual.G : MONT.resolver(E.build, CAT).gabinete;
    const rad = atual && atual.radInfo;
    const fl = atual ? atual.fluxo : null;
    const partes = [];
    if (fl) {
      partes.push('<div class="resumo"><strong>' + fl.entrada + ' entrando · ' + fl.saida + ' saindo</strong><span class="nota">Contando os fans do gabinete e do radiador. Ligue “Fluxo de ar” no 3D para ver as setas.</span></div>');
    }
    for (const [zid, zona] of Object.entries(G.montagens)) {
      const cfg = zonaCfg(zid, zona);
      const tams = MONT.tamanhosDaZona(zona);
      const cap = tams.map((t) => MONT.vagasDaZona(zona, t) + ' × ' + t).join(' / ');
      partes.push('<section class="cartao">', '<header><h3>' + esc(zona.nome) + '</h3><span class="etiqueta">' + cap + ' mm</span></header>');
      if (rad && rad.zona === zid) {
        partes.push('<p class="nota-forte">Ocupado pelo radiador do watercooler (' + rad.classe + ' mm). Mude a posição do radiador na aba Peças para liberar.</p></section>');
        continue;
      }
      const tam = Number(cfg.tamanho) || tams[0];
      const n = MONT.vagasDaZona(zona, tam);
      partes.push('<div class="linha2">',
        '<div class="campo"><span class="rotulo">Tamanho</span><div class="seg" role="group" aria-label="Tamanho dos fans">' + tams.map((t) =>
          '<button type="button" data-fz="' + zid + '" data-fz-campo="tamanho" data-valor="' + t + '" aria-pressed="' + (t === tam) + '">' + t + ' mm</button>').join('') + '</div></div>',
        '<div class="campo"><span class="rotulo">Fluxo</span><div class="seg" role="group" aria-label="Fluxo de ar">' + [['entrada', 'Entrada'], ['saida', 'Saída']].map(([v, r]) =>
          '<button type="button" data-fz="' + zid + '" data-fz-campo="fluxo" data-valor="' + v + '" aria-pressed="' + (cfg.fluxo === v) + '">' + r + '</button>').join('') + '</div></div>',
        '</div><ol class="vagas">');
      for (let i = 0; i < n; i++) {
        const sel = (cfg.vagas || [])[i] || '';
        const ops = '<option value="">Vazia</option>' + opcoes(CAT.fans, sel, (f) => f.tamanho === tam);
        partes.push('<li><span>Vaga ' + (i + 1) + '</span><select aria-label="' + esc(zona.nome) + ', vaga ' + (i + 1) + '" data-fz="' + zid + '" data-vaga="' + i + '">' + ops + '</select></li>');
      }
      partes.push('</ol></section>');
    }
    partes.push('<p class="nota">Para cadastrar um fan novo, copie um item da seção <code>fans</code> do arquivo <code>data/catalogo.js</code>.</p>');
    return partes.join('');
  }

  const NOMES_NIVEL = { erro: 'Conflito', aviso: 'Atenção', ok: 'Cabe', info: 'Info' };
  function renderChecagem() {
    if (!checagem) return '<p class="nota">Carregando…</p>';
    const ordem = { erro: 0, aviso: 1, info: 2, ok: 3 };
    const itens = checagem.itens.slice().sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
    const nivel = checagem.erros ? 'erro' : checagem.avisos ? 'aviso' : 'ok';
    const titulo = checagem.erros ? checagem.erros + (checagem.erros > 1 ? ' conflitos encontrados' : ' conflito encontrado')
      : checagem.avisos ? 'Cabe, com ' + checagem.avisos + (checagem.avisos > 1 ? ' pontos de atenção' : ' ponto de atenção') : 'Tudo cabe';
    const en = checagem.energia;
    const nivelEn = en.carga > 1 ? 'erro' : en.carga > 0.8 ? 'aviso' : 'ok';
    const psu = atual.R.fonte.potencia;
    return [
      '<div class="resumo ' + nivel + '"><strong>' + esc(titulo) + '</strong><span class="nota">Checagem feita com as caixas de cada peça em escala real. Posições internas do gabinete são estimadas — veja a aba Medidas e fontes.</span></div>',
      '<ul class="itens">', itens.map((i) => '<li class="item ' + i.nivel + '"><span class="pill ' + i.nivel + '">' + NOMES_NIVEL[i.nivel] + '</span><div><strong>' + esc(i.titulo) + '</strong>' + (i.detalhe ? '<p>' + esc(i.detalhe) + '</p>' : '') + '</div></li>').join(''), '</ul>',
      '<h4 class="titulo-secao">Folgas medidas</h4>',
      '<dl class="folgas">', atual.folgas.map((f) => {
        const cls = f.valor < 0 ? ' negativa' : f.valor < f.minimo ? ' apertada' : '';
        const pct = Math.max(4, Math.min(100, (f.valor / 60) * 100));
        return '<div class="folga' + cls + '"><dt>' + esc(f.nome) + '</dt><dd>' + fmt(f.valor) + ' mm</dd><div class="barra"><i style="width:' + (f.valor < 0 ? 100 : pct) + '%"></i></div></div>';
      }).join(''), '</dl>',
      '<h4 class="titulo-secao">Energia estimada</h4>',
      '<div class="medidor ' + nivelEn + '"><div class="trilho"><i style="width:' + Math.min(100, en.carga * 100) + '%"></i></div>',
      '<div class="legenda"><span>~' + en.total + ' W</span><span>' + Math.round(en.carga * 100) + '% de ' + psu + ' W</span></div></div>'
    ].join('');
  }

  function linhaMedida(nome, medidas, estimado, fontes) {
    const links = (fontes || []).map((f) => '<li><a href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.rotulo) + '</a></li>').join('');
    return '<tr><td><strong>' + esc(nome) + '</strong>' + (links ? '<ul class="fontes-lista">' + links + '</ul>' : '') + '</td><td class="num">' + esc(medidas) + '</td><td>' +
      (estimado ? '<span class="chip estimado">' + esc(estimado) + '</span>' : '<span class="chip oficial">Oficial</span>') + '</td></tr>';
  }

  function renderMedidas() {
    const R = atual ? atual.R : MONT.resolver(E.build, CAT);
    const G = R.gabinete;
    const gpuFan = R.gpuFan;
    const fansUsados = new Set();
    for (const z of Object.values(E.build.fans || {})) for (const f of (z && z.vagas) || []) if (f) fansUsados.add(f);
    const linhas = [
      linhaMedida(G.nome, G.medidas.profundidade + ' × ' + G.medidas.largura + ' × ' + G.medidas.altura, 'Externas oficiais; internas estimadas', G.fontes),
      linhaMedida(R.placaMae.nome, R.placaMae.largura + ' × ' + R.placaMae.altura, R.placaMae.estimado && R.placaMae.estimado.length ? 'Tamanho oficial; layout estimado' : '', R.placaMae.fontes),
      linhaMedida(R.memoria.nome, fmt(R.memoria.comprimento, 2) + ' × ' + fmt(R.memoria.altura, 2), 'Espessura estimada', R.memoria.fontes),
      linhaMedida(R.cooler.nome + ' — radiador', R.cooler.radiador.comprimento + ' × ' + R.cooler.radiador.largura + ' × ' + R.cooler.radiador.espessura, (R.cooler.estimado || []).length ? 'Estimado' : '', R.cooler.fontes),
      linhaMedida(R.cooler.nome + ' — bomba', fmt(R.cooler.bomba.largura) + ' × ' + fmt(R.cooler.bomba.profundidade) + ' × ' + fmt(R.cooler.bomba.altura), (R.cooler.estimado || []).length ? 'Estimado' : '', []),
      linhaMedida(R.fonte.nome, R.fonte.largura + ' × ' + R.fonte.altura + ' × ' + R.fonte.comprimento, '', R.fonte.fontes),
      linhaMedida(R.gpu.nome + ' (com shroud)', fmt(R.gpu.comprimento) + ' × ' + fmt(R.gpu.altura) + ' × ' + fmt(R.gpu.espessura), '', R.gpu.fontes),
      linhaMedida(R.gpu.nome + ' (sem shroud)', R.gpu.deshroud.comprimento + ' × ' + R.gpu.deshroud.altura + ' × ' + R.gpu.deshroud.espessura, 'Estimado — meça o seu', []),
      linhaMedida(gpuFan.nome, gpuFan.tamanho + ' × ' + gpuFan.tamanho + ' × ' + gpuFan.espessura, '', gpuFan.fontes)
    ];
    for (const id of fansUsados) {
      const f = CAT.fans[id];
      if (f && id !== E.build.gpu.fans.modelo) linhas.push(linhaMedida(f.nome, f.tamanho + ' × ' + f.tamanho + ' × ' + f.espessura, (f.fontes || []).length ? '' : 'Genérico', f.fontes));
    }
    const json = JSON.stringify(E.build, null, 2);
    return [
      '<section class="cartao"><header><h3>Medidas usadas (mm)</h3></header>',
      '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Peça</th><th>Medidas</th><th>Origem</th></tr></thead><tbody>', linhas.join(''), '</tbody></table></div>',
      '<p class="nota">Comprimento × largura × altura (ou espessura). “Estimado” = o fabricante não publica; ajuste em “Editar medidas” depois de medir.</p></section>',
      '<section class="cartao"><header><h3>Salvar e compartilhar</h3></header>',
      '<p class="nota">A montagem fica salva neste navegador. Para guardar uma cópia ou abrir em outro computador, copie o texto abaixo (ou baixe o arquivo) e depois cole em “Carregar”.</p>',
      '<textarea class="json" id="json-build" spellcheck="false" aria-label="Montagem em JSON">' + esc(json) + '</textarea>',
      '<div class="acoes"><button type="button" class="botao botao-forte" id="b-copiar">Copiar</button><button type="button" class="botao" id="b-baixar">Baixar .json</button>',
      '<button type="button" class="botao" id="b-carregar">Carregar do texto</button><label class="botao" for="b-arquivo">Abrir arquivo</label><input type="file" id="b-arquivo" accept=".json,application/json" hidden></div>',
      '<p class="nota" id="json-msg" aria-live="polite"></p>',
      '<div class="acoes"><button type="button" class="botao botao-perigo" id="b-restaurar">Restaurar montagem padrão</button></div></section>',
      '<section class="cartao"><header><h3>Cadastrar peças novas</h3></header>',
      '<p class="nota">Tudo que aparece nos menus vem de <code>data/catalogo.js</code>. Copie um item da mesma categoria, troque o nome e as medidas e recarregue a página. Posições dentro do gabinete usam x = distância da lateral direita, y = altura do chão e z = distância da traseira, em mm.</p></section>'
    ].join('');
  }

  function renderAba() {
    const el = $('#conteudo');
    const rolagem = el.scrollTop;
    const html = E.aba === 'fans' ? renderFans() : E.aba === 'checagem' ? renderChecagem() : E.aba === 'medidas' ? renderMedidas() : renderPecas();
    el.innerHTML = html;
    el.scrollTop = rolagem;
    for (const b of $$('.abas [data-aba]')) b.setAttribute('aria-selected', String(b.dataset.aba === E.aba));
    el.setAttribute('aria-labelledby', 'tab-' + E.aba);
  }

  function renderStatus() {
    if (!checagem || !atual) return;
    const nivel = checagem.erros ? 'erro' : checagem.avisos ? 'aviso' : 'ok';
    const txt = checagem.erros ? checagem.erros + (checagem.erros > 1 ? ' conflitos' : ' conflito') : checagem.avisos ? checagem.avisos + ' atenção' : 'Tudo cabe';
    $('#status-geral').innerHTML = '<button type="button" class="pill ' + nivel + '" data-ir-aba="checagem" style="background:none;cursor:pointer">' + esc(txt) + '</button>';
    $('#sub-gabinete').textContent = atual.G.nome + ' · escala 1 : 1 em mm';
  }

  function renderFicha() {
    const f = $('#ficha');
    const p = atual && E.sel && atual.partes.find((x) => x.id === E.sel);
    if (!p) { f.hidden = true; f.innerHTML = ''; return; }
    const info = p.info || {};
    const med = (info.medidas || []).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('');
    const est = info.estimado && info.estimado.length ? '<p class="nota">Medidas estimadas: ' + esc(info.estimado.join(', ')) + '.</p>' : '';
    const fontes = (info.fontes || []).map((x) => '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.rotulo) + '</a></li>').join('');
    const conflitos = checagem ? checagem.colisoes.filter((c) => c.a.id === p.id || c.b.id === p.id) : [];
    f.innerHTML = '<header><span class="cat">' + esc(p.categoria) + '</span><button type="button" class="fechar" data-fechar-ficha aria-label="Fechar">×</button><h3>' + esc(p.nome) + '</h3></header>' +
      (conflitos.length ? '<p class="nota" style="color:var(--erro)">Encosta em: ' + esc(conflitos.map((c) => (c.a.id === p.id ? c.b.nome : c.a.nome)).join(', ')) + '</p>' : '') +
      (med ? '<dl>' + med + '</dl>' : '') + (info.notas ? '<p class="nota">' + esc(info.notas) + '</p>' : '') + est +
      (fontes ? '<ul class="fontes-lista">' + fontes + '</ul>' : '') +
      '<div class="acoes"><button type="button" class="botao" data-enquadrar="' + esc(p.id) + '">Aproximar</button>' +
      (p.id !== 'gabinete' ? '<button type="button" class="botao" data-ocultar="' + esc(p.id) + '">Ocultar</button>' : '') + '</div>';
    f.hidden = false;
  }

  /* ---------- eventos da interface ---------- */
  function aplicar(opts = {}) {
    salvar();
    reconstruir();
    if (opts.render !== false) renderAba();
  }

  function aoMudarGabinete() {
    const G = CAT.gabinetes[E.build.gabinete.modelo];
    if (!G) return;
    E.build.gabinete.cor = G.cor;
    E.build.gpu.distanciaBandeja = G.gpuVertical.distanciaPadrao || 70;
    E.build.gpu.alturaDoChao = G.gpuVertical.alturaPadrao || G.gpuVertical.alturaMin + 20;
    if (!G.montagens[E.build.refrigeracao.local] || !G.montagens[E.build.refrigeracao.local].radiador) E.build.refrigeracao.local = G.montagens.topo ? 'topo' : Object.keys(G.montagens)[0];
    E.build.refrigeracao.deslocamento = 0;
  }

  function valorDe(el) {
    if (el.dataset.num) return Number(el.dataset.valor);
    if (el.type === 'range' || el.type === 'number') return Number(el.value);
    return el.dataset.valor != null ? el.dataset.valor : el.value;
  }

  function ligarInterface() {
    const cont = $('#conteudo');

    cont.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('select[data-bind]')) {
        gravar(E.build, el.dataset.bind, el.value);
        if (el.dataset.bind === 'gabinete.modelo') aoMudarGabinete();
        if (el.dataset.bind === 'refrigeracao.local') E.build.refrigeracao.deslocamento = 0;
        aplicar();
        if (el.dataset.bind === 'placaMae.modelo') aoPrepararFoto(E.build.placaMae.modelo);
      } else if (el.matches('input[type="range"][data-bind]')) {
        salvar();
        renderAba();
      } else if (el.matches('input[type="color"]')) {
        salvar();
        renderAba();
      } else if (el.matches('input[data-medida]')) {
        const id = el.dataset.medida, cam = el.dataset.caminho;
        const v = Number(String(el.value).replace(',', '.'));
        if (!isFinite(v) || v <= 0) { renderAba(); return; }
        const colecao = Object.values(COLECAO).find((c) => CAT[c][id]);
        const orig = ler(CAT[colecao][id], cam);
        E.build.medidas = E.build.medidas || {};
        const aj = E.build.medidas[id] = E.build.medidas[id] || {};
        const caminhos = [cam].concat(el.dataset.tambem ? el.dataset.tambem.split(',') : []);
        for (const c of caminhos) { if (v === orig) delete aj[c]; else aj[c] = v; }
        if (!Object.keys(aj).length) delete E.build.medidas[id];
        aplicar();
      } else if (el.matches('select[data-fz]')) {
        const zid = el.dataset.fz;
        const G = atual.G;
        const cfg = clonar(zonaCfg(zid, G.montagens[zid]));
        cfg.vagas = cfg.vagas || [];
        cfg.vagas[Number(el.dataset.vaga)] = el.value || null;
        E.build.fans[zid] = cfg;
        aplicar();
      } else if (el.id === 'foto-mb' && el.files && el.files[0]) {
        const arq = el.files[0];
        const id = E.build.placaMae.modelo;
        carregarImagem(arq).then((img) => {
          fotos[id] = img;
          fotoGravar(id, arq);
          aplicar();
          selecionar('placaMae');
          enquadrar('placaMae');
        }, (err) => { const m = $('#foto-mb-msg'); if (m) m.textContent = err.message; });
      } else if (el.id === 'b-arquivo' && el.files && el.files[0]) {
        const leitor = new FileReader();
        leitor.onload = () => { $('#json-build').value = String(leitor.result); carregarTexto(); };
        leitor.readAsText(el.files[0]);
      }
    });

    cont.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches('input[type="range"][data-bind]')) {
        gravar(E.build, el.dataset.bind, Number(el.value));
        const out = document.getElementById(el.id + '-v');
        if (out) out.textContent = fmt(Number(el.value), 0) + ' ' + (el.dataset.un || 'mm');
        agendarReconstrucao();
      } else if (el.matches('input[type="color"][data-bind]')) {
        gravar(E.build, el.dataset.bind, el.value);
        agendarReconstrucao();
      } else if (el.matches('input[type="color"][data-vis-cor]')) {
        E.vis.rgb = el.value;
        agendarReconstrucao();
      }
    });

    cont.addEventListener('click', (e) => {
      const el = e.target.closest('button, [data-localizar]');
      if (!el) return;
      if (el.matches('button[data-bind]')) {
        gravar(E.build, el.dataset.bind, valorDe(el));
        if (el.dataset.bind === 'gpu.orientacao' && E.build.gpu.orientacao === 'vertical') {
          const gv = atual.G.gpuVertical;
          if (!isFinite(E.build.gpu.alturaDoChao)) E.build.gpu.alturaDoChao = gv.alturaPadrao;
        }
        aplicar();
      } else if (el.matches('button[data-fz]')) {
        const zid = el.dataset.fz;
        const zona = atual.G.montagens[zid];
        const cfg = clonar(zonaCfg(zid, zona));
        if (el.dataset.fzCampo === 'tamanho') {
          cfg.tamanho = Number(el.dataset.valor);
          cfg.vagas = (cfg.vagas || []).map((f) => (f && CAT.fans[f] && CAT.fans[f].tamanho === cfg.tamanho ? f : null));
        } else {
          cfg.fluxo = el.dataset.valor;
        }
        E.build.fans[zid] = cfg;
        aplicar();
      } else if (el.dataset.localizar) {
        selecionar(el.dataset.localizar);
        enquadrar(el.dataset.localizar);
      } else if (el.id === 'foto-mb-remover') {
        const id = E.build.placaMae.modelo;
        fotos[id] = null;
        fotoApagar(id);
        aplicar();
      } else if (el.dataset.restaurar) {
        if (E.build.medidas) delete E.build.medidas[el.dataset.restaurar];
        aplicar();
      } else if (el.id === 'b-copiar') {
        copiarJSON();
      } else if (el.id === 'b-baixar') {
        baixarJSON();
      } else if (el.id === 'b-carregar') {
        carregarTexto();
      } else if (el.id === 'b-restaurar') {
        if (el.dataset.confirmar !== '1') {
          el.dataset.confirmar = '1';
          el.textContent = 'Clique de novo para confirmar';
          setTimeout(() => { if (el.isConnected) { el.dataset.confirmar = ''; el.textContent = 'Restaurar montagem padrão'; } }, 4000);
          return;
        }
        E.build = clonar(PADRAO);
        E.sel = null;
        aplicar();
        irVista('iso');
        msgJSON('Montagem padrão restaurada.');
      }
    });

    $('.abas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-aba]');
      if (!b) return;
      E.aba = b.dataset.aba;
      salvar();
      renderAba();
      $('#conteudo').scrollTop = 0;
    });
    $('.abas').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const abas = $$('.abas [data-aba]');
      const i = abas.findIndex((b) => b.dataset.aba === E.aba);
      const prox = abas[(i + (e.key === 'ArrowRight' ? 1 : abas.length - 1)) % abas.length];
      prox.focus();
      prox.click();
    });

    document.addEventListener('click', (e) => {
      const ir = e.target.closest('[data-ir-aba]');
      if (ir) { E.aba = ir.dataset.irAba; salvar(); renderAba(); }
      if (e.target.closest('[data-fechar-ficha]')) selecionar(null);
      const enq = e.target.closest('[data-enquadrar]');
      if (enq) enquadrar(enq.dataset.enquadrar);
      const oc = e.target.closest('[data-ocultar]');
      if (oc) { E.ocultas.add(oc.dataset.ocultar); selecionar(null); aplicarVisibilidade(); }
      if (e.target.closest('#mostrar-tudo')) { E.ocultas.clear(); aplicarVisibilidade(); }
      if (e.target.closest('[data-fechar-modal]') || e.target.id === 'modal-imagem') $('#modal-imagem').hidden = true;
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { $('#modal-imagem').hidden = true; if (E.sel) selecionar(null); }
    });

    for (const b of $$('[data-vista]')) b.addEventListener('click', () => irVista(b.dataset.vista));
    for (const b of $$('[data-vis]')) {
      b.addEventListener('click', () => {
        const k = b.dataset.vis;
        E.vis[k] = !E.vis[k];
        salvar();
        aplicarVisibilidade();
      });
    }
    $('#explodir').addEventListener('input', (e) => { explodirAlvo = Number(e.target.value); });
    $('#capturar').addEventListener('click', capturar);
    $('#qualidade').addEventListener('click', () => {
      E.vis.qualidade = E.vis.qualidade === 'leve' ? 'alta' : 'leve';
      salvar();
      montarPosProcesso();
    });
    $('#modal-imagem-baixar').addEventListener('click', baixarImagem);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', aplicarTema);
    new MutationObserver(aplicarTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function msgJSON(t) { const m = $('#json-msg'); if (m) m.textContent = t; }
  function copiarJSON() {
    const ta = $('#json-build');
    const texto = ta.value;
    const fallback = () => { ta.focus(); ta.select(); msgJSON('Texto selecionado. Use Ctrl+C para copiar.'); };
    try {
      navigator.clipboard.writeText(texto).then(() => msgJSON('Copiado.'), fallback);
    } catch (e) { fallback(); }
  }
  /* Salva um arquivo: dentro do Claude usa a capacidade "downloads"
     (o visualizador pede confirmação); fora dele, o download do navegador. */
  async function salvarArquivo(nome, dados) {
    const c = window.claude;
    if (c && typeof c.use === 'function') {
      const dl = await c.use('downloads').catch(() => null);
      if (dl) {
        try {
          await dl.save({ filename: nome, data: dados });
          return 'Arquivo salvo.';
        } catch (e) {
          if (e && e.code === 'declined') return 'Download cancelado.';
          if (e && e.code === 'rate_limited') return 'Já existe um pedido de download aberto. Tente de novo em instantes.';
          return 'Não deu para baixar aqui. Use o botão Copiar.';
        }
      }
    }
    const url = URL.createObjectURL(dados instanceof Blob ? dados : new Blob([dados]));
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return 'Download iniciado.';
  }
  async function baixarJSON() {
    msgJSON(await salvarArquivo('minha-build.json', JSON.stringify(E.build, null, 2)));
  }
  function carregarTexto() {
    let obj;
    try { obj = JSON.parse($('#json-build').value); } catch (e) { msgJSON('O texto não é um JSON válido: ' + e.message); return; }
    if (!obj || typeof obj !== 'object' || !obj.gabinete) { msgJSON('Esse JSON não parece uma montagem (falta o campo “gabinete”).'); return; }
    E.build = normalizar(obj);
    E.sel = null;
    aplicar();
    msgJSON('Montagem carregada.');
  }

  let imagemAtual = null;
  function capturar() {
    if (composer) composer.render(); else renderer.render(cena, camera);
    const cv = renderer.domElement;
    $('#modal-imagem-img').src = cv.toDataURL('image/png');
    cv.toBlob((b) => { imagemAtual = b; }, 'image/png');
    $('#modal-imagem-msg').textContent = 'Você também pode clicar com o botão direito na imagem e salvar.';
    $('#modal-imagem').hidden = false;
  }
  async function baixarImagem() {
    if (!imagemAtual) return;
    $('#modal-imagem-msg').textContent = await salvarArquivo('bancada-3d.png', imagemAtual);
  }

  function mostrarFalha(msg) {
    const c = $('#carregando');
    c.hidden = false;
    c.classList.add('falhou');
    $('#carregando-texto').textContent = msg;
  }

  /* ============================== início ============================== */
  function iniciar(deps) {
    if (iniciou) return;
    iniciou = true;
    ({ THREE, OrbitControls, RoomEnvironment, CSS2DRenderer, CSS2DObject } = deps);
    D = deps;
    M = window.PCBModelos(THREE);
    MONT = window.PCBMontagem(THREE, M);
    VER = window.PCBVerificacao();
    const est = carregarEstado();
    E.build = est.build;
    E.vis = est.vis;
    E.aba = est.aba;
    try {
      montarCena();
    } catch (err) {
      console.error(err);
      mostrarFalha('Seu navegador não conseguiu abrir o 3D (WebGL): ' + err.message);
      return;
    }
    ligarInterface();
    reconstruir();
    renderAba();
    irVista('iso', true);
    aoPrepararFoto(E.build.placaMae.modelo);
    $('#carregando').hidden = true;
    requestAnimationFrame(animar);
  }

  function falha(err) {
    console.error(err);
    mostrarFalha('Não consegui carregar o Three.js. Esta página precisa de internet para baixar o motor 3D (cdn.jsdelivr.net). Detalhe: ' + (err && err.message ? err.message : err));
  }

  setTimeout(() => {
    if (!iniciou && document.getElementById('carregando')) $('#carregando-texto').textContent = 'Ainda carregando o motor 3D… Se demorar, confira a conexão com a internet.';
  }, 9000);

  return { iniciar, falha };
})();
