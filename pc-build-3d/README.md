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

## Usando o site

- **Peças:** troque cada componente, ajuste a posição da GPU vertical, a posição
  do radiador, os fans presos na GPU e as medidas.
- **Fans:** escolha tamanho, sentido (entrada/saída) e modelo de cada vaga do gabinete.
- **Checagem:** lista o que cabe, o que encosta e as folgas medidas (ex.: GPU ↔ vidro).
- **Medidas e fontes:** tabela com a origem de cada medida e salvar/carregar a montagem em JSON.
- No 3D: arraste para girar, role para aproximar, clique numa peça para ver as medidas.
  Os botões de cima mostram/escondem painéis, vidro, setas de fluxo de ar e cotas,
  e “Explodir” afasta os painéis.

A montagem fica salva no navegador automaticamente.

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
    ├── modelos3d.js      desenho 3D de cada peça
    ├── montagem.js       posiciona as peças no gabinete
    ├── verificacao.js    colisões, limites, energia e fluxo de ar
    └── app.js            cena 3D e interface
```
