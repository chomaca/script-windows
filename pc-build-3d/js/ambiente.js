/*
 * Ambiente de estúdio: reflexos (mapa de ambiente com softboxes),
 * fundo em degradê, chão com reflexo e luzes do RGB que iluminam as peças.
 * Não depende do DOM além de um <canvas> para o degradê do fundo.
 */
window.PCBAmbiente = function (THREE, deps) {
  'use strict';
  deps = deps || {};

  /* ---------------- reflexos: estúdio com softboxes ----------------
   * Uma sala escura com painéis de luz (valores > 1 = HDR). O PMREM
   * transforma isso no mapa que as peças metálicas e o vidro refletem.
   * Mundo: vidro em −X, frente em +Z.                                   */
  function cenaEstudio(claro) {
    const cena = new THREE.Scene();
    const basico = (cor, k = 1, lado = THREE.FrontSide) => new THREE.MeshBasicMaterial({ color: new THREE.Color(cor).multiplyScalar(k), side: lado });
    // claro = estúdio de foto de produto (fundo infinito branco); escuro = sala escura com softboxes
    const sala = new THREE.Mesh(new THREE.BoxGeometry(36, 18, 36), basico(claro ? '#c4c7cc' : '#1b1c1f', claro ? 1.1 : 1, THREE.BackSide));
    sala.position.y = 6;
    cena.add(sala);
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(36, 36), basico(claro ? '#d9dbde' : '#2b2d31', claro ? 1.1 : 1));
    chao.rotation.x = -Math.PI / 2;
    chao.position.y = -2.9;
    cena.add(chao);
    const painel = (w, h, k, cor, pos, alvo = [0, 0, 0]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basico(cor, k, THREE.DoubleSide));
      m.position.set(...pos);
      m.lookAt(...alvo);
      cena.add(m);
      return m;
    };
    painel(9, 6, 9, '#fff4e6', [-7, 9, 8]);            // principal: alto, frente-esquerda
    painel(12, 12, 2.2, '#f2f5fa', [0, 11.8, 0]);        // teto difuso
    painel(3, 12, 2.4, '#eef2f8', [15, 3, 3]);           // preenchimento à direita
    painel(2.2, 13, 6.5, '#dbe6ff', [-14, 4, -7]);       // faixa alta atrás-esquerda (risco no vidro)
    painel(2, 11, 4.5, '#ffe9d6', [-5, 3, -15]);         // contraluz traseiro
    painel(14, 1.1, 3.2, '#ffffff', [0, 1.4, 15]);       // faixa baixa na frente
    return cena;
  }

  const envTex = {};
  function ambienteEstudio(renderer, claro) {
    const k = claro ? 'claro' : 'escuro';
    if (envTex[k]) return envTex[k];
    const pmrem = new THREE.PMREMGenerator(renderer);
    const cena = cenaEstudio(!!claro);
    envTex[k] = pmrem.fromScene(cena, 0.035, 0.1, 100).texture;
    cena.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    pmrem.dispose();
    return envTex[k];
  }

  /* ---------------- fundo em degradê (vinheta de estúdio) ---------------- */
  let fundoTex = null;
  function fundo(corCentro, corBorda) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(256, 210, 20, 256, 256, 400);
    gr.addColorStop(0, corCentro);
    gr.addColorStop(1, corBorda);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    // ruído fino para não criar faixas no degradê
    const img = g.getImageData(0, 0, 512, 512), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 3; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
    if (fundoTex) fundoTex.dispose();
    fundoTex = new THREE.CanvasTexture(c);
    fundoTex.colorSpace = THREE.SRGBColorSpace;
    return fundoTex;
  }

  /* ---------------- chão com reflexo (qualidade ultra) ----------------
   * Usa o Reflector do Three.js com um shader próprio: reflexo fraco,
   * levemente desfocado e que some com a distância do gabinete.        */
  const ShaderReflexo = {
    name: 'ReflexoChao',
    uniforms: {
      color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
      forca: { value: 0.22 }, raio: { value: 900 }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }
    },
    vertexShader: /* glsl */`
      uniform mat4 textureMatrix;
      varying vec4 vUv;
      varying vec3 vPos;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vUv = textureMatrix * vec4(position, 1.0);
        vPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      uniform sampler2D tDiffuse;
      uniform float forca;
      uniform float raio;
      uniform vec2 texel;
      varying vec4 vUv;
      varying vec3 vPos;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec2 uv = vUv.xy / vUv.w;
        vec3 soma = vec3(0.0);
        float peso = 0.0;
        for (int i = -2; i <= 2; i++) {
          for (int j = -2; j <= 2; j++) {
            float w = 1.0 / (1.0 + float(i * i + j * j));
            soma += texture2D(tDiffuse, uv + vec2(float(i), float(j)) * texel * 1.6).rgb * w;
            peso += w;
          }
        }
        vec3 ref = soma / peso;
        float d = length(vPos.xz) / raio;
        float fade = forca * (1.0 - smoothstep(0.15, 1.0, d));
        gl_FragColor = vec4(ref * color, fade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  };

  function criarReflexo(largura, altura) {
    if (!deps.Reflector) return null;
    const geo = new THREE.PlaneGeometry(6000, 6000);
    const r = new deps.Reflector(geo, {
      textureWidth: Math.max(256, Math.round(largura)), textureHeight: Math.max(256, Math.round(altura)),
      color: 0xb8bcc2, clipBias: 0.002, shader: ShaderReflexo
    });
    r.material.transparent = true;
    r.material.depthWrite = false;
    r.material.uniforms.texel.value.set(1 / Math.max(256, largura), 1 / Math.max(256, altura));
    r.rotation.x = -Math.PI / 2;
    r.position.y = -0.2;
    r.renderOrder = -1;
    r.userData.reflexo = true;
    return r;
  }

  /* ---------------- RGB: emissores + luzes coloridas ----------------
   * Cada peça com RGB ganha uma luz pontual no centro dos seus LEDs.
   * Se houver luzes demais, as mais próximas são juntadas.            */
  const COR_APAGADO = new THREE.Color('#dfe2e6');
  function coletarRGB(raiz) {
    const emissores = [];
    const porParte = new Map();
    const caixa = new THREE.Box3(), centro = new THREE.Vector3();
    raiz.updateMatrixWorld(true);
    raiz.traverse((o) => {
      if (!o.isMesh || !o.userData.rgb || !o.material) return;
      // material próprio para poder animar cada LED
      const base = o.material;
      const m = base.clone();
      m.userData = { rgbClone: true };
      o.material = m;
      caixa.setFromObject(o);
      caixa.getCenter(centro);
      const e = { mesh: o, mat: m, cor: base.color.clone(), intensidade: base.emissiveIntensity, temMapa: !!base.emissiveMap, pos: centro.clone(), tmp: new THREE.Color() };
      emissores.push(e);
      const pid = o.userData.parteId || 'x';
      if (!porParte.has(pid)) porParte.set(pid, []);
      porParte.get(pid).push(e);
    });
    const grupos = [];
    for (const lista of porParte.values()) {
      const p = new THREE.Vector3();
      for (const e of lista) p.add(e.pos);
      grupos.push({ pos: p.multiplyScalar(1 / lista.length), peso: lista.length });
    }
    return { emissores, grupos, luzes: [], pai: raiz };
  }

  /* (Re)cria as luzes coloridas; junta as mais próximas se passar do limite. */
  function luzesRGB(rgb, maxLuzes) {
    if (!rgb) return;
    for (const l of rgb.luzes) { if (l.parent) l.parent.remove(l); l.dispose(); }
    rgb.luzes = [];
    if (maxLuzes <= 0) return;
    let grupos = rgb.grupos.map((g) => ({ pos: g.pos.clone(), peso: g.peso }));
    while (grupos.length > maxLuzes && grupos.length > 1) {
      let melhor = [0, 1], dist = Infinity;
      for (let i = 0; i < grupos.length; i++) for (let j = i + 1; j < grupos.length; j++) {
        const d = grupos[i].pos.distanceToSquared(grupos[j].pos);
        if (d < dist) { dist = d; melhor = [i, j]; }
      }
      const [a, b] = melhor, A = grupos[a], B = grupos[b];
      const peso = A.peso + B.peso;
      const pos = A.pos.clone().multiplyScalar(A.peso / peso).add(B.pos.clone().multiplyScalar(B.peso / peso));
      grupos = grupos.filter((_, k) => k !== a && k !== b).concat([{ pos, peso }]);
    }
    rgb.luzes = grupos.map((g) => {
      const l = new THREE.PointLight(0xffffff, 0, 420, 2);
      l.position.copy(g.pos);
      l.userData.peso = Math.min(3, g.peso);
      l.userData.luzRGB = true;
      rgb.pai.add(l);
      return l;
    });
  }

  const tmpCor = new THREE.Color();
  /* modo: 'fixo' | 'arco-iris' | 'respirar' | 'desligado'. Retorna true se anima. */
  function atualizarRGB(rgb, modo, cor, t, forcaLuz = 1) {
    if (!rgb) return false;
    const base = tmpCor.set(cor);
    const fase = (p) => (t * 0.07 + (p.z + p.y * 0.8) / 1400) % 1;
    const resp = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * 2.1));
    for (const e of rgb.emissores) {
      const m = e.mat;
      if (modo === 'desligado') {
        if (!e.temMapa) m.color.copy(COR_APAGADO);
        m.emissiveIntensity = 0;
        continue;
      }
      let c = base;
      if (modo === 'arco-iris') c = e.tmp.setHSL((fase(e.pos) + 1) % 1, 0.85, 0.58);
      if (!e.temMapa) m.color.copy(c);
      m.emissive.copy(c);
      m.emissiveIntensity = e.intensidade * (modo === 'respirar' ? resp : 1);
    }
    for (const l of rgb.luzes) {
      if (modo === 'desligado') { l.intensity = 0; l.visible = false; continue; }
      l.visible = true;
      if (modo === 'arco-iris') l.color.setHSL((fase(l.position) + 1) % 1, 0.85, 0.58);
      else l.color.copy(base);
      l.intensity = 9000 * forcaLuz * l.userData.peso * (modo === 'respirar' ? resp : 1);
    }
    return modo === 'arco-iris' || modo === 'respirar';
  }

  /* ---------------- presets de qualidade ---------------- */
  const QUALIDADES = {
    leve: { rotulo: 'Leve', pixel: 1, sombra: 1536, posProcesso: false, ao: 0, luzesRGB: 0, reflexo: false },
    alta: { rotulo: 'Alta', pixel: 2, sombra: 4096, posProcesso: true, ao: 16, luzesRGB: 6, reflexo: false },
    ultra: { rotulo: 'Ultra', pixel: 2, sombra: 4096, posProcesso: true, ao: 24, luzesRGB: 10, reflexo: true }
  };

  return { ambienteEstudio, fundo, criarReflexo, coletarRGB, luzesRGB, atualizarRGB, QUALIDADES };
};
