/*
 * Simulação do ar dentro do gabinete (ilustrativa, em tempo real):
 * partículas entram pelos fans de entrada, são empurradas pelo jato dos
 * fans, desviam das peças, esquentam ao passar pela placa de vídeo e pelo
 * radiador (azul → laranja), sobem quando quentes e saem pelos fans de saída.
 */
window.PCBAr = function (THREE) {
  'use strict';

  const FRIO = new THREE.Color('#3aa8ff'), MORNO = new THREE.Color('#f2d04a'), QUENTE = new THREE.Color('#ff4d2e');

  function corTemp(t, alvo) {
    if (t < 0.5) return alvo.copy(FRIO).lerp(MORNO, t * 2);
    return alvo.copy(MORNO).lerp(QUENTE, (t - 0.5) * 2);
  }

  function spriteRedondo() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    return t;
  }

  /*
   * res: resultado de PCBMontagem.montar; build: a montagem;
   * opts: { quantidade }
   */
  function criar(res, build, opts = {}) {
    const N = opts.quantidade || 1200;
    const interior = res.interior.clone();
    const fans = (res.fluxo.fans || []).filter((f) => f.centro && f.ar);
    const entradas = fans.filter((f) => !f.saida), saidas = fans.filter((f) => f.saida);
    const somaEnt = entradas.reduce((s, f) => s + f.cfm, 0) || 1;
    const V = THREE.Vector3;

    // obstáculos: caixas das peças sólidas (exceto o próprio gabinete)
    const obst = [];
    for (const p of res.partes) {
      if (!p.colide || p.id === 'gabinete' || p.id === 'bandeja' || p.id.startsWith('fan:') || p.id.startsWith('fanRad')) continue;
      for (const c of p.caixas) obst.push(c.clone().expandByScalar(1.5));
    }
    // fontes de calor
    const calor = [];
    const uniao = (f) => { const b = new THREE.Box3(); for (const p of res.partes) if (f(p)) for (const c of p.caixas) b.union(c); return b; };
    const bGpu = uniao((p) => p.id === 'gpu');
    if (!bGpu.isEmpty()) calor.push({ caixa: bGpu.clone().expandByScalar(14), taxa: Math.min(3, (res.R.gpu.tgp || 300) / 200) });
    const radSaida = res.radInfo && (build.refrigeracao || {}).fluxo !== 'entrada';
    if (res.radInfo) {
      const bRad = uniao((p) => p.grupo === 'aio');
      if (radSaida) calor.push({ caixa: bRad.clone().expandByScalar(6), taxa: 1.6 });
    }
    const bPlaca = uniao((p) => p.id === 'placaMae');
    if (!bPlaca.isEmpty()) calor.push({ caixa: bPlaca.clone().expandByScalar(10), taxa: 0.12 });

    const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), temp = new Float32Array(N), vida = new Float32Array(N);
    const geoP = new THREE.BufferGeometry();
    const aPos = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const aCor = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    geoP.setAttribute('position', aPos);
    geoP.setAttribute('color', aCor);
    const geoL = new THREE.BufferGeometry();
    const lPos = new THREE.BufferAttribute(new Float32Array(N * 6), 3);
    const lCor = new THREE.BufferAttribute(new Float32Array(N * 6), 3);
    geoL.setAttribute('position', lPos);
    geoL.setAttribute('color', lCor);
    const sprite = spriteRedondo();
    const pontos = new THREE.Points(geoP, new THREE.PointsMaterial({ size: 3.4, map: sprite, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    const rastros = new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
    const grupo = new THREE.Group();
    grupo.add(rastros, pontos);
    grupo.traverse((o) => { o.userData.semAO = true; o.frustumCulled = false; o.raycast = () => {}; });
    grupo.renderOrder = 5;

    let semente = 12345;
    const rnd = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };
    const tmpA = new V(), tmpB = new V(), tmpC = new THREE.Color();

    // base ortonormal do plano de um fan
    function base(f) {
      if (!f._u) {
        const a = f.ar.clone().normalize();
        const ref = Math.abs(a.y) < 0.9 ? new V(0, 1, 0) : new V(1, 0, 0);
        f._u = new V().crossVectors(a, ref).normalize();
        f._v = new V().crossVectors(a, f._u).normalize();
        f._a = a;
        f._r = f.tamanho * 0.45;
      }
      return f;
    }
    fans.forEach(base);

    function nascer(i, espalhar) {
      let f = null;
      if (entradas.length) {
        let x = rnd() * somaEnt;
        for (const e of entradas) { x -= e.cfm; if (x <= 0) { f = e; break; } }
        f = f || entradas[0];
      }
      const o = i * 3;
      if (f) {
        const ang = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * f._r * 0.95, rh = f.tamanho * 0.12;
        const lado = r < rh ? rh : r; // o cubo do motor não sopra
        tmpA.copy(f.centro).addScaledVector(f._u, Math.cos(ang) * lado).addScaledVector(f._v, Math.sin(ang) * lado).addScaledVector(f._a, 6 + (espalhar ? rnd() * 220 : 0));
        const v0 = 260 + f.cfm * 2.2;
        tmpB.copy(f._a).multiplyScalar(v0).addScaledVector(f._u, (rnd() - 0.5) * 60).addScaledVector(f._v, (rnd() - 0.5) * 60);
        temp[i] = f.radiador ? 0.42 : 0;
      } else {
        // sem fan de entrada: o ar entra pelas telas de baixo
        tmpA.set(interior.min.x + rnd() * (interior.max.x - interior.min.x), interior.min.y + 4, interior.min.z + rnd() * (interior.max.z - interior.min.z));
        tmpB.set(0, 90, 0);
        temp[i] = 0;
      }
      tmpA.clamp(interior.min, interior.max);
      pos[o] = tmpA.x; pos[o + 1] = tmpA.y; pos[o + 2] = tmpA.z;
      vel[o] = tmpB.x; vel[o + 1] = tmpB.y; vel[o + 2] = tmpB.z;
      vida[i] = 5 + rnd() * 6;
    }
    const estat = { passaramGpu: 0, sairam: 0, tempoTotal: 0 };
    const idade = new Float32Array(N), marcouGpu = new Uint8Array(N);

    function passo(dt) {
      const drag = Math.exp(-dt * 1.6);
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        let px = pos[o], py = pos[o + 1], pz = pos[o + 2];
        let vx = vel[o], vy = vel[o + 1], vz = vel[o + 2];
        let ax = 0, ay = 0, az = 0;
        // jato dos fans de entrada
        for (const f of entradas) {
          tmpA.set(px - f.centro.x, py - f.centro.y, pz - f.centro.z);
          const d = tmpA.dot(f._a);
          if (d < -4 || d > 300) continue;
          const rad2 = tmpA.lengthSq() - d * d;
          const R = f._r * (1 + d / 400);
          if (rad2 > R * R) continue;
          const k = (f.cfm * 9) * (1 - d / 300);
          ax += f._a.x * k; ay += f._a.y * k; az += f._a.z * k;
        }
        // sucção dos fans de saída
        let saiu = false;
        for (const f of saidas) {
          tmpA.set(f.centro.x - px, f.centro.y - py, f.centro.z - pz);
          const d2 = tmpA.lengthSq();
          const alcance = f.tamanho * 2.6;
          if (d2 > alcance * alcance) continue;
          const d = Math.sqrt(d2) + 1e-3;
          const eixo = -tmpA.dot(f._a); // quanto está "atrás" do fan (lado de dentro)
          if (d < f._r && eixo > -f.tamanho * 0.35) { saiu = true; break; }
          const k = (f.cfm * 26) * (1 - d / alcance) / (0.35 + d / f.tamanho);
          ax += (tmpA.x / d) * k + f._a.x * k * 0.35; ay += (tmpA.y / d) * k + f._a.y * k * 0.35; az += (tmpA.z / d) * k + f._a.z * k * 0.35;
        }
        // ar quente sobe
        ay += temp[i] * 170;
        // turbulência
        ax += (rnd() - 0.5) * 240; ay += (rnd() - 0.5) * 240; az += (rnd() - 0.5) * 240;
        vx = (vx + ax * dt) * drag; vy = (vy + ay * dt) * drag; vz = (vz + az * dt) * drag;
        const v2 = vx * vx + vy * vy + vz * vz, vmax = 900;
        if (v2 > vmax * vmax) { const k = vmax / Math.sqrt(v2); vx *= k; vy *= k; vz *= k; }
        px += vx * dt; py += vy * dt; pz += vz * dt;
        // desvia das peças
        for (const b of obst) {
          if (px <= b.min.x || px >= b.max.x || py <= b.min.y || py >= b.max.y || pz <= b.min.z || pz >= b.max.z) continue;
          const dxm = px - b.min.x, dxM = b.max.x - px, dym = py - b.min.y, dyM = b.max.y - py, dzm = pz - b.min.z, dzM = b.max.z - pz;
          const m = Math.min(dxm, dxM, dym, dyM, dzm, dzM);
          if (m === dxm) { px = b.min.x - 0.1; vx = -Math.abs(vx) * 0.3; }
          else if (m === dxM) { px = b.max.x + 0.1; vx = Math.abs(vx) * 0.3; }
          else if (m === dym) { py = b.min.y - 0.1; vy = -Math.abs(vy) * 0.3; }
          else if (m === dyM) { py = b.max.y + 0.1; vy = Math.abs(vy) * 0.3; }
          else if (m === dzm) { pz = b.min.z - 0.1; vz = -Math.abs(vz) * 0.3; }
          else { pz = b.max.z + 0.1; vz = Math.abs(vz) * 0.3; }
        }
        // paredes
        if (px < interior.min.x) { px = interior.min.x; vx = Math.abs(vx) * 0.4; }
        if (px > interior.max.x) { px = interior.max.x; vx = -Math.abs(vx) * 0.4; }
        if (py < interior.min.y) { py = interior.min.y; vy = Math.abs(vy) * 0.4; }
        if (py > interior.max.y) { py = interior.max.y; vy = -Math.abs(vy) * 0.4; if (!saidas.length && rnd() < 0.08) saiu = true; }
        if (pz < interior.min.z) { pz = interior.min.z; vz = Math.abs(vz) * 0.4; }
        if (pz > interior.max.z) { pz = interior.max.z; vz = -Math.abs(vz) * 0.4; }
        // calor
        for (const c of calor) {
          const b = c.caixa;
          if (px > b.min.x && px < b.max.x && py > b.min.y && py < b.max.y && pz > b.min.z && pz < b.max.z) {
            temp[i] = Math.min(1, temp[i] + c.taxa * dt);
            if (c === calor[0] && !marcouGpu[i]) marcouGpu[i] = 1;
          }
        }
        temp[i] = Math.max(0, temp[i] - dt * 0.02);
        idade[i] += dt;
        vida[i] -= dt;
        if (saiu || vida[i] <= 0) {
          if (saiu) { estat.sairam++; estat.tempoTotal += idade[i]; if (marcouGpu[i]) estat.passaramGpu++; }
          idade[i] = 0; marcouGpu[i] = 0;
          nascer(i, false);
          continue;
        }
        pos[o] = px; pos[o + 1] = py; pos[o + 2] = pz;
        vel[o] = vx; vel[o + 1] = vy; vel[o + 2] = vz;
      }
    }

    function escrever() {
      const P = aPos.array, C = aCor.array, LP = lPos.array, LC = lCor.array;
      for (let i = 0; i < N; i++) {
        const o = i * 3, l = i * 6;
        P[o] = pos[o]; P[o + 1] = pos[o + 1]; P[o + 2] = pos[o + 2];
        corTemp(temp[i], tmpC);
        const fade = Math.min(1, vida[i] * 1.5) * Math.min(1, idade[i] * 3);
        C[o] = tmpC.r * fade; C[o + 1] = tmpC.g * fade; C[o + 2] = tmpC.b * fade;
        LP[l] = pos[o]; LP[l + 1] = pos[o + 1]; LP[l + 2] = pos[o + 2];
        LP[l + 3] = pos[o] - vel[o] * 0.045; LP[l + 4] = pos[o + 1] - vel[o + 1] * 0.045; LP[l + 5] = pos[o + 2] - vel[o + 2] * 0.045;
        LC[l] = tmpC.r * fade * 0.8; LC[l + 1] = tmpC.g * fade * 0.8; LC[l + 2] = tmpC.b * fade * 0.8;
        LC[l + 3] = 0; LC[l + 4] = 0; LC[l + 5] = 0;
      }
      aPos.needsUpdate = aCor.needsUpdate = lPos.needsUpdate = lCor.needsUpdate = true;
    }

    // reconstrução (ex.: arrastando um slider) no mesmo gabinete: as partículas continuam
    // de onde estavam em vez de recomeçar — sem o aquecimento de ~100 ms a cada passo e sem
    // o fluxo "piscar". Um passo curto empurra para fora quem ficou dentro de peça que mudou.
    const ant = opts.anterior;
    const mesmoGabinete = ant && ant.N === N && ant.interior && ant.interior.min.distanceTo(interior.min) < 1 && ant.interior.max.distanceTo(interior.max) < 1;
    if (mesmoGabinete) {
      pos.set(ant.pos); vel.set(ant.vel); temp.set(ant.temp); vida.set(ant.vida); idade.set(ant.idade); marcouGpu.set(ant.marcouGpu);
      Object.assign(estat, ant.estat);
      semente = ant.semente;
      passo(1 / 60);
    } else {
      // aquece a simulação para já abrir com o fluxo formado
      for (let i = 0; i < N; i++) { nascer(i, true); vida[i] *= rnd(); }
      for (let k = 0; k < 90; k++) passo(1 / 30);
      estat.passaramGpu = estat.sairam = estat.tempoTotal = 0;
    }
    escrever();

    return {
      objeto: grupo,
      atualizar(dt) {
        const n = Math.max(1, Math.ceil(dt / (1 / 45)));
        for (let k = 0; k < n; k++) passo(dt / n);
        escrever();
      },
      // estado para a próxima simulação continuar daqui (os vetores passam adiante: esta é descartada)
      estado() { return { N, interior, pos, vel, temp, vida, idade, marcouGpu, estat: { ...estat }, semente }; },
      estatisticas() {
        return {
          tempoMedio: estat.sairam ? estat.tempoTotal / estat.sairam : null,
          fracaoGpu: estat.sairam ? estat.passaramGpu / estat.sairam : null,
          amostras: estat.sairam
        };
      },
      descartar() {
        geoP.dispose(); geoL.dispose(); sprite.dispose();
        pontos.material.dispose(); rastros.material.dispose();
      }
    };
  }

  return { criar, corTemp };
};
