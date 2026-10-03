/*
 * MONTAGEM PADRÃO — é o que o site carrega na primeira vez
 * (ou quando você clica em “Restaurar montagem padrão”).
 * Os nomes entre aspas são as chaves do catalogo.js.
 *
 * Tudo aqui também pode ser mudado pelo próprio site; as mudanças
 * ficam salvas no navegador e podem ser exportadas em JSON.
 */
window.PCB_BUILD_PADRAO = {
  versao: 2,
  gabinete: { modelo: 'gf-model5-vent', cor: '#1c1e21' },
  placaMae: { modelo: 'maxsun-b850m-pro-wifi-branca' },
  cpu: { modelo: 'am5-a-definir' },
  memoria: {
    modelo: 'kingston-fury-beast-ddr5-32',
    quantidade: 2,
    // cooler por cima dos pentes ('' = sem cooler). fixacao: 'clipes', 'suporte' ou 'suporte632' (+7 mm);
    // deslocamento: mm atravessando os slots (+ = para a frente, longe do processador); rgb: 'ligado' ou 'desligado'
    cooler: { modelo: 'thermalright-mc2-argb-preto', fixacao: 'clipes', deslocamento: 0, rgb: 'ligado' },
    // mm entre a lateral da bomba e o 1º pente, medido na máquina (corrige a posição dos slots;
    // 0 = usar o layout estimado da placa). 16 mm = estimativa pela foto da build.
    vaoBomba: 16
  },
  refrigeracao: {
    modelo: 'aorus-waterforce-ii-360-ice',
    local: 'topo',          // montagem do gabinete onde vai o radiador
    fansPosicao: 'dentro',  // 'dentro' = fans entre radiador e placa; 'painel' = fans colados no painel
    fluxo: 'saida',         // 'saida' (exaustão) ou 'entrada'
    tubos: -1,              // 1 = tubos para a frente/cima; -1 = para trás/baixo (conexões do radiador na ponta de trás)
    deslocamento: -10,      // mm ao longo da montagem (negativo = para trás)
    saidaBomba: 'cima'      // lado da bomba de onde saem as mangueiras: 'cima', 'frente' (para os pentes), 'tras' ou 'baixo'
  },
  fonte: { modelo: 'corsair-rm1200e', cabos: 'originais' },  // cabos: 'originais', 'brancos', 'pretos' (extensões trançadas) ou 'ocultos'
  gpu: {
    modelo: 'zotac-rtx5090-amp-extreme-infinity',
    modo: 'deshroud',            // 'deshroud' ou 'original'
    orientacao: 'vertical',      // 'vertical' (riser) ou 'horizontal' (no slot)
    distanciaBandeja: 56,        // mm da bandeja até a backplate (vertical; suporte nos 4 últimos slots da placa girada)
    alturaDoChao: 76,            // mm do chão até a borda de baixo da placa (vertical)
    fans: { modelo: 'arctic-p14-pro', quantidade: 2, espacamento: 4, deslocamento: 0 },
    riser: true
  },
  fans: {
    traseira: { tamanho: 140, fluxo: 'saida', vagas: ['gf-squama-2503-140'] },
    fundo: { tamanho: 140, fluxo: 'entrada', vagas: ['gf-squama-2503-140', 'gf-squama-2503-140', 'gf-squama-2503-140'] },
    lateral: { tamanho: 140, fluxo: 'entrada', vagas: ['gf-squama-2503-140'] }
  },
  medidas: {}  // medidas personalizadas (preenchido pelo botão “Editar medidas”)
};
