/*
 * Texturas procedurais (desenhadas em canvas, sem imagens externas).
 * Escala: cada função recebe medidas em mm e desenha na proporção certa.
 *
 * Referências visuais (descrições públicas dos produtos):
 *  - MAXSUN Terminator B850M PRO WIFI: PCB preto, armadura prata-branca
 *    jateada + escovada com linhas vermelho-escuras ("mecha").
 *  - Kingston FURY Beast DDR5: alumínio preto anodizado, "FURY" em
 *    alumínio exposto, textos brancos, relevos e furos de ventilação.
 *  - ARCTIC P14 Pro: tudo preto, adesivo ARCTIC no cubo.
 *  - ZOTAC RTX 5090 AMP Extreme INFINITY: backplate de metal fundido.
 */
window.PCBTexturas = function (THREE) {
  'use strict';

  const cache = new Map();
  const F_PESADA = '"Arial Black", "Arial Bold", "Helvetica Neue", Arial, sans-serif';
  const F_TEXTO = 'Arial, "Helvetica Neue", Helvetica, sans-serif';

  function memo(key, fn) {
    let v = cache.get(key);
    if (!v) { v = fn(); cache.set(key, v); }
    return v;
  }
  function criar(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(w));
    c.height = Math.max(2, Math.round(h));
    return c;
  }
  function tex(c, { cor = true, repetir = false } = {}) {
    const t = new THREE.CanvasTexture(c);
    if (cor) t.colorSpace = THREE.SRGBColorSpace;
    if (repetir) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.userData.cacheado = true;
    return t;
  }
  function rng(seed) {
    let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
    return () => {
      s ^= s << 13; s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }
  /* Ruído (grão) somado à textura, com média zero.
     Antes era pixel a pixel (getImageData/putImageData), que obriga o navegador
     a ler a textura de volta — o passo mais lento da carga. Agora são duas
     camadas de um ladrilho de ruído com amplitude A, compostas pelo próprio
     canvas: 'lighter' soma s₁ e 'difference' subtrai s₂ (|b − s₂| = b − s₂).
     s₁ − s₂ tem desvio A/√6 = forca/√12, igual ao ruído uniforme de antes. */
  const ladrilhos = new Map();
  function ladrilhoRuido(k, A) {
    const chave = k + '|' + A;
    if (ladrilhos.has(chave)) return ladrilhos.get(chave);
    const c = criar(128, 128);
    const g = c.getContext('2d');
    if (!g.createImageData) return null;
    const img = g.createImageData(128, 128), d = img.data, r = rng(k * 7919 + 13);
    for (let i = 0; i < d.length; i += 4) { const v = Math.round(r() * A); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    g.putImageData(img, 0, 0);
    ladrilhos.set(chave, c);
    return c;
  }
  function granular(c, forca, seed, area) {
    const g = c.getContext('2d');
    const [x, y, w, h] = area || [0, 0, c.width, c.height];
    const A = Math.max(1, Math.min(255, Math.round(forca * 0.7071)));
    seed = Math.abs(seed | 0);
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    for (const [i, modo] of [[0, 'lighter'], [1, 'difference']]) {
      const lad = ladrilhoRuido((seed * 2 + i) % 6, A);
      const pad = lad && g.createPattern(lad, 'repeat');
      if (!pad) continue;
      // deslocamento por semente: texturas diferentes não repetem o mesmo desenho
      const ox = (seed * 37 + i * 53) % 128, oy = (seed * 91 + i * 29) % 128;
      g.globalCompositeOperation = modo;
      g.translate(ox, oy);
      g.fillStyle = pad;
      g.fillRect(x - ox, y - oy, w, h);
      g.translate(-ox, -oy);
    }
    g.restore();
  }
  function escovar(g, x, y, w, h, base, forca, horizontal, seed, densidade = 1.3) {
    g.fillStyle = base;
    g.fillRect(x, y, w, h);
    const r = rng(seed);
    const n = Math.round((horizontal ? h : w) * densidade);
    for (let i = 0; i < n; i++) {
      const a = (r() - 0.5) * 2 * forca;
      g.fillStyle = a > 0 ? 'rgba(255,255,255,' + a.toFixed(3) + ')' : 'rgba(0,0,0,' + (-a).toFixed(3) + ')';
      if (horizontal) g.fillRect(x, y + r() * h, w, 0.4 + r() * 1.4);
      else g.fillRect(x + r() * w, y, 0.4 + r() * 1.4, h);
    }
  }
  function caminho(g, pts, S) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
    g.closePath();
  }
  function linha(g, pts, S, cor, largura) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
    g.strokeStyle = cor;
    g.lineWidth = largura * S;
    g.lineJoin = 'miter';
    g.stroke();
  }
  function texto(g, str, x, y, tam, cor, { fonte = F_TEXTO, peso = '600', rot = 0, alinhar = 'left', base = 'middle', espaco = 0 } = {}) {
    g.save();
    g.translate(x, y);
    if (rot) g.rotate(rot);
    g.font = peso + ' ' + tam + 'px ' + fonte;
    g.fillStyle = cor;
    g.textAlign = alinhar;
    g.textBaseline = base;
    if (espaco && 'letterSpacing' in g) g.letterSpacing = espaco + 'px';
    g.fillText(str, 0, 0);
    g.restore();
  }
  function retArr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /* ================= metal escovado repetível (laterais) ================= */
  function escovadoRepetivel(base, forca = 0.05, horizontal = true) {
    return memo('esc|' + base + forca + horizontal, () => {
      const c = criar(256, 256);
      escovar(c.getContext('2d'), 0, 0, 256, 256, base, forca, horizontal, 11, 1.6);
      granular(c, 10, 3);
      return tex(c, { repetir: true });
    });
  }

  /* ================= PLACA-MÃE: vista de cima =================
   * Recebe o layout (lista de itens em mm, x da borda traseira, y da borda
   * de cima) e desenha tudo na mesma posição em que a geometria é criada. */
  const MR = {
    pcb: 'rgb(0,158,20)', armadura: 'rgb(0,92,140)', metal: 'rgb(0,66,230)',
    plastico: 'rgb(0,150,25)', io: 'rgb(0,115,150)'
  };
  let ARM = { base: '#e4e5e7', sombra: '#aeb2b8', luz: '#fbfbfc', vermelho: '#7a1d26', grava: '#8e949b' };
  function luminancia(hex) {
    const c = new THREE.Color(hex);
    return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  }
  function paletaArmadura(spec) {
    const base = spec.corArmadura || '#e4e5e7';
    const clara = luminancia(base) > 0.35;
    const cBase = new THREE.Color(base);
    return {
      base,
      sombra: clara ? '#aeb2b8' : '#15171a',
      luz: clara ? '#fbfbfc' : '#6a7078',
      vermelho: spec.corAcento || '#7a1d26',
      grava: clara ? '#8e949b' : '#' + cBase.clone().offsetHSL(0, 0, 0.18).getHexString()
    };
  }

  function desenharArmadura(g, it, S, idx) {
    const pts = it.poly;
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) * S, x1 = Math.max(...xs) * S, y0 = Math.min(...ys) * S, y1 = Math.max(...ys) * S;
    const w = x1 - x0, h = y1 - y0;
    g.save();
    caminho(g, pts, S);
    g.clip();
    const vertical = h > w;
    escovar(g, x0, y0, w, h, ARM.base, 0.07, !vertical, 20 + idx, 1.2);
    // metade jateada (fosca) separada por um vinco diagonal
    g.save();
    g.beginPath();
    if (vertical) { g.moveTo(x0, y0 + h * 0.62); g.lineTo(x1, y0 + h * 0.5); g.lineTo(x1, y1); g.lineTo(x0, y1); }
    else { g.moveTo(x0 + w * 0.62, y0); g.lineTo(x1, y0); g.lineTo(x1, y1); g.lineTo(x0 + w * 0.5, y1); }
    g.closePath();
    g.fillStyle = 'rgba(40,44,52,0.09)';
    g.fill();
    g.restore();
    // vinco + linha vermelha "mecha"
    const vinco = vertical ? [[x0, y0 + h * 0.62], [x1, y0 + h * 0.5]] : [[x0 + w * 0.62, y0], [x0 + w * 0.5, y1]];
    g.beginPath(); g.moveTo(...vinco[0]); g.lineTo(...vinco[1]);
    g.strokeStyle = ARM.sombra; g.lineWidth = 0.7 * S; g.stroke();
    const acc = it.acentos || [];
    for (const a of acc) {
      linha(g, a, S, ARM.vermelho, 1.1);
      linha(g, a.map(([x, y]) => [x + 0.5, y + 0.5]), S, 'rgba(255,255,255,0.35)', 0.25);
    }
    // gravações
    for (const t of it.textos || []) {
      texto(g, t.s, t.x * S + 0.35 * S, t.y * S + 0.35 * S, t.tam * S, 'rgba(255,255,255,0.8)', { fonte: t.fonte || F_PESADA, peso: '900', rot: t.rot || 0, alinhar: 'center', espaco: (t.espaco || 0) * S });
      texto(g, t.s, t.x * S, t.y * S, t.tam * S, t.cor || ARM.grava, { fonte: t.fonte || F_PESADA, peso: '900', rot: t.rot || 0, alinhar: 'center', espaco: (t.espaco || 0) * S });
    }
    for (const r of it.riscos || []) linha(g, r, S, 'rgba(90,96,104,0.55)', 0.5);
    g.restore();
    // chanfro nas bordas
    caminho(g, pts, S);
    g.strokeStyle = ARM.sombra; g.lineWidth = 1.2 * S; g.stroke();
    caminho(g, pts.map(([x, y]) => [x, y]), S);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 0.35 * S; g.stroke();
  }

  function desenharItem(g, it, S) {
    const x = it.x0 * S, y = it.y0 * S, w = (it.x1 - it.x0) * S, h = (it.y1 - it.y0) * S;
    switch (it.desenho) {
      case 'dimm': {
        g.fillStyle = '#1b1c1f'; g.fillRect(x, y, w, h);
        g.fillStyle = '#060607'; g.fillRect(x + w * 0.38, y + 1.5 * S, w * 0.24, h - 3 * S);
        g.fillStyle = '#2b2d31'; g.fillRect(x, y, w, 0.8 * S); g.fillRect(x, y + h - 0.8 * S, w, 0.8 * S);
        break;
      }
      case 'trava': { g.fillStyle = '#d7dadd'; retArr(g, x, y, w, h, 0.8 * S); g.fill(); break; }
      case 'pcie-metal': {
        const grd = g.createLinearGradient(0, y, 0, y + h);
        grd.addColorStop(0, '#f1f2f4'); grd.addColorStop(0.5, '#b9bdc3'); grd.addColorStop(1, '#eceef0');
        g.fillStyle = grd; g.fillRect(x, y, w, h);
        g.fillStyle = '#0b0b0c'; g.fillRect(x + 1.2 * S, y + h * 0.4, w - 2.4 * S, h * 0.2);
        for (let i = 0; i < 6; i++) { g.fillStyle = '#8f949b'; g.fillRect(x + (8 + i * 14) * S, y + 0.6 * S, 0.5 * S, h - 1.2 * S); }
        break;
      }
      case 'pcie': {
        g.fillStyle = '#18191c'; g.fillRect(x, y, w, h);
        g.fillStyle = '#050506'; g.fillRect(x + 1 * S, y + h * 0.4, w - 2 * S, h * 0.2);
        break;
      }
      case 'trava-pcie': { g.fillStyle = '#222428'; g.fillRect(x, y, w, h); break; }
      case 'conector': {
        g.fillStyle = '#141517'; g.fillRect(x, y, w, h);
        const [cols, lins] = it.pinos || [2, 4];
        const pw = w / cols, ph = h / lins;
        g.fillStyle = '#050505';
        for (let i = 0; i < cols; i++) for (let j = 0; j < lins; j++) retArr(g, x + pw * i + pw * 0.2, y + ph * j + ph * 0.2, pw * 0.6, ph * 0.6, pw * 0.12), g.fill();
        break;
      }
      case 'header': {
        g.fillStyle = it.cor || '#141517'; g.fillRect(x, y, w, h);
        const n = Math.max(2, Math.round((it.x1 - it.x0) / 2.54));
        g.fillStyle = '#c9a54b';
        for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) g.fillRect(x + (i + 0.35) * (w / n), y + (j + 0.3) * (h / 2), (w / n) * 0.3, (h / 2) * 0.4);
        break;
      }
      case 'sata': {
        g.fillStyle = '#141517'; g.fillRect(x, y, w, h);
        g.fillStyle = '#050505';
        g.fillRect(x + w * 0.2, y + h * 0.1, w * 0.6, h * 0.36); g.fillRect(x + w * 0.2, y + h * 0.54, w * 0.6, h * 0.36);
        break;
      }
      case 'soquete': {
        g.fillStyle = '#c7cbd0'; g.fillRect(x, y, w, h);
        g.fillStyle = '#9aa0a7'; g.fillRect(x + 3 * S, y + 3 * S, w - 6 * S, h - 6 * S);
        g.fillStyle = '#1a1b1d'; g.fillRect(x + 11 * S, y + 16 * S, w - 22 * S, h - 32 * S);
        g.strokeStyle = '#6f757c'; g.lineWidth = 0.6 * S; g.strokeRect(x + 1.5 * S, y + 1.5 * S, w - 3 * S, h - 3 * S);
        texto(g, 'AM5', x + w / 2, y + 8 * S, 3 * S, '#50555c', { peso: '700', alinhar: 'center' });
        break;
      }
      case 'ihs': {
        const grd = g.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, '#e2e4e7'); grd.addColorStop(1, '#a9aeb4');
        g.fillStyle = grd; retArr(g, x, y, w, h, 2 * S); g.fill();
        texto(g, 'AMD RYZEN', x + w / 2, y + h / 2, 3.2 * S, 'rgba(60,64,70,0.75)', { peso: '800', alinhar: 'center' });
        break;
      }
      case 'io': { g.fillStyle = '#3a3e44'; g.fillRect(x, y, w, h); break; }
      default: { g.fillStyle = it.cor || '#1a1b1e'; g.fillRect(x, y, w, h); }
    }
  }

  function mrItem(m, it, S) {
    const desenho = it.desenho || '';
    m.fillStyle = it.tipo === 'armadura' ? MR.armadura
      : /metal|soquete|ihs/.test(desenho) ? MR.metal
        : desenho === 'io' ? MR.io : MR.plastico;
    if (it.tipo === 'armadura') { caminho(m, it.poly, S); m.fill(); } else if (it.tipo === 'cap') {
      m.fillStyle = MR.metal; m.beginPath(); m.arc(it.x * S, it.y * S, it.r * S, 0, Math.PI * 2); m.fill();
    } else m.fillRect(it.x0 * S, it.y0 * S, (it.x1 - it.x0) * S, (it.y1 - it.y0) * S);
  }

  function placaMaeTopo(spec, layout) {
    const key = 'mbTopo|' + [spec.nome, spec.largura, spec.altura, spec.corPCB, spec.corArmadura, spec.corAcento, JSON.stringify(spec.soquete), JSON.stringify(spec.dimm), JSON.stringify(spec.pcie)].join('|');
    return memo(key, () => {
      ARM = paletaArmadura(spec);
      const W = spec.largura, H = spec.altura;
      const S = 2048 / Math.max(W, H);
      const c = criar(W * S, H * S);
      const g = c.getContext('2d');
      const cm = criar(c.width, c.height);
      const m = cm.getContext('2d');
      m.fillStyle = MR.pcb;
      m.fillRect(0, 0, cm.width, cm.height);
      const r = rng(7);
      // PCB
      g.fillStyle = spec.corPCB;
      g.fillRect(0, 0, c.width, c.height);
      // trilhas em 45°
      g.lineCap = 'round';
      for (let n = 0; n < 420; n++) {
        let px = r() * W, py = r() * H;
        g.beginPath();
        g.moveTo(px * S, py * S);
        const passos = 2 + Math.floor(r() * 4);
        for (let k = 0; k < passos; k++) {
          const ang = Math.floor(r() * 8) * Math.PI / 4;
          const len = 4 + r() * 22;
          px += Math.cos(ang) * len; py += Math.sin(ang) * len;
          g.lineTo(px * S, py * S);
        }
        g.strokeStyle = 'rgba(160,170,182,' + (0.05 + r() * 0.06).toFixed(3) + ')';
        g.lineWidth = (0.12 + r() * 0.25) * S;
        g.stroke();
      }
      // vias
      for (let n = 0; n < 900; n++) {
        g.beginPath(); g.arc(r() * c.width, r() * c.height, (0.25 + r() * 0.2) * S, 0, Math.PI * 2);
        g.fillStyle = 'rgba(200,205,212,0.22)'; g.fill();
      }
      // componentes SMD
      for (let n = 0; n < 700; n++) {
        const w = (0.6 + r() * 1.6) * S, h = w * (0.45 + r() * 0.2);
        const x = r() * c.width, y = r() * c.height;
        g.fillStyle = r() < 0.5 ? '#6f5a3a' : '#2b2d31';
        g.save(); g.translate(x, y); if (r() < 0.5) g.rotate(Math.PI / 2);
        g.fillRect(-w / 2, -h / 2, w, h);
        g.fillStyle = '#b9bdc2'; g.fillRect(-w / 2, -h / 2, w * 0.18, h); g.fillRect(w / 2 - w * 0.18, -h / 2, w * 0.18, h);
        g.restore();
      }
      // furos de fixação
      for (const [hx, hy] of layout.furos) {
        m.beginPath(); m.arc(hx * S, hy * S, 3.6 * S, 0, Math.PI * 2); m.fillStyle = MR.metal; m.fill();
        g.beginPath(); g.arc(hx * S, hy * S, 3.6 * S, 0, Math.PI * 2); g.fillStyle = '#c9ccd1'; g.fill();
        g.beginPath(); g.arc(hx * S, hy * S, 1.9 * S, 0, Math.PI * 2); g.fillStyle = '#0b0b0c'; g.fill();
      }
      // área de áudio isolada
      if (layout.audio) {
        const a = layout.audio;
        g.setLineDash([1.2 * S, 0.8 * S]);
        g.strokeStyle = 'rgba(214,178,98,0.7)'; g.lineWidth = 0.35 * S;
        g.strokeRect(a.x0 * S, a.y0 * S, (a.x1 - a.x0) * S, (a.y1 - a.y0) * S);
        g.setLineDash([]);
        g.fillStyle = '#0d0e10';
        g.fillRect((a.x0 + 8) * S, (a.y0 + 10) * S, 7 * S, 7 * S);
        texto(g, 'AUDIO', (a.x0 + 3) * S, (a.y1 - 3) * S, 1.8 * S, '#d8dce1', { peso: '700' });
      }
      // bateria CMOS e chip do BIOS
      if (layout.bateria) {
        const b = layout.bateria;
        const grd = g.createRadialGradient(b.x * S - 3 * S, b.y * S - 3 * S, 1, b.x * S, b.y * S, 10 * S);
        grd.addColorStop(0, '#f4f5f6'); grd.addColorStop(1, '#9ca1a7');
        g.beginPath(); g.arc(b.x * S, b.y * S, 10 * S, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
        texto(g, 'CR2032', b.x * S, b.y * S, 2.2 * S, '#5a5f66', { peso: '700', alinhar: 'center' });
        texto(g, 'BAT1', b.x * S, (b.y + 12.5) * S, 1.6 * S, '#d8dce1', { peso: '600', alinhar: 'center' });
      }
      // serigrafia
      for (const t of layout.serigrafia) texto(g, t.s, t.x * S, t.y * S, (t.tam || 1.6) * S, '#d9dde2', { peso: t.peso || '600', rot: t.rot || 0, alinhar: t.alinhar || 'left' });
      granular(c, 8, 5);
      // itens com volume (desenho do topo)
      let idx = 0;
      for (const it of layout.itens) {
        if (it.tipo === 'armadura') desenharArmadura(g, it, S, idx++);
        else if (it.tipo === 'cap') {
          const grd = g.createRadialGradient(it.x * S - it.r * S * 0.3, it.y * S - it.r * S * 0.3, 1, it.x * S, it.y * S, it.r * S);
          grd.addColorStop(0, '#f3dc8e'); grd.addColorStop(1, '#a8812f');
          g.beginPath(); g.arc(it.x * S, it.y * S, it.r * S, 0, Math.PI * 2); g.fillStyle = grd; g.fill();
        } else if (it.desenho) desenharItem(g, it, S);
        mrItem(m, it, S);
      }
      return { map: tex(c), mr: tex(cm, { cor: false }) };
    });
  }

  /* Painel traseiro de conectores (face voltada para trás). */
  function placaMaeIO(alturaMM, larguraMM) {
    return memo('mbIO|' + alturaMM + '|' + larguraMM, () => {
      const S = 8;
      const c = criar(larguraMM * S, alturaMM * S);
      const g = c.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, '#34373c', 0.05, true, 9);
      let y = 4 * S;
      const porta = (h, desenho) => { desenho(y, h * S); y += (h + 2.2) * S; };
      const x0 = 3 * S, w = c.width - 6 * S;
      const usb = (cor) => (yy, hh) => {
        for (let k = 0; k < 2; k++) {
          const yk = yy + k * hh / 2;
          g.fillStyle = '#c4c8cd'; g.fillRect(x0, yk + 0.6 * S, w * 0.6, hh / 2 - 1.2 * S);
          g.fillStyle = cor; g.fillRect(x0 + 1 * S, yk + 1.6 * S, w * 0.6 - 2 * S, (hh / 2 - 3.2 * S) * 0.45);
        }
      };
      porta(8, (yy) => {
        for (let k = 0; k < 2; k++) {
          const cx = x0 + (6 + k * 14) * S, cy = yy + 4 * S;
          g.beginPath(); g.arc(cx, cy, 3.3 * S, 0, Math.PI * 2); g.fillStyle = '#d4b35b'; g.fill();
          g.beginPath(); g.arc(cx, cy, 1.4 * S, 0, Math.PI * 2); g.fillStyle = '#6e5a26'; g.fill();
        }
      });
      porta(15, usb('#111214'));
      porta(7, (yy, hh) => { g.fillStyle = '#c4c8cd'; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + 15 * S, yy); g.lineTo(x0 + 14 * S, yy + hh); g.lineTo(x0 + 1 * S, yy + hh); g.fill(); g.fillStyle = '#0b0b0c'; g.fillRect(x0 + 2 * S, yy + 1.5 * S, 11 * S, 2.5 * S); });
      porta(7, (yy, hh) => { g.fillStyle = '#c4c8cd'; g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + 16 * S, yy); g.lineTo(x0 + 16 * S, yy + hh * 0.7); g.lineTo(x0 + 13 * S, yy + hh); g.lineTo(x0, yy + hh); g.fill(); g.fillStyle = '#0b0b0c'; g.fillRect(x0 + 2 * S, yy + 1.5 * S, 12 * S, 2.5 * S); });
      porta(15, usb('#2459c7'));
      porta(4, (yy, hh) => { g.fillStyle = '#c4c8cd'; retArr(g, x0, yy, 9 * S, hh, 2 * S); g.fill(); g.fillStyle = '#0b0b0c'; retArr(g, x0 + 1 * S, yy + 1 * S, 7 * S, hh - 2 * S, 1 * S); g.fill(); g.beginPath(); g.arc(x0 + 17 * S, yy + hh / 2, 2 * S, 0, Math.PI * 2); g.fillStyle = '#1b1c1f'; g.fill(); });
      porta(15, usb('#2459c7'));
      porta(14, (yy, hh) => { g.fillStyle = '#c4c8cd'; g.fillRect(x0, yy, 16 * S, hh); g.fillStyle = '#0b0b0c'; g.fillRect(x0 + 2 * S, yy + 2 * S, 12 * S, hh - 4 * S); g.fillStyle = '#e8b33a'; g.fillRect(x0 + 1 * S, yy + 0.5 * S, 2 * S, 1.2 * S); g.fillStyle = '#4fbf5a'; g.fillRect(x0 + 13 * S, yy + 0.5 * S, 2 * S, 1.2 * S); });
      porta(15, usb('#111214'));
      for (const cor of ['#63b24f', '#e36a9a', '#4c8fd6']) porta(8, (yy) => { const cx = x0 + 6 * S, cy = yy + 4 * S; g.beginPath(); g.arc(cx, cy, 3.6 * S, 0, Math.PI * 2); g.fillStyle = cor; g.fill(); g.beginPath(); g.arc(cx, cy, 1.8 * S, 0, Math.PI * 2); g.fillStyle = '#0b0b0c'; g.fill(); });
      return tex(c);
    });
  }

  /* ================= MEMÓRIA — lateral do dissipador ================= */
  function memoriaLado(spec) {
    const branca = /eef|f2f|fff/i.test(spec.cor);
    const key = 'ram|' + spec.nome + '|' + spec.altura + '|' + spec.cor;
    return memo(key, () => {
      const L = spec.comprimento, H = spec.altura;
      const S = 1024 / L;
      const c = criar(L * S, H * S);
      const g = c.getContext('2d');
      const bump = criar(c.width, c.height);
      const b = bump.getContext('2d');
      const fundo = branca ? '#e9ebee' : '#141416';
      const relevo = branca ? '#f6f7f8' : '#1d1e21';
      const tinta = branca ? '#2a2c30' : '#f1f2f4';
      escovar(g, 0, 0, c.width, c.height, fundo, branca ? 0.03 : 0.035, true, 31);
      b.fillStyle = '#404040'; b.fillRect(0, 0, c.width, c.height);
      // placa em relevo assimétrica (asa)
      const asa = [[3, H * 0.2], [L * 0.64, H * 0.2], [L * 0.72, H * 0.62], [L * 0.72, H - 3], [3, H - 3]];
      caminho(g, asa, S); g.fillStyle = relevo; g.fill();
      caminho(b, asa, S); b.fillStyle = '#9a9a9a'; b.fill();
      caminho(g, asa, S); g.strokeStyle = branca ? '#c9ccd1' : '#2c2e32'; g.lineWidth = 0.5 * S; g.stroke();
      // faixas diagonais do lado direito
      for (let i = 0; i < 5; i++) {
        const x = L * 0.76 + i * 5.2;
        const p = [[x, H * 0.3], [x + 2.2, H * 0.3], [x + 6, H - 4], [x + 3.8, H - 4]];
        caminho(g, p, S); g.fillStyle = branca ? '#d9dce0' : '#0c0c0d'; g.fill();
        caminho(b, p, S); b.fillStyle = '#202020'; b.fill();
      }
      // furos de ventilação perto do topo
      for (let i = 0; i < 14; i++) {
        const x = 8 + i * 4.3;
        g.fillStyle = branca ? '#b9bdc3' : '#050505';
        retArr(g, x * S, (H * 0.08) * S, 2.4 * S, 2.2 * S, 0.5 * S); g.fill();
        b.fillStyle = '#000'; retArr(b, x * S, (H * 0.08) * S, 2.4 * S, 2.2 * S, 0.5 * S); b.fill();
      }
      // FURY em alumínio exposto
      const grd = g.createLinearGradient(0, H * 0.35 * S, 0, H * 0.8 * S);
      grd.addColorStop(0, '#f4f5f7'); grd.addColorStop(0.5, '#a9aeb5'); grd.addColorStop(1, '#e3e5e8');
      g.save();
      g.transform(1, 0, -0.18, 1, 0, 0);
      g.font = '900 ' + (H * 0.36 * S) + 'px ' + F_PESADA;
      g.textBaseline = 'middle';
      if ('letterSpacing' in g) g.letterSpacing = (1.2 * S) + 'px';
      g.fillStyle = branca ? '#8b9098' : grd;
      g.fillText('FURY', (L * 0.1 + H * 0.1) * S, H * 0.56 * S);
      g.restore();
      b.save(); b.transform(1, 0, -0.18, 1, 0, 0);
      b.font = '900 ' + (H * 0.36 * S) + 'px ' + F_PESADA; b.textBaseline = 'middle';
      if ('letterSpacing' in b) b.letterSpacing = (1.2 * S) + 'px';
      b.fillStyle = '#e0e0e0'; b.fillText('FURY', (L * 0.1 + H * 0.1) * S, H * 0.56 * S); b.restore();
      texto(g, 'Kingston', 9 * S, H * 0.84 * S, 2.6 * S, tinta, { peso: '700' });
      texto(g, 'BEAST', L * 0.52 * S, H * 0.84 * S, 2.6 * S, tinta, { peso: '800', espaco: 0.4 * S });
      texto(g, 'DDR5', (L - 6) * S, H * 0.16 * S, 2.8 * S, tinta, { peso: '800', alinhar: 'right' });
      // entalhes no topo
      for (const x of [L * 0.3, L * 0.31, L * 0.32]) { g.fillStyle = branca ? '#c3c7cc' : '#070707'; g.fillRect(x * S, 0, 0.6 * S, 2 * S); }
      granular(c, 6, 13);
      return { map: tex(c), bump: tex(bump, { cor: false }) };
    });
  }

  /* ================= FAN — adesivo do cubo ================= */
  function adesivoFan(estilo, corBase) {
    return memo('adesivo|' + estilo + corBase, () => {
      const c = criar(256, 256);
      const g = c.getContext('2d');
      g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fillStyle = corBase || '#101113'; g.fill();
      if (estilo === 'arctic-p14-pro') {
        g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.strokeStyle = '#2b2d31'; g.lineWidth = 3; g.stroke();
        texto(g, 'ARCTIC', 128, 116, 44, '#f2f3f5', { fonte: F_PESADA, peso: '900', alinhar: 'center', espaco: 2 });
        texto(g, 'P14 Pro', 128, 160, 22, '#9aa0a7', { peso: '700', alinhar: 'center', espaco: 1 });
      } else if (estilo === 'squama') {
        g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.strokeStyle = '#3a3c41'; g.lineWidth = 6; g.stroke();
        texto(g, 'GEOMETRIC', 128, 120, 26, '#d8dbe0', { peso: '800', alinhar: 'center', espaco: 1 });
        texto(g, 'FUTURE', 128, 150, 22, '#9aa0a7', { peso: '700', alinhar: 'center', espaco: 3 });
      } else if (estilo === 'aorus') {
        texto(g, 'AORUS', 128, 130, 44, '#3a3d42', { fonte: F_PESADA, peso: '900', alinhar: 'center', espaco: 2 });
      } else {
        g.beginPath(); g.arc(128, 128, 60, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 4; g.stroke();
      }
      return tex(c);
    });
  }

  /* ================= GPU ================= */
  /* A face é vista por trás da placa: a ponta (passagem de ar) fica à
     esquerda do canvas e o lado do suporte à direita. X() espelha a posição. */
  function gpuBackplate(L, H, fluxoX) {
    return memo('bp|' + L + '|' + H + '|' + fluxoX, () => {
      const S = 1400 / L;
      const X = (xm) => L - xm;
      const c = criar(L * S, H * S);
      const g = c.getContext('2d');
      const a = criar(c.width, c.height);
      const ga = a.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, '#34373c', 0.05, true, 41);
      ga.fillStyle = '#fff'; ga.fillRect(0, 0, a.width, a.height);
      const painel = [[8, 12], [fluxoX - 20, 12], [fluxoX - 8, 26], [fluxoX - 8, H - 12], [8, H - 12]].map(([x, y]) => [X(x), y]);
      caminho(g, painel, S); g.strokeStyle = '#1f2125'; g.lineWidth = 1.2 * S; g.stroke();
      caminho(g, painel.map(([x, y]) => [x + 0.6, y + 0.6]), S); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 0.4 * S; g.stroke();
      for (let i = 0; i < 4; i++) linha(g, [[X(30 + i * 6), H - 12], [X(60 + i * 6), 12]], S, 'rgba(0,0,0,0.28)', 0.8);
      const cx = X(fluxoX * 0.5) * S;
      texto(g, 'ZOTAC GAMING', cx, H * 0.5 * S, 9 * S, '#9ca1a8', { fonte: F_PESADA, peso: '900', alinhar: 'center', espaco: 1.2 * S });
      texto(g, 'AMP EXTREME  ·  INFINITY', cx, (H * 0.5 + 10) * S, 3.2 * S, '#80858c', { peso: '700', alinhar: 'center', espaco: 0.8 * S });
      // passagem de ar (flow-through): fendas vazadas na ponta da placa
      for (let x = fluxoX + 4; x < L - 6; x += 5.2) {
        for (let y = 14; y < H - 16; y += 16) {
          const p = [[x, y], [x + 2.4, y], [x + 4.6, y + 12], [x + 2.2, y + 12]].map(([px, py]) => [X(px), py]);
          caminho(g, p, S); g.fillStyle = '#0a0a0b'; g.fill();
          caminho(ga, p, S); ga.fillStyle = '#000'; ga.fill();
        }
      }
      granular(c, 7, 17);
      return { map: tex(c), alpha: tex(a, { cor: false }) };
    });
  }

  function gpuSuporte(larguraMM, alturaMM) {
    return memo('supGPU|' + larguraMM + '|' + alturaMM, () => {
      const S = 8;
      const c = criar(larguraMM * S, alturaMM * S);
      const g = c.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, '#c7cbd0', 0.06, false, 51);
      // portas: 3× DisplayPort + 1× HDMI, na fileira do lado do PCB
      const porta = (y, dp) => {
        const x = 3.5 * S, w = 16.5 * S, h = 6.5 * S;
        g.fillStyle = '#16171a';
        g.beginPath();
        if (dp) { g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - 2 * S); g.lineTo(x + w - 2 * S, y + h); g.lineTo(x, y + h); }
        else { g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w - 1.5 * S, y + h); g.lineTo(x + 1.5 * S, y + h); }
        g.closePath(); g.fill();
        g.fillStyle = '#35373b'; g.fillRect(x + 2.5 * S, y + 2 * S, w - 5 * S, 2.2 * S);
      };
      let y = c.height - 24 * S;
      for (let i = 0; i < 3; i++) { porta(y, true); y -= 14 * S; }
      porta(y, false);
      // grade de ventilação nas demais fileiras
      for (let yy = 8; yy < alturaMM - 8; yy += 4.4) {
        g.fillStyle = '#1d1f23';
        retArr(g, 24 * S, yy * S, (larguraMM - 28) * S, 2.2 * S, 1 * S); g.fill();
      }
      return tex(c);
    });
  }


  /* Dedos PCIe x16 (uma face): 11 contatos, chave, 71 contatos; passo 1,0 mm.
     Canvas: x = 0 no lado do suporte; y de cima (junto ao PCB) para baixo (borda). */
  function gpuDedos(comp, alt) {
    return memo('dedos|' + comp + '|' + alt, () => {
      const S = 14;
      const c = criar(Math.round(comp * S), Math.round(alt * S));
      const a = criar(c.width, c.height);
      const g = c.getContext('2d'), ga = a.getContext('2d');
      g.fillStyle = '#0f1113'; g.fillRect(0, 0, c.width, c.height);
      ga.fillStyle = '#000'; ga.fillRect(0, 0, a.width, a.height);
      const ouro = g.createLinearGradient(0, 0, 0, c.height);
      ouro.addColorStop(0, '#b8913a'); ouro.addColorStop(0.5, '#e6c46a'); ouro.addColorStop(1, '#c79d45');
      const pad = (xc, longo) => {
        const w = 0.7, y1 = alt - 0.55, y0 = alt - (longo ? 5.1 : 4.3);
        g.fillStyle = ouro; g.fillRect((xc - w / 2) * S, y0 * S, w * S, (y1 - y0) * S);
        ga.fillStyle = '#fff'; ga.fillRect((xc - w / 2) * S, y0 * S, w * S, (y1 - y0) * S);
      };
      for (let i = 0; i < 11; i++) pad(0.8 + i, i === 0 || i === 4);
      for (let i = 0; i < 71; i++) pad(14.05 + i, i === 69);
      granular(c, 6, 71);
      return { map: tex(c), alpha: tex(a, { cor: false }) };
    });
  }

  /* Contatos de um pente DDR5 (uma face): 144 contatos de 0,85 mm de passo,
     chave quase no meio. Canvas: x = 0 na ponta esquerda (olhando a face). */
  function dedosDIMM(comp, alt, chave) {
    return memo('dimm|' + comp + '|' + alt + '|' + chave, () => {
      const S = 16;
      const c = criar(Math.round(comp * S), Math.round(alt * S));
      const a = criar(c.width, c.height);
      const g = c.getContext('2d'), ga = a.getContext('2d');
      g.fillStyle = '#101213'; g.fillRect(0, 0, c.width, c.height);
      ga.fillStyle = '#000'; ga.fillRect(0, 0, a.width, a.height);
      const ouro = g.createLinearGradient(0, 0, 0, c.height);
      ouro.addColorStop(0, '#b8913a'); ouro.addColorStop(0.55, '#e8c86e'); ouro.addColorStop(1, '#c79d45');
      const passo = 0.85, w = 0.6;
      const x0 = (comp - (144 * passo + 1.9)) / 2;
      for (let i = 0; i < 144; i++) {
        let x = x0 + i * passo + (i >= 72 ? 1.9 : 0);
        if (Math.abs(x + w / 2 - chave) < 1.2) continue;
        const y0 = alt - 3.9, y1 = alt - 0.45;
        g.fillStyle = ouro; g.fillRect(x * S, y0 * S, w * S, (y1 - y0) * S);
        ga.fillStyle = '#fff'; ga.fillRect(x * S, y0 * S, w * S, (y1 - y0) * S);
      }
      granular(c, 6, 83);
      return { map: tex(c), alpha: tex(a, { cor: false }) };
    });
  }

  /* ================= superfícies genéricas ================= */
  // Grão fino (pintura eletrostática / plástico fosco): mapa de cor + relevo, repetível.
  function grao(cor, forca = 14, seed = 3) {
    return memo('grao|' + cor + forca + seed, () => {
      const c = criar(256, 256);
      const g = c.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, 256, 256);
      granular(c, forca, seed);
      const b = criar(256, 256);
      const gb = b.getContext('2d');
      gb.fillStyle = '#808080'; gb.fillRect(0, 0, 256, 256);
      granular(b, 90, seed + 1);
      return { map: tex(c, { repetir: true }), bump: tex(b, { cor: false, repetir: true }) };
    });
  }

  /* Painel de aço perfurado (furos redondos em grade), com regiões sólidas.
   * w,h em mm. solidos: [{x0,y0,x1,y1}] em mm (origem no canto superior esquerdo
   * da face vista de fora). textos: [{s,x,y,tam}] gravados nas partes sólidas. */
  function painelPerfurado(chave, w, h, cor, { passo = 5, furo = 3.4, borda = 6, solidos = [], textos = [] } = {}) {
    return memo('painel|' + chave + '|' + w + '|' + h + '|' + cor, () => {
      const S = 2048 / Math.max(w, h);
      const c = criar(w * S, h * S);
      const a = criar(c.width, c.height);
      const g = c.getContext('2d');
      const ga = a.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, c.width, c.height);
      granular(c, 12, 23);
      ga.fillStyle = '#fff'; ga.fillRect(0, 0, a.width, a.height);
      const dentroSolido = (x, y) => solidos.some((r) => x > r.x0 - furo && x < r.x1 + furo && y > r.y0 - furo && y < r.y1 + furo);
      ga.fillStyle = '#000';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      for (let y = borda + furo; y < h - borda - furo / 2; y += passo) {
        for (let x = borda + furo; x < w - borda - furo / 2; x += passo) {
          if (dentroSolido(x, y)) continue;
          ga.beginPath(); ga.arc(x * S, y * S, (furo / 2) * S, 0, Math.PI * 2); ga.fill();
          g.beginPath(); g.arc(x * S, y * S, (furo / 2 + 0.25) * S, 0, Math.PI * 2); g.fill();
        }
      }
      for (const r of solidos) {
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.6 * S;
        g.strokeRect(r.x0 * S, r.y0 * S, (r.x1 - r.x0) * S, (r.y1 - r.y0) * S);
      }
      for (const t of textos) {
        texto(g, t.s, t.x * S + 0.3 * S, t.y * S + 0.3 * S, t.tam * S, 'rgba(0,0,0,0.6)', { fonte: F_PESADA, peso: '900', alinhar: t.alinhar || 'center', espaco: (t.espaco || 0.6) * S });
        texto(g, t.s, t.x * S, t.y * S, t.tam * S, t.cor || '#8a8f96', { fonte: F_PESADA, peso: '900', alinhar: t.alinhar || 'center', espaco: (t.espaco || 0.6) * S });
      }
      return { map: tex(c), alpha: tex(a, { cor: false }) };
    });
  }

  /* Chapa com grade de furos quadrados (traseira do Model 5 Vent). solidos/furos em mm. */
  function gradeQuadrada(chave, w, h, cor, { passo = 11, furo = 8.5, borda = 8, solidos = [], raio = 1.2 } = {}) {
    return memo('gradeQ|' + chave + '|' + w + '|' + h + '|' + cor, () => {
      const S = 2048 / Math.max(w, h);
      const c = criar(w * S, h * S), a = criar(c.width, c.height);
      const g = c.getContext('2d'), ga = a.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, c.width, c.height);
      granular(c, 12, 29);
      ga.fillStyle = '#fff'; ga.fillRect(0, 0, a.width, a.height);
      const livre = (x0, y0, x1, y1) => !solidos.some((r) => x0 < r.x1 && x1 > r.x0 && y0 < r.y1 && y1 > r.y0);
      const nx = Math.floor((w - 2 * borda + (passo - furo)) / passo), ny = Math.floor((h - 2 * borda + (passo - furo)) / passo);
      const ox = (w - (nx * passo - (passo - furo))) / 2, oy = (h - (ny * passo - (passo - furo))) / 2;
      ga.fillStyle = '#000';
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const x0 = ox + i * passo, y0 = oy + j * passo;
          if (!livre(x0, y0, x0 + furo, y0 + furo)) continue;
          const r = raio * S;
          const X = x0 * S, Y = (h - y0 - furo) * S, L = furo * S;
          ga.beginPath(); ga.moveTo(X + r, Y); ga.arcTo(X + L, Y, X + L, Y + L, r); ga.arcTo(X + L, Y + L, X, Y + L, r); ga.arcTo(X, Y + L, X, Y, r); ga.arcTo(X, Y, X + L, Y, r); ga.fill();
          g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(X - 0.6 * S, Y - 0.6 * S, L + 1.2 * S, L + 1.2 * S);
        }
      }
      return { map: tex(c), alpha: tex(a, { cor: false }) };
    });
  }

  /* ================= WATERCOOLER AORUS ================= */
  // Face espelhada da bomba (efeito "infinito"): cor + máscara do brilho RGB.
  function aorusEspelho() {
    return memo('aorusEspelho', () => {
      const N = 512, c = criar(N, N), e = criar(N, N);
      const g = c.getContext('2d'), ge = e.getContext('2d');
      const grd = g.createRadialGradient(N * 0.45, N * 0.4, 10, N / 2, N / 2, N / 2);
      grd.addColorStop(0, '#2a2d33'); grd.addColorStop(1, '#07080a');
      g.fillStyle = grd; g.fillRect(0, 0, N, N);
      ge.fillStyle = '#000'; ge.fillRect(0, 0, N, N);
      // anéis refletidos que somem para o centro
      for (let i = 0; i < 7; i++) {
        const r = N * (0.46 - i * 0.045);
        const alfa = Math.pow(0.62, i);
        ge.beginPath(); ge.arc(N / 2, N / 2, r, 0, Math.PI * 2);
        ge.strokeStyle = 'rgba(255,255,255,' + alfa.toFixed(3) + ')'; ge.lineWidth = N * 0.018 * (1 - i * 0.1); ge.stroke();
        g.beginPath(); g.arc(N / 2, N / 2, r, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(180,200,220,' + (alfa * 0.25).toFixed(3) + ')'; g.lineWidth = N * 0.012; g.stroke();
      }
      // emblema: asas estilizadas + AORUS
      g.save(); g.translate(N / 2, N * 0.47);
      const asa = (lado) => {
        g.beginPath(); g.moveTo(0, -N * 0.02);
        g.quadraticCurveTo(lado * N * 0.09, -N * 0.12, lado * N * 0.17, -N * 0.1);
        g.quadraticCurveTo(lado * N * 0.1, -N * 0.05, lado * N * 0.03, N * 0.05);
        g.closePath();
        const gg = g.createLinearGradient(0, -N * 0.12, 0, N * 0.05);
        gg.addColorStop(0, '#f2f4f6'); gg.addColorStop(1, '#9ea4ab');
        g.fillStyle = gg; g.fill();
      };
      asa(1); asa(-1);
      g.restore();
      texto(g, 'AORUS', N / 2, N * 0.62, N * 0.075, '#dfe3e7', { fonte: F_PESADA, peso: '900', alinhar: 'center', espaco: N * 0.012 });
      return { map: tex(c), emissive: tex(e) };
    });
  }

  function aorusTanque(w, h) {
    return memo('aorusTanque|' + w + '|' + h, () => {
      const S = 12, c = criar(w * S, h * S), b = criar(w * S, h * S);
      const g = c.getContext('2d'), gb = b.getContext('2d');
      g.fillStyle = '#eef0f2'; g.fillRect(0, 0, c.width, c.height);
      granular(c, 7, 29);
      gb.fillStyle = '#707070'; gb.fillRect(0, 0, b.width, b.height);
      const cx = c.width / 2, cy = c.height / 2;
      const tam = Math.min(w * 0.55, h * 0.16) * S;
      texto(g, 'AORUS', cx, cy, tam, '#c5c9ce', { fonte: F_PESADA, peso: '900', alinhar: 'center', rot: -Math.PI / 2, espaco: tam * 0.15 });
      texto(gb, 'AORUS', cx, cy, tam, '#d8d8d8', { fonte: F_PESADA, peso: '900', alinhar: 'center', rot: -Math.PI / 2, espaco: tam * 0.15 });
      return { map: tex(c), bump: tex(b, { cor: false }) };
    });
  }

  function aletasRadiador(cor, fenda) {
    return memo('aletasRad2|' + cor + fenda, () => {
      const c = criar(64, 16);
      const g = c.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, 64, 16);
      for (let x = 0; x < 64; x += 4) { g.fillStyle = fenda; g.fillRect(x + 2.6, 0, 1.4, 16); }
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < 16; y += 8) g.fillRect(0, y, 64, 1.2);
      return tex(c, { repetir: true });
    });
  }

  // Malha trançada da mangueira (repetível; u ao longo do tubo).
  function trancado(cor) {
    return memo('trancado|' + cor, () => {
      const c = criar(128, 128), b = criar(128, 128);
      const g = c.getContext('2d'), gb = b.getContext('2d');
      g.fillStyle = cor; g.fillRect(0, 0, 128, 128);
      gb.fillStyle = '#808080'; gb.fillRect(0, 0, 128, 128);
      // fios em duas direções, alternando por cima e por baixo
      for (let d = 0; d < 2; d++) {
        for (let i = -128; i < 256; i += 10) {
          const x0 = d ? i + 128 : i, x1 = d ? i : i + 128;
          g.strokeStyle = 'rgba(0,0,0,0.32)'; g.lineWidth = 4.5;
          g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 128); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2;
          g.beginPath(); g.moveTo(x0 + 1, 0); g.lineTo(x1 + 1, 128); g.stroke();
          gb.strokeStyle = '#202020'; gb.lineWidth = 4.5;
          gb.beginPath(); gb.moveTo(x0, 0); gb.lineTo(x1, 128); gb.stroke();
          gb.strokeStyle = '#e8e8e8'; gb.lineWidth = 2;
          gb.beginPath(); gb.moveTo(x0 + 1, 0); gb.lineTo(x1 + 1, 128); gb.stroke();
        }
      }
      granular(c, 10, 71);
      return { map: tex(c, { repetir: true }), bump: tex(b, { cor: false, repetir: true }) };
    });
  }

  /* ================= MEMÓRIA — lado da etiqueta ================= */
  function memoriaEtiqueta(spec) {
    const branca = /eef|f2f|fff/i.test(spec.cor);
    return memo('ramEtq|' + spec.nome + spec.altura + spec.cor, () => {
      const L = spec.comprimento, H = spec.altura, S = 1024 / L;
      const c = criar(L * S, H * S);
      const g = c.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, branca ? '#e9ebee' : '#141416', 0.035, true, 37);
      // etiqueta de especificações
      const ex = L * 0.34, ey = H * 0.24, ew = L * 0.4, eh = H * 0.56;
      g.fillStyle = '#f4f4f2'; retArr(g, ex * S, ey * S, ew * S, eh * S, 0.8 * S); g.fill();
      const tinta = '#1b1c1e';
      texto(g, 'KF560C36BBE-32', (ex + 2) * S, (ey + eh * 0.2) * S, 2.3 * S, tinta, { peso: '800' });
      texto(g, '32GB 2Rx8 4G x 64-Bit PC5-6000', (ex + 2) * S, (ey + eh * 0.42) * S, 1.5 * S, tinta, { peso: '600' });
      texto(g, 'CL36-38-38 1.35V', (ex + 2) * S, (ey + eh * 0.6) * S, 1.5 * S, tinta, { peso: '600' });
      for (let i = 0; i < 38; i++) { const bw = (0.2 + ((i * 7) % 5) * 0.12) * S; g.fillStyle = tinta; g.fillRect((ex + 2 + i * 0.75) * S, (ey + eh * 0.72) * S, bw, eh * 0.2 * S); }
      texto(g, 'ASSEMBLED IN TAIWAN', (ex + ew - 2) * S, (ey + eh * 0.2) * S, 1.2 * S, '#55585d', { peso: '700', alinhar: 'right' });
      texto(g, 'Kingston', 7 * S, H * 0.2 * S, 2.6 * S, branca ? '#2a2c30' : '#f1f2f4', { peso: '700' });
      texto(g, 'DDR5', (L - 6) * S, H * 0.2 * S, 2.8 * S, branca ? '#2a2c30' : '#f1f2f4', { peso: '800', alinhar: 'right' });
      granular(c, 6, 19);
      return tex(c);
    });
  }

  /* ================= FONTE CORSAIR RMe ================= */
  // Topo: grade com o padrão triangular/"Y" da Corsair, ventoinha aparecendo por baixo e logo no centro.
  function corsairGrade(w, l) {
    return memo('corsairGrade|' + w + '|' + l, () => {
      const S = 1024 / Math.max(w, l), c = criar(w * S, l * S);
      const g = c.getContext('2d');
      const cx = c.width / 2, cy = c.height / 2, R = Math.min(w, l) * 0.45 * S;
      escovar(g, 0, 0, c.width, c.height, '#161719', 0.03, true, 43);
      // ventoinha escura por baixo
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#050506'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 9; i++) {
        g.save(); g.translate(cx, cy); g.rotate(i * Math.PI * 2 / 9);
        g.beginPath(); g.moveTo(R * 0.22, -R * 0.05); g.quadraticCurveTo(R * 0.6, -R * 0.35, R * 0.98, -R * 0.12); g.lineTo(R * 0.98, R * 0.1); g.quadraticCurveTo(R * 0.6, -R * 0.05, R * 0.22, R * 0.08); g.closePath();
        g.fillStyle = '#26272b'; g.fill(); g.restore();
      }
      g.restore();
      // grade (camada separada): chapa com triângulos vazados em padrão Y
      const cg = criar(c.width, c.height);
      const gg = cg.getContext('2d');
      gg.beginPath(); gg.arc(cx, cy, R, 0, Math.PI * 2); gg.fillStyle = '#18191b'; gg.fill();
      gg.globalCompositeOperation = 'destination-out';
      const passo = 5.2 * S;
      for (let y = 0, lin = 0; y < c.height + passo; y += passo * 0.866, lin++) {
        for (let x = (lin % 2) * passo / 2; x < c.width + passo; x += passo) {
          const d = Math.hypot(x - cx, y - cy);
          if (d > R - 2 * S || d < R * 0.22) continue;
          const t = passo * 0.38, inv = lin % 2 ? -1 : 1;
          gg.beginPath(); gg.moveTo(x, y - t * inv); gg.lineTo(x + t * 0.87, y + t * 0.5 * inv); gg.lineTo(x - t * 0.87, y + t * 0.5 * inv); gg.closePath(); gg.fill();
        }
      }
      g.drawImage(cg, 0, 0);
      // aro e logo no centro
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.strokeStyle = '#26282b'; g.lineWidth = 2.2 * S; g.stroke();
      g.beginPath(); g.arc(cx, cy, R * 0.2, 0, Math.PI * 2); g.fillStyle = '#131416'; g.fill();
      g.save(); g.translate(cx, cy);
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.moveTo(-R * 0.1 + i * R * 0.045, R * 0.08);
        g.quadraticCurveTo(-R * 0.02 + i * R * 0.05, -R * 0.02, R * 0.08 + i * R * 0.02, -R * 0.12 + i * R * 0.03);
        g.lineWidth = R * 0.022; g.strokeStyle = '#e9ebee'; g.stroke();
      }
      g.restore();
      granular(c, 6, 47);
      return tex(c);
    });
  }

  function corsairLateral(w, h, spec) {
    return memo('corsairLat|' + w + '|' + h + spec.nome, () => {
      const S = 1024 / Math.max(w, h), c = criar(w * S, h * S);
      const g = c.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, '#151618', 0.025, true, 53);
      granular(c, 9, 59);
      const modelo = (spec.nome.match(/RM\d+\w*/) || ['RM'])[0];
      texto(g, 'CORSAIR', 12 * S, h * 0.36 * S, h * 0.14 * S, '#e8eaed', { fonte: F_PESADA, peso: '900', espaco: 2.4 * S });
      texto(g, modelo, 12 * S, h * 0.62 * S, h * 0.2 * S, '#d5d8dc', { fonte: F_PESADA, peso: '900' });
      texto(g, 'RMe SERIES  ·  80 PLUS GOLD', 12 * S, h * 0.8 * S, h * 0.06 * S, '#8c9097', { peso: '700', espaco: 0.8 * S });
      g.fillStyle = '#e8eaed'; g.fillRect((w - 14) * S, h * 0.25 * S, 1.2 * S, h * 0.5 * S);
      return tex(c);
    });
  }

  function corsairEspecificacao(w, h, spec) {
    return memo('corsairEsp|' + w + '|' + h + spec.nome, () => {
      const S = 1024 / Math.max(w, h), c = criar(w * S, h * S);
      const g = c.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, '#151618', 0.025, true, 61);
      const ex = w * 0.08, ey = h * 0.12, ew = w * 0.84, eh = h * 0.76;
      g.fillStyle = '#d9dbdf'; retArr(g, ex * S, ey * S, ew * S, eh * S, 1.2 * S); g.fill();
      texto(g, 'CORSAIR ' + (spec.nome.match(/RM\d+\w*/) || [''])[0], (ex + 4) * S, (ey + 8) * S, 5 * S, '#1b1c1e', { fonte: F_PESADA, peso: '900' });
      const linhas = ['AC INPUT 100-240V~ 15A 50-60Hz', 'DC OUTPUT  +3.3V 25A  +5V 25A  +12V 100A', 'MAX COMBINED WATTAGE ' + spec.potencia + 'W', 'ATX 3.1 · PCIe 5.1 READY'];
      linhas.forEach((t, i) => texto(g, t, (ex + 4) * S, (ey + 18 + i * 7.5) * S, 3 * S, '#2a2c30', { peso: '700' }));
      g.strokeStyle = '#2a2c30'; g.lineWidth = 0.4 * S;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo((ex + 4) * S, (ey + 21.5 + i * 7.5) * S); g.lineTo((ex + ew - 4) * S, (ey + 21.5 + i * 7.5) * S); g.stroke(); }
      g.fillStyle = '#1b1c1e'; retArr(g, (ex + ew - 30) * S, (ey + eh - 24) * S, 24 * S, 18 * S, 2 * S); g.fill();
      texto(g, '80 PLUS', (ex + ew - 18) * S, (ey + eh - 18) * S, 3.4 * S, '#e0c16b', { peso: '900', alinhar: 'center' });
      texto(g, 'GOLD', (ex + ew - 18) * S, (ey + eh - 11) * S, 3.4 * S, '#e0c16b', { peso: '900', alinhar: 'center' });
      return tex(c);
    });
  }

  /* Painel modular da RMe (face de 150 × 86 mm): posição dos soquetes em mm
     a partir da borda esquerda / de baixo (olhando a face). Os mesmos números
     são usados na geometria (modelos3d) e nas tomadas dos cabos (montagem). */
  const CORSAIR_MODULAR = [
    { id: '24a', x: 7, y: 58.6, cols: 9, rows: 2, passo: 4.2 },
    { id: '24b', x: 50, y: 58.6, cols: 5, rows: 2, passo: 4.2 },
    { id: '12v', x: 64.8, y: 37.8, cols: 6, rows: 2, passo: 3.0, sinal: true },
    { id: 'pc1', x: 89.4, y: 36.6, cols: 4, rows: 2, passo: 4.2 },
    { id: 'pc2', x: 113.4, y: 36.6, cols: 4, rows: 2, passo: 4.2 },
    { id: 'pc3', x: 89.4, y: 14.6, cols: 4, rows: 2, passo: 4.2 },
    { id: 'pc4', x: 113.4, y: 14.6, cols: 4, rows: 2, passo: 4.2 },
    { id: 'sa1', x: 80, y: 58.6, cols: 3, rows: 2, passo: 4.2 },
    { id: 'sa2', x: 98, y: 58.6, cols: 3, rows: 2, passo: 4.2 },
    { id: 'sa3', x: 116, y: 58.6, cols: 3, rows: 2, passo: 4.2 }
  ];
  const tamSoquete = (s) => ({ w: s.cols * s.passo + 2.4, h: s.rows * s.passo + 2.4 + (s.sinal ? 3 : 0) });

  function corsairModular(w, h) {
    return memo('corsairMod|' + w + '|' + h, () => {
      const S = 1024 / Math.max(w, h), c = criar(w * S, h * S);
      const g = c.getContext('2d');
      escovar(g, 0, 0, c.width, c.height, '#131416', 0.025, true, 67);
      granular(c, 7, 71);
      // moldura rebaixada em volta de cada soquete
      for (const sq of CORSAIR_MODULAR) {
        const t = tamSoquete(sq);
        g.strokeStyle = 'rgba(216,219,223,0.28)'; g.lineWidth = 0.35 * S;
        retArr(g, (sq.x - 1.2) * S, (h - sq.y - t.h - 1.2) * S, (t.w + 2.4) * S, (t.h + 2.4) * S, 1 * S); g.stroke();
      }
      const rot = [['24-PIN ATX', 7, 75.5], ['SATA / PERIPHERAL', 80, 75.5], ['12V-2x6', 64.8, 33.5], ['PCIe & CPU', 89.4, 52], ['PCIe & CPU', 89.4, 30]];
      for (const [t, x, y] of rot) texto(g, t, x * S, (h - y) * S, 2.6 * S, '#d8dbdf', { peso: '800', alinhar: 'left' });
      texto(g, 'CORSAIR', 7 * S, (h - 22) * S, 5 * S, '#d8dbdf', { fonte: F_PESADA, peso: '900', alinhar: 'left', espaco: 1 * S });
      texto(g, 'USE ONLY TYPE 5 CABLES', 7 * S, (h - 14) * S, 2.2 * S, '#9ca0a6', { peso: '700', alinhar: 'left' });
      g.strokeStyle = 'rgba(216,219,223,0.45)'; g.lineWidth = 0.4 * S;
      g.strokeRect(4 * S, 4 * S, (w - 8) * S, (h - 8) * S);
      return tex(c);
    });
  }

  // Grade da ventoinha da fonte: onde a chapa é vazada (preto) — para alphaMap.
  function corsairGradeAlfa(w, l) {
    return memo('corsairGradeA|' + w + '|' + l, () => {
      const S = 1024 / Math.max(w, l), c = criar(w * S, l * S);
      const g = c.getContext('2d');
      const cx = c.width / 2, cy = c.height / 2, R = Math.min(w, l) * 0.45 * S;
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#000';
      const passo = 5.2 * S;
      for (let y = 0, lin = 0; y < c.height + passo; y += passo * 0.866, lin++) {
        for (let x = (lin % 2) * passo / 2; x < c.width + passo; x += passo) {
          const d = Math.hypot(x - cx, y - cy);
          if (d > R - 2 * S || d < R * 0.22) continue;
          const t = passo * 0.38, inv = lin % 2 ? -1 : 1;
          g.beginPath(); g.moveTo(x, y - t * inv); g.lineTo(x + t * 0.87, y + t * 0.5 * inv); g.lineTo(x - t * 0.87, y + t * 0.5 * inv); g.closePath(); g.fill();
        }
      }
      return tex(c, { cor: false });
    });
  }

  return {
    escovadoRepetivel, placaMaeTopo, placaMaeIO, memoriaLado, adesivoFan, gpuBackplate, gpuSuporte, gpuDedos, dedosDIMM,
    grao, painelPerfurado, gradeQuadrada, aorusEspelho, aorusTanque, aletasRadiador, trancado, memoriaEtiqueta,
    corsairGrade, corsairGradeAlfa, corsairLateral, corsairEspecificacao, corsairModular, CORSAIR_MODULAR, tamSoquete
  };
};
