/*
 * Bancada 3D — cena, interface e salvamento.
 * Depende de: catalogo.js, build-padrao.js, texturas.js, modelos3d.js,
 * cabos.js, montagem.js, verificacao.js, ambiente.js, ar.js, historico.js
 * e do Three.js (carregado pelo index.html).
 */
window.PCBApp = (function () {
  'use strict';

  const CHAVE = 'bancada3d.v1';
  const CAT = window.PCB_CATALOGO;
  const PADRAO = window.PCB_BUILD_PADRAO;
  const TOQUE = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  const VIS_PADRAO = {
    paineis: true, vidro: true, fluxo: false, ar: false, cotas: true, girar: true, vagas: false, grade: true, soGabinete: false, contatos: true,
    rgb: '#7cc8ff', rgbModo: 'fixo', qualidade: TOQUE ? 'leve' : 'alta'
  };
  const TONS = { neutro: 'NeutralToneMapping', aces: 'ACESFilmicToneMapping', agx: 'AgXToneMapping' };

  let THREE, M, MONT, VER, AMB, SIM, HIST, FOT, FIS, OrbitControls, CSS2DRenderer, CSS2DObject;
  let D = {};
  let composer = null, passoAO = null, sol = null, reflexo = null, sombraContato = null, chao = null;
  let cena, camera, renderer, controles, rotulos, grupoCotas, grupoVagas, grupoMedidas, grupoContatos, grupoFisica, destaque;
  // modo física: simulação (cannon-es, carregado só quando usado) e o que está sendo arrastado
  const fis = { ativo: false, carregando: false, sim: null, ponteiro: null, plano: null, alvo: null, pontos: null, cg: null, corda: null, ultimoTexto: 0 };
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
  let relogio = 0;

  const E = { build: null, vis: null, aba: 'pecas', sel: null, ocultas: new Set(), abertas: new Set(['gpu']), medir: { ativo: false, a: null, lista: [] } };
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
  const curto = (nome) => String(nome || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/GIGABYTE |ZOTAC GAMING |Geometric Future /g, '').replace(/\s+/g, ' ').trim();

  /* ============================== salvamento ============================== */
  function normalizar(b) {
    const out = clonar(PADRAO);
    if (!b || typeof b !== 'object') return out;
    for (const k of ['gabinete', 'placaMae', 'cpu', 'memoria', 'refrigeracao', 'fonte', 'gpu']) {
      if (b[k] && typeof b[k] === 'object') out[k] = Object.assign({}, out[k], b[k]);
    }
    if (b.gpu && b.gpu.fans) out.gpu.fans = Object.assign({}, PADRAO.gpu.fans, b.gpu.fans);
    if (b.fans && typeof b.fans === 'object' && !Array.isArray(b.fans)) out.fans = b.fans;
    if (b.medidas && typeof b.medidas === 'object') out.medidas = b.medidas;
    // números inválidos (texto, vazio, null) voltam ao valor padrão
    for (const c of ['memoria.quantidade', 'refrigeracao.tubos', 'refrigeracao.deslocamento', 'gpu.distanciaBandeja', 'gpu.alturaDoChao', 'gpu.fans.quantidade', 'gpu.fans.espacamento', 'gpu.fans.deslocamento']) {
      const v = ler(out, c);
      gravar(out, c, v !== null && v !== '' && isFinite(Number(v)) ? Number(v) : ler(PADRAO, c));
    }
    // fans: cada posição com tamanho, fluxo e lista de vagas
    const fans = {};
    for (const [z, cfg] of Object.entries(out.fans || {})) {
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
      fans[z] = { tamanho: Number(cfg.tamanho) || 140, fluxo: cfg.fluxo === 'saida' ? 'saida' : 'entrada', vagas: Array.isArray(cfg.vagas) ? cfg.vagas.map((f) => (typeof f === 'string' ? f : null)) : [] };
    }
    out.fans = fans;
    // medidas personalizadas: só números positivos
    const med = {};
    for (const [id, aj] of Object.entries(out.medidas || {})) {
      if (!aj || typeof aj !== 'object') continue;
      const ok = {};
      for (const [k, v] of Object.entries(aj)) if (typeof v === 'number' && isFinite(v) && v > 0) ok[k] = v;
      if (Object.keys(ok).length) med[id] = ok;
    }
    out.medidas = med;
    return out;
  }
  function carregarEstado() {
    try {
      const t = localStorage.getItem(CHAVE);
      if (t) {
        const o = JSON.parse(t);
        // versão 1 → 2: posição da GPU vertical passou a seguir a placa de slots do gabinete
        const g0 = o.build && o.build.gpu;
        if (g0 && (o.build.versao || 1) < 2 && g0.distanciaBandeja === 70 && g0.alturaDoChao === 81) { g0.distanciaBandeja = 56; g0.alturaDoChao = 76; }
        const vis = Object.assign({}, VIS_PADRAO, o.vis || {});
        if (!AMB.QUALIDADES[vis.qualidade]) vis.qualidade = VIS_PADRAO.qualidade;
        return { build: normalizar(o.build), vis, aba: o.aba || 'pecas', abertas: Array.isArray(o.abertas) ? o.abertas : null };
      }
    } catch (e) { /* armazenamento indisponível */ }
    return { build: clonar(PADRAO), vis: Object.assign({}, VIS_PADRAO), aba: 'pecas', abertas: null };
  }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ build: E.build, vis: E.vis, aba: E.aba, abertas: Array.from(E.abertas) })); } catch (e) { /* ignorado */ }
  }

  /* ============================== cena 3D ============================== */
  function montarCena() {
    const el = $('#vista');
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    let tom = null;
    try { tom = new URLSearchParams(location.search).get('tom'); } catch (e) { /* sem URL */ }
    renderer.toneMapping = THREE[TONS[tom] || TONS.neutro] || THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = renderer.toneMapping === THREE.ACESFilmicToneMapping ? 1.05 : 0.98;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.info.autoReset = false;
    el.appendChild(renderer.domElement);

    rotulos = new CSS2DRenderer();
    rotulos.domElement.className = 'rotulos';
    el.appendChild(rotulos.domElement);

    cena = new THREE.Scene();
    cena.environment = AMB.ambienteEstudio(renderer);
    cena.environmentIntensity = 1;

    camera = new THREE.PerspectiveCamera(30, 1, 5, 20000);
    controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.dampingFactor = 0.09;
    controles.minDistance = 150;
    controles.maxDistance = 4200;
    controles.maxPolarAngle = Math.PI * 0.495;
    controles.addEventListener('change', () => { precisaRender = true; });
    controles.addEventListener('start', () => { tween = null; });

    cena.add(new THREE.HemisphereLight(0xf4f1ec, 0x25282d, 0.3));
    sol = new THREE.DirectionalLight(0xfff3e6, 1.55);
    sol.position.set(-520, 980, 640);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    Object.assign(sol.shadow.camera, { left: -420, right: 420, top: 560, bottom: -160, near: 200, far: 2400 });
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.5;
    sol.target.position.set(0, 200, 0);
    cena.add(sol, sol.target);
    const contra = new THREE.DirectionalLight(0xd6e4ff, 0.5);
    contra.position.set(700, 420, -700);
    cena.add(contra);
    const recorte = new THREE.DirectionalLight(0xffffff, 0.3);
    recorte.position.set(-200, 260, -900);
    cena.add(recorte);

    chao = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.22 }));
    chao.rotation.x = -Math.PI / 2;
    chao.receiveShadow = true;
    cena.add(chao);
    sombraContato = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ alphaMap: texturaSombraContato(), transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000 }));
    sombraContato.rotation.x = -Math.PI / 2;
    sombraContato.position.y = 0.25;
    sombraContato.renderOrder = -2;
    sombraContato.userData.semAO = true;
    cena.add(sombraContato);

    grupoCotas = new THREE.Group();
    grupoVagas = new THREE.Group();
    grupoMedidas = new THREE.Group();
    grupoContatos = new THREE.Group();
    grupoFisica = new THREE.Group();
    cena.add(grupoCotas, grupoVagas, grupoMedidas, grupoContatos, grupoFisica);
    aplicarTema();

    new ResizeObserver(redimensionar).observe(el);
    redimensionar();
    aplicarQualidade();
    ligarPonteiro();
  }

  // sombra suave de contato sob o gabinete (degradê usado como transparência)
  function texturaSombraContato() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, 256, 256);
    g.filter = 'blur(18px)';
    g.fillStyle = '#fff';
    g.fillRect(52, 52, 152, 152);
    g.filter = 'none';
    return new THREE.CanvasTexture(c);
  }

  /* Qualidade: leve / alta / ultra (pós-processamento, sombras, luz do RGB, reflexo no chão). */
  function aplicarQualidade() {
    const Q = AMB.QUALIDADES[E.vis.qualidade] || AMB.QUALIDADES.alta;
    if (composer) { composer.passes.forEach((p) => p.dispose && p.dispose()); composer.dispose && composer.dispose(); }
    composer = null;
    passoAO = null;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pixel));
    if (sol && sol.shadow.mapSize.x !== Q.sombra) {
      sol.shadow.mapSize.set(Q.sombra, Q.sombra);
      if (sol.shadow.map) { sol.shadow.map.dispose(); sol.shadow.map = null; }
    }
    // reflexo no chão
    if (Q.reflexo && !reflexo && D.Reflector) {
      const el = $('#vista');
      reflexo = AMB.criarReflexo(el.clientWidth * 0.6, el.clientHeight * 0.6);
      if (reflexo) {
        reflexo.material.uniforms.forca.value = temaEscuro() ? 0.38 : 0.22;
        const antes = reflexo.onBeforeRender;
        reflexo.onBeforeRender = function (...args) {
          const esconder = [grupoCotas, grupoVagas, grupoMedidas, grupoContatos, grupoFisica, destaque, ...grades].filter((o) => o && o.visible);
          for (const o of esconder) o.visible = false;
          antes.apply(this, args);
          for (const o of esconder) o.visible = true;
        };
        cena.add(reflexo);
      }
    } else if (!Q.reflexo && reflexo) {
      cena.remove(reflexo);
      reflexo.getRenderTarget().dispose();
      reflexo.material.dispose();
      reflexo.geometry.dispose();
      reflexo = null;
    }
    if (atual && atual.rgbFx) { AMB.luzesRGB(atual.rgbFx, Q.luzesRGB); atualizarRGB(); }
    for (const b of $$('[data-qualidade]')) b.setAttribute('aria-pressed', String(b.dataset.qualidade === E.vis.qualidade));
    const rot = $('#qualidade-rotulo');
    if (rot) rot.textContent = Q.rotulo;
    fps.amostras = [];
    fps.lentoDesde = 0;
    redimensionar();
    if (Q.posProcesso && D.EffectComposer && D.RenderPass && D.OutputPass) {
      try {
        const el = $('#vista');
        const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
        const pr = renderer.getPixelRatio();
        const alvo = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
        composer = new D.EffectComposer(renderer, alvo);
        composer.setPixelRatio(pr);
        composer.setSize(w, h);
        composer.addPass(new D.RenderPass(cena, camera));
        let dbg = null;
        try { dbg = new URLSearchParams(location.search); } catch (e) { /* sem URL */ }
        if (D.GTAOPass && Q.ao && !(dbg && dbg.has('semao'))) {
          passoAO = new D.GTAOPass(cena, camera, w, h);
          passoAO.updateGtaoMaterial({ radius: 24, distanceExponent: 1.5, thickness: 9, scale: 1.25, samples: Q.ao, distanceFallOff: 1 });
          if (passoAO.updatePdMaterial) passoAO.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
          passoAO.blendIntensity = 0.95;
          // vidro, telas, setas, partículas, vagas e reflexo não entram na oclusão
          const esconder = passoAO.overrideVisibility.bind(passoAO);
          passoAO.overrideVisibility = function () {
            esconder();
            cena.traverse((o) => {
              if (o.userData.semAO || o.isPoints || o.isLine) { o.visible = false; return; }
              if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.transparent && !o.material.isShadowMaterial) o.visible = false;
            });
          };
          composer.addPass(passoAO);
        }
        if (D.UnrealBloomPass && !(dbg && dbg.has('sembloom'))) composer.addPass(new D.UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.42, 2.2));
        composer.addPass(new D.OutputPass());
      } catch (err) {
        console.warn('Pós-processamento desligado:', err);
        composer = null;
      }
    }
    precisaRender = true;
  }

  function temaEscuro() {
    const c = new THREE.Color(token('--palco'));
    return c.r + c.g + c.b < 1.2;
  }

  function aplicarTema() {
    if (!cena) return;
    const base = new THREE.Color(token('--palco'));
    const escuro = temaEscuro();
    cena.environment = AMB.ambienteEstudio(renderer, !escuro);
    cena.environmentIntensity = escuro ? 1 : 0.9;
    const centro = base.clone().lerp(new THREE.Color(escuro ? '#3a3f47' : '#ffffff'), escuro ? 0.32 : 0.55);
    const borda = base.clone().lerp(new THREE.Color('#000000'), escuro ? 0.35 : 0.08);
    cena.background = AMB.fundo('#' + centro.getHexString(), '#' + borda.getHexString());
    cena.fog = new THREE.Fog(base.clone().lerp(borda, 0.5), 2600, 7000);
    for (const g of grades) { cena.remove(g); g.geometry.dispose(); g.material.dispose(); }
    const fina = new THREE.GridHelper(4000, 200, token('--grade'), token('--grade'));
    const grossa = new THREE.GridHelper(4000, 40, token('--grade-forte'), token('--grade-forte'));
    fina.position.y = 0.2;
    grossa.position.y = 0.3;
    for (const g of [fina, grossa]) { g.material.transparent = true; g.material.opacity = escuro ? 0.75 : 0.8; g.userData.semAO = true; }
    grades = [fina, grossa];
    cena.add(fina, grossa);
    for (const g of grades) g.visible = E.vis.grade !== false;
    chao.material.opacity = escuro ? 0.42 : 0.2;
    sombraContato.material.opacity = escuro ? 0.75 : 0.42;
    if (reflexo) reflexo.material.uniforms.forca.value = escuro ? 0.38 : 0.22;
    if (atual) { desenharCotas(); desenharVagas(); }
    if (destaque) destaque.material.color.set(token('--acento'));
    precisaRender = true;
  }

  function redimensionar() {
    const el = $('#vista');
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    renderer.setSize(w, h, false);
    if (composer) composer.setSize(w, h);
    if (reflexo) reflexo.getRenderTarget().setSize(Math.max(256, Math.round(w * 0.6)), Math.max(256, Math.round(h * 0.6)));
    rotulos.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    precisaRender = true;
  }

  function reconstruir() {
    if (fis.ativo) encerrarFisica();
    if (atual) {
      cena.remove(atual.raiz);
      MONT.descartar(atual.raiz);
      if (atual.sim) { cena.remove(atual.sim.objeto); atual.sim.descartar(); }
    }
    try {
      atual = MONT.montar(E.build, CAT, { rgb: E.vis.rgb, fotos: fotosProntas(MONT.resolver(E.build, CAT)) });
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
      luzInterna = new THREE.PointLight(0xffffff, 0.7, 950, 0);
      cena.add(luzInterna);
    }
    luzInterna.position.set(-atual.Q.W * 0.15, atual.Q.H * 0.6, atual.Q.D * 0.05);
    sombraContato.scale.set(atual.Q.W * 1.55, atual.Q.D * 1.4, 1);
    // RGB que ilumina as peças em volta
    atual.rgbFx = AMB.coletarRGB(atual.raiz);
    AMB.luzesRGB(atual.rgbFx, (AMB.QUALIDADES[E.vis.qualidade] || AMB.QUALIDADES.alta).luzesRGB);
    atualizarRGB();
    rotores = [];
    atual.raiz.traverse((o) => { if (o.userData.rotor) rotores.push(o.userData.rotor); });
    checagem = VER.verificar(atual, E.build);
    desenharContatos();
    if (E.vis.ar) criarSimulacao();
    desenharVagas();
    aplicarVisibilidade();
    aplicarExplosao(true);
    desenharCotas();
    if (E.sel && !atual.partes.some((p) => p.id === E.sel && p.obj)) E.sel = null;
    atualizarDestaque();
    renderStatus();
    precisaRender = true;
  }

  function criarSimulacao() {
    if (!atual || !SIM) return;
    if (atual.sim) { cena.remove(atual.sim.objeto); atual.sim.descartar(); atual.sim = null; }
    atual.sim = SIM.criar(atual, E.build, { quantidade: E.vis.qualidade === 'leve' ? 650 : 1400 });
    cena.add(atual.sim.objeto);
    mostrarEstatAr();
  }

  function agendarReconstrucao() {
    if (reconstruirPendente) return;
    reconstruirPendente = true;
    requestAnimationFrame(() => {
      reconstruirPendente = false;
      reconstruir();
    });
  }

  function vagasVisiveis() { return !!(E.vis.vagas || E.aba === 'fans') && !fis.ativo; }

  function aplicarVisibilidade() {
    if (!atual) return;
    for (const p of atual.paineis) p.obj.visible = E.vis.paineis && (p.tipo !== 'vidro' || E.vis.vidro);
    const ligada = (id) => (id === 'riser' || id === 'conectorRiser' ? !E.ocultas.has('gpu') : true);
    const soCaso = (id) => !E.vis.soGabinete || id === 'caixaFonte';
    for (const p of atual.partes) if (p.obj && p.id !== 'gabinete') p.obj.visible = !E.ocultas.has(p.id) && ligada(p.id) && soCaso(p.id);
    const mt = $('#mostrar-tudo');
    if (mt) mt.hidden = !E.ocultas.size;
    atual.raiz.traverse((o) => { if (o.userData.fluxo) o.visible = E.vis.fluxo; });
    grupoCotas.visible = E.vis.cotas;
    grupoVagas.visible = vagasVisiveis();
    for (const g of grades) g.visible = E.vis.grade !== false;
    if (E.vis.ar && !atual.sim) criarSimulacao();
    if (atual.sim) atual.sim.objeto.visible = E.vis.ar && !fis.ativo;
    grupoContatos.visible = !!E.vis.contatos && !fis.ativo;
    if (fis.ativo && fis.sim) { fis.sim.definirParedes(paineisAbertos()); fis.sim.reaplicarOcultos(); }
    $('#legenda-fluxo').hidden = !E.vis.fluxo || E.vis.ar;
    $('#legenda-ar').hidden = !E.vis.ar;
    for (const b of $$('input[data-vis]')) b.checked = !!E.vis[b.dataset.vis];
    precisaRender = true;
  }

  function aplicarExplosao(imediato) {
    if (!atual) return;
    if (imediato) explodirAtual = explodirAlvo;
    for (const p of atual.paineis) p.obj.position.copy(p.dir).multiplyScalar(explodirAtual * 230);
    if (fis.ativo && fis.sim) fis.sim.definirParedes(paineisAbertos());
  }

  /* ---------- RGB ---------- */
  function atualizarRGB() {
    const b = $('#menu-rgb .bolinha-rgb');
    if (b) {
      b.style.setProperty('--rgb', E.vis.rgb);
      b.classList.toggle('arco-iris', E.vis.rgbModo === 'arco-iris');
      b.classList.toggle('desligado', E.vis.rgbModo === 'desligado');
    }
    for (const x of $$('[data-rgb-modo]')) x.setAttribute('aria-pressed', String(x.dataset.rgbModo === E.vis.rgbModo));
    const cor = $('#cor-rgb');
    if (cor && cor.value !== E.vis.rgb) cor.value = E.vis.rgb;
    if (!atual || !atual.rgbFx) return;
    AMB.atualizarRGB(atual.rgbFx, E.vis.rgbModo, E.vis.rgb, relogio, E.vis.qualidade === 'ultra' ? 1.15 : 1);
    precisaRender = true;
  }

  /* ---------- cotas (linhas de dimensão) ---------- */
  function limparGrupo(g) {
    for (const c of g.children.slice()) {
      g.remove(c);
      c.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !o.material.userData.compartilhado) o.material.dispose();
        if (o.element && o.element.remove) o.element.remove();
      });
    }
  }
  function desenharCotas() {
    limparGrupo(grupoCotas);
    if (!atual) return;
    const { W, H, D } = atual.Q;
    const V = THREE.Vector3;
    const o = 46;
    const pts = [];
    const tique = (p, u) => { const t = 7; pts.push(p.clone().addScaledVector(u, -t), p.clone().addScaledVector(u, t)); };
    const la = new V(-W / 2, 0.5, D / 2 + o), lb = new V(W / 2, 0.5, D / 2 + o);
    pts.push(la, lb, new V(-W / 2, 0.5, D / 2 + 6), new V(-W / 2, 0.5, D / 2 + o + 10), new V(W / 2, 0.5, D / 2 + 6), new V(W / 2, 0.5, D / 2 + o + 10));
    tique(la, new V(1, 0, 1).normalize()); tique(lb, new V(1, 0, 1).normalize());
    const pa = new V(-W / 2 - o, 0.5, -D / 2), pb = new V(-W / 2 - o, 0.5, D / 2);
    pts.push(pa, pb, new V(-W / 2 - 6, 0.5, -D / 2), new V(-W / 2 - o - 10, 0.5, -D / 2), new V(-W / 2 - 6, 0.5, D / 2), new V(-W / 2 - o - 10, 0.5, D / 2));
    tique(pa, new V(1, 0, 1).normalize()); tique(pb, new V(1, 0, 1).normalize());
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

  /* ---------- vagas livres para fans (clique para pôr um fan) ---------- */
  let texVaga = null;
  function texturaVaga() {
    if (texVaga) return texVaga;
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.strokeStyle = '#ffffff';
    g.lineWidth = 7;
    g.setLineDash([18, 12]);
    const r = 34, x = 10, y = 10, w = 236, h = 236;
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath(); g.stroke();
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,0.7)';
    g.beginPath(); g.arc(128, 128, 104, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ffffff';
    g.fillRect(118, 78, 20, 100); g.fillRect(78, 118, 100, 20);
    texVaga = new THREE.CanvasTexture(c);
    texVaga.colorSpace = THREE.SRGBColorSpace;
    return texVaga;
  }
  function desenharVagas() {
    limparGrupo(grupoVagas);
    if (!atual || !atual.vagas) return;
    const tex = texturaVaga();
    for (const v of atual.vagas) {
      if (v.ocupada) continue;
      const cor = v.conflito ? '#ff5a4d' : token('--acento');
      const geo = new THREE.PlaneGeometry(v.tamanho * 0.94, v.tamanho * 0.94);
      // nítida onde está à vista; fraca (raio-x) quando há peça na frente
      const nitida = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: cor, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      const fraca = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: cor, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      for (const m of [nitida, fraca]) {
        m.quaternion.copy(v.quaternion);
        m.position.copy(v.posicao).addScaledVector(v.k, 12.5);
        m.userData.vaga = v;
        m.userData.semAO = true;
        grupoVagas.add(m);
      }
      nitida.renderOrder = 27;
      fraca.renderOrder = 26;
    }
    grupoVagas.visible = vagasVisiveis();
  }
  function fanPadraoPara(tamanho, zid) {
    const zf = E.build.fans[zid];
    const daZona = zf && (zf.vagas || []).find((f) => f && CAT.fans[f] && CAT.fans[f].tamanho === tamanho);
    if (daZona) return daZona;
    for (const z of Object.values(E.build.fans || {})) for (const f of (z && z.vagas) || []) if (f && CAT.fans[f] && CAT.fans[f].tamanho === tamanho) return f;
    const lista = Object.entries(CAT.fans).filter(([, f]) => f.tamanho === tamanho);
    return lista.length ? lista[0][0] : null;
  }
  function porFanNaVaga(v, fid) {
    fid = fid || fanPadraoPara(v.tamanho, v.zona);
    if (!fid) { toast('Não há fan de ' + v.tamanho + ' mm no catálogo.', { tipo: 'aviso' }); return; }
    mudar('Fan colocado em ' + v.nomeZona + ' ' + (v.i + 1), () => {
      const cfg = clonar(zonaCfg(v.zona, atual.G.montagens[v.zona]));
      cfg.tamanho = v.tamanho;
      cfg.vagas = (cfg.vagas || []).slice();
      cfg.vagas[v.i] = fid;
      E.build.fans[v.zona] = cfg;
    });
    if (v.conflito) toast('Atenção: esse fan encosta em ' + curto(v.conflito) + '.', { tipo: 'aviso' });
    selecionar('fan:' + v.zona + ':' + v.i);
  }

  /* ---------- seleção ---------- */
  function atualizarDestaque() {
    if (destaque) { cena.remove(destaque); destaque.geometry.dispose(); destaque.material.dispose(); destaque = null; }
    const p = atual && E.sel && atual.partes.find((x) => x.id === E.sel);
    if (!p) { renderFicha(); marcarNaLista(); precisaRender = true; return; }
    const caixa = new THREE.Box3();
    if (p.id === 'gabinete') caixa.set(new THREE.Vector3(-atual.Q.W / 2, 0, -atual.Q.D / 2), new THREE.Vector3(atual.Q.W / 2, atual.Q.H, atual.Q.D / 2));
    else for (const c of p.caixas) caixa.union(c);
    if (caixa.isEmpty() && p.obj) caixa.setFromObject(p.obj);
    caixa.expandByScalar(1.5);
    destaque = new THREE.Box3Helper(caixa, token('--acento'));
    destaque.material.depthTest = false;
    destaque.material.transparent = true;
    destaque.renderOrder = 30;
    cena.add(destaque);
    renderFicha();
    marcarNaLista();
    precisaRender = true;
  }

  function selecionar(id) {
    E.sel = id || null;
    const sec = secaoDaParte(E.sel);
    if (sec && sec !== 'fans' && !E.abertas.has(sec)) {
      E.abertas.add(sec);
      if (E.aba === 'pecas') renderAba();
    }
    atualizarDestaque();
  }

  function visivel(o) {
    while (o) { if (!o.visible) return false; o = o.parent; }
    return true;
  }

  let raycaster = null;
  function raioNoPonto(x, y) {
    const r = renderer.domElement.getBoundingClientRect();
    const ponto = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    if (!raycaster) raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ponto, camera);
    return raycaster;
  }
  function deFluxo(o) {
    while (o) { if (o.userData.fluxo) return true; o = o.parent; }
    return false;
  }
  function acertos(ray) {
    return ray.intersectObject(atual.raiz, true).filter((h) => visivel(h.object) && h.object.userData.parteId && !deFluxo(h.object));
  }
  const tipoMat = (h) => h.object.material && h.object.material.userData && h.object.material.userData.tipo;
  function parteNoPonto(x, y) {
    if (!atual) return null;
    const hits = acertos(raioNoPonto(x, y));
    const alvo = hits.find((h) => tipoMat(h) !== 'vidro' && tipoMat(h) !== 'tela') || hits[0];
    return alvo ? alvo.object.userData.parteId : null;
  }
  function vagaNoPonto(x, y) {
    if (!atual || !grupoVagas.visible || !grupoVagas.children.length) return null;
    const h = raioNoPonto(x, y).intersectObjects(grupoVagas.children, false)[0];
    return h ? h.object.userData.vaga : null;
  }
  function pontoNoPonto(x, y) {
    if (!atual) return null;
    const h = acertos(raioNoPonto(x, y)).find((a) => tipoMat(a) !== 'vidro');
    return h ? h.point.clone() : null;
  }

  function ligarPonteiro() {
    const cv = renderer.domElement;
    const tip = $('#tooltip');
    let inicio = null;
    let ultimo = 0;
    // modo física: arrastar uma peça (fase de captura, antes da câmera orbital)
    const vistaEl = $('#vista');
    vistaEl.addEventListener('pointerdown', (e) => {
      if (!fis.ativo || !fis.sim || !atual || e.button !== 0) return;
      const h = acertos(raioNoPonto(e.clientX, e.clientY)).find((a) => tipoMat(a) !== 'vidro' && tipoMat(a) !== 'tela');
      if (!h || !fis.sim.pode(h.object.userData.parteId)) return;
      e.stopPropagation();
      e.preventDefault();
      controles.enabled = false;
      tween = null;
      tip.hidden = true;
      const n = camera.getWorldDirection(new THREE.Vector3()).negate();
      fis.plano = new THREE.Plane().setFromNormalAndCoplanarPoint(n, h.point);
      fis.alvo = h.point.clone();
      fis.sim.pegar(h.object.userData.parteId, h.point);
      fis.ponteiro = e.pointerId;
      try { vistaEl.setPointerCapture(e.pointerId); } catch (err) { /* sem captura */ }
      cv.style.cursor = 'grabbing';
      precisaRender = true;
    }, true);
    vistaEl.addEventListener('pointermove', (e) => {
      if (fis.ponteiro == null || e.pointerId !== fis.ponteiro) return;
      e.stopPropagation();
      const p = raioNoPonto(e.clientX, e.clientY).ray.intersectPlane(fis.plano, new THREE.Vector3());
      if (!p) return;
      p.y = Math.max(p.y, 4);
      fis.alvo.copy(p);
      fis.sim.mover(p);
      precisaRender = true;
    }, true);
    const fimArrasto = (e) => {
      if (fis.ponteiro == null || e.pointerId !== fis.ponteiro) return;
      e.stopPropagation();
      fis.ponteiro = null;
      fis.alvo = null;
      if (fis.sim) fis.sim.largar();
      controles.enabled = true;
      cv.style.cursor = '';
      try { vistaEl.releasePointerCapture(e.pointerId); } catch (err) { /* já solto */ }
      precisaRender = true;
    };
    vistaEl.addEventListener('pointerup', fimArrasto, true);
    vistaEl.addEventListener('pointercancel', fimArrasto, true);
    cv.addEventListener('pointerdown', (e) => { inicio = { x: e.clientX, y: e.clientY }; tip.hidden = true; fecharMenus(); });
    cv.addEventListener('pointerup', (e) => {
      if (!inicio) return;
      const moveu = Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 5;
      inicio = null;
      if (moveu || e.button !== 0) return;
      if (E.medir.ativo) { cliqueMedir(e.clientX, e.clientY, e.shiftKey); return; }
      if (fis.ativo) return;
      const v = vagaNoPonto(e.clientX, e.clientY);
      if (v) { porFanNaVaga(v); return; }
      selecionar(parteNoPonto(e.clientX, e.clientY));
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || e.buttons) return;
      const agora = performance.now();
      if (agora - ultimo < 60) return;
      ultimo = agora;
      const r = $('#palco').getBoundingClientRect();
      const mostrar = (t) => {
        tip.textContent = t;
        tip.style.left = (e.clientX - r.left) + 'px';
        tip.style.top = (e.clientY - r.top) + 'px';
        tip.hidden = false;
      };
      if (E.medir.ativo) { cv.style.cursor = 'crosshair'; tip.hidden = true; return; }
      const v = vagaNoPonto(e.clientX, e.clientY);
      if (v) {
        mostrar(v.conflito ? v.nomeZona + ' ' + (v.i + 1) + ': encosta em ' + curto(v.conflito) : v.nomeZona + ' ' + (v.i + 1) + ' — clique para pôr um fan de ' + v.tamanho + ' mm');
        cv.style.cursor = 'copy';
        return;
      }
      const id = parteNoPonto(e.clientX, e.clientY);
      if (fis.ativo && fis.sim) {
        if (id && fis.sim.pode(id)) { mostrar('Arraste para soltar: ' + curto(fis.sim.nomeDe(id).split(' — ')[0]) + ' · ' + pesoTxt(fis.sim.massaDe(id))); cv.style.cursor = 'grab'; } else { tip.hidden = true; cv.style.cursor = ''; }
        return;
      }
      const p = id && atual.partes.find((x) => x.id === id);
      if (!p) { tip.hidden = true; cv.style.cursor = ''; return; }
      mostrar(p.nome);
      cv.style.cursor = 'pointer';
    });
    cv.addEventListener('pointerleave', () => { tip.hidden = true; });
  }

  /* ---------- régua: distância entre dois pontos ---------- */
  function modoMedir(ligar) {
    if (ligar && fis.ativo) encerrarFisica();
    E.medir.ativo = ligar;
    E.medir.a = null;
    removerMarcadorA();
    $('#medir').setAttribute('aria-pressed', String(ligar));
    $('#barra-medir').hidden = !ligar;
    $('#dica').hidden = ligar;
    renderer.domElement.style.cursor = ligar ? 'crosshair' : '';
    textoMedir(ligar ? (E.medir.lista.length ? 'Clique no primeiro ponto' : 'Clique no primeiro ponto (Shift trava num eixo)') : '');
    if (ligar) selecionar(null);
    precisaRender = true;
  }
  function textoMedir(t) { const el = $('#medir-texto'); if (el) el.textContent = t; }
  const MAT_MEDIDA = { linha: null, ponto: null };
  function matsMedida() {
    if (!MAT_MEDIDA.linha) {
      MAT_MEDIDA.linha = new THREE.LineBasicMaterial({ color: 0xf5c332, depthTest: false, transparent: true, toneMapped: false });
      MAT_MEDIDA.ponto = new THREE.MeshBasicMaterial({ color: 0xf5c332, depthTest: false, transparent: true, toneMapped: false });
      MAT_MEDIDA.linha.userData.compartilhado = MAT_MEDIDA.ponto.userData.compartilhado = true;
    }
    return MAT_MEDIDA;
  }
  let marcadorA = null;
  function removerMarcadorA() {
    if (marcadorA) { grupoMedidas.remove(marcadorA); marcadorA.geometry.dispose(); marcadorA = null; }
  }
  function esfera(p) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), matsMedida().ponto);
    m.position.copy(p);
    m.renderOrder = 40;
    m.userData.semAO = true;
    return m;
  }
  function cliqueMedir(x, y, travar) {
    let p = pontoNoPonto(x, y);
    if (!p) { textoMedir('Clique em cima de uma peça.'); return; }
    if (!E.medir.a) {
      E.medir.a = p;
      marcadorA = esfera(p);
      grupoMedidas.add(marcadorA);
      textoMedir('Agora clique no segundo ponto');
      precisaRender = true;
      return;
    }
    const a = E.medir.a;
    if (travar) {
      const d = p.clone().sub(a);
      const ax = ['x', 'y', 'z'].reduce((m, k) => (Math.abs(d[k]) > Math.abs(d[m]) ? k : m), 'x');
      p = a.clone();
      p[ax] += d[ax];
    }
    removerMarcadorA();
    const g = new THREE.Group();
    const linha = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, p]), matsMedida().linha);
    linha.renderOrder = 40;
    g.add(linha, esfera(a), esfera(p));
    const d = p.clone().sub(a);
    const el = document.createElement('div');
    el.className = 'rotulo-medida';
    el.innerHTML = esc(fmt(d.length(), 1)) + ' mm<small>Δx ' + fmt(Math.abs(d.x), 0) + ' · Δy ' + fmt(Math.abs(d.y), 0) + ' · Δz ' + fmt(Math.abs(d.z), 0) + '</small>';
    const rot = new CSS2DObject(el);
    rot.position.copy(a).lerp(p, 0.5);
    g.add(rot);
    grupoMedidas.add(g);
    E.medir.lista.push(g);
    while (E.medir.lista.length > 8) { const v = E.medir.lista.shift(); grupoMedidas.remove(v); limparGrupo(v); }
    E.medir.a = null;
    textoMedir(fmt(d.length(), 1) + ' mm — clique para medir outra distância');
    precisaRender = true;
  }
  function limparMedidas() {
    removerMarcadorA();
    E.medir.a = null;
    for (const g of E.medir.lista) { grupoMedidas.remove(g); limparGrupo(g); }
    E.medir.lista = [];
    textoMedir('Clique no primeiro ponto (Shift trava num eixo)');
    precisaRender = true;
  }


  /* ---------- pontos de contato: onde as peças não cabem ---------- */
  const MAT_CONTATO = {};
  function matsContato() {
    if (!MAT_CONTATO.vol) {
      MAT_CONTATO.vol = new THREE.MeshBasicMaterial({ color: 0xff2d3a, transparent: true, opacity: 0.34, depthTest: false, depthWrite: false, toneMapped: false });
      MAT_CONTATO.aresta = new THREE.LineBasicMaterial({ color: 0xff5a63, transparent: true, depthTest: false, toneMapped: false });
      MAT_CONTATO.ponto = new THREE.MeshBasicMaterial({ color: 0xff2d3a, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      MAT_CONTATO.folga = new THREE.MeshBasicMaterial({ color: 0xffc233, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false, toneMapped: false });
      MAT_CONTATO.arestaFolga = new THREE.LineBasicMaterial({ color: 0xffd25e, transparent: true, depthTest: false, toneMapped: false });
      MAT_CONTATO.cg = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
      MAT_CONTATO.linha = new THREE.LineBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, depthTest: false, toneMapped: false });
      for (const m of Object.values(MAT_CONTATO)) m.userData.compartilhado = true;
    }
    return MAT_CONTATO;
  }
  // volume vermelho (com arestas) em cada região onde duas peças ocupam o mesmo espaço
  function desenharContatos() {
    limparGrupo(grupoContatos);
    const lista = (checagem && checagem.contatos) || [];
    const m = matsContato();
    for (const c of lista.slice(0, 16)) {
      const b = c.caixa.clone();
      const tam = b.getSize(new THREE.Vector3());
      const centro = b.getCenter(new THREE.Vector3());
      // regiões finíssimas ganham espessura mínima para aparecer
      const geo = new THREE.BoxGeometry(Math.max(tam.x, 2.5), Math.max(tam.y, 2.5), Math.max(tam.z, 2.5));
      const folga = c.tipo === 'folga';
      const vol = new THREE.Mesh(geo, folga ? m.folga : m.vol);
      vol.position.copy(centro);
      vol.renderOrder = 35;
      vol.userData.semAO = true;
      const ar = new THREE.LineSegments(new THREE.EdgesGeometry(geo), folga ? m.arestaFolga : m.aresta);
      ar.position.copy(centro);
      ar.renderOrder = 36;
      const el = document.createElement('div');
      el.className = 'rotulo-contato' + (c.tipo === 'fora' ? ' fora' : folga ? ' folga' : '');
      el.innerHTML = (folga ? 'Folga ' : c.tipo === 'fora' ? 'Sai ' : 'Invade ') + esc(fmt(c.pen, 1)) + ' mm<small>' + esc(c.rotulo) + '</small>';
      const rot = new CSS2DObject(el);
      rot.position.copy(centro).add(new THREE.Vector3(0, Math.max(tam.y, 2.5) / 2 + 8, 0));
      grupoContatos.add(vol, ar, rot);
    }
    grupoContatos.visible = !!E.vis.contatos && !fis.ativo;
    precisaRender = true;
  }

  /* ---------- modo física ---------- */
  function paineisAbertos() {
    if (!E.vis.paineis || explodirAlvo > 0.3) return ['esquerdo', 'direito', 'topo', 'frente', 'traseira'];
    return E.vis.vidro ? [] : ['esquerdo'];
  }
  async function modoFisica(ligar) {
    if (!atual || fis.carregando || ligar === fis.ativo) return;
    if (!ligar) { encerrarFisica(); return; }
    if (!FIS) {
      if (!window.PCBFisica) return;
      fis.carregando = true;
      $('#fisica').setAttribute('aria-busy', 'true');
      try {
        const CANNON = await import('cannon-es');
        FIS = window.PCBFisica(THREE, CANNON);
      } catch (err) {
        console.warn('Sem física:', err);
        toast('Não consegui carregar o motor de física (cannon-es). Confira a conexão com a internet.', { tipo: 'aviso' });
      }
      fis.carregando = false;
      $('#fisica').removeAttribute('aria-busy');
      if (!FIS || !atual) return;
    }
    if (E.medir.ativo) modoMedir(false);
    selecionar(null);
    try {
      fis.sim = FIS.criar(atual, { paineisAbertos: paineisAbertos() });
    } catch (err) {
      console.error(err);
      toast('A física não conseguiu montar os corpos: ' + err.message, { tipo: 'aviso' });
      fis.sim = null;
      return;
    }
    fis.ativo = true;
    prepararVisuaisFisica();
    $('#fisica').setAttribute('aria-pressed', 'true');
    $('#barra-fisica').hidden = false;
    $('#dica').hidden = true;
    $('#fisica-inclinar').value = '0';
    $('#fisica-angulo').textContent = '0°';
    aplicarVisibilidade();
    textoFisica();
    precisaRender = true;
  }
  function encerrarFisica() {
    if (!fis.ativo) return;
    if (fis.ponteiro != null) { fis.ponteiro = null; controles.enabled = true; }
    if (fis.sim) fis.sim.descartar();
    fis.sim = null;
    fis.ativo = false;
    limparGrupo(grupoFisica);
    fis.pontos = fis.cg = fis.corda = fis.rotuloMao = null;
    $('#fisica').setAttribute('aria-pressed', 'false');
    $('#barra-fisica').hidden = true;
    $('#dica').hidden = E.medir.ativo;
    aplicarVisibilidade();
    precisaRender = true;
  }
  function prepararVisuaisFisica() {
    limparGrupo(grupoFisica);
    const m = matsContato();
    fis.pontos = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), m.ponto, 200);
    fis.pontos.count = 0;
    fis.pontos.frustumCulled = false;
    fis.pontos.renderOrder = 45;
    fis.pontos.userData.semAO = true;
    // centro de massa: bolinha amarela com um fio até o chão
    const cg = new THREE.Group();
    const bola = new THREE.Mesh(new THREE.SphereGeometry(5.5, 20, 14), m.cg);
    bola.renderOrder = 46;
    const fio = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]), m.linha);
    fio.renderOrder = 46;
    const alvoChao = new THREE.Mesh(new THREE.RingGeometry(6, 9, 28), m.cg);
    alvoChao.rotation.x = -Math.PI / 2;
    alvoChao.renderOrder = 46;
    const el = document.createElement('div');
    el.className = 'rotulo-cg';
    el.textContent = 'Centro de massa';
    const rot = new CSS2DObject(el);
    rot.position.set(0, 16, 0);
    cg.add(bola, fio, alvoChao, rot);
    cg.userData = { fio, alvoChao, el };
    fis.cg = cg;
    fis.corda = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), m.linha);
    fis.corda.renderOrder = 46;
    fis.corda.visible = false;
    // etiqueta da peça que está na mão (nome, peso e velocidade)
    const elM = document.createElement('div');
    elM.className = 'rotulo-cg';
    fis.rotuloMao = new CSS2DObject(elM);
    fis.rotuloMao.visible = false;
    grupoFisica.add(fis.pontos, cg, fis.corda, fis.rotuloMao);
    atualizarVisuaisFisica();
  }
  function atualizarVisuaisFisica() {
    const s = fis.sim;
    if (!s || !fis.pontos) return;
    const mtx = new THREE.Matrix4();
    let n = 0;
    // batidas: bolha que cresce com a velocidade do impacto e some em ~0,7 s
    for (const b of s.batidas) {
      if (n >= 200) break;
      const r = (3 + Math.min(12, b.v * 14)) * (1 - b.idade / 0.8);
      mtx.makeScale(r, r, r).setPosition(b.pos);
      fis.pontos.setMatrixAt(n++, mtx);
    }
    // pontos de contato que estão encostando agora
    for (const c of s.contatos) {
      if (n >= 200) break;
      mtx.makeScale(2.4, 2.4, 2.4).setPosition(c.pos);
      fis.pontos.setMatrixAt(n++, mtx);
    }
    fis.pontos.count = n;
    fis.pontos.instanceMatrix.needsUpdate = true;
    const e = s.estado();
    const u = fis.cg.userData;
    fis.cg.position.copy(e.cg);
    u.fio.scale.y = Math.max(1, e.cg.y);
    u.alvoChao.position.y = -e.cg.y + 0.8;
    u.el.classList.toggle('perigo', tombaria(e));
    const pa = s.pontoArrasto();
    const mao = s.arrastado();
    fis.rotuloMao.visible = !!(pa && mao);
    if (fis.rotuloMao.visible) {
      fis.rotuloMao.position.copy(pa).add(new THREE.Vector3(0, 18, 0));
      fis.rotuloMao.element.textContent = curto(mao.nome.split(' — ')[0]) + ' · ' + pesoTxt(mao.gramas) + ' · ' + fmt(mao.velocidade, 2) + ' m/s';
    }
    fis.corda.visible = !!(pa && fis.alvo);
    if (fis.corda.visible) {
      const pos = fis.corda.geometry.attributes.position;
      pos.setXYZ(0, pa.x, pa.y, pa.z);
      pos.setXYZ(1, fis.alvo.x, fis.alvo.y, fis.alvo.z);
      pos.needsUpdate = true;
      fis.corda.geometry.computeBoundingSphere();
    }
  }
  const pesoTxt = (g) => (g >= 1000 ? fmt(g / 1000, 2) + ' kg' : fmt(g, 0) + ' g');
  // com o gabinete inclinado, tomba se o centro de massa passar da borda de apoio
  function tombaria(e) {
    const ap = atual && atual.massas && atual.massas.apoio;
    if (!ap || Math.abs(e.angulo) < 0.5) return false;
    return e.angulo > 0 ? e.cg.x < ap.x0 : e.cg.x > ap.x1;
  }
  function anguloTombar(lado) {
    const l = atual && atual.massas && (atual.massas.lados || []).find((x) => x.lado === lado);
    return l ? l.graus : null;
  }
  function textoFisica() {
    const el = $('#fisica-texto');
    if (!el || !fis.sim) return;
    const e = fis.sim.estado();
    const partes = [];
    if (!e.soltos) partes.push('<strong>Arraste uma peça</strong> para tirá-la do lugar (ela bate nas outras e no gabinete), ou use <strong>Soltar tudo</strong>');
    else partes.push('<strong>' + e.soltos + ' de ' + e.pecas + '</strong> peças soltas' + (e.parados === e.soltos ? ', já paradas' : ''));
    if (e.contatos) partes.push(e.contatos + ' ponto' + (e.contatos > 1 ? 's' : '') + ' de contato (em vermelho)');
    const nc = (n) => esc(curto(String(n).split(' — ')[0]));
    // v = √(2·g·h) → a batida equivale a uma queda livre de h = v² / 2g
    if (e.maiorImpacto) partes.push('batida mais forte: ' + fmt(e.maiorImpacto.impacto, 2) + ' m/s, como cair de ' + fmt(e.maiorImpacto.impacto * e.maiorImpacto.impacto / (2 * 9.81) * 100, 0) + ' cm (' + nc(e.maiorImpacto.a) + ' × ' + nc(e.maiorImpacto.b) + ')');
    if (Math.abs(e.angulo) >= 0.5) {
      const lado = e.angulo > 0 ? 'o lado do vidro' : 'a lateral direita';
      const lim = anguloTombar(lado);
      partes.push('inclinado ' + fmt(Math.abs(e.angulo), 0) + '° para ' + lado + (lim != null ? ' (montado, tomba a partir de ~' + fmt(lim, 0) + '°)' : ''));
      if (tombaria(e)) partes.push('<span class="perigo">nessa inclinação o PC tombaria: o centro de massa passou da borda dos pés</span>');
    }
    el.innerHTML = partes.join(' · ') + '.';
  }

  /* ---------- câmera ---------- */
  const VISTAS = {
    iso: [-0.95, 0.62, 1.05], vidro: [-1, 0.12, 0.02], frente: [0.02, 0.14, 1],
    traseira: [0.02, 0.14, -1], topo: [0.001, 1, 0.02]
  };
  function irVista(nome, instantaneo) {
    if (!atual || (!VISTAS[nome] && !Array.isArray(nome))) return;
    const { W, H, D } = atual.Q;
    const alvo = new THREE.Vector3(0, H * 0.46, 0);
    const raioCena = Math.sqrt(W * W + H * H + D * D) / 2;
    const meio = THREE.MathUtils.degToRad(camera.fov / 2);
    let dist = (raioCena / Math.sin(meio)) * 1.08;
    if (camera.aspect < 1) dist /= Math.max(0.55, camera.aspect);
    const dir = new THREE.Vector3(...(Array.isArray(nome) ? nome : VISTAS[nome])).normalize();
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

  /* Aproxima a câmera de uma peça, pelo lado do vidro. */
  function enquadrar(id) {
    const p = atual && atual.partes.find((x) => x.id === id);
    if (!p) return;
    if (p.id === 'gabinete') { irVista('iso'); return; }
    if ((p.id === 'fonte' || p.id === 'cabos') && !E.ocultas.has('caixaFonte')) { E.ocultas.add('caixaFonte'); aplicarVisibilidade(); }
    const caixa = new THREE.Box3();
    for (const c of p.caixas) caixa.union(c);
    if (caixa.isEmpty() && p.obj) caixa.setFromObject(p.obj);
    if (caixa.isEmpty()) return;
    const centro = caixa.getCenter(new THREE.Vector3());
    const tam = caixa.getSize(new THREE.Vector3()).length();
    const PREF = { placaMae: [-1, 0.14, 0.18], gpu: [-0.86, 0.3, 0.4], radiador: [-0.7, -0.45, 0.55], fonte: [-0.75, 0.3, 0.6], cabos: [-0.85, 0.25, 0.45] };
    const dir = camera.position.clone().sub(controles.target).normalize();
    if (p.id.startsWith('memoria-')) dir.set(-0.72, 0.28, 0.62);
    else if (PREF[p.id]) dir.set(...PREF[p.id]);
    else if (dir.x > -0.25) dir.set(-0.82, 0.36, 0.45);
    dir.normalize();
    const dist = Math.max(200, (tam * 0.62) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    tween = { t0: performance.now(), dur: 700, p0: camera.position.clone(), p1: centro.clone().addScaledVector(dir, dist), a0: controles.target.clone(), a1: centro };
    for (const b of $$('[data-vista]')) b.setAttribute('aria-pressed', 'false');
  }

  /* ---------- laço de renderização ---------- */
  let ultimoQuadro = performance.now();
  const fps = { amostras: [], ultimoTexto: 0, sugeriu: false, lentoDesde: 0 };
  let ultimaEstat = 0;
  function animar(agora) {
    requestAnimationFrame(animar);
    const dtReal = (agora - ultimoQuadro) / 1000;
    const dt = Math.min(0.05, Math.max(0, dtReal));
    ultimoQuadro = agora;
    relogio += dt;
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
    if (atual && atual.rgbFx && (E.vis.rgbModo === 'arco-iris' || E.vis.rgbModo === 'respirar')) {
      AMB.atualizarRGB(atual.rgbFx, E.vis.rgbModo, E.vis.rgb, relogio, E.vis.qualidade === 'ultra' ? 1.15 : 1);
      precisaRender = true;
    }
    if (fis.ativo && fis.sim) {
      if (fis.sim.passo(dt)) { precisaRender = true; atualizarVisuaisFisica(); }
      if (agora - fis.ultimoTexto > 250) { fis.ultimoTexto = agora; textoFisica(); }
    }
    if (atual && atual.sim && E.vis.ar && !fis.ativo) {
      atual.sim.atualizar(dt);
      precisaRender = true;
      if (agora - ultimaEstat > 1000) { ultimaEstat = agora; mostrarEstatAr(); }
    }
    controles.update();
    if (precisaRender) {
      precisaRender = false;
      renderer.info.reset();
      if (composer) composer.render(); else renderer.render(cena, camera);
      rotulos.render(cena, camera);
      medirFps(dtReal, agora);
    }
  }

  function mostrarEstatAr() {
    const el = $('#ar-estat');
    if (!el || !atual || !atual.sim) return;
    const s = atual.sim.estatisticas();
    const t = checagem && checagem.termico;
    const partes = [];
    if (s.fracaoGpu != null && s.amostras > 40) partes.push(Math.round(s.fracaoGpu * 100) + '% do ar passa pela placa de vídeo');
    if (s.tempoMedio != null && s.amostras > 40) partes.push('fica ~' + fmt(s.tempoMedio, 1) + ' s lá dentro');
    if (t) partes.push('sai ~' + fmt(t.dT, 1) + ' °C mais quente');
    el.textContent = partes.length ? 'Simulação: ' + partes.join(' · ') + '.' : 'Simulação ilustrativa do caminho do ar.';
  }

  function medirFps(dt, agora) {
    if (!(dt > 0) || dt > 0.5) return;
    fps.amostras.push(dt);
    if (fps.amostras.length > 90) fps.amostras.shift();
    if (agora - fps.ultimoTexto < 1000 || fps.amostras.length < 20) return;
    fps.ultimoTexto = agora;
    const media = fps.amostras.reduce((a, b) => a + b, 0) / fps.amostras.length;
    const q = Math.round(1 / media);
    const el = $('#fps');
    if (el) el.textContent = 'Agora: ~' + q + ' quadros por segundo';
    if (q < 20 && E.vis.qualidade !== 'leve') {
      if (!fps.lentoDesde) fps.lentoDesde = agora;
      if (!fps.sugeriu && agora - fps.lentoDesde > 6000) {
        fps.sugeriu = true;
        toast('O 3D está lento (~' + q + ' quadros/s).', { acao: 'Usar qualidade Leve', aoClicar: () => definirQualidade('leve'), duracao: 10000 });
      }
    } else fps.lentoDesde = 0;
  }

  function definirQualidade(q) {
    if (!AMB.QUALIDADES[q]) return;
    E.vis.qualidade = q;
    salvar();
    aplicarQualidade();
    if (atual && E.vis.ar) criarSimulacao();
  }

  /* ---------- fotos reais das peças (ficam só neste navegador) ---------- */
  const fotosOrig = {};   // chave -> { img, blob, params }
  const recortes = {};    // chave -> { assinatura, canvas, mini }
  const idsFans = () => {
    const s = new Set();
    for (const z of Object.values(E.build.fans || {})) for (const f of (z && z.vagas) || []) if (f && CAT.fans[f]) s.add(f);
    return Array.from(s);
  };
  /* Vagas de foto da montagem atual, com a proporção de cada face. */
  function vagasDeFoto(R) {
    const ids = R.ids, b = E.build;
    const gl = b.gpu.modo !== 'original' ? R.gpu.deshroud : R.gpu;
    const face = Math.max(1, gl.altura - 9);
    const L = [
      { secao: 'placaMae', slot: 'mb-topo', modelo: ids.placaMae, prop: R.placaMae.largura / R.placaMae.altura, produto: R.placaMae },
      { secao: 'memoria', slot: 'memoria-lado', modelo: ids.memoria, prop: R.memoria.comprimento / R.memoria.altura, produto: R.memoria },
      { secao: 'cooler', slot: 'bomba-topo', modelo: ids.cooler, prop: R.cooler.bomba.largura / R.cooler.bomba.profundidade, produto: R.cooler },
      { secao: 'cooler', slot: 'fan-cubo', modelo: ids.coolerFan, prop: 1, produto: R.coolerFan },
      { secao: 'gpu', slot: 'gpu-frente', modelo: ids.gpu, prop: gl.comprimento / face, produto: R.gpu },
      { secao: 'gpu', slot: 'gpu-borda', modelo: ids.gpu, prop: gl.comprimento / gl.espessura, produto: R.gpu },
      { secao: 'gpu', slot: 'gpu-backplate', modelo: ids.gpu, prop: gl.comprimento / face, produto: R.gpu },
      { secao: 'fonte', slot: 'fonte-lado', modelo: ids.fonte, prop: R.fonte.comprimento / R.fonte.altura, produto: R.fonte }
    ];
    if (b.gpu.modo !== 'original') L.push({ secao: 'gpu', slot: 'fan-cubo', modelo: ids.gpuFan, prop: 1, produto: R.gpuFan });
    for (const f of idsFans()) L.push({ secao: 'fans', slot: 'fan-cubo', modelo: f, prop: 1, produto: CAT.fans[f] });
    for (const v of L) v.chave = FOT.chave(v.slot, v.modelo);
    return L;
  }
  function recorte(chave, prop) {
    const o = fotosOrig[chave];
    if (!o) return null;
    const assinatura = prop.toFixed(4) + JSON.stringify(o.params);
    const r = recortes[chave];
    if (r && r.assinatura === assinatura) return r;
    if (r) M.liberarFoto(r.canvas);
    const canvas = FOT.recortar(o.img, o.params, prop, FOT.SLOTS[chave.split('|')[0]] && chave.startsWith('fan-cubo') ? 768 : 1536);
    let mini = null;
    try {
      const c = document.createElement('canvas');
      const k = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
      c.width = Math.max(2, Math.round(canvas.width * k)); c.height = Math.max(2, Math.round(canvas.height * k));
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
      mini = c.toDataURL('image/jpeg', 0.75);
    } catch (e) { /* sem miniatura */ }
    return (recortes[chave] = { assinatura, canvas, mini });
  }
  function fotosProntas(R) {
    const out = {};
    for (const v of vagasDeFoto(R)) {
      if (out[v.chave]) continue;
      const r = recorte(v.chave, v.prop);
      if (r) out[v.chave] = r.canvas;
    }
    return out;
  }
  async function carregarFotos() {
    let n = 0;
    for (const k of await FOT.chaves()) {
      const v = await FOT.ler(k);
      if (!v || !v.blob) continue;
      try { fotosOrig[k] = { img: await FOT.imagem(v.blob), blob: v.blob, params: v.params }; n++; } catch (e) { /* foto ilegível */ }
    }
    if (n) { reconstruir(); renderAba(); }
  }
  function trocarFoto(k, v) {
    if (recortes[k]) { M.liberarFoto(recortes[k].canvas); delete recortes[k]; }
    if (v) fotosOrig[k] = v; else delete fotosOrig[k];
    reconstruir();
    renderAba();
  }
  async function editarFoto(slot, modelo, prop, arq) {
    const S = FOT.SLOTS[slot];
    const k = FOT.chave(slot, modelo);
    let img, blob, params = null;
    if (arq) {
      try { img = await FOT.imagem(arq); } catch (e) { toast(e.message, { tipo: 'erro' }); return; }
      blob = arq;
    } else {
      const o = fotosOrig[k];
      if (!o) return;
      img = o.img; blob = o.blob; params = o.params || FOT.paramsPadrao(img, prop);
    }
    const res = await FOT.editar(img, { titulo: S.rotulo, dica: S.dica, prop, forma: S.forma, params });
    if (!res) return;
    await FOT.gravar(k, blob, res);
    trocarFoto(k, { img, blob, params: res });
    toast(arq ? 'Foto aplicada: ' + S.rotulo.toLowerCase() + '.' : 'Enquadramento atualizado.');
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
      '<input type="range" id="' + id + '" data-bind="' + caminho + '" data-rotulo="' + esc(rotulo) + '" data-un="' + un + '" min="' + min + '" max="' + max + '" step="' + passo + '" value="' + valor + '"></div>';
  }
  function campoSelect(id, caminho, rotulo, html) {
    return '<div class="campo"><label for="' + id + '">' + esc(rotulo) + '</label><select id="' + id + '" data-bind="' + caminho + '">' + html + '</select></div>';
  }
  const campoSeg = (rotulo, html) => '<div class="campo"><span class="rotulo">' + esc(rotulo) + '</span>' + html + '</div>';

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
      ['bomba.largura', 'Bomba: largura', ['bomba.profundidade']], ['bomba.altura', 'Bomba: altura'], ['mangueira', 'Comprimento das mangueiras']
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

  let idFoto = 0;
  function blocoFotos(secao) {
    const R = atual ? atual.R : MONT.resolver(E.build, CAT);
    const lista = vagasDeFoto(R).filter((v) => v.secao === secao);
    if (!lista.length) return '';
    const vistos = new Set();
    const itens = lista.filter((v) => (vistos.has(v.chave) ? false : vistos.add(v.chave))).map((v) => {
      const S = FOT.SLOTS[v.slot];
      const tem = !!fotosOrig[v.chave];
      const r = tem ? recorte(v.chave, v.prop) : null;
      const id = 'ff-' + (++idFoto);
      const nome = v.slot === 'fan-cubo' ? S.rotulo + ' — ' + curto(v.produto && v.produto.nome) : S.rotulo;
      const dados = ' data-slot="' + v.slot + '" data-modelo="' + esc(v.modelo) + '" data-prop="' + v.prop + '"';
      return '<li class="foto-item' + (tem ? ' tem' : '') + '">' +
        '<div class="foto-mini' + (S.forma === 'circulo' ? ' redonda' : '') + '">' + (r && r.mini ? '<img src="' + r.mini + '" alt="">' : '<svg class="ic"><use href="#i-camera"/></svg>') + '</div>' +
        '<div class="foto-texto"><strong>' + esc(nome) + '</strong><span>' + esc(S.dica) + '</span></div>' +
        '<div class="foto-acoes"><label class="botao' + (tem ? '' : ' botao-forte') + '" for="' + id + '">' + (tem ? 'Trocar' : 'Enviar foto') + '</label>' +
        '<input type="file" id="' + id + '" accept="image/*" hidden data-foto-enviar' + dados + '>' +
        (tem ? '<button type="button" class="botao" data-foto-ajustar' + dados + '>Ajustar</button><button type="button" class="botao" data-foto-remover' + dados + '>Remover</button>' : '') +
        '</div></li>';
    });
    const n = lista.filter((v) => fotosOrig[v.chave]).length;
    const fonte = lista.map((v) => v.produto && (v.produto.fontes || [])[0]).find(Boolean);
    const aberto = E.abertas.has('fotos:' + secao);
    return '<details class="fotos-reais" data-fotos="' + secao + '"' + (aberto ? ' open' : '') + '><summary>Fotos reais' + (n ? ' <span class="etiqueta">' + n + ' em uso</span>' : '') + '</summary>' +
      '<p class="nota">Para ficar idêntico ao produto, com os logos, use fotos oficiais' + (fonte ? ' (<a href="' + esc(fonte.url) + '" target="_blank" rel="noopener">página do produto</a>)' : '') + '. Você enquadra e a foto vira a textura dessa parte no 3D. Ela fica só neste navegador.</p>' +
      '<ul class="lista-fotos">' + itens.join('') + '</ul></details>';
  }

  /* ---------- seções (peças agrupadas) e o estado de cada uma ---------- */
  const SECOES = [
    { id: 'gabinete', cat: 'Gabinete', parte: 'gabinete' },
    { id: 'placaMae', cat: 'Placa-mãe e processador', parte: 'placaMae' },
    { id: 'memoria', cat: 'Memória', parte: 'memoria-0' },
    { id: 'cooler', cat: 'Watercooler', parte: 'radiador' },
    { id: 'gpu', cat: 'Placa de vídeo', parte: 'gpu' },
    { id: 'fonte', cat: 'Fonte e cabos', parte: 'fonte' }
  ];
  function secaoDaParte(id) {
    if (!id) return null;
    if (id === 'gabinete' || id === 'caixaFonte' || id === 'bandeja') return 'gabinete';
    if (id === 'placaMae') return 'placaMae';
    if (id.startsWith('memoria-')) return 'memoria';
    if (id === 'bomba' || id === 'radiador' || id === 'tubos' || id.startsWith('fanRad-')) return 'cooler';
    if (id === 'gpu' || id === 'riser' || id === 'conectorRiser') return 'gpu';
    if (id === 'fonte' || id === 'cabos') return 'fonte';
    if (id === 'fans' || id.startsWith('fan:')) return 'fans';
    return null;
  }
  const PESO = { ok: 0, info: 0, aviso: 1, erro: 2 };
  function estadoSecoes() {
    const est = {}, itens = {};
    if (!checagem) return { est, itens };
    for (const it of checagem.itens) {
      if (it.nivel !== 'erro' && it.nivel !== 'aviso') continue;
      const secs = new Set((it.pecas || []).map(secaoDaParte).filter(Boolean));
      for (const s of secs) {
        if (!est[s] || PESO[it.nivel] > PESO[est[s]]) est[s] = it.nivel;
        (itens[s] = itens[s] || []).push(it);
      }
    }
    return { est, itens };
  }
  function nivelDaParte(id) {
    if (!checagem) return 'ok';
    let n = 'ok';
    for (const it of checagem.itens) if ((it.pecas || []).includes(id) && PESO[it.nivel] > PESO[n]) n = it.nivel;
    return n;
  }

  function cartaoPeca(sec, nome, dim, estado, alertas, corpo) {
    const aberto = E.abertas.has(sec.id);
    const sel = secaoDaParte(E.sel) === sec.id;
    const oculta = E.ocultas.has(sec.parte);
    const al = (alertas || []).slice(0, 3).map((i) => '<p class="peca-alerta ' + i.nivel + '">' + esc(i.titulo) + '</p>').join('');
    return '<details class="peca' + (sel ? ' selecionada' : '') + '" data-secao="' + sec.id + '"' + (aberto ? ' open' : '') + '>' +
      '<summary><span class="peca-status ' + (estado || 'ok') + '" title="' + (estado === 'erro' ? 'Conflito' : estado === 'aviso' ? 'Atenção' : 'Cabe') + '"></span>' +
      '<span class="peca-textos"><span class="peca-cat">' + esc(sec.cat) + '</span><span class="peca-nome">' + esc(nome) + '</span>' + (dim ? '<span class="peca-dim">' + esc(dim) + '</span>' : '') + '</span>' +
      '<svg class="ic peca-seta" aria-hidden="true"><use href="#i-seta"/></svg></summary>' +
      '<div class="peca-corpo">' + al +
      '<div class="peca-acoes"><button type="button" class="botao" data-localizar="' + sec.parte + '">Mostrar no 3D</button>' +
      '<button type="button" class="botao" data-alternar-oculta="' + sec.parte + '" aria-pressed="' + oculta + '">' + (oculta ? 'Mostrar' : 'Ocultar') + '</button></div>' +
      corpo + '</div></details>';
  }

  function resumoBuild() {
    if (!checagem || !atual) return '';
    const nivel = checagem.erros ? 'erro' : checagem.avisos ? 'aviso' : 'ok';
    const enc = checagem.erros ? checagem.erros + (checagem.erros > 1 ? ' conflitos' : ' conflito') : checagem.avisos ? checagem.avisos + ' atenção' : 'Tudo cabe';
    const en = checagem.energia;
    const nEn = en.carga > 1 ? 'erro' : en.carga > 0.8 ? 'aviso' : 'ok';
    const t = checagem.termico;
    const nT = !t ? 'ok' : t.dT > 16 ? 'erro' : t.dT > 10 ? 'aviso' : 'ok';
    return '<div class="resumo-build">' +
      '<div class="' + nivel + '" role="button" tabindex="0" data-ir-aba="checagem" title="Abrir a checagem"><span>Encaixe</span><strong>' + esc(enc) + '</strong><small>' + atual.partes.filter((p) => p.colide).length + ' peças conferidas</small></div>' +
      '<div class="' + nEn + '" role="button" tabindex="0" data-ir-aba="checagem" title="Consumo estimado em carga"><span>Consumo</span><strong>~' + en.total + ' W</strong><small>' + Math.round(en.carga * 100) + '% da fonte</small></div>' +
      '<div class="' + nT + '" role="button" tabindex="0" data-ir-aba="checagem" title="Aquecimento do ar dentro do gabinete em carga"><span>Ar interno</span><strong>' + (t ? '+' + fmt(t.dT, 1) + ' °C' : '—') + '</strong><small>acima do quarto</small></div>' +
      '</div>';
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
    const gpuMed = atual ? atual.partes.find((p) => p.id === 'gpu') : null;
    const gm = gpuMed ? gpuMed.obj.userData.medidas : null;
    const { est, itens } = estadoSecoes();
    const S = Object.fromEntries(SECOES.map((s) => [s.id, s]));
    const q = b.memoria.quantidade || 2;
    const fansCaso = atual ? atual.contagem.fansCaso : 0;
    const fl = atual && atual.fluxo;

    return [
      resumoBuild(),
      cartaoPeca(S.gabinete, G.nome, G.medidas.profundidade + ' × ' + G.medidas.largura + ' × ' + G.medidas.altura + ' mm', est.gabinete, itens.gabinete, [
        campoSelect('s-gab', 'gabinete.modelo', 'Modelo', opcoes(CAT.gabinetes, b.gabinete.modelo)),
        '<div class="cores"><label>Cor do gabinete <input type="color" data-bind="gabinete.cor" data-rotulo="Cor do gabinete" value="' + esc(b.gabinete.cor || G.cor) + '"></label></div>',
        blocoMedidas('gabinete', R.ids.gabinete)
      ].join('')),

      cartaoPeca(S.placaMae, R.placaMae.nome, R.placaMae.formato + ' · ' + R.placaMae.largura + ' × ' + R.placaMae.altura + ' mm · ' + R.cpu.nome, est.placaMae, itens.placaMae, [
        campoSelect('s-mb', 'placaMae.modelo', 'Modelo', opcoes(CAT.placasMae, b.placaMae.modelo)),
        campoSelect('s-cpu', 'cpu.modelo', 'Processador (para estimar o consumo)', opcoes(CAT.cpus, b.cpu.modelo)),
        blocoFotos('placaMae'),
        blocoMedidas('placaMae', R.ids.placaMae)
      ].join('')),

      cartaoPeca(S.memoria, q + '× ' + R.memoria.nome, R.memoria.capacidade * q + ' GB · ' + fmt(R.memoria.altura) + ' mm de altura', est.memoria, itens.memoria, [
        campoSelect('s-ram', 'memoria.modelo', 'Modelo', opcoes(CAT.memorias, b.memoria.modelo)),
        campoSeg('Quantidade de pentes', seg('memoria.quantidade', b.memoria.quantidade, [[1, '1'], [2, '2'], [4, '4']], 'Quantidade de pentes', true)),
        blocoFotos('memoria'),
        blocoMedidas('memoria', R.ids.memoria)
      ].join('')),

      cartaoPeca(S.cooler, R.cooler.nome, classe + ' mm · ' + (G.montagens[b.refrigeracao.local] ? G.montagens[b.refrigeracao.local].nome : '—') + (atual && atual.radInfo && atual.radInfo.mangueira.disponivel ? ' · mangueiras ' + atual.radInfo.mangueira.disponivel + ' mm' : ''), est.cooler, itens.cooler, [
        campoSelect('s-aio', 'refrigeracao.modelo', 'Modelo', opcoes(CAT.coolers, b.refrigeracao.modelo)),
        campoSelect('s-aio-local', 'refrigeracao.local', 'Posição do radiador', zonasRad.map(([zid, z]) =>
          '<option value="' + zid + '"' + (zid === b.refrigeracao.local ? ' selected' : '') + '>' + esc(z.nome) + ' (até ' + z.radiador + ' mm)</option>').join('')),
        campoSeg('Fluxo dos fans do radiador', seg('refrigeracao.fluxo', b.refrigeracao.fluxo, [['saida', 'Saída (exaustão)'], ['entrada', 'Entrada']], 'Fluxo dos fans do radiador')),
        campoSeg('Fans do radiador', seg('refrigeracao.fansPosicao', b.refrigeracao.fansPosicao, [['dentro', 'Entre radiador e placa'], ['painel', 'Colados no painel']], 'Posição dos fans do radiador')),
        campoSeg('Mangueiras saem', seg('refrigeracao.tubos', b.refrigeracao.tubos, tubosItens, 'Lado das mangueiras', true)),
        slider('r-aio-desl', 'refrigeracao.deslocamento', Math.max(-lim, Math.min(lim, b.refrigeracao.deslocamento || 0)), -lim, lim, 1, 'Deslocar o radiador ao longo da posição'),
        blocoFotos('cooler'),
        blocoMedidas('cooler', R.ids.cooler)
      ].join('')),

      cartaoPeca(S.gpu, R.gpu.nome, (gm ? fmt(gm.comprimento) + ' × ' + fmt(gm.altura) + ' × ' + fmt(gm.espessura) + ' mm · ' : '') + (vertical ? 'vertical' : 'horizontal') + (deshroud ? ', sem shroud' : ''), est.gpu, itens.gpu, [
        campoSelect('s-gpu', 'gpu.modelo', 'Modelo', opcoes(CAT.gpus, b.gpu.modelo)),
        campoSeg('Cooler', seg('gpu.modo', b.gpu.modo, [['deshroud', 'Sem shroud'], ['original', 'Com shroud']], 'Cooler da placa de vídeo')),
        campoSeg('Montagem', seg('gpu.orientacao', b.gpu.orientacao, [['vertical', 'Vertical (riser)'], ['horizontal', 'Horizontal']], 'Orientação da placa de vídeo')),
        vertical ? slider('r-gpu-dist', 'gpu.distanciaBandeja', b.gpu.distanciaBandeja, gv.distanciaMin, gv.distanciaMax, 1, 'Distância da bandeja até a backplate') : '',
        vertical ? slider('r-gpu-alt', 'gpu.alturaDoChao', b.gpu.alturaDoChao, gv.alturaMin, gv.alturaMax || Math.round(G.medidas.altura * 0.5), 1, 'Altura da borda de baixo da placa (do chão)') : '',
        vertical && atual && atual.riserInfo ? '<p class="nota">Cabo riser: precisa de ~' + fmt(atual.riserInfo.comprimento, 0) + ' mm pelo caminho mostrado.</p>' : '',
        deshroud ? [
          campoSelect('s-gpu-fan', 'gpu.fans.modelo', 'Fans presos no dissipador', opcoes(CAT.fans, b.gpu.fans.modelo)),
          campoSeg('Quantidade de fans', seg('gpu.fans.quantidade', b.gpu.fans.quantidade, [[1, '1'], [2, '2'], [3, '3']], 'Quantidade de fans na GPU', true)),
          slider('r-gpu-esp', 'gpu.fans.espacamento', b.gpu.fans.espacamento, 0, 40, 1, 'Espaço entre os fans'),
          slider('r-gpu-fdes', 'gpu.fans.deslocamento', b.gpu.fans.deslocamento, -80, 80, 1, 'Deslocar os fans ao longo da placa')
        ].join('') : '',
        blocoFotos('gpu'),
        blocoMedidas('gpu', R.ids.gpu)
      ].join('')),

      cartaoPeca(S.fonte, R.fonte.nome, R.fonte.largura + ' × ' + R.fonte.altura + ' × ' + R.fonte.comprimento + ' mm · ' + R.fonte.potencia + ' W', est.fonte, itens.fonte, [
        campoSelect('s-psu', 'fonte.modelo', 'Modelo', opcoes(CAT.fontes, b.fonte.modelo)),
        campoSelect('s-cabos', 'fonte.cabos', 'Cabos', OPCOES_CABOS.map(([v, r]) => '<option value="' + v + '"' + ((b.fonte.cabos || 'originais') === v ? ' selected' : '') + '>' + esc(r) + '</option>').join('')),
        '<p class="nota">O ' + esc(G.nome) + ' aceita fonte de até <strong>' + G.limites.fonteComprimento + ' mm</strong> de comprimento.</p>',
        blocoFotos('fonte'),
        blocoMedidas('fonte', R.ids.fonte)
      ].join('')),

      '<section class="cartao"><header><h3>Fans do gabinete</h3><span class="etiqueta">' + fansCaso + ' instalado' + (fansCaso === 1 ? '' : 's') + '</span></header>',
      fl ? '<p class="nota">' + fmt(fl.cfmEntrada, 0) + ' CFM entrando · ' + fmt(fl.cfmSaida, 0) + ' CFM saindo (vazão máxima).</p>' : '',
      '<div class="acoes"><button type="button" class="botao botao-forte" data-ir-aba="fans"><svg class="ic"><use href="#i-mais"/></svg>Adicionar ou trocar fans</button></div></section>'
    ].join('');
  }
  const OPCOES_CABOS = [['originais', 'Originais da fonte (pretos)'], ['brancos', 'Extensões trançadas brancas'], ['pretos', 'Extensões trançadas pretas'], ['ocultos', 'Não mostrar os cabos']];

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
      const razao = fl.cfmSaida > 0 ? fl.cfmEntrada / fl.cfmSaida : 9;
      const pressao = !fl.cfmEntrada && !fl.cfmSaida ? 'sem fans' : razao > 1.12 ? 'pressão positiva' : razao < 0.88 ? 'pressão negativa' : 'pressão equilibrada';
      partes.push('<div class="resumo"><strong>' + fmt(fl.cfmEntrada, 0) + ' CFM entrando · ' + fmt(fl.cfmSaida, 0) + ' saindo</strong><span class="nota">' + fl.entrada + ' de entrada, ' + fl.saida + ' de saída (com o radiador), ' + pressao + '. As vagas livres aparecem no 3D com um <b>+</b>: clique para pôr um fan. Ligue “Simular o ar” em Camadas para ver o caminho do ar.</span></div>');
    }
    const vagasZona = (zid) => (atual && atual.vagas ? atual.vagas.filter((v) => v.zona === zid) : []);
    for (const [zid, zona] of Object.entries(G.montagens)) {
      const cfg = zonaCfg(zid, zona);
      const tams = MONT.tamanhosDaZona(zona);
      const cap = tams.map((t) => MONT.vagasDaZona(zona, t) + ' × ' + t).join(' / ');
      partes.push('<section class="cartao" data-zona="' + zid + '">', '<header><h3>' + esc(zona.nome) + '</h3><span class="etiqueta">' + cap + ' mm</span></header>');
      if (rad && rad.zona === zid) {
        partes.push('<p class="nota-forte">Ocupado pelo radiador do watercooler (' + rad.classe + ' mm). Mude a posição do radiador em Peças → Watercooler para liberar.</p></section>');
        continue;
      }
      const tam = Number(cfg.tamanho) || tams[0];
      const n = MONT.vagasDaZona(zona, tam);
      const vz = vagasZona(zid);
      const cheias = (cfg.vagas || []).slice(0, n).filter((f) => f && CAT.fans[f]).length;
      partes.push('<div class="linha2">',
        campoSeg('Tamanho', '<div class="seg" role="group" aria-label="Tamanho dos fans">' + tams.map((t) =>
          '<button type="button" data-fz="' + zid + '" data-fz-campo="tamanho" data-valor="' + t + '" aria-pressed="' + (t === tam) + '">' + t + ' mm</button>').join('') + '</div>'),
        campoSeg('Fluxo', '<div class="seg" role="group" aria-label="Fluxo de ar">' + [['entrada', 'Entrada'], ['saida', 'Saída']].map(([v, r]) =>
          '<button type="button" data-fz="' + zid + '" data-fz-campo="fluxo" data-valor="' + v + '" aria-pressed="' + (cfg.fluxo === v) + '">' + r + '</button>').join('') + '</div>'),
        '</div><div class="fileira-vagas">');
      for (let i = 0; i < n; i++) {
        const sel = (cfg.vagas || [])[i] || '';
        const f = sel && CAT.fans[sel];
        const v = vz.find((x) => x.i === i);
        const idFan = 'fan:' + zid + ':' + i;
        const conflito = f ? nivelDaParte(idFan) === 'erro' : !!(v && v.conflito);
        const titulo = f ? f.nome + (conflito ? ' — encosta em outra peça' : '') : (v && v.conflito ? 'Livre, mas encosta em ' + curto(v.conflito) : 'Vaga livre');
        const ops = '<option value="">Vazia</option>' + opcoes(CAT.fans, sel, (x) => x.tamanho === tam);
        partes.push('<div class="vaga' + (f ? ' cheia' : '') + (conflito ? ' conflito' : '') + '" title="' + esc(titulo) + '">' +
          '<span class="disco">' + (f ? '' : '<svg class="ic"><use href="#i-mais"/></svg>') + '</span>' +
          '<span class="nome-fan">' + esc(f ? curto(f.nome) : 'Vaga ' + (i + 1)) + '</span>' +
          '<select aria-label="' + esc(zona.nome) + ', vaga ' + (i + 1) + '" data-fz="' + zid + '" data-vaga="' + i + '">' + ops + '</select></div>');
      }
      partes.push('</div><div class="acoes-zona">',
        cheias < n ? '<button type="button" class="botao" data-encher="' + zid + '">Preencher as vazias</button>' : '',
        cheias ? '<button type="button" class="botao" data-esvaziar="' + zid + '">Tirar todos</button>' : '',
        '</div></section>');
    }
    const bf = blocoFotos('fans');
    if (bf) partes.push('<section class="cartao">' + bf + '</section>');
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
    const temParte = (id) => atual.partes.some((p) => p.id === id && (p.obj || p.caixas.length));
    return [
      '<div class="resumo ' + nivel + '"><strong>' + esc(titulo) + '</strong><span class="nota">Checagem feita com as caixas de cada peça em escala real. Posições internas do gabinete são estimadas — veja a aba Medidas.</span></div>',
      '<ul class="itens">', itens.map((i) => {
        const alvo = (i.pecas || []).find(temParte);
        return '<li class="item ' + i.nivel + '"><span class="pill ' + i.nivel + '">' + NOMES_NIVEL[i.nivel] + '</span><div><strong>' + esc(i.titulo) + '</strong>' + (i.detalhe ? '<p>' + esc(i.detalhe) + '</p>' : '') +
          (alvo && i.nivel !== 'ok' && i.nivel !== 'info' ? '<button type="button" class="link-3d" data-localizar="' + esc(alvo) + '">Mostrar no 3D</button>' : '') + '</div></li>';
      }).join(''), '</ul>',
      '<h4 class="titulo-secao">Folgas medidas</h4>',
      '<dl class="folgas">', atual.folgas.map((f) => {
        const cls = f.valor < 0 ? ' negativa' : f.valor < f.minimo ? ' apertada' : '';
        const pct = Math.max(4, Math.min(100, (f.valor / 60) * 100));
        return '<div class="folga' + cls + '"><dt>' + esc(f.nome) + '</dt><dd>' + fmt(f.valor) + ' mm</dd><div class="barra"><i style="width:' + (f.valor < 0 ? 100 : pct) + '%"></i></div></div>';
      }).join(''), '</dl>',
      '<h4 class="titulo-secao">Energia estimada</h4>',
      '<div class="medidor ' + nivelEn + '"><div class="trilho"><i style="width:' + Math.min(100, en.carga * 100) + '%"></i></div>',
      '<div class="legenda"><span>~' + en.total + ' W</span><span>' + Math.round(en.carga * 100) + '% de ' + psu + ' W</span></div></div>',
      checagem.termico ? '<h4 class="titulo-secao">Ar dentro do gabinete</h4><div class="medidor ' + (checagem.termico.dT > 16 ? 'erro' : checagem.termico.dT > 10 ? 'aviso' : 'ok') + '"><div class="trilho"><i style="width:' + Math.min(100, checagem.termico.dT / 20 * 100) + '%"></i></div><div class="legenda"><span>+' + fmt(checagem.termico.dT, 1) + ' °C acima do quarto</span><span>~' + fmt(checagem.termico.cfm, 0) + ' CFM efetivos</span></div></div><p class="nota">Física: ΔT = calor ÷ (densidade do ar × calor específico × vazão). ' + fmt(checagem.termico.calor, 0) + ' W liberados dentro do gabinete, com os fans a ~60%.</p>' : ''
    ].join('');
  }

  function renderSalvas() {
    const lista = HIST.lerSalvas();
    const atualJSON = JSON.stringify(E.build);
    const data = (t) => { try { return new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } };
    const resumo = (b) => {
      const g = CAT.gabinetes[b.gabinete && b.gabinete.modelo], gp = CAT.gpus[b.gpu && b.gpu.modelo], c = CAT.coolers[b.refrigeracao && b.refrigeracao.modelo];
      const nf = Object.values(b.fans || {}).reduce((s, z) => s + ((z && z.vagas) || []).filter(Boolean).length, 0);
      return [g && curto(g.nome), gp && curto(gp.nome), c && curto(c.nome), nf + ' fans'].filter(Boolean).join(' · ');
    };
    const sugestao = 'Montagem ' + (lista.length + 1);
    const json = JSON.stringify(E.build, null, 2);
    return [
      '<section class="cartao"><header><h3>Salvar esta montagem</h3></header>',
      '<div class="nova-salva"><input type="text" id="nome-salva" maxlength="60" placeholder="' + esc(sugestao) + '" aria-label="Nome da montagem"><button type="button" class="botao botao-forte" id="b-salvar-como">Salvar</button></div>',
      '<p class="nota">Guarde versões para comparar ideias (outro gabinete, mais fans…). Ficam salvas neste navegador, com uma miniatura.</p></section>',
      lista.length ? '<ul class="lista-salvas">' + lista.map((s) => {
        const ap = s.aparencia || {};
        const igual = JSON.stringify(normalizar(s.build)) === atualJSON && (!ap.rgb || (ap.rgb === E.vis.rgb && (ap.rgbModo || 'fixo') === E.vis.rgbModo));
        return '<li class="salva' + (igual ? ' atual' : '') + '">' +
          (s.miniatura ? '<img src="' + esc(s.miniatura) + '" alt="">' : '<div class="sem-miniatura"></div>') +
          '<div><h4 title="' + esc(s.nome) + '">' + esc(s.nome) + '</h4><p>' + esc(data(s.data)) + (igual ? ' · <strong>aberta agora</strong>' : '') + '<br>' + esc(resumo(s.build)) + '</p>' +
          '<div class="acoes"><button type="button" class="botao botao-forte" data-abrir-salva="' + esc(s.id) + '"' + (igual ? ' disabled' : '') + '>Abrir</button>' +
          '<button type="button" class="botao" data-substituir-salva="' + esc(s.id) + '" title="Guardar a montagem atual por cima desta">Atualizar</button>' +
          '<button type="button" class="botao botao-perigo" data-apagar-salva="' + esc(s.id) + '">Apagar</button></div></div></li>';
      }).join('') + '</ul>' : '<p class="nota">Nenhuma montagem salva ainda.</p>',
      '<section class="cartao"><header><h3>Arquivo (JSON)</h3></header>',
      '<p class="nota">Para levar para outro computador: copie o texto (ou baixe o arquivo) e depois cole aqui e clique em “Carregar”.</p>',
      '<textarea class="json" id="json-build" spellcheck="false" aria-label="Montagem em JSON">' + esc(json) + '</textarea>',
      '<div class="acoes"><button type="button" class="botao" id="b-copiar">Copiar</button><button type="button" class="botao" id="b-baixar">Baixar .json</button>',
      '<button type="button" class="botao" id="b-carregar">Carregar do texto</button><label class="botao" for="b-arquivo">Abrir arquivo</label><input type="file" id="b-arquivo" accept=".json,application/json" hidden></div>',
      '<p class="nota" id="json-msg" aria-live="polite"></p>',
      '<div class="acoes"><button type="button" class="botao" id="b-restaurar">Voltar para a montagem padrão</button></div></section>'
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
    const cfm = (f) => (f && isFinite(f.cfm) ? ' · ' + fmt(f.cfm, 1) + ' CFM' : '');
    const linhas = [
      linhaMedida(G.nome, G.medidas.profundidade + ' × ' + G.medidas.largura + ' × ' + G.medidas.altura, 'Externas oficiais; internas estimadas', G.fontes),
      linhaMedida(R.placaMae.nome, R.placaMae.largura + ' × ' + R.placaMae.altura, R.placaMae.estimado && R.placaMae.estimado.length ? 'Tamanho oficial; layout estimado' : '', R.placaMae.fontes),
      linhaMedida(R.memoria.nome, fmt(R.memoria.comprimento, 2) + ' × ' + fmt(R.memoria.altura, 2), 'Espessura estimada', R.memoria.fontes),
      linhaMedida(R.cooler.nome + ' — radiador', R.cooler.radiador.comprimento + ' × ' + R.cooler.radiador.largura + ' × ' + R.cooler.radiador.espessura, (R.cooler.estimado || []).filter((x) => x !== 'mangueira' && x !== 'massa').length ? 'Estimado' : '', R.cooler.fontes),
      linhaMedida(R.cooler.nome + ' — bomba', fmt(R.cooler.bomba.largura) + ' × ' + fmt(R.cooler.bomba.profundidade) + ' × ' + fmt(R.cooler.bomba.altura), (R.cooler.estimado || []).filter((x) => x !== 'mangueira' && x !== 'massa').length ? 'Estimado' : '', []),
      R.cooler.mangueira ? linhaMedida(R.cooler.nome + ' — mangueiras', R.cooler.mangueira + ' mm', (R.cooler.estimado || []).includes('mangueira') ? 'Estimado' : '', []) : '',
      linhaMedida(R.fonte.nome, R.fonte.largura + ' × ' + R.fonte.altura + ' × ' + R.fonte.comprimento, '', R.fonte.fontes),
      linhaMedida(R.gpu.nome + ' (com shroud)', fmt(R.gpu.comprimento) + ' × ' + fmt(R.gpu.altura) + ' × ' + fmt(R.gpu.espessura), '', R.gpu.fontes),
      linhaMedida(R.gpu.nome + ' (sem shroud)', R.gpu.deshroud.comprimento + ' × ' + R.gpu.deshroud.altura + ' × ' + R.gpu.deshroud.espessura, 'Estimado — meça o seu', []),
      linhaMedida(gpuFan.nome, gpuFan.tamanho + ' × ' + gpuFan.tamanho + ' × ' + gpuFan.espessura + cfm(gpuFan), '', gpuFan.fontes)
    ];
    if (R.coolerFan && R.coolerFan !== gpuFan) linhas.push(linhaMedida(R.coolerFan.nome, R.coolerFan.tamanho + ' × ' + R.coolerFan.tamanho + ' × ' + R.coolerFan.espessura + cfm(R.coolerFan), '', R.coolerFan.fontes));
    for (const id of fansUsados) {
      const f = CAT.fans[id];
      if (f && id !== E.build.gpu.fans.modelo && f !== R.coolerFan) linhas.push(linhaMedida(f.nome, f.tamanho + ' × ' + f.tamanho + ' × ' + f.espessura + cfm(f), (f.fontes || []).length ? '' : 'Genérico', f.fontes));
    }
    const ms = atual && atual.massas;
    let massas = '';
    if (ms && ms.total > 0) {
      const chip = (est) => (est ? '<span class="chip estimado">Estimado</span>' : '<span class="chip oficial">Oficial</span>');
      const t = ms.tombamento;
      massas = '<section class="cartao"><header><h3>Massas e centro de massa</h3></header>' +
        '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Peça</th><th>Massa</th><th>Origem</th></tr></thead><tbody>' +
        ms.itens.slice().sort((a, b) => b.gramas - a.gramas).map((i) => '<tr><td>' + esc(i.nome) + '</td><td class="num">' + fmt(i.gramas, 0) + ' g</td><td>' + chip(i.estimado) + '</td></tr>').join('') +
        '<tr><td><strong>Total</strong></td><td class="num"><strong>' + fmt(ms.total / 1000, 2) + ' kg</strong></td><td></td></tr></tbody></table></div>' +
        '<p class="nota">Centro de massa a ' + fmt(ms.cg.y, 0) + ' mm do chão' + (t ? '; o PC só tomba sozinho se inclinar ~' + fmt(t.graus, 0) + '° para ' + esc(t.lado) : '') + '. No modo <strong>Física</strong> (<kbd>X</kbd>) cada peça usa essa massa: arraste, solte e chacoalhe para ver como elas se encostam.</p></section>';
    }
    return [
      '<section class="cartao"><header><h3>Medidas usadas (mm)</h3></header>',
      '<div class="tabela-rolagem"><table class="tabela"><thead><tr><th>Peça</th><th>Medidas</th><th>Origem</th></tr></thead><tbody>', linhas.join(''), '</tbody></table></div>',
      '<p class="nota">Comprimento × largura × altura (ou espessura). “Estimado” = o fabricante não publica; ajuste em “Editar medidas” (aba Peças) depois de medir. Vazão (CFM) é a máxima de catálogo.</p></section>',
      massas,
      '<section class="cartao"><header><h3>Cadastrar peças novas</h3></header>',
      '<p class="nota">Tudo que aparece nos menus vem de <code>data/catalogo.js</code>. Copie um item da mesma categoria, troque o nome e as medidas e recarregue a página. Posições dentro do gabinete usam x = distância da lateral direita, y = altura do chão e z = distância da traseira, em mm.</p></section>'
    ].join('');
  }

  function renderAba() {
    const el = $('#conteudo');
    const rolagem = el.scrollTop;
    const html = E.aba === 'fans' ? renderFans() : E.aba === 'checagem' ? renderChecagem() : E.aba === 'salvas' ? renderSalvas() : E.aba === 'medidas' ? renderMedidas() : renderPecas();
    el.innerHTML = html;
    el.scrollTop = rolagem;
    for (const b of $$('.abas [data-aba]')) b.setAttribute('aria-selected', String(b.dataset.aba === E.aba));
    el.setAttribute('aria-labelledby', 'tab-' + E.aba);
    marcarNaLista(true);
  }

  function marcarNaLista(semRolar) {
    const sec = secaoDaParte(E.sel);
    for (const d of $$('#conteudo details.peca')) d.classList.toggle('selecionada', d.dataset.secao === sec);
    let alvo = null;
    if (E.aba === 'pecas' && sec && sec !== 'fans') alvo = $('#conteudo details.peca[data-secao="' + sec + '"]');
    if (E.aba === 'fans' && E.sel && E.sel.startsWith('fan:')) alvo = $('#conteudo [data-zona="' + E.sel.split(':')[1] + '"]');
    if (alvo && !semRolar && alvo.scrollIntoView) alvo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderStatus() {
    if (!checagem || !atual) return;
    const nivel = checagem.erros ? 'erro' : checagem.avisos ? 'aviso' : 'ok';
    const txt = checagem.erros ? checagem.erros + (checagem.erros > 1 ? ' conflitos' : ' conflito') : checagem.avisos ? checagem.avisos + ' atenção' : 'Tudo cabe';
    $('#status-geral').innerHTML = '<button type="button" class="pill ' + nivel + '" data-ir-aba="checagem" style="background:none;cursor:pointer">' + esc(txt) + '</button>';
    $('#sub-gabinete').textContent = atual.G.nome + ' · escala 1 : 1 em mm';
  }

  /* ---------- ficha: inspetor da peça selecionada, com troca rápida ---------- */
  function trocaRapida(p) {
    const b = E.build, id = p.id, R = atual.R;
    if (id.startsWith('fan:')) {
      const [, zid, si] = id.split(':');
      const i = Number(si);
      const zona = atual.G.montagens[zid];
      if (!zona) return '';
      const cfg = zonaCfg(zid, zona);
      const tam = Number(cfg.tamanho);
      const sel = (cfg.vagas || [])[i] || '';
      return '<div class="trocar">' +
        '<div class="campo"><label for="f-fan">Modelo</label><select id="f-fan" data-fz="' + zid + '" data-vaga="' + i + '">' + opcoes(CAT.fans, sel, (x) => x.tamanho === tam) + '</select></div>' +
        campoSeg('Fluxo de ' + zona.nome.toLowerCase(), '<div class="seg" role="group" aria-label="Fluxo">' + [['entrada', 'Entrada'], ['saida', 'Saída']].map(([v, r]) =>
          '<button type="button" data-fz="' + zid + '" data-fz-campo="fluxo" data-valor="' + v + '" aria-pressed="' + (cfg.fluxo === v) + '">' + r + '</button>').join('') + '</div>') +
        '<div class="acoes"><button type="button" class="botao botao-perigo" data-remover-fan="' + esc(id) + '">Remover este fan</button></div></div>';
    }
    const sec = secaoDaParte(id);
    const blocos = {
      gabinete: () => campoSelect('f-gab', 'gabinete.modelo', 'Trocar o gabinete', opcoes(CAT.gabinetes, b.gabinete.modelo)),
      placaMae: () => campoSelect('f-mb', 'placaMae.modelo', 'Trocar a placa-mãe', opcoes(CAT.placasMae, b.placaMae.modelo)) + campoSelect('f-cpu', 'cpu.modelo', 'Processador', opcoes(CAT.cpus, b.cpu.modelo)),
      memoria: () => campoSelect('f-ram', 'memoria.modelo', 'Trocar a memória', opcoes(CAT.memorias, b.memoria.modelo)) + campoSeg('Pentes', seg('memoria.quantidade', b.memoria.quantidade, [[1, '1'], [2, '2'], [4, '4']], 'Quantidade de pentes', true)),
      cooler: () => campoSelect('f-aio', 'refrigeracao.modelo', 'Trocar o watercooler', opcoes(CAT.coolers, b.refrigeracao.modelo)) +
        campoSelect('f-aio-local', 'refrigeracao.local', 'Posição do radiador', Object.entries(atual.G.montagens).filter(([, z]) => z.radiador > 0).map(([zid, z]) => '<option value="' + zid + '"' + (zid === b.refrigeracao.local ? ' selected' : '') + '>' + esc(z.nome) + '</option>').join('')) +
        campoSeg('Fluxo dos fans', seg('refrigeracao.fluxo', b.refrigeracao.fluxo, [['saida', 'Saída'], ['entrada', 'Entrada']], 'Fluxo dos fans do radiador')),
      gpu: () => campoSelect('f-gpu', 'gpu.modelo', 'Trocar a placa de vídeo', opcoes(CAT.gpus, b.gpu.modelo)) +
        campoSeg('Cooler', seg('gpu.modo', b.gpu.modo, [['deshroud', 'Sem shroud'], ['original', 'Original']], 'Cooler')) +
        campoSeg('Montagem', seg('gpu.orientacao', b.gpu.orientacao, [['vertical', 'Vertical'], ['horizontal', 'Horizontal']], 'Montagem')),
      fonte: () => campoSelect('f-psu', 'fonte.modelo', 'Trocar a fonte', opcoes(CAT.fontes, b.fonte.modelo)) +
        campoSelect('f-cabos', 'fonte.cabos', 'Cabos', OPCOES_CABOS.map(([v, r]) => '<option value="' + v + '"' + ((b.fonte.cabos || 'originais') === v ? ' selected' : '') + '>' + esc(r) + '</option>').join(''))
    };
    return blocos[sec] ? '<div class="trocar">' + blocos[sec]() + '</div>' : (R ? '' : '');
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
    const detalhes = (info.notas ? '<p class="nota">' + esc(info.notas) + '</p>' : '') + est + (fontes ? '<ul class="fontes-lista">' + fontes + '</ul>' : '');
    const sec = secaoDaParte(p.id);
    f.innerHTML = '<header><span class="cat">' + esc(p.categoria) + '</span><button type="button" class="fechar" data-fechar-ficha aria-label="Fechar">×</button><h3>' + esc(p.nome) + '</h3></header>' +
      (conflitos.length ? '<p class="conflito">Encosta em: ' + esc(conflitos.map((c) => (c.a.id === p.id ? c.b.nome : c.a.nome)).join(', ')) + '</p>' : '') +
      trocaRapida(p) +
      (med ? '<dl>' + med + '</dl>' : '') +
      (detalhes ? '<details class="medidas"><summary>Notas e fontes</summary>' + detalhes + '</details>' : '') +
      '<div class="acoes"><button type="button" class="botao" data-enquadrar="' + esc(p.id) + '">Aproximar</button>' +
      (p.id !== 'gabinete' ? '<button type="button" class="botao" data-ocultar="' + esc(p.id) + '">Ocultar <kbd>H</kbd></button>' : '') +
      (sec && sec !== 'fans' ? '<button type="button" class="botao" data-editar-secao="' + sec + '">Mais ajustes</button>' : '') +
      (sec && sec !== 'gabinete' ? '<button type="button" class="botao" data-abrir-fotos="' + sec + '"><svg class="ic"><use href="#i-camera"/></svg>Foto real</button>' : '') +
      (sec === 'fans' ? '<button type="button" class="botao" data-ir-aba="fans">Todos os fans</button>' : '') + '</div>';
    f.hidden = false;
  }

  /* ---------- avisos rápidos (toasts) ---------- */
  function toast(texto, opts = {}) {
    const box = $('#toasts');
    if (!box) return;
    const t = document.createElement('div');
    t.className = 'toast' + (opts.tipo ? ' ' + opts.tipo : '');
    t.setAttribute('role', opts.tipo === 'erro' ? 'alert' : 'status');
    const span = document.createElement('span');
    span.textContent = texto;
    t.appendChild(span);
    if (opts.acao) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = opts.acao;
      b.addEventListener('click', () => { fechar(); opts.aoClicar && opts.aoClicar(); });
      t.appendChild(b);
    }
    function fechar() { if (!t.isConnected) return; t.classList.add('sai'); setTimeout(() => t.remove(), 220); }
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    setTimeout(fechar, opts.duracao || 4800);
  }

  /* ---------- mudanças na build: histórico, reconstrução e aviso ---------- */
  function aplicar(opts = {}) {
    salvar();
    reconstruir();
    if (opts.render !== false) renderAba();
  }
  function atualizarBotoesHist() {
    const d = $('#desfazer'), r = $('#refazer');
    d.disabled = !HIST.podeDesfazer();
    r.disabled = !HIST.podeRefazer();
    d.title = HIST.podeDesfazer() ? 'Desfazer: ' + HIST.proximoDesfazer() + ' (Ctrl+Z)' : 'Nada para desfazer';
    r.title = HIST.podeRefazer() ? 'Refazer: ' + HIST.proximoRefazer() + ' (Ctrl+Shift+Z)' : 'Nada para refazer';
  }
  function mudar(rotulo, fn, opts = {}) {
    const errosAntes = checagem ? checagem.erros : 0;
    HIST.iniciar(E.build);
    fn();
    const mudou = HIST.concluir(E.build, rotulo);
    if (!mudou) { renderAba(); renderFicha(); return false; }
    aplicar();
    atualizarBotoesHist();
    if (opts.toast !== false) avisoDepois(rotulo, errosAntes);
    return true;
  }
  function avisoDepois(rotulo, errosAntes) {
    if (checagem && checagem.erros > errosAntes) {
      const novo = checagem.itens.find((i) => i.nivel === 'erro');
      toast(rotulo + ' — ' + (novo ? novo.titulo : 'conflito'), { tipo: 'erro', acao: 'Desfazer', aoClicar: desfazer, duracao: 7000 });
    } else if (checagem && checagem.erros < errosAntes && !checagem.erros) {
      toast(rotulo + ' — tudo cabe agora', { acao: 'Desfazer', aoClicar: desfazer });
    } else toast(rotulo, { acao: 'Desfazer', aoClicar: desfazer });
  }
  function desfazer() {
    const r = HIST.desfazer(E.build);
    if (!r) return;
    E.build = normalizar(r.build);
    aplicar();
    atualizarBotoesHist();
    toast('Desfeito: ' + r.rotulo, { acao: 'Refazer', aoClicar: refazer });
  }
  function refazer() {
    const r = HIST.refazer(E.build);
    if (!r) return;
    E.build = normalizar(r.build);
    aplicar();
    atualizarBotoesHist();
    toast('Refeito: ' + r.rotulo, { acao: 'Desfazer', aoClicar: desfazer });
  }

  const nomeEm = (col, id) => (CAT[col] && CAT[col][id] ? curto(CAT[col][id].nome) : id);
  function rotuloDe(caminho, v) {
    const T = {
      'gabinete.modelo': () => 'Gabinete: ' + nomeEm('gabinetes', v),
      'placaMae.modelo': () => 'Placa-mãe: ' + nomeEm('placasMae', v),
      'cpu.modelo': () => 'Processador: ' + nomeEm('cpus', v),
      'memoria.modelo': () => 'Memória: ' + nomeEm('memorias', v),
      'memoria.quantidade': () => v + (Number(v) > 1 ? ' pentes' : ' pente') + ' de memória',
      'refrigeracao.modelo': () => 'Watercooler: ' + nomeEm('coolers', v),
      'refrigeracao.local': () => 'Radiador em ' + ((atual && atual.G.montagens[v] && atual.G.montagens[v].nome) || v).toLowerCase(),
      'refrigeracao.fluxo': () => 'Fans do radiador em ' + (v === 'saida' ? 'saída' : 'entrada'),
      'refrigeracao.fansPosicao': () => v === 'painel' ? 'Fans do radiador colados no painel' : 'Fans do radiador entre radiador e placa',
      'refrigeracao.tubos': () => 'Lado das mangueiras invertido',
      'fonte.modelo': () => 'Fonte: ' + nomeEm('fontes', v),
      'fonte.cabos': () => 'Cabos: ' + ((OPCOES_CABOS.find((o) => o[0] === v) || [0, v])[1]).toLowerCase(),
      'gpu.modelo': () => 'Placa de vídeo: ' + nomeEm('gpus', v),
      'gpu.modo': () => v === 'original' ? 'Placa de vídeo com o cooler original' : 'Placa de vídeo sem shroud',
      'gpu.orientacao': () => 'Placa de vídeo na ' + (v === 'horizontal' ? 'horizontal' : 'vertical'),
      'gpu.fans.modelo': () => 'Fans da placa de vídeo: ' + nomeEm('fans', v),
      'gpu.fans.quantidade': () => v + (Number(v) > 1 ? ' fans' : ' fan') + ' na placa de vídeo'
    };
    return T[caminho] ? T[caminho]() : 'Alteração';
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

  function mudarZona(zid, rotulo, fn) {
    const zona = atual.G.montagens[zid];
    if (!zona) return;
    mudar(rotulo, () => {
      const cfg = clonar(zonaCfg(zid, zona));
      cfg.vagas = (cfg.vagas || []).slice();
      fn(cfg, zona);
      E.build.fans[zid] = cfg;
    });
  }

  /* Os mesmos controles funcionam na lista (aba) e na ficha flutuante. */
  function ligarEditores(cont) {
    cont.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('select[data-bind]')) {
        const cam = el.dataset.bind, v = el.value;
        mudar(rotuloDe(cam, v), () => {
          gravar(E.build, cam, v);
          if (cam === 'gabinete.modelo') aoMudarGabinete();
          if (cam === 'refrigeracao.local') E.build.refrigeracao.deslocamento = 0;
        });
      } else if (el.matches('input[type="range"][data-bind]') || el.matches('input[type="color"][data-bind]')) {
        if (HIST.concluir(E.build, el.dataset.rotulo || 'Ajuste')) atualizarBotoesHist();
        salvar();
        renderAba();
        renderFicha();
      } else if (el.matches('input[data-medida]')) {
        const id = el.dataset.medida, cam = el.dataset.caminho;
        const v = Number(String(el.value).replace(',', '.'));
        if (!isFinite(v) || v <= 0) { renderAba(); return; }
        const colecao = Object.values(COLECAO).find((c) => CAT[c][id]);
        const orig = ler(CAT[colecao][id], cam);
        mudar('Medida alterada: ' + (el.closest('label') ? el.closest('label').querySelector('span').firstChild.textContent : cam), () => {
          E.build.medidas = E.build.medidas || {};
          const aj = E.build.medidas[id] = E.build.medidas[id] || {};
          const caminhos = [cam].concat(el.dataset.tambem ? el.dataset.tambem.split(',') : []);
          for (const c of caminhos) { if (v === orig) delete aj[c]; else aj[c] = v; }
          if (!Object.keys(aj).length) delete E.build.medidas[id];
        });
      } else if (el.matches('select[data-fz]')) {
        const zid = el.dataset.fz, i = Number(el.dataset.vaga);
        const nome = (atual.G.montagens[zid] || {}).nome || zid;
        mudarZona(zid, el.value ? nome + ' ' + (i + 1) + ': ' + nomeEm('fans', el.value) : 'Fan removido de ' + nome + ' ' + (i + 1), (cfg) => { cfg.vagas[i] = el.value || null; });
      } else if (el.matches('input[data-foto-enviar]') && el.files && el.files[0]) {
        const arq = el.files[0];
        el.value = '';
        editarFoto(el.dataset.slot, el.dataset.modelo, Number(el.dataset.prop), arq);
      } else if (el.id === 'b-arquivo' && el.files && el.files[0]) {
        const leitor = new FileReader();
        leitor.onload = () => { $('#json-build').value = String(leitor.result); carregarTexto(); };
        leitor.readAsText(el.files[0]);
      }
    });

    cont.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches('input[type="range"][data-bind]')) {
        HIST.iniciar(E.build);
        gravar(E.build, el.dataset.bind, Number(el.value));
        const out = document.getElementById(el.id + '-v');
        if (out) out.textContent = fmt(Number(el.value), 0) + ' ' + (el.dataset.un || 'mm');
        agendarReconstrucao();
      } else if (el.matches('input[type="color"][data-bind]')) {
        HIST.iniciar(E.build);
        gravar(E.build, el.dataset.bind, el.value);
        agendarReconstrucao();
      }
    });

    cont.addEventListener('click', (e) => {
      const el = e.target.closest('button, [data-localizar]');
      if (!el || el.disabled) return;
      if (el.matches('button[data-bind]')) {
        const cam = el.dataset.bind, v = valorDe(el);
        if (String(ler(E.build, cam)) === String(v)) return;
        mudar(rotuloDe(cam, v), () => {
          gravar(E.build, cam, v);
          if (cam === 'gpu.orientacao' && v === 'vertical' && !isFinite(E.build.gpu.alturaDoChao)) E.build.gpu.alturaDoChao = atual.G.gpuVertical.alturaPadrao;
        });
      } else if (el.matches('button[data-fz]')) {
        const zid = el.dataset.fz, nome = (atual.G.montagens[zid] || {}).nome || zid;
        if (el.dataset.fzCampo === 'tamanho') {
          const t = Number(el.dataset.valor);
          mudarZona(zid, nome + ': fans de ' + t + ' mm', (cfg) => {
            cfg.tamanho = t;
            cfg.vagas = cfg.vagas.map((f) => (f && CAT.fans[f] && CAT.fans[f].tamanho === t ? f : null));
          });
        } else {
          mudarZona(zid, nome + ': ' + (el.dataset.valor === 'saida' ? 'saída de ar' : 'entrada de ar'), (cfg) => { cfg.fluxo = el.dataset.valor; });
        }
      } else if (el.dataset.encher) {
        const zid = el.dataset.encher;
        const zona = atual.G.montagens[zid];
        const cfg0 = zonaCfg(zid, zona);
        const t = Number(cfg0.tamanho) || MONT.tamanhosDaZona(zona)[0];
        const fid = fanPadraoPara(t, zid);
        if (!fid) return;
        mudarZona(zid, zona.nome + ': vagas preenchidas', (cfg) => {
          cfg.tamanho = t;
          const n = MONT.vagasDaZona(zona, t);
          for (let i = 0; i < n; i++) if (!cfg.vagas[i]) cfg.vagas[i] = fid;
        });
      } else if (el.dataset.esvaziar) {
        const zid = el.dataset.esvaziar;
        mudarZona(zid, (atual.G.montagens[zid] || {}).nome + ': fans retirados', (cfg) => { cfg.vagas = []; });
      } else if (el.dataset.removerFan) {
        const [, zid, si] = el.dataset.removerFan.split(':');
        selecionar(null);
        mudarZona(zid, 'Fan removido de ' + ((atual.G.montagens[zid] || {}).nome || zid) + ' ' + (Number(si) + 1), (cfg) => { cfg.vagas[Number(si)] = null; });
      } else if (el.dataset.localizar) {
        selecionar(el.dataset.localizar);
        enquadrar(el.dataset.localizar);
      } else if (el.dataset.alternarOculta) {
        const id = el.dataset.alternarOculta;
        if (E.ocultas.has(id)) E.ocultas.delete(id); else E.ocultas.add(id);
        aplicarVisibilidade();
        renderAba();
      } else if (el.matches('[data-foto-ajustar]')) {
        editarFoto(el.dataset.slot, el.dataset.modelo, Number(el.dataset.prop), null);
      } else if (el.matches('[data-foto-remover]')) {
        const k = FOT.chave(el.dataset.slot, el.dataset.modelo);
        FOT.apagar(k);
        trocarFoto(k, null);
        toast('Foto removida; voltou ao desenho.');
      } else if (el.dataset.restaurar) {
        mudar('Medidas originais restauradas', () => { if (E.build.medidas) delete E.build.medidas[el.dataset.restaurar]; });
      } else if (el.id === 'b-copiar') {
        copiarJSON();
      } else if (el.id === 'b-baixar') {
        baixarJSON();
      } else if (el.id === 'b-carregar') {
        carregarTexto();
      } else if (el.id === 'b-restaurar') {
        E.sel = null;
        mudar('Montagem padrão restaurada', () => { E.build = clonar(PADRAO); });
        irVista('iso');
      } else if (el.id === 'b-salvar-como') {
        const inp = $('#nome-salva');
        const nome = (inp && inp.value.trim()) || (inp && inp.placeholder) || 'Minha montagem';
        const it = HIST.salvarComo(nome, E.build, miniatura(), { rgb: E.vis.rgb, rgbModo: E.vis.rgbModo });
        renderAba();
        toast(it ? '“' + it.nome + '” salva.' : 'Não deu para salvar (armazenamento do navegador cheio?).', { tipo: it ? '' : 'erro' });
      } else if (el.dataset.abrirSalva) {
        const it = HIST.lerSalvas().find((x) => x.id === el.dataset.abrirSalva);
        if (!it) return;
        E.sel = null;
        if (it.aparencia && it.aparencia.rgb) { E.vis.rgb = it.aparencia.rgb; E.vis.rgbModo = it.aparencia.rgbModo || 'fixo'; salvar(); }
        if (!mudar('Aberta: ' + it.nome, () => { E.build = normalizar(it.build); })) { reconstruir(); renderAba(); }
        atualizarRGB();
      } else if (el.dataset.substituirSalva) {
        const ok = HIST.atualizar(el.dataset.substituirSalva, E.build, miniatura(), { rgb: E.vis.rgb, rgbModo: E.vis.rgbModo });
        renderAba();
        toast(ok ? 'Montagem salva atualizada.' : 'Não deu para salvar.', { tipo: ok ? '' : 'erro' });
      } else if (el.dataset.apagarSalva) {
        if (el.dataset.confirmar !== '1') {
          el.dataset.confirmar = '1';
          el.textContent = 'Confirmar';
          setTimeout(() => { if (el.isConnected) { el.dataset.confirmar = ''; el.textContent = 'Apagar'; } }, 4000);
          return;
        }
        HIST.apagar(el.dataset.apagarSalva);
        renderAba();
        toast('Montagem apagada.');
      }
    });
  }

  /* ---------- menus do HUD ---------- */
  function fecharMenus(exceto) {
    for (const m of $$('details.menu[open]')) if (m !== exceto) m.open = false;
  }
  function alternarVis(k, valor) {
    E.vis[k] = valor == null ? !E.vis[k] : valor;
    salvar();
    if (k === 'ar' && E.vis.ar && atual && !atual.sim) criarSimulacao();
    aplicarVisibilidade();
  }
  function trocarAba(aba) {
    if (!aba || aba === E.aba) { renderAba(); return; }
    E.aba = aba;
    salvar();
    renderAba();
    $('#conteudo').scrollTop = 0;
    aplicarVisibilidade();
  }

  function ligarInterface() {
    ligarEditores($('#conteudo'));
    ligarEditores($('#ficha'));
    $('#conteudo').addEventListener('toggle', (e) => {
      const d = e.target;
      if (!d.matches) return;
      const id = d.matches('details.peca') ? d.dataset.secao : d.matches('details.fotos-reais') ? 'fotos:' + d.dataset.fotos : null;
      if (!id) return;
      if (d.open) E.abertas.add(id); else E.abertas.delete(id);
      salvar();
    }, true);

    $('.abas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-aba]');
      if (b) trocarAba(b.dataset.aba);
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
      if (ir) trocarAba(ir.dataset.irAba);
      if (e.target.closest('[data-fechar-ficha]')) selecionar(null);
      const enq = e.target.closest('[data-enquadrar]');
      if (enq) enquadrar(enq.dataset.enquadrar);
      const oc = e.target.closest('[data-ocultar]');
      if (oc) { E.ocultas.add(oc.dataset.ocultar); selecionar(null); aplicarVisibilidade(); if (E.aba === 'pecas') renderAba(); }
      const af = e.target.closest('[data-abrir-fotos]');
      if (af) {
        const sec = af.dataset.abrirFotos;
        E.abertas.add('fotos:' + sec);
        if (sec !== 'fans') E.abertas.add(sec);
        E.aba = '';
        trocarAba(sec === 'fans' ? 'fans' : 'pecas');
        const alvo = $('#conteudo details.fotos-reais[data-fotos="' + sec + '"]');
        if (alvo) {
          const cont = $('#conteudo');
          cont.scrollTop += alvo.getBoundingClientRect().top - cont.getBoundingClientRect().top - 12;
          alvo.classList.add('piscar');
          setTimeout(() => alvo.classList.remove('piscar'), 1600);
        }
      }
      const ed = e.target.closest('[data-editar-secao]');
      if (ed) { E.abertas.add(ed.dataset.editarSecao); trocarAba('pecas'); marcarNaLista(); }
      if (e.target.closest('#mostrar-tudo')) { E.ocultas.clear(); aplicarVisibilidade(); if (E.aba === 'pecas') renderAba(); }
      if (e.target.closest('[data-fechar-modal]') || e.target.classList.contains('modal')) for (const m of $$('.modal')) m.hidden = true;
      if (!e.target.closest('details.menu')) fecharMenus();
    });
    document.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[role="button"][data-ir-aba]')) { e.preventDefault(); trocarAba(e.target.dataset.irAba); }
    });
    for (const m of $$('details.menu')) m.addEventListener('toggle', () => { if (m.open) fecharMenus(m); });

    for (const b of $$('[data-vista]')) b.addEventListener('click', () => irVista(b.dataset.vista));
    for (const c of $$('input[data-vis]')) c.addEventListener('change', () => alternarVis(c.dataset.vis, c.checked));
    $('#explodir').addEventListener('input', (e) => { explodirAlvo = Number(e.target.value); });
    for (const b of $$('[data-rgb-modo]')) b.addEventListener('click', () => { E.vis.rgbModo = b.dataset.rgbModo; salvar(); atualizarRGB(); });
    const corRgb = (v) => { E.vis.rgb = v; if (E.vis.rgbModo === 'desligado' || E.vis.rgbModo === 'arco-iris') E.vis.rgbModo = 'fixo'; salvar(); atualizarRGB(); };
    $('#cor-rgb').addEventListener('input', (e) => corRgb(e.target.value));
    for (const b of $$('[data-cor]')) b.addEventListener('click', () => corRgb(b.dataset.cor));
    for (const b of $$('[data-qualidade]')) b.addEventListener('click', () => definirQualidade(b.dataset.qualidade));
    $('#medir').addEventListener('click', () => modoMedir(!E.medir.ativo));
    $('#fisica').addEventListener('click', () => modoFisica(!fis.ativo));
    $('#barra-fisica').addEventListener('click', (e) => {
      const b = e.target.closest('[data-fis]');
      if (!b || !fis.sim) return;
      const a = b.dataset.fis;
      if (a === 'soltar') fis.sim.soltarTudo();
      else if (a === 'chacoalhar') fis.sim.chacoalhar(1);
      else if (a === 'remontar') { fis.sim.remontar(); $('#fisica-inclinar').value = '0'; $('#fisica-angulo').textContent = '0°'; }
      else if (a === 'sair') encerrarFisica();
      textoFisica();
      precisaRender = true;
    });
    $('#fisica-inclinar').addEventListener('input', (e) => {
      const v = Number(e.target.value) || 0;
      $('#fisica-angulo').textContent = Math.abs(v) + '°' + (v < 0 ? ' vidro' : v > 0 ? ' direita' : '');
      if (fis.sim) fis.sim.inclinar(-v);
      precisaRender = true;
    });
    $('#medir-limpar').addEventListener('click', limparMedidas);
    $('#medir-sair').addEventListener('click', () => modoMedir(false));
    $('#capturar').addEventListener('click', capturar);
    $('#ajuda').addEventListener('click', () => { $('#modal-ajuda').hidden = false; });
    $('#modal-imagem-baixar').addEventListener('click', baixarImagem);
    $('#desfazer').addEventListener('click', desfazer);
    $('#refazer').addEventListener('click', refazer);

    document.addEventListener('keydown', teclado);

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', aplicarTema);
    new MutationObserver(aplicarTema).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function teclado(e) {
    const alvo = e.target;
    const digitando = alvo && (alvo.isContentEditable || (/^(INPUT|SELECT|TEXTAREA)$/.test(alvo.tagName) && !['checkbox', 'range', 'button', 'color', 'file'].includes(alvo.type)));
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      if (digitando) return;
      if (k === 'z') { e.preventDefault(); if (e.shiftKey) refazer(); else desfazer(); }
      else if (k === 'y') { e.preventDefault(); refazer(); }
      return;
    }
    if (e.key === 'Escape') {
      const aberto = $$('.modal').find((m) => !m.hidden);
      if (aberto) { aberto.hidden = true; return; }
      if ($$('details.menu[open]').length) { fecharMenus(); return; }
      if (E.medir.ativo) { modoMedir(false); return; }
      if (fis.ativo) { encerrarFisica(); return; }
      if (E.sel) selecionar(null);
      return;
    }
    if (digitando || e.altKey || $$('.modal').some((m) => !m.hidden)) return;
    const k = e.key;
    const vistas = { 1: 'iso', 2: 'vidro', 3: 'frente', 4: 'traseira', 5: 'topo' };
    const togg = { p: 'paineis', v: 'vidro', c: 'cotas', f: 'fluxo', a: 'ar', g: 'girar', n: 'vagas', o: 'soGabinete', k: 'contatos' };
    if (vistas[k]) irVista(vistas[k]);
    else if (togg[k.toLowerCase()] && !e.shiftKey) alternarVis(togg[k.toLowerCase()]);
    else if (k === 'm' || k === 'M') modoMedir(!E.medir.ativo);
    else if (k === 'x' || k === 'X') modoFisica(!fis.ativo);
    else if (k === 'e' || k === 'E') { explodirAlvo = explodirAlvo > 0.5 ? 0 : 1; $('#explodir').value = String(explodirAlvo); }
    else if (k === 'h' && E.sel && E.sel !== 'gabinete') { E.ocultas.add(E.sel); selecionar(null); aplicarVisibilidade(); if (E.aba === 'pecas') renderAba(); }
    else if (k === 'H') { E.ocultas.clear(); aplicarVisibilidade(); if (E.aba === 'pecas') renderAba(); }
    else if ((k === 'Delete' || k === 'Backspace') && E.sel && E.sel.startsWith('fan:')) {
      e.preventDefault();
      const [, zid, si] = E.sel.split(':');
      selecionar(null);
      mudarZona(zid, 'Fan removido de ' + ((atual.G.montagens[zid] || {}).nome || zid) + ' ' + (Number(si) + 1), (cfg) => { cfg.vagas[Number(si)] = null; });
    } else if (k === 'q' || k === 'Q') {
      const ordem = ['leve', 'alta', 'ultra'];
      const q = ordem[(ordem.indexOf(E.vis.qualidade) + 1) % ordem.length];
      definirQualidade(q);
      toast('Qualidade: ' + AMB.QUALIDADES[q].rotulo);
    } else if (k === 'i' || k === 'I') capturar();
    else if (k === '?') $('#modal-ajuda').hidden = false;
  }

  /* ---------- arquivo JSON, imagem ---------- */
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
    E.sel = null;
    mudar('Montagem carregada do arquivo', () => { E.build = normalizar(obj); });
    msgJSON('Montagem carregada.');
  }

  function renderizarAgora() {
    if (composer) composer.render(); else renderer.render(cena, camera);
  }
  function miniatura() {
    try {
      renderizarAgora();
      const src = renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 224; c.height = 140;
      const g = c.getContext('2d');
      const r = Math.max(224 / src.width, 140 / src.height);
      const w = src.width * r, h = src.height * r;
      g.drawImage(src, (224 - w) / 2, (140 - h) / 2, w, h);
      return c.toDataURL('image/jpeg', 0.72);
    } catch (e) { return null; }
  }
  let imagemAtual = null;
  function capturar() {
    renderizarAgora();
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
    ({ THREE, OrbitControls, CSS2DRenderer, CSS2DObject } = deps);
    D = deps;
    M = window.PCBModelos(THREE);
    MONT = window.PCBMontagem(THREE, M);
    VER = window.PCBVerificacao();
    AMB = window.PCBAmbiente(THREE, deps);
    SIM = window.PCBAr ? window.PCBAr(THREE) : null;
    HIST = window.PCBHistorico();
    FOT = window.PCBFotos();
    let primeiraVez = true;
    try { primeiraVez = !localStorage.getItem(CHAVE); } catch (e) { /* sem armazenamento */ }
    const est = carregarEstado();
    E.build = est.build;
    E.vis = est.vis;
    E.aba = ['pecas', 'fans', 'checagem', 'salvas', 'medidas'].includes(est.aba) ? est.aba : 'pecas';
    if (est.abertas) E.abertas = new Set(est.abertas);
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
    atualizarBotoesHist();
    atualizarRGB();
    irVista('iso', true);
    carregarFotos();
    $('#carregando').hidden = true;
    requestAnimationFrame(animar);
    if (primeiraVez) setTimeout(() => toast('Dica: clique numa peça para trocar ou ajustar. Aperte ? para ver os atalhos.', { duracao: 9000 }), 1200);
  }

  function falha(err) {
    console.error(err);
    mostrarFalha('Não consegui carregar o Three.js. Esta página precisa de internet para baixar o motor 3D (cdn.jsdelivr.net). Detalhe: ' + (err && err.message ? err.message : err));
  }

  setTimeout(() => {
    if (!iniciou && document.getElementById('carregando')) $('#carregando-texto').textContent = 'Ainda carregando o motor 3D… Se demorar, confira a conexão com a internet.';
  }, 9000);

  /* Números de desempenho (para testes e para quem quiser conferir no console). */
  function diagnostico() {
    if (!renderer) return null;
    const i = renderer.info;
    const media = fps.amostras.length ? fps.amostras.reduce((a, b) => a + b, 0) / fps.amostras.length : 0;
    return {
      qualidade: E.vis.qualidade, chamadas: i.render.calls, triangulos: i.render.triangles, geometrias: i.memory.geometries, texturas: i.memory.textures,
      programas: i.programs ? i.programs.length : null, qps: media ? Math.round(1 / media) : null, luzesRGB: atual && atual.rgbFx ? atual.rgbFx.luzes.length : 0,
      particulas: !!(atual && atual.sim), pecas: atual ? atual.partes.length : 0
    };
  }

  /* Posição na tela (px da janela) do centro de uma peça — usado nos testes automáticos. */
  function naTela(id) {
    const p = atual && atual.partes.find((x) => x.id === id);
    if (!p || !p.obj) return null;
    const c = new THREE.Box3().setFromObject(p.obj).getCenter(new THREE.Vector3()).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (c.x + 1) / 2 * r.width, y: r.top + (1 - c.y) / 2 * r.height };
  }

  return { iniciar, falha, diagnostico, naTela, vista: (d) => irVista(d, true) };
})();
