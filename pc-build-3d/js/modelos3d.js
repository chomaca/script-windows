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

  const T = window.PCBTexturas ? window.PCBTexturas(THREE) : null;

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
        clearcoat: 0.6, clearcoatRoughness: 0.05, depthWrite: false, side: THREE.FrontSide, envMapIntensity: 0.8
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
   * O ar entra por z=0 e sai na direção +Z (lado dos braços do motor).  */

  // Pá torcida (superfície paramétrica): mais inclinada na raiz e curvada para a frente.
  function geometriaPa(r0, r1, n, t, limite) {
    const U = 12, V = 7;
    const vao = 2 * Math.PI / n;
    const lim = limite || t * 0.42;
    const pos = [], idx = [];
    for (let i = 0; i <= U; i++) {
      const u = i / U;
      const r = r0 + (r1 - r0) * u;
      const w = vao * (0.5 + 0.4 * u);
      const c = vao * 0.42 * u * u;
      const ataque = 0.95 - 0.45 * u;
      for (let j = 0; j <= V; j++) {
        const v = j / V;
        const a = c + (v - 0.5) * w;
        const arco = (v - 0.5) * r * w;
        const z = Math.max(-lim, Math.min(lim, arco * Math.tan(ataque) * 0.5 + Math.sin(Math.PI * v) * r * w * 0.05));
        pos.push(r * Math.cos(a), r * Math.sin(a), z);
      }
    }
    for (let i = 0; i < U; i++) {
      for (let j = 0; j < V; j++) {
        const a = i * (V + 1) + j, b = a + V + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return geo;
  }

  // Braço traseiro curvado (liga o motor à moldura).
  function bracoCurvo(r0, r1, largura, angulo) {
    const f = new THREE.Shape();
    const n = 8, ida = [], volta = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, r = r0 + (r1 - r0) * u, a = angulo + 0.32 * u;
      const da = (largura / 2) / r;
      ida.push([r * Math.cos(a + da), r * Math.sin(a + da)]);
      volta.push([r * Math.cos(a - da), r * Math.sin(a - da)]);
    }
    f.moveTo(ida[0][0], ida[0][1]);
    for (const p of ida.slice(1)) f.lineTo(p[0], p[1]);
    for (const p of volta.reverse()) f.lineTo(p[0], p[1]);
    return f;
  }

  function materialCache(key, criarMat) {
    let m = cacheMat.get(key);
    if (!m) { m = criarMat(); m.userData.cacheado = true; cacheMat.set(key, m); }
    return m;
  }

  // Plástico fosco com grão (moldura/pás) — mapa de relevo compartilhado.
  function plastico(cor, rough = 0.62, extra) {
    if (!T) return std(cor, rough, 0.04, extra);
    const gr = T.grao('#808080', 10, 5);
    return materialCache('plast|' + cor + rough + (extra ? JSON.stringify(extra) : ''), () => new THREE.MeshStandardMaterial(Object.assign({
      color: cor, roughness: rough, metalness: 0.04, bumpMap: gr.bump, bumpScale: 0.05
    }, extra || {})));
  }

  // Chapa pintada (pintura eletrostática): grão fino no relevo.
  function pintado(cor, rough = 0.62, metal = 0.15) {
    if (!T) return std(cor, rough, metal);
    const gr = T.grao('#808080', 10, 5);
    return materialCache('pint|' + cor + rough + metal, () => new THREE.MeshStandardMaterial({
      color: cor, roughness: rough, metalness: metal, bumpMap: gr.bump, bumpScale: 0.03
    }));
  }

  function fan(spec, { rgb = '#7cc8ff', setaCor = null } = {}) {
    const s = spec.tamanho, t = spec.espessura;
    const estilo = spec.estilo || '';
    const arctic = estilo === 'arctic-p14-pro';
    const g = new THREE.Group();
    const matQuadro = plastico(spec.cor, 0.66);
    const matPas = plastico(spec.corPas || spec.cor, arctic ? 0.4 : 0.45, { side: THREE.DoubleSide });
    const nPas = spec.pas || 7;

    const forma = retArredondado(s, s, s * 0.06);
    forma.holes.push(furoCirculo(0, 0, s * 0.475));
    const meia = { 120: 52.5, 140: 62.25, 160: 70 }[s] || s * 0.4375;
    const cantos = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [sx, sy] of cantos) forma.holes.push(furoCirculo(sx * meia, sy * meia, 2.3));
    g.add(extrudar(forma, t, matQuadro));
    // boca arredondada (entrada de ar)
    const boca = new THREE.Mesh(new THREE.TorusGeometry(s * 0.476, 1.1, 8, 96), matQuadro);
    boca.position.z = 0.6;
    g.add(boca);

    if (arctic) {
      // amortecedores de borracha nos quatro cantos, dos dois lados
      const borracha = plastico('#2e2f33', 0.95);
      for (const [sx, sy] of cantos) {
        for (const z of [-0.45, t + 0.05]) {
          const pad = retArredondado(21, 21, 5, sx * (s / 2 - 10.5), sy * (s / 2 - 10.5));
          pad.holes.push(furoCirculo(sx * meia, sy * meia, 2.8));
          const m = extrudar(pad, 0.4, borracha);
          m.position.z = z;
          g.add(m);
        }
      }
    }

    // braços do motor (lado de saída do ar) + cabo saindo por um deles
    for (let i = 0; i < 4; i++) {
      const b = extrudar(bracoCurvo(s * 0.18, s * 0.48, arctic ? 4.2 : 3.2, Math.PI / 4 + i * Math.PI / 2), 3, matQuadro);
      b.position.z = t - 3;
      g.add(b);
    }
    const motor = cilindro(s * (arctic ? 0.235 : 0.19), 3, matQuadro, 48);
    motor.rotation.x = Math.PI / 2;
    motor.position.z = t - 1.5;
    g.add(motor);
    if (estilo !== 'aorus') {
      const cabo = cilindro(1.1, s * 0.3, std('#0b0b0c', 0.7, 0), 8);
      const a = Math.PI / 4;
      cabo.rotation.z = a - Math.PI / 2;
      cabo.position.set(Math.cos(a) * s * 0.33, Math.sin(a) * s * 0.33, t + 0.8);
      g.add(cabo);
    }

    // rotor (gira)
    const rotor = new THREE.Group();
    rotor.position.z = t * 0.46;
    const rCubo = s * (arctic ? 0.235 : 0.185);
    const cubo = cilindro(rCubo, t * 0.7, matPas, 48);
    cubo.rotation.x = Math.PI / 2;
    rotor.add(cubo);
    const texAdesivo = T ? T.adesivoFan(estilo, spec.corPas || spec.cor) : null;
    const adesivo = new THREE.Mesh(new THREE.CircleGeometry(rCubo * 0.9, 48),
      texAdesivo ? materialCache('adesivo|' + estilo + spec.cor, () => new THREE.MeshStandardMaterial({ map: texAdesivo, roughness: 0.4, metalness: 0.1 }))
        : std(spec.cor, 0.3, 0.4));
    adesivo.rotation.y = Math.PI;
    adesivo.position.z = -t * 0.35 - 0.05;
    rotor.add(adesivo);
    const rPonta = arctic ? s * 0.447 : s * 0.466;
    const alturaAnel = t * 0.46;
    for (let i = 0; i < nPas; i++) {
      const pa = new THREE.Mesh(geometriaPa(rCubo - 1, rPonta + 0.5, nPas, t, arctic ? alturaAnel / 2 - 0.4 : null), matPas);
      pa.rotation.z = i * 2 * Math.PI / nPas;
      pa.castShadow = true;
      rotor.add(pa);
    }
    if (arctic) {
      // anel que une as pontas das pás (marca da P14 Pro)
      const anel = new THREE.Mesh(new THREE.CylinderGeometry(rPonta + 1.1, rPonta + 1.1, alturaAnel, 96, 1, true), matPas);
      anel.rotation.x = Math.PI / 2;
      anel.castShadow = true;
      rotor.add(anel);
      for (const z of [-alturaAnel / 2, alturaAnel / 2]) {
        const lip = new THREE.Mesh(new THREE.TorusGeometry(rPonta + 0.55, 0.65, 6, 96), matPas);
        lip.position.z = z;
        rotor.add(lip);
      }
    }
    g.add(rotor);
    g.userData.rotor = rotor;

    if (spec.rgb) {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(s * 0.476, 1.3, 8, 64), luz(rgb, 7));
      anel.position.z = 1.2;
      anel.userData.rgb = true;
      g.add(anel);
      const anel2 = anel.clone();
      anel2.position.z = t - 1.2;
      g.add(anel2);
    }
    if (setaCor) g.add(seta(Math.max(70, s * 0.6), setaCor, t * 0.3));
    g.userData.colisores = [box3(-s / 2, s / 2, -s / 2, s / 2, 0, t)];
    return g;
  }

  /* ---------------- RADIADOR ----------------
   * Local: centrado na origem. X = comprimento (portas em +X),
   * Y = largura, Z = espessura.                                         */
  function radiador(spec, cor, tamanhoFan, estilo) {
    const L = spec.comprimento, W = spec.largura, Tr = spec.espessura;
    const g = new THREE.Group();
    const n = Math.max(1, Math.floor(L / tamanhoFan));
    const nucleo = Math.min(L - 20, n * tamanhoFan);
    const tanque = (L - nucleo) / 2;
    const clara = new THREE.Color(cor).getHSL({ h: 0, s: 0, l: 0 }).l > 0.6;
    const matCor = plastico(cor, 0.42);
    let matNucleo;
    if (T) {
      const tx = T.aletasRadiador(clara ? '#eef0f2' : '#3a3e44', clara ? '#a7adb4' : '#121416');
      matNucleo = materialCache('radNuc|' + cor + '|' + Math.round(nucleo), () => {
        const t2 = tx.clone(); t2.needsUpdate = true; t2.repeat.set(Math.round(nucleo / 24), Math.round(W / 16));
        return new THREE.MeshStandardMaterial({ map: t2, roughness: 0.5, metalness: 0.45 });
      });
    } else matNucleo = materialAletasRad(nucleo, '#ffffff');
    g.add(caixa(-nucleo / 2, nucleo / 2, -W / 2 + 3, W / 2 - 3, -Tr / 2 + 1.5, Tr / 2 - 1.5, matNucleo));
    g.add(caixa(-L / 2, L / 2, W / 2 - 3, W / 2, -Tr / 2, Tr / 2, matCor));
    g.add(caixa(-L / 2, L / 2, -W / 2, -W / 2 + 3, -Tr / 2, Tr / 2, matCor));
    // tanques com logo em relevo
    let matTanque = matCor;
    if (T && estilo === 'aorus-waterforce') {
      const tt = T.aorusTanque(Math.round(tanque), Math.round(W));
      matTanque = materialCache('radTanque|' + tt.map.uuid, () => new THREE.MeshStandardMaterial({ map: tt.map, bumpMap: tt.bump, bumpScale: 0.8, roughness: 0.4, metalness: 0.05 }));
    }
    for (const sx of [-1, 1]) {
      const geo = new THREE.BoxGeometry(tanque, W, Tr);
      const m = new THREE.Mesh(geo, [matCor, matCor, matCor, matCor, matTanque, matTanque]);
      m.position.set(sx * (L / 2 - tanque / 2), 0, 0);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    // parafusos nas laterais
    const parafuso = std('#b9bdc3', 0.3, 0.9);
    for (let i = 0; i < n; i++) {
      for (const sy of [-1, 1]) {
        const cxp = -nucleo / 2 + tamanhoFan * (i + 0.5);
        for (const dx of [-tamanhoFan * 0.4375, tamanhoFan * 0.4375]) {
          const pz = cilindro(1.6, 0.6, parafuso, 10);
          pz.rotation.x = Math.PI / 2;
          pz.position.set(cxp + dx, sy * (W / 2 - 1.5), Tr / 2 + 0.2);
          g.add(pz);
        }
      }
    }
    const portas = [];
    const matPorta = std(clara ? '#f4f5f6' : '#2a2c30', 0.3, 0.3);
    const cromo = std('#d9dde2', 0.12, 1);
    for (const y of [-17, 17]) {
      const p = cilindro(5.5, 14, matPorta, 20);
      p.rotation.z = Math.PI / 2;
      p.position.set(L / 2 + 7, y, 0);
      g.add(p);
      const aro = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.8, 8, 24), cromo);
      aro.rotation.y = Math.PI / 2;
      aro.position.set(L / 2 + 1.5, y, 0);
      g.add(aro);
      portas.push({ pos: new THREE.Vector3(L / 2 + 13, y, 0), dir: new THREE.Vector3(1, 0, 0) });
    }
    g.userData.portas = portas;
    g.userData.colisores = [box3(-L / 2, L / 2, -W / 2, W / 2, -Tr / 2, Tr / 2)];
    return g;
  }

  /* ---------------- BOMBA (bloco do watercooler) ----------------
   * Local: centrada em XY sobre a CPU; Z sobe a partir do topo da CPU.  */
  function bomba(spec, cor, rgb, estilo) {
    const w = spec.largura, d = spec.profundidade, h = spec.altura;
    const g = new THREE.Group();
    const aorus = estilo === 'aorus-waterforce';
    const corpoMat = plastico(cor, 0.45);
    const cromo = std('#dfe3e7', 0.12, 1);
    g.add(caixa(-w * 0.34, w * 0.34, -d * 0.34, d * 0.34, 0, 4, std('#b87333', 0.3, 0.9)));
    const corpo = extrudar(retArredondado(w, d, w * 0.2), h - 12, corpoMat, 1);
    corpo.position.z = 4;
    g.add(corpo);
    // friso cromado
    const friso = extrudar(retArredondado(w + 0.6, d + 0.6, w * 0.2), 2.2, cromo);
    friso.position.z = h - 9;
    g.add(friso);
    const tampa = extrudar(retArredondado(w * 0.96, d * 0.96, w * 0.19), 5, aorus ? corpoMat : std('#16181b', 0.15, 0.5), 0.6);
    tampa.position.z = h - 6;
    g.add(tampa);
    if (spec.tela) {
      const tex = texturaEtiqueta(['38 °C', 'CPU'], '#07121f', '#9fd3ff');
      const tela = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.7, d * 0.7), new THREE.MeshBasicMaterial({ map: tex }));
      tela.position.z = h + 0.1;
      g.add(tela);
    } else if (aorus && T) {
      // face espelhada com anéis de luz (efeito infinito) e emblema AORUS
      const esp = T.aorusEspelho();
      const mat = materialCache('espelho|' + rgb, () => new THREE.MeshPhysicalMaterial({
        map: esp.map, emissiveMap: esp.emissive, emissive: rgb, emissiveIntensity: 6,
        metalness: 0.85, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03
      }));
      const disco = new THREE.Mesh(new THREE.CircleGeometry(w * 0.4, 64), mat);
      disco.position.z = h + 0.15;
      disco.userData.rgb = true;
      g.add(disco);
      const aro = new THREE.Mesh(new THREE.TorusGeometry(w * 0.4, 0.9, 10, 72), cromo);
      aro.position.z = h + 0.2;
      g.add(aro);
    } else {
      const anel = new THREE.Mesh(new THREE.TorusGeometry(w * 0.3, 1.6, 8, 48), luz(rgb, 7));
      anel.position.z = h + 0.2;
      anel.userData.rgb = true;
      g.add(anel);
      const logo = cilindro(w * 0.12, 0.6, std('#d9dde2', 0.2, 0.9), 32);
      logo.rotation.x = Math.PI / 2;
      logo.position.z = h + 0.3;
      g.add(logo);
    }
    // conexões giratórias de 90° (cotovelos) saindo pela lateral
    const portas = [];
    for (const y of [-12, 12]) {
      const base = cilindro(5.6, 6, corpoMat, 24);
      base.rotation.z = Math.PI / 2;
      base.position.set(w / 2 + 2, y, h * 0.62);
      g.add(base);
      const aro = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.7, 8, 24), cromo);
      aro.rotation.y = Math.PI / 2;
      aro.position.set(w / 2 + 5, y, h * 0.62);
      g.add(aro);
      const p = cilindro(5, 9, corpoMat, 20);
      p.rotation.z = Math.PI / 2;
      p.position.set(w / 2 + 9, y, h * 0.62);
      g.add(p);
      portas.push({ pos: new THREE.Vector3(w / 2 + 13, y, h * 0.62), dir: new THREE.Vector3(1, 0, 0) });
    }
    g.userData.portas = portas;
    g.userData.colisores = [box3(-w / 2, w / 2, -d / 2, d / 2, 0, h), box3(w / 2, w / 2 + 12, -18, 18, h * 0.62 - 6, h * 0.62 + 6)];
    return g;
  }

  /* ---------------- PLACA-MÃE ----------------
   * Layout em mm (x a partir da borda traseira, y a partir da borda de cima).
   * O mesmo layout gera a geometria e o desenho do topo (textura), então
   * cada dissipador recebe a arte certa no lugar certo.                 */
  function layoutPlacaMae(spec) {
    const W = spec.largura, H = spec.altura, s = spec.soquete, d = spec.dimm, pc = spec.pcie || [];
    const p0 = pc[0] || { x: 46, y: H - 20 };
    const p1 = pc[1];
    const grande = H >= 200;
    const ioBaixo = Math.min(p0.y - 22, H - 12);
    const vx1 = Math.min(s.x + 34, W - 40);
    const vy1 = Math.min(s.y + 46, ioBaixo);
    const itens = [];
    const add = (o) => itens.push(o);

    add({ tipo: 'io', desenho: 'io', x0: -6, x1: 20, y0: 16, y1: Math.min(p0.y - 14, H - 4), z0: 0.2, z1: 34, mat: 'io' });
    add({
      tipo: 'armadura', sub: 'io', h: 38,
      poly: [[0, 16], [40, 16], [44, 20], [44, ioBaixo - 6], [38, ioBaixo], [0, ioBaixo]],
      acentos: [[[37, 26], [37, (16 + ioBaixo) * 0.5], [40.5, (16 + ioBaixo) * 0.5 + 4], [40.5, ioBaixo - 12]]],
      textos: [{ s: 'TERMINATOR', x: 21, y: (16 + ioBaixo) / 2 - 4, tam: 6, rot: -Math.PI / 2, espaco: 0.5 }, { s: 'MAXSUN', x: 21, y: ioBaixo - 8, tam: 3.4 }],
      riscos: [[[4, 22], [12, 22]], [[4, 25], [10, 25]]]
    });
    add({
      tipo: 'armadura', sub: 'vrm', h: 26,
      poly: [[46, 3], [vx1 - 6, 3], [vx1, 9], [vx1, 24], [vx1 - 6, 30], [74, 30], [68, 36], [68, vy1 - 6], [62, vy1], [46, vy1]],
      acentos: [[[52, vy1 - 10], [52, 14], [56, 10], [vx1 - 14, 10]]],
      textos: [{ s: 'MAXSUN', x: (80 + vx1) / 2, y: 20, tam: 4.2, espaco: 0.4 }],
      riscos: [[[vx1 - 22, 24], [vx1 - 18, 19], [vx1 - 14, 24]], [[vx1 - 16, 24], [vx1 - 12, 19], [vx1 - 8, 24]]]
    });
    add({ tipo: 'caixa', desenho: 'soquete', x0: s.x - 37, x1: s.x + 37, y0: s.y - 42, y1: s.y + 42, z0: 0, z1: 5, mat: 'metal' });
    add({ tipo: 'caixa', desenho: 'ihs', x0: s.x - 20, x1: s.x + 20, y0: s.y - 20, y1: s.y + 20, z0: 5, z1: 9, mat: 'metal' });
    for (const x of d.x) {
      add({ tipo: 'caixa', desenho: 'dimm', x0: x - 3, x1: x + 3, y0: d.y - 71, y1: d.y + 71, z0: 0, z1: 7, mat: 'plastico' });
      add({ tipo: 'caixa', desenho: 'trava', x0: x - 3.5, x1: x + 3.5, y0: d.y - 77, y1: d.y - 71, z0: 0, z1: 9, mat: 'trava' });
      add({ tipo: 'caixa', desenho: 'trava', x0: x - 3.5, x1: x + 3.5, y0: d.y + 71, y1: d.y + 77, z0: 0, z1: 9, mat: 'trava' });
    }
    add({ tipo: 'caixa', desenho: 'conector', pinos: [4, 2], x0: 11, x1: 27, y0: 3, y1: 12, z0: 0, z1: 13, mat: 'plastico' });
    add({ tipo: 'caixa', desenho: 'conector', pinos: [4, 2], x0: 28.5, x1: 44.5, y0: 3, y1: 12, z0: 0, z1: 13, mat: 'plastico' });
    add({ tipo: 'caixa', desenho: 'conector', pinos: [2, 12], x0: W - 11, x1: W - 1, y0: H * 0.3, y1: H * 0.3 + 52, z0: 0, z1: 16, mat: 'plastico' });
    add({ tipo: 'caixa', desenho: 'header', x0: W - 50, x1: W - 40, y0: 3, y1: 8, z0: 0, z1: 7, mat: 'plastico' });
    pc.forEach((p) => {
      add({ tipo: 'caixa', desenho: p.reforcado ? 'pcie-metal' : 'pcie', x0: p.x, x1: p.x + 89, y0: p.y - 3.8, y1: p.y + 3.8, z0: 0, z1: 11, mat: p.reforcado ? 'metal' : 'plastico' });
      add({ tipo: 'caixa', desenho: 'trava-pcie', x0: p.x + 89, x1: p.x + 96, y0: p.y - 3.8, y1: p.y + 3.8, z0: 0, z1: 11, mat: 'plastico' });
    });
    if (p0.y - 6 - (s.y + 46) >= 12) {
      const a = s.y + 46, b = p0.y - 6;
      add({
        tipo: 'armadura', sub: 'm2', h: 8,
        poly: [[56, a], [146, a], [150, a + 4], [150, b], [60, b], [56, b - 4]],
        acentos: [[[62, b - 3.5], [118, b - 3.5], [122, b - 7]]],
        textos: [{ s: 'M.2  GEN5', x: 86, y: (a + b) / 2 - 1, tam: 3.4, espaco: 0.4 }],
        riscos: [[[132, b - 2], [136, a + 2]], [[136, b - 2], [140, a + 2]], [[140, b - 2], [144, a + 2]]]
      });
    }
    if (p1 && p1.y - p0.y > 30) {
      const a = p0.y + 8, b = p1.y - 8;
      add({
        tipo: 'armadura', sub: 'm2', h: 8,
        poly: [[56, a], [150, a], [150, b - 4], [146, b], [56, b]],
        acentos: [[[62, a + 4], [100, a + 4], [104, a + 8], [140, a + 8]]],
        textos: [{ s: 'M.2', x: 80, y: (a + b) / 2 + 2, tam: 4.6, espaco: 0.6 }]
      });
    }
    if (grande && pc.length) {
      const x0 = W * 0.66, x1 = W - 14, a = p0.y + 6, b = Math.min(H - 16, p0.y + 70);
      add({
        tipo: 'armadura', sub: 'chipset', h: 10,
        poly: [[x0 + 6, a], [x1, a], [x1, b - 8], [x1 - 8, b], [x0, b], [x0, a + 6]],
        acentos: [[[x0 + 6, b - 8], [x0 + (x1 - x0) * 0.45, a + 10], [x1 - 6, a + 10]], [[x0 + 12, b - 4], [x1 - 14, b - 4]]],
        textos: [{ s: 'TERMINATOR', x: (x0 + x1) / 2 + 2, y: (a + b) / 2 + 3, tam: 4.4, espaco: 0.3 }, { s: 'B850M PRO', x: (x0 + x1) / 2 + 2, y: (a + b) / 2 + 9, tam: 2.4, espaco: 0.5 }]
      });
      add({ tipo: 'caixa', desenho: 'sata', x0: W - 10, x1: W, y0: H - 62, y1: H - 30, z0: 0, z1: 12, mat: 'plastico' });
      for (const [a, b, cor] of [[40, 56], [60, 76], [80, 98, '#1f4fbf'], [102, 114], [118, 128], [142, 152], [156, 166, '#e9ebee']]) {
        add({ tipo: 'caixa', desenho: 'header', cor, x0: a, x1: b, y0: H - 9, y1: H - 3, z0: 0, z1: 8, mat: 'plastico' });
      }
      for (const [cx, cy] of [[10, ioBaixo + 52], [18, ioBaixo + 52], [10, ioBaixo + 62], [18, ioBaixo + 62]]) {
        add({ tipo: 'cap', x: cx, y: cy, r: 3, z1: 9 });
      }
    }
    const serigrafia = [
      { s: 'CPU_PWR1', x: 11, y: 14, tam: 1.3 }, { s: 'CPU_PWR2', x: 28.5, y: 14, tam: 1.3 },
      { s: 'CPU_FAN', x: W - 50, y: 10.5, tam: 1.4 },
      { s: 'ATX_PWR', x: W - 13, y: H * 0.3 + 26, tam: 1.4, rot: -Math.PI / 2, alinhar: 'center' },
      { s: 'PCIE1', x: 46.5, y: p0.y - 6.4, tam: 1.5 }
    ];
    if (p1) serigrafia.push({ s: 'PCIE2', x: 46.5, y: p1.y - 6.4, tam: 1.5 });
    ['A1', 'A2', 'B1', 'B2'].slice(0, d.x.length).forEach((n, i) => serigrafia.push({ s: 'DDR5_' + n, x: d.x[i] + 4.1, y: d.y, tam: 1.2, rot: -Math.PI / 2, alinhar: 'center' }));
    if (grande) {
      serigrafia.push({ s: spec.estilo === 'maxsun-terminator' ? 'MS-Terminator B850M PRO WIFI' : spec.nome, x: 100, y: H - 13, tam: 2.1, peso: '800' });
      serigrafia.push({ s: 'SATA', x: W - 13, y: H - 46, tam: 1.4, rot: -Math.PI / 2, alinhar: 'center' });
      serigrafia.push({ s: 'JFP1', x: 102, y: H - 10.8, tam: 1.3 }, { s: 'USB3', x: 80, y: H - 10.8, tam: 1.3 }, { s: 'ARGB', x: 156, y: H - 10.8, tam: 1.3 }, { s: 'SYS_FAN', x: 142, y: H - 10.8, tam: 1.3 });
    }
    return {
      itens,
      serigrafia,
      furos: [[5.5, 6], [W - 6, 6], [5.5, H - 6], [W - 6, H - 6], [W * 0.55, H - 6]],
      audio: grande ? { x0: 2, x1: 42, y0: ioBaixo + 4, y1: H - 12 } : null,
      bateria: grande ? { x: W - 30, y: p0.y - 18 } : null
    };
  }

  const cacheFotos = new WeakMap();
  function texturaFoto(img) {
    let t = cacheFotos.get(img);
    if (!t) {
      t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.needsUpdate = true;
      t.userData.cacheado = true;
      cacheFotos.set(img, t);
    }
    return t;
  }

  function materiaisPlaca(spec, lay, foto) {
    const mats = {};
    if (foto) {
      const tf = texturaFoto(foto);
      mats.topo = materialCache('mbFoto|' + tf.uuid, () => new THREE.MeshStandardMaterial({ map: tf, roughness: 0.5, metalness: 0.25 }));
    } else if (T) {
      const tt = T.placaMaeTopo(spec, lay);
      mats.topo = materialCache('mbTopo|' + tt.map.uuid, () => new THREE.MeshStandardMaterial({ map: tt.map, roughnessMap: tt.mr, metalnessMap: tt.mr, roughness: 1, metalness: 1 }));
    } else {
      mats.topo = std(spec.corPCB, 0.6, 0.05);
    }
    mats.armadura = materialCache('mbArm|' + spec.corArmadura, () => new THREE.MeshStandardMaterial({
      color: spec.corArmadura, map: T ? T.escovadoRepetivel('#f2f3f4', 0.07, true) : null, roughness: 0.36, metalness: 0.55
    }));
    mats.plastico = std('#17181b', 0.6, 0.1);
    mats.metal = std('#c3c7cc', 0.28, 0.9);
    mats.trava = std('#d6d9dc', 0.55, 0.1);
    mats.io = std('#34373c', 0.45, 0.6);
    mats.pcbBorda = std(spec.corPCB, 0.6, 0.05);
    return mats;
  }

  // Caixa cuja face de cima (+Z) recebe a região certa da textura da placa.
  function caixaPlaca(it, W, H, matLado, matTopo, lista, matFrente) {
    const geo = new THREE.BoxGeometry(it.x1 - it.x0, it.y1 - it.y0, it.z1 - it.z0);
    const cx = (it.x0 + it.x1) / 2, cy = -(it.y0 + it.y1) / 2, cz = (it.z0 + it.z1) / 2;
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 16; i < 20; i++) uv.setXY(i, (p.getX(i) + cx) / W, (p.getY(i) + cy + H) / H);
    const m = new THREE.Mesh(geo, [matLado, matFrente || matLado, matLado, matLado, matTopo, matLado]);
    m.position.set(cx, cy, cz);
    m.castShadow = true;
    m.receiveShadow = true;
    lista.push(box3(it.x0, it.x1, -it.y1, -it.y0, it.z0, it.z1));
    return m;
  }

  // Dissipador extrudado a partir do polígono, com chanfro e topo texturizado.
  function armaduraPlaca(it, W, H, matTopo, matLado, lista) {
    const f = new THREE.Shape();
    it.poly.forEach(([x, y], i) => (i ? f.lineTo(x, -y) : f.moveTo(x, -y)));
    const bv = 0.8;
    const geo = new THREE.ExtrudeGeometry(f, { depth: it.h - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv, bevelOffset: -bv, bevelSegments: 2, curveSegments: 4 });
    geo.translate(0, 0, bv);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    const g0 = geo.groups[0];
    for (let i = g0.start; i < g0.start + g0.count; i++) uv.setXY(i, p.getX(i) / W, (p.getY(i) + H) / H);
    const m = new THREE.Mesh(geo, [matTopo, matLado]);
    m.castShadow = true;
    m.receiveShadow = true;
    const xs = it.poly.map((q) => q[0]), ys = it.poly.map((q) => q[1]);
    lista.push(box3(Math.min(...xs), Math.max(...xs), -Math.max(...ys), -Math.min(...ys), 0, it.h));
    return m;
  }

  /* Local: origem no canto traseiro-superior da face dos componentes.
   * +X = da borda traseira para a frente; placa ocupa y de -altura a 0;
   * +Z = para fora da face dos componentes. PCB em z de -espessura a 0. */
  function placaMae(spec, opts = {}) {
    const W = spec.largura, H = spec.altura, t = spec.espessura;
    const g = new THREE.Group();
    const col = [];
    const lay = layoutPlacaMae(spec);
    const mats = materiaisPlaca(spec, lay, opts.foto);

    const pcb = new THREE.Mesh(new THREE.BoxGeometry(W, H, t), [mats.pcbBorda, mats.pcbBorda, mats.pcbBorda, mats.pcbBorda, mats.topo, mats.pcbBorda]);
    pcb.position.set(W / 2, -H / 2, -t / 2);
    pcb.receiveShadow = true;
    g.add(pcb);
    col.push(box3(0, W, -H, 0, -t, 0));

    for (const it of lay.itens) {
      if (it.tipo === 'armadura') g.add(armaduraPlaca(it, W, H, mats.topo, mats.armadura, col));
      else if (it.tipo === 'cap') {
        const c = cilindro(it.r, it.z1, std('#c9a24a', 0.3, 0.8), 20);
        c.rotation.x = Math.PI / 2;
        c.position.set(it.x, -it.y, it.z1 / 2);
        g.add(c);
        col.push(box3(it.x - it.r, it.x + it.r, -it.y - it.r, -it.y + it.r, 0, it.z1));
      } else {
        let frente = null;
        if (it.mat === 'io' && T) {
          const tio = T.placaMaeIO(it.y1 - it.y0, it.z1 - it.z0);
          frente = materialCache('mbIO|' + tio.uuid, () => new THREE.MeshStandardMaterial({ map: tio, roughness: 0.45, metalness: 0.55 }));
        }
        g.add(caixaPlaca(it, W, H, mats[it.mat] || mats.plastico, mats.topo, col, frente));
      }
    }
    g.userData.colisores = col;
    g.userData.layout = lay;
    return g;
  }

  /* ---------------- MEMÓRIA ----------------
   * Local: origem no centro da borda inferior (a que encaixa no slot).
   * +Y = altura, Z = comprimento, X = espessura.                        */
  function memoria(spec, rgb) {
    const L = spec.comprimento, H = spec.altura, Tk = spec.espessura;
    const g = new THREE.Group();
    g.add(caixa(-0.65, 0.65, 0, 8, -L / 2 + 1, L / 2 - 1, std('#12301f', 0.6, 0.1)));
    const topo = spec.rgb ? H - 7 : H;
    // perfil do dissipador com entalhes no topo
    const x0 = -L / 2 + 1.5, x1 = L / 2 - 1.5, yb = 4.5, yt = topo, n1 = -L / 2 + L * 0.3;
    const f = new THREE.Shape();
    f.moveTo(x0, yb); f.lineTo(x1, yb); f.lineTo(x1, yt - 2); f.lineTo(x1 - 2, yt);
    f.lineTo(n1 + 5, yt); f.lineTo(n1 + 5, yt - 1.6); f.lineTo(n1 - 1, yt - 1.6); f.lineTo(n1 - 1, yt);
    f.lineTo(x0 + 2, yt); f.lineTo(x0, yt - 2); f.closePath();
    const geo = new THREE.ExtrudeGeometry(f, { depth: Tk, bevelEnabled: false, curveSegments: 2 });
    const p = geo.attributes.position, uv = geo.attributes.uv, nr = geo.attributes.normal;
    const g0 = geo.groups[0];
    let corte = g0.start + g0.count;
    for (let i = g0.start; i < g0.start + g0.count; i++) {
      let u = (p.getX(i) + L / 2) / L;
      if (nr.getZ(i) < 0) u = 1 - u;
      else if (i < corte) corte = i - (i - g0.start) % 3;
      uv.setXY(i, u, p.getY(i) / H);
    }
    // tampa de trás (logo FURY) e tampa da frente (etiqueta) em grupos separados
    const lados = geo.groups.slice(1);
    geo.clearGroups();
    geo.addGroup(g0.start, corte - g0.start, 0);
    geo.addGroup(corte, g0.start + g0.count - corte, 2);
    for (const gr of lados) geo.addGroup(gr.start, gr.count, 1);
    geo.translate(0, 0, -Tk / 2);
    geo.rotateY(-Math.PI / 2);
    const tx = T ? T.memoriaLado(spec) : null;
    const lado = tx ? materialCache('ramLado|' + tx.map.uuid, () => new THREE.MeshStandardMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: 1.2, roughness: 0.48, metalness: 0.55 })) : std(spec.cor, 0.42, 0.45);
    const te = T ? T.memoriaEtiqueta(spec) : null;
    const etiqueta = te ? materialCache('ramEtq|' + te.uuid, () => new THREE.MeshStandardMaterial({ map: te, roughness: 0.5, metalness: 0.45 })) : lado;
    const dissip = new THREE.Mesh(geo, [lado, std(spec.cor, 0.45, 0.55), etiqueta]);
    dissip.castShadow = true;
    dissip.receiveShadow = true;
    g.add(dissip);
    if (spec.rgb) {
      const barra = caixa(-Tk / 2 + 0.5, Tk / 2 - 0.5, H - 7, H, -L / 2 + 3, L / 2 - 3, luz(rgb, 5));
      barra.userData.rgb = true;
      g.add(barra);
    }
    g.userData.colisores = [box3(-Tk / 2, Tk / 2, 0, H, -L / 2, L / 2)];
    return g;
  }

  /* ---------------- FONTE ----------------
   * Local: X = largura (centrada), Y = altura (centrada, ventoinha em +Y),
   * Z = comprimento (z=0 é a face da tomada AC; z=L é a face modular).  */
  function fonte(spec) {
    const W = spec.largura, H = spec.altura, L = spec.comprimento;
    const g = new THREE.Group();
    const corpo = pintado(spec.cor, 0.62);
    if (T && spec.estilo === 'corsair-rme') {
      const lat = T.corsairLateral(L, H, spec), esp = T.corsairEspecificacao(W, L, spec);
      const grade = T.corsairGrade(W, L), mod = T.corsairModular(W, H);
      const m = (tx, rough = 0.62, metal = 0.2) => materialCache('psu|' + tx.uuid, () => new THREE.MeshStandardMaterial({ map: tx, roughness: rough, metalness: metal }));
      const geo = new THREE.BoxGeometry(W, H, L);
      // +X/−X: marca nas duas laterais; +Y: grade da ventoinha; −Y: etiqueta; +Z: painel modular
      const caixaFonte = new THREE.Mesh(geo, [m(lat), m(lat), m(grade, 0.5, 0.45), m(esp), m(mod), corpo]);
      caixaFonte.position.set(0, 0, L / 2);
      caixaFonte.castShadow = caixaFonte.receiveShadow = true;
      g.add(caixaFonte);
      const favo = new THREE.Mesh(new THREE.PlaneGeometry(W - 20, H - 16), tela('#0f1012', W - 20, H - 16, 5));
      favo.position.set(-12, 0, -0.3);
      favo.rotation.y = Math.PI;
      g.add(favo);
      g.add(caixa(W / 2 - 46, W / 2 - 16, -H / 2 + 8, -H / 2 + 32, -4, 0, std('#0b0c0d', 0.7, 0)));
      g.add(caixa(W / 2 - 58, W / 2 - 50, -H / 2 + 12, -H / 2 + 28, -3, 0, std('#0b0c0d', 0.5, 0)));
      const con = std('#0d0e10', 0.7, 0);
      for (let lin = 0; lin < 3; lin++) {
        for (let col = 0; col < 5; col++) {
          const a = -W / 2 + 18 + col * 24, bb = -H / 2 + 14 + lin * 22;
          g.add(caixa(a, a + 18, bb, bb + 12, L, L + 2, con));
        }
      }
      g.userData.colisores = [box3(-W / 2, W / 2, -H / 2, H / 2, 0, L)];
      return g;
    }
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
    const dx = cfg.dedosX;
    const pcbL = Math.min(L * 0.7, 235);
    const corPCB = spec.corPCB || '#0f1113';

    // backplate de metal fundido (face externa texturizada, com passagem de ar no fim)
    const bpLado = std(spec.corBackplate, 0.42, 0.65);
    const texBp = T ? T.gpuBackplate(L, Hc - y0, pcbL) : null;
    if (texBp) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L, Hc - y0),
        materialCache('bp|' + texBp.map.uuid, () => new THREE.MeshStandardMaterial({ map: texBp.map, alphaMap: texBp.alpha, alphaTest: 0.5, roughness: 0.42, metalness: 0.7, side: THREE.DoubleSide })));
      face.rotation.y = Math.PI;
      face.position.set(L / 2, (y0 + Hc) / 2, 0.3);
      face.castShadow = true;
      g.add(face);
      for (const [a, b, c, d] of [[0, L, y0, y0 + 2], [0, L, Hc - 2, Hc], [0, 2, y0, Hc], [L - 2, L, y0, Hc]]) g.add(caixa(a, b, c, d, 0, 2.5, bpLado));
    } else {
      g.add(caixa(0, L, y0, Hc, 0, 2.5, bpLado));
    }
    col.push(box3(0, L, y0, Hc, 0, 2.5));
    g.add(caixa(0, pcbL, y0, Math.min(Hc - 4, 124), 2.5, 4.1, std(corPCB, 0.55, 0.15)));
    g.add(caixa(dx, dx + 89, 0, y0, 2.7, 3.9, std('#c9a54b', 0.3, 0.9)));
    // suporte (bracket) com as saídas de vídeo desenhadas
    const larg = spec.slots * 20.32;
    const metalSup = std('#c7cbd0', 0.32, 0.9);
    const texSup = T ? T.gpuSuporte(larg, 119) : null;
    const faceSup = texSup ? materialCache('sup|' + texSup.uuid, () => new THREE.MeshStandardMaterial({ map: texSup, roughness: 0.32, metalness: 0.85 })) : metalSup;
    const sup = new THREE.Mesh(new THREE.BoxGeometry(1.6, 119, larg), [metalSup, faceSup, metalSup, metalSup, metalSup, metalSup]);
    sup.position.set(-0.8, 61.5, larg / 2 - 3);
    sup.castShadow = true;
    g.add(sup);
    col.push(box3(-1.6, 0, 2, 121, -3, larg - 3));
    // conector 12V-2x6 na borda de cima
    g.add(caixa(pcbL - 34, pcbL - 12, Hc - 6, Hc + 5, 3, 11, std('#0d0e10', 0.6, 0)));
    g.add(caixa(pcbL - 26, pcbL - 20, Hc + 5, Hc + 7, 6, 8, std('#0d0e10', 0.6, 0)));

    let espessuraTotal = Tc;
    if (deshroud) {
      const z0 = 4.1, zf = 8;
      // estrutura intermediária preta (mid-frame)
      g.add(caixa(0, L, y0, Hc, z0, zf, std('#1a1c1f', 0.5, 0.35)));
      // pilha de aletas de alumínio (prateado)
      const passo = 2.1;
      const n = Math.floor((L - 4) / passo);
      const finGeo = new THREE.BoxGeometry(0.4, Hc - y0 - 2, Tc - zf);
      const fins = new THREE.InstancedMesh(finGeo, std('#d3d7dc', 0.26, 0.92), n);
      const mtx = new THREE.Matrix4();
      for (let i = 0; i < n; i++) {
        mtx.makeTranslation(2 + i * passo, (y0 + Hc) / 2, (zf + Tc) / 2);
        fins.setMatrixAt(i, mtx);
      }
      fins.castShadow = true;
      fins.receiveShadow = true;
      g.add(fins);
      col.push(box3(0, L, y0, Hc, 0, Tc));
      // heatpipes niquelados saindo pelas bordas de cima e de baixo
      const niquel = std('#e1e5e9', 0.14, 1);
      const zm = (zf + Tc) / 2;
      const tubos = [];
      for (let i = 0; i < 4; i++) tubos.push({ x: pcbL * 0.22 + i * 15, borda: Hc, s: 1 });
      for (let i = 0; i < 3; i++) tubos.push({ x: pcbL * 0.3 + i * 15 + 7, borda: y0, s: -1 });
      for (const tb of tubos) {
        const yb = tb.borda, sg = tb.s;
        const pts = [
          new THREE.Vector3(tb.x, yb - sg * 14, zf + 2), new THREE.Vector3(tb.x, yb + sg * 3, zf + 4),
          new THREE.Vector3(tb.x, yb + sg * 7, zm), new THREE.Vector3(tb.x, yb + sg * 3, Tc - 6), new THREE.Vector3(tb.x, yb - sg * 14, Tc - 4)
        ];
        g.add(tubo(pts, 3, null, niquel));
      }

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
        const yMin = Math.min(y0, cy - s / 2) - 1.2, yMax = Math.max(Hc + 8, cy + s / 2) + 1.2, zTop = Tc + ft;
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

  function tubo(pontos, raio, cor, mat, trancadoCor) {
    const curva = new THREE.CatmullRomCurve3(pontos, false, 'centripetal');
    if (!mat && trancadoCor && T) {
      const tr = T.trancado(trancadoCor);
      const comp = Math.round(curva.getLength() / 10) * 10;
      mat = materialCache('tubo|' + trancadoCor + '|' + comp, () => {
        const m1 = tr.map.clone(), b1 = tr.bump.clone();
        for (const t of [m1, b1]) { t.needsUpdate = true; t.repeat.set(Math.round(comp / 4), 3); }
        return new THREE.MeshStandardMaterial({ map: m1, bumpMap: b1, bumpScale: 1.5, roughness: 0.7, metalness: 0.02 });
      });
    }
    const m = new THREE.Mesh(new THREE.TubeGeometry(curva, 80, raio, 16, false), mat || std(cor, 0.62, 0.02));
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
    const aco = pintado(cor, 0.6, 0.15);
    const acoEscuro = std(new THREE.Color(cor).multiplyScalar(0.7).getStyle(), 0.6, 0.35);
    const borrachaPe = std('#0e0f10', 0.95, 0);
    const x0 = -W / 2, x1 = W / 2, z0 = -D / 2, z1 = D / 2;
    const tL = P.esquerdo.espessura, tR = P.direito.espessura, tF = P.frente.espessura;
    const tT = P.topo.espessura, tB = P.fundo.espessura, tRe = P.traseira.espessura;

    const matPainel = (p, w, h) => p.tipo === 'vidro' ? vidro() : p.tipo === 'tela' ? tela(cor, w, h) : aco;
    // Painel de tela como plano (furos alinhados), com faixa sólida/rodapé e logo quando houver.
    const painelTela = (nome, p, w, h) => {
      if (!T) return new THREE.Mesh(new THREE.PlaneGeometry(w, h), tela(cor, w, h));
      const solidos = [], textos = [];
      if (p.faixa) {
        solidos.push({ x0: 0, x1: w, y0: h * p.faixa[0], y1: h * p.faixa[1] });
        if (p.logo) textos.push({ s: p.logo, x: w - 52, y: h * (p.faixa[0] + p.faixa[1]) / 2, tam: 5.5 });
      }
      if (p.rodape) {
        solidos.push({ x0: 0, x1: w, y0: h * (1 - p.rodape), y1: h });
        if (p.logo) textos.push({ s: p.logo, x: w / 2, y: h * (1 - p.rodape / 2), tam: Math.min(7, w / 26) });
      }
      const tx = T.painelPerfurado(nome + (p.faixa || '') + (p.rodape || ''), Math.round(w), Math.round(h), cor, { solidos, textos, passo: p.passo || 5, furo: p.furo || 3.4 });
      const mat = materialCache('painel|' + tx.map.uuid, () => {
        const m = new THREE.MeshStandardMaterial({ map: tx.map, alphaMap: tx.alpha, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.62, metalness: 0.15 });
        m.userData.tipo = 'tela';
        return m;
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.castShadow = false;
      return m;
    };
    const addPainel = (nome, dir, mesh, tipo) => {
      const g = new THREE.Group();
      g.add(mesh);
      g.userData.base = new THREE.Vector3();
      grupo.add(g);
      paineis.push({ obj: g, dir, nome, tipo });
      return g;
    };

    // base: pés e piso
    for (const xa of [x0 + 6, x1 - 24]) {
      grupo.add(caixa(xa, xa + 18, 4, pes, z0 + 8, z1 - 8, acoEscuro));
      for (const za of [z0 + 12, z1 - 42]) grupo.add(caixa(xa + 1, xa + 17, 0, 4, za, za + 30, borrachaPe));
    }
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
    if (P.direito.tipo === 'tela') {
      const m = painelTela('direito', P.direito, D, H - pes);
      m.rotation.y = Math.PI / 2;
      m.position.set(x1 - 0.8, (pes + H) / 2, 0);
      addPainel('direito', new THREE.Vector3(1, 0, 0), m, 'tela');
    } else addPainel('direito', new THREE.Vector3(1, 0, 0), caixa(x1 - tR, x1, pes, H, z0, z1, matPainel(P.direito, D, H - pes)), P.direito.tipo);
    // topo
    if (P.topo.tipo === 'tela') {
      const m = painelTela('topo', P.topo, W - 2 * e, D - 2 * e);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, H - 1.2, 0);
      addPainel('topo', new THREE.Vector3(0, 1, 0), m, 'tela');
    } else addPainel('topo', new THREE.Vector3(0, 1, 0), caixa(x0 + e, x1 - e, H - tT, H - 0.5, z0 + e, z1 - e, matPainel(P.topo, W, D)), P.topo.tipo);
    // frente
    {
      let m;
      if (P.frente.tipo === 'tela') {
        m = painelTela('frente', P.frente, W, H - pes);
        m.position.set(0, (pes + H) / 2, z1 - 0.8);
      } else m = caixa(x0, x1, pes, H, z1 - tF, z1, matPainel(P.frente, W, H - pes));
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
      var grupoCaixa = new THREE.Group();
      const add = (m) => { m.castShadow = false; grupoCaixa.add(m); };
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
    return { grupo, paineis, caixaFonte: typeof grupoCaixa !== 'undefined' ? grupoCaixa : null };
  }

  return {
    std, luz, vidro, tela, caixa, box3, cilindro, extrudar, retArredondado, seta,
    fan, radiador, bomba, placaMae, memoria, fonte, placaDeVideo, riser, tubo, gabinete,
    layoutPlacaMae, texturas: T
  };
};
