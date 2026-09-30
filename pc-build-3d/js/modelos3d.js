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

  /* Caixa com todas as arestas arredondadas (raio r, 'seg' segmentos por curva).
     Mantém os 6 grupos de material da BoxGeometry (faces +X, −X, +Y, −Y, +Z, −Z). */
  const cacheGeoR = new Map();
  function geoCaixaR(w, h, d, r, seg = 3) {
    const n = seg * 2 + 1;
    r = Math.max(0.05, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
    const k = [w, h, d, r, seg].map((v) => Math.round(v * 100)).join('|');
    const c = cacheGeoR.get(k);
    if (c) return c.clone();
    const geo = new THREE.BoxGeometry(1, 1, 1, n, n, n).toNonIndexed();
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r;
    const meio = 0.5 / n;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      v.set(x - Math.sign(x) * meio, y - Math.sign(y) * meio, z - Math.sign(z) * meio).normalize();
      pos.setXYZ(i, bx * Math.sign(x) + v.x * r, by * Math.sign(y) + v.y * r, bz * Math.sign(z) + v.z * r);
      nor.setXYZ(i, v.x, v.y, v.z);
    }
    // UV refeito pela posição final (mesma convenção da BoxGeometry, face a face),
    // senão a arte de cada face fica espremida no miolo
    const uv = geo.attributes.uv;
    const face = [
      (px, py, pz) => [0.5 - pz / d, 0.5 + py / h], (px, py, pz) => [0.5 + pz / d, 0.5 + py / h],
      (px, py, pz) => [0.5 + px / w, 0.5 - pz / d], (px, py, pz) => [0.5 + px / w, 0.5 + pz / d],
      (px, py, pz) => [0.5 + px / w, 0.5 + py / h], (px, py, pz) => [0.5 - px / w, 0.5 + py / h]
    ];
    for (const gr of geo.groups) {
      const f = face[gr.materialIndex];
      for (let i = gr.start; i < gr.start + gr.count; i++) {
        const [u, vv] = f(pos.getX(i), pos.getY(i), pos.getZ(i));
        uv.setXY(i, Math.min(1, Math.max(0, u)), Math.min(1, Math.max(0, vv)));
      }
    }
    cacheGeoR.set(k, geo);
    return geo.clone();
  }
  function caixaR(x0, x1, y0, y1, z0, z1, r, mat, seg) {
    const m = new THREE.Mesh(geoCaixaR(Math.abs(x1 - x0) || 0.01, Math.abs(y1 - y0) || 0.01, Math.abs(z1 - z0) || 0.01, r, seg), mat);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
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
  /* Pá de fan com espessura (sólida): superfície média torcida (ângulo de
     ataque maior no cubo), perfil mais grosso na raiz (1,5 mm) e fino na
     ponta (0,8 mm), bordas de ataque/fuga afinadas. U = raio, V = corda. */
  const cacheGeoPa = new Map();
  function geometriaPa(r0, r1, n, t, limite) {
    const chaveG = [r0, r1, n, t, limite].map((v) => Math.round((v || 0) * 100)).join('|');
    if (cacheGeoPa.has(chaveG)) return cacheGeoPa.get(chaveG);
    const U = 16, V = 10;
    const vao = 2 * Math.PI / n;
    const lim = limite || t * 0.42;
    const meio = [], esp = [];
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
        meio.push([r * Math.cos(a), r * Math.sin(a), z]);
        // espessura: perfil de aerofólio ao longo da corda, mais fino na ponta
        esp.push((1.5 - 0.7 * u) * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, 0.08 + v * 0.92))));
      }
    }
    const pos = [], idx = [];
    const nV = (U + 1) * (V + 1);
    for (let k = 0; k < nV; k++) { const [x, y, z] = meio[k]; pos.push(x, y, z + esp[k] / 2); }
    for (let k = 0; k < nV; k++) { const [x, y, z] = meio[k]; pos.push(x, y, z - esp[k] / 2); }
    const id = (i, j, lado) => lado * nV + i * (V + 1) + j;
    for (let i = 0; i < U; i++) {
      for (let j = 0; j < V; j++) {
        const a = id(i, j, 0), b = id(i + 1, j, 0);
        idx.push(a, b, a + 1, b, b + 1, a + 1);
        const c = id(i, j, 1), d = id(i + 1, j, 1);
        idx.push(c, c + 1, d, d, c + 1, d + 1);
      }
    }
    // bordas: fecha o sólido (ataque/fuga ao longo de U, ponta e raiz ao longo de V)
    const tira = (lista) => {
      for (let k = 0; k < lista.length - 1; k++) {
        const [p, q] = [lista[k], lista[k + 1]];
        idx.push(p, q, p + nV, q, q + nV, p + nV);
      }
    };
    const bordaA = [], bordaF = [], ponta = [], raiz = [];
    for (let i = 0; i <= U; i++) { bordaA.push(id(i, 0, 0)); bordaF.push(id(U - i, V, 0)); }
    for (let j = 0; j <= V; j++) { ponta.push(id(U, j, 0)); raiz.push(id(0, V - j, 0)); }
    tira(bordaA.slice().reverse()); tira(bordaF.slice().reverse()); tira(ponta.slice().reverse()); tira(raiz.slice().reverse());
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    cacheGeoPa.set(chaveG, geo);
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

  // Plástico brilhante/acetinado com verniz (bomba e radiador brancos).
  function plasticoVerniz(cor, rough = 0.38, verniz = 0.6) {
    const gr = T ? T.grao('#808080', 10, 5) : null;
    return materialCache('verniz|' + cor + rough + verniz, () => new THREE.MeshPhysicalMaterial({
      color: cor, roughness: rough, metalness: 0.02, clearcoat: verniz, clearcoatRoughness: 0.14,
      bumpMap: gr ? gr.bump : null, bumpScale: 0.035
    }));
  }

  // Chapa pintada (pintura eletrostática): grão fino no relevo.
  function pintado(cor, rough = 0.62, metal = 0.15) {
    if (!T) return std(cor, rough, metal);
    const gr = T.grao('#808080', 10, 5);
    return materialCache('pint|' + cor + rough + metal, () => new THREE.MeshStandardMaterial({
      color: cor, roughness: rough, metalness: metal, bumpMap: gr.bump, bumpScale: 0.03
    }));
  }

  function fan(spec, { rgb = '#7cc8ff', setaCor = null, fotoCubo = null } = {}) {
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
    if (estilo === 'aorus') {
      // EZ-Chain Mag: encaixes magnéticos nas laterais, que ligam um fan no outro
      const encaixe = plastico('#d9dce0', 0.5);
      const contato = std('#c9a54b', 0.3, 0.9);
      for (const sx of [-1, 1]) {
        g.add(caixa(sx * (s / 2 - 2.2), sx * (s / 2 - 0.1), -9, 9, t * 0.25, t * 0.75, encaixe));
        for (const cy of [-4.5, 0, 4.5]) g.add(caixa(sx * (s / 2 - 0.3), sx * (s / 2 - 0.05), cy - 1, cy + 1, t * 0.4, t * 0.6, contato));
      }
    } else {
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
    const tfCubo = fotoCubo ? texturaFoto(fotoCubo) : null;
    const adesivo = new THREE.Mesh(new THREE.CircleGeometry(rCubo * 0.9, 48),
      tfCubo ? materialCache('adesivoFoto|' + tfCubo.uuid, () => new THREE.MeshStandardMaterial({ map: tfCubo, roughness: 0.42, metalness: 0.05 }))
        : texAdesivo ? materialCache('adesivo|' + estilo + spec.cor, () => new THREE.MeshStandardMaterial({ map: texAdesivo, roughness: 0.4, metalness: 0.1 }))
          : std(spec.cor, 0.3, 0.4));
    adesivo.rotation.y = Math.PI;
    adesivo.position.z = -t * 0.35 - 0.05;
    rotor.add(adesivo);
    // P14 Pro: anel nas pontas das pás a 1,1 mm da moldura (boca com raio 0,475·s)
    const rPonta = arctic ? s * 0.475 - 1.1 - 1.1 : s * 0.466;
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
    const matCor = estilo === 'aorus-waterforce' ? plasticoVerniz(cor, 0.4, 0.45) : plastico(cor, 0.42);
    let matNucleo;
    if (T) {
      const tx = T.aletasRadiador(clara ? '#eef0f2' : '#3a3e44', clara ? '#a7adb4' : '#121416');
      matNucleo = materialCache('radNuc|' + cor + '|' + Math.round(nucleo), () => {
        const t2 = tx.clone(); t2.needsUpdate = true; t2.repeat.set(Math.round(nucleo / 24), Math.round(W / 16));
        return new THREE.MeshStandardMaterial({ map: t2, roughness: 0.5, metalness: 0.45 });
      });
    } else matNucleo = materialAletasRad(nucleo, '#ffffff');
    g.add(caixa(-nucleo / 2, nucleo / 2, -W / 2 + 3, W / 2 - 3, -Tr / 2 + 1.5, Tr / 2 - 1.5, matNucleo));
    // tubos achatados por onde passa o líquido: frisos em relevo sobre as aletas (os dois lados)
    const nTubos = Math.max(6, Math.round((W - 8) / 8.2));
    const matTubo = std(clara ? '#dfe2e6' : '#26292d', 0.42, 0.55);
    for (let i = 0; i < nTubos; i++) {
      const y = -W / 2 + 4 + (i + 0.5) * (W - 8) / nTubos;
      for (const sz of [-1, 1]) g.add(caixa(-nucleo / 2, nucleo / 2, y - 0.9, y + 0.9, sz * (Tr / 2 - 1.6), sz * (Tr / 2 - 1.3), matTubo));
    }
    // trilhos laterais (chapa dobrada com os furos dos parafusos dos fans)
    g.add(caixaR(-L / 2 + 1, L / 2 - 1, W / 2 - 3.2, W / 2, -Tr / 2, Tr / 2, 0.9, matCor, 2));
    g.add(caixaR(-L / 2 + 1, L / 2 - 1, -W / 2, -W / 2 + 3.2, -Tr / 2, Tr / 2, 0.9, matCor, 2));
    // tanques com logo em relevo
    let matTanque = matCor;
    if (T && estilo === 'aorus-waterforce') {
      const tt = T.aorusTanque(Math.round(tanque), Math.round(W));
      matTanque = materialCache('radTanque|' + tt.map.uuid, () => new THREE.MeshStandardMaterial({ map: tt.map, bumpMap: tt.bump, bumpScale: 0.8, roughness: 0.4, metalness: 0.05 }));
    }
    for (const sx of [-1, 1]) {
      // tanque de plástico com cantos arredondados (a arte AORUS fica nas faces grandes)
      const geo = geoCaixaR(tanque, W, Tr, 2.4, 3);
      const m = new THREE.Mesh(geo, [matCor, matCor, matCor, matCor, matTanque, matTanque]);
      m.position.set(sx * (L / 2 - tanque / 2), 0, 0);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      // emenda do tanque com o núcleo (aba de metal crimpada)
      g.add(caixaR(sx * (nucleo / 2) - 1.2, sx * (nucleo / 2) + 1.2, -W / 2 + 0.6, W / 2 - 0.6, -Tr / 2 + 0.4, Tr / 2 - 0.4, 0.5, std(clara ? '#e3e6ea' : '#2b2e33', 0.35, 0.6), 1));
    }
    // bujão de enchimento no tanque sem conexões
    {
      const bujao = cilindro(4.2, 1.6, std(clara ? '#f0f1f3' : '#1b1c1f', 0.35, 0.2), 28);
      bujao.rotation.z = Math.PI / 2;
      bujao.position.set(-L / 2 - 0.6, 0, 0);
      g.add(bujao);
      const fenda = caixa(-L / 2 - 1.5, -L / 2 - 1.3, -2.8, 2.8, -0.5, 0.5, std('#555a60', 0.5, 0.3));
      g.add(fenda);
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
    g.userData.colisores = [box3(-L / 2 - 1.6, L / 2, -W / 2, W / 2, -Tr / 2, Tr / 2), box3(L / 2, L / 2 + 14, -23.5, 23.5, -6.5, 6.5)];
    return g;
  }

  /* ---------------- BOMBA (bloco do watercooler) ----------------
   * Local: centrada em XY sobre a CPU; Z sobe a partir do topo da CPU.  */
  function bomba(spec, cor, rgb, estilo, fotoTopo) {
    const w = spec.largura, d = spec.profundidade, h = spec.altura;
    const g = new THREE.Group();
    const aorus = estilo === 'aorus-waterforce';
    const corpoMat = aorus ? plasticoVerniz(cor, 0.34, 0.7) : plastico(cor, 0.45);
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
    if (fotoTopo) {
      // foto real do topo, nos cantos arredondados da tampa; brilha de leve (LEDs acesos)
      const tf = texturaFoto(fotoTopo);
      const forma = retArredondado(w * 0.96, d * 0.96, w * 0.19);
      const geo = new THREE.ShapeGeometry(forma, 12);
      const uv = geo.attributes.uv, ps = geo.attributes.position;
      for (let i = 0; i < ps.count; i++) uv.setXY(i, ps.getX(i) / (w * 0.96) + 0.5, ps.getY(i) / (d * 0.96) + 0.5);
      const mat = materialCache('bombaFoto|' + tf.uuid, () => new THREE.MeshPhysicalMaterial({
        map: tf, emissiveMap: tf, emissive: '#ffffff', emissiveIntensity: 0.3, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05
      }));
      const topo = new THREE.Mesh(geo, mat);
      topo.position.z = h + 0.12;
      topo.userData.rgb = true;
      g.add(topo);
    } else if (spec.tela) {
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

  /* Libera a textura de uma foto que foi trocada ou removida. */
  function liberarFoto(img) {
    const t = cacheFotos.get(img);
    if (t) { t.dispose(); cacheFotos.delete(img); }
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
  function memoria(spec, rgb, fotoLado) {
    const L = spec.comprimento, H = spec.altura, Tk = spec.espessura;
    const g = new THREE.Group();
    // PCB preto (1,2 mm) com a chave do DDR5 e os contatos dourados nas duas faces
    const matPCB = std(spec.corPCB || '#101213', 0.55, 0.15);
    const chave = L / 2 + 0.9; // centro do entalhe, a partir da ponta esquerda
    g.add(caixa(-0.6, 0.6, 0, 9, -L / 2 + 0.4, -L / 2 + chave - 0.9, matPCB));
    g.add(caixa(-0.6, 0.6, 0, 9, -L / 2 + chave + 0.9, L / 2 - 0.4, matPCB));
    g.add(caixa(-0.6, 0.6, 4.4, 9, -L / 2 + chave - 0.9, -L / 2 + chave + 0.9, matPCB));
    if (T && T.dedosDIMM) {
      const td = T.dedosDIMM(L - 0.8, 4.4, chave - 0.4);
      const matD = materialCache('dimmD|' + td.map.uuid, () => new THREE.MeshStandardMaterial({ map: td.map, alphaMap: td.alpha, alphaTest: 0.5, roughness: 0.28, metalness: 0.8 }));
      for (const lado of [1, -1]) {
        const geo = new THREE.PlaneGeometry(L - 0.8, 4.4);
        if (lado > 0) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
        const pl = new THREE.Mesh(geo, matD);
        pl.rotation.y = lado * Math.PI / 2;
        pl.position.set(lado * 0.62, 2.2, 0);
        g.add(pl);
      }
    }
    const topo = spec.rgb ? H - 7 : H;
    // perfil do dissipador com entalhes no topo
    const x0 = -L / 2 + 1.5, x1 = L / 2 - 1.5, yb = 4.5, yt = topo, n1 = -L / 2 + L * 0.3;
    const f = new THREE.Shape();
    f.moveTo(x0, yb); f.lineTo(x1, yb); f.lineTo(x1, yt - 2); f.lineTo(x1 - 2, yt);
    f.lineTo(n1 + 5, yt); f.lineTo(n1 + 5, yt - 1.6); f.lineTo(n1 - 1, yt - 1.6); f.lineTo(n1 - 1, yt);
    f.lineTo(x0 + 2, yt); f.lineTo(x0, yt - 2); f.closePath();
    // chanfro de 0,35 mm em todas as arestas do dissipador de alumínio
    const bv = 0.35;
    const geo = new THREE.ExtrudeGeometry(f, { depth: Tk - 2 * bv, bevelEnabled: true, bevelThickness: bv, bevelSize: bv * 0.8, bevelOffset: -bv * 0.8, bevelSegments: 2, curveSegments: 2 });
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
    geo.translate(0, 0, -(Tk - 2 * bv) / 2);
    geo.rotateY(-Math.PI / 2);
    const tx = T ? T.memoriaLado(spec) : null;
    const tfl = fotoLado ? texturaFoto(fotoLado) : null;
    const lado = tfl ? materialCache('ramFoto|' + tfl.uuid, () => new THREE.MeshStandardMaterial({ map: tfl, roughness: 0.45, metalness: 0.5 })) : tx ? materialCache('ramLado|' + tx.map.uuid, () => new THREE.MeshStandardMaterial({ map: tx.map, bumpMap: tx.bump, bumpScale: 1.2, roughness: 0.48, metalness: 0.55 })) : std(spec.cor, 0.42, 0.45);
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
  function fonte(spec, fotoLado) {
    const W = spec.largura, H = spec.altura, L = spec.comprimento;
    const g = new THREE.Group();
    const corpo = pintado(spec.cor, 0.62);
    if (T && spec.estilo === 'corsair-rme') {
      const lat = T.corsairLateral(L, H, spec), esp = T.corsairEspecificacao(W, L, spec);
      const grade = T.corsairGrade(W, L), mod = T.corsairModular(W, H);
      const m = (tx, rough = 0.62, metal = 0.2) => materialCache('psu|' + tx.uuid, () => new THREE.MeshStandardMaterial({ map: tx, roughness: rough, metalness: metal }));
      // chapa dobrada: cantos com raio de ~1,8 mm (mantém as 6 faces com as artes)
      const geo = geoCaixaR(W, H, L, 1.8, 2);
      const tfl = fotoLado ? texturaFoto(fotoLado) : null;
      const matLado = tfl ? materialCache('psuFoto|' + tfl.uuid, () => new THREE.MeshStandardMaterial({ map: tfl, roughness: 0.6, metalness: 0.2 })) : m(lat);
      // grade vazada de verdade: dá para ver a ventoinha girando por baixo
      const alfa = T.corsairGradeAlfa ? T.corsairGradeAlfa(W, L) : null;
      const matGrade = alfa
        ? materialCache('psuGrade|' + grade.uuid, () => new THREE.MeshStandardMaterial({ map: grade, alphaMap: alfa, alphaTest: 0.5, roughness: 0.5, metalness: 0.45, side: THREE.DoubleSide }))
        : m(grade, 0.5, 0.45);
      const caixaFonte = new THREE.Mesh(geo, [matLado, matLado, matGrade, m(esp), m(mod), corpo]);
      caixaFonte.position.set(0, 0, L / 2);
      caixaFonte.castShadow = caixaFonte.receiveShadow = true;
      g.add(caixaFonte);
      if (alfa) {
        // parte de dentro (escura) logo abaixo da grade + ventoinha de 135 mm com 9 pás
        const dentro = new THREE.Mesh(new THREE.BoxGeometry(W - 1.4, 26, L - 1.4), std('#060607', 0.9, 0, { side: THREE.BackSide }));
        dentro.position.set(0, H / 2 - 13.6, L / 2);
        g.add(dentro);
        const fm = fan({ tamanho: 135, espessura: 25, cor: '#0b0b0c', corPas: '#121315', pas: 9 });
        const rotor = fm.userData.rotor;
        fm.remove(rotor);
        const suporteRotor = new THREE.Group();
        suporteRotor.rotation.x = -Math.PI / 2; // eixo do fan (+Z) → +Y da fonte
        suporteRotor.position.set(0, H / 2 - 25, L / 2);
        suporteRotor.add(rotor);
        suporteRotor.userData.rotor = rotor;
        g.add(suporteRotor);
        // aro de montagem da ventoinha
        const aro = new THREE.Mesh(new THREE.TorusGeometry(Math.min(W, L) * 0.45 - 1.5, 1.4, 8, 72), std('#0e0f11', 0.6, 0.2));
        aro.rotation.x = Math.PI / 2;
        aro.position.set(0, H / 2 - 3, L / 2);
        g.add(aro);
      }
      // face da tomada: favo de mel, entrada C14 com 3 pinos e chave liga/desliga
      const favo = new THREE.Mesh(new THREE.PlaneGeometry(W - 58, H - 16), tela('#0f1012', W - 58, H - 16, 5));
      favo.position.set(-W / 2 + 8 + (W - 58) / 2, 0, -0.3);
      favo.rotation.y = Math.PI;
      g.add(favo);
      const pret = plastico('#0c0d0f', 0.55);
      const escuro = std('#030304', 0.9, 0);
      {
        const cx0 = W / 2 - 44, cx1 = W / 2 - 16, cy0 = -H / 2 + 9, cy1 = -H / 2 + 31;
        // a tomada fica quase rente à chapa (passa pelo recorte da traseira do gabinete)
        g.add(caixaR(cx0, cx1, cy0, cy1, -1.0, 0.3, 0.8, pret, 2));
        // recorte do C14: trapézio com cantos de cima chanfrados
        const f = new THREE.Shape();
        const a = 12, b = 8.5, ch = 3;
        f.moveTo(-a, -b); f.lineTo(a, -b); f.lineTo(a, b - ch); f.lineTo(a - ch, b); f.lineTo(-a + ch, b); f.lineTo(-a, b - ch); f.closePath();
        const rec = new THREE.Mesh(new THREE.ShapeGeometry(f), escuro);
        rec.rotation.y = Math.PI;
        rec.position.set((cx0 + cx1) / 2, (cy0 + cy1) / 2, -1.05);
        g.add(rec);
        const pino = std('#c9ccd0', 0.3, 0.95);
        for (const [px, py] of [[-7, -1.5], [7, -1.5], [0, 3.5]]) g.add(caixa((cx0 + cx1) / 2 + px - 0.8, (cx0 + cx1) / 2 + px + 0.8, (cy0 + cy1) / 2 + py - 2.2, (cy0 + cy1) / 2 + py + 2.2, -1.3, -0.4, pino));
        // chave (gangorra) um pouco inclinada, lado "I" afundado
        g.add(caixaR(W / 2 - 58, W / 2 - 48, -H / 2 + 11, -H / 2 + 29, -0.8, 0.3, 0.6, pret, 1));
        const tecla = caixaR(W / 2 - 57, W / 2 - 49, -H / 2 + 12.5, -H / 2 + 27.5, -1.3, -0.5, 0.4, plastico('#141517', 0.4), 1);
        tecla.rotation.x = 0.07;
        g.add(tecla);
      }
      // painel modular: soquetes com os furos dos pinos (mesmas posições das artes e dos cabos)
      if (T.CORSAIR_MODULAR) {
        for (const sq of T.CORSAIR_MODULAR) {
          const t = T.tamSoquete(sq);
          const x0 = -W / 2 + sq.x, y0 = -H / 2 + sq.y;
          g.add(caixaR(x0, x0 + t.w, y0, y0 + t.h, L - 0.4, L + 1.8, 0.6, pret, 1));
          // trava do cabo em cima do soquete
          g.add(caixa(x0 + t.w / 2 - 2.2, x0 + t.w / 2 + 2.2, y0 + t.h, y0 + t.h + 1.2, L - 0.4, L + 1.2, pret));
          const lado = sq.passo * 0.62;
          for (let i = 0; i < sq.cols; i++) {
            for (let j = 0; j < sq.rows; j++) {
              const px = x0 + 1.2 + sq.passo * (i + 0.5), py = y0 + 1.2 + sq.passo * (j + 0.5);
              g.add(caixa(px - lado / 2, px + lado / 2, py - lado / 2, py + lado / 2, L + 1.8, L + 1.86, escuro));
            }
          }
          if (sq.sinal) for (let i = 0; i < 4; i++) {
            const px = x0 + 3 + i * 4.4, py = y0 + t.h - 1.8;
            g.add(caixa(px - 0.7, px + 0.7, py - 0.7, py + 0.7, L + 1.8, L + 1.86, escuro));
          }
        }
      }
      // tomada e chave saem < 2 mm (entram no recorte da traseira): o colisor é o corpo
      g.userData.colisores = [box3(-W / 2, W / 2, -H / 2, H / 2, 0, L + 1.8)];
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
    g.add(caixa(W / 2 - 46, W / 2 - 16, -H / 2 + 8, -H / 2 + 32, -1.2, 0.5, std('#0b0c0d', 0.7, 0)));
    g.add(caixa(W / 2 - 58, W / 2 - 50, -H / 2 + 12, -H / 2 + 28, -1.2, 0.5, std('#0b0c0d', 0.5, 0)));

    const con = std('#0d0e10', 0.7, 0);
    const conectores = (face) => {
      for (let lin = 0; lin < 3; lin++) {
        for (let col = 0; col < 5; col++) {
          const a = -W / 2 + 18 + col * 24, bb = -H / 2 + 14 + lin * 22;
          if (face === 'fundo') g.add(caixa(a, a + 18, bb, bb + 12, L - 1, L + 1, con));
          else g.add(caixa(-W / 2 - 1, -W / 2 + 1, bb, bb + 12, 20 + col * 26, 38 + col * 26, con));
        }
      }
    };
    conectores(spec.conectoresNaLateral ? 'lateral' : 'fundo');

    const tflG = fotoLado ? texturaFoto(fotoLado) : null;
    const et = tflG
      ? new THREE.Mesh(new THREE.PlaneGeometry(L, H), materialCache('psuFoto|' + tflG.uuid, () => new THREE.MeshStandardMaterial({ map: tflG, roughness: 0.6, metalness: 0.2 })))
      : new THREE.Mesh(new THREE.PlaneGeometry(Math.min(L - 20, 130), H - 30),
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
  function placaDeVideo(spec, cfg, fanSpec, rgb, fotos) {
    fotos = fotos || {};
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
    if (fotos.backplate) {
      const tf = texturaFoto(fotos.backplate);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L, Hc - y0),
        materialCache('bpFoto|' + tf.uuid, () => new THREE.MeshPhysicalMaterial({ map: tf, roughness: 0.4, metalness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.25 })));
      face.rotation.y = Math.PI;
      face.position.set(L / 2, (y0 + Hc) / 2, -0.05);
      face.castShadow = true;
      g.add(face);
      g.add(caixa(0, L, y0, Hc, 0, 2.5, bpLado));
    } else if (texBp) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(L, Hc - y0),
        materialCache('bp|' + texBp.map.uuid, () => new THREE.MeshPhysicalMaterial({ map: texBp.map, alphaMap: texBp.alpha, alphaTest: 0.5, roughness: 0.4, metalness: 0.72, clearcoat: 0.35, clearcoatRoughness: 0.22, side: THREE.DoubleSide })));
      face.rotation.y = Math.PI;
      face.position.set(L / 2, (y0 + Hc) / 2, 0.3);
      face.castShadow = true;
      g.add(face);
      for (const [a, b, c, d] of [[0, L, y0, y0 + 2], [0, L, Hc - 2, Hc], [0, 2, y0, Hc], [L - 2, L, y0, Hc]]) g.add(caixa(a, b, c, d, 0, 2.5, bpLado));
    } else {
      g.add(caixa(0, L, y0, Hc, 0, 2.5, bpLado));
    }
    col.push(box3(0, L, y0, Hc, 0, 2.5));
    // PCB (1,57 mm) e dedos PCIe x16: 11 contatos, chave de 1,9 mm, 71 contatos (passo de 1,0 mm)
    const matPCB = std(corPCB, 0.55, 0.15);
    g.add(caixa(0, pcbL, y0, Math.min(Hc - 4, 124), 2.5, 4.07, matPCB));
    {
      for (const [a, b] of [[0, 11.65], [13.55, 89]]) g.add(caixa(dx + a, dx + b, 0.6, y0, 2.5, 4.07, matPCB));
      const texD = T && T.gpuDedos ? T.gpuDedos(89, y0) : null;
      const matD = texD
        ? materialCache('dedos|' + texD.map.uuid, () => new THREE.MeshStandardMaterial({ map: texD.map, alphaMap: texD.alpha, alphaTest: 0.5, roughness: 0.28, metalness: 0.8 }))
        : std('#c9a54b', 0.3, 0.9);
      for (const lado of [1, -1]) {
        const geo = new THREE.PlaneGeometry(89, y0);
        if (lado < 0) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
        const pl = new THREE.Mesh(geo, matD);
        if (lado < 0) pl.rotation.y = Math.PI;
        pl.position.set(dx + 44.5, y0 / 2, lado > 0 ? 4.09 : 2.48);
        g.add(pl);
      }
    }
    // suporte (bracket) de 3,5 slots: chapa, aba dobrada com os rasgos dos parafusos e as saídas de vídeo
    const larg = spec.slots * 20.32;
    const zS0 = -3, zS1 = larg - 3;
    const metalSup = std('#c7cbd0', 0.32, 0.9);
    const texSup = T ? T.gpuSuporte(larg, 119) : null;
    const faceSup = texSup ? materialCache('sup|' + texSup.uuid, () => new THREE.MeshStandardMaterial({ map: texSup, roughness: 0.32, metalness: 0.85 })) : metalSup;
    const sup = new THREE.Mesh(new THREE.BoxGeometry(1.6, 119, larg), [metalSup, faceSup, metalSup, metalSup, metalSup, metalSup]);
    sup.position.set(-0.8, 61.5, (zS0 + zS1) / 2);
    sup.castShadow = true;
    g.add(sup);
    {
      // aba de cima: dobrada para dentro (lado da placa), um rasgo em U por slot
      const aba = new THREE.Shape();
      aba.moveTo(0, zS0); aba.lineTo(10.5, zS0);
      const nSl = Math.ceil(spec.slots);
      for (let i = 0; i < nSl; i++) {
        const zc = zS0 + 20.32 * (i + 0.5);
        if (zc + 2.3 > zS1 - 1) break;
        aba.lineTo(10.5, zc - 2.3); aba.lineTo(4.8, zc - 2.3);
        aba.absarc(4.8, zc, 2.3, -Math.PI / 2, -Math.PI * 1.5, true);
        aba.lineTo(10.5, zc + 2.3);
      }
      aba.lineTo(10.5, zS1); aba.lineTo(0, zS1); aba.closePath();
      const mAba = extrudar(aba, 1.2, metalSup);
      mAba.rotation.x = Math.PI / 2; // (u, v, w) → (u, −w, v): chapa horizontal, espessura para baixo
      mAba.position.y = 121;
      g.add(mAba);
      col.push(box3(0, 10.5, 119.8, 121, zS0, zS1));
      // saídas: 3× DisplayPort 2.1b + 1× HDMI 2.1b (mesmas posições da textura do suporte)
      const matShell = std('#d4d7db', 0.22, 1);
      const matPorta = std('#0c0d0f', 0.6, 0.1);
      const zp0 = zS0 + 3.5, zp1 = zS0 + 20;
      [[19.5, true], [33.5, true], [47.5, true], [61.5, false]].forEach(([ya, dp]) => {
        const yb = ya + 6.5;
        const contorno = (s, e) => {
          const p = s || new THREE.Path();
          if (dp) { p.moveTo(zp0 - e, ya - e); p.lineTo(zp1 + e, ya - e); p.lineTo(zp1 + e, yb - 2 + e * 0.4); p.lineTo(zp1 - 2 + e * 0.4, yb + e); p.lineTo(zp0 - e, yb + e); }
          else { p.moveTo(zp0 - e, yb + e); p.lineTo(zp1 + e, yb + e); p.lineTo(zp1 - 1.5 + e, ya - e); p.lineTo(zp0 + 1.5 - e, ya - e); }
          p.closePath();
          return p;
        };
        const casca = contorno(new THREE.Shape(), 0.7);
        casca.holes.push(contorno(null, 0));
        const m = extrudar(casca, 0.7, matShell);
        m.rotation.y = -Math.PI / 2; // (u, v, w) → (−w, v, u): sai para fora do suporte
        m.position.x = -1.6;
        g.add(m);
        // corpo do conector atrás do suporte, sobre o PCB
        g.add(caixa(0, 15.5, ya + 0.3, yb - 0.3, zp0 + 0.4, zp1 - 0.4, matShell));
        g.add(caixa(-1.2, 0, ya + 2, ya + 4.2, zp0 + 2.5, zp1 - 2.5, matPorta));
      });
      col.push(box3(-2.3, 0, 18.8, 68.7, zp0 - 0.7, zp1 + 0.7));
    }
    col.push(box3(-1.6, 0, 2, 121, zS0, zS1));
    // conector 12V-2x6 (16 pinos: 12 de força + 4 de sinal) na borda de cima, trava para fora
    const xc0 = pcbL - 34, xc1 = pcbL - 12;
    {
      const pret = std('#0d0e10', 0.6, 0);
      g.add(caixaR(xc0, xc1, Hc - 18, Hc + 5, 4.1, 13.5, 0.8, pret, 2));
      g.add(caixa(xc0 + 8, xc0 + 14, Hc + 5, Hc + 7, 6.5, 9.5, pret));
      const furo = std('#030304', 0.9, 0);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) g.add(caixa(xc0 + 2.2 + i * 3, xc0 + 4.4 + i * 3, Hc + 5, Hc + 5.05, 5.6 + j * 3.6, 8.2 + j * 3.6, furo));
      for (let i = 0; i < 4; i++) g.add(caixa(xc0 + 4 + i * 4, xc0 + 5.4 + i * 4, Hc + 5, Hc + 5.05, 12.2, 13.1, furo));
    }
    col.push(box3(xc0, xc1, Hc - 18, Hc + 7, 4.1, 13.5));
    g.userData.conector12v = { pos: new THREE.Vector3((xc0 + xc1) / 2, Hc + 5, 8.8), dir: new THREE.Vector3(0, 1, 0) };
    // parafusos do backplate: 4 da trava do chip (com mola) e os da borda
    {
      const xcore = pcbL * 0.26 + 51, ycore = (y0 + 18 + Hc - 16) / 2;
      const cab = std('#1a1b1e', 0.35, 0.8);
      const parafuso = (x, y, r) => {
        const p = cilindro(r, 1.1, cab, 20);
        p.rotation.x = Math.PI / 2;
        p.position.set(x, y, -0.45);
        g.add(p);
        const fenda = caixa(x - r * 0.6, x + r * 0.6, y - 0.3, y + 0.3, -1.05, -0.95, std('#050506', 0.8, 0));
        const fenda2 = fenda.clone(); fenda2.rotation.z = Math.PI / 2;
        g.add(fenda, fenda2);
      };
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) parafuso(xcore + sx * 28, ycore + sy * 28, 3.1);
      for (const [x, y] of [[8, y0 + 7], [8, Hc - 8], [pcbL * 0.55, y0 + 6], [pcbL * 0.55, Hc - 7], [pcbL - 6, y0 + 7], [pcbL - 6, Hc - 8]]) parafuso(x, y, 2);
      col.push(box3(xcore - 31.5, xcore + 31.5, ycore - 31.5, ycore + 31.5, -1, 0));
    }

    let espessuraTotal = Tc;
    if (deshroud) {
      const zBase = 4.07, zVC = 8, zAleta = 11.5;
      const matFrame = std('#15171a', 0.4, 0.5);
      const niquel = std('#dde1e6', 0.13, 1);
      const xVC0 = pcbL * 0.26, xVC1 = xVC0 + 102;
      // estrutura intermediária reforçada: moldura com nervuras (janelas entre elas)
      {
        const f = new THREE.Shape();
        f.moveTo(16.5, y0); f.lineTo(pcbL, y0); f.lineTo(pcbL, Hc - 6); f.lineTo(16.5, Hc - 6); f.closePath();
        const nj = 4, xa = 22, xb = pcbL - 6, wj = (xb - xa - (nj - 1) * 9) / nj;
        for (let i = 0; i < nj; i++) {
          const a0 = xa + i * (wj + 9);
          if (a0 + wj < xVC0 - 2 || a0 > xVC1 + 2) f.holes.push(furoRet(a0, y0 + 8, a0 + wj, Hc - 14, 4));
        }
        const frame = extrudar(f, zVC - zBase, matFrame, 0.4);
        frame.position.z = zBase;
        g.add(frame);
        // tampa preta sobre os conectores de vídeo (entre o suporte e as aletas)
        g.add(caixaR(1, 16.5, y0 + 2, 118, zBase, 23.5, 1.4, matFrame, 2));
      }
      // câmara de vapor (cobre niquelado) sobre o chip e as memórias
      g.add(caixaR(xVC0, xVC1, y0 + 18, Hc - 16, zVC - 0.6, zAleta, 1.2, niquel));
      // aletas de alumínio (0,34 mm, passo 2,05 mm): chapas finas com a borda do lado dos fans serrilhada
      const cacheAleta = new Map();
      const aletaGeo = (zIni, ya, yb) => {
        const k = [zIni, ya, yb].join('|');
        if (cacheAleta.has(k)) return cacheAleta.get(k);
        const sh = new THREE.Shape();
        sh.moveTo(ya, zIni); sh.lineTo(yb, zIni); sh.lineTo(yb, Tc - 1.6);
        const dente = 9.6;
        for (let yy = yb; yy > ya + 0.1; yy -= dente) {
          const y1 = Math.max(ya, yy - dente);
          sh.lineTo(yy - (yy - y1) * 0.25, Tc);
          sh.lineTo(yy - (yy - y1) * 0.75, Tc);
          sh.lineTo(y1, Tc - 1.6);
        }
        sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: false, curveSegments: 1 });
        // (u, v, profundidade) → (x = profundidade, y = u, z = v): permutação cíclica, mantém a orientação
        for (const nome of ['position', 'normal']) {
          const at = geo.attributes[nome];
          for (let i = 0; i < at.count; i++) { const u = at.getX(i), v = at.getY(i), w = at.getZ(i); at.setXYZ(i, w, u, v); }
        }
        cacheAleta.set(k, geo);
        return geo;
      };
      // heatpipes: 5 fazem a curva na borda de cima e 4 na de baixo (dentro da altura do dissipador)
      const rHp = 3;
      const topo = [], baixo = [];
      for (let i = 0; i < 5; i++) topo.push(xVC0 - 12 + i * 17);
      for (let i = 0; i < 4; i++) baixo.push(xVC0 - 3.5 + i * 17);
      const faixaT = [topo[0] - 7, topo[4] + 7], faixaB = [baixo[0] - 7, baixo[3] + 7];
      const yTopo = Hc - 6, yTopoHp = Hc - 2 * rHp - 12, yBaixo = y0 + 2, yBaixoHp = y0 + 2 * rHp + 12;
      const perfil = (x) => {
        if (x < 16.5) return { zi: 24, ya: yBaixo, yb: 118 };
        const pass = x > pcbL;
        let yb = yTopo, ya = yBaixo;
        if (x > xc0 - 2 && x < xc1 + 2) yb = Hc - 20;
        else if (x > faixaT[0] && x < faixaT[1]) yb = yTopoHp;
        if (x > faixaB[0] && x < faixaB[1]) ya = yBaixoHp;
        return { zi: pass ? 2.6 : zAleta, ya, yb };
      };
      const matAleta = std('#d0d4d9', 0.28, 0.9);
      const passo = 2.05;
      const grupos = new Map();
      for (let x = 3.5; x < L - 1.6; x += passo) {
        if (x > pcbL - 1.2 && x < pcbL + 1) continue;
        const p = perfil(x + 0.17);
        const k = p.zi + '|' + p.ya + '|' + p.yb;
        if (!grupos.has(k)) grupos.set(k, { p, xs: [] });
        grupos.get(k).xs.push(x);
      }
      const mtx = new THREE.Matrix4();
      for (const { p, xs } of grupos.values()) {
        const fins = new THREE.InstancedMesh(aletaGeo(p.zi, p.ya, p.yb), matAleta, xs.length);
        xs.forEach((x, i) => { mtx.makeTranslation(x, 0, 0); fins.setMatrixAt(i, mtx); });
        fins.castShadow = true;
        fins.receiveShadow = true;
        g.add(fins);
      }
      // placa da ponta (fecha a pilha de aletas)
      g.add(caixa(L - 1.6, L, yBaixo, yTopo, 2.6, Tc - 1, matAleta));
      col.push(box3(1, L, y0, yTopo, zBase, Tc));
      const zm = (zAleta + Tc) / 2;
      const zLo = zAleta + rHp + 0.4, zHi = Tc - rHp - 7;
      const rCurva = (zHi - zLo) / 2;
      const hp = (x, lado, i) => {
        // lado +1: curva em cima (borda Hc); −1: curva embaixo (borda y0)
        const yF = lado > 0 ? yTopoHp : yBaixoHp;           // onde as aletas terminam
        const yC = yF + lado * (rCurva * 0.35);               // centro da curva (curva achatada, cabe na altura)
        const yApice = lado > 0 ? Hc - rHp : y0 + rHp;
        const ycore = (y0 + 18 + Hc - 16) / 2;
        const dirX = i % 2 ? 1 : -1;
        const pts = [
          new THREE.Vector3(x, ycore + lado * 8, zLo), new THREE.Vector3(x, yF - lado * 6, zLo), new THREE.Vector3(x, yC, zLo + 0.6),
          new THREE.Vector3(x, yApice, zm - 3), new THREE.Vector3(x, yC, zHi - 0.6), new THREE.Vector3(x, yF - lado * 6, zHi),
          new THREE.Vector3(x + dirX * 7, yF - lado * 13, zHi), new THREE.Vector3(Math.max(24, Math.min(pcbL - 6, x + dirX * (60 + i * 9))), yF - lado * 14, zHi)
        ];
        g.add(tubo(pts, rHp, null, niquel));
      };
      topo.forEach((x, i) => hp(x, 1, i));
      baixo.forEach((x, i) => hp(x, -1, i));
      col.push(box3(faixaT[0], faixaT[1], yTopoHp, Hc, zAleta, Tc));
      col.push(box3(faixaB[0], faixaB[1], y0, yBaixoHp, zAleta, Tc));
      // bosses de fixação do shroud (ficam no dissipador sem o shroud)
      for (const [bx, by] of [[20, y0 + 5], [20, yTopo - 5], [pcbL * 0.62, y0 + 4], [pcbL * 0.62, yTopo - 4], [L - 6, y0 + 5], [L - 6, yTopo - 5]]) {
        const b = cilindro(2.6, 3.2, matFrame, 16);
        b.rotation.x = Math.PI / 2;
        b.position.set(bx, by, Tc - 1.2);
        g.add(b);
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
        const fm = fan(fanSpec, { rgb, setaCor: '#4aa3ff', fotoCubo: fotos.cubo });
        fm.rotation.x = Math.PI;
        if (fm.userData.rotor) fm.userData.rotor.rotation.z = Math.PI; // adesivo do cubo de pé, visto pelo vidro
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
          // cabeça da trava no lado dos fans, perto da borda de cima
          g.add(caixa(x - 3.2, x + 3.2, yMax - 11, yMax - 3, zTop + 1.2, zTop + 5.2, amarra));
          col.push(box3(x - 3.2, x + 3.2, yMin, yMax, -1.2, zTop + 5.2));
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
    // fotos reais: face das aletas (lado dos fans) e borda de cima
    if (fotos.frente) {
      const tf = texturaFoto(fotos.frente);
      const frente = new THREE.Mesh(new THREE.PlaneGeometry(L, Hc - y0), materialCache('gpuFrente|' + tf.uuid, () => new THREE.MeshStandardMaterial({ map: tf, roughness: 0.38, metalness: 0.6 })));
      frente.position.set(L / 2, (y0 + Hc) / 2, Tc + 0.3);
      frente.receiveShadow = true;
      g.add(frente);
    }
    if (fotos.borda) {
      const tf = texturaFoto(fotos.borda);
      const borda = new THREE.Mesh(new THREE.PlaneGeometry(L, Tc), materialCache('gpuBorda|' + tf.uuid, () => new THREE.MeshStandardMaterial({ map: tf, roughness: 0.38, metalness: 0.6 })));
      borda.rotation.x = -Math.PI / 2;
      borda.position.set(L / 2, Hc + 0.3, Tc / 2);
      borda.receiveShadow = true;
      g.add(borda);
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
    const aco = pintado(cor, 0.48, 0.32);
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
      // tela vista de longe fica cinza: a chapa perfurada brilha nas bordas dos furos
      const corTela = '#' + new THREE.Color(cor).lerp(new THREE.Color('#8a8f96'), 0.16).getHexString();
      const tx = T.painelPerfurado(nome + (p.faixa || '') + (p.rodape || ''), Math.round(w), Math.round(h), corTela, { solidos, textos, passo: p.passo || 5, furo: p.furo || 3.4 });
      const mat = materialCache('painel|' + tx.map.uuid, () => {
        const m = new THREE.MeshStandardMaterial({ map: tx.map, alphaMap: tx.alpha, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.46, metalness: 0.34 });
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

    // base: dois trilhos laterais, cada um com um pé na frente e outro atrás
    // (pontas chanfradas, como nas fotos) e sapatas de borracha
    const pe = (xa, xb, za, zb) => {
      const f = new THREE.Shape();
      const L = zb - za, h = pes - 2, ch = 7;
      f.moveTo(ch, 0); f.lineTo(L - ch, 0); f.lineTo(L, h); f.lineTo(0, h); f.closePath();
      const m = extrudar(f, xb - xa, acoEscuro, 0.6);
      m.rotation.y = -Math.PI / 2;
      m.position.set(xb, 0, za);
      grupo.add(m);
      grupo.add(caixaR(xa + 1.5, xb - 1.5, 0, 2.2, za + ch + 2, zb - ch - 2, 0.8, borrachaPe, 2));
    };
    for (const [xa, xb] of [[x0 + 10, x0 + 34], [x1 - 34, x1 - 10]]) {
      pe(xa, xb, z0 + 18, z0 + 96);
      pe(xa, xb, z1 - 96, z1 - 18);
      grupo.add(caixaR(xa, xb, pes - 8, pes - 2, z0 + 60, z1 - 60, 1.2, acoEscuro, 2));
    }
    const piso = caixa(x0 + tL, x1 - tR, pes, pes + tB, z0 + tRe, z1 - tF, P.fundo.tipo === 'tela' ? tela(cor, W, D) : aco);
    grupo.add(piso);
    grupo.add(caixaR(x0, x1, pes - 2.5, pes + 0.2, z0, z1, 1.5, acoEscuro, 2));

    // estrutura (colunas e travessas) com arestas arredondadas
    const e = 7, re = 2.2;
    const colunas = [[x0, z0], [x1 - e, z0], [x1 - e, z1 - e]];
    if (!spec.semColuna) colunas.push([x0, z1 - e]);
    for (const [cx, cz] of colunas) grupo.add(caixaR(cx, cx + e, pes, H, cz, cz + e, re, aco));
    for (const cz of [z0, z1 - e]) grupo.add(caixaR(x0, x1, H - e, H, cz, cz + e, re, aco));
    for (const cx of [x0, x1 - e]) grupo.add(caixaR(cx, cx + e, H - e, H, z0, z1, re, aco));
    grupo.add(caixaR(x0, x1, pes, pes + e, z1 - e, z1, re, aco));
    grupo.add(caixaR(x0, x1, pes, pes + e, z0, z0 + e, re, aco));

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
      const gd = new THREE.Group();
      const m = painelTela('direito', P.direito, D, H - pes);
      m.rotation.y = Math.PI / 2;
      m.position.set(x1 - 0.8, (pes + H) / 2, 0);
      gd.add(m);
      // faixa sólida em relevo com o nome (como nas fotos)
      if (P.direito.faixa) {
        const ya = pes + (H - pes) * (1 - P.direito.faixa[1]), yb = pes + (H - pes) * (1 - P.direito.faixa[0]);
        gd.add(caixaR(x1 - 1.2, x1 + 0.9, ya, yb, z0 + 6, z1 - 6, 0.9, aco, 2));
        if (P.direito.logo && T) {
          const tx = canvasTex('logoLateral|' + P.direito.logo, 512, 64, (g, w, h) => {
            g.clearRect(0, 0, w, h);
            g.fillStyle = '#9ca1a8';
            g.font = '900 38px "Arial Black", Arial, sans-serif';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            if ('letterSpacing' in g) g.letterSpacing = '6px';
            g.fillText(P.direito.logo, w / 2, h / 2 + 2);
          }, { cor: true });
          const logo = new THREE.Mesh(new THREE.PlaneGeometry(88, 11), materialCache('logoLat|' + tx.uuid, () => new THREE.MeshStandardMaterial({ map: tx, transparent: true, roughness: 0.4, metalness: 0.5 })));
          logo.rotation.y = Math.PI / 2;
          logo.position.set(x1 + 0.95, (ya + yb) / 2, z0 + 70);
          gd.add(logo);
        }
      }
      addPainel('direito', new THREE.Vector3(1, 0, 0), gd, 'tela');
    } else addPainel('direito', new THREE.Vector3(1, 0, 0), caixa(x1 - tR, x1, pes, H, z0, z1, matPainel(P.direito, D, H - pes)), P.direito.tipo);
    // topo
    if (P.topo.tipo === 'tela') {
      const m = painelTela('topo', P.topo, W - 2 * e, D - 2 * e);
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, H - 1.2, 0);
      addPainel('topo', new THREE.Vector3(0, 1, 0), m, 'tela');
    } else addPainel('topo', new THREE.Vector3(0, 1, 0), caixa(x0 + e, x1 - e, H - tT, H - 0.5, z0 + e, z1 - e, matPainel(P.topo, W, D)), P.topo.tipo);
    // frente: tela sobre a coluna de fans + faixa sólida à direita com o painel de I/O
    {
      const F = P.frente;
      const g = new THREE.Group();
      const fl = F.tipo === 'tela' ? F.faixaLateral || 0 : 0;
      const wm = W - fl;
      if (F.tipo === 'tela') {
        const m = painelTela('frente', F, wm, H - pes);
        m.position.set(x0 + wm / 2, (pes + H) / 2, z1 - 0.8);
        g.add(m);
        // moldura da tela (chapa dobrada nas bordas)
        g.add(caixaR(x0, x0 + wm, H - 4, H, z1 - 3, z1, 1, aco, 2), caixaR(x0, x0 + wm, pes, pes + 4, z1 - 3, z1, 1, aco, 2), caixaR(x0, x0 + 4, pes, H, z1 - 3, z1, 1, aco, 2));
      } else {
        const m = F.tipo === 'vidro' ? caixa(x0, x1, pes, H, z1 - tF, z1, matPainel(F, W, H - pes)) : caixaR(x0, x1, pes, H, z1 - tF, z1, 1.5, aco);
        if (F.tipo === 'vidro') m.castShadow = false;
        g.add(m);
      }
      if (fl) {
        const xs = x1 - fl;
        g.add(caixaR(xs, x1, pes, H, z1 - 3.2, z1, 1.4, aco));
        g.add(caixa(xs - 1.2, xs, pes, H, z1 - tF, z1 - 0.4, acoEscuro));
        g.add(caixa(xs, x1, pes, H, z1 - tF, z1 - 3.2, acoEscuro));
        // painel de I/O: botão liga com anel de LED, USB-C, 2× USB-A e P2 combo
        const yc = pes + (H - pes) * (F.io || 0.5);
        const cx = xs + fl / 2;
        const moldura = std('#0b0c0e', 0.4, 0.3);
        g.add(caixaR(cx - 36, cx + 36, yc - 9.5, yc + 9.5, z1 - 1, z1 + 0.9, 3, moldura));
        const furo = std('#030304', 0.9, 0);
        const lingueta = std('#1b1d21', 0.5, 0.2);
        let px = cx - 27;
        const botao = cilindro(5.2, 2.2, std('#15171a', 0.25, 0.7), 32);
        botao.rotation.x = Math.PI / 2;
        botao.position.set(px, yc, z1 + 1.6);
        g.add(botao);
        const anel = new THREE.Mesh(new THREE.TorusGeometry(5.9, 0.55, 8, 40), luz('#dfe8ff', 1.2));
        anel.position.set(px, yc, z1 + 1.1);
        g.add(anel);
        px += 13;
        g.add(caixaR(px - 4.5, px + 4.5, yc - 1.8, yc + 1.8, z1 + 0.2, z1 + 1.2, 1.7, furo, 2)); // USB-C
        px += 12;
        for (let i = 0; i < 2; i++) {
          g.add(caixa(px - 6.5, px + 6.5, yc - 3, yc + 3, z1 + 0.6, z1 + 1.1, furo));
          g.add(caixa(px - 5.5, px + 5.5, yc + 0.2, yc + 1.8, z1 + 0.8, z1 + 1.15, lingueta));
          px += 15;
        }
        const p2 = cilindro(2.1, 1.2, furo, 20);
        p2.rotation.x = Math.PI / 2;
        p2.position.set(px - 2, yc, z1 + 0.8);
        g.add(p2);
      }
      // suporte dos fans da frente: chapa com janelas arredondadas (aparece através da tela)
      if (F.suporteFans && F.tipo === 'tela') {
        const u0 = x0 + tL, u1 = x0 + wm - 1, v0 = pes + tB, v1 = H - tT;
        const forma = new THREE.Shape();
        forma.moveTo(u0, v0); forma.lineTo(u1, v0); forma.lineTo(u1, v1); forma.lineTo(u0, v1); forma.closePath();
        const cols = 2, lins = 5, mg = 8, gx = 6, gy = 6;
        const jw = (u1 - u0 - 2 * mg - (cols - 1) * gx) / cols, jh = (v1 - v0 - 2 * mg - (lins - 1) * gy) / lins;
        for (let c = 0; c < cols; c++) {
          for (let l = 0; l < lins; l++) {
            const a0 = u0 + mg + c * (jw + gx), b0 = v0 + mg + l * (jh + gy);
            forma.holes.push(furoRet(a0, b0, a0 + jw, b0 + jh, 9));
          }
        }
        const sup = extrudar(forma, 1.2, acoEscuro);
        sup.position.z = z1 - tF - 1.2;
        g.add(sup);
      }
      addPainel('frente', new THREE.Vector3(0, 0, 1), g, F.tipo);
    }
    // traseira: chapa com recortes; no Model 5 Vent é uma grade de furos quadrados
    {
      const G = extras.traseiraGrade;
      const forma = new THREE.Shape();
      forma.moveTo(x0 + tL, pes);
      forma.lineTo(x1 - tR, pes);
      forma.lineTo(x1 - tR, H - tT);
      forma.lineTo(x0 + tL, H - tT);
      forma.lineTo(x0 + tL, pes);
      const recortes = extras.furosTraseira.filter((f) => !(G && f.tela));
      for (const f of recortes) forma.holes.push(furoRet(f.x0, f.y0, f.x1, f.y1, f.r || 0));
      if (G && G.placa) forma.holes.push(furoRet(G.placa.x0, G.placa.y0, G.placa.x1, G.placa.y1, 2));
      const g = new THREE.Group();
      if (G && T) {
        const geo = new THREE.ShapeGeometry(forma, 6);
        const uv = geo.attributes.uv, ps = geo.attributes.position;
        for (let i = 0; i < ps.count; i++) uv.setXY(i, (ps.getX(i) - x0) / W, (ps.getY(i) - pes) / (H - pes));
        // zonas sem furos: em volta dos recortes e da placa de slots, e a faixa do lado da bandeja
        const solidos = recortes.map((f) => ({ x0: f.x0 - x0 - 5, x1: f.x1 - x0 + 5, y0: f.y0 - pes - 5, y1: f.y1 - pes + 5 }));
        // a coluna do I/O e da tomada (lado da bandeja) é chapa lisa, como na foto
        const io = recortes.find((f) => f.io);
        if (io) solidos.push({ x0: io.x0 - x0 - 6, x1: W, y0: (G.placa ? G.placa.y1 : io.y0) - pes + 4, y1: H - pes });
        if (G.placa) solidos.push({ x0: G.placa.x0 - x0 - 5, x1: G.placa.x1 - x0 + 5, y0: G.placa.y0 - pes - 5, y1: G.placa.y1 - pes + 5 });
        const tx = T.gradeQuadrada('traseira' + JSON.stringify(solidos.map((r) => Math.round(r.x0) + ',' + Math.round(r.y0))), Math.round(W), Math.round(H - pes), cor, { passo: G.passo, furo: G.furo, solidos });
        const mat = materialCache('traseiraGrade|' + tx.map.uuid, () => new THREE.MeshStandardMaterial({ map: tx.map, alphaMap: tx.alpha, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.48, metalness: 0.32 }));
        for (const dz of [0.2, tRe - 0.2]) {
          const m = new THREE.Mesh(geo, mat);
          m.position.z = z0 + dz;
          g.add(m);
        }
        // placa de slots (7), deitada ou girada, com as tampas
        if (G.placa) {
          const pl = G.placa;
          const fp = new THREE.Shape();
          fp.moveTo(pl.x0, pl.y0); fp.lineTo(pl.x1, pl.y0); fp.lineTo(pl.x1, pl.y1); fp.lineTo(pl.x0, pl.y1); fp.closePath();
          const tampas = pl.vertical ? extras.tampasVerticais : extras.tampasSlot;
          for (const t of tampas) fp.holes.push(furoRet(t.x0, t.y0, t.x1, t.y1, 1));
          const placa = extrudar(fp, 1.4, aco);
          placa.position.z = z0 - 1.4;
          g.add(placa);
          const matTampa = pintado(cor, 0.45, 0.35);
          for (const t of tampas) {
            if (t.ocupada) continue;
            g.add(caixa(t.x0 + 0.4, t.x1 - 0.4, t.y0 + 0.4, t.y1 - 0.4, z0 - 1.9, z0 - 0.6, matTampa));
            // furinhos de ventilação da tampa
            const alongado = pl.vertical;
            const n = 6;
            for (let k = 0; k < n; k++) {
              const f = (k + 0.5) / n;
              if (alongado) { const y = t.y0 + 12 + f * (t.y1 - t.y0 - 24); g.add(caixa(t.x0 + 5, t.x1 - 5, y - 2.5, y + 2.5, z0 - 2, z0 - 1.85, std('#050506', 0.8, 0))); }
              else { const x = t.x0 + 12 + f * (t.x1 - t.x0 - 24); g.add(caixa(x - 2.5, x + 2.5, t.y0 + 5, t.y1 - 5, z0 - 2, z0 - 1.85, std('#050506', 0.8, 0))); }
            }
            // parafuso borboleta
            const pf = cilindro(3.2, 3, std('#1a1b1e', 0.4, 0.8), 16);
            pf.rotation.x = Math.PI / 2;
            if (alongado) pf.position.set((t.x0 + t.x1) / 2, t.y1 + 4.5, z0 - 3.2);
            else pf.position.set(t.x1 + 4.5, (t.y0 + t.y1) / 2, z0 - 3.2);
            g.add(pf);
          }
        }
        // moldura da traseira
        g.add(caixaR(x0 + tL, x1 - tR, H - tT - 6, H - tT, z0, z0 + tRe + 1, 1, aco, 2), caixaR(x0 + tL, x1 - tR, pes, pes + 6, z0, z0 + tRe + 1, 1, aco, 2));
      } else {
        const m = extrudar(forma, tRe, aco);
        m.position.z = z0;
        g.add(m);
        for (const t of extras.tampasSlot) if (!t.ocupada) g.add(caixa(t.x0, t.x1, t.y0, t.y1, z0 - 1.2, z0, std(cor, 0.4, 0.6)));
      }
      for (const f of extras.furosTraseira) {
        if (f.tela && !G) {
          const w = Math.abs(f.x1 - f.x0), h = Math.abs(f.y1 - f.y0);
          const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), tela(cor, w, h, 5));
          pl.position.set((f.x0 + f.x1) / 2, (f.y0 + f.y1) / 2, z0 + tRe / 2);
          g.add(pl);
        }
        if (f.ac) {
          // tomada C14 (extensão para a fonte lá na frente)
          const w = f.x1 - f.x0, hh = f.y1 - f.y0, cx = (f.x0 + f.x1) / 2, cy = (f.y0 + f.y1) / 2;
          g.add(caixaR(f.x0 - 1, f.x1 + 1, f.y0 - 1, f.y1 + 1, z0 - 2.2, z0 + 1, 1.5, std('#0d0e10', 0.55, 0.1), 2));
          g.add(caixa(cx - w * 0.36, cx + w * 0.36, cy - hh * 0.28, cy + hh * 0.28, z0 - 2.4, z0 - 2.2, std('#020203', 0.9, 0)));
          for (const dx of [-0.2, 0, 0.2]) g.add(caixa(cx + dx * w - 0.9, cx + dx * w + 0.9, cy - 3, cy + 3, z0 - 2.3, z0 - 1.2, std('#b9bdc3', 0.3, 0.9)));
        }
      }
      addPainel('traseira', new THREE.Vector3(0, 0, -1), g, 'metal');
    }

    // bandeja da placa-mãe (com recortes)
    {
      const Bx = extras.bandejaMundoX;
      const forma = new THREE.Shape();
      const u0 = tRe, u1 = extras.bandejaAteZ || D - tF, v0 = pes + tB, v1 = H - tT;
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

    // suporte do fan da lateral direita: chapa com 4 × 4 furos quadrados grandes
    if (extras.suporteLateral) {
      const sl = extras.suporteLateral;
      const f = new THREE.Shape();
      f.moveTo(sl.z0, sl.y0); f.lineTo(sl.z1, sl.y0); f.lineTo(sl.z1, sl.y1); f.lineTo(sl.z0, sl.y1); f.closePath();
      const n = 4, mg = 7, gap = 5;
      const lw = (sl.z1 - sl.z0 - 2 * mg - (n - 1) * gap) / n, lh = (sl.y1 - sl.y0 - 2 * mg - (n - 1) * gap) / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const a0 = sl.z0 + mg + i * (lw + gap), b0 = sl.y0 + mg + j * (lh + gap);
        f.holes.push(furoRet(a0, b0, a0 + lw, b0 + lh, 4));
      }
      const chapa = extrudar(f, 1.2, aco);
      chapa.rotation.y = -Math.PI / 2;
      chapa.position.set(sl.x, 0, 0);
      grupo.add(chapa);
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
      if (faces.includes('esquerda')) {
        const f = new THREE.Shape();
        f.moveTo(bx.min.z, bx.min.y); f.lineTo(bx.max.z, bx.min.y); f.lineTo(bx.max.z, bx.max.y); f.lineTo(bx.min.z, bx.max.y); f.closePath();
        // janela curva (como a das fotos) com tela atrás
        const jan = new THREE.Path();
        const zc = bx.min.z + dd * 0.52, yc = (bx.min.y + bx.max.y) / 2, rj = Math.min(dd, h) * 0.34;
        jan.absellipse(zc, yc, rj * 1.25, rj, 0, Math.PI * 2, true);
        f.holes.push(jan);
        const chapa = extrudar(f, 1.2, aco);
        chapa.rotation.y = -Math.PI / 2;
        chapa.position.set(bx.min.x, 0, 0);
        grupoCaixa = grupoCaixa || new THREE.Group();
        add(chapa);
        const telaJ = new THREE.Mesh(new THREE.PlaneGeometry(rj * 2.6, rj * 2.1), mat(rj * 2.6, rj * 2.1));
        telaJ.rotation.y = -Math.PI / 2;
        telaJ.position.set(bx.min.x + 0.8, yc, zc);
        add(telaJ);
      }
      if (faces.includes('direita')) add(caixa(bx.max.x - 1, bx.max.x, bx.min.y, bx.max.y, bx.min.z, bx.max.z, mat(dd, h)));
      if (faces.includes('baixo')) add(caixa(bx.min.x, bx.max.x, bx.min.y, bx.min.y + 1, bx.min.z, bx.max.z, mat(w, dd)));
      if (faces.includes('cima')) add(caixa(bx.min.x, bx.max.x, bx.max.y - 1, bx.max.y, bx.min.z, bx.max.z, mat(w, dd)));
      if (faces.includes('traseira')) add(caixa(bx.min.x, bx.max.x, bx.min.y, bx.max.y, bx.min.z, bx.min.z + 1, mat(w, h)));
      if (faces.includes('frente')) add(caixa(bx.min.x, bx.max.x, bx.min.y, bx.max.y, bx.max.z - 1, bx.max.z, mat(w, h)));
    }

    // suporte vertical da GPU (tampas verticais)
    if (!extras.traseiraGrade) for (const tp of extras.tampasVerticais) if (!tp.ocupada) grupo.add(caixa(tp.x0, tp.x1, tp.y0, tp.y1, z0 + tRe, z0 + tRe + 1.2, std(cor, 0.4, 0.6)));

    grupo.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    return { grupo, paineis, caixaFonte: typeof grupoCaixa !== 'undefined' ? grupoCaixa : null };
  }

  return {
    std, luz, vidro, tela, caixa, caixaR, geoCaixaR, box3, cilindro, extrudar, retArredondado, seta, materialCache, plastico, liberarFoto,
    fan, radiador, bomba, placaMae, memoria, fonte, placaDeVideo, riser, tubo, gabinete,
    layoutPlacaMae, texturas: T
  };
};
