/*
 * Física de corpos rígidos (cannon-es) da montagem.
 * Cada peça vira um corpo com a massa do catálogo e as MESMAS caixas de
 * colisão usadas na checagem. Peças montadas ficam presas ao gabinete
 * (cinemáticas: acompanham o gabinete e empurram o que estiver solto);
 * peças soltas caem, batem umas nas outras, deslizam e tombam.
 * A cena usa mm; a física usa metros, kg e segundos (g = 9,81 m/s²).
 */
window.PCBFisica = function (THREE, CANNON) {
  'use strict';

  const MM = 0.001;
  const AMORT = { lin: 0.12, ang: 0.35 };
  const MASSA_MIN = 0.15;
  const PASSO = 1 / 240;
  const DINAMICO = CANNON.Body.DYNAMIC, CINEMATICO = CANNON.Body.KINEMATIC, ESTATICO = CANNON.Body.STATIC;
  const paraM = (v) => new CANNON.Vec3(v.x * MM, v.y * MM, v.z * MM);
  const paraMM = (v, alvo) => (alvo || new THREE.Vector3()).set(v.x / MM, v.y / MM, v.z / MM);

  // peças que viram um corpo só; o resto é uma peça por corpo
  const GRUPO = (p) => (p.grupo === 'aio' ? 'aio' : p.id === 'conectorRiser' ? 'gpu' : p.id);
  // peças do próprio gabinete: sempre presas a ele
  const FIXAS = new Set(['gabinete', 'bandeja', 'caixaFonte', 'fonte']);
  // enfeites sem colisão que dependem de uma peça estar no lugar (mangueiras e riser
  // não entram aqui: viram cordas e se redesenham entre as peças)
  const DEPENDE = { cabos: ['placaMae', 'gpu'] };

  function criar(res, opts) {
    opts = opts || {};
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    world.allowSleep = true;
    world.solver.iterations = 40;
    world.solver.tolerance = 1e-5;
    const mat = world.defaultContactMaterial;
    mat.friction = 0.42;
    mat.restitution = 0.14;
    mat.contactEquationStiffness = 1e7;
    mat.contactEquationRelaxation = 4;
    mat.frictionEquationStiffness = 1e7;

    // pares que começam encaixados (pente no slot, bomba no soquete…) não
    // colidem até se separarem de verdade
    const ignorar = new Set();
    const chave = (a, b) => (a.id < b.id ? a.id + '|' + b.id : b.id + '|' + a.id);
    const bp = world.broadphase;
    const baseBp = bp.needBroadphaseCollision.bind(bp);
    // só interessa contato em que ao menos uma das peças está solta
    bp.needBroadphaseCollision = (a, b) => (a.type === DINAMICO || b.type === DINAMICO) && baseBp(a, b) && !ignorar.has(chave(a, b));

    /* batidas: velocidade de aproximação no primeiro instante do contato
       (evento do cannon antes do solver, então é a velocidade do impacto) */
    const batidas = [];
    let maiorImpacto = null;
    const pImp = new CANNON.Vec3();
    function aoColidir(e) {
      const eq = e.contact;
      if (!eq || e.target !== eq.bi) return; // o evento chega nos dois corpos
      const A = porBody.get(eq.bi), B = porBody.get(eq.bj);
      if ((!A || !A.solto) && (!B || !B.solto)) return;
      const v = Math.abs(eq.getImpactVelocityAlongNormal());
      if (!(v > 0.04)) return;
      eq.bi.position.vadd(eq.ri, pImp);
      const nomeA = A ? A.nome : 'Chão', nomeB = B ? B.nome : 'Chão';
      if (batidas.length < 40) batidas.push({ pos: paraMM(pImp), v, idade: 0 });
      if (!maiorImpacto || v > maiorImpacto.impacto) maiorImpacto = { impacto: v, a: nomeA, b: nomeB };
    }

    const inv = new THREE.Matrix4();
    const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(1, 1, 1);
    const corpos = [];
    const porBody = new Map();
    const idDe = (parteId) => { const p = res.partes.find((x) => x.id === parteId); return p ? GRUPO(p) : parteId; };

    /* ---------- corpo a partir de caixas no mundo (mm) ---------- */
    function montarCorpo(id, nome, caixas, objs, massaG, fixo, cgMundo) {
      if (!caixas.length) return null;
      // centro de massa ~ centróide das caixas pelo volume
      const cm = new THREE.Vector3();
      let vol = 0;
      for (const c of caixas) {
        const s = c.getSize(tmpV);
        const v = Math.max(1, s.x * s.y * s.z);
        cm.addScaledVector(c.getCenter(new THREE.Vector3()), v);
        vol += v;
      }
      cm.multiplyScalar(1 / vol);
      // massa real, com piso de 150 g: peças muito leves (pente de memória) encostadas
      // em peças pesadas fazem o solver iterativo tremer. O peso total usa a massa real.
      const massa = Math.max(MASSA_MIN, (massaG || 30) / 1000);
      const body = new CANNON.Body({ mass: massa, position: paraM(cm) });
      for (const c of caixas) {
        const s = c.getSize(new THREE.Vector3());
        const h = new CANNON.Vec3(Math.max(0.4, s.x / 2) * MM, Math.max(0.4, s.y / 2) * MM, Math.max(0.4, s.z / 2) * MM);
        body.addShape(new CANNON.Box(h), paraM(c.getCenter(new THREE.Vector3()).sub(cm)));
      }
      // amortecimento ~ atrito do ar + perdas nos contatos (sem ele as caixas empilhadas tremem)
      body.linearDamping = AMORT.lin;
      body.angularDamping = AMORT.ang;
      body.sleepSpeedLimit = 0.05;
      body.sleepTimeLimit = 0.4;
      body.type = CINEMATICO;
      body.allowSleep = false;
      body.updateMassProperties();
      world.addBody(body);
      const T0inv = new THREE.Matrix4().makeTranslation(-cm.x, -cm.y, -cm.z);
      const visuais = objs.filter((o) => o && o.parent).map((o) => {
        o.updateMatrixWorld(true);
        const pai = o.parent;
        return {
          obj: o, pai,
          K: T0inv.clone().multiply(o.matrixWorld),
          orig: { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() }
        };
      });
      body.addEventListener('collide', aoColidir);
      const c = {
        id, nome, body, massa, massaG: massaG || 0, fixo: !!fixo, solto: false, visuais, caixas,
        inicio: { p: body.position.clone(), q: body.quaternion.clone() },
        cgLocal: cgMundo ? paraM(cgMundo.clone().sub(cm)) : new CANNON.Vec3()
      };
      corpos.push(c);
      porBody.set(body, c);
      return c;
    }

    /* ---------- gabinete: paredes (somem com o painel aberto), bandeja, compartimento da fonte ---------- */
    // paredes de colisão: da face interna para fora, com 30 mm (chapa fina deixa peça
    // rápida atravessar entre dois passos da simulação)
    const I = res.interior, Qd = res.Q;
    const E = 30;
    const O = { x0: I.min.x - E, x1: I.max.x + E, y0: Math.min(0, I.min.y - E), y1: I.max.y + E, z0: I.min.z - E, z1: I.max.z + E };
    const cx = (x0, x1, y0, y1, z0, z1) => new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    const paredes = {
      esquerdo: cx(O.x0, I.min.x, O.y0, O.y1, O.z0, O.z1),
      direito: cx(I.max.x, O.x1, O.y0, O.y1, O.z0, O.z1),
      fundo: cx(O.x0, O.x1, O.y0, I.min.y, O.z0, O.z1),
      topo: cx(O.x0, O.x1, I.max.y, O.y1, O.z0, O.z1),
      traseira: cx(O.x0, O.x1, O.y0, O.y1, O.z0, I.min.z),
      frente: cx(O.x0, O.x1, O.y0, O.y1, I.max.z, O.z1)
    };
    // o fundo leva o gabinete (visual e massa); cada painel é um corpo que some quando o painel abre
    const pGab = res.partes.find((p) => p.id === 'gabinete');
    const NOMES_PAREDE = { esquerdo: 'Vidro lateral', direito: 'Painel direito', topo: 'Teto', traseira: 'Traseira do gabinete', frente: 'Frente do gabinete' };
    const corposParede = {};
    for (const [k, b] of Object.entries(paredes)) {
      corposParede[k] = k === 'fundo'
        ? montarCorpo('gabinete', pGab ? pGab.nome : 'Gabinete', [b], [pGab && pGab.obj], pGab && pGab.massa, true, new THREE.Vector3(0, Qd.H * 0.44, 0))
        : montarCorpo('parede:' + k, NOMES_PAREDE[k] || k, [b], [], 0, true);
    }
    function definirParedes(abertos) {
      const a = new Set(abertos || []);
      for (const [k, c] of Object.entries(corposParede)) {
        if (!c || k === 'fundo') continue;
        c.body.collisionFilterGroup = a.has(k) ? 0 : 1;
      }
      for (const c of corpos) if (c.solto) c.body.wakeUp();
    }
    definirParedes(opts.paineisAbertos);
    const pBand = res.partes.find((p) => p.id === 'bandeja');
    if (pBand && pBand.caixas.length) {
      // bandeja com 4 mm (a chapa de 1,2 mm cresce para o lado dos cabos)
      const bt = pBand.caixas.map((c) => { const b = c.clone(); b.max.x = Math.max(b.max.x, b.min.x + 4); return b; });
      montarCorpo('bandeja', pBand.nome, bt, [], 0, true);
    }
    const pCx = res.partes.find((p) => p.id === 'caixaFonte');
    const pFonte = res.partes.find((p) => p.id === 'fonte');
    if (pCx && pCx.caixas.length) montarCorpo('caixaFonte', 'Fonte no compartimento', pCx.caixas, [pCx.obj, pFonte && pFonte.obj], pFonte && pFonte.massa, true);
    // chão da sala (as peças que caem para fora param nele)
    const chao = new CANNON.Body({ mass: 0, type: ESTATICO });
    chao.addShape(new CANNON.Plane());
    chao.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    chao.addEventListener('collide', aoColidir);
    world.addBody(chao);

    /* ---------- peças ---------- */
    const grupos = new Map();
    for (const p of res.partes) {
      if (FIXAS.has(p.id) || !p.obj || !p.colide || !p.caixas.length) continue;
      if (p.obj.visible === false) continue;
      const g = GRUPO(p);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(p);
    }
    for (const [g, ps] of grupos) {
      const principal = ps.find((p) => p.id === g) || ps[0];
      const nome = g === 'aio' ? 'Radiador com fans' : principal.nome;
      montarCorpo(g, nome, ps.flatMap((p) => p.caixas), ps.map((p) => p.obj), ps.reduce((s, p) => s + (p.massa || 30), 0), false);
    }
    const dependentes = [];
    for (const [id, deps] of Object.entries(DEPENDE)) {
      const p = res.partes.find((x) => x.id === id);
      if (p && p.obj) dependentes.push({ obj: p.obj, deps, visivel: p.obj.visible });
    }

    /* ---------- conexões flexíveis: mangueiras e riser viram cordas ----------
       Cada ponta fica presa na sua peça; se a distância passar do comprimento
       útil, uma mola puxa as duas pontas (a bomba pendura nas mangueiras). */
    const cordas = [];
    const vLoc = (c, v) => c.body.quaternion.conjugate().vmult(paraM(v));
    for (const lig of res.ligacoes || []) {
      const ca = corpos.find((c) => c.id === idDe(lig.partes[0])), cb = corpos.find((c) => c.id === idDe(lig.partes[1]));
      if (!ca || !cb || !lig.obj) continue;
      const pa = new CANNON.Vec3(), pb = new CANNON.Vec3();
      ca.body.pointToLocalFrame(paraM(lig.a.pos), pa);
      cb.body.pointToLocalFrame(paraM(lig.b.pos), pb);
      const d0 = lig.a.pos.distanceTo(lig.b.pos);
      cordas.push({
        lig, ca, cb, pa, pb,
        da: vLoc(ca, lig.a.dir), db: vLoc(cb, lig.b.dir),
        la: lig.largura ? vLoc(ca, lig.largura) : null, lb: lig.largura ? vLoc(cb, lig.largura) : null,
        // comprimento útil: a corda estica até ~90% do comprimento (o resto vai nas curvas das pontas)
        max: Math.max(d0 + 5, (lig.comprimento || d0 * 1.4) * 0.9) * MM,
        chave: ''
      });
    }
    const wA = new CANNON.Vec3(), wB = new CANNON.Vec3(), dAB = new CANNON.Vec3(), rA = new CANNON.Vec3(), rB = new CANNON.Vec3();
    const vPA = new CANNON.Vec3(), vPB = new CANNON.Vec3(), forca = new CANNON.Vec3();
    function puxarCordas() {
      for (const k of cordas) {
        const A = k.ca.body, B = k.cb.body;
        if (A.type !== DINAMICO && B.type !== DINAMICO) continue;
        A.pointToWorldFrame(k.pa, wA);
        B.pointToWorldFrame(k.pb, wB);
        wB.vsub(wA, dAB);
        const d = dAB.length();
        if (d <= k.max || d < 1e-6) continue;
        dAB.scale(1 / d, dAB);
        wA.vsub(A.position, rA);
        wB.vsub(B.position, rB);
        A.angularVelocity.cross(rA, vPA); vPA.vadd(A.velocity, vPA);
        B.angularVelocity.cross(rB, vPB); vPB.vadd(B.velocity, vPB);
        vPB.vsub(vPA, vPB);
        const vRel = vPB.dot(dAB);
        // mola rígida + amortecedor (N): a mangueira não estica, só dobra
        const f = Math.max(0, 2500 * (d - k.max) + 40 * vRel);
        dAB.scale(f, forca);
        if (A.type === DINAMICO) A.applyForce(forca, rA);
        forca.negate(forca);
        if (B.type === DINAMICO) B.applyForce(forca, rB);
      }
    }
    const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tDa = new THREE.Vector3(), tDb = new THREE.Vector3();
    const tLa = new THREE.Vector3(), tLb = new THREE.Vector3(), vTmp = new CANNON.Vec3();
    function redesenharCordas() {
      for (const k of cordas) {
        const A = k.ca.body, B = k.cb.body;
        const ch = [A.position, A.quaternion, B.position, B.quaternion].map((v) => [v.x, v.y, v.z, v.w || 0].map((n) => n.toFixed(5)).join(',')).join('|');
        if (ch === k.chave) continue;
        const primeira = !k.chave;
        k.chave = ch;
        if (primeira && !k.ca.solto && !k.cb.solto) continue; // montado: mantém o traçado original
        paraMM(A.pointToWorldFrame(k.pa, wA), tA);
        paraMM(B.pointToWorldFrame(k.pb, wB), tB);
        A.quaternion.vmult(k.da, vTmp); tDa.set(vTmp.x, vTmp.y, vTmp.z);
        B.quaternion.vmult(k.db, vTmp); tDb.set(vTmp.x, vTmp.y, vTmp.z);
        if (k.la) { A.quaternion.vmult(k.la, vTmp); tLa.set(vTmp.x, vTmp.y, vTmp.z).normalize(); B.quaternion.vmult(k.lb, vTmp); tLb.set(vTmp.x, vTmp.y, vTmp.z).normalize(); }
        const folga = Math.max(0, k.max / MM - tA.distanceTo(tB));
        try { k.lig.refazer(tA, tDa, tB, tDb, folga, tLa, tLb); } catch (e) { /* segue sem redesenhar */ }
      }
    }

    /* ---------- pares que começam encostados ---------- */
    const sobrepoe = (a, b, m) => a.min.x < b.max.x - m && b.min.x < a.max.x - m && a.min.y < b.max.y - m && b.min.y < a.max.y - m && a.min.z < b.max.z - m && b.min.z < a.max.z - m;
    for (let i = 0; i < corpos.length; i++) {
      for (let j = i + 1; j < corpos.length; j++) {
        const a = corpos[i], b = corpos[j];
        if (a.fixo && b.fixo) continue;
        if (a.caixas.some((ca) => b.caixas.some((cb) => sobrepoe(ca, cb, 0.3)))) ignorar.add(chave(a.body, b.body));
      }
    }
    // confere com as caixas atuais (giradas) se o par já se separou
    const aabbA = new CANNON.AABB(), aabbB = new CANNON.AABB();
    const pw = new CANNON.Vec3(), qw = new CANNON.Quaternion();
    function aabbsDe(body) {
      const out = [];
      for (let i = 0; i < body.shapes.length; i++) {
        body.quaternion.vmult(body.shapeOffsets[i], pw).vadd(body.position, pw);
        body.quaternion.mult(body.shapeOrientations[i], qw);
        const bb = new CANNON.AABB();
        body.shapes[i].calculateWorldAABB(pw, qw, bb.lowerBound, bb.upperBound);
        out.push(bb);
      }
      return out;
    }
    function revisarIgnorados() {
      if (!ignorar.size) return;
      const cache = new Map();
      const de = (b) => { if (!cache.has(b)) cache.set(b, aabbsDe(b)); return cache.get(b); };
      for (const k of Array.from(ignorar)) {
        const [ia, ib] = k.split('|').map(Number);
        const a = world.bodies.find((b) => b.id === ia), b = world.bodies.find((x) => x.id === ib);
        if (!a || !b) { ignorar.delete(k); continue; }
        if (a.type !== DINAMICO && b.type !== DINAMICO) continue;
        const la = de(a), lb = de(b);
        let toca = false;
        for (const x of la) { for (const y of lb) { aabbA.copy(x); aabbB.copy(y); if (aabbA.overlaps(aabbB)) { toca = true; break; } } if (toca) break; }
        if (!toca) ignorar.delete(k);
      }
    }

    /* ---------- soltar / prender ---------- */
    function soltar(c) {
      if (!c || c.fixo || c.solto) return;
      c.solto = true;
      c.body.type = DINAMICO;
      c.body.mass = c.massa;
      c.body.allowSleep = true;
      c.body.updateMassProperties();
      c.body.velocity.copy(movimento.v); // sai com a velocidade que o gabinete tinha
      c.body.wakeUp();
      atualizarDependentes();
    }
    function soltarTudo() { for (const c of corpos) soltar(c); }
    function atualizarDependentes() {
      const soltos = new Set(corpos.filter((c) => c.solto).map((c) => c.id));
      for (const d of dependentes) d.obj.visible = d.visivel && !d.deps.some((id) => soltos.has(id));
    }

    /* ---------- arrastar com o mouse ---------- */
    const junta = new CANNON.Body({ mass: 0, type: ESTATICO });
    junta.collisionFilterGroup = 0;
    junta.collisionFilterMask = 0;
    world.addBody(junta);
    let arrasto = null;
    function pegar(id, pontoMM) {
      const c = corpos.find((x) => x.id === id);
      if (!c || c.fixo) return false;
      soltar(c);
      const p = paraM(pontoMM);
      const local = new CANNON.Vec3();
      c.body.pointToLocalFrame(p, local);
      // segura a meio caminho entre o ponto clicado e o centro de massa: a peça
      // ainda gira ao ser puxada pela ponta, mas sem virar um cata-vento
      local.scale(0.5, local);
      junta.position.copy(p);
      // força máxima ~4× o peso da peça: dá para puxar, mas ela ainda bate e trava nas outras.
      // (o solver do cannon limita IMPULSO por passo: força × dt)
      const r = new CANNON.PointToPointConstraint(c.body, local, junta, new CANNON.Vec3(), (c.massa * 9.81 * 4 + 4) * PASSO);
      world.addConstraint(r);
      c.body.linearDamping = 0.6;
      c.body.angularDamping = 0.95;
      arrasto = { c, r, alvo: p.clone() };
      return true;
    }
    function mover(pontoMM) {
      if (!arrasto) return;
      arrasto.alvo.copy(paraM(pontoMM));
      arrasto.c.body.wakeUp();
    }
    // a "mão" anda até o mouse a no máximo 1,2 m/s (sem trancos que arremessam a peça)
    const dMao = new CANNON.Vec3();
    function moverMao(dt) {
      if (!arrasto) return;
      arrasto.alvo.vsub(junta.position, dMao);
      const d = dMao.length(), max = 1.2 * dt;
      if (d > max) dMao.scale(max / d, dMao);
      junta.position.vadd(dMao, junta.position);
    }
    function largar() {
      if (!arrasto) return;
      world.removeConstraint(arrasto.r);
      arrasto.c.body.linearDamping = AMORT.lin;
      arrasto.c.body.angularDamping = AMORT.ang;
      arrasto.c.body.wakeUp();
      arrasto = null;
    }
    const pontoArrasto = () => (arrasto ? paraMM(arrasto.c.body.pointToWorldFrame(arrasto.r.pivotA)) : null);

    /* ---------- movimento do gabinete: chacoalhar e inclinar ----------
       O gabinete e tudo que está preso a ele se movem juntos (cinemáticos);
       as peças soltas reagem pelos contatos. */
    const movimento = { v: new CANNON.Vec3(), w: new CANNON.Vec3(), tremor: null, angulo: 0, alvo: 0, pivo: new CANNON.Vec3() };
    const apoio = (res.massas && res.massas.apoio) || { x0: -res.Q.W / 2, x1: res.Q.W / 2 };
    function chacoalhar(forca) {
      movimento.tremor = { t: 0, dur: 1.4, amp: 0.009 * (forca || 1), f: 6 };
      for (const c of corpos) if (c.solto) c.body.wakeUp();
    }
    function inclinar(graus) {
      movimento.alvo = THREE.MathUtils.degToRad(Math.max(-60, Math.min(60, graus)));
      for (const c of corpos) if (c.solto) c.body.wakeUp();
    }
    function moverPresos(dt) {
      let vx = 0, vy = 0;
      const tr = movimento.tremor;
      if (tr) {
        tr.t += dt;
        const w = 2 * Math.PI * tr.f, env = Math.sin(Math.PI * Math.min(1, tr.t / tr.dur));
        vx = tr.amp * w * Math.cos(w * tr.t) * env;
        vy = 0.35 * tr.amp * w * Math.cos(2 * w * tr.t + 0.7) * env;
        if (tr.t >= tr.dur) movimento.tremor = null;
      }
      // inclinação: gira em torno da borda de apoio (pés) do lado para onde tomba
      const erro = movimento.alvo - movimento.angulo;
      const om = Math.abs(erro) < 1e-4 ? 0 : Math.max(-0.9, Math.min(0.9, erro * 5));
      movimento.angulo += om * dt;
      // ângulo > 0: topo vai para o vidro (−X), apoio na borda do vidro
      const px = movimento.angulo > 0 || (movimento.angulo === 0 && om > 0) ? apoio.x0 * MM : apoio.x1 * MM;
      movimento.pivo.set(px, 0, 0);
      for (const c of corpos) {
        if (c.solto) continue;
        const b = c.body;
        const dx = b.position.x - px, dy = b.position.y;
        b.velocity.set(-om * dy + vx, om * dx + vy, 0);
        b.angularVelocity.set(0, 0, om);
      }
      movimento.v.set(vx, vy, 0);
      return !!tr || om !== 0;
    }

    /* ---------- passo ---------- */
    let acumulado = 0, nPasso = 0;
    const contatos = [];
    const tmpC = new CANNON.Vec3();
    function passo(dt) {
      acumulado += Math.min(dt, 1 / 20);
      let n = 0;
      let mexeu = false;
      while (acumulado >= PASSO && n < 8) {
        mexeu = moverPresos(PASSO) || mexeu;
        moverMao(PASSO);
        puxarCordas();
        world.step(PASSO);
        acumulado -= PASSO;
        n++;
        if (arrasto) limitar(arrasto.c.body, 2, 5);
        if (++nPasso % 6 === 0) revisarIgnorados();
        coletarContatos();
        for (let i = batidas.length - 1; i >= 0; i--) if ((batidas[i].idade += PASSO) > 0.7) batidas.splice(i, 1);
      }
      acumulado = Math.min(acumulado, PASSO * 2); // PC lento: a simulação fica mais lenta, sem acumular atraso
      sincronizar();
      redesenharCordas();
      return mexeu || corpos.some((c) => c.solto && c.body.sleepState !== CANNON.Body.SLEEPING) || !!arrasto;
    }
    // teto de velocidade (m/s) e rotação (rad/s) da peça na mão
    function limitar(b, vMax, wMax) {
      const v = b.velocity.length(), w = b.angularVelocity.length();
      if (v > vMax) b.velocity.scale(vMax / v, b.velocity);
      if (w > wMax) b.angularVelocity.scale(wMax / w, b.angularVelocity);
    }
    function coletarContatos() {
      contatos.length = 0;
      for (const eq of world.contacts) {
        const A = porBody.get(eq.bi), B = porBody.get(eq.bj);
        const nomeA = A ? A.nome : 'Chão', nomeB = B ? B.nome : 'Chão';
        if ((!A || A.fixo || !A.solto) && (!B || B.fixo || !B.solto)) continue;
        eq.bi.position.vadd(eq.ri, tmpC); // (vadd/vsub com destino não devolvem nada)
        contatos.push({ pos: paraMM(tmpC), a: nomeA, b: nomeB });
      }
    }
    function sincronizar() {
      for (const c of corpos) {
        const b = c.body;
        tmpQ.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
        tmpM.compose(paraMM(b.position, tmpV), tmpQ, tmpS);
        for (const v of c.visuais) {
          inv.copy(v.pai.matrixWorld).invert();
          const m = inv.multiply(tmpM).multiply(v.K);
          m.decompose(v.obj.position, v.obj.quaternion, v.obj.scale);
          v.obj.updateMatrixWorld(true);
        }
      }
    }

    /* ---------- centro de massa atual ---------- */
    function centroDeMassa() {
      const cg = new THREE.Vector3();
      let m = 0;
      for (const c of corpos) {
        if (!(c.massaG > 0)) continue;
        cg.addScaledVector(paraMM(c.body.pointToWorldFrame(c.cgLocal), tmpV), c.massaG);
        m += c.massaG;
      }
      return m > 0 ? cg.multiplyScalar(1 / m) : cg;
    }

    function remontar() {
      largar();
      movimento.tremor = null;
      movimento.angulo = movimento.alvo = 0;
      maiorImpacto = null;
      for (const c of corpos) {
        const b = c.body;
        b.type = CINEMATICO;
        b.allowSleep = false;
        b.updateMassProperties();
        b.position.copy(c.inicio.p);
        b.quaternion.copy(c.inicio.q);
        b.velocity.set(0, 0, 0);
        b.angularVelocity.set(0, 0, 0);
        b.wakeUp();
        c.solto = false;
      }
      sincronizar();
      atualizarDependentes();
    }

    function descartar() {
      largar();
      for (const c of corpos) {
        for (const v of c.visuais) {
          v.obj.position.copy(v.orig.p);
          v.obj.quaternion.copy(v.orig.q);
          v.obj.scale.copy(v.orig.s);
          v.obj.updateMatrixWorld(true);
        }
      }
      for (const d of dependentes) d.obj.visible = d.visivel;
      while (world.bodies.length) world.removeBody(world.bodies[0]);
      corpos.length = 0;
    }

    function estado() {
      const soltos = corpos.filter((c) => c.solto);
      return {
        soltos: soltos.length,
        parados: soltos.filter((c) => c.body.sleepState === CANNON.Body.SLEEPING).length,
        pecas: corpos.filter((c) => !c.fixo).length,
        contatos: contatos.length,
        maiorImpacto,
        angulo: THREE.MathUtils.radToDeg(movimento.angulo),
        cg: centroDeMassa()
      };
    }

    return {
      passo, soltar: (id) => soltar(corpos.find((c) => c.id === idDe(id))), soltarTudo, pegar: (id, p) => pegar(idDe(id), p), mover, largar, pontoArrasto,
      chacoalhar, inclinar, remontar, descartar, estado, contatos, batidas, cordas, arrastando: () => !!arrasto, definirParedes, reaplicarOcultos: atualizarDependentes,
      pode: (parteId) => { const c = corpos.find((x) => x.id === idDe(parteId)); return !!(c && !c.fixo); },
      nomeDe: (parteId) => { const c = corpos.find((x) => x.id === idDe(parteId)); return c ? c.nome : ''; },
      massaDe: (parteId) => { const c = corpos.find((x) => x.id === idDe(parteId)); return c ? c.massaG : 0; },
      arrastado: () => (arrasto ? { nome: arrasto.c.nome, gramas: arrasto.c.massaG, velocidade: arrasto.c.body.velocity.length() } : null),
      corpos
    };
  }

  return { criar };
};
