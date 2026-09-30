/*
 * Cabos da fonte: cada cabo é desenhado fio a fio (fileiras × fios),
 * seguindo um caminho suave, com o conector nas duas pontas.
 * Estilos: 'originais' (fios pretos lisos) ou 'trancados' (extensões
 * com malha trançada e pentes organizadores).
 */
window.PCBCabos = function (THREE, M) {
  'use strict';

  const T = M.texturas;

  /* Junta várias geometrias indexadas (position/normal/uv) numa só. */
  function fundir(geos) {
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index.count; }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const idx = new (nv > 65535 ? Uint32Array : Uint16Array)(ni);
    let ov = 0, oi = 0;
    for (const g of geos) {
      pos.set(g.attributes.position.array, ov * 3);
      nor.set(g.attributes.normal.array, ov * 3);
      uv.set(g.attributes.uv.array, ov * 2);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) idx[oi + i] = gi[i] + ov;
      ov += g.attributes.position.count;
      oi += gi.length;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }

  /* Referenciais ao longo da curva, sem torção (transporte paralelo) e
     com a largura do chicote casando com a dos conectores nas pontas.   */
  function referenciais(curva, n, largIni, largFim) {
    const pts = [], tan = [], larg = [], nor = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      pts.push(curva.getPointAt(u));
      tan.push(curva.getTangentAt(u).normalize());
    }
    const projetar = (v, t) => v.clone().addScaledVector(t, -v.dot(t)).normalize();
    let w = projetar(largIni, tan[0]);
    for (let i = 0; i <= n; i++) {
      if (i) w = projetar(w, tan[i]);
      if (!isFinite(w.x) || w.lengthSq() < 0.5) w = projetar(new THREE.Vector3(0, 1, 0), tan[i]);
      larg.push(w.clone());
    }
    // distribui a correção de torção até a largura final
    const alvo = projetar(largFim, tan[n]);
    let ang = Math.atan2(new THREE.Vector3().crossVectors(larg[n], alvo).dot(tan[n]), larg[n].dot(alvo));
    if (Math.abs(ang) > Math.PI / 2) ang -= Math.sign(ang) * Math.PI; // chicote é simétrico: 180° não importa
    for (let i = 0; i <= n; i++) {
      larg[i].applyAxisAngle(tan[i], ang * (i / n));
      nor.push(new THREE.Vector3().crossVectors(tan[i], larg[i]).normalize());
    }
    return { pts, tan, larg, nor };
  }

  function materialFio(estilo, cor, comp) {
    if (estilo === 'trancados' && T) {
      const tr = T.trancado(cor);
      const k = Math.max(4, Math.round(comp / 5));
      return M.materialCache('fio|' + cor + '|' + k, () => {
        const m1 = tr.map.clone(), b1 = tr.bump.clone();
        for (const t of [m1, b1]) { t.needsUpdate = true; t.repeat.set(k, 1); }
        return new THREE.MeshStandardMaterial({ map: m1, bumpMap: b1, bumpScale: 0.6, roughness: 0.62, metalness: 0.02 });
      });
    }
    return M.std(cor, 0.42, 0.02);
  }

  /*
   * pontos: caminho do chicote (Vector3 do mundo), da fonte até a peça.
   * opts: { fileiras, fios, passo, raio, estilo, cor, largIni, largFim,
   *         conectorIni: {dir}, conectorFim: {dir}, pentes }
   */
  function chicote(pontos, opts) {
    const o = Object.assign({ fileiras: 2, fios: 12, passo: 3.6, raio: 1.55, estilo: 'originais', cor: '#0e0f11', pentes: false }, opts);
    const g = new THREE.Group();
    const curva = new THREE.CatmullRomCurve3(pontos, false, 'centripetal', 0.5);
    const comp = curva.getLength();
    const n = Math.max(24, Math.min(90, Math.round(comp / 6)));
    const R = referenciais(curva, n, o.largIni || new THREE.Vector3(0, 1, 0), o.largFim || o.largIni || new THREE.Vector3(0, 1, 0));
    const geos = [];
    for (let r = 0; r < o.fileiras; r++) {
      for (let c = 0; c < o.fios; c++) {
        const ow = (c - (o.fios - 1) / 2) * o.passo;
        const on = (r - (o.fileiras - 1) / 2) * o.passo;
        const pts = R.pts.map((p, i) => p.clone().addScaledVector(R.larg[i], ow).addScaledVector(R.nor[i], on));
        geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), n, o.raio, 7, false));
      }
    }
    const fios = new THREE.Mesh(fundir(geos), materialFio(o.estilo, o.cor, comp));
    fios.castShadow = true;
    fios.receiveShadow = true;
    g.add(fios);

    // conectores (caixinhas pretas nas pontas)
    const plugue = M.std('#101113', 0.5, 0.05);
    const conector = (i, sentido) => {
      const w = o.fios * o.passo + 2.4, h = o.fileiras * o.passo + 2.4, prof = 12;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, prof), plugue);
      const t = R.tan[i].clone().multiplyScalar(sentido);
      const base = new THREE.Matrix4().makeBasis(R.larg[i], R.nor[i], t);
      m.quaternion.setFromRotationMatrix(base);
      m.position.copy(R.pts[i]).addScaledVector(t, -prof / 2 + 0.5);
      m.castShadow = true;
      g.add(m);
    };
    conector(0, -1);
    conector(n, 1);

    // pentes organizadores (só nas extensões trançadas)
    if (o.pentes && o.estilo === 'trancados') {
      const pente = M.std('#f4f5f7', 0.35, 0);
      const qtd = comp > 220 ? 3 : comp > 120 ? 2 : 1;
      for (let k = 1; k <= qtd; k++) {
        const i = Math.round((k / (qtd + 1)) * n);
        const m = new THREE.Mesh(new THREE.BoxGeometry(o.fios * o.passo + 1.6, o.fileiras * o.passo + 1.6, 3.2), pente);
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(R.larg[i], R.nor[i], R.tan[i]));
        m.position.copy(R.pts[i]);
        m.castShadow = true;
        g.add(m);
      }
    }
    g.userData.comprimento = comp;
    return g;
  }

  return { chicote, fundir };
};
