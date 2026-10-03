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

  // nome curto (antes do travessão) para rótulos no 3D
  function curto(nome) { return String(nome || '').split(' — ')[0].replace(/\s*\(.*\)$/, ''); }

  /* Junta volumes de contato que se tocam num só (menos rótulos no 3D). */
  function juntarRegioes(lista) {
    const out = [];
    for (const r of lista.sort((u, v) => v.pen - u.pen)) {
      const perto = out.find((o) => o.caixa.clone().expandByScalar(2).intersectsBox(r.caixa));
      if (perto) { perto.caixa.union(r.caixa); perto.pen = Math.max(perto.pen, r.pen); } else out.push({ caixa: r.caixa.clone(), pen: r.pen });
    }
    return out.slice(0, 6);
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
    const add = (nivel, titulo, detalhe, pecas, extra) => itens.push(Object.assign({ nivel, titulo, detalhe, pecas: pecas || [] }, extra || {}));
    // regiões de contato (volumes onde as peças se sobrepõem), para desenhar no 3D
    const contatos = [];
    const { R, G, partes, interior } = res;
    const L = G.limites;

    // formato da placa-mãe
    const MB = R.placaMae;
    if ((L.placaMae || []).includes(MB.formato)) add('ok', 'Placa-mãe ' + MB.formato + ' é suportada', G.nome + ' aceita ' + L.placaMae.join(', ') + '.', ['placaMae', 'gabinete']);
    else add('erro', 'Placa-mãe ' + MB.formato + ' não é suportada', G.nome + ' aceita apenas ' + (L.placaMae || []).join(', ') + '.', ['placaMae', 'gabinete']);

    // fonte
    const PSU = R.fonte;
    if (PSU.comprimento <= L.fonteComprimento) add('ok', 'Fonte com ' + fmt(PSU.comprimento) + ' mm cabe (limite ' + L.fonteComprimento + ' mm)', PSU.nome + ': ' + PSU.largura + ' × ' + PSU.altura + ' × ' + PSU.comprimento + ' mm.', ['fonte']);
    else add('erro', 'Fonte longa demais: ' + fmt(PSU.comprimento) + ' mm (limite ' + L.fonteComprimento + ' mm)', PSU.nome + ' passa ' + fmt(PSU.comprimento - L.fonteComprimento) + ' mm do limite do gabinete. Troque por uma fonte de até ' + L.fonteComprimento + ' mm.', ['fonte']);
    const pFonte = partes.find((p) => p.id === 'fonte');
    const pCaixa = partes.find((p) => p.id === 'caixaFonte');
    if (pFonte && pCaixa) {
      const b = pFonte.caixas[0], c = pCaixa.caixas[0];
      const sobra = Math.max(c.min.x - b.min.x, b.max.x - c.max.x, c.min.y - b.min.y, b.max.y - c.max.y, c.min.z - b.min.z, b.max.z - c.max.z);
      if (sobra > TOL) add('erro', 'A fonte não cabe no compartimento', 'Sobra ' + fmt(sobra, 1) + ' mm para fora do espaço da fonte.', ['fonte']);
    }

    // placa de vídeo
    const GPU = R.gpu;
    const deshroud = (build.gpu || {}).modo !== 'original';
    const comp = deshroud ? GPU.deshroud.comprimento : GPU.comprimento;
    if (comp <= L.gpuComprimento) add('ok', 'Placa de vídeo com ' + fmt(comp, 1) + ' mm cabe (limite ' + L.gpuComprimento + ' mm)', GPU.nome + (deshroud ? ' sem shroud.' : ' com shroud.'), ['gpu']);
    else add('erro', 'Placa de vídeo longa demais: ' + fmt(comp, 1) + ' mm', 'O limite do gabinete é ' + L.gpuComprimento + ' mm.', ['gpu']);

    // watercooler
    const CL = R.cooler;
    if (res.radInfo) {
      const z = G.montagens[res.radInfo.zona];
      if (!z.radiador) add('erro', 'Radiador em ' + z.nome + ' não é suportado', 'Essa posição não aceita radiador.', ['radiador']);
      else if (res.radInfo.classe <= z.radiador) add('ok', 'Radiador de ' + res.radInfo.classe + ' mm em ' + z.nome + ' (até ' + z.radiador + ' mm)', CL.nome + ': ' + CL.radiador.comprimento + ' × ' + CL.radiador.largura + ' × ' + CL.radiador.espessura + ' mm.', ['radiador']);
      else add('erro', 'Radiador de ' + res.radInfo.classe + ' mm não cabe em ' + z.nome, 'Essa posição aceita até ' + z.radiador + ' mm.', ['radiador']);
    }
    const mg = res.radInfo && res.radInfo.mangueira;
    if (mg && mg.disponivel) {
      const precisa = mg.reta * 1.15; // reta entre as conexões + folga para as curvas
      const txt = 'Distância reta entre a bomba e o radiador: ' + fmt(mg.reta) + ' mm; com as curvas, ~' + fmt(precisa) + ' mm. ' + CL.nome + ': ' + mg.disponivel + ' mm de mangueira' + ((CL.estimado || []).includes('mangueira') ? ' (estimado)' : '') + '.';
      if (mg.reta > mg.disponivel) add('erro', 'Mangueiras curtas demais para essa posição do radiador', txt, ['tubos']);
      else if (precisa > mg.disponivel) add('aviso', 'Mangueiras no limite (' + fmt(precisa) + ' de ' + mg.disponivel + ' mm)', txt + ' Aproxime o radiador da bomba ou mude o lado das mangueiras.', ['tubos']);
      else add('ok', 'Mangueiras alcançam: ~' + fmt(precisa) + ' de ' + mg.disponivel + ' mm', txt, ['tubos']);
    }
    const alturaCooler = 9 + CL.bomba.altura;
    if (alturaCooler <= L.coolerAltura) add('ok', 'Bomba com ' + fmt(alturaCooler, 1) + ' mm de altura (limite ' + L.coolerAltura + ' mm)', 'Altura medida da placa-mãe até o topo da bomba.', ['bomba']);
    else add('erro', 'Bomba alta demais: ' + fmt(alturaCooler, 1) + ' mm', 'O gabinete aceita cooler de até ' + L.coolerAltura + ' mm.', ['bomba']);

    // colisões
    const colisoes = [];
    const lista = partes.filter((p) => p.colide && p.caixas.length);
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const a = lista[i], b = lista[j];
        if (ignorados(a, b)) continue;
        let pen = 0;
        const regioes = [];
        for (const ca of a.caixas) for (const cb of b.caixas) {
          const pp = penetracao(ca, cb);
          if (pp > 0) { pen = Math.max(pen, pp); regioes.push({ caixa: ca.clone().intersect(cb), pen: pp }); }
        }
        if (pen > 0) colisoes.push({ a, b, pen, regioes: juntarRegioes(regioes) });
      }
    }
    for (const c of colisoes) {
      const onde = c.regioes[0] && c.regioes[0].caixa;
      const tam = onde ? onde.getSize(onde.min.clone()) : null;
      add('erro', 'Colisão: ' + c.a.nome + ' × ' + c.b.nome, 'As peças ocupam o mesmo espaço (cerca de ' + fmt(c.pen, 1) + ' mm' + (tam ? '; região de contato ' + fmt(tam.x) + ' × ' + fmt(tam.y) + ' × ' + fmt(tam.z) + ' mm' : '') + '). Ajuste a posição ou troque uma das peças. No 3D, o volume vermelho mostra onde elas se tocam.', [c.a.id, c.b.id], { regioes: c.regioes, pen: c.pen });
      for (const r of c.regioes) contatos.push({ caixa: r.caixa, pen: r.pen, tipo: 'colisao', rotulo: curto(c.a.nome) + ' × ' + curto(c.b.nome), pecas: [c.a.id, c.b.id] });
    }
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
          // fatia da peça que fica do lado de fora
          const r = b.clone();
          const [lim, eixo] = pior[0].split('.');
          if (lim === 'min') r.max[eixo] = Math.min(r.max[eixo], interior.min[eixo]);
          else r.min[eixo] = Math.max(r.min[eixo], interior.max[eixo]);
          add('erro', p.nome + ' atravessa ' + LADOS[pior[0]], 'Passa ' + fmt(pior[1], 1) + ' mm para fora do espaço interno.', [p.id], { regioes: [{ caixa: r, pen: pior[1] }], pen: pior[1] });
          contatos.push({ caixa: r, pen: pior[1], tipo: 'fora', rotulo: curto(p.nome) + ' × ' + LADOS[pior[0]], pecas: [p.id] });
          fora++;
          break;
        }
      }
    }

    // folgas pequenas
    for (const f of res.folgas) {
      if (f.cruza) {
        // peça sem colisão (ex.: mangueira) passando por dentro de outra
        add('aviso', f.nome, (f.dica ? f.dica + ' ' : '') + 'No 3D, o trecho aparece em vermelho.', f.pecas, f.regiao ? { regioes: [{ caixa: f.regiao, pen: f.pen }], pen: f.pen } : null);
        if (f.regiao) contatos.push({ caixa: f.regiao, pen: f.pen, tipo: 'colisao', rotulo: f.rotulo || f.nome, pecas: f.pecas, texto: f.textoContato });
        continue;
      }
      if (f.valor < 0) continue;
      if (f.valor < f.minimo) {
        add('aviso', 'Folga apertada: ' + f.nome, 'Só ' + fmt(f.valor, 1) + ' mm (mínimo recomendado ' + fmt(f.minimo) + ' mm). ' + (f.dica ? f.dica + ' ' : '') + 'No 3D, o vão aparece em amarelo. Confira com a peça em mãos.', f.pecas, f.regiao ? { regioes: [{ caixa: f.regiao, pen: f.valor }] } : null);
        if (f.regiao) contatos.push({ caixa: f.regiao, pen: f.valor, tipo: 'folga', rotulo: f.rotulo || f.nome, pecas: f.pecas });
      }
    }

    // energia
    const cpuPico = Math.round(R.cpu.tdp * 1.35);
    const resto = 45 + 6 * res.contagem.pentes + 3 * (res.contagem.fansCaso + res.contagem.fansAio + res.contagem.fansGpu + (res.contagem.fansMemoria || 0)) + 10 + 15;
    const total = cpuPico + GPU.tgp + resto;
    const carga = total / PSU.potencia;
    const detalheEnergia = 'CPU ~' + cpuPico + ' W (PPT) + GPU ' + GPU.tgp + ' W + placa-mãe, memórias, fans e SSD ~' + resto + ' W. A RTX 5090 tem picos rápidos acima do TGP; a NVIDIA recomenda fonte de 1000 W.';
    if (carga <= 0.8) add('ok', 'Consumo estimado ~' + total + ' W de ' + PSU.potencia + ' W (' + Math.round(carga * 100) + '%)', detalheEnergia, ['fonte']);
    else if (carga <= 1) add('aviso', 'Fonte no limite: ~' + total + ' W de ' + PSU.potencia + ' W (' + Math.round(carga * 100) + '%)', detalheEnergia, ['fonte']);
    else add('erro', 'Fonte fraca: ~' + total + ' W de ' + PSU.potencia + ' W', detalheEnergia, ['fonte']);

    // fluxo de ar (vazão máxima de catálogo; fans do radiador com ~30% de perda)
    const fl = res.fluxo;
    const ent = fl.cfmEntrada, sai = fl.cfmSaida;
    const razao = sai > 0 ? ent / sai : ent > 0 ? 9 : 1;
    const pressao = !ent && !sai ? 'sem fans' : razao > 1.12 ? 'positiva (entra mais ar do que sai — menos poeira)' : razao < 0.88 ? 'negativa (sai mais ar do que entra — entra poeira pelas frestas)' : 'equilibrada';
    add('info', 'Fluxo de ar: ' + fmt(ent) + ' CFM entrando, ' + fmt(sai) + ' CFM saindo', fl.entrada + ' fan(s) de entrada e ' + fl.saida + ' de saída. Pressão ' + pressao + '. Vazão máxima de catálogo; radiador reduz ~30% nos fans dele. Os fans da GPU e da fonte não entram na conta.');
    if (!sai && ent) add('aviso', 'Nenhum fan de saída', 'O ar quente só sai pelas telas. Coloque ao menos um fan de saída (traseira ou topo).', ['fans']);
    if (!ent && sai) add('aviso', 'Nenhum fan de entrada', 'Todo o ar entra pelas frestas e telas, sem filtro. Coloque fans de entrada no fundo, na frente ou na lateral.', ['fans']);

    // física: aquecimento do ar dentro do gabinete  ΔT = P / (ρ · cp · vazão)
    const radEntrada = res.radInfo && (build.refrigeracao || {}).fluxo === 'entrada';
    const calorDentro = GPU.tgp + resto + (radEntrada ? cpuPico : 0);
    const vazaoEf = ((ent + sai) / 2) * 0.6 * 0.000471947; // m³/s, fans a ~60%
    let termico = null;
    if (vazaoEf > 0) {
      const dT = calorDentro / (1.2 * 1005 * vazaoEf);
      const det = 'Calor liberado dentro do gabinete ~' + fmt(calorDentro) + ' W (GPU ' + GPU.tgp + ' W' + (radEntrada ? ', CPU pelo radiador em entrada' : '') + ', placa, memórias e SSD) ÷ (1,2 kg/m³ × 1005 J/kg·K × ' + fmt(vazaoEf * 2118.88) + ' CFM). Estimativa com os fans a ~60% da rotação, em carga máxima.' +
        (!radEntrada && res.radInfo ? ' O radiador em exaustão recebe esse ar já aquecido.' : '');
      termico = { dT, calor: calorDentro, cfm: vazaoEf * 2118.88 };
      if (dT <= 10) add('ok', 'Ar interno ~' + fmt(dT, 1) + ' °C acima da temperatura do quarto', det);
      else if (dT <= 16) add('aviso', 'Ar interno esquenta ~' + fmt(dT, 1) + ' °C em carga', det + ' Mais fans (ou fans mais fortes) baixam esse número.', ['fans']);
      else add('erro', 'Ventilação fraca: ar interno ~' + fmt(dT, 1) + ' °C acima do quarto', det + ' Adicione fans de entrada e de saída.', ['fans']);
    }

    // massa total, centro de massa e estabilidade
    const ms = res.massas;
    if (ms && ms.total > 0) {
      const kg = (g) => fmt(g / 1000, 2) + ' kg';
      const maiores = ms.itens.slice().sort((u, v) => v.gramas - u.gramas).slice(0, 6).map((i) => curto(i.nome) + ' ' + kg(i.gramas) + (i.estimado ? '*' : '')).join(' · ');
      add('info', 'Peso total do PC: ~' + fmt(ms.total / 1000, 1) + ' kg', maiores + '. Centro de massa a ' + fmt(ms.cg.y) + ' mm do chão.' + (ms.estimado ? ' * massa estimada (sem dado oficial).' : ''), ['gabinete'], { massas: true });
      const t = ms.tombamento;
      if (t) {
        const det = 'O centro de massa fica a ' + fmt(Math.max(0, t.d)) + ' mm da borda de apoio (' + t.lado + ') e a ' + fmt(ms.cg.y) + ' mm de altura: tan θ = ' + fmt(Math.max(0, t.d)) + ' ÷ ' + fmt(ms.cg.y) + '. Acima desse ângulo ele tomba sozinho.';
        if (t.graus < 8) add('aviso', 'Pouco estável: tomba inclinando só ~' + fmt(t.graus) + '° para ' + t.lado, det + ' Evite apoiar em superfície inclinada ou macia.', ['gabinete']);
        else add('ok', 'Estável: só tomba se inclinar ~' + fmt(t.graus) + '° para ' + t.lado, det, ['gabinete']);
      }
      if (ms.torqueGpu) {
        const tq = ms.torqueGpu;
        const det = 'Com a placa na horizontal, o slot PCIe e o suporte seguram ~' + fmt(tq.nm, 1) + ' N·m (peso × ' + fmt(tq.braco) + ' mm até o centro de massa da placa). Placas de 2 kg ou mais cedem com o tempo (sag).';
        if (tq.nm > 2.5) add('aviso', 'Placa de vídeo pesada na horizontal: ~' + fmt(tq.nm, 1) + ' N·m no slot', det + ' Use um suporte anti-sag embaixo da ponta da placa.', ['gpu']);
        else add('ok', 'Torque da placa de vídeo no slot: ~' + fmt(tq.nm, 1) + ' N·m', det, ['gpu']);
      }
    }

    // riser: comprimento mínimo
    if (res.riserInfo) {
      const c = res.riserInfo.comprimento;
      const tam = [150, 200, 250, 300, 400, 600].find((t) => t >= c) || Math.ceil(c / 50) * 50;
      add('info', 'Cabo riser: precisa de ~' + fmt(c) + ' mm (use um de ' + tam + ' mm)', 'Medido pelo caminho entre o slot PCIe da placa-mãe e o conector na placa de vídeo, com as curvas. Um riser PCIe 4.0 funciona; um PCIe 5.0 mantém a velocidade máxima das placas RTX 50.', ['riser']);
    }

    for (const a of res.avisos) add('aviso', a, '');

    const erros = itens.filter((i) => i.nivel === 'erro').length;
    const avisos = itens.filter((i) => i.nivel === 'aviso').length;
    return { itens, erros, avisos, colisoes, fora, termico, contatos, energia: { total, carga, cpuPico, resto } };
  }

  return { verificar };
};
