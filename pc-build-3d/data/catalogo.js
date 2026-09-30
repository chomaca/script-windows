/*
 * CATÁLOGO DE PEÇAS — Bancada 3D
 * ==============================
 * Todas as medidas estão em MILÍMETROS (mm).
 *
 * Como adicionar uma peça nova:
 *   1. Copie um item da mesma categoria (o bloco inteiro entre chaves).
 *   2. Troque a chave (ex.: 'meu-fan-novo') e o campo `nome`.
 *   3. Ajuste as medidas. A peça aparece sozinha nos menus do site.
 *
 * `fontes`   → links de onde cada medida foi tirada.
 * `estimado` → lista de campos que o fabricante NÃO publica; foram
 *              estimados por fotos/padrões e podem ser corrigidos com trena.
 *
 * Sistema de coordenadas do GABINETE (para posições internas):
 *   x = distância da face externa DIREITA (lado da bandeja da placa-mãe),
 *       crescendo em direção ao vidro lateral esquerdo;
 *   y = altura a partir do chão (base dos pés);
 *   z = distância da face externa TRASEIRA, crescendo em direção à frente.
 * Direções aceitas: 'frente', 'traseira', 'cima', 'baixo', 'direita', 'esquerda'.
 */
window.PCB_CATALOGO = {

  /* ------------------------------------------------------------------ */
  /*  GABINETES                                                          */
  /* ------------------------------------------------------------------ */
  gabinetes: {
    'gf-model5-vent': {
      nome: 'Geometric Future Model 5 Vent',
      cor: '#1c1e21',
      medidas: { largura: 242, altura: 440, profundidade: 505 },
      pes: 20,
      paineis: {
        esquerdo: { tipo: 'vidro', espessura: 4 },
        direito: { tipo: 'tela', espessura: 3, faixa: [0.43, 0.56], logo: 'GEOMETRIC FUTURE' },
        // frente: tela sobre a coluna de fans + faixa sólida de 88 mm à direita com o painel de I/O no meio da altura
        frente: { tipo: 'tela', espessura: 14, faixaLateral: 88, io: 0.5, suporteFans: true },
        topo: { tipo: 'tela', espessura: 12 },
        traseira: { tipo: 'metal', espessura: 2 },
        fundo: { tipo: 'tela', espessura: 5 }
      },
      semColuna: false, // true = canto frontal-esquerdo sem coluna (vidro com vidro)
      chapa: 1.2,       // aço de 0,8 a 1,2 mm (oficial)
      massa: 8500,      // g, sem peças (estimado: o Model 5 de vidro pesa 8,75 kg)
      limites: {
        placaMae: ['E-ATX', 'ATX', 'mATX', 'Mini-ITX'],
        gpuComprimento: 430,
        coolerAltura: 180,
        fonteComprimento: 160
      },
      // bandeja a 34 mm da lateral direita (medido pela foto traseira: I/O a 40–83 mm da lateral);
      // ela vai da traseira até os 2 recortes de cabo na frente da placa (z ≈ 318)
      bandeja: { x: 34, ateZ: 318 },
      placaMae: { traseira: 14, topoY: 351, standoff: 6.35 },
      // fonte no canto frontal superior, baia de 200 mm de profundidade (TweakTown), ventoinha virada para a lateral direita
      fonte: {
        caixa: { x: [8, 100], y: [214, 372], z: [291, 491] },
        ancora: { x: 54, y: 293, z: 488 },
        comprimentoPara: 'traseira',
        larguraPara: 'cima',
        ventoinhaPara: 'direita',
        entradaAC: { x: 53, y: 393, lado: 28 }
      },
      // traseira em grade de furos quadrados; placa de 7 slots removível que gira para a GPU vertical
      traseira: {
        slots: 7,
        slot1Y: 187,
        rearIO: true,
        grade: { passo: 14, furo: 11 },
        placaSlots: { x: [30, 170], y: [48, 196] },
        ioTopoAcima: 3
      },
      // suporte vertical (incluso): o suporte da placa (3,5 slots) precisa caber na placa de slots girada
      gpuVertical: { suporteZ: 4, alturaMin: 55, alturaMax: 84, alturaPadrao: 76, distanciaMin: 23, distanciaMax: 66, distanciaPadrao: 56, slotBaseX: 29 },
      montagens: {
        topo: { nome: 'Topo', centro: { x: 140, y: 428, z: 240 }, normal: 'cima', eixo: 'frente', vagas: { 120: 3, 140: 3 }, radiador: 420 },
        frente: { nome: 'Frente', centro: { x: 163, y: 225, z: 490 }, normal: 'frente', eixo: 'cima', vagas: { 120: 3, 140: 2 }, radiador: 360 },
        traseira: { nome: 'Traseira', centro: { x: 162, y: 290, z: 2 }, normal: 'traseira', eixo: 'cima', vagas: { 120: 1, 140: 1 }, radiador: 140 },
        fundo: { nome: 'Fundo', centro: { x: 140, y: 25, z: 237 }, normal: 'baixo', eixo: 'frente', vagas: { 120: 3, 140: 3 }, radiador: 360 },
        lateral: { nome: 'Lateral direita (frente, sob a fonte)', centro: { x: 28, y: 125, z: 400 }, normal: 'direita', eixo: 'frente', vagas: { 120: 1, 140: 1, 160: 1 }, radiador: 0, montagem: 'fora' },
        atrasBandeja: { nome: 'Atrás da bandeja', centro: { x: 34, y: 228, z: 150 }, normal: 'direita', eixo: 'frente', vagas: { 120: 2 }, radiador: 0, montagem: 'fora' }
      },
      estimado: ['pes', 'paineis', 'bandeja', 'placaMae', 'fonte', 'traseira', 'gpuVertical', 'montagens', 'massa'],
      notas: 'Medidas externas, limites, aço de 0,8–1,2 mm e vidro de 4 mm oficiais. Vagas oficiais: 3 no topo, 3 na frente, 1 na lateral direita frontal (até 160 mm), 1 traseira, 3 no fundo e 2 atrás da bandeja. Frente com tela sobre os fans e faixa sólida à direita com o I/O; lateral direita em tela com faixa sólida e o nome. Posições internas estimadas pelas fotos.',
      fontes: [
        { rotulo: 'Página oficial Model 5 Vent', url: 'https://www.geometricfuture.com/product-1/34.html' },
        { rotulo: 'PCPartPicker (505 × 242 × 440 mm)', url: 'https://pcpartpicker.com/product/QWMMnQ/geometric-future-model-5-vent-atx-mid-tower-case-geo-m5vf-b' },
        { rotulo: 'FAQ Model 5 (frente 360 mm no Vent)', url: 'https://www.geometricfuture.com/faq/17.html' },
        { rotulo: 'Guru3D (cooler 180 mm, fonte 160 mm)', url: 'https://www.guru3d.com/story/geometric-future-model-5-pc-case-features-and-specifications/' },
        { rotulo: 'TechPowerUp (fonte no canto frontal)', url: 'https://www.techpowerup.com/review/geometic-future-model-5/' },
        { rotulo: 'KitGuru (posição dos 5 fans)', url: 'https://www.kitguru.net/components/cases/james-dawson/geometric-future-model-5-vent-case-review/' },
        { rotulo: 'TweakTown (GPU vertical)', url: 'https://www.tweaktown.com/reviews/11066/geometric-future-model-5-vent-mid-tower-chassis/index.html' },
        { rotulo: 'Guru3D (vagas de fan, aço 0,8–1,2 mm, vidro 4 mm)', url: 'https://www.guru3d.com/story/geometric-future-model-5-pc-case-features-and-specifications/' }
      ]
    },

    'gf-model5': {
      nome: 'Geometric Future Model 5 (frente de vidro)',
      cor: '#1c1e21',
      medidas: { largura: 242, altura: 440, profundidade: 480 },
      pes: 20,
      paineis: {
        esquerdo: { tipo: 'vidro', espessura: 4 },
        direito: { tipo: 'tela', espessura: 3, faixa: [0.43, 0.56], logo: 'GEOMETRIC FUTURE' },
        frente: { tipo: 'vidro', espessura: 4 },
        topo: { tipo: 'tela', espessura: 12 },
        traseira: { tipo: 'metal', espessura: 2 },
        fundo: { tipo: 'tela', espessura: 5 }
      },
      semColuna: true,
      limites: {
        placaMae: ['E-ATX', 'ATX', 'mATX', 'Mini-ITX'],
        gpuComprimento: 460,
        coolerAltura: 180,
        fonteComprimento: 160
      },
      // mesmo chassi do Model 5 Vent, com a frente de vidro (25 mm mais raso)
      bandeja: { x: 34, ateZ: 306 },
      placaMae: { traseira: 14, topoY: 351, standoff: 6.35 },
      fonte: {
        caixa: { x: [8, 100], y: [214, 372], z: [270, 470] },
        ancora: { x: 54, y: 293, z: 467 },
        comprimentoPara: 'traseira',
        larguraPara: 'cima',
        ventoinhaPara: 'direita',
        entradaAC: { x: 53, y: 393, lado: 28 }
      },
      traseira: { slots: 7, slot1Y: 187, rearIO: true, grade: { passo: 14, furo: 11 }, placaSlots: { x: [30, 170], y: [48, 196] }, ioTopoAcima: 3 },
      gpuVertical: { suporteZ: 4, alturaMin: 55, alturaMax: 84, alturaPadrao: 76, distanciaMin: 23, distanciaMax: 66, distanciaPadrao: 56, slotBaseX: 29 },
      montagens: {
        topo: { nome: 'Topo', centro: { x: 140, y: 428, z: 240 }, normal: 'cima', eixo: 'frente', vagas: { 120: 3, 140: 3 }, radiador: 420 },
        traseira: { nome: 'Traseira', centro: { x: 162, y: 290, z: 2 }, normal: 'traseira', eixo: 'cima', vagas: { 120: 1, 140: 1 }, radiador: 140 },
        fundo: { nome: 'Fundo', centro: { x: 140, y: 25, z: 237 }, normal: 'baixo', eixo: 'frente', vagas: { 120: 3, 140: 3 }, radiador: 360 },
        lateral: { nome: 'Lateral direita (frente, sob a fonte)', centro: { x: 28, y: 125, z: 385 }, normal: 'direita', eixo: 'frente', vagas: { 120: 1, 140: 1, 160: 1 }, radiador: 0, montagem: 'fora' },
        atrasBandeja: { nome: 'Atrás da bandeja', centro: { x: 34, y: 228, z: 150 }, normal: 'direita', eixo: 'frente', vagas: { 120: 2 }, radiador: 0, montagem: 'fora' }
      },
      estimado: ['pes', 'paineis', 'bandeja', 'placaMae', 'fonte', 'traseira', 'gpuVertical', 'montagens'],
      notas: 'Versão com frente de vidro (sem suporte a fans frontais). Posições internas estimadas.',
      fontes: [
        { rotulo: 'Página oficial Model 5', url: 'https://www.geometricfuture.com/product-1/33.html' },
        { rotulo: 'PCPartPicker (480 × 242 × 440 mm)', url: 'https://pcpartpicker.com/product/J4XV3C/geometric-future-model-5-atx-mid-tower-case-geo-m5f-bg' }
      ]
    },

    'generico-atx': {
      nome: 'Modelo genérico ATX (fonte embaixo)',
      cor: '#202326',
      medidas: { largura: 230, altura: 480, profundidade: 470 },
      pes: 15,
      paineis: {
        esquerdo: { tipo: 'vidro', espessura: 4 },
        direito: { tipo: 'metal', espessura: 2 },
        frente: { tipo: 'tela', espessura: 18 },
        topo: { tipo: 'tela', espessura: 12 },
        traseira: { tipo: 'metal', espessura: 2 },
        fundo: { tipo: 'metal', espessura: 3 }
      },
      semColuna: false,
      limites: {
        placaMae: ['ATX', 'mATX', 'Mini-ITX'],
        gpuComprimento: 400,
        coolerAltura: 170,
        fonteComprimento: 200
      },
      bandeja: { x: 30 },
      placaMae: { traseira: 12, topoY: 412, standoff: 6.35 },
      fonte: {
        caixa: { x: [4, 226], y: [18, 106], z: [4, 300] },
        ancora: { x: 115, y: 63, z: 4 },
        comprimentoPara: 'frente',
        larguraPara: 'esquerda',
        ventoinhaPara: 'baixo',
        entradaAC: null
      },
      traseira: { slots: 7, slot1Y: 261, rearIO: true },
      gpuVertical: { suporteZ: 4, alturaMin: 132, alturaPadrao: 135, distanciaMin: 25, distanciaMax: 140, distanciaPadrao: 60 },
      montagens: {
        topo: { nome: 'Topo', centro: { x: 125, y: 468, z: 203 }, normal: 'cima', eixo: 'frente', vagas: { 120: 3, 140: 2 }, radiador: 360 },
        frente: { nome: 'Frente', centro: { x: 115, y: 285, z: 452 }, normal: 'frente', eixo: 'cima', vagas: { 120: 3, 140: 2 }, radiador: 360 },
        traseira: { nome: 'Traseira', centro: { x: 145, y: 345, z: 2 }, normal: 'traseira', eixo: 'cima', vagas: { 120: 1 }, radiador: 120 }
      },
      estimado: ['medidas', 'pes', 'paineis', 'bandeja', 'placaMae', 'fonte', 'traseira', 'gpuVertical', 'montagens'],
      notas: 'Modelo de referência para comparar com um gabinete tradicional. Copie este bloco no catálogo para cadastrar outro gabinete.',
      fontes: []
    }
  },

  /* ------------------------------------------------------------------ */
  /*  PLACAS-MÃE                                                         */
  /*  Posições (x, y) medidas na placa: x a partir da borda traseira    */
  /*  (lado dos conectores), y a partir da borda de cima.               */
  /* ------------------------------------------------------------------ */
  placasMae: {
    'maxsun-b850m-pro-wifi-branca': {
      nome: 'MAXSUN MS-Terminator B850M PRO WIFI (branca)',
      formato: 'mATX',
      largura: 245,
      altura: 245,
      espessura: 1.6,
      estilo: 'maxsun-terminator',
      massa: 950,
      corPCB: '#16181b',
      corArmadura: '#e6e7e9',
      corAcento: '#7a1d26',
      corDetalhe: '#b9bdc3',
      soquete: { x: 110, y: 80 },
      dimm: { x: [152, 160, 168, 176], y: 78 },
      // x16 alinhado à 1ª posição de slot do gabinete (passo 20,32 mm); o 2º, três slots abaixo
      pcie: [
        { x: 46, y: 164, nome: 'PCIe 5.0 x16', reforcado: true },
        { x: 46, y: 225, nome: 'PCIe 4.0 x4 (físico x16)', reforcado: false }
      ],
      estimado: ['soquete', 'dimm', 'pcie', 'massa'],
      notas: 'Formato Micro-ATX 245 × 245 mm (oficial). PCB preto com armadura prata-branca jateada e escovada e linhas vermelho-escuras; 4 slots DDR5, 3 M.2, 2 PCIe x16, 2 SATA e 2 EPS 8 pinos. Posições internas seguem o padrão mATX. Para ficar idêntica ao produto, use a opção de foto do topo.',
      fontes: [
        { rotulo: 'MAXSUN — Terminator B850M PRO WIFI', url: 'https://www.maxsun.com/products/terminator-b850m-pro-wifi' },
        { rotulo: 'ZOL — fotos da placa (chinês)', url: 'https://diy.zol.com.cn/1011/10111686.html' },
        { rotulo: 'Sina — PCB preto e armadura (chinês)', url: 'https://finance.sina.com.cn/tech/roll/2025-07-09/doc-infewcvp4850620.shtml' }
      ]
    },
    'generica-atx': {
      nome: 'Placa ATX genérica',
      formato: 'ATX',
      largura: 244,
      altura: 305,
      espessura: 1.6,
      corPCB: '#1d2024',
      corArmadura: '#3a3f46',
      corAcento: '#5b6068',
      corDetalhe: '#9aa1ab',
      soquete: { x: 110, y: 80 },
      dimm: { x: [152, 160, 168, 176], y: 78 },
      pcie: [
        { x: 46, y: 151, nome: 'PCIe x16', reforcado: true },
        { x: 46, y: 212, nome: 'PCIe x16 (x4)', reforcado: false },
        { x: 46, y: 273, nome: 'PCIe x16 (x4)', reforcado: false }
      ],
      estimado: ['soquete', 'dimm', 'pcie'],
      notas: 'Padrão ATX 305 × 244 mm.',
      fontes: []
    },
    'generica-itx': {
      nome: 'Placa Mini-ITX genérica',
      formato: 'Mini-ITX',
      largura: 170,
      altura: 170,
      espessura: 1.6,
      corPCB: '#1d2024',
      corArmadura: '#3a3f46',
      corAcento: '#5b6068',
      corDetalhe: '#9aa1ab',
      soquete: { x: 95, y: 72 },
      dimm: { x: [140, 148], y: 76 },
      pcie: [{ x: 46, y: 151, nome: 'PCIe x16', reforcado: true }],
      estimado: ['soquete', 'dimm', 'pcie'],
      notas: 'Padrão Mini-ITX 170 × 170 mm.',
      fontes: []
    }
  },

  /* ------------------------------------------------------------------ */
  /*  PROCESSADORES (só para estimar consumo)                            */
  /* ------------------------------------------------------------------ */
  cpus: {
    'am5-a-definir': { nome: 'Processador AM5 (a definir)', tdp: 120 },
    'ryzen7-9800x3d': { nome: 'AMD Ryzen 7 9800X3D', tdp: 120 },
    'ryzen9-9950x3d': { nome: 'AMD Ryzen 9 9950X3D', tdp: 170 },
    'ryzen9-9900x': { nome: 'AMD Ryzen 9 9900X', tdp: 120 },
    'ryzen7-9700x': { nome: 'AMD Ryzen 7 9700X', tdp: 65 },
    'ryzen7-7800x3d': { nome: 'AMD Ryzen 7 7800X3D', tdp: 120 }
  },

  /* ------------------------------------------------------------------ */
  /*  MEMÓRIA RAM (medidas de UM pente)                                  */
  /* ------------------------------------------------------------------ */
  memorias: {
    'kingston-fury-beast-ddr5-32': {
      nome: 'Kingston FURY Beast DDR5 32 GB',
      estilo: 'fury-beast',
      capacidade: 32,
      altura: 34.9,
      comprimento: 133.35,
      espessura: 7,
      massa: 36,
      cor: '#18191b',
      rgb: false,
      estimado: ['espessura', 'massa'],
      fontes: [{ rotulo: 'Kingston FURY Beast DDR5 (34,9 mm)', url: 'https://www.kingston.com/en/memory/gaming/kingston-fury-beast-ddr5-memory' }]
    },
    'kingston-fury-beast-ddr5-rgb-32': {
      nome: 'Kingston FURY Beast DDR5 RGB 32 GB',
      estilo: 'fury-beast',
      capacidade: 32,
      altura: 42.23,
      comprimento: 133.35,
      espessura: 7,
      cor: '#18191b',
      rgb: true,
      estimado: ['espessura'],
      fontes: [{ rotulo: 'Kingston FURY Beast DDR5 RGB (42,23 mm)', url: 'https://www.kingston.com/en/memory/gaming/kingston-fury-beast-ddr5-rgb-memory' }]
    },
    'kingston-fury-beast-ddr5-rgb-32-branca': {
      nome: 'Kingston FURY Beast DDR5 RGB 32 GB (branca)',
      estilo: 'fury-beast',
      capacidade: 32,
      altura: 42.23,
      comprimento: 133.35,
      espessura: 7,
      cor: '#eef0f2',
      rgb: true,
      estimado: ['espessura'],
      fontes: [{ rotulo: 'Kingston FURY Beast DDR5 RGB (42,23 mm)', url: 'https://www.kingston.com/en/memory/gaming/kingston-fury-beast-ddr5-rgb-memory' }]
    }
  },

  /* ------------------------------------------------------------------ */
  /*  WATERCOOLERS (AIO)                                                 */
  /* ------------------------------------------------------------------ */
  coolers: {
    'aorus-waterforce-ii-360-ice': {
      nome: 'GIGABYTE AORUS WATERFORCE II 360 ICE',
      estilo: 'aorus-waterforce',
      cor: '#f1f2f4',
      radiador: { comprimento: 394, largura: 119, espessura: 27 },
      bomba: { largura: 72.8, profundidade: 72.8, altura: 65.1, tela: false },
      fans: { modelo: 'aorus-120-ice', quantidade: 3 },
      mangueira: 380,
      massa: { radiador: 640, bomba: 430 },   // g sem os fans (estimado; caixa completa: 2,52 kg)
      estimado: ['massa'],
      notas: 'Radiador de alumínio, 3 fans ARGB de 120 mm (inclusos). Mangueiras de borracha com malha de nylon, 380 mm.',
      fontes: [{ rotulo: 'GIGABYTE — especificações', url: 'https://www.gigabyte.com/CPU-Cooler/AORUS-WATERFORCE-II-360-ICE/sp' }]
    },
    'aorus-waterforce-x-ii-360-ice': {
      nome: 'GIGABYTE AORUS WATERFORCE X II 360 ICE (tela LCD)',
      estilo: 'aorus-waterforce',
      cor: '#f1f2f4',
      radiador: { comprimento: 394, largura: 119, espessura: 27 },
      bomba: { largura: 87.6, profundidade: 87.6, altura: 77.7, tela: true },
      fans: { modelo: 'aorus-120-ice', quantidade: 3 },
      mangueira: 380,
      estimado: ['mangueira'],
      notas: 'Mesma medida de radiador; bomba maior com tela LCD. Comprimento das mangueiras assumido igual ao do II 360 ICE (380 mm).',
      fontes: [{ rotulo: 'GIGABYTE — especificações', url: 'https://www.gigabyte.com/CPU-Cooler/AORUS-WATERFORCE-X-II-360-ICE/sp' }]
    },
    'aio-240-generico': {
      nome: 'Watercooler 240 mm genérico',
      cor: '#1b1c1f',
      radiador: { comprimento: 277, largura: 120, espessura: 27 },
      bomba: { largura: 70, profundidade: 70, altura: 55, tela: false },
      fans: { modelo: 'generico-120', quantidade: 2 },
      mangueira: 400,
      estimado: ['radiador', 'bomba', 'mangueira'],
      fontes: []
    },
    'aio-420-generico': {
      nome: 'Watercooler 420 mm genérico',
      cor: '#1b1c1f',
      radiador: { comprimento: 458, largura: 140, espessura: 30 },
      bomba: { largura: 72, profundidade: 72, altura: 60, tela: false },
      fans: { modelo: 'generico-140', quantidade: 3 },
      mangueira: 400,
      estimado: ['radiador', 'bomba', 'mangueira'],
      fontes: []
    }
  },

  /* ------------------------------------------------------------------ */
  /*  FONTES                                                             */
  /*  largura × altura × comprimento no padrão ATX (150 × 86 × ...)     */
  /* ------------------------------------------------------------------ */
  fontes: {
    'corsair-rm1200e': {
      nome: 'Corsair RM1200e (2023)',
      estilo: 'corsair-rme',
      potencia: 1200,
      massa: 1810,
      largura: 150,
      altura: 86,
      comprimento: 150,
      cor: '#141517',
      conectoresNaLateral: false,
      notas: 'Fonte ATX 3.1 compacta, 150 mm de comprimento. Toda preta fosca, grade da ventoinha com o padrão triangular da Corsair e logo no centro, laterais com CORSAIR e RM1200e.',
      fontes: [
        { rotulo: 'Corsair — RM1200e', url: 'https://www.corsair.com/us/en/p/psu/cp-9020258-na/rme-series-rm1200e-fully-modular-low-noise-atx-power-supply-cp-9020258-na' },
        { rotulo: 'Hardware Busters — review', url: 'https://hwbusters.com/psus/corsair-rm1200e-atx-v3-1-psu-review/' }
      ]
    },
    'corsair-rm1200x-shift': {
      nome: 'Corsair RM1200x SHIFT',
      estilo: 'corsair-rme',
      potencia: 1200,
      largura: 150,
      altura: 86,
      comprimento: 180,
      cor: '#141517',
      conectoresNaLateral: true,
      notas: 'Conectores modulares na lateral. 180 mm de comprimento.',
      fontes: [
        { rotulo: 'Corsair — RM1200x SHIFT', url: 'https://www.corsair.com/us/en/p/psu/cp-9020254-na/rm1200x-shift-80-plus-gold-fully-modular-atx-power-supply-cp-9020254-na' },
        { rotulo: 'Corsair — a SHIFT cabe no meu gabinete?', url: 'https://www.corsair.com/us/en/explorer/diy-builder/power-supply-units/will-a-corsair-rmx-shift-psu-fit-in-my-case/' }
      ]
    },
    'atx-160-generica': {
      nome: 'Fonte ATX 160 mm genérica',
      potencia: 1000,
      largura: 150,
      altura: 86,
      comprimento: 160,
      cor: '#141517',
      conectoresNaLateral: false,
      fontes: []
    }
  },

  /* ------------------------------------------------------------------ */
  /*  PLACAS DE VÍDEO                                                    */
  /*  comprimento × altura × espessura = medidas oficiais com o shroud  */
  /*  `deshroud` = dissipador sem o shroud (sem os fans originais)      */
  /* ------------------------------------------------------------------ */
  gpus: {
    'zotac-rtx5090-amp-extreme-infinity': {
      nome: 'ZOTAC GAMING RTX 5090 AMP Extreme INFINITY',
      comprimento: 332.1,
      altura: 137.5,
      espessura: 69.6,
      slots: 3.5,
      tgp: 575,
      massa: 2880,          // g com shroud e fans (oficial)
      massaShroud: 390,     // g do shroud + 3 fans de 100 mm + espelho (estimado)
      heatpipes: 9,         // heatpipes compostos de cobre (Overclocking.com)
      pcb: { comprimento: 228 },
      estilo: 'zotac-amp-extreme',
      cor: '#2a2d31',
      corPCB: '#0f1113',
      corBackplate: '#34373c',
      // sem shroud: 332,1 − ~7 mm de shroud na ponta; 137,5 − ~5,5 mm de borda do shroud;
      // 69,6 − ~15 mm dos fans de 100 mm − ~2,6 mm da tampa com espelho
      deshroud: { comprimento: 325, altura: 132, espessura: 52 },
      estimado: ['deshroud', 'massaShroud', 'pcb'],
      notas: 'Medidas com shroud (332,1 × 137,5 × 69,6 mm, 2,88 kg) são oficiais. Por dentro: câmara de vapor 34% maior, dissipador de alumínio com 9 heatpipes compostos de cobre, aletas mais longas que o PCB (o terceiro fan sopra direto através delas), estrutura intermediária reforçada e backplate de metal fundido com 7 pads térmicos. O mesmo PCB da versão SOLID (329,7 × 137,8 × 67,8 mm). As medidas sem shroud são estimadas a partir das oficiais: meça a sua e ajuste em “Editar medidas”.',
      fontes: [
        { rotulo: 'ZOTAC — página do produto', url: 'https://www.zotac.com/us/product/graphics_card/zotac-gaming-geforce-rtx-5090-amp-extreme-infinity' },
        { rotulo: 'ZOTAC — ficha técnica (PDF, 2,88 kg)', url: 'https://www.zotac.com/download/mediadrivers/External/GraphicsCard/5090/Brochure/ZT-B50900B-10P-brochure.pdf' },
        { rotulo: 'Overclocking.com — desmontagem (9 heatpipes)', url: 'https://overclocking.com/test-zotac-rtx-5090-amp-extreme-infinity/3/' },
        { rotulo: 'ZOTAC — RTX 5090 SOLID (mesmo PCB)', url: 'https://www.zotac.com/download/mediadrivers/External/GraphicsCard/5090/Brochure/ZT-B50900D-10P-brochure.pdf' }
      ]
    },
    'gpu-2slot-generica': {
      nome: 'Placa de vídeo 2 slots genérica',
      comprimento: 285,
      altura: 115,
      espessura: 42,
      slots: 2,
      tgp: 250,
      cor: '#2a2d31',
      corBackplate: '#2f3237',
      deshroud: { comprimento: 280, altura: 110, espessura: 32 },
      estimado: ['comprimento', 'altura', 'espessura', 'deshroud'],
      fontes: []
    }
  },

  /* ------------------------------------------------------------------ */
  /*  FANS                                                               */
  /* ------------------------------------------------------------------ */
  fans: {
    'gf-squama-2503-140': {
      nome: 'Geometric Future Squama 2503 140 mm (do gabinete)',
      estilo: 'squama',
      tamanho: 140,
      espessura: 25,
      cor: '#16171a',
      corPas: '#1d1f23',
      rgb: true,
      pas: 9,
      cfm: 91.15, rpm: 2400, massa: 170,
      fontes: [
        { rotulo: 'KitGuru — 5 fans Squama 140 mm inclusos', url: 'https://www.kitguru.net/components/cases/james-dawson/geometric-future-model-5-vent-case-review/' },
        { rotulo: 'PCPartPicker — Squama 2503 140 mm (91,15 CFM)', url: 'https://pcpartpicker.com/product/bPbRsY/geometric-future-squama-2503-9115-cfm-140-mm-fan-geo-s2503b-14s' }
      ]
    },
    'arctic-p14-pro': {
      nome: 'ARCTIC P14 Pro',
      estilo: 'arctic-p14-pro',
      tamanho: 140,
      espessura: 27,
      cor: '#141517',
      corPas: '#1a1b1e',
      rgb: false,
      pas: 7,
      cfm: 110, rpm: 2500, pressao: 5.2, massa: 240,
      fontes: [
        { rotulo: 'ARCTIC — ficha técnica P14 Pro (240 g)', url: 'https://www.arctic.de/media/ac/2f/6a/1753621498/Spec_Sheet_P14_Pro_EN.pdf' },
        { rotulo: 'ARCTIC — P14 Pro (140 × 140 × 27 mm, 110 CFM, 5,2 mmH₂O)', url: 'https://www.arctic.de/us/P14-Pro/ACFAN00313A' },
        { rotulo: 'HWCooling — P14 Pro (7 pás)', url: 'https://www.hwcooling.net/en/arctic-p14-pro-pst-the-best-price-to-performance-ratio-review/' }
      ]
    },
    'aorus-120-ice': {
      nome: 'Fan AORUS 120 mm ARGB (branco, do watercooler)',
      estilo: 'aorus',
      tamanho: 120,
      espessura: 25,
      cor: '#eef0f2',
      corPas: '#f6f7f8',
      rgb: true,
      pas: 9,
      cfm: 64.95, massa: 140,
      fontes: [
        { rotulo: 'GIGABYTE — especificações', url: 'https://www.gigabyte.com/CPU-Cooler/AORUS-WATERFORCE-II-360-ICE/sp' },
        { rotulo: 'PCPartPicker — 64,95 CFM', url: 'https://pcpartpicker.com/product/m7grxr/gigabyte-aorus-waterforce-ii-360-ice-6495-cfm-liquid-cpu-cooler-aorus-waterforce-ii-360-ice' }
      ]
    },
    'generico-120': { nome: 'Fan 120 mm genérico (preto)', tamanho: 120, espessura: 25, cor: '#151618', corPas: '#1b1c1f', rgb: false, pas: 7, cfm: 55, fontes: [] },
    'generico-120-branco': { nome: 'Fan 120 mm genérico (branco)', tamanho: 120, espessura: 25, cor: '#eef0f2', corPas: '#f5f6f7', rgb: true, pas: 9, cfm: 55, fontes: [] },
    'generico-140': { nome: 'Fan 140 mm genérico (preto)', tamanho: 140, espessura: 25, cor: '#151618', corPas: '#1b1c1f', rgb: false, pas: 7, cfm: 70, fontes: [] },
    'generico-140-branco': { nome: 'Fan 140 mm genérico (branco)', tamanho: 140, espessura: 25, cor: '#eef0f2', corPas: '#f5f6f7', rgb: true, pas: 9, cfm: 70, fontes: [] },
    'generico-160': { nome: 'Fan 160 mm genérico', tamanho: 160, espessura: 25, cor: '#151618', corPas: '#1b1c1f', rgb: false, pas: 7, cfm: 90, fontes: [] }
  }
};
