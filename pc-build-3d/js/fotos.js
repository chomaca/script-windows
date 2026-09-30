/*
 * Fotos reais das peças: o usuário envia a foto oficial do produto, enquadra
 * (mover, zoom, girar, espelhar) e ela vira a textura da face certa no 3D.
 * As fotos ficam só neste navegador (IndexedDB), nunca são enviadas.
 */
window.PCBFotos = function () {
  'use strict';

  /* Cada "vaga de foto": onde ela entra no 3D e como enquadrar. */
  const SLOTS = {
    'mb-topo': { rotulo: 'Topo da placa-mãe', dica: 'Foto oficial de cima, reta, com a placa inteira.', forma: 'ret' },
    'gpu-frente': { rotulo: 'Dissipador (lado dos fans)', dica: 'A placa de frente, sem o shroud e sem os fans: aletas e heatpipes.', forma: 'ret' },
    'gpu-borda': { rotulo: 'Borda de cima da placa', dica: 'A borda vista de cima: heatpipes, aletas e o conector de energia.', forma: 'ret' },
    'gpu-backplate': { rotulo: 'Backplate', dica: 'A traseira da placa, reta. Enquadre de ponta a ponta.', forma: 'ret' },
    'fan-cubo': { rotulo: 'Adesivo do cubo do fan', dica: 'Foto do fan de frente: enquadre só o adesivo redondo do meio.', forma: 'circulo' },
    'bomba-topo': { rotulo: 'Topo da bomba', dica: 'A bomba vista de cima (acesa fica ainda melhor).', forma: 'ret' },
    'memoria-lado': { rotulo: 'Lateral do pente', dica: 'O pente de lado, com o logo, de ponta a ponta.', forma: 'ret' },
    'fonte-lado': { rotulo: 'Lateral da fonte', dica: 'A lateral com o nome da fonte.', forma: 'ret' }
  };
  // a foto da placa-mãe usa a chave antiga (só o id do modelo) para manter as fotos já salvas
  const chave = (slot, modelo) => (slot === 'mb-topo' ? modelo : slot + '|' + modelo);

  /* ---------------- armazenamento ---------------- */
  function abrirBanco() {
    return new Promise((ok, erro) => {
      try {
        const req = indexedDB.open('bancada3d', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('fotos');
        req.onsuccess = () => ok(req.result);
        req.onerror = () => erro(req.error);
      } catch (e) { erro(e); }
    });
  }
  async function op(modo, fn) {
    const db = await abrirBanco();
    return new Promise((ok, erro) => {
      const tx = db.transaction('fotos', modo);
      const req = fn(tx.objectStore('fotos'));
      tx.oncomplete = () => ok(req && req.result);
      tx.onerror = () => erro(tx.error);
    });
  }
  // valor guardado: { blob, params } (versões antigas guardavam só o Blob)
  const ler = (k) => op('readonly', (st) => st.get(k)).then((v) => (!v ? null : v instanceof Blob ? { blob: v, params: null } : v)).catch(() => null);
  const gravar = (k, blob, params) => op('readwrite', (st) => st.put({ blob, params }, k)).catch(() => null);
  const apagar = (k) => op('readwrite', (st) => st.delete(k)).catch(() => null);
  const chaves = () => op('readonly', (st) => st.getAllKeys()).then((l) => l || []).catch(() => []);

  function imagem(blob) {
    return new Promise((ok, erro) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('Não consegui abrir essa imagem.')); };
      img.src = url;
    });
  }

  /* ---------------- enquadramento ---------------- */
  // imagem girada/espelhada num canvas
  function orientada(img, p) {
    const rot = ((p && p.rot) || 0) % 360;
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    const troca = rot === 90 || rot === 270;
    c.width = troca ? h : w;
    c.height = troca ? w : h;
    const g = c.getContext('2d');
    g.translate(c.width / 2, c.height / 2);
    g.rotate((rot * Math.PI) / 180);
    if (p && p.espelhar) g.scale(-1, 1);
    g.drawImage(img, -w / 2, -h / 2);
    return c;
  }
  function paramsPadrao(img, prop, rot = 0) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const rw = rot % 180 ? h : w, rh = rot % 180 ? w : h;
    const escala = rw / rh > prop ? (rh * prop) / rw : 1;
    return { cx: 0.5, cy: 0.5, escala, rot, espelhar: false };
  }
  /* Recorta na proporção pedida (largura/altura). params nulo = imagem inteira. */
  function recortar(img, params, prop, maxLado = 1536) {
    const W = Math.round(prop >= 1 ? maxLado : maxLado * prop);
    const H = Math.round(prop >= 1 ? maxLado / prop : maxLado);
    const c = document.createElement('canvas');
    c.width = Math.max(8, W);
    c.height = Math.max(8, H);
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (!params) { g.drawImage(img, 0, 0, c.width, c.height); return c; }
    const o = orientada(img, params);
    const cw = params.escala * o.width, ch = cw / prop;
    g.fillStyle = '#0b0c0e';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(o, params.cx * o.width - cw / 2, params.cy * o.height - ch / 2, cw, ch, 0, 0, c.width, c.height);
    return c;
  }

  /* ---------------- editor (modal) ---------------- */
  let modal = null;
  function montarModal() {
    if (modal) return modal;
    const el = document.createElement('div');
    el.className = 'modal';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'enq-titulo');
    el.innerHTML =
      '<div class="modal-caixa modal-estreito enquadrar">' +
      '<header><h2 id="enq-titulo">Enquadrar a foto</h2><button type="button" class="fechar" data-enq="cancelar" aria-label="Fechar">×</button></header>' +
      '<p class="nota" id="enq-dica"></p>' +
      '<div class="enq-area"><canvas id="enq-canvas" width="640" height="400"></canvas></div>' +
      '<div class="enq-controles">' +
      '<label class="enq-zoom"><span>Zoom</span><input type="range" id="enq-zoom" min="0" max="1" step="0.001"></label>' +
      '<button type="button" class="botao" data-enq="girar">Girar 90°</button>' +
      '<button type="button" class="botao" data-enq="espelhar">Espelhar</button>' +
      '<button type="button" class="botao" data-enq="encaixar">Encaixar</button>' +
      '</div>' +
      '<footer><button type="button" class="botao botao-forte" data-enq="salvar">Usar esta foto</button><button type="button" class="botao" data-enq="cancelar">Cancelar</button>' +
      '<span class="nota">Arraste a foto para posicionar. A foto fica só neste navegador.</span></footer></div>';
    document.body.appendChild(el);
    modal = el;
    return el;
  }

  /*
   * Abre o editor. Retorna uma Promise com os params escolhidos (ou null).
   * opts: { titulo, dica, prop (largura/altura), forma: 'ret'|'circulo', params }
   */
  function editar(img, opts) {
    const el = montarModal();
    const cv = el.querySelector('#enq-canvas');
    const g = cv.getContext('2d');
    const zoom = el.querySelector('#enq-zoom');
    el.querySelector('#enq-titulo').textContent = opts.titulo || 'Enquadrar a foto';
    el.querySelector('#enq-dica').textContent = opts.dica || '';
    const prop = opts.prop || 1;
    let p = Object.assign({}, opts.params || paramsPadrao(img, prop));
    let o = orientada(img, p);
    const escalaMin = 0.04;
    const escalaMax = () => Math.min(1, (o.height * prop) / o.width) * 1.6;
    const zoomDeEscala = (e) => 1 - (Math.log(e) - Math.log(escalaMin)) / (Math.log(escalaMax()) - Math.log(escalaMin));
    const escalaDeZoom = (z) => Math.exp(Math.log(escalaMin) + (1 - z) * (Math.log(escalaMax()) - Math.log(escalaMin)));

    function tamanhoCanvas() {
      const area = el.querySelector('.enq-area');
      const w = Math.max(280, Math.min(900, area.clientWidth || 640));
      const h = Math.round(Math.min(460, Math.max(240, w * 0.62)));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr; cv.height = h * dpr;
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { w, h };
    }
    let dim = { w: 640, h: 400 };
    function janela() {
      const jw = Math.min(dim.w * 0.86, dim.h * 0.8 * prop);
      return { w: jw, h: jw / prop, x: (dim.w - jw) / 2, y: (dim.h - jw / prop) / 2 };
    }
    function desenhar() {
      const J = janela();
      const cw = p.escala * o.width;
      const s = J.w / cw;
      g.fillStyle = '#0d0f12';
      g.fillRect(0, 0, dim.w, dim.h);
      const ix = J.x + J.w / 2 - p.cx * o.width * s, iy = J.y + J.h / 2 - p.cy * o.height * s;
      g.imageSmoothingQuality = 'high';
      g.drawImage(o, ix, iy, o.width * s, o.height * s);
      // escurece fora do enquadramento
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.beginPath();
      g.rect(0, 0, dim.w, dim.h);
      if (opts.forma === 'circulo') g.arc(J.x + J.w / 2, J.y + J.h / 2, J.w / 2, 0, Math.PI * 2, true);
      else g.rect(J.x + J.w, J.y, -J.w, J.h);
      g.fill('evenodd');
      g.restore();
      g.strokeStyle = '#f5c332';
      g.lineWidth = 2;
      g.setLineDash([8, 6]);
      g.beginPath();
      if (opts.forma === 'circulo') g.arc(J.x + J.w / 2, J.y + J.h / 2, J.w / 2, 0, Math.PI * 2);
      else g.rect(J.x, J.y, J.w, J.h);
      g.stroke();
      g.setLineDash([]);
    }
    function recomecar() {
      dim = tamanhoCanvas();
      zoom.value = String(Math.max(0, Math.min(1, zoomDeEscala(p.escala))));
      desenhar();
    }

    return new Promise((resolver) => {
      let arrasto = null;
      const aoApertar = (e) => { arrasto = { x: e.clientX, y: e.clientY, cx: p.cx, cy: p.cy }; cv.setPointerCapture(e.pointerId); };
      const aoMover = (e) => {
        if (!arrasto) return;
        const J = janela();
        const s = J.w / (p.escala * o.width);
        p.cx = arrasto.cx - (e.clientX - arrasto.x) / (s * o.width);
        p.cy = arrasto.cy - (e.clientY - arrasto.y) / (s * o.height);
        desenhar();
      };
      const aoSoltar = () => { arrasto = null; };
      const aoRolar = (e) => {
        e.preventDefault();
        p.escala = Math.max(escalaMin, Math.min(escalaMax(), p.escala * Math.exp(e.deltaY * 0.0012)));
        zoom.value = String(zoomDeEscala(p.escala));
        desenhar();
      };
      const aoZoom = () => { p.escala = escalaDeZoom(Number(zoom.value)); desenhar(); };
      const aoClicar = (e) => {
        const b = e.target.closest('[data-enq]');
        if (!b && e.target !== el) return;
        const acao = b ? b.dataset.enq : 'cancelar';
        if (acao === 'girar') { p.rot = ((p.rot || 0) + 90) % 360; o = orientada(img, p); const d = paramsPadrao(img, prop, p.rot); p.escala = d.escala; p.cx = p.cy = 0.5; recomecar(); }
        else if (acao === 'espelhar') { p.espelhar = !p.espelhar; o = orientada(img, p); p.cx = 1 - p.cx; desenhar(); }
        else if (acao === 'encaixar') { const d = paramsPadrao(img, prop, p.rot || 0); Object.assign(p, { cx: d.cx, cy: d.cy, escala: d.escala }); recomecar(); }
        else if (acao === 'salvar') fim(p);
        else if (acao === 'cancelar') fim(null);
      };
      const aoTecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); fim(null); } if (e.key === 'Enter') fim(p); };
      function fim(res) {
        el.hidden = true;
        cv.removeEventListener('pointerdown', aoApertar);
        cv.removeEventListener('pointermove', aoMover);
        cv.removeEventListener('pointerup', aoSoltar);
        cv.removeEventListener('wheel', aoRolar);
        zoom.removeEventListener('input', aoZoom);
        el.removeEventListener('click', aoClicar);
        document.removeEventListener('keydown', aoTecla, true);
        resolver(res ? Object.assign({}, res) : null);
      }
      cv.addEventListener('pointerdown', aoApertar);
      cv.addEventListener('pointermove', aoMover);
      cv.addEventListener('pointerup', aoSoltar);
      cv.addEventListener('wheel', aoRolar, { passive: false });
      zoom.addEventListener('input', aoZoom);
      el.addEventListener('click', aoClicar);
      document.addEventListener('keydown', aoTecla, true);
      el.hidden = false;
      requestAnimationFrame(recomecar);
    });
  }

  return { SLOTS, chave, ler, gravar, apagar, chaves, imagem, recortar, paramsPadrao, editar };
};
