# Bancada 3D — visualizador da build

Site que monta o PC em 3D, em escala real (1 unidade = 1 mm), dentro do gabinete.
Mostra as peças, confere se tudo cabe (colisões, limites do gabinete, folgas),
estima o consumo e o fluxo de ar, e deixa trocar peças ou adicionar fans pelo
próprio site.

## Como abrir

1. Baixe a pasta `pc-build-3d` inteira.
2. Dê dois cliques em `index.html` (Chrome, Edge ou Firefox).

Precisa de internet só para baixar o motor 3D (Three.js, via `cdn.jsdelivr.net`).
Não precisa instalar nada.

## Build cadastrada

| Peça | Modelo no catálogo | Medidas usadas (mm) |
|---|---|---|
| Gabinete | Geometric Future Model 5 Vent | 505 × 242 × 440 (P × L × A) |
| Placa-mãe | MAXSUN MS-Terminator B850M PRO WIFI (branca) | 245 × 245 (mATX) |
| Memória | 2× Kingston FURY Beast DDR5 32 GB | 133,35 × 34,9 |
| Watercooler | GIGABYTE AORUS WATERFORCE II 360 ICE, no topo | radiador 394 × 119 × 27; bomba 72,8 × 72,8 × 65,1 |
| Fonte | Corsair RM1200e | 150 × 86 × 150 |
| Placa de vídeo | ZOTAC RTX 5090 AMP Extreme INFINITY, sem shroud, vertical com riser | oficial 332,1 × 137,5 × 69,6; sem shroud (estimado) 325 × 128 × 52 |
| Fans na GPU | 2× ARCTIC P14 Pro (abraçadeira) | 140 × 140 × 27 |
| Fans do gabinete | 5× Squama 140 mm (1 traseira, 3 fundo, 1 lateral) | 140 × 140 × 25 |

As fontes de cada medida estão no próprio site (aba **Medidas e fontes**) e no
arquivo `data/catalogo.js`.

### O que é oficial e o que é estimado

- **Oficial:** medidas externas das peças e do gabinete, e os limites do gabinete
  (GPU até 430 mm, cooler até 180 mm, fonte até 160 mm, radiador de até 420 mm no topo).
- **Estimado:** posições internas do gabinete (bandeja, caixa da fonte, suportes),
  o layout interno da placa-mãe e as medidas do dissipador da 5090 sem o shroud.
  Todas podem ser corrigidas em **Editar medidas** depois de medir com trena.

### Atenção com a fonte

O Model 5 Vent aceita fonte de **até 160 mm**. A RM1200e (150 mm) cabe. Se a sua
Corsair 1200 W for a **RM1200x SHIFT (180 mm)**, ela não cabe — escolha esse modelo
no site para ver o aviso.

## Aparência das peças

As texturas são desenhadas pelo próprio site (não dependem de imagens baixadas):

- **Gabinete Model 5 Vent:** aço preto com pintura eletrostática fosca, telas com furos
  redondos em grade, faixa sólida no meio do painel direito e rodapé frontal com
  “GEOMETRIC FUTURE”, vidro com borda serigrafada, pés de borracha.
- **MAXSUN B850M PRO WIFI (branca):** PCB preto com trilhas e serigrafia; armadura
  prata-branca jateada e escovada com linhas vermelho-escuras e “TERMINATOR” gravado
  (I/O, VRM, dois dissipadores M.2 e chipset); slot PCIe 5.0 reforçado, 4 slots DDR5,
  2 conectores EPS de 8 pinos, 24 pinos, SATA, headers e o painel traseiro com as
  portas (USB, HDMI, DP, LAN 2.5G, áudio e antenas Wi-Fi).
- **ZOTAC RTX 5090 AMP Extreme INFINITY sem shroud:** PCB preto, estrutura
  intermediária preta, aletas de alumínio prateadas, heatpipes niquelados aparecendo
  nas bordas, backplate de metal com “ZOTAC GAMING” e passagem de ar vazada na ponta,
  suporte com 3 DisplayPort e 1 HDMI.
- **ARCTIC P14 Pro:** 7 pás curtas unidas por um anel nas pontas, cubo grande com
  adesivo ARCTIC, moldura preta de 27 mm, amortecedores de borracha nos cantos e
  4 braços traseiros.
- **AORUS WATERFORCE II 360 ICE:** bomba branca com face espelhada (anéis de luz em
  efeito infinito) e emblema AORUS, friso cromado, conexões giratórias; radiador
  branco com tanques com AORUS em relevo; mangueiras com malha trançada; fans brancos ARGB.
- **Kingston FURY Beast DDR5:** de um lado “FURY” em alumínio exposto e “Beast”;
  do outro, a etiqueta de especificações.
- **Corsair RM1200e:** preta fosca, grade da ventoinha com o padrão triangular da
  Corsair e logo no centro, lateral “CORSAIR RM1200e”, etiqueta de especificações e
  painel modular com os rótulos. Ao clicar em “Mostrar no 3D” da fonte, a tampa
  perfurada do gabinete é ocultada para ela aparecer.

**Realismo:** iluminação de estúdio (softboxes que aparecem refletidas no vidro, no metal
e na face espelhada da bomba), sombras suaves, sombra de contato sob o gabinete, oclusão de
ambiente entre as peças, brilho do RGB (bloom) e **luz colorida dos LEDs iluminando as peças
em volta**. Cabos da fonte desenhados fio a fio (24 pinos, 2× EPS de 8 pinos e 12V-2x6),
originais pretos ou extensões trançadas brancas/pretas com pentes.

### Qualidade gráfica (menu com a estrela)

| Nível | O que liga |
|---|---|
| **Leve** | só o essencial — rápido em PC fraco e celular |
| **Alta** | oclusão de ambiente, brilho do RGB, sombras 4K e até 6 luzes de LED |
| **Ultra** | tudo da Alta, até 10 luzes de LED e **reflexo no chão** |

Se o 3D ficar lento, o site avisa e oferece mudar para Leve.

### Fotos reais (para ficar idêntico, com os logos)

Clique numa peça → **Foto real** (ou abra “Fotos reais” no cartão da peça), envie a foto
oficial do produto e enquadre (arrastar, zoom, girar 90°, espelhar). A foto vira a textura
daquela parte do 3D:

| Peça | Onde a foto entra |
|---|---|
| Placa de vídeo | face das aletas (lado dos fans), borda de cima (heatpipes) e backplate |
| Fans (P14 Pro, AORUS, Squama…) | adesivo redondo do cubo — vale para todos os fans daquele modelo |
| Watercooler | topo da bomba (brilha de leve e acompanha a cor do RGB) |
| Memória, fonte | lateral com o logo |
| Placa-mãe | topo inteiro (também no topo de cada dissipador) |

Onde achar as fotos: as páginas oficiais estão em **Medidas** (ZOTAC, ARCTIC, GIGABYTE,
Kingston, Corsair). Use fotos retas, de frente. As fotos ficam **só neste navegador**
(IndexedDB): não vão para o arquivo JSON nem para nenhum servidor.

## Usando o site

- **Clique numa peça no 3D:** abre a ficha com **troca rápida** (modelo, cooler da GPU,
  posição do radiador, cabos…), medidas e fontes; “Mais ajustes” abre a peça na lista.
- **Peças:** lista em sanfona com um ponto de status em cada peça (verde cabe, amarelo
  atenção, vermelho conflito) e, no topo, **encaixe, consumo e aquecimento do ar**.
- **Fans:** cada posição do gabinete mostra as vagas como blocos; clique num bloco para
  escolher o fan. No 3D, as **vagas livres aparecem com +**: clique para pôr um fan ali
  (fica vermelha se o fan vai encostar em alguma peça). “Preencher as vazias” e “Tirar todos”
  agilizam.
- **Checagem:** tudo que cabe, encosta ou está apertado, com “Mostrar no 3D”.
- **Salvas:** guarde várias versões da montagem com nome e miniatura (inclui a cor do RGB)
  e abra qualquer uma com um clique. Aqui também ficam o JSON e “Voltar para a padrão”.
- **Medidas:** tabela com a origem de cada medida (oficial ou estimada).
- **Desfazer / refazer** (setas no topo da lista, ou Ctrl+Z / Ctrl+Shift+Z): toda troca
  mostra um aviso com “Desfazer”; se a troca criar um conflito, o aviso diz qual.
- **Medir** (régua no topo do 3D): clique em dois pontos de qualquer peça para ver a
  distância em mm (com Δx, Δy, Δz). Segure Shift no segundo clique para medir reto num eixo.
- **Camadas:** painéis, vidro, cotas, vagas de fan, **simulação do ar**, setas de fluxo,
  fans girando, grade e “explodir” os painéis.
- **RGB:** fixo, arco-íris, respirar ou desligado, com a cor que quiser.
- Aperte **?** para ver todos os atalhos (1–5 vistas, P painéis, V vidro, A ar, M medir,
  H ocultar a peça selecionada, Delete remove o fan selecionado…).

A montagem, as camadas e a qualidade ficam salvas no navegador automaticamente.

## Física e checagens

- **Encaixe:** cada peça tem caixas de colisão em escala real (inclusive conexões do
  radiador, abraçadeiras e heatpipes da GPU); o site confere colisões, peças saindo do
  gabinete, limites do fabricante e folgas mínimas (ex.: os P14 presos na GPU precisam de
  ~20 mm até o vidro para puxar ar).
- **Mangueiras do watercooler:** distância reta entre a bomba e o radiador + folga para as
  curvas, comparada com o comprimento das mangueiras (AORUS WATERFORCE II 360 ICE: 380 mm).
- **Cabo riser:** comprimento necessário pelo caminho entre o slot e a placa de vídeo.
- **Fluxo de ar:** vazão de catálogo em CFM (P14 Pro 110 CFM, Squama 2503 140 mm 91,15 CFM,
  fans AORUS 64,95 CFM), com ~30% de perda nos fans do radiador; diz se a pressão é positiva,
  negativa ou equilibrada.
- **Aquecimento do ar:** ΔT = calor ÷ (densidade do ar × calor específico × vazão), com o
  calor liberado dentro do gabinete (GPU + placa, memórias e SSD; a CPU entra quando o
  radiador está em entrada) e os fans a ~60%. Na build padrão dá ~+7 °C em carga máxima.
- **Simulação do ar (Camadas → Simular o ar):** partículas entram pelos fans de entrada,
  desviam das peças, esquentam ao passar pela placa de vídeo e pelo radiador (azul → laranja),
  sobem quando quentes e saem pelos fans de saída. É ilustrativa, mas mostra por onde o ar
  passa e quanto dele atravessa a placa de vídeo.
- **Energia:** CPU (PPT) + TGP da GPU + o resto, comparado com a potência da fonte.

## Cadastrar uma peça nova

Tudo que aparece nos menus vem de `data/catalogo.js`. Para adicionar uma peça:

1. Abra `data/catalogo.js` num editor de texto (Bloco de Notas serve; VS Code é melhor).
2. Copie um item inteiro da mesma categoria (do `'nome-da-chave': {` até o `},` correspondente).
3. Troque a chave, o `nome` e as medidas.
4. Salve e recarregue a página.

Exemplo — um fan novo:

```js
'lian-li-uni-fan-sl-140': {
  nome: 'Lian Li UNI FAN SL 140',
  tamanho: 140, espessura: 25,
  cor: '#f2f2f2', corPas: '#fafafa',
  rgb: true, pas: 9,
  cfm: 58.5,        // vazão máxima (usada no fluxo de ar e no aquecimento)
  fontes: []
},
```

### Coordenadas do gabinete

As posições internas de um gabinete são medidas a partir das bordas externas, em mm:

- `x` = distância da lateral **direita** (lado de trás da bandeja da placa-mãe);
- `y` = altura a partir do **chão**;
- `z` = distância da **traseira**.

Cada posição de fan/radiador (`montagens`) tem um `centro`, uma `normal` (para onde a
parede aponta: `cima`, `frente`, `traseira`, `baixo`, `direita`, `esquerda`), um `eixo`
(direção em que as vagas se enfileiram) e `vagas` por tamanho de fan
(ex.: `{ 120: 3, 140: 2 }`). O modelo “genérico ATX” do catálogo serve de base para
cadastrar outro gabinete.

## Arquivos

```
pc-build-3d/
├── index.html            página
├── css/estilo.css        visual
├── data/catalogo.js      peças e medidas (edite aqui)
├── data/build-padrao.js  a montagem que abre por padrão
└── js/
    ├── texturas.js       texturas desenhadas (placa-mãe, GPU, memória, fans, fonte)
    ├── modelos3d.js      desenho 3D de cada peça
    ├── cabos.js          cabos da fonte, fio a fio
    ├── montagem.js       posiciona as peças no gabinete e calcula folgas e vagas
    ├── verificacao.js    colisões, limites, energia, fluxo e aquecimento do ar
    ├── ambiente.js       estúdio (reflexos), chão com reflexo, luzes do RGB, qualidade
    ├── ar.js             simulação do ar com partículas
    ├── historico.js      desfazer/refazer e montagens salvas
    └── app.js            cena 3D e interface
```
