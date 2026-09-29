/*
 * Modelos 3D das peças (Three.js). Unidade: 1 = 1 mm.
 * Cada função devolve um THREE.Group no sistema LOCAL da peça
 * (descrito no comentário de cada função). Quem posiciona é o montagem.js.
 *
 * Cada grupo leva em userData.colisores uma lista de THREE.Box3 (no
 * sistema local) usada na checagem de colisão.
 */
window.PCBModelos = function (THREE) {
  'use strict';

  /* ---------------- materiais e texturas (com cache) ---------------- */
  const cacheMat = new Map();
  const cacheTex = new Map();

  function std(color, rough = 0.5, metal = 0.1, extra) {
    const key = ['std', color, rough, metal, extra ? JSON.stringify(extra) : ''].join('|');
    let m = cacheMat.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: rough, metalness: metal }, extra || {}));
      m.userData.cacheado = true;
      cacheMat.set(key, m);
    }
    return m;
  }

  function luz(color, intensidade = 2.2) {
    return std(color, 0.35, 0, { emissive: color, emissiveIntensity: intensidade });
  }

  function vidro(tint = '#a7b3bd') {
    const key = 'vidro|' + tint;
    let m = cacheMat.get(key);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({
        color: tint, transparent: true, opacity: 0.13, roughness: 0.03, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4
      });
      m.userData.tipo = 'vidro';
      m.userData.cacheado = true;
      cacheMat.set(key, m);
    }
    return m;
  }

  function canvasTex(key, w, h, desenhar, { cor = false, repetir = false } = {}) {
    let t = cacheTex.get(key);
    if (t) return t;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    desenhar(c.getContext('2d'), w, h);
    t = new THREE.CanvasTexture(c);
    if (cor) t.colorSpace = THREE.SRGBColorSpace;
    if (repetir) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    cacheTex.set(key, t);
    return t;
  }

  /* Chapa perfurada: branco = metal, preto = furo (usado como alphaMap). */
  function texturaFuros() {
    return canvasTex('furos', 60, 52, (g, w, h) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#000';
      const r = 10.5;
      const pts = [[0, 0], [30, 0], [60, 0], [15, 26], [45, 26], [0, 52], [30, 52], [60, 52]];
      for (const [x, y] of pts) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    }, { repetir: true });
  }

  /* Material de tela/chapa perfurada com a repetição certa para o tamanho (mm). */
  function tela(color, larguraMM, alturaMM, passo = 6, rough = 0.6) {
    const rx = Math.max(1, Math.round(larguraMM / passo));
    const ry = Math.max(1, Math.round(alturaMM / (passo * 0.866)));
    const key = ['tela', color, rx, ry, rough].join('|');
    let m = cacheMat.get(key);
    if (!m) {
      const t = texturaFuros().clone();
      t.needsUpdate = true;
      t.repeat.set(rx, ry);
      m = new THREE.MeshStandardMaterial({
        color, roughness: rough, metalness: 0.45, alphaMap: t, transparent: true,
        depthWrite: false, side: THREE.DoubleSide
      });
      m.userData.tipo = 'tela';
      m.userData.cacheado = true;
      cacheMat.set(key, m);
    }
    return m;
  }

  function texturaAletas() {
    return canvasTex('aletas', 64, 8, (g, w, h) => {
      g.fillStyle = '#3a3e44'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#16181b';
      for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1.6, h);
    }, { cor: true, repetir: true });
  }

  function materialAletasRad(comprimento, cor) {
    const key = 'aletasRad|' + Math.round(comprimento) + '|' + cor;
    let m = cacheMat.get(key);
    if (!m) {
      const t = texturaAletas().clone();
      t.needsUpdate = true;
      t.repeat.set(Math.round(comprimento / 4), 1);
      m = new THREE.MeshStandardMaterial({ map: t, color: cor, roughness: 0.55, metalness: 0.5 });
      m.userData.cacheado = true;
      cacheMat.set(key, m);
    }
    return m;
  }

  function texturaEtiqueta(linhas, fundo = '#15171a', frente = '#e9ecef') {
    const key = 'etq|' + linhas.join('/') + fundo + frente;
    return canvasTex(key, 512, 256, (g, w, h) => {
      g.fillStyle = fundo; g.fillRect(0, 0, w, h);
      g.fillStyle = frente;
      g.textBaseline = 'middle';
      g.font = '600 54px "Archivo", "Helvetica Neue", Arial, sans-serif';
      g.fillText(linhas[0] || '', 36, h * 0.38);
      g.font = '500 34px "IBM Plex Mono", Menlo, monospace';
      g.globalAlpha = 0.75;
      g.fillText(linhas[1] || '', 38, h * 0.7);
    }, { cor: true });
  }

  /* ---------------- geometria básica ---------------- */
  function caixa(x0, x1, y0, y1, z0, z1, mat, lista) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0) || 0.01, Math.abs(y1 - y0) || 0.01, Math.abs(z1 - z0) || 0.01);
    const m = new THREE.Mesh(g, mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    if (lista) lista.push(new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1))));
    return m;
  }

  function box3(x0, x1, y0, y1, z0, z1) {
    return new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)),
      new THREE.Vector3(Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)));
  }

  function retArredondado(w, h, r, cx = 0, cy = 0, forma) {
    const s = forma || new THREE.Shape();
    const x = cx - w / 2, y = cy - h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y);
    s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h);
    s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r);
    s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }

  function furoRet(x0, y0, x1, y1, r = 0) {
    return retArredondado(Math.abs(x1 - x0), Math.abs(y1 - y0), r, (x0 + x1) / 2, (y0 + y1) / 2, new THREE.Path());
  }

  function furoCirculo(cx, cy, r) {
    const p = new THREE.Path();
    p.absarc(cx, cy, r, 0, Math.PI * 2, false);
    return p;
  }

  function extrudar(forma, profundidade, mat, bevel = 0) {
    const geo = new THREE.ExtrudeGeometry(forma, {
      depth: profundidade, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel,
      bevelSegments: 2, curveSegments: 20
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  function cilindro(r, comp, mat, seg = 24) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, comp, seg), mat);
    m.castShadow = true;
    return m;
  }

  /* Seta de fluxo de ar ao longo de +Z local, começando em z0. */
  function seta(comp, cor, z0 = 0, raio = 3) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.85, depthWrite: false });
    const haste = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, comp * 0.72, 12), mat);
    haste.rotation.x = Math.PI / 2;
    haste.position.z = z0 + comp * 0.36;
    const ponta = new THREE.Mesh(new THREE.ConeGeometry(raio * 3, comp * 0.28, 16), mat);
    ponta.rotation.x = Math.PI / 2;
    ponta.position.z = z0 + comp * 0.86;
    g.add(haste, ponta);
    g.userData.fluxo = true;
    g.renderOrder = 10;
    return g;
  }

  /* ---------------- FAN ----------------
   * Local: centro do fan na origem do plano XY; corpo de z=0 a z=espessura.
   * O ar sai na direção +Z (lado dos braços do motor).                 */
  function geometriaPa(r0, r1, n) {
    const forma = new THREE.Shape();
    const vao = (2 * Math.PI / n) * 0.8;
    const w0 = vao * 0.45, w1 = vao * 0.85, varre = vao * 0.5;
    const passos = 10;
    const bordaA = [], bordaB = [];
    for (let i = 0; i <= passos; i++) {
      const u = i / passos;
      const r = r0 + (r1 - r0) * u;
      const c = varre * (u - 0.5);
      const w = w0 + (w1 - w0) * u;
      bordaA.push([r * Math.cos(c + w / 2), r * Math.sin(c + w / 2)]);
      bordaB.push([r * Math.cos(c - w / 2), r * Math.sin(c - w / 2)]);
    }
    forma.moveTo(bordaA[0][0], bordaA[0][1]);
    for (const p of bordaA.slice(1)) forma.lineTo(p[0], p[1]);
    for (const p of bordaB.reverse()) forma.lineTo(p[0], p[1]);
    const geo = new THREE.ExtrudeGeometry(forma, { depth: 1.1, bevelEnabled: false, curveSegments: 4 });
    geo.translate(0, 0, -0.55);
    geo.rotateX(0.32);
    return geo;
  }

  function fan(spec, { rgb = '#7cc8ff', setaCor = null } = {}) {
    const s = spec.tamanho, t = spec.espessura;
    const g = new THREE.Group();
    const matQuadro = std(spec.cor, 0.55, 0.05);
    const matPas = std(spec.corPas || spec.cor, 0.5, 0.02);

    const forma = retArredondado(s, s, s * 0.06);
    forma.holes.push(furoCirculo(0, 0, s * 0.475));
    const meia = { 120: 52.5, 140: 62.25, 160: 70 }[s] || s * 0.4375;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) forma.holes.push(furoCirculo(sx * meia, sy * meia, 2.3));
    g.add(extrudar(forma, t, matQuadro));

    // braços do motor no lado de saída do ar
    for (let i = 0; i < 4; i++) {
      const piv = new THREE.Group();
      piv.rotation.z = Math.PI / 4 + i * Math.PI / 2;
      piv.add(caixa(-1.6, 1.6, s * 0.19, s * 0.48, t - 3, t, matQuadro));
      g.add(piv);
    }
    const motor = cilindro(s * 0.19, 3, matQuadro, 32);
    motor.rotation.x = Math.PI / 2;
    motor.position.z = t - 1.5;
    g.add(motor);

    // rotor (gira)
    const rotor = new THREE.Group();
    rotor.position.z = t * 0.46;
    const cubo = cilindro(s * 0.185, t * 0.7, matPas, 32);
    cubo.rotation.x = Math.PI / 2;
    rotor.add(cubo);
    const tampa = cilindro(s * 0.15, 0.6, std(spec.cor, 0.3, 0.4), 32);
    tampa.rotation.x = Math.PI / 2;
    tampa.position.z = -t * 0.35 - 0.3;
    rotor.add(tampa);
    const geoPa = geometriaPa(s * 0.18, s * 0.465, spec.pas || 7);
    for (let i = 0; i < (spec.pas || 7); i++) {
      const pa = new THREE.Mesh(geoPa, matPas);
      pa.rotation.z = i * 2 * Math.PI / (spec.pas || 7);
      pa.castShadow = true;
      rotor.add(pa);
    }
    g.add(rotor);
    g.userData.rotor = rotor;

    if (spec.rgb) {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(s * 0.476, 1.3, 8, 64), luz(rgb, 2.4));
      anel.position.z = 1.2;
      anel.userData.rgb = true;
      g.add(anel);
      const anel2 = anel.clone();
      anel2.position.z = t - 1.2;
      g.add(anel2);
    }
    if (setaCor) {
      const st = seta(Math.max(70, s * 0.6), setaCor, t * 0.3);
      g.add(st);
    }
    g.userData.colisores = [box3(-s / 2, s / 2, -s / 2, s / 2, 0, t)];
    return g;
  }

  /* ---------------- RADIADOR ----------------
   * Local: centrado na origem. X = comprimento (portas em +X),
   * Y = largura, Z = espessura.                                         */
  function radiador(spec, cor, tamanhoFan) {
    const L = spec.comprimento, W = spec.largura, T = spec.espessura;
    const g = new THREE.Group();
    const n = Math.max(1, Math.floor(L / tamanhoFan));
    const nucleo = Math.min(L - 20, n * tamanhoFan);
    const tanque = (L - nucleo) / 2;
    const matCor = std(cor, 0.4, 0.2);
    g.add(caixa(-nucleo / 2, nucleo / 2, -W / 2 + 3, W / 2 - 3, -T / 2 + 1.5, T / 2 - 1.5, materialAletasRad(nucleo, '#ffffff')));
    g.add(caixa(-L / 2, L / 2, W / 2 - 3, W / 2, -T / 2, T / 2, matCor));
    g.add(caixa(-L / 2, L / 2, -W / 2, -W / 2 + 3, -T / 2, T / 2, matCor));
    g.add(caixa(-L / 2, -L / 2 + tanque, -W / 2, W / 2, -T / 2, T / 2, matCor));
    g.add(caixa(L / 2 - tanque, L / 2, -W / 2, W / 2, -T / 2, T / 2, matCor));
    const portas = [];
    for (const y of [-17, 17]) {
      const p = cilindro(5.5, 14, std('#2a2c30', 0.4, 0.6), 16);
      p.rotation.z = Math.PI / 2;
      p.position.set(L / 2 + 7, y, 0);
      g.add(p);
      portas.push({ pos: new THREE.Vector3(L / 2 + 13, y, 0), dir: new THREE.Vector3(1, 0, 0) });
    }
    g.userData.portas = portas;
    g.userData.colisores = [box3(-L / 2, L / 2 + 14, -W / 2, W / 2, -T / 2, T / 2)];
    return g;
  }

  /* ---------------- BOMBA (bloco do watercooler) ----------------
   * Local: centrada em XY sobre a CPU; Z sobe a partir do topo da CPU.  */
  function bomba(spec, cor, rgb) {
    const w = spec.largura, d = spec.profundidade, h = spec.altura;
    const g = new THREE.Group();
    g.add(caixa(-w * 0.34, w * 0.34, -d * 0.34, d * 0.34, 0, 4, std('#b87333', 0.3, 0.9)));
    const corpo = extrudar(retArredondado(w, d, w * 0.2), h - 10, std(cor, 0.35, 0.15));
    corpo.position.z = 4;
    g.add(corpo);
    const tampa = extrudar(retArredondado(w * 0.9, d * 0.9, w * 0.17), 6, std('#16181b', 0.15, 0.5));
    tampa.position.z = h - 6;
    g.add(tampa);
    if (spec.tela) {
      const tex = texturaEtiqueta(['38 °C', 'CPU'], '#07121f', '#9fd3ff');
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, d * 0.7), new THREE.MeshBasicMaterial({ map: tex }));
      tela.position.z = h + 0.1;
      g.add(tela);
    } else {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(w * 0.3, 1.6, 8, 48), luz(rgb, 2.6));
      anel.position.z = h + 0.2;
      anel.userData.rgb = true;
      g.add(anel);
      const logo = cilindro(w * 0.12, 0.6, std('#d9dde2', 0.2, 0.9), 32);
      logo.rotation.x = Math.PI / 2;
      logo.position.z = h + 0.3;
      g.add(logo);
    }
    const portas = [];
    for (const y of [-12, 12]) {
      const p = cilindro(5, 14, std('#2a2c30', 0.4, 0.6), 16);
      p.rotation.z = Math.PI / 2;
      p.position.set(w / 2 + 5, y, h * 0.62);
      g.add(p);
      portas.push({ pos: new THREE.Vector3(w / 2 + 12, y, h * 0.62), dir: new THREE.Vector3(1, 0, 0) });
    }
    g.userData.portas = portas;
    g.userData.colisores = [box3(-w / 2, w / 2, -d / 2, d / 2, 0, h), box3(w / 2, w / 2 + 12, -18, 18, h * 0.62 - 6, h * 0.62 + 6)];
    return g;
  }

  /* ---------------- PLACA-MÃE ----------------
   * Local: origem no canto traseiro-superior da face dos componentes.
   * +X = da borda traseira para a frente; placa ocupa y de -altura a 0;
   * +Z = para fora da face dos componentes. PCB em z de -espessura a 0.  */
  function placaMae(spec) {
    const W = spec.largura, H = spec.altura, t = spec.espessura;
    const g = new THREE.Group();
    const col = [];
    const pcb = std(spec.corPCB, 0.62, 0.05);
    const arm = std(spec.corArmadura, 0.32, 0.25);
    const det = std(spec.corDetalhe, 0.28, 0.85);
    const preto = std('#17181b', 0.6, 0.1);
    const slot = std('#2a2c30', 0.5, 0.1);
    const b = (x0, x1, y0, y1, z0, z1, m) => g.add(caixa(x0, x1, -y1, -y0, z0, z1, m, col));

    b(0, W, 0, H, -t, 0, pcb);
    const s = spec.soquete;
    const y1 = (spec.pcie && spec.pcie[0]) ? spec.pcie[0].y : H;
    b(-6, 22, 4, Math.min(y1 - 14, H - 4), 0.2, 40, std('#2b2e33', 0.4, 0.6));
    b(0, 44, 2, Math.min(y1 - 22, H - 10), 0, 38, arm);
    b(2, 42, 60, 64, 38, 38.6, det);
    b(44, Math.min(s.x + 32, W - 30), 3, 30, 0, 26, arm);
    b(46, 66, 32, Math.min(s.y + 46, H - 10), 0, 24, arm);
    b(s.x - 37, s.x + 37, s.y - 42, s.y + 42, 0, 5, det);
    b(s.x - 20, s.x + 20, s.y - 20, s.y + 20, 5, 9, std('#c9ccd1', 0.25, 0.9));
    const d = spec.dimm;
    for (const x of d.x) {
      b(x - 3, x + 3, d.y - 71, d.y + 71, 0, 7, slot);
      b(x - 3.5, x + 3.5, d.y - 77, d.y - 71, 0, 9, det);
      b(x - 3.5, x + 3.5, d.y + 71, d.y + 77, 0, 9, det);
    }
    b(18, 36, 3, 13, 0, 13, preto);
    b(W - 11, W - 1, H * 0.3, H * 0.3 + 52, 0, 16, preto);
    const pcie = spec.pcie || [];
    pcie.forEach((p, i) => {
      b(p.x, p.x + 89, p.y - 3.8, p.y + 3.8, 0, 11, p.reforcado ? det : slot);
      b(p.x + 89, p.x + 96, p.y - 3.8, p.y + 3.8, 0, 11, preto);
      const prox = pcie[i + 1];
      const topoM2 = i === 0 ? s.y + 46 : null;
      if (topoM2 !== null && p.y - 6 - topoM2 >= 12) b(56, 150, topoM2, p.y - 6, 0, 8, arm);
      if (prox && prox.y - p.y > 30) b(56, 150, p.y + 8, prox.y - 8, 0, 8, arm);
    });
    if (H > 200 && pcie.length) {
      const y0 = pcie[0].y + 6;
      b(W * 0.66, W - 14, y0, Math.min(H - 16, y0 + 64), 0, 10, arm);
      b(W * 0.66 + 4, W - 18, y0 + 28, y0 + 31, 10, 10.6, det);
      b(W - 10, W, H - 62, H - 30, 0, 12, preto);
    }
    b(40, W - 40, H - 8, H - 3, 0, 8, preto);
    for (const [hx, hy] of [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8], [W * 0.55, 8], [W * 0.55, H - 8]]) {
      const f = cilindro(3.2, 0.4, std('#c9ccd1', 0.3, 0.9), 16);
      f.rotation.x = Math.PI / 2;
      f.position.set(hx, -hy, 0.2);
      g.add(f);
    }
    g.userData.colisores = col;
    return g;
  }

  /* ---------------- MEMÓRIA ----------------
   * Local: origem no centro da borda inferior (a que encaixa no slot).
   * +Y = altura, Z = comprimento, X = espessura.                        */
  function memoria(spec, rgb) {
    const L = spec.comprimento, H = spec.altura, T = spec.espessura;
    const g = new THREE.Group();
    g.add(caixa(-0.65, 0.65, 0, 8, -L / 2 + 1, L / 2 - 1, std('#12301f', 0.6, 0.1)));
    const topo = spec.rgb ? H - 7 : H;
    g.add(caixa(-T / 2, T / 2, 5, topo, -L / 2 + 1.5, L / 2 - 1.5, std(spec.cor, 0.42, 0.45)));
    g.add(caixa(-T / 2 - 0.2, T / 2 + 0.2, topo - 9, topo - 6, -L / 2 + 10, L / 2 - 10, std('#9aa1ab', 0.3, 0.85)));
    if (spec.rgb) {
      const m = luz(rgb, 1.6);
      const barra = caixa(-T / 2 + 0.5, T / 2 - 0.5, H - 7, H, -L / 2 + 3, L / 2 - 3, m);
      barra.userData.rgb = true;
      g.add(barra);
    }
    g.userData.colisores = [box3(-T / 2, T / 2, 0, H, -L / 2, L / 2)];
    return g;
  }

  /* ---------------- FONTE ----------------
   * Local: X = largura (centrada), Y = altura (centrada, ventoinha em +Y),
   * Z = comprimento (z=0 é a face da tomada AC; z=L é a face modular).  */
  function fonte(spec) {
    const W = spec.largura, H = spec.altura, L = spec.comprimento;
    const g = new THREE.Group();
    const corpo = std(spec.cor, 0.5, 0.35);
    g.add(caixa(-W / 2, W / 2, -H / 2, H / 2, 0, L, corpo));
    const r = Math.min(W, L) * 0.44;
    const disco = cilindro(r, 0.6, std('#0b0c0d', 0.8, 0), 48);
    disco.position.set(0, H / 2 + 0.2, L / 2);
    g.add(disco);
    const grade = std('#2a2c30', 0.35, 0.8);
    for (let i = 1; i <= 5; i++) {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(r * i / 5, 0.7, 6, 48), grade);
      anel.rotation.x = Math.PI / 2;
      anel.position.set(0, H / 2 + 0.8, L / 2);
      g.add(anel);
    }
    g.add(caixa(-r, r, H / 2 + 0.3, H / 2 + 1.3, L / 2 - 0.7, L / 2 + 0.7, grade));
    g.add(caixa(-0.7, 0.7, H / 2 + 0.3, H / 2 + 1.3, L / 2 - r, L / 2 + r, grade));

    const favo = new THREE.Mesh(new THREE.PlaneGeometry(W - 20, H - 16), tela('#0f1012', W - 20, H - 16, 5));
    favo.position.set(-12, 0, -0.3);
    favo.rotation.y = Math.PI;
    g.add(favo);
    g.add(caixa(W / 2 - 46, W / 2 - 16, -H / 2 + 8, -H / 2 + 32, -4, 0, std('#0b0c0d', 0.7, 0)));
    g.add(caixa(W / 2 - 58, W / 2 - 50, -H / 2 + 12, -H / 2 + 28, -3, 0, std('#0b0c0d', 0.5, 0)));

    const con = std('#0d0e10', 0.7, 0);
    const conectores = (face) => {
      for (let lin = 0; lin < 3; lin++) {
        for (let col = 0; col < 5; col++) {
          const a = -W / 2 + 18 + col * 24, bb = -H / 2 + 14 + lin * 22;
          if (face === 'fundo') g.add(caixa(a, a + 18, bb, bb + 12, L, L + 2, con));
          else g.add(caixa(-W / 2 - 2, -W / 2, bb, bb + 12, 20 + col * 26, 38 + col * 26, con));
        }
      }
    };
    conectores(spec.conectoresNaLateral ? 'lateral' : 'fundo');

    const et = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(L - 20, 130), H - 30),
      new THREE.MeshStandardMaterial({ map: texturaEtiqueta([spec.nome.split(' ')[0].toUpperCase(), spec.potencia + ' W']), roughness: 0.6 }));
    et.rotation.y = Math.PI / 2;
    et.position.set(W / 2 + 0.3, 0, L / 2);
    g.add(et);
    const et2 = et.clone();
    et2.rotation.y = -Math.PI / 2;
    et2.position.x = -W / 2 - 0.3;
    if (!spec.conectoresNaLateral) g.add(et2);

    g.userData.colisores = [box3(-W / 2, W / 2, -H / 2, H / 2, 0, L)];
    return g;
  }

  /* ---------------- PLACA DE VÍDEO ----------------
   * Local: X = comprimento (x=0 no suporte/bracket), Y = altura
   * (y=0 na ponta dos contatos PCIe), Z = espessura (z=0 na backplate,
   * crescendo para o lado dos fans).                                    */
  function placaDeVideo(spec, cfg, fanSpec, rgb) {
    const g = new THREE.Group();
    const col = [];
    const deshroud = cfg.modo === 'deshroud';
    const L = deshroud ? spec.deshroud.comprimento : spec.comprimento;
    const Hc = deshroud ? spec.deshroud.altura : spec.altura;
    const Tc = deshroud ? spec.deshroud.espessura : spec.espessura;
    const y0 = 9;
    const bp = std(spec.corBackplate, 0.42, 0.6);
    const dx = cfg.dedosX;

    g.add(caixa(0, L, y0, Hc, 0, 2.5, bp, col));
    g.add(caixa(0, Math.min(L * 0.72, 250), y0, Math.min(Hc - 4, 124), 2.5, 4.1, std('#101512', 0.6, 0.1)));
    const dedos = caixa(dx, dx + 89, 0, y0, 2.7, 3.9, std('#c9a54b', 0.3, 0.9));
    g.add(dedos);
    const larg = spec.slots * 20.32;
    g.add(caixa(-1.6, 0, 2, 121, -3, larg - 3, std('#8d939b', 0.35, 0.85), col));
    for (let i = 0; i < 4; i++) g.add(caixa(-2.6, -1.6, 14 + i * 24, 30 + i * 24, 8, 20, std('#0b0c0d', 0.6, 0.1)));
    g.add(caixa(L * 0.55, L * 0.55 + 20, Hc - 2, Hc + 6, 4, 14, std('#0d0e10', 0.6, 0)));

    let espessuraTotal = Tc;
    if (deshroud) {
      const z0 = 4.1;
      g.add(caixa(10, L * 0.62, y0 + 8, Hc - 8, z0, z0 + 5, std('#c6c9ce', 0.3, 0.9)));
      const passo = 2.1;
      const n = Math.floor((L - 4) / passo);
      const finGeo = new THREE.BoxGeometry(0.4, Hc - y0 - 3, Tc - z0 - 5);
      const fins = new THREE.InstancedMesh(finGeo, std('#c3c8ce', 0.32, 0.85), n);
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        mtx.makeTranslation(2 + i * passo, (y0 + Hc) / 2, (z0 + 5 + Tc) / 2);
        fins.setMatrixAt(i, mtx);
      }
      fins.castShadow = true;
      fins.receiveShadow = true;
      g.add(fins);
      col.push(box3(0, L, y0, Hc, 0, Tc));
      const cobre = std('#b87333', 0.3, 0.9);
      for (let i = 0; i < 5; i++) {
        const hp = cilindro(3, L - 16, cobre, 12);
        hp.rotation.z = Math.PI / 2;
        hp.position.set(L / 2, y0 + 16 + i * ((Hc - y0 - 32) / 4), Tc - 3);
        g.add(hp);
      }
      g.add(caixa(0, L, y0, y0 + 2, z0, Tc, std('#9aa0a8', 0.35, 0.85)));
      g.add(caixa(0, L, Hc - 2, Hc, z0, Tc, std('#9aa0a8', 0.35, 0.85)));

      const f = cfg.fans;
      const s = fanSpec.tamanho, ft = fanSpec.espessura;
      const q = Math.max(0, f.quantidade | 0);
      const total = q * s + Math.max(0, q - 1) * f.espacamento;
      const xi = L / 2 - total / 2 + (f.deslocamento || 0);
      const cy = (y0 + Hc) / 2;
      const amarra = std('#0c0d0f', 0.7, 0);
      for (let i = 0; i < q; i++) {
        const cx = xi + s / 2 + i * (s + f.espacamento);
        const fm = fan(fanSpec, { rgb, setaCor: '#4aa3ff' });
        fm.rotation.x = Math.PI;
        fm.position.set(cx, cy, Tc + ft);
        g.add(fm);
        col.push(box3(cx - s / 2, cx + s / 2, cy - s / 2, cy + s / 2, Tc, Tc + ft));
        const yMin = Math.min(y0, cy - s / 2) - 1.2, yMax = Math.max(Hc, cy + s / 2) + 1.2, zTop = Tc + ft;
        for (const ox of [-s * 0.36, s * 0.36]) {
          const x = cx + ox;
          g.add(caixa(x - 2.3, x + 2.3, yMax - 1.2, yMax, -1.2, zTop + 1.2, amarra));
          g.add(caixa(x - 2.3, x + 2.3, yMin, yMin + 1.2, -1.2, zTop + 1.2, amarra));
          g.add(caixa(x - 2.3, x + 2.3, yMin, yMax, -1.2, 0, amarra));
          g.add(caixa(x - 2.3, x + 2.3, yMin, yMax, zTop, zTop + 1.2, amarra));
          g.add(caixa(x - 3.2, x + 3.2, yMax, yMax + 4, zTop - 6, zTop + 1.2, amarra));
        }
      }
      if (q > 0) espessuraTotal = Tc + fanSpec.espessura;
      g.userData.fansGPU = q;
    } else {
      const corpo = std(spec.cor, 0.45, 0.35);
      const tampaZ = Tc - 2;
      g.add(caixa(0, L, y0, Hc, 4.1, tampaZ - 16, corpo, col));
      const rf = Math.min((Hc - y0) * 0.42, (L - 20) / 6.2);
      const forma = retArredondado(L, Hc - y0, 6, L / 2, (y0 + Hc) / 2);
      const centros = [L * 0.2, L * 0.5, L * 0.8];
      for (const cx of centros) forma.holes.push(furoCirculo(cx, (y0 + Hc) / 2, rf));
      const tampa = extrudar(forma, 2, corpo);
      tampa.position.z = tampaZ;
      g.add(tampa);
      g.add(caixa(0, L, y0, y0 + 3, tampaZ - 16, tampaZ, corpo));
      g.add(caixa(0, L, Hc - 3, Hc, tampaZ - 16, tampaZ, corpo));
      g.add(caixa(0, L, Hc - 6, Hc - 3, tampaZ - 1, tampaZ + 2.4, std('#b9bec6', 0.25, 0.9)));
      col.push(box3(0, L, y0, Hc, 0, Tc));
      const fanOrig = { tamanho: rf * 2 + 4, espessura: 14, cor: '#15161a', corPas: '#1c1d21', rgb: false, pas: 11 };
      for (const cx of centros) {
        const fm = fan(fanOrig, { setaCor: '#4aa3ff' });
        fm.children[0].visible = false;
        fm.rotation.x = Math.PI;
        fm.position.set(cx, (y0 + Hc) / 2, tampaZ);
        g.add(fm);
      }
      g.userData.fansGPU = 3;
    }
    g.userData.colisores = col;
    g.userData.medidas = { comprimento: L, altura: Hc, espessura: espessuraTotal, dedos: [dx, dx + 89] };
    return g;
  }

  /* ---------------- RISER (cabo flat) ----------------
   * pontos: lista de Vector3 (mundo); largura ao longo de `eixoLargura`. */
  function riser(pontos, eixoLargura, largura) {
    const curva = new THREE.CatmullRomCurve3(pontos, false, 'centripetal');
    const n = 60;
    const pos = [];
    const idx = [];
    const meia = eixoLargura.clone().multiplyScalar(largura / 2);
    for (let i = 0; i <= n; i++) {
      const p = curva.getPoint(i / n);
      const a = p.clone().add(meia), b = p.clone().sub(meia);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (i < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#1b1c20', roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide }));
    m.castShadow = true;
    return m;
  }

  function tubo(pontos, raio, cor) {
    const curva = new THREE.CatmullRomCurve3(pontos, false, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(curva, 80, raio, 14, false), std(cor, 0.62, 0.02));
    m.castShadow = true;
    return m;
  }

  /* ---------------- GABINETE ----------------
   * Construído direto em coordenadas do MUNDO usando o quadro Q
   * (ver montagem.js). Devolve { grupo, paineis: [{obj, dir, nome, tipo}] }. */
  function gabinete(spec, Q, cor, extras) {
    const grupo = new THREE.Group();
    const paineis = [];
    const { W, H, D } = Q;
    const P = spec.paineis;
    const pes = spec.pes;
    const aco = std(cor, 0.5, 0.45);
    const acoEscuro = std(new THREE.Color(cor).multiplyScalar(0.7).getStyle(), 0.6, 0.35);
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
    const tL = P.esquerdo.espessura, tR = P.direito.espessura, tF = P.frente.espessura;
    const tT = P.topo.espessura, tB = P.fundo.espessura, tRe = P.traseira.espessura;

    const matPainel = (p, w, h) => p.tipo === 'vidro' ? vidro() : p.tipo === 'tela' ? tela(cor, w, h) : aco;
    const addPainel = (nome, dir, mesh, tipo) => {
      const g = new THREE.Group();
      g.add(mesh);
      g.userData.base = new THREE.Vector3();
      grupo.add(g);
      paineis.push({ obj: g, dir, nome, tipo });
      return g;
    };

    // base: pés e piso
    for (const xa of [x0 + 6, x1 - 24]) grupo.add(caixa(xa, xa + 18, 0, pes, z0 + 8, z1 - 8, acoEscuro));
    const piso = caixa(x0 + tL, x1 - tR, pes, pes + tB, z0 + tRe, z1 - tF, P.fundo.tipo === 'tela' ? tela(cor, W, D) : aco);
    grupo.add(piso);
    grupo.add(caixa(x0, x1, pes - 2, pes, z0, z1, acoEscuro));

    // estrutura (colunas e travessas)
    const e = 7;
    const colunas = [[x0, z0], [x1 - e, z0], [x1 - e, z1 - e]];
    if (!spec.semColuna) colunas.push([x0, z1 - e]);
    for (const [cx, cz] of colunas) grupo.add(caixa(cx, cx + e, pes, H, cz, cz + e, aco));
    for (const cz of [z0, z1 - e]) grupo.add(caixa(x0, x1, H - e, H, cz, cz + e, aco));
    for (const cx of [x0, x1 - e]) grupo.add(caixa(cx, cx + e, H - e, H, z0, z1, aco));
    grupo.add(caixa(x0, x1, pes, pes + e, z1 - e, z1, aco));

    // painel esquerdo (vidro) com borda serigrafada
    {
      const m = caixa(x0, x0 + tL, pes, H, z0, z1, matPainel(P.esquerdo, D, H - pes));
      m.castShadow = false;
      const g = addPainel('esquerdo', new THREE.Vector3(-1, 0, 0), m, P.esquerdo.tipo);
      if (P.esquerdo.tipo === 'vidro') {
        const frit = std('#0b0c0d', 0.3, 0.1);
        const b = 12, xi = x0 + tL, xo = xi + 0.3;
        g.add(caixa(xi, xo, H - b, H, z0, z1, frit), caixa(xi, xo, pes, pes + b, z0, z1, frit),
          caixa(xi, xo, pes, H, z0, z0 + b, frit), caixa(xi, xo, pes, H, z1 - b, z1, frit));
      }
    }
    // painel direito
    addPainel('direito', new THREE.Vector3(1, 0, 0), caixa(x1 - tR, x1, pes, H, z0, z1, matPainel(P.direito, D, H - pes)), P.direito.tipo);
    // topo
    addPainel('topo', new THREE.Vector3(0, 1, 0), caixa(x0 + e, x1 - e, H - tT, H - 0.5, z0 + e, z1 - e, matPainel(P.topo, W, D)), P.topo.tipo);
    // frente
    {
      const m = caixa(x0, x1, pes, H, z1 - tF, z1, matPainel(P.frente, W, H - pes));
      if (P.frente.tipo === 'vidro') m.castShadow = false;
      const g = addPainel('frente', new THREE.Vector3(0, 0, 1), m, P.frente.tipo);
      if (P.frente.tipo !== 'vidro') {
        g.add(caixa(x1 - 30, x1 - 6, H * 0.5, H * 0.5 + 58, z1 - 0.5, z1 + 1.5, std('#101113', 0.4, 0.3)));
        const botao = cilindro(4.5, 2, luz('#e9eef2', 0.6), 20);
        botao.rotation.x = Math.PI / 2;
        botao.position.set(x1 - 18, H * 0.5 + 48, z1 + 1.8);
        g.add(botao);
        for (let i = 0; i < 3; i++) g.add(caixa(x1 - 22, x1 - 14, H * 0.5 + 6 + i * 11, H * 0.5 + 10 + i * 11, z1 + 1.5, z1 + 2, std('#050506', 0.5, 0)));
      }
    }
    // traseira (chapa com recortes)
    {
      const forma = new THREE.Shape();
      forma.moveTo(x0 + tL, pes);
      forma.lineTo(x1 - tR, pes);
      forma.lineTo(x1 - tR, H - tT);
      forma.lineTo(x0 + tL, H - tT);
      forma.lineTo(x0 + tL, pes);
      for (const f of extras.furosTraseira) forma.holes.push(furoRet(f.x0, f.y0, f.x1, f.y1, f.r || 0));
      const m = extrudar(forma, tRe, aco);
      m.position.z = z0;
      const g = addPainel('traseira', new THREE.Vector3(0, 0, -1), m, 'metal');
      for (const f of extras.furosTraseira) {
        if (f.tela) {
          const w = Math.abs(f.x1 - f.x0), h = Math.abs(f.y1 - f.y0);
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tela(cor, w, h, 5));
          pl.position.set((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, z0 + tRe / 2);
          g.add(pl);
        }
        if (f.ac) g.add(caixa(f.x0 + 3, f.x1 - 3, f.y0 + 5, f.y1 - 5, z0 - 1, z0 + tRe + 14, std('#0b0c0d', 0.7, 0)));
      }
      for (const tampa of extras.tampasSlot) g.add(caixa(tampa.x0, tampa.x1, tampa.y0, tampa.y1, z0 - 1.2, z0, std(cor, 0.4, 0.6)));
    }

    // bandeja da placa-mãe (com recortes)
    {
      const Bx = extras.bandejaMundoX;
      const forma = new THREE.Shape();
      const u0 = tRe, u1 = D - tF, v0 = pes + tB, v1 = H - tT;
      forma.moveTo(u0, v0); forma.lineTo(u1, v0); forma.lineTo(u1, v1); forma.lineTo(u0, v1); forma.lineTo(u0, v0);
      for (const f of extras.furosBandeja) {
        if (f.circulo) forma.holes.push(furoCirculo(f.u, f.v, f.r));
        else forma.holes.push(furoRet(f.u0, f.v0, f.u1, f.v1, f.r || 0));
      }
      const m = extrudar(forma, 1.2, aco);
      m.rotation.y = -Math.PI / 2;
      m.position.set(Bx + 1.2, 0, z0);
      m.userData.bandeja = true;
      grupo.add(m);
      for (const f of extras.furosBandeja) {
        if (!f.grade) continue;
        const grade = new THREE.Mesh(new THREE.CircleGeometry(f.r, 48), tela(cor, f.r * 2, f.r * 2, 9));
        grade.rotation.y = -Math.PI / 2;
        grade.position.set(Bx + 0.6, f.v, z0 + f.u);
        grupo.add(grade);
      }
    }

    // caixa da fonte (chapa perfurada)
    if (extras.caixaFonte) {
      const cf = extras.caixaFonte;
      const mat = (w, h) => tela(new THREE.Color(cor).multiplyScalar(1.15).getStyle(), w, h, 4.5, 0.5);
      const bx = cf.box;
      const w = bx.max.x - bx.min.x, h = bx.max.y - bx.min.y, dd = bx.max.z - bx.min.z;
      const faces = cf.faces;
      const add = (m) => { m.castShadow = false; grupo.add(m); };
      if (faces.includes('esquerda')) add(caixa(bx.min.x, bx.min.x + 1, bx.min.y, bx.max.y, bx.min.z, bx.max.z, mat(dd, h)));
      if (faces.includes('direita')) add(caixa(bx.max.x - 1, bx.max.x, bx.min.y, bx.max.y, bx.min.z, bx.max.z, mat(dd, h)));
      if (faces.includes('baixo')) add(caixa(bx.min.x, bx.max.x, bx.min.y, bx.min.y + 1, bx.min.z, bx.max.z, mat(w, dd)));
      if (faces.includes('cima')) add(caixa(bx.min.x, bx.max.x, bx.max.y - 1, bx.max.y, bx.min.z, bx.max.z, mat(w, dd)));
      if (faces.includes('traseira')) add(caixa(bx.min.x, bx.max.x, bx.min.y, bx.max.y, bx.min.z, bx.min.z + 1, mat(w, h)));
      if (faces.includes('frente')) add(caixa(bx.min.x, bx.max.x, bx.min.y, bx.max.y, bx.max.z - 1, bx.max.z, mat(w, h)));
    }

    // suporte vertical da GPU (tampas verticais)
    for (const tp of extras.tampasVerticais) grupo.add(caixa(tp.x0, tp.x1, tp.y0, tp.y1, z0 + tRe, z0 + tRe + 1.2, std(cor, 0.4, 0.6)));

    grupo.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { grupo, paineis };
  }

  return {
    std, luz, vidro, tela, caixa, box3, cilindro, extrudar, retArredondado, seta,
    fan, radiador, bomba, placaMae, memoria, fonte, placaDeVideo, riser, tubo, gabinete
  };
};
