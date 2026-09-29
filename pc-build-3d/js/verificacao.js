/*
 * Checagem da montagem: limites do gabinete, colisões entre peças,
 * peças saindo do gabinete, consumo de energia e fluxo de ar.
 * Cada item: { nivel: 'ok' | 'aviso' | 'erro' | 'info', titulo, detalhe }.
 */
window.PCBVerificacao = function () {
  'use strict';

  const TOL = 0.4; // mm de sobreposição tolerada (peças encostando)

  function fmt(n, casas = 0) {
    const f = Math.pow(10, casas);
    return (Math.round(n * f) / f).toLocaleString('pt-BR');
  }

  function penetracao(a, b) {
    const ox = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
    const oy = Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y);
    const oz = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
    return ox > TOL && oy > TOL && oz > TOL ? Math.min(ox, oy, oz) : 0;
  }

  function ignorados(a, b) {
    if (a.grupo && a.grupo === b.grupo) return true;
    const casa = (p, q) => p.ignora.some((x) => x === q.id || (q.grupo && x === q.grupo) || (x.endsWith('*') && q.id.startsWith(x.slice(0, -1))));
    return casa(a, b) || casa(b, a);
  }

  const LADOS = {
    'min.x': 'o vidro lateral', 'max.x': 'a lateral direita', 'min.y': 'o fundo',
    'max.y': 'o teto', 'min.z': 'a traseira', 'max.z': 'a frente'
  };

  function verificar(res, build) {
    const itens = [];
    const add = (nivel, titulo, detalhe) => itens.push({ nivel, titulo, detalhe });
    const { R, G, partes, interior } = res;
    const L = G.limites;

    // formato da placa-mãe
    const MB = R.placaMae;
    if ((L.placaMae || []).includes(MB.formato)) add('ok', 'Placa-mãe ' + MB.formato + ' é suportada', G.nome + ' aceita ' + L.placaMae.join(', ') + '.');
    else add('erro', 'Placa-mãe ' + MB.formato + ' não é suportada', G.nome + ' aceita apenas ' + (L.placaMae || []).join(', ') + '.');

    // fonte
    const PSU = R.fonte;
    if (PSU.comprimento <= L.fonteComprimento) add('ok', 'Fonte com ' + fmt(PSU.comprimento) + ' mm cabe (limite ' + L.fonteComprimento + ' mm)', PSU.nome + ': ' + PSU.largura + ' × ' + PSU.altura + ' × ' + PSU.comprimento + ' mm.');
    else add('erro', 'Fonte longa demais: ' + fmt(PSU.comprimento) + ' mm (limite ' + L.fonteComprimento + ' mm)', PSU.nome + ' passa ' + fmt(PSU.comprimento - L.fonteComprimento) + ' mm do limite do gabinete. Troque por uma fonte de até ' + L.fonteComprimento + ' mm.');
    const pFonte = partes.find((p) => p.id === 'fonte');
    const pCaixa = partes.find((p) => p.id === 'caixaFonte');
    if (pFonte && pCaixa) {
      const b = pFonte.caixas[0], c = pCaixa.caixas[0];
      const sobra = Math.max(c.min.x - b.min.x, b.max.x - c.max.x, c.min.y - b.min.y, b.max.y - c.max.y, c.min.z - b.min.z, b.max.z - c.max.z);
      if (sobra > TOL) add('erro', 'A fonte não cabe no compartimento', 'Sobra ' + fmt(sobra, 1) + ' mm para fora do espaço da fonte.');
    }

    // placa de vídeo
    const GPU = R.gpu;
    const deshroud = (build.gpu || {}).modo !== 'original';
    const comp = deshroud ? GPU.deshroud.comprimento : GPU.comprimento;
    if (comp <= L.gpuComprimento) add('ok', 'Placa de vídeo com ' + fmt(comp, 1) + ' mm cabe (limite ' + L.gpuComprimento + ' mm)', GPU.nome + (deshroud ? ' sem shroud.' : ' com shroud.'));
    else add('erro', 'Placa de vídeo longa demais: ' + fmt(comp, 1) + ' mm', 'O limite do gabinete é ' + L.gpuComprimento + ' mm.');

    // watercooler
    const CL = R.cooler;
    if (res.radInfo) {
      const z = G.montagens[res.radInfo.zona];
      if (!z.radiador) add('erro', 'Radiador em ' + z.nome + ' não é suportado', 'Essa posição não aceita radiador.');
      else if (res.radInfo.classe <= z.radiador) add('ok', 'Radiador de ' + res.radInfo.classe + ' mm em ' + z.nome + ' (até ' + z.radiador + ' mm)', CL.nome + ': ' + CL.radiador.comprimento + ' × ' + CL.radiador.largura + ' × ' + CL.radiador.espessura + ' mm.');
      else add('erro', 'Radiador de ' + res.radInfo.classe + ' mm não cabe em ' + z.nome, 'Essa posição aceita até ' + z.radiador + ' mm.');
    }
    const alturaCooler = 9 + CL.bomba.altura;
    if (alturaCooler <= L.coolerAltura) add('ok', 'Bomba com ' + fmt(alturaCooler, 1) + ' mm de altura (limite ' + L.coolerAltura + ' mm)', 'Altura medida da placa-mãe até o topo da bomba.');
    else add('erro', 'Bomba alta demais: ' + fmt(alturaCooler, 1) + ' mm', 'O gabinete aceita cooler de até ' + L.coolerAltura + ' mm.');

    // colisões
    const colisoes = [];
    const lista = partes.filter((p) => p.colide && p.caixas.length);
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j];
        if (ignorados(a, b)) continue;
        let pen = 0;
        for (const ca of a.caixas) for (const cb of b.caixas) pen = Math.max(pen, penetracao(ca, cb));
        if (pen > 0) colisoes.push({ a, b, pen });
      }
    }
    for (const c of colisoes) add('erro', 'Colisão: ' + c.a.nome + ' × ' + c.b.nome, 'As peças ocupam o mesmo espaço (cerca de ' + fmt(c.pen, 1) + ' mm). Ajuste a posição ou troque uma das peças.');
    if (!colisoes.length) add('ok', 'Nenhuma peça encosta em outra', lista.length + ' peças conferidas, incluindo o compartimento da fonte e a bandeja.');

    // peças saindo do gabinete
    let fora = 0;
    for (const p of partes) {
      if (!p.colide || !p.obj) continue;
      for (const b of p.caixas) {
        const exc = {
          'min.x': interior.min.x - b.min.x, 'max.x': b.max.x - interior.max.x,
          'min.y': interior.min.y - b.min.y, 'max.y': b.max.y - interior.max.y,
          'min.z': interior.min.z - b.min.z, 'max.z': b.max.z - interior.max.z
        };
        const pior = Object.entries(exc).sort((x, y) => y[1] - x[1])[0];
        if (pior[1] > TOL) {
          add('erro', p.nome + ' atravessa ' + LADOS[pior[0]], 'Passa ' + fmt(pior[1], 1) + ' mm para fora do espaço interno.');
          fora++;
          break;
        }
      }
    }

    // folgas pequenas
    for (const f of res.folgas) {
      if (f.valor < 0) continue;
      if (f.valor < f.minimo) add('aviso', 'Folga apertada: ' + f.nome, 'Só ' + fmt(f.valor, 1) + ' mm. Confira com a peça em mãos.');
    }

    // energia
    const cpuPico = Math.round(R.cpu.tdp * 1.35);
    const resto = 45 + 6 * res.contagem.pentes + 3 * (res.contagem.fansCaso + res.contagem.fansAio + res.contagem.fansGpu) + 10 + 15;
    const total = cpuPico + GPU.tgp + resto;
    const carga = total / PSU.potencia;
    const detalheEnergia = 'CPU ~' + cpuPico + ' W (PPT) + GPU ' + GPU.tgp + ' W + placa-mãe, memórias, fans e SSD ~' + resto + ' W. A RTX 5090 tem picos rápidos acima do TGP; a NVIDIA recomenda fonte de 1000 W.';
    if (carga <= 0.8) add('ok', 'Consumo estimado ~' + total + ' W de ' + PSU.potencia + ' W (' + Math.round(carga * 100) + '%)', detalheEnergia);
    else if (carga <= 1) add('aviso', 'Fonte no limite: ~' + total + ' W de ' + PSU.potencia + ' W (' + Math.round(carga * 100) + '%)', detalheEnergia);
    else add('erro', 'Fonte fraca: ~' + total + ' W de ' + PSU.potencia + ' W', detalheEnergia);

    // fluxo de ar
    const fl = res.fluxo;
    const dif = fl.areaEntrada - fl.areaSaida;
    const pressao = Math.abs(dif) < 0.35 ? 'equilibrada' : dif > 0 ? 'positiva (entra mais ar do que sai — menos poeira)' : 'negativa (sai mais ar do que entra)';
    add('info', 'Fluxo de ar: ' + fl.entrada + ' fan(s) de entrada, ' + fl.saida + ' de saída', 'Pressão ' + pressao + '. Contagem ponderada pela área (140 mm ≈ 1,36 × 120 mm). Os fans da GPU e da fonte não entram na conta.');

    for (const a of res.avisos) add('aviso', a, '');

    const erros = itens.filter((i) => i.nivel === 'erro').length;
    const avisos = itens.filter((i) => i.nivel === 'aviso').length;
    return { itens, erros, avisos, colisoes, fora, energia: { total, carga, cpuPico, resto } };
  }

  return { verificar };
};
