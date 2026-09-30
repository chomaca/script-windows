/*
 * Histórico (desfazer/refazer) e montagens salvas com nome.
 * Não depende do 3D; guarda cópias da build em JSON.
 */
window.PCBHistorico = function (opts) {
  'use strict';
  opts = opts || {};

  const LIMITE = opts.limite || 100;
  const CHAVE_SALVAS = opts.chaveSalvas || 'bancada3d.salvas.v1';
  let passado = [], futuro = [];
  let pendente = null;

  const copia = (o) => JSON.stringify(o);

  /* Marca o estado antes de uma mudança (vários eventos de um slider
     viram um passo só: o primeiro "iniciar" vale até o "concluir").  */
  function iniciar(build) {
    if (pendente == null) pendente = copia(build);
  }
  function concluir(build, rotulo) {
    if (pendente == null) return false;
    const antes = pendente;
    pendente = null;
    if (antes === copia(build)) return false;
    passado.push({ estado: antes, rotulo: rotulo || 'Alteração' });
    if (passado.length > LIMITE) passado.shift();
    futuro = [];
    return true;
  }
  function cancelar() { pendente = null; }

  function desfazer(build) {
    const e = passado.pop();
    if (!e) return null;
    futuro.push({ estado: copia(build), rotulo: e.rotulo });
    return { build: JSON.parse(e.estado), rotulo: e.rotulo };
  }
  function refazer(build) {
    const e = futuro.pop();
    if (!e) return null;
    passado.push({ estado: copia(build), rotulo: e.rotulo });
    return { build: JSON.parse(e.estado), rotulo: e.rotulo };
  }
  const podeDesfazer = () => passado.length > 0;
  const podeRefazer = () => futuro.length > 0;
  const proximoDesfazer = () => (passado.length ? passado[passado.length - 1].rotulo : null);
  const proximoRefazer = () => (futuro.length ? futuro[futuro.length - 1].rotulo : null);
  function limpar() { passado = []; futuro = []; pendente = null; }

  /* ---------------- montagens salvas ---------------- */
  function lerSalvas() {
    try {
      const t = localStorage.getItem(CHAVE_SALVAS);
      const l = t ? JSON.parse(t) : [];
      return Array.isArray(l) ? l.filter((x) => x && x.id && x.build) : [];
    } catch (e) { return []; }
  }
  function gravarSalvas(lista) {
    try { localStorage.setItem(CHAVE_SALVAS, JSON.stringify(lista)); return true; } catch (e) { return false; }
  }
  function salvarComo(nome, build, miniatura, aparencia) {
    const lista = lerSalvas();
    const item = { id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome: String(nome || 'Minha montagem').slice(0, 60), data: Date.now(), build: JSON.parse(copia(build)), aparencia: aparencia || null, miniatura: miniatura || null };
    lista.unshift(item);
    let ok = gravarSalvas(lista);
    // sem espaço: tenta de novo sem as miniaturas mais antigas
    for (let i = lista.length - 1; !ok && i >= 0; i--) { if (lista[i].miniatura) { lista[i].miniatura = null; ok = gravarSalvas(lista); } }
    return ok ? item : null;
  }
  function atualizar(id, build, miniatura, aparencia) {
    const lista = lerSalvas();
    const it = lista.find((x) => x.id === id);
    if (!it) return false;
    it.build = JSON.parse(copia(build));
    if (aparencia) it.aparencia = aparencia;
    it.data = Date.now();
    if (miniatura) it.miniatura = miniatura;
    return gravarSalvas(lista);
  }
  function renomear(id, nome) {
    const lista = lerSalvas();
    const it = lista.find((x) => x.id === id);
    if (!it) return false;
    it.nome = String(nome || it.nome).slice(0, 60);
    return gravarSalvas(lista);
  }
  function apagar(id) {
    return gravarSalvas(lerSalvas().filter((x) => x.id !== id));
  }

  return {
    iniciar, concluir, cancelar, desfazer, refazer, podeDesfazer, podeRefazer, proximoDesfazer, proximoRefazer, limpar,
    lerSalvas, salvarComo, atualizar, renomear, apagar
  };
};
