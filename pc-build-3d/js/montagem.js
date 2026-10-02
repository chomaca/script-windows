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

  const CABOS = window.PCBCabos ? window.PCBCabos(THREE, M) : null;
  const ESTILOS_CABO = {
    originais: { estilo: 'originais', cor: '#101113' },
    brancos: { estilo: 'trancados', cor: '#eef0f2', pentes: true },
    pretos: { estilo: 'trancados', cor: '#1c1d20', pentes: true }
  };

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
    if (!ajustes || typeof ajustes !== 'object') return s;
    for (const [k, v] of Object.entries(ajustes)) {
      // só medidas numéricas positivas, e só em campos que já são números no catálogo
      if (typeof v === 'number' && isFinite(v) && v > 0 && typeof lerCaminho(spec, k) === 'number') gravarCaminho(s, k, v);
    }
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
    ids.coolerFan = coolerFanId;
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

  const listaVagas = (zf) => (zf && Array.isArray(zf.vagas) ? zf.vagas.map((f) => (typeof f === 'string' ? f : null)) : []);

  function sobrepoe2D(a, b) {
    return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  }

  function fmt(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }

  /* Vazão máxima do fan (CFM): do catálogo ou estimada pelo tamanho. */
  function cfmDe(f) {
    if (f && isFinite(f.cfm)) return f.cfm;
    const t = (f && f.tamanho) || 120;
    return t >= 160 ? 90 : t >= 140 ? 70 : t >= 120 ? 55 : 35;
  }
  function compLinha(pts) {
    let c = 0;
    for (let i = 1; i < pts.length; i++) c += pts[i].distanceTo(pts[i - 1]);
    return c;
  }

  /* ---------- cache de peças entre montagens ----------
     Cada ajuste (slider da GPU, troca de um fan…) montava tudo de novo:
     geometria, fusão de malhas e envio para a placa de vídeo. Agora cada peça
     fica guardada pela sua "receita" (tudo que muda o desenho dela) e é
     reaproveitada se a receita não mudou; só a posição é refeita. Peças que
     não entram na montagem nova são descartadas no fim. */
  const cachePecas = new Map();
  let geracao = 0;
  const idsFoto = new WeakMap();
  let proxFoto = 1;
  function idFoto(f) {
    if (!f) return 0;
    if (typeof f !== 'object') return String(f);
    if (!idsFoto.has(f)) idsFoto.set(f, proxFoto++);
    return idsFoto.get(f);
  }
  const receita = (...v) => JSON.stringify(v);
  // receita com números arredondados (pontos de caminhos: evita ruído de ponto flutuante)
  const receitaR = (...v) => JSON.stringify(v, (k, x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x));
  function daCache(usar, chave, criar) {
    if (!usar) return criar();
    const e = cachePecas.get(chave);
    if (e) {
      e.geracao = geracao;
      for (const o of e.objs) limparAnexos(o);
      return e.valor;
    }
    const valor = criar();
    const objs = valor && valor.isObject3D ? [valor] : [valor.grupo, valor.caixaFonte].filter(Boolean);
    for (const o of objs) o.userData.daCache = true;
    cachePecas.set(chave, { valor, objs, geracao });
    return valor;
  }
  // pedaços de outras peças presos nesta (ex.: ponta do riser na placa-mãe) saem antes de reusar
  function limparAnexos(obj) {
    for (const c of obj.children.slice()) if (c.userData.anexo) { obj.remove(c); descartar(c, true); }
  }
  // Peças fora da montagem atual saem da cena mas ficam guardadas por algumas montagens:
  // alternar (com/sem shroud, uma fonte e outra) e desfazer/refazer reaproveitam em vez
  // de redesenhar a peça (a GPU sem shroud custava ~65 ms a cada ida e volta).
  const RETER_MONTAGENS = 4, RETER_MAX = 24;
  function despejarCache(tudo) {
    const fora = [];
    for (const [k, e] of cachePecas) {
      if (e.geracao === geracao && !tudo) continue;
      for (const o of e.objs) if (o.parent) o.parent.remove(o);
      fora.push([k, e]);
    }
    fora.sort((a, b) => b[1].geracao - a[1].geracao);
    fora.forEach(([k, e], i) => {
      if (!tudo && i < RETER_MAX && geracao - e.geracao <= RETER_MONTAGENS) return;
      for (const o of e.objs) descartar(o, true);
      cachePecas.delete(k);
    });
  }

  /* ======================= MONTAR ======================= */
  function montar(build, cat, opts = {}) {
    const rgb = opts.rgb || '#7cc8ff';
    // cache só na montagem "normal" (testes podem pedir sem fusão de malhas)
    const usarCache = opts.cache !== false && opts.fundir !== false;
    geracao++;
    const R = resolver(build, cat);
    const avisos = R.avisos.slice();
    const G = R.gabinete;
    const Q = quadro(G);
    const raiz = new THREE.Group();
    // fotos reais enviadas pelo usuário (chave: 'vaga|modelo'; a da placa-mãe é só o modelo)
    const fotoDe = (slot, id) => (opts.fotos ? opts.fotos[slot === 'mb-topo' ? id : slot + '|' + id] || null : null);
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
    const fotoMB = fotoDe('mb-topo', R.ids.placaMae);
    const mb = daCache(usarCache, 'mb|' + receita(MB, idFoto(fotoMB)), () => M.placaMae(MB, { foto: fotoMB }));
    orientar(mb, vdir('frente'), vdir('cima'), vdir('esquerda'), new THREE.Vector3(faceX, topoY, Q.Z(G.placaMae.traseira)));
    const mbPonto = (x, y, z) => mb.localToWorld(new THREE.Vector3(x, -y, z));
    registrar('placaMae', MB.nome, 'Placa-mãe', mb, {
      massa: (MB.massa || 900) + 45, massaEstimada: !MB.massa || (MB.estimado || []).includes('massa'),
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
      const fotoRam = fotoDe('memoria-lado', R.ids.memoria);
      const mod = daCache(usarCache, 'ram|' + n + '|' + receita(RAM, rgb, idFoto(fotoRam)), () => M.memoria(RAM, rgb, fotoRam));
      orientar(mod, vdir('frente'), vdir('esquerda'), vdir('baixo'), mbPonto(MB.dimm.x[si], MB.dimm.y, 1.5));
      registrar('memoria-' + n, RAM.nome + ' (slot ' + ['A1', 'A2', 'B1', 'B2'][si] + ')', 'Memória', mod, {
        ignora: ['placaMae'],
        massa: RAM.massa || 40, massaEstimada: !RAM.massa,
        info: {
          medidas: [['Altura', fmt(RAM.altura) + ' mm'], ['Comprimento', fmt(RAM.comprimento) + ' mm'], ['Capacidade', RAM.capacidade + ' GB']],
          notas: 'Pentes nos slots A2 e B2 (recomendado para 2 pentes).', fontes: RAM.fontes, estimado: RAM.estimado
        }
      });
    });

    // conexões flexíveis (mangueiras, riser): cordas na física
    const ligacoes = [];

    /* ---------- watercooler ---------- */
    const CL = R.cooler;
    const cfgC = build.refrigeracao || {};
    const zonaRadId = cfgC.local;
    const zonaRad = G.montagens[zonaRadId];
    const bombaPos = mbPonto(MB.soquete.x, MB.soquete.y, 9);
    const fotoBomba = fotoDe('bomba-topo', R.ids.cooler);
    const bomba = daCache(usarCache, 'bomba|' + receita(CL.bomba, CL.cor, rgb, CL.estilo, idFoto(fotoBomba)), () => M.bomba(CL.bomba, CL.cor, rgb, CL.estilo, fotoBomba));
    orientar(bomba, vdir('frente'), vdir('cima'), vdir('esquerda'), bombaPos, 'y');
    const massaCL = CL.massa || {};
    const clEst = !CL.massa || (CL.estimado || []).includes('massa');
    registrar('bomba', 'Bomba — ' + CL.nome, 'Watercooler', bomba, {
      ignora: ['placaMae'],
      massa: massaCL.bomba || 400, massaEstimada: clEst,
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
      const rad = daCache(usarCache, 'rad|' + receita(CL.radiador, CL.cor, R.coolerFan.tamanho, CL.estilo), () => M.radiador(CL.radiador, CL.cor, R.coolerFan.tamanho, CL.estilo));
      const sentido = (Number(cfgC.tubos) || 1) >= 0 ? 1 : -1;
      const radX = a.clone().multiplyScalar(sentido);
      orientar(rad, radX, new THREE.Vector3().crossVectors(k, radX), k, c.clone().addScaledVector(k, radOff + Tr / 2), 'y');
      const classe = CL.fans.quantidade * R.coolerFan.tamanho;
      registrar('radiador', 'Radiador ' + classe + ' mm — ' + CL.nome, 'Watercooler', rad, {
        grupo: 'aio',
        massa: massaCL.radiador || 600, massaEstimada: clEst,
        info: {
          medidas: [['Radiador', fmt(CL.radiador.comprimento) + ' × ' + fmt(CL.radiador.largura) + ' × ' + fmt(CL.radiador.espessura) + ' mm'], ['Posição', zonaRad.nome]],
          notas: CL.notas, fontes: CL.fontes, estimado: CL.estimado
        }
      });
      const saida = cfgC.fluxo !== 'entrada';
      const ar = n.clone().multiplyScalar(saida ? 1 : -1);
      for (let i = 0; i < CL.fans.quantidade; i++) {
        const fotoCuboRad = fotoDe('fan-cubo', R.ids.coolerFan), setaRad = saida ? COR_SAIDA : COR_ENTRADA;
        const f = daCache(usarCache, 'fanRad|' + i + '|' + receita(R.coolerFan, rgb, setaRad, idFoto(fotoCuboRad)), () => M.fan(R.coolerFan, { rgb, setaCor: setaRad, fotoCubo: fotoCuboRad }));
        const centro = c.clone().addScaledVector(a, (i - (CL.fans.quantidade - 1) / 2) * R.coolerFan.tamanho);
        posicionarFan(f, centro, k, fanOff, Tf, ar, a);
        registrar('fanRad-' + i, R.coolerFan.nome + ' (radiador ' + (i + 1) + ')', 'Watercooler', f, {
          grupo: 'aio',
          massa: R.coolerFan.massa || 150, massaEstimada: !R.coolerFan.massa,
          info: {
            medidas: [['Tamanho', R.coolerFan.tamanho + ' × ' + R.coolerFan.tamanho + ' × ' + R.coolerFan.espessura + ' mm'], ['Fluxo', saida ? 'Exaustão (saída)' : 'Entrada']],
            fontes: R.coolerFan.fontes
          }
        });
        aioFans.push({ tamanho: R.coolerFan.tamanho, saida, cfm: cfmDe(R.coolerFan), radiador: true, centro, ar: ar.clone() });
      }
      // tubos
      const portasRad = rad.userData.portas.map((p) => ({ pos: rad.localToWorld(p.pos.clone()), dir: p.dir.clone().transformDirection(rad.matrixWorld) }));
      const portasBomba = bomba.userData.portas.map((p) => ({ pos: bomba.localToWorld(p.pos.clone()), dir: p.dir.clone().transformDirection(bomba.matrixWorld) }));
      const tubos = new THREE.Group();
      let retaMang = 0, trajetoMang = 0;
      const xMax = (i) => faceX - 60 - i * 14;
      for (let i = 0; i < 2; i++) {
        const A = portasRad[i], B = portasBomba[1 - i] || portasBomba[0];
        const p1 = A.pos.clone().addScaledVector(A.dir, 40);
        const p3 = B.pos.clone().addScaledVector(B.dir, 45);
        const meio = p1.clone().lerp(p3, 0.5);
        meio.x = Math.min(meio.x, faceX - 60 - i * 14);
        const pts = [A.pos, p1, meio, p3, B.pos];
        const mTubo = daCache(usarCache, 'tubo|' + i + '|' + receitaR(pts, CL.cor), () => M.tubo(pts, 6.2, CL.cor, null, CL.cor));
        tubos.add(mTubo);
        // na física a mangueira vira uma corda: segura a bomba e se redesenha entre as conexões
        ligacoes.push({
          tipo: 'mangueira', obj: mTubo, partes: ['radiador', 'bomba'], comprimento: CL.mangueira || 400,
          a: { pos: A.pos.clone(), dir: A.dir.clone() }, b: { pos: B.pos.clone(), dir: B.dir.clone() },
          refazer(pa, da, pb, db, folga) {
            const q1 = pa.clone().addScaledVector(da, 40), q3 = pb.clone().addScaledVector(db, 45);
            const m = q1.clone().lerp(q3, 0.5);
            m.y -= folga * 0.45;
            const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([pa, q1, m, q3, pb], false, 'centripetal'), 60, 6.2, 12, false);
            mTubo.geometry.dispose();
            mTubo.geometry = g;
          }
        });
        retaMang = Math.max(retaMang, A.pos.distanceTo(B.pos));
        trajetoMang = Math.max(trajetoMang, compLinha(new THREE.CatmullRomCurve3(pts).getPoints(40)));
      }
      registrar('tubos', 'Mangueiras — ' + CL.nome, 'Watercooler', tubos, { colide: false, massa: massaCL.mangueiras || 180, massaEstimada: true, info: { notas: 'Traçado ilustrativo das mangueiras.' } });
      radInfo = { zona: zonaRadId, classe, deslocamento: desloc, folgaEixo, mangueira: { reta: retaMang, trajeto: trajetoMang, disponivel: CL.mangueira || null } };
      if (zonaRad.radiador && classe > zonaRad.radiador) avisos.push('Radiador ' + classe + ' mm maior que o suportado em ' + zonaRad.nome + ' (' + zonaRad.radiador + ' mm).');
    } else {
      avisos.push('O gabinete não tem a montagem “' + zonaRadId + '” para o radiador.');
    }

    /* ---------- fonte ---------- */
    const PSU = R.fonte;
    const F = G.fonte;
    const fotoFonte = fotoDe('fonte-lado', R.ids.fonte);
    const fonte = daCache(usarCache, 'fonte|' + receita(PSU, idFoto(fotoFonte)), () => M.fonte(PSU, fotoFonte));
    orientar(fonte, vdir(F.larguraPara), vdir(F.ventoinhaPara), vdir(F.comprimentoPara), Q.p(F.ancora.x, F.ancora.y, F.ancora.z));
    registrar('fonte', PSU.nome, 'Fonte', fonte, {
      ignora: ['caixaFonte'],
      massa: PSU.massa || 1600, massaEstimada: !PSU.massa,
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
    const f0 = cfgGpu.fans;
    f0.quantidade = Math.max(0, Math.min(3, Math.round(Number(f0.quantidade)) || 0));
    f0.espacamento = Math.max(0, Math.min(60, Number(f0.espacamento) || 0));
    f0.deslocamento = Math.max(-120, Math.min(120, Number(f0.deslocamento) || 0));
    const fotosGpu = { frente: fotoDe('gpu-frente', R.ids.gpu), borda: fotoDe('gpu-borda', R.ids.gpu), backplate: fotoDe('gpu-backplate', R.ids.gpu), cubo: fotoDe('fan-cubo', R.ids.gpuFan) };
    // a placa (aletas, heatpipes, backplate…) e os fans presos nela são entradas separadas
    // do cache: os sliders de espaço/posição dos fans não refazem a placa inteira
    const cfgCorpo = { modo: cfgGpu.modo, dedosX };
    const gpu = daCache(usarCache, 'gpu|' + receita(GPU, cfgCorpo, [fotosGpu.frente, fotosGpu.borda, fotosGpu.backplate].map(idFoto)), () => M.placaDeVideoCorpo(GPU, cfgCorpo, fotosGpu));
    for (const c of gpu.children.slice()) if (c.userData.fansDaPlaca) gpu.remove(c);
    let fansGpu = null;
    if (cfgGpu.modo === 'deshroud') {
      // a chave não inclui espaço/deslocamento: esses só reposicionam os fans
      fansGpu = daCache(usarCache, 'gpuFans|' + receita(GPU.nome, GPU.deshroud, cfgGpu.fans.quantidade, R.gpuFan, rgb, idFoto(fotosGpu.cubo)), () => M.placaDeVideoFans(GPU, cfgGpu, R.gpuFan, rgb, fotosGpu));
      M.posicionarFansGpu(fansGpu, GPU, cfgGpu, R.gpuFan);
      fansGpu.userData.fansDaPlaca = true;
      gpu.add(fansGpu);
    }
    M.acoplarFansGpu(gpu, fansGpu);
    const slotY = topoY - slot0.y;
    const gv = G.gpuVertical;
    const num = (v) => (v == null || v === '' ? NaN : Number(v));
    let distancia = num(cg.distanciaBandeja);
    if (!isFinite(distancia)) distancia = gv.distanciaPadrao || 70;
    let altura = num(cg.alturaDoChao);
    if (!isFinite(altura)) altura = gv.alturaPadrao || gv.alturaMin + 10;
    if (vertical) {
      orientar(gpu, vdir('frente'), vdir('cima'), vdir('esquerda'), new THREE.Vector3(Q.X(G.bandeja.x + distancia), altura - 9, Q.Z(gv.suporteZ)));
    } else {
      orientar(gpu, vdir('frente'), vdir('esquerda'), vdir('baixo'), new THREE.Vector3(faceX - 3, slotY + 3.3, Q.Z(gv.suporteZ)));
    }
    const gm = gpu.userData.medidas;
    const modoTxt = cfgGpu.modo === 'deshroud'
      ? 'Sem shroud, ' + (cfgGpu.fans.quantidade || 0) + '× ' + R.gpuFan.nome + ' presos com abraçadeira'
      : 'Original, com shroud';
    const nFansGpu = cfgGpu.modo === 'deshroud' ? (gpu.userData.fansGPU || 0) : 0;
    const massaGpu = cfgGpu.modo === 'deshroud'
      ? (GPU.massa || 1500) - (GPU.massaShroud || 0) + nFansGpu * (R.gpuFan.massa || 150) + nFansGpu * 2 * 2
      : GPU.massa || 1500;
    registrar('gpu', GPU.nome, 'Placa de vídeo', gpu, {
      massa: massaGpu, massaEstimada: !GPU.massa || (cfgGpu.modo === 'deshroud' && (GPU.estimado || []).includes('massaShroud')),
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
    let riserInfo = null;
    if (vertical && cg.riser !== false) {
      mb.updateMatrixWorld(true);
      gpu.updateMatrixWorld(true);
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
      riserInfo = { comprimento: compLinha(new THREE.CatmullRomCurve3(pts).getPoints(60)) + 30 };
      registrar('riser', 'Cabo riser PCIe', 'Placa de vídeo', fita, { colide: false, massa: 70, massaEstimada: true, info: { notas: 'Traçado ilustrativo do cabo riser (o comprimento real depende do modelo).' } });
      const con = new THREE.Group();
      con.add(M.caixa(Fd.x - 9, Fd.x + 9, Fd.y - 14, Fd.y + 7, Fd.z - 52, Fd.z + 52, M.std('#141518', 0.6, 0.1)));
      // a ponta do riser que entra no slot da placa-mãe fica presa na placa (acompanha ela na física)
      const conMB = M.caixa(A.x - 14, A.x, A.y - 5, A.y + 5, A.z - 48, A.z + 48, M.std('#141518', 0.6, 0.1));
      raiz.add(conMB);
      conMB.updateMatrixWorld(true);
      mb.attach(conMB);
      conMB.userData.anexo = true; // sai da placa-mãe guardada no cache antes da próxima montagem
      conMB.traverse((o) => { o.userData.parteId = 'placaMae'; });
      const nMBr = mb.localToWorld(new THREE.Vector3(0, 0, 1)).sub(mb.localToWorld(new THREE.Vector3(0, 0, 0))).normalize();
      const baixoGpu = gpu.localToWorld(new THREE.Vector3(0, -1, 0)).sub(gpu.localToWorld(new THREE.Vector3(0, 0, 0))).normalize();
      ligacoes.push({
        tipo: 'riser', obj: fita, partes: ['placaMae', 'gpu'], comprimento: riserInfo.comprimento,
        a: { pos: A.clone(), dir: nMBr }, b: { pos: Fd.clone().addScaledVector(baixoGpu, 14), dir: baixoGpu },
        largura: gpu.localToWorld(new THREE.Vector3(1, 0, 0)).sub(gpu.localToWorld(new THREE.Vector3(0, 0, 0))).normalize(),
        refazer(pa, da, pb, db, folga, la, lb) {
          const q1 = pa.clone().addScaledVector(da, 14), q3 = pb.clone().addScaledVector(db, 22);
          const m = q1.clone().lerp(q3, 0.5);
          m.y -= folga * 0.4;
          const geo = M.riserGeo([pa, q1, m, q3, pb], (t) => la.clone().lerp(lb, t).normalize(), 64);
          fita.geometry.dispose();
          fita.geometry = geo;
        }
      });
      con.userData.colisores = [new THREE.Box3(new THREE.Vector3(Fd.x - 9, Fd.y - 14, Fd.z - 52), new THREE.Vector3(Fd.x + 9, Fd.y + 7, Fd.z + 52))];
      registrar('conectorRiser', 'Conector do riser', 'Placa de vídeo', con, { ignora: ['gpu', 'placaMae'], info: { notas: 'Encaixe do riser na placa de vídeo.' } });
    }

    /* ---------- cabos da fonte (24 pinos, 2× EPS 8 pinos, 12V-2x6) ---------- */
    const modoCabos = (build.fonte && build.fonte.cabos) || 'originais';
    const estiloCabo = ESTILOS_CABO[modoCabos];
    // cabos modulares (24 pinos, 2× EPS, 12V-2x6): ~620 g; extensões trançadas somam ~200 g (estimado)
    const MASSA_CABOS = { originais: 620, brancos: 820, pretos: 820 };
    if (CABOS && estiloCabo) {
      try {
        const cabos = montarCabos();
        if (cabos) registrar('cabos', 'Cabos da fonte', 'Fonte', cabos, { colide: false, massa: MASSA_CABOS[modoCabos] || 600, massaEstimada: true, info: { notas: 'Traçado ilustrativo: 24 pinos, 2× EPS de 8 pinos e 12V-2x6 da placa de vídeo. Os cabos passam por trás da bandeja pelos recortes de borracha.' } });
      } catch (e) { avisos.push('Não consegui desenhar os cabos: ' + e.message); }
    }
    // chicotes que não mudaram (ex.: 24 pinos quando só a GPU se mexe) são reaproveitados
    function chicote(pts, cfg) {
      return daCache(usarCache, 'cabo|' + receitaR(pts, cfg), () => CABOS.chicote(pts, cfg));
    }
    function montarCabos() {
      const g = new THREE.Group();
      raiz.updateMatrixWorld(true);
      const V = (x, y, z) => new THREE.Vector3(x, y, z);
      const nMB = mb.localToWorld(V(0, 0, 1)).sub(mb.localToWorld(V(0, 0, 0))).normalize();
      const zMB = mb.localToWorld(V(1, 0, 0)).sub(mb.localToWorld(V(0, 0, 0))).normalize();
      // tomadas da fonte (face modular)
      const W = PSU.largura, H = PSU.altura, L = PSU.comprimento;
      const lxF = fonte.localToWorld(V(1, 0, 0)).sub(fonte.localToWorld(V(0, 0, 0))).normalize();
      const tomada = (col, lin) => {
        const bb = -H / 2 + 20 + lin * 22;
        if (PSU.conectoresNaLateral) return { pos: fonte.localToWorld(V(-W / 2 - 1, bb, 29 + col * 26)), dir: fonte.localToWorld(V(-1, 0, 0)).sub(fonte.localToWorld(V(0, 0, 0))).normalize(), larg: fonte.localToWorld(V(0, 0, 1)).sub(fonte.localToWorld(V(0, 0, 0))).normalize() };
        return { pos: fonte.localToWorld(V(-W / 2 + 27 + col * 24, bb, L + 1)), dir: fonte.localToWorld(V(0, 0, 1)).sub(fonte.localToWorld(V(0, 0, 0))).normalize(), larg: lxF };
      };
      const cfgBase = Object.assign({ raio: 1.55, passo: 3.5 }, estiloCabo);
      const dentroX = (x) => Math.max(interior.min.x + 8, Math.min(interior.max.x - 6, x));
      // 24 pinos: da fonte direto ao conector na borda da frente da placa
      const t24 = tomada(0, 2);
      const c24 = mbPonto(MB.largura - 6, MB.altura * 0.3 + 26, 16);
      g.add(chicote([
        t24.pos.clone().addScaledVector(t24.dir, 11), t24.pos.clone().addScaledVector(t24.dir, 42),
        c24.clone().addScaledVector(nMB, 48).addScaledVector(zMB, 14), c24.clone().addScaledVector(nMB, 13)
      ], Object.assign({}, cfgBase, { fileiras: 2, fios: 12, largIni: t24.larg, largFim: V(0, 1, 0) })));
      // EPS: passa por trás da bandeja e volta pelo recorte de cima
      const zG = Q.Z(G.placaMae.traseira + MB.largura + 19);
      const yTopo = topoY + 8.5;
      [19, 36.5].forEach((xb, k) => {
        const t = tomada(3 + k, 0);
        const ce = mbPonto(xb, 7.5, 13);
        const zT = ce.z + 22;
        const yG = topoY - 45 - k * 18;
        g.add(chicote([
          t.pos.clone().addScaledVector(t.dir, 11), t.pos.clone().addScaledVector(t.dir, 34),
          V(dentroX(bandejaX - 16), yG, zG), V(dentroX(bandejaX + 14), yG, zG - 8),
          V(dentroX(bandejaX + 16 + k * 9), yTopo - 16, (zG + zT) / 2), V(dentroX(bandejaX + 14), yTopo, zT + 12),
          V(dentroX(bandejaX - 16), yTopo, zT), ce.clone().addScaledVector(nMB, 36).add(V(0, 5, 0)), ce.clone().addScaledVector(nMB, 13)
        ], Object.assign({}, cfgBase, { fileiras: 2, fios: 4, largIni: t.larg, largFim: zMB })));
      });
      // 12V-2x6 da placa de vídeo
      const c12 = gpu.userData.conector12v;
      if (c12) {
        const pos = gpu.localToWorld(c12.pos.clone());
        const dir = gpu.localToWorld(c12.pos.clone().add(c12.dir)).sub(pos).normalize();
        const larg = gpu.localToWorld(V(1, 0, 0)).sub(gpu.localToWorld(V(0, 0, 0))).normalize();
        const t = tomada(2, 1);
        const pa = pos.clone().addScaledVector(dir, 34);
        g.add(chicote([
          t.pos.clone().addScaledVector(t.dir, 11), t.pos.clone().addScaledVector(t.dir, 40),
          V(dentroX(Math.min(pa.x, faceX - 40)), (pa.y + t.pos.y) / 2 + 20, (pa.z + t.pos.z) / 2),
          pa, pos.clone().addScaledVector(dir, 12)
        ], Object.assign({}, cfgBase, { fileiras: 2, fios: 6, raio: 1.7, passo: 3.8, largIni: t.larg, largFim: larg })));
      }
      return g;
    }

    /* ---------- fans do gabinete ---------- */
    const fansCaso = [];
    const cfgFans = build.fans || {};
    for (const [zid, zf] of Object.entries(cfgFans)) {
      const zona = G.montagens[zid];
      if (!zf || typeof zf !== 'object') continue;
      if (!zona) {
        const n = listaVagas(zf).filter(Boolean).length;
        if (n) avisos.push('Este gabinete não tem a posição “' + zid + '”; ' + n + ' fan(s) dessa posição ficaram de fora.');
        continue;
      }
      const vagasCfg = listaVagas(zf).filter(Boolean);
      if (radInfo && zid === radInfo.zona) {
        if (vagasCfg.length) avisos.push('Os fans em “' + zona.nome + '” foram ignorados: a posição está ocupada pelo radiador.');
        continue;
      }
      const tam = Number(zf.tamanho) || tamanhosDaZona(zona)[0];
      const nV = vagasDaZona(zona, tam);
      if (!nV) { avisos.push(zona.nome + ' não aceita fans de ' + tam + ' mm.'); continue; }
      const extra = listaVagas(zf).slice(nV).filter(Boolean).length;
      if (extra) avisos.push(zona.nome + ' comporta ' + nV + '× ' + tam + ' mm; ' + extra + ' fan(s) a mais foram ignorados.');
      const n = vdir(zona.normal), a = vdir(zona.eixo);
      const k = n.clone().multiplyScalar(zona.montagem === 'fora' ? 1 : -1);
      const c = Q.p(zona.centro.x, zona.centro.y, zona.centro.z);
      const saida = zf.fluxo === 'saida';
      const ar = n.clone().multiplyScalar(saida ? 1 : -1);
      for (let i = 0; i < nV; i++) {
        const fid = listaVagas(zf)[i];
        if (!fid) continue;
        const fs = cat.fans[fid];
        if (!fs) { avisos.push('Fan “' + fid + '” não existe no catálogo.'); continue; }
        const fotoCubo = fotoDe('fan-cubo', fid), setaFan = saida ? COR_SAIDA : COR_ENTRADA;
        const f = daCache(usarCache, 'fan|' + zid + ':' + i + '|' + receita(fs, rgb, setaFan, idFoto(fotoCubo)), () => M.fan(fs, { rgb, setaCor: setaFan, fotoCubo }));
        const centro = c.clone().addScaledVector(a, (i - (nV - 1) / 2) * tam);
        posicionarFan(f, centro, k, 0, fs.espessura, ar, a);
        const id = 'fan:' + zid + ':' + i;
        registrar(id, zona.nome + ' ' + (i + 1) + ' — ' + fs.nome, 'Fans', f, {
          ignora: zona.montagem === 'fora' ? ['bandeja'] : [],
          massa: fs.massa || 150, massaEstimada: !fs.massa,
          info: {
            medidas: [['Tamanho', fs.tamanho + ' × ' + fs.tamanho + ' × ' + fs.espessura + ' mm'], ['Fluxo', saida ? 'Exaustão (saída)' : 'Entrada']],
            fontes: fs.fontes
          }
        });
        if (fs.tamanho !== tam) avisos.push(zona.nome + ' ' + (i + 1) + ': o fan tem ' + fs.tamanho + ' mm, mas a posição está configurada para ' + tam + ' mm.');
        fansCaso.push({ zona: zid, tamanho: fs.tamanho, saida, cfm: cfmDe(fs), id, centro: centro.clone(), ar: ar.clone() });
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
    const ioAcima = G.traseira.ioTopoAcima != null ? G.traseira.ioTopoAcima : 18;
    if (G.traseira.rearIO) addFuro({ x0: faceX - 42.15, x1: faceX + 2.3, y0: topoY + ioAcima - 158.75, y1: topoY + ioAcima, r: 1, io: true });
    const zt = G.montagens.traseira;
    const gradeTraseira = !!G.traseira.grade;
    if (zt && !gradeTraseira) {
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
    const PS = G.traseira.placaSlots;
    if (!PS) addFuro(furoGpu);
    const tampasSlot = [];
    const tampasVerticais = [];
    const nSlotsCaso = G.traseira.slots || 7;
    let placaSlots = null;
    if (PS) {
      // placa de 7 slots removível: deitada (GPU horizontal) ou girada (GPU vertical)
      placaSlots = { x0: Q.X(PS.x[1]), x1: Q.X(PS.x[0]), y0: PS.y[0], y1: PS.y[1], vertical };
      const slotBase = gv.slotBaseX != null ? gv.slotBaseX : PS.x[0] - 7;
      for (let i = 0; i < nSlotsCaso; i++) {
        let t;
        if (vertical) {
          const cx = Q.X(slotBase + PASSO_SLOT / 2 + i * PASSO_SLOT);
          t = { x0: cx - 8.4, x1: cx + 8.4, y0: PS.y[0] + 6, y1: PS.y[1] - 6 };
        } else {
          const cy = G.traseira.slot1Y - i * PASSO_SLOT;
          t = { x0: placaSlots.x0 + 6, x1: placaSlots.x1 - 6, y0: cy - 8.4, y1: cy + 8.4 };
        }
        (vertical ? tampasVerticais : tampasSlot).push(Object.assign(t, { ocupada: sobrepoe2D(t, furoGpu) }));
      }
      const dentro = furoGpu.x0 >= placaSlots.x0 - 3 && furoGpu.x1 <= placaSlots.x1 + 3 && furoGpu.y0 >= placaSlots.y0 - 3 && furoGpu.y1 <= placaSlots.y1 + 3;
      if (!dentro) avisos.push('O suporte (bracket) da placa de vídeo não fica alinhado com a placa de slots do gabinete: ajuste a distância/altura da GPU vertical.');
    } else if (vertical) {
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
    // grade de furos quadrados da traseira (fica sólida perto dos recortes)
    const traseiraGrade = gradeTraseira ? Object.assign({}, G.traseira.grade, { placa: placaSlots }) : null;
    const trs = G.placaMae.traseira;
    const furosBandeja = [];
    const bandejaAte = G.bandeja.ateZ || Q.D - P.frente.espessura;
    const limBandeja = { x0: P.traseira.espessura + 4, x1: bandejaAte - 4, y0: G.pes + P.fundo.espessura + 4, y1: Q.H - P.topo.espessura - 4 };
    const addFuroBandeja = (f) => {
      const r = f.circulo ? { x0: f.u - f.r, x1: f.u + f.r, y0: f.v - f.r, y1: f.v + f.r } : { x0: f.u0, x1: f.u1, y0: f.v0, y1: f.v1 };
      if (r.x0 < limBandeja.x0 || r.x1 > limBandeja.x1 || r.y0 < limBandeja.y0 || r.y1 > limBandeja.y1) return;
      if (furosBandeja.some((o) => sobrepoe2D(o._r, r))) return;
      f._r = r;
      furosBandeja.push(f);
    };
    addFuroBandeja({ u0: trs + 50, u1: trs + 170, v0: topoY - 140, v1: topoY - 25, r: 6 });
    // recortes de cabo na frente da placa (2 grandes, como na foto) e em cima da placa (EPS e fans do topo)
    const uFrente = Math.min(bandejaAte - 30, trs + MB.largura + 22);
    for (const [a, b] of [[20, 110], [130, 230]]) addFuroBandeja({ u0: uFrente, u1: uFrente + 18, v0: topoY - b, v1: topoY - a, r: 7 });
    for (let i = 0; i < 4; i++) addFuroBandeja({ u0: trs + 12 + i * 58, u1: trs + 58 + i * 58, v0: topoY + 8, v1: topoY + 26, r: 8 });
    for (const a of [30, 150]) addFuroBandeja({ u0: trs + a, u1: trs + a + 55, v0: topoY - MB.altura - 26, v1: topoY - MB.altura - 12, r: 4 });
    const zl = G.montagens.lateral;
    if (zl) addFuroBandeja({ circulo: true, grade: true, u: zl.centro.z, v: zl.centro.y, r: Math.max(...tamanhosDaZona(zl)) * 0.46 });

    // suporte do fan da lateral direita (na frente da bandeja, sob a fonte)
    let suporteLateral = null;
    if (zl && G.bandeja.ateZ && zl.normal === 'direita') {
      const zc = Q.Z(zl.centro.z);
      suporteLateral = { x: Q.X(zl.centro.x), z0: Math.max(Q.Z(G.bandeja.ateZ) + 2, zc - 88), z1: Math.min(interior.max.z - 2, zc + 88), y0: interior.min.y + 2, y1: Math.min(caixaFonte.min.y - 2, zl.centro.y + 92) };
    }
    const corGab = (build.gabinete && build.gabinete.cor) || G.cor;
    const extrasGab = {
      furosTraseira, tampasSlot, tampasVerticais, furosBandeja, traseiraGrade, suporteLateral,
      bandejaMundoX: bandejaX, bandejaAteZ: bandejaAte,
      caixaFonte: { box: caixaFonte, faces: facesFonte }
    };
    const caso = daCache(usarCache, 'gab|' + receita(G, corGab, extrasGab), () => M.gabinete(G, Q, corGab, extrasGab));
    const pCaixa = partes.find((p) => p.id === 'caixaFonte');
    if (pCaixa && caso.caixaFonte) {
      pCaixa.obj = caso.caixaFonte;
      caso.caixaFonte.traverse((o) => { o.userData.parteId = 'caixaFonte'; });
      raiz.add(caso.caixaFonte);
      pCaixa.info = { notas: 'Chapa perfurada que cobre a fonte no canto frontal superior. Use “Ocultar” para ver a fonte.' };
    }
    registrar('gabinete', G.nome, 'Gabinete', caso.grupo, {
      colide: false,
      massa: G.massa || 8000, massaEstimada: !G.massa || (G.estimado || []).includes('massa'),
      info: {
        medidas: [['Externas (P × L × A)', Q.D + ' × ' + Q.W + ' × ' + Q.H + ' mm'], ['GPU até', G.limites.gpuComprimento + ' mm'], ['Cooler até', G.limites.coolerAltura + ' mm'], ['Fonte até', G.limites.fonteComprimento + ' mm']],
        notas: G.notas, fontes: G.fontes, estimado: G.estimado
      }
    });
    registrar('bandeja', 'Bandeja da placa-mãe', 'Gabinete', null, {
      caixas: [new THREE.Box3(new THREE.Vector3(bandejaX, interior.min.y, interior.min.z), new THREE.Vector3(bandejaX + 1.2, interior.max.y, Q.Z(bandejaAte)))],
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

    /* ---------- menos chamadas de desenho ---------- */
    if (opts.fundir !== false) {
      for (const p of caso.paineis) p.obj.userData.naoFundir = true;
      for (const p of partes) if (p.obj && !p.obj.userData.fundido) { fundirMalhas(p.obj); if (p.obj.userData.daCache) p.obj.userData.fundido = true; }
      // fans da placa que entraram numa placa já fundida
      if (fansGpu && !fansGpu.userData.fundido) { fundirMalhas(fansGpu); if (fansGpu.userData.daCache) fansGpu.userData.fundido = true; }
    }
    if (usarCache) despejarCache();

    /* ---------- vagas de fan (para o site mostrar onde dá para colocar) ---------- */
    const vagas = [];
    const penetra = (a, b) => Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x) > 0.4 && Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y) > 0.4 && Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z) > 0.4;
    for (const [zid, zona] of Object.entries(G.montagens)) {
      if (radInfo && radInfo.zona === zid) continue;
      const zf = cfgFans[zid] || {};
      const tams = tamanhosDaZona(zona);
      const tam = Number(zf.tamanho) && tams.includes(Number(zf.tamanho)) ? Number(zf.tamanho) : (tams.includes(140) ? 140 : tams[0]);
      const nV = vagasDaZona(zona, tam);
      const n = vdir(zona.normal), a = vdir(zona.eixo);
      const k = n.clone().multiplyScalar(zona.montagem === 'fora' ? 1 : -1);
      const c = Q.p(zona.centro.x, zona.centro.y, zona.centro.z);
      const saida = zf.fluxo ? zf.fluxo === 'saida' : ['topo', 'traseira'].includes(zid);
      const ar = n.clone().multiplyScalar(saida ? 1 : -1);
      for (let i = 0; i < nV; i++) {
        const fid = listaVagas(zf)[i];
        const ocupada = !!(fid && cat.fans[fid] && Number(zf.tamanho || tam) === tam);
        const centro = c.clone().addScaledVector(a, (i - (nV - 1) / 2) * tam);
        const dummy = new THREE.Object3D();
        posicionarFan(dummy, centro, k, 0, 25, ar, a);
        const caixa = new THREE.Box3(new THREE.Vector3(-tam / 2, -tam / 2, 0), new THREE.Vector3(tam / 2, tam / 2, 25)).applyMatrix4(dummy.matrixWorld);
        let conflito = null;
        if (!ocupada) {
          for (const p of partes) {
            if (!p.colide || !p.caixas.length || p.id === 'bandeja' || p.id.startsWith('fan:' + zid + ':')) continue;
            if (p.caixas.some((b) => penetra(b, caixa))) { conflito = p.nome; break; }
          }
        }
        vagas.push({ zona: zid, nomeZona: zona.nome, i, tamanho: tam, centro, normal: n.clone(), eixo: a.clone(), k: k.clone(), ar, saida, ocupada, conflito, quaternion: dummy.quaternion.clone(), posicao: dummy.position.clone() });
      }
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
    // volume do vão entre duas caixas ao longo de um eixo (para marcar no 3D)
    const vao = (a, b, eixo) => {
      if (a.isEmpty() || b.isEmpty()) return null;
      const r = new THREE.Box3();
      for (const k of ['x', 'y', 'z']) {
        if (k === eixo) { r.min[k] = Math.min(a.max[k], b.min[k]); r.max[k] = Math.max(a.max[k], b.min[k]); continue; }
        const lo = Math.max(a.min[k], b.min[k]), hi = Math.min(a.max[k], b.max[k]);
        if (hi > lo) { r.min[k] = lo; r.max[k] = hi; } else { r.min[k] = b.min[k]; r.max[k] = b.max[k]; }
      }
      return r;
    };
    const paredeVidro = new THREE.Box3(new THREE.Vector3(vidroX - 1, interior.min.y, interior.min.z), new THREE.Vector3(vidroX, interior.max.y, interior.max.z));
    const fansNoVidro = vertical && cfgGpu.modo === 'deshroud' && (gpu.userData.fansGPU || 0) > 0;
    folgas.push({
      nome: 'Placa de vídeo ↔ vidro lateral', valor: bGpu.min.x - vidroX, minimo: fansNoVidro ? 20 : 10, pecas: ['gpu'], regiao: vao(paredeVidro, bGpu, 'x'),
      dica: fansNoVidro ? 'Os fans presos na placa puxam ar desse vão: com menos de ~20 mm eles ficam sufocados e fazem mais barulho.' : ''
    });
    const bBomba = uniao((p) => p.id === 'bomba');
    folgas.push({ nome: 'Topo da bomba ↔ vidro lateral', valor: bBomba.min.x - vidroX, minimo: 5, pecas: ['bomba'], regiao: vao(paredeVidro, bBomba, 'x') });
    if (radInfo) {
      const bRad = uniao((p) => p.grupo === 'aio');
      if (G.montagens[radInfo.zona].normal === 'cima') {
        const bMB = uniao((p) => p.id === 'placaMae');
        const topoMB = bMB.clone(); topoMB.max.y = topoY; topoMB.min.y = topoY - 1;
        folgas.push({ nome: 'Radiador + fans ↔ borda de cima da placa-mãe', valor: bRad.min.y - topoY, minimo: 3, pecas: ['radiador', 'placaMae'], regiao: vao(topoMB, bRad, 'y') });
        const bRam = uniao((p) => p.id.startsWith('memoria-'));
        if (!bRam.isEmpty()) folgas.push({ nome: 'Memórias ↔ fans do radiador', valor: bRad.min.y - bRam.max.y, minimo: 3, pecas: ['radiador', 'memoria-0'], regiao: vao(bRam, bRad, 'y') });
      }
    }
    const bFundo = uniao((p) => p.id.startsWith('fan:fundo:'));
    const bGpuConj = uniao((p) => p.id === 'gpu' || p.id === 'conectorRiser');
    if (!bFundo.isEmpty()) folgas.push({ nome: 'Placa de vídeo (com riser) ↔ fans do fundo', valor: bGpuConj.min.y - bFundo.max.y, minimo: 3, pecas: ['gpu', 'fan:fundo:0'], regiao: vao(bFundo, bGpuConj, 'y') });
    const sobrepoeXZ = (a, b) => a.min.x < b.max.x && b.min.x < a.max.x && a.min.z < b.max.z && b.min.z < a.max.z;
    if (sobrepoeXZ(bGpu, caixaFonte) && caixaFonte.min.y >= bGpu.max.y - 1) folgas.push({ nome: 'Placa de vídeo ↔ compartimento da fonte', valor: caixaFonte.min.y - bGpu.max.y, minimo: 3, pecas: ['gpu', 'fonte'], regiao: vao(bGpu, caixaFonte, 'y') });
    const eixoFonte = vdir(F.comprimentoPara);
    const tamCaixa = Math.abs(eixoFonte.x) * (caixaFonte.max.x - caixaFonte.min.x) + Math.abs(eixoFonte.y) * (caixaFonte.max.y - caixaFonte.min.y) + Math.abs(eixoFonte.z) * (caixaFonte.max.z - caixaFonte.min.z);
    folgas.push({ nome: 'Espaço para cabos atrás da fonte', valor: tamCaixa - PSU.comprimento - 2, minimo: 15, pecas: ['fonte'] });

    /* ---------- massas, centro de massa e estabilidade ----------
       Cada peça conta no centro da sua caixa; o gabinete, um pouco abaixo do
       meio (base, pés e trilhos são a parte mais pesada da chapa). */
    const massas = { itens: [], total: 0, cg: new THREE.Vector3(), estimado: false };
    for (const p of partes) {
      if (!(p.massa > 0)) continue;
      let centro;
      if (p.id === 'gabinete') centro = new THREE.Vector3(0, Q.H * 0.44, 0);
      else {
        const b = new THREE.Box3();
        for (const c of p.caixas) b.union(c);
        if (b.isEmpty() && p.obj) b.setFromObject(p.obj);
        if (b.isEmpty()) continue;
        centro = b.getCenter(new THREE.Vector3());
      }
      massas.itens.push({ id: p.id, nome: p.nome, gramas: p.massa, estimado: !!p.massaEstimada, centro });
      massas.total += p.massa;
      massas.cg.addScaledVector(centro, p.massa);
      if (p.massaEstimada) massas.estimado = true;
    }
    if (massas.total > 0) massas.cg.multiplyScalar(1 / massas.total);
    // apoio: sapatas de borracha dos dois trilhos (ver modelos3d.gabinete)
    const apoio = { x0: -Q.W / 2 + 11.5, x1: Q.W / 2 - 11.5, z0: -Q.D / 2 + 27, z1: Q.D / 2 - 27 };
    const hCg = Math.max(1, massas.cg.y);
    const lados = [
      { lado: 'o lado do vidro', d: massas.cg.x - apoio.x0 }, { lado: 'a lateral direita', d: apoio.x1 - massas.cg.x },
      { lado: 'trás', d: massas.cg.z - apoio.z0 }, { lado: 'a frente', d: apoio.z1 - massas.cg.z }
    ].map((l) => Object.assign(l, { graus: Math.atan2(Math.max(0, l.d), hCg) * 180 / Math.PI }));
    lados.sort((u, v) => u.graus - v.graus);
    massas.apoio = apoio;
    massas.tombamento = lados[0];
    massas.lados = lados;
    // torque na placa de vídeo (horizontal: o slot e o suporte seguram tudo)
    const itGpu = massas.itens.find((i) => i.id === 'gpu');
    if (itGpu && !vertical) {
      const braco = Math.abs(itGpu.centro.z - Q.Z(gv.suporteZ)) / 1000;
      massas.torqueGpu = { nm: (itGpu.gramas / 1000) * 9.81 * braco, braco: braco * 1000 };
    }

    /* ---------- resumo do fluxo de ar ---------- */
    const peso = (s) => (s * s) / (120 * 120);
    const todos = fansCaso.concat(aioFans);
    // radiador atrapalha a passagem do ar: ~30% a menos de vazão nos fans dele
    const vazao = (f) => f.cfm * (f.radiador ? 0.7 : 1);
    const fluxo = {
      entrada: todos.filter((f) => !f.saida).length,
      saida: todos.filter((f) => f.saida).length,
      areaEntrada: todos.filter((f) => !f.saida).reduce((s, f) => s + peso(f.tamanho), 0),
      areaSaida: todos.filter((f) => f.saida).reduce((s, f) => s + peso(f.tamanho), 0),
      cfmEntrada: todos.filter((f) => !f.saida).reduce((s, f) => s + vazao(f), 0),
      cfmSaida: todos.filter((f) => f.saida).reduce((s, f) => s + vazao(f), 0),
      fans: todos
    };

    return {
      raiz, partes, paineis: caso.paineis, Q, R, G, avisos, interior, folgas, fluxo, massas, ligacoes,
      radInfo, riserInfo, vertical, distancia, altura, vagas,
      contagem: { fansCaso: fansCaso.length, fansAio: aioFans.length, fansGpu: gpu.userData.fansGPU || 0, pentes: slotsUsados.length }
    };
  }

  /* Junta malhas irmãs com o mesmo material numa só (bem menos chamadas de
     desenho). Roda antes do primeiro desenho, então nada vai para a GPU à toa.
     Ficam de fora: LEDs RGB, rotores, setas, painéis, vidro e instâncias. */
  function fundirMalhas(raiz) {
    const tmp = new THREE.Matrix4();
    raiz.traverse((pai) => {
      if (pai.children.length < 2 || pai.userData.naoFundir) return;
      const grupos = new Map();
      for (const m of pai.children) {
        if (!m.isMesh || m.isInstancedMesh || m.children.length || Array.isArray(m.material)) continue;
        if (m.userData.rgb || m.userData.naoFundir || m.userData.fluxo || m.userData.rotor || m.material.transparent) continue;
        const g = m.geometry;
        const nomes = Object.keys(g.attributes);
        if (!g.attributes.position || !g.attributes.normal || nomes.some((n) => n !== 'position' && n !== 'normal' && n !== 'uv')) continue;
        const k = m.material.uuid + '|' + m.castShadow + m.receiveShadow + '|' + m.renderOrder + '|' + m.visible + '|' + (g.attributes.uv ? 1 : 0);
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k).push(m);
      }
      for (const lista of grupos.values()) {
        if (lista.length < 2) continue;
        const geos = lista.map((m) => {
          m.updateMatrix();
          const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
          g.applyMatrix4(tmp.copy(m.matrix));
          return g;
        });
        const temUV = !!geos[0].attributes.uv;
        let n = 0;
        for (const g of geos) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = temUV ? new Float32Array(n * 2) : null;
        let o = 0;
        for (const g of geos) {
          pos.set(g.attributes.position.array, o * 3);
          nor.set(g.attributes.normal.array, o * 3);
          if (uv) uv.set(g.attributes.uv.array, o * 2);
          o += g.attributes.position.count;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const base = lista[0];
        const junto = new THREE.Mesh(geo, base.material);
        junto.castShadow = base.castShadow;
        junto.receiveShadow = base.receiveShadow;
        junto.renderOrder = base.renderOrder;
        junto.userData = Object.assign({}, base.userData);
        for (const m of lista) pai.remove(m);
        pai.add(junto);
      }
    });
  }

  /* Libera a memória da GPU ocupada por uma montagem antiga. */
  function descartar(obj, forcar) {
    (function rec(o) {
      if (!forcar && o.userData.daCache) return; // continua guardada no cache (pode ser reusada)
      if (o.geometry && !o.geometry.userData.compartilhado) o.geometry.dispose();
      if (o.isInstancedMesh) o.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (!m.userData.cacheado) m.dispose();
      for (const c of o.children) rec(c);
    })(obj);
  }
  // esvazia o cache (ex.: trocar a qualidade das texturas)
  function limparCache() { geracao++; despejarCache(true); }

  return { montar, resolver, quadro, cfmDe, lerCaminho, gravarCaminho, vagasDaZona, tamanhosDaZona, descartar, limparCache, CORES: { entrada: COR_ENTRADA, saida: COR_SAIDA } };
};
