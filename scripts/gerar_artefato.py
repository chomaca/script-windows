# -*- coding: utf-8 -*-
"""Monta o artefato HTML do registro de triagem."""
import csv, html, json, os, collections

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = list(csv.DictReader(open(os.path.join(BASE, "results/triagem_completa.csv"))))
cont = collections.Counter(r["tier"] for r in rows)

GRUPOS = [
 ("A1", "Desfecho cardiovascular clínico", "Eventos e mortalidade, estratificados pelo início da PE"),
 ("A2", "Aterosclerose e função cardíaca subclínica", "PE precoce <em>vs</em> tardia, após a gestação"),
 ("A3", "Fatores de risco e biomarcadores pós-parto", "PE precoce <em>vs</em> tardia"),
 ("B1", "PE precoce contra controles normotensas", "Sem braço de PE tardia — falta o comparador C"),
 ("B2", "PE tardia contra controles normotensas", "Sem braço de PE precoce — falta a intervenção I"),
 ("B3", "PE precoce <em>vs</em> tardia durante a gestação", "Comparação correta, desfecho intragestacional"),
 ("C",  "Revisões e estudos metodológicos", "Contexto e busca manual de referências"),
 ("D",  "Excluídos", "Sem o par precoce/tardia ou sem desfecho cardiovascular materno"),
]
FAIXA = {"A1": "a", "A2": "a", "A3": "a", "B1": "b", "B2": "b", "B3": "b", "C": "c", "D": "d"}
DESTAQUE = {"26391409", "38563390", "38588914", "25561694"}

def esc(t):
    return html.escape(t or "", quote=True)

dados = [{
    "tier": r["tier"], "faixa": FAIXA[r["tier"]], "pmid": r["pmid"], "doi": r["doi"],
    "ano": r["ano"], "revista": r["revista"], "autor": r["primeiro_autor"],
    "titulo": r["titulo"], "nota": r["nota_triagem"], "url": r["url"],
    "chave": r["pmid"] in DESTAQUE,
} for r in rows]

n_a = cont["A1"] + cont["A2"] + cont["A3"]
n_b = cont["B1"] + cont["B2"] + cont["B3"]
n_ret = n_a + n_b + cont["C"]

CASCATA = [
 ("Estratégia principal", "12.942",
  "PE <span class='op'>AND</span> doença cardiovascular. Ampla demais para triagem manual e sem o eixo precoce/tardio."),
 ("Estratégia complementar", "218",
  "Acrescenta o filtro de início precoce <span class='op'>OR</span> tardio. É a estratégia que corresponde à PICO."),
 ("Retidos na triagem", str(n_ret),
  "218 títulos e 131 resumos lidos. Excluídos os estudos de predição, biologia placentária, profilaxia e desfechos da prole."),
 ("Respondem à PICO", str(n_a),
  "Comparam PE precoce com PE tardia e medem desfecho cardiovascular materno após a gestação."),
]

def bloco_grupo(tier, nome, sub):
    itens = [d for d in dados if d["tier"] == tier]
    out = ['<section class="grupo" data-tier="%s" data-faixa="%s">' % (tier, FAIXA[tier])]
    out.append('<header class="grupo-head">')
    out.append('<span class="tier-chip f-%s">%s</span>' % (FAIXA[tier], tier))
    out.append('<h3>%s</h3>' % nome)
    out.append('<p class="grupo-sub">%s</p>' % sub)
    out.append('<span class="grupo-n">%d</span>' % len(itens))
    out.append('</header>')
    out.append('<ol class="lista">')
    for d in itens:
        cls = "item f-%s%s" % (d["faixa"], " chave" if d["chave"] else "")
        busca = esc((d["titulo"] + " " + d["autor"] + " " + d["revista"] + " " +
                     d["nota"] + " " + d["pmid"]).lower())
        out.append('<li class="%s" data-busca="%s">' % (cls, busca))
        out.append('<div class="item-cit">')
        if d["chave"]:
            out.append('<span class="marca">estudo-chave</span>')
        out.append('<p class="cit"><strong>%s</strong> <span class="ano">%s</span> · <em>%s</em></p>'
                   % (esc(d["autor"]) or "Sem autor", esc(d["ano"]), esc(d["revista"])))
        out.append('<p class="tit">%s</p>' % esc(d["titulo"]))
        out.append('<p class="ids"><a href="%s" target="_blank" rel="noopener">PMID %s</a>%s</p>'
                   % (d["url"], d["pmid"],
                      ' <span class="sep">·</span> <span class="doi">%s</span>' % esc(d["doi"]) if d["doi"] else ""))
        out.append('</div>')
        out.append('<div class="item-nota"><p>%s</p></div>' % esc(d["nota"]))
        out.append('</li>')
    out.append('</ol></section>')
    return "\n".join(out)

cascata_html = "\n".join(
    '<li class="passo"><span class="passo-n">%d</span>'
    '<div class="passo-corpo"><p class="passo-rot">%s</p>'
    '<p class="passo-num">%s</p><p class="passo-txt">%s</p></div></li>' % (i, rot, num, txt)
    for i, (rot, num, txt) in enumerate(CASCATA, 1))

resumo_html = "\n".join(
    '<li class="res-lin f-%s"><span class="res-t">%s</span>'
    '<span class="res-n">%d</span><span class="res-d">%s</span></li>'
    % (FAIXA[t], t, cont[t], sub if False else nome)
    for t, nome, sub in GRUPOS)

HTML = """<title>Pré-eclâmpsia precoce vs tardia</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
:root{
  --paper:#F2F4F2; --surface:#FBFCFB; --surface-2:#EAEEEC;
  --ink:#131A19; --ink-2:#4E5B58; --ink-3:#7C8885;
  --rule:#D6DDDA; --rule-soft:#E4E9E7;
  --t-a:#0B5D57; --t-b:#4E8F88; --t-c:#93B6B1; --t-d:#9AA3A0;
  --signal:#A9761F; --signal-bg:#F6EEDF;
  --serif:"Newsreader",Georgia,"Times New Roman",serif;
  --sans:"IBM Plex Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --col:66ch; --wide:1180px;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){
    --paper:#0E1312; --surface:#151B1A; --surface-2:#1B2322;
    --ink:#E4EAE7; --ink-2:#9FADA9; --ink-3:#788682;
    --rule:#28322F; --rule-soft:#212A28;
    --t-a:#5BBBAF; --t-b:#3E8C84; --t-c:#2C625D; --t-d:#6E7B77;
    --signal:#D9A24E; --signal-bg:#2A2114;
  }
}
:root[data-theme="dark"]{
  --paper:#0E1312; --surface:#151B1A; --surface-2:#1B2322;
  --ink:#E4EAE7; --ink-2:#9FADA9; --ink-3:#788682;
  --rule:#28322F; --rule-soft:#212A28;
  --t-a:#5BBBAF; --t-b:#3E8C84; --t-c:#2C625D; --t-d:#6E7B77;
  --signal:#D9A24E; --signal-bg:#2A2114;
}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:var(--sans);
  font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased}
.wrap{max-width:var(--wide);margin:0 auto;padding:0 28px}
.col{max-width:var(--col)}
h1,h2,h3{font-family:var(--serif);font-weight:500;text-wrap:balance;margin:0}
a{color:inherit}
p{margin:0}

/* ---- cabecalho ---- */
.topo{padding:60px 0 40px;border-bottom:1px solid var(--rule)}
.eyebrow{font-family:var(--mono);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--ink-3);display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.eyebrow .dot{color:var(--rule)}
h1{font-size:clamp(34px,5.2vw,54px);line-height:1.08;letter-spacing:-.015em;margin:18px 0 0;max-width:17ch}
.lead{font-family:var(--serif);font-size:clamp(18px,2.1vw,21px);line-height:1.5;color:var(--ink-2);
  margin-top:20px;max-width:56ch}

/* ---- PICO ---- */
.pico{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--rule);
  border:1px solid var(--rule);margin-top:40px}
.pico div{background:var(--surface);padding:16px 18px}
.pico dt{font-family:var(--mono);font-size:12px;font-weight:600;letter-spacing:.1em;color:var(--t-a)}
.pico dd{margin:6px 0 0;font-size:14.5px;line-height:1.45;color:var(--ink-2)}
@media(max-width:820px){.pico{grid-template-columns:repeat(2,1fr)}}
@media(max-width:480px){.pico{grid-template-columns:1fr}}

/* ---- secoes ---- */
section.bloco{padding:56px 0;border-bottom:1px solid var(--rule)}
.rot{font-family:var(--mono);font-size:11.5px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--ink-3);margin-bottom:14px}
h2{font-size:clamp(23px,2.8vw,30px);line-height:1.18;letter-spacing:-.01em;margin-bottom:16px}
.bloco p+p{margin-top:14px}
.bloco .col p{color:var(--ink-2);font-size:16px}
.bloco .col strong{color:var(--ink);font-weight:600}

/* ---- aviso ---- */
.aviso{border-left:3px solid var(--signal);background:var(--signal-bg);padding:22px 26px;max-width:72ch}
.aviso h2{font-size:21px;margin-bottom:10px}
.aviso p{color:var(--ink-2);font-size:15.5px}
.aviso code{font-family:var(--mono);font-size:13px;background:var(--surface);
  border:1px solid var(--rule);padding:1px 5px}

/* ---- cascata ---- */
.cascata{list-style:none;margin:28px 0 0;padding:0;display:grid;
  grid-template-columns:repeat(4,1fr);gap:1px;background:var(--rule);border:1px solid var(--rule)}
.passo{background:var(--surface);padding:20px;display:flex;gap:14px}
.passo-n{font-family:var(--mono);font-size:11px;font-weight:600;color:var(--ink-3);
  padding-top:5px;flex:none}
.passo-rot{font-size:12.5px;font-weight:600;letter-spacing:.02em;color:var(--ink-2)}
.passo-num{font-family:var(--serif);font-size:38px;line-height:1.05;letter-spacing:-.02em;
  margin:2px 0 8px;font-variant-numeric:tabular-nums}
.passo:last-child .passo-num{color:var(--t-a)}
.passo-txt{font-size:13.5px;line-height:1.5;color:var(--ink-3)}
.op{font-family:var(--mono);font-size:11.5px;color:var(--t-a)}
@media(max-width:900px){.cascata{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.cascata{grid-template-columns:1fr}}

/* ---- resumo de camadas ---- */
.resumo{list-style:none;margin:26px 0 0;padding:0;border-top:1px solid var(--rule)}
.res-lin{display:grid;grid-template-columns:52px 62px 1fr;align-items:baseline;gap:12px;
  padding:11px 0 11px 12px;border-bottom:1px solid var(--rule-soft);position:relative}
.res-lin::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px}
.res-lin.f-a::before{background:var(--t-a)} .res-lin.f-b::before{background:var(--t-b)}
.res-lin.f-c::before{background:var(--t-c)} .res-lin.f-d::before{background:var(--t-d)}
.res-t{font-family:var(--mono);font-size:12.5px;font-weight:600;letter-spacing:.06em}
.res-n{font-family:var(--serif);font-size:22px;font-variant-numeric:tabular-nums;text-align:right}
.res-d{font-size:14.5px;color:var(--ink-2)}
@media(max-width:600px){.res-lin{grid-template-columns:46px 50px 1fr;gap:8px}.res-d{font-size:13.5px}}

/* ---- filtros ---- */
.barra{position:sticky;top:0;z-index:20;background:var(--paper);
  border-bottom:1px solid var(--rule);padding:14px 0;margin-bottom:8px}
.barra-in{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-family:var(--mono);font-size:11.5px;font-weight:600;letter-spacing:.06em;
  border:1px solid var(--rule);background:var(--surface);color:var(--ink-3);
  padding:6px 11px;cursor:pointer;line-height:1}
.chip:hover{border-color:var(--ink-3)}
.chip:focus-visible{outline:2px solid var(--t-a);outline-offset:2px}
.chip[aria-pressed="true"]{color:var(--surface);border-color:transparent}
.chip[aria-pressed="true"].f-a{background:var(--t-a)}
.chip[aria-pressed="true"].f-b{background:var(--t-b)}
.chip[aria-pressed="true"].f-c{background:var(--t-c);color:var(--ink)}
.chip[aria-pressed="true"].f-d{background:var(--t-d)}
.busca{flex:1 1 210px;min-width:170px;font-family:var(--sans);font-size:14px;color:var(--ink);
  background:var(--surface);border:1px solid var(--rule);padding:7px 11px}
.busca:focus-visible{outline:2px solid var(--t-a);outline-offset:1px}
.contagem{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;color:var(--ink-3);
  font-variant-numeric:tabular-nums;white-space:nowrap}

/* ---- registro ---- */
.grupo{margin-top:38px}
.grupo-head{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:baseline;
  padding-bottom:12px;border-bottom:1px solid var(--rule)}
.tier-chip{font-family:var(--mono);font-size:11.5px;font-weight:600;letter-spacing:.07em;
  padding:4px 8px;line-height:1;color:var(--surface);grid-row:1}
.tier-chip.f-a{background:var(--t-a)} .tier-chip.f-b{background:var(--t-b)}
.tier-chip.f-c{background:var(--t-c);color:var(--ink)} .tier-chip.f-d{background:var(--t-d)}
.grupo-head h3{font-size:20px;line-height:1.25}
.grupo-sub{grid-column:2;font-size:13.5px;color:var(--ink-3);margin-top:2px}
.grupo-n{font-family:var(--serif);font-size:20px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.lista{list-style:none;margin:0;padding:0}
.item{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:26px;
  padding:20px 0 20px 16px;border-bottom:1px solid var(--rule-soft);position:relative}
.item::before{content:"";position:absolute;left:0;top:20px;bottom:20px;width:3px}
.item.f-a::before{background:var(--t-a)} .item.f-b::before{background:var(--t-b)}
.item.f-c::before{background:var(--t-c)} .item.f-d::before{background:var(--t-d)}
.marca{display:inline-block;font-family:var(--mono);font-size:10px;font-weight:600;
  letter-spacing:.12em;text-transform:uppercase;color:var(--signal);
  border:1px solid var(--signal);padding:2px 6px;margin-bottom:8px}
.cit{font-size:14px;color:var(--ink-2)}
.cit strong{color:var(--ink);font-weight:600}
.cit .ano{font-family:var(--mono);font-size:13px;font-variant-numeric:tabular-nums}
.tit{font-family:var(--serif);font-size:17.5px;line-height:1.35;margin-top:5px;text-wrap:pretty}
.ids{font-family:var(--mono);font-size:11.5px;color:var(--ink-3);margin-top:8px;word-break:break-all}
.ids a{color:var(--t-a);text-decoration:none;border-bottom:1px solid transparent}
.ids a:hover{border-bottom-color:currentColor}
.ids a:focus-visible{outline:2px solid var(--t-a);outline-offset:2px}
.item-nota p{font-size:14.5px;line-height:1.55;color:var(--ink-2)}
@media(max-width:860px){.item{grid-template-columns:1fr;gap:12px}}
.vazio{padding:44px 0;color:var(--ink-3);font-family:var(--mono);font-size:13px}

/* ---- codigo ---- */
.codigo{background:var(--surface);border:1px solid var(--rule);padding:18px 20px;
  overflow-x:auto;margin-top:14px}
.codigo pre{margin:0;font-family:var(--mono);font-size:13px;line-height:1.7;color:var(--ink-2);
  white-space:pre}
.codigo .k{color:var(--t-a);font-weight:600}
.codigo .n{color:var(--signal)}
.dupla{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:22px}
@media(max-width:900px){.dupla{grid-template-columns:1fr}}
.dupla h3{font-size:16px;font-family:var(--sans);font-weight:600;letter-spacing:.01em}

/* ---- listas de texto ---- */
ul.marcada{margin:16px 0 0;padding-left:0;list-style:none}
ul.marcada li{position:relative;padding-left:20px;margin-top:11px;color:var(--ink-2);font-size:15.5px;
  line-height:1.55}
ul.marcada li::before{content:"";position:absolute;left:0;top:10px;width:7px;height:1px;
  background:var(--t-b)}
ol.numerada{margin:16px 0 0;padding-left:20px;color:var(--ink-2);font-size:15.5px}
ol.numerada li{margin-top:12px;padding-left:6px;line-height:1.55}
ol.numerada li::marker{font-family:var(--mono);font-size:13px;color:var(--ink-3)}

/* ---- arquivos ---- */
.arquivos{width:100%;border-collapse:collapse;margin-top:20px;font-size:14.5px}
.arquivos th,.arquivos td{text-align:left;padding:10px 14px 10px 0;border-bottom:1px solid var(--rule-soft);
  vertical-align:top}
.arquivos th{font-family:var(--mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-3);font-weight:500;border-bottom-color:var(--rule)}
.arquivos td:first-child{font-family:var(--mono);font-size:12.5px;color:var(--t-a);white-space:nowrap}
.arquivos td:last-child{color:var(--ink-2)}
.rolagem{overflow-x:auto}

footer{padding:40px 0 64px;color:var(--ink-3);font-size:13.5px}
footer p+p{margin-top:8px}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>

<div class="wrap">
  <header class="topo">
    <p class="eyebrow"><span>Triagem de literatura</span><span class="dot">/</span>
      <span>PubMed · MEDLINE</span><span class="dot">/</span><span>1 set 2026</span></p>
    <h1>Pré-eclâmpsia precoce <em>vs</em> tardia e risco cardiovascular</h1>
    <p class="lead">218 registros triados contra a PICO do projeto. Treze respondem à pergunta
      diretamente — e apenas dois medem eventos cardiovasculares clínicos.</p>
    <dl class="pico">
      <div><dt>P</dt><dd>Mulheres com pré-eclâmpsia</dd></div>
      <div><dt>I</dt><dd>PE de início precoce <span style="white-space:nowrap">(&lt; 34 semanas)</span></dd></div>
      <div><dt>C</dt><dd>PE de início tardio <span style="white-space:nowrap">(≥ 34 semanas)</span></dd></div>
      <div><dt>O</dt><dd>Risco de eventos cardiovasculares</dd></div>
    </dl>
  </header>

  <section class="bloco">
    <div class="aviso">
      <p class="rot">Base consultada</p>
      <h2>O Embase não foi consultado</h2>
      <p>O <code>embase.com</code> é um serviço por assinatura da Elsevier e está bloqueado pela
        política de rede deste ambiente — o <code>CONNECT</code> é recusado com HTTP 403. Não há
        como executar a busca lá a partir daqui.</p>
      <p>A busca rodou no <strong>PubMed/MEDLINE</strong>, que aceita a sintaxe exatamente como você
        a escreveu (<code>[Mesh]</code>, <code>[Title/Abstract]</code>). Tudo abaixo vem do PubMed.
        As duas estratégias traduzidas para Emtree estão no fim da página, prontas para colar no
        Embase quando você tiver acesso.</p>
    </div>
  </section>

  <section class="bloco">
    <p class="rot">Cascata de triagem</p>
    <h2>De 12.942 registros a 13 estudos</h2>
    <div class="col"><p>Sem filtros de data, idioma ou tipo de publicação. A estratégia complementar
      é a única que traz o eixo precoce <em>vs</em> tardio, então foi ela que passou por triagem
      individual: 218 títulos e 131 resumos lidos.</p></div>
    <ol class="cascata">__CASCATA__</ol>
  </section>

  <section class="bloco">
    <p class="rot">Camadas</p>
    <h2>Como os 218 registros foram separados</h2>
    <div class="col"><p>A intensidade da faixa à esquerda de cada linha indica o peso da evidência
      para esta PICO: a camada <strong>A</strong> compara precoce com tardia e mede desfecho
      cardiovascular materno; a <strong>B</strong> tem só um dos braços ou mede durante a gestação;
      a <strong>C</strong> é contexto e fonte de referências.</p></div>
    <ul class="resumo">__RESUMO__</ul>
  </section>

  <section class="bloco">
    <p class="rot">Registro</p>
    <h2>Os 218 registros, com a nota de triagem</h2>
    <div class="col"><p>Os excluídos começam ocultos — ligue a camada <strong>D</strong> para
      conferi-los. A busca varre autor, revista, título e nota.</p></div>

    <div class="barra">
      <div class="barra-in">
        <div class="chips" role="group" aria-label="Filtrar por camada">
          <button class="chip f-a" data-faixa="a" aria-pressed="true" type="button">A · direto</button>
          <button class="chip f-b" data-faixa="b" aria-pressed="true" type="button">B · indireto</button>
          <button class="chip f-c" data-faixa="c" aria-pressed="true" type="button">C · contexto</button>
          <button class="chip f-d" data-faixa="d" aria-pressed="false" type="button">D · excluídos</button>
        </div>
        <input class="busca" id="busca" type="search" placeholder="Buscar autor, revista, título…"
          aria-label="Buscar no registro" autocomplete="off">
        <span class="contagem" id="contagem"></span>
      </div>
    </div>

    <div id="registro">__REGISTRO__</div>
    <p class="vazio" id="vazio" hidden>Nenhum registro corresponde a esse filtro.</p>
  </section>

  <section class="bloco">
    <p class="rot">Para rodar no Embase</p>
    <h2>As duas estratégias em sintaxe Emtree</h2>
    <div class="col"><p>Equivalências aplicadas: <code style="font-family:var(--mono);font-size:13px">[Mesh]</code>
      vira <code style="font-family:var(--mono);font-size:13px">/exp</code> — termo Emtree com explosão —
      e <code style="font-family:var(--mono);font-size:13px">[Title/Abstract]</code> vira
      <code style="font-family:var(--mono);font-size:13px">:ti,ab</code>. Acrescente
      <code style="font-family:var(--mono);font-size:13px">,kw</code> se quiser incluir as
      palavras-chave do autor: ganha sensibilidade e volume.</p></div>
    <div class="dupla">
      <div>
        <h3>Principal</h3>
        <div class="codigo"><pre><span class="n">#1</span>  'preeclampsia'/exp <span class="k">OR</span> preeclampsia:ti,ab
    <span class="k">OR</span> 'pre-eclampsia':ti,ab

<span class="n">#2</span>  'cardiovascular disease'/exp
    <span class="k">OR</span> 'cardiovascular disease':ti,ab
    <span class="k">OR</span> 'cardiovascular diseases':ti,ab
    <span class="k">OR</span> 'cardiovascular risk':ti,ab
    <span class="k">OR</span> 'cardiovascular event':ti,ab
    <span class="k">OR</span> 'cardiovascular events':ti,ab
    <span class="k">OR</span> 'cardiovascular morbidity':ti,ab
    <span class="k">OR</span> 'cardiovascular mortality':ti,ab

<span class="n">#3</span>  #1 <span class="k">AND</span> #2</pre></div>
      </div>
      <div>
        <h3>Complementar</h3>
        <div class="codigo"><pre><span class="n">#4</span>  'early onset preeclampsia':ti,ab
    <span class="k">OR</span> 'early-onset preeclampsia':ti,ab
    <span class="k">OR</span> 'late onset preeclampsia':ti,ab
    <span class="k">OR</span> 'late-onset preeclampsia':ti,ab

<span class="n">#5</span>  #1 <span class="k">AND</span> #4 <span class="k">AND</span> #2</pre></div>
        <ul class="marcada">
          <li>O Embase indexa resumos de congresso, que o MEDLINE em geral não indexa. Espere
            rendimento maior e mais duplicatas; para separá-los, use
            <code style="font-family:var(--mono);font-size:12.5px">#5 AND 'conference abstract'/it</code>.</li>
          <li>O Emtree tem <code style="font-family:var(--mono);font-size:12.5px">'maternal hypertension'/exp</code>
            como termo vizinho — vale conferir na árvore se o protocolo pedir sensibilidade máxima.</li>
          <li>Depois de rodar as duas bases, deduplique por DOI e, para os registros sem DOI, por
            título normalizado mais ano.</li>
        </ul>
      </div>
    </div>
  </section>

  <section class="bloco">
    <p class="rot">Leitura</p>
    <h2>O que o conjunto sustenta — e o que não sustenta</h2>
    <div class="col">
      <p>A comparação que a PICO pede, com evento cardiovascular como desfecho, tem apenas dois
        estudos com desfecho clínico duro:</p>
    </div>
    <ul class="marcada" style="max-width:72ch">
      <li><strong>Cirillo 2015 (Circulation)</strong> — 14.062 mulheres, 50 anos de seguimento na
        coorte CHDS. A PE tardia previu morte cardiovascular (HR 2,0; IC 95% 1,2–3,5); a PE precoce
        previu morte cardiovascular <em>prematura</em>, com efeito dependente da idade. É o único
        estudo do conjunto com mortalidade cardiovascular estratificada pelo início.</li>
      <li><strong>Lailler 2024 (JAHA, coorte CONCEPTION)</strong> — 2.819.655 mulheres na França,
        com o tempo de início da doença hipertensiva como exposição explícita contra mortalidade e
        um espectro amplo de desfechos cardiovasculares.</li>
    </ul>
    <div class="col" style="margin-top:22px">
      <p>O restante da camada A mede aterosclerose e disfunção cardíaca subclínicas, não eventos.
        <strong>Hauge 2024</strong> é o mais próximo da pergunta em desenho — 139 PE precoce contra
        772 PE tardia, angio-TC coronariana cerca de 13 anos após o parto. <strong>Veerbeek
        2015</strong> é o maior conjunto de fatores de risco pós-parto com os três braços.</p>
      <p>Duas limitações do conjunto merecem registro no protocolo:</p>
    </div>
    <ol class="numerada" style="max-width:72ch">
      <li><strong>Assimetria dos braços.</strong> A literatura é dominada por coortes de PE precoce
        contra normotensas — 26 estudos na camada B1. O braço de PE tardia costuma estar ausente ou
        ser pequeno, e isso vale até dentro da camada A: Christensen 2017 tem 24 mulheres por braço,
        Yinon 2010 tem 9 no grupo tardio.</li>
      <li><strong>Viés de classificação da exposição.</strong> Bokslag 2020 mostra que a PE precoce
        é recuperada com boa sensibilidade e especificidade por questionário, mas a PE tardia não.
        Estudos que definem a exposição por autorrelato tendem a classificar mal justamente o
        comparador C.</li>
    </ol>
  </section>

  <section class="bloco">
    <p class="rot">Arquivos</p>
    <h2>O que foi gerado no repositório</h2>
    <div class="rolagem">
      <table class="arquivos">
        <thead><tr><th>Arquivo</th><th>Conteúdo</th></tr></thead>
        <tbody>
          <tr><td>results/triagem_completa.csv</td><td>Os 218 registros com camada, decisão e nota de triagem</td></tr>
          <tr><td>results/incluidos_pico.csv</td><td>Apenas os __NRET__ retidos (A + B + C)</td></tr>
          <tr><td>results/referencias.ris</td><td>RIS com resumos e a camada como palavra-chave, para Rayyan, EndNote ou Zotero</td></tr>
          <tr><td>results/classificacao.json</td><td>Mapa PMID para camada e nota</td></tr>
          <tr><td>data/s2_records.jsonl</td><td>Metadados brutos dos 218 registros</td></tr>
          <tr><td>docs/relatorio.md</td><td>Este mesmo conteúdo em Markdown</td></tr>
          <tr><td>scripts/classificar.py</td><td>As regras de classificação, reexecutáveis</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <footer>
    <p>Busca executada no PubMed/MEDLINE em 1 de setembro de 2026, sem filtros de data, idioma ou
      tipo de publicação. Metadados obtidos via PubMed; os DOIs de cada registro estão no CSV e no RIS.</p>
    <p>A triagem foi feita por título e resumo. Antes de fechar a inclusão, confirme cada estudo da
      camada A pelo texto completo — em especial Kalapotharakos 2019 (PMID 31487637), cujo resumo
      não está disponível no PubMed.</p>
  </footer>
</div>

<script>
(function(){
  var faixas = {a:true, b:true, c:true, d:false};
  var termo = "";
  var itens = Array.prototype.slice.call(document.querySelectorAll(".item"));
  var grupos = Array.prototype.slice.call(document.querySelectorAll(".grupo"));
  var contagem = document.getElementById("contagem");
  var vazio = document.getElementById("vazio");

  function aplicar(){
    var visiveis = 0;
    itens.forEach(function(li){
      var f = li.className.indexOf("f-a") > -1 ? "a"
            : li.className.indexOf("f-b") > -1 ? "b"
            : li.className.indexOf("f-c") > -1 ? "c" : "d";
      var ok = faixas[f] && (!termo || li.dataset.busca.indexOf(termo) > -1);
      li.hidden = !ok;
      if (ok) visiveis++;
    });
    grupos.forEach(function(g){
      var algum = Array.prototype.some.call(g.querySelectorAll(".item"), function(li){
        return !li.hidden;
      });
      g.hidden = !algum;
    });
    contagem.textContent = visiveis + " de " + itens.length;
    vazio.hidden = visiveis > 0;
  }

  document.querySelectorAll(".chip").forEach(function(b){
    b.addEventListener("click", function(){
      var f = b.dataset.faixa;
      faixas[f] = !faixas[f];
      b.setAttribute("aria-pressed", faixas[f] ? "true" : "false");
      aplicar();
    });
  });
  document.getElementById("busca").addEventListener("input", function(e){
    termo = e.target.value.trim().toLowerCase();
    aplicar();
  });
  aplicar();
})();
</script>
"""

registro = "\n".join(bloco_grupo(t, n, s) for t, n, s in GRUPOS)
HTML = (HTML.replace("__CASCATA__", cascata_html)
            .replace("__RESUMO__", resumo_html)
            .replace("__REGISTRO__", registro)
            .replace("__NRET__", str(n_ret)))
open(os.path.join(BASE, "docs/triagem.html"), "w").write(HTML)
print("docs/triagem.html", os.path.getsize(os.path.join(BASE, "docs/triagem.html")), "bytes")
