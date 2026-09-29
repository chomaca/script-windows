/*
 * Montagem: pega a build (build-padrao.js ou a que está salva no navegador)
 * + o catálogo e posiciona cada peça dentro do gabinete.
 *
 * Mundo 3D (1 unidade = 1 mm):
 *   X: −largura/2 (vidro esquerdo) … +largura/2 (lateral direita)
 *   Y: 0 (chão) … altura
 *   Z: −profundidade/2 (traseira) … +profundidade/2 (frente)
 */
window.PCBMontagem = function (THREE, M) {
  'use strict';

  const DIRS = {
    frente: [0, 0, 1], traseira: [0, 0, -1], cima: [0, 1, 0],
    baixo: [0, -1, 0], direita: [1, 0, 0], esquerda: [-1, 0, 0]
  };
  const COR_ENTRADA = '#4aa3ff';
  const COR_SAIDA = '#ff7a45';
  const PASSO_SLOT = 20.32;

  function vdir(nome) {
    const d = DIRS[nome];
    if (!d) throw new Error('Direção inválida no catálogo: “' + nome + '”. Use frente, traseira, cima, baixo, direita ou esquerda.');
    return new THREE.Vector3(d[0], d[1], d[2]);
  }

  function clonar(o) { return JSON.parse(JSON.stringify(o)); }

  function lerCaminho(obj, caminho) {
    return caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }

  function gravarCaminho(obj, caminho, valor) {
    const ps = caminho.split('.');
    let o = obj;
    for (let i = 0; i < ps.length - 1; i++) {
      if (o[ps[i]] == null || typeof o[ps[i]] !== 'object') o[ps[i]] = {};
      o = o[ps[i]];
    }
    o[ps[ps.length - 1]] = valor;
  }

  function comMedidas(spec, ajustes) {
    const s = clonar(spec);
    for (const [k, v] of Object.entries(ajustes || {})) gravarCaminho(s, k, v);
    return s;
  }

  function pegar(colecao, id, rotulo, avisos) {
    if (id && colecao[id]) return id;
    const primeiro = Object.keys(colecao)[0];
    if (id) avisos.push(rotulo + ' “' + id + '” não existe no catálogo; usei “' + colecao[primeiro].nome + '”.');
    return primeiro;
  }

  /* Junta build + catálogo + medidas personalizadas. */
  function resolver(build, cat) {
    const avisos = [];
    const med = build.medidas || {};
    const ids = {
      gabinete: pegar(cat.gabinetes, build.gabinete && build.gabinete.modelo, 'Gabinete', avisos),
      placaMae: pegar(cat.placasMae, build.placaMae && build.placaMae.modelo, 'Placa-mãe', avisos),
      cpu: pegar(cat.cpus, build.cpu && build.cpu.modelo, 'Processador', avisos),
      memoria: pegar(cat.memorias, build.memoria && build.memoria.modelo, 'Memória', avisos),
      cooler: pegar(cat.coolers, build.refrigeracao && build.refrigeracao.modelo, 'Watercooler', avisos),
      fonte: pegar(cat.fontes, build.fonte && build.fonte.modelo, 'Fonte', avisos),
      gpu: pegar(cat.gpus, build.gpu && build.gpu.modelo, 'Placa de vídeo', avisos),
      gpuFan: pegar(cat.fans, build.gpu && build.gpu.fans && build.gpu.fans.modelo, 'Fan da GPU', avisos)
    };
    const cooler = comMedidas(cat.coolers[ids.cooler], med[ids.cooler]);
    const coolerFanId = pegar(cat.fans, cooler.fans.modelo, 'Fan do watercooler', avisos);
    return {
      ids,
      avisos,
      gabinete: comMedidas(cat.gabinetes[ids.gabinete], med[ids.gabinete]),
      placaMae: comMedidas(cat.placasMae[ids.placaMae], med[ids.placaMae]),
      cpu: cat.cpus[ids.cpu],
      memoria: comMedidas(cat.memorias[ids.memoria], med[ids.memoria]),
      cooler,
      coolerFan: cat.fans[coolerFanId],
      fonte: comMedidas(cat.fontes[ids.fonte], med[ids.fonte]),
      gpu: comMedidas(cat.gpus[ids.gpu], med[ids.gpu]),
      gpuFan: cat.fans[ids.gpuFan]
    };
  }

  /* Conversão das medidas do gabinete (a partir das bordas) para o mundo. */
  function quadro(G) {
    const W = G.medidas.largura, H = G.medidas.altura, D = G.medidas.profundidade;
    return {
      W, H, D,
      X: (x) => W / 2 - x,
      Z: (z) => z - D / 2,
      p: (x, y, z) => new THREE.Vector3(W / 2 - x, y, z - D / 2),
      xDaDireita: (X) => W / 2 - X,
      caixa: (xs, ys, zs) => new THREE.Box3(
        new THREE.Vector3(W / 2 - Math.max(xs[0], xs[1]), Math.min(ys[0], ys[1]), Math.min(zs[0], zs[1]) - D / 2),
        new THREE.Vector3(W / 2 - Math.min(xs[0], xs[1]), Math.max(ys[0], ys[1]), Math.max(zs[0], zs[1]) - D / 2))
    };
  }

  /* Orienta um objeto: seus eixos locais X, Y, Z apontam para dx, dy, dz. */
  function orientar(obj, dx, dy, dz, pos, inverter = 'x') {
    const x = dx.clone().normalize(), y = dy.clone().normalize(), z = dz.clone().normalize();
    if (new THREE.Vector3().crossVectors(x, y).dot(z) < 0) (inverter === 'y' ? y : x).negate();
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    obj.position.copy(pos);
    obj.updateMatrixWorld(true);
  }

  /* Fan numa montagem: centro no plano, pilha começando em f0 ao longo de k. */
  function posicionarFan(fanObj, centroPlano, k, f0, t, ar, eixoX) {
    const origem = ar.dot(k) > 0 ? f0 : f0 + t;
    const pos = centroPlano.clone().addScaledVector(k, origem);
    const y = new THREE.Vector3().crossVectors(ar, eixoX);
    orientar(fanObj, eixoX, y, ar, pos);
  }

  function vagasDaZona(zona, tamanho) {
    if (typeof zona.vagas === 'number') return zona.vagas;
    return (zona.vagas && zona.vagas[tamanho]) || 0;
  }

  function tamanhosDaZona(zona) {
    if (typeof zona.vagas === 'number') return zona.tamanhos || [120, 140];
    return Object.keys(zona.vagas || {}).map(Number).sort((a, b) => a - b);
  }

  function sobrepoe2D(a, b) {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  }

  function fmt(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }

  /* ======================= MONTAR ======================= */
  function montar(build, cat, opts = {}) {
    const rgb = opts.rgb || '#7cc8ff';
    const R = resolver(build, cat);
    const avisos = R.avisos.slice();
    const G = R.gabinete;
    const Q = quadro(G);
    const raiz = new THREE.Group();
    const partes = [];
    const P = G.paineis;
    const interior = new THREE.Box3(
      new THREE.Vector3(-Q.W / 2 + P.esquerdo.espessura, G.pes + P.fundo.espessura, -Q.D / 2 + P.traseira.espessura),
      new THREE.Vector3(Q.W / 2 - P.direito.espessura, Q.H - P.topo.espessura, Q.D / 2 - P.frente.espessura));

    function registrar(id, nome, categoria, obj, cfg = {}) {
      if (obj) {
        obj.traverse((o) => { o.userData.parteId = id; });
        raiz.add(obj);
      }
      const p = Object.assign({ id, nome, categoria, obj, colide: true, grupo: null, ignora: [], caixas: [], info: {} }, cfg);
      partes.push(p);
      return p;
    }

    /* ---------- placa-mãe ---------- */
    const MB = R.placaMae;
    const bandejaX = Q.X(G.bandeja.x);
    const faceX = Q.X(G.bandeja.x + G.placaMae.standoff + MB.espessura);
    const topoY = G.placaMae.topoY;
    const mb = M.placaMae(MB, { foto: opts.fotos ? opts.fotos[R.ids.placaMae] : null });
    orientar(mb, vdir('frente'), vdir('cima'), vdir('esquerda'), new THREE.Vector3(faceX, topoY, Q.Z(G.placaMae.traseira)));
    const mbPonto = (x, y, z) => mb.localToWorld(new THREE.Vector3(x, -y, z));
    registrar('placaMae', MB.nome, 'Placa-mãe', mb, {
      info: {
        medidas: [['Formato', MB.formato], ['Tamanho', fmt(MB.largura) + ' × ' + fmt(MB.altura) + ' mm']],
        notas: MB.notas, fontes: MB.fontes, estimado: MB.estimado
      }
    });

    /* ---------- memórias ---------- */
    const RAM = R.memoria;
    const q = Math.max(1, Math.min(4, (build.memoria && build.memoria.quantidade) | 0 || 2));
    const nSlots = MB.dimm.x.length;
    let slotsUsados;
    if (nSlots >= 4) slotsUsados = q === 1 ? [1] : q === 2 ? [1, 3] : q === 3 ? [0, 1, 3] : [0, 1, 2, 3];
    else slotsUsados = q === 1 ? [0] : [0, 1].slice(0, nSlots);
    if (q > nSlots) avisos.push('A placa-mãe tem ' + nSlots + ' slots de memória; mostrei só ' + nSlots + ' pentes.');
    slotsUsados.forEach((si, n) => {
      const mod = M.memoria(RAM, rgb);
      orientar(mod, vdir('frente'), vdir('esquerda'), vdir('baixo'), mbPonto(MB.dimm.x[si], MB.dimm.y, 1.5));
      registrar('memoria-' + n, RAM.nome + ' (slot ' + ['A1', 'A2', 'B1', 'B2'][si] + ')', 'Memória', mod, {
        ignora: ['placaMae'],
        info: {
          medidas: [['Altura', fmt(RAM.altura) + ' mm'], ['Comprimento', fmt(RAM.comprimento) + ' mm'], ['Capacidade', RAM.capacidade + ' GB']],
          notas: 'Pentes nos slots A2 e B2 (recomendado para 2 pentes).', fontes: RAM.fontes, estimado: RAM.estimado
        }
      });
    });

    /* ---------- watercooler ---------- */
    const CL = R.cooler;
    const cfgC = build.refrigeracao || {};
    const zonaRadId = cfgC.local;
    const zonaRad = G.montagens[zonaRadId];
    const bombaPos = mbPonto(MB.soquete.x, MB.soquete.y, 9);
    const bomba = M.bomba(CL.bomba, CL.cor, rgb);
    orientar(bomba, vdir('frente'), vdir('cima'), vdir('esquerda'), bombaPos, 'y');
    registrar('bomba', 'Bomba — ' + CL.nome, 'Watercooler', bomba, {
      ignora: ['placaMae'],
      info: {
        medidas: [['Bloco', fmt(CL.bomba.largura) + ' × ' + fmt(CL.bomba.profundidade) + ' × ' + fmt(CL.bomba.altura) + ' mm']],
        notas: CL.notas, fontes: CL.fontes, estimado: CL.estimado
      }
    });
    let radInfo = null;
    const aioFans = [];
    if (zonaRad) {
      const n = vdir(zonaRad.normal);
      const a = vdir(zonaRad.eixo);
      const k = n.clone().multiplyScalar(zonaRad.montagem === 'fora' ? 1 : -1);
      const folgaEixo = Math.max(0, ((zonaRad.radiador || CL.radiador.comprimento) + 35 - CL.radiador.comprimento) / 2);
      const desloc = Math.max(-folgaEixo, Math.min(folgaEixo, Number(cfgC.deslocamento) || 0));
      const c = Q.p(zonaRad.centro.x, zonaRad.centro.y, zonaRad.centro.z).addScaledVector(a, desloc);
      const Tr = CL.radiador.espessura, Tf = R.coolerFan.espessura;
      const naFrente = cfgC.fansPosicao === 'painel';
      const radOff = naFrente ? Tf : 0, fanOff = naFrente ? 0 : Tr;
      const rad = M.radiador(CL.radiador, CL.cor, R.coolerFan.tamanho);
      const sentido = (Number(cfgC.tubos) || 1) >= 0 ? 1 : -1;
      const radX = a.clone().multiplyScalar(sentido);
      orientar(rad, radX, new THREE.Vector3().crossVectors(k, radX), k, c.clone().addScaledVector(k, radOff + Tr / 2), 'y');
      const classe = CL.fans.quantidade * R.coolerFan.tamanho;
      registrar('radiador', 'Radiador ' + classe + ' mm — ' + CL.nome, 'Watercooler', rad, {
        grupo: 'aio',
        info: {
          medidas: [['Radiador', fmt(CL.radiador.comprimento) + ' × ' + fmt(CL.radiador.largura) + ' × ' + fmt(CL.radiador.espessura) + ' mm'], ['Posição', zonaRad.nome]],
          notas: CL.notas, fontes: CL.fontes, estimado: CL.estimado
        }
      });
      const saida = cfgC.fluxo !== 'entrada';
      const ar = n.clone().multiplyScalar(saida ? 1 : -1);
      for (let i = 0; i < CL.fans.quantidade; i++) {
        const f = M.fan(R.coolerFan, { rgb, setaCor: saida ? COR_SAIDA : COR_ENTRADA });
        const centro = c.clone().addScaledVector(a, (i - (CL.fans.quantidade - 1) / 2) * R.coolerFan.tamanho);
        posicionarFan(f, centro, k, fanOff, Tf, ar, a);
        registrar('fanRad-' + i, R.coolerFan.nome + ' (radiador ' + (i + 1) + ')', 'Watercooler', f, {
          grupo: 'aio',
          info: {
            medidas: [['Tamanho', R.coolerFan.tamanho + ' × ' + R.coolerFan.tamanho + ' × ' + R.coolerFan.espessura + ' mm'], ['Fluxo', saida ? 'Exaustão (saída)' : 'Entrada']],
            fontes: R.coolerFan.fontes
          }
        });
        aioFans.push({ tamanho: R.coolerFan.tamanho, saida });
      }
      // tubos
      const portasRad = rad.userData.portas.map((p) => ({ pos: rad.localToWorld(p.pos.clone()), dir: p.dir.clone().transformDirection(rad.matrixWorld) }));
      const portasBomba = bomba.userData.portas.map((p) => ({ pos: bomba.localToWorld(p.pos.clone()), dir: p.dir.clone().transformDirection(bomba.matrixWorld) }));
      const tubos = new THREE.Group();
      for (let i = 0; i < 2; i++) {
        const A = portasRad[i], B = portasBomba[1 - i] || portasBomba[0];
        const p1 = A.pos.clone().addScaledVector(A.dir, 40);
        const p3 = B.pos.clone().addScaledVector(B.dir, 45);
        const meio = p1.clone().lerp(p3, 0.5);
        meio.x = Math.min(meio.x, faceX - 60 - i * 14);
        tubos.add(M.tubo([A.pos, p1, meio, p3, B.pos], 6.2, CL.cor));
      }
      registrar('tubos', 'Mangueiras — ' + CL.nome, 'Watercooler', tubos, { colide: false, info: { notas: 'Traçado ilustrativo das mangueiras.' } });
      radInfo = { zona: zonaRadId, classe, deslocamento: desloc, folgaEixo };
      if (zonaRad.radiador && classe > zonaRad.radiador) avisos.push('Radiador ' + classe + ' mm maior que o suportado em ' + zonaRad.nome + ' (' + zonaRad.radiador + ' mm).');
    } else {
      avisos.push('O gabinete não tem a montagem “' + zonaRadId + '” para o radiador.');
    }

    /* ---------- fonte ---------- */
    const PSU = R.fonte;
    const F = G.fonte;
    const fonte = M.fonte(PSU);
    orientar(fonte, vdir(F.larguraPara), vdir(F.ventoinhaPara), vdir(F.comprimentoPara), Q.p(F.ancora.x, F.ancora.y, F.ancora.z));
    registrar('fonte', PSU.nome, 'Fonte', fonte, {
      ignora: ['caixaFonte'],
      info: {
        medidas: [['Tamanho', fmt(PSU.largura) + ' × ' + fmt(PSU.altura) + ' × ' + fmt(PSU.comprimento) + ' mm'], ['Potência', PSU.potencia + ' W']],
        notas: PSU.notas, fontes: PSU.fontes
      }
    });
    const caixaFonte = Q.caixa(F.caixa.x, F.caixa.y, F.caixa.z);
    registrar('caixaFonte', 'Compartimento da fonte (gabinete)', 'Gabinete', null, { caixas: [caixaFonte], ignora: ['bandeja'], info: {} });
    const facesFonte = [];
    const perto = (a, b) => Math.abs(a - b) < 3;
    if (!perto(caixaFonte.min.x, interior.min.x)) facesFonte.push('esquerda');
    if (!perto(caixaFonte.max.x, interior.max.x) && !perto(caixaFonte.max.x, bandejaX)) facesFonte.push('direita');
    if (!perto(caixaFonte.min.y, interior.min.y)) facesFonte.push('baixo');
    if (!perto(caixaFonte.max.y, interior.max.y)) facesFonte.push('cima');
    if (!perto(caixaFonte.min.z, interior.min.z)) facesFonte.push('traseira');
    if (!perto(caixaFonte.max.z, interior.max.z)) facesFonte.push('frente');

    /* ---------- placa de vídeo ---------- */
    const GPU = R.gpu;
    const cg = build.gpu || {};
    const vertical = cg.orientacao !== 'horizontal';
    const slot0 = (MB.pcie && MB.pcie[0]) || { x: 46, y: 151 };
    const dedosX = G.placaMae.traseira + slot0.x - G.gpuVertical.suporteZ;
    const cfgGpu = {
      modo: cg.modo === 'original' ? 'original' : 'deshroud',
      dedosX,
      fans: Object.assign({ quantidade: 2, espacamento: 4, deslocamento: 0 }, cg.fans || {})
    };
    const gpu = M.placaDeVideo(GPU, cfgGpu, R.gpuFan, rgb);
    const slotY = topoY - slot0.y;
    const gv = G.gpuVertical;
    let distancia = Number(cg.distanciaBandeja);
    if (!isFinite(distancia)) distancia = 70;
    let altura = Number(cg.alturaDoChao);
    if (!isFinite(altura)) altura = gv.alturaMin + 10;
    if (vertical) {
      orientar(gpu, vdir('frente'), vdir('cima'), vdir('esquerda'), new THREE.Vector3(Q.X(G.bandeja.x + distancia), altura - 9, Q.Z(gv.suporteZ)));
    } else {
      orientar(gpu, vdir('frente'), vdir('esquerda'), vdir('baixo'), new THREE.Vector3(faceX - 3, slotY + 3.3, Q.Z(gv.suporteZ)));
    }
    const gm = gpu.userData.medidas;
    const modoTxt = cfgGpu.modo === 'deshroud'
      ? 'Sem shroud, ' + (cfgGpu.fans.quantidade || 0) + '× ' + R.gpuFan.nome + ' presos com abraçadeira'
      : 'Original, com shroud';
    registrar('gpu', GPU.nome, 'Placa de vídeo', gpu, {
      info: {
        medidas: [
          ['Montagem', vertical ? 'Vertical (riser)' : 'Horizontal (slot PCIe)'],
          ['Configuração', modoTxt],
          ['Conjunto', fmt(gm.comprimento) + ' × ' + fmt(gm.altura) + ' × ' + fmt(gm.espessura) + ' mm'],
          ['Oficial (com shroud)', fmt(GPU.comprimento) + ' × ' + fmt(GPU.altura) + ' × ' + fmt(GPU.espessura) + ' mm']
        ],
        notas: GPU.notas, fontes: (GPU.fontes || []).concat(R.gpuFan.fontes || []), estimado: GPU.estimado
      }
    });
    if (vertical && (distancia < gv.distanciaMin || distancia > gv.distanciaMax)) {
      avisos.push('Distância da GPU à bandeja (' + fmt(distancia) + ' mm) fora da faixa do suporte vertical (' + gv.distanciaMin + '–' + gv.distanciaMax + ' mm).');
    }

    // riser
    if (vertical && cg.riser !== false) {
      const A = mbPonto(slot0.x + 44.5, slot0.y, 11);
      const Fd = gpu.localToWorld(new THREE.Vector3(dedosX + 44.5, 0, 3.3));
      const xm = (faceX + Q.X(G.bandeja.x + distancia)) / 2;
      const desce = A.y > Fd.y;
      const pts = [
        A.clone(),
        new THREE.Vector3(A.x - 12, A.y + (desce ? -6 : 6), A.z),
        new THREE.Vector3(xm, A.y + (desce ? -30 : 30), A.z),
        new THREE.Vector3(xm, Fd.y - 24, A.z),
        new THREE.Vector3((xm + Fd.x) / 2, Fd.y - 34, A.z),
        new THREE.Vector3(Fd.x, Fd.y - 24, A.z),
        new THREE.Vector3(Fd.x, Fd.y - 14, A.z)
      ];
      const fita = M.riser(pts, new THREE.Vector3(0, 0, 1), 64);
      registrar('riser', 'Cabo riser PCIe', 'Placa de vídeo', fita, { colide: false, info: { notas: 'Traçado ilustrativo do cabo riser (o comprimento real depende do modelo).' } });
      const con = new THREE.Group();
      con.add(M.caixa(Fd.x - 9, Fd.x + 9, Fd.y - 14, Fd.y + 7, Fd.z - 52, Fd.z + 52, M.std('#141518', 0.6, 0.1)));
      con.add(M.caixa(A.x - 14, A.x, A.y - 5, A.y + 5, A.z - 48, A.z + 48, M.std('#141518', 0.6, 0.1)));
      con.userData.colisores = [new THREE.Box3(new THREE.Vector3(Fd.x - 9, Fd.y - 14, Fd.z - 52), new THREE.Vector3(Fd.x + 9, Fd.y + 7, Fd.z + 52))];
      registrar('conectorRiser', 'Conector do riser', 'Placa de vídeo', con, { ignora: ['gpu', 'placaMae'], info: { notas: 'Encaixe do riser na placa de vídeo.' } });
    }

    /* ---------- fans do gabinete ---------- */
    const fansCaso = [];
    const cfgFans = build.fans || {};
    for (const [zid, zf] of Object.entries(cfgFans)) {
      const zona = G.montagens[zid];
      if (!zf) continue;
      if (!zona) {
        const n = (zf.vagas || []).filter(Boolean).length;
        if (n) avisos.push('Este gabinete não tem a posição “' + zid + '”; ' + n + ' fan(s) dessa posição ficaram de fora.');
        continue;
      }
      const vagasCfg = (zf.vagas || []).filter(Boolean);
      if (radInfo && zid === radInfo.zona) {
        if (vagasCfg.length) avisos.push('Os fans em “' + zona.nome + '” foram ignorados: a posição está ocupada pelo radiador.');
        continue;
      }
      const tam = Number(zf.tamanho) || tamanhosDaZona(zona)[0];
      const nV = vagasDaZona(zona, tam);
      if (!nV) { avisos.push(zona.nome + ' não aceita fans de ' + tam + ' mm.'); continue; }
      const extra = (zf.vagas || []).slice(nV).filter(Boolean).length;
      if (extra) avisos.push(zona.nome + ' comporta ' + nV + '× ' + tam + ' mm; ' + extra + ' fan(s) a mais foram ignorados.');
      const n = vdir(zona.normal), a = vdir(zona.eixo);
      const k = n.clone().multiplyScalar(zona.montagem === 'fora' ? 1 : -1);
      const c = Q.p(zona.centro.x, zona.centro.y, zona.centro.z);
      const saida = zf.fluxo === 'saida';
      const ar = n.clone().multiplyScalar(saida ? 1 : -1);
      for (let i = 0; i < nV; i++) {
        const fid = (zf.vagas || [])[i];
        if (!fid) continue;
        const fs = cat.fans[fid];
        if (!fs) { avisos.push('Fan “' + fid + '” não existe no catálogo.'); continue; }
        const f = M.fan(fs, { rgb, setaCor: saida ? COR_SAIDA : COR_ENTRADA });
        const centro = c.clone().addScaledVector(a, (i - (nV - 1) / 2) * tam);
        posicionarFan(f, centro, k, 0, fs.espessura, ar, a);
        const id = 'fan:' + zid + ':' + i;
        registrar(id, zona.nome + ' ' + (i + 1) + ' — ' + fs.nome, 'Fans', f, {
          ignora: zona.montagem === 'fora' ? ['bandeja'] : [],
          info: {
            medidas: [['Tamanho', fs.tamanho + ' × ' + fs.tamanho + ' × ' + fs.espessura + ' mm'], ['Fluxo', saida ? 'Exaustão (saída)' : 'Entrada']],
            fontes: fs.fontes
          }
        });
        if (fs.tamanho !== tam) avisos.push(zona.nome + ' ' + (i + 1) + ': o fan tem ' + fs.tamanho + ' mm, mas a posição está configurada para ' + tam + ' mm.');
        fansCaso.push({ zona: zid, tamanho: fs.tamanho, saida });
      }
    }

    /* ---------- gabinete ---------- */
    raiz.updateMatrixWorld(true);
    const furosTraseira = [];
    const limiteTraseira = { x0: -Q.W / 2 + P.esquerdo.espessura + 2, x1: Q.W / 2 - P.direito.espessura - 2, y0: G.pes + 2, y1: Q.H - P.topo.espessura - 2 };
    const addFuro = (f) => {
      if (f.x0 < limiteTraseira.x0 || f.x1 > limiteTraseira.x1 || f.y0 < limiteTraseira.y0 || f.y1 > limiteTraseira.y1) return false;
      if (furosTraseira.some((o) => sobrepoe2D(o, f))) return false;
      furosTraseira.push(f);
      return true;
    };
    if (G.traseira.rearIO) addFuro({ x0: faceX - 42.15, x1: faceX + 2.3, y0: topoY + 18 - 158.75, y1: topoY + 18, r: 1 });
    const zt = G.montagens.traseira;
    if (zt) {
      const s = Math.max(...tamanhosDaZona(zt));
      const cx = Q.X(zt.centro.x), cy = zt.centro.y;
      addFuro({ x0: cx - s / 2 + 4, x1: cx + s / 2 - 4, y0: cy - s / 2 + 4, y1: cy + s / 2 - 4, r: 6, tela: true });
    }
    if (F.entradaAC) {
      const ax = Q.X(F.entradaAC.x), l = F.entradaAC.lado / 2;
      addFuro({ x0: ax - l, x1: ax + l, y0: F.entradaAC.y - l, y1: F.entradaAC.y + l, r: 2, ac: true });
    }
    const suporte = new THREE.Box3(new THREE.Vector3(-1.6, 2, -3), new THREE.Vector3(0, 121, GPU.slots * PASSO_SLOT - 3)).applyMatrix4(gpu.matrixWorld);
    const furoGpu = { x0: suporte.min.x + 2, x1: suporte.max.x - 2, y0: suporte.min.y + 2, y1: suporte.max.y - 2, r: 1 };
    addFuro(furoGpu);
    const tampasSlot = [];
    const tampasVerticais = [];
    const nSlotsCaso = G.traseira.slots || 7;
    if (vertical) {
      for (let i = 0; i < nSlotsCaso; i++) {
        const cx = Q.X(G.bandeja.x + 16 + i * PASSO_SLOT);
        const t = { x0: cx - 8.5, x1: cx + 8.5, y0: gv.alturaMin - 2, y1: gv.alturaMin + 122 };
        if (t.x0 < limiteTraseira.x0) continue;
        if (!sobrepoe2D(t, furoGpu)) tampasVerticais.push(t);
      }
    } else {
      for (let i = 0; i < nSlotsCaso; i++) {
        const cy = G.traseira.slot1Y - i * PASSO_SLOT;
        const t = { x0: Q.X(G.bandeja.x + 124), x1: Q.X(G.bandeja.x + 6), y0: cy - 8.5, y1: cy + 8.5 };
        if (t.y0 < limiteTraseira.y0) continue;
        if (!sobrepoe2D(t, furoGpu)) tampasSlot.push(t);
      }
    }
    const trs = G.placaMae.traseira;
    const furosBandeja = [];
    const limBandeja = { x0: P.traseira.espessura + 4, x1: Q.D - P.frente.espessura - 4, y0: G.pes + P.fundo.espessura + 4, y1: Q.H - P.topo.espessura - 4 };
    const addFuroBandeja = (f) => {
      const r = f.circulo ? { x0: f.u - f.r, x1: f.u + f.r, y0: f.v - f.r, y1: f.v + f.r } : { x0: f.u0, x1: f.u1, y0: f.v0, y1: f.v1 };
      if (r.x0 < limBandeja.x0 || r.x1 > limBandeja.x1 || r.y0 < limBandeja.y0 || r.y1 > limBandeja.y1) return;
      if (furosBandeja.some((o) => sobrepoe2D(o._r, r))) return;
      f._r = r;
      furosBandeja.push(f);
    };
    addFuroBandeja({ u0: trs + 50, u1: trs + 170, v0: topoY - 140, v1: topoY - 25, r: 6 });
    for (const [a, b] of [[25, 95], [115, 200], [220, 300]]) addFuroBandeja({ u0: trs + 256, u1: trs + 272, v0: topoY - b, v1: topoY - a, r: 6 });
    for (const [a, b] of [[30, 110], [130, 210]]) addFuroBandeja({ u0: trs + a, u1: trs + b, v0: topoY + 5, v1: topoY + 12, r: 3 });
    const zl = G.montagens.lateral;
    if (zl) addFuroBandeja({ circulo: true, grade: true, u: zl.centro.z, v: zl.centro.y, r: Math.max(...tamanhosDaZona(zl)) * 0.46 });

    const caso = M.gabinete(G, Q, (build.gabinete && build.gabinete.cor) || G.cor, {
      furosTraseira, tampasSlot, tampasVerticais, furosBandeja,
      bandejaMundoX: bandejaX,
      caixaFonte: { box: caixaFonte, faces: facesFonte }
    });
    registrar('gabinete', G.nome, 'Gabinete', caso.grupo, {
      colide: false,
      info: {
        medidas: [['Externas (P × L × A)', Q.D + ' × ' + Q.W + ' × ' + Q.H + ' mm'], ['GPU até', G.limites.gpuComprimento + ' mm'], ['Cooler até', G.limites.coolerAltura + ' mm'], ['Fonte até', G.limites.fonteComprimento + ' mm']],
        notas: G.notas, fontes: G.fontes, estimado: G.estimado
      }
    });
    registrar('bandeja', 'Bandeja da placa-mãe', 'Gabinete', null, {
      caixas: [new THREE.Box3(new THREE.Vector3(bandejaX, interior.min.y, interior.min.z), new THREE.Vector3(bandejaX + 1.2, interior.max.y, interior.max.z))],
      ignora: ['placaMae']
    });

    /* ---------- caixas de colisão no mundo ---------- */
    raiz.updateMatrixWorld(true);
    for (const p of partes) {
      if (p.caixas.length || !p.obj) continue;
      const lista = p.obj.userData.colisores;
      if (lista && lista.length) p.caixas = lista.map((b) => b.clone().applyMatrix4(p.obj.matrixWorld));
      else p.caixas = [new THREE.Box3().setFromObject(p.obj)];
    }

    /* ---------- folgas ---------- */
    const uniao = (ids) => {
      const b = new THREE.Box3();
      for (const p of partes) if (ids(p)) for (const c of p.caixas) b.union(c);
      return b;
    };
    const vidroX = interior.min.x;
    const bGpu = uniao((p) => p.id === 'gpu');
    const folgas = [];
    folgas.push({ nome: 'Placa de vídeo ↔ vidro lateral', valor: bGpu.min.x - vidroX, minimo: 10 });
    const bBomba = uniao((p) => p.id === 'bomba');
    folgas.push({ nome: 'Topo da bomba ↔ vidro lateral', valor: bBomba.min.x - vidroX, minimo: 5 });
    if (radInfo) {
      const bRad = uniao((p) => p.grupo === 'aio');
      if (G.montagens[radInfo.zona].normal === 'cima') {
        folgas.push({ nome: 'Radiador + fans ↔ borda de cima da placa-mãe', valor: bRad.min.y - topoY, minimo: 3 });
        const bRam = uniao((p) => p.id.startsWith('memoria-'));
        if (!bRam.isEmpty()) folgas.push({ nome: 'Memórias ↔ fans do radiador', valor: bRad.min.y - bRam.max.y, minimo: 3 });
      }
    }
    const bFundo = uniao((p) => p.id.startsWith('fan:fundo:'));
    const bGpuConj = uniao((p) => p.id === 'gpu' || p.id === 'conectorRiser');
    if (!bFundo.isEmpty()) folgas.push({ nome: 'Placa de vídeo (com riser) ↔ fans do fundo', valor: bGpuConj.min.y - bFundo.max.y, minimo: 3 });
    const sobrepoeXZ = (a, b) => a.min.x < b.max.x && b.min.x < a.max.x && a.min.z < b.max.z && b.min.z < a.max.z;
    if (sobrepoeXZ(bGpu, caixaFonte) && caixaFonte.min.y >= bGpu.max.y - 1) folgas.push({ nome: 'Placa de vídeo ↔ compartimento da fonte', valor: caixaFonte.min.y - bGpu.max.y, minimo: 3 });
    const eixoFonte = vdir(F.comprimentoPara);
    const tamCaixa = Math.abs(eixoFonte.x) * (caixaFonte.max.x - caixaFonte.min.x) + Math.abs(eixoFonte.y) * (caixaFonte.max.y - caixaFonte.min.y) + Math.abs(eixoFonte.z) * (caixaFonte.max.z - caixaFonte.min.z);
    folgas.push({ nome: 'Espaço para cabos atrás da fonte', valor: tamCaixa - PSU.comprimento - 2, minimo: 15 });

    /* ---------- resumo do fluxo de ar ---------- */
    const peso = (s) => (s * s) / (120 * 120);
    const todos = fansCaso.concat(aioFans);
    const fluxo = {
      entrada: todos.filter((f) => !f.saida).length,
      saida: todos.filter((f) => f.saida).length,
      areaEntrada: todos.filter((f) => !f.saida).reduce((s, f) => s + peso(f.tamanho), 0),
      areaSaida: todos.filter((f) => f.saida).reduce((s, f) => s + peso(f.tamanho), 0)
    };

    return {
      raiz, partes, paineis: caso.paineis, Q, R, G, avisos, interior, folgas, fluxo,
      radInfo, vertical, distancia, altura,
      contagem: { fansCaso: fansCaso.length, fansAio: aioFans.length, fansGpu: gpu.userData.fansGPU || 0, pentes: slotsUsados.length }
    };
  }

  /* Libera a memória da GPU ocupada por uma montagem antiga. */
  function descartar(obj) {
    obj.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (!m.userData.cacheado) m.dispose();
    });
  }

  return { montar, resolver, quadro, lerCaminho, gravarCaminho, vagasDaZona, tamanhosDaZona, descartar, CORES: { entrada: COR_ENTRADA, saida: COR_SAIDA } };
};
