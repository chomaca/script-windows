# -*- coding: utf-8 -*-
"""Gera docs/relatorio.md a partir da classificacao."""
import csv, os, collections

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rows = list(csv.DictReader(open(os.path.join(BASE, "results/triagem_completa.csv"))))
by_tier = collections.defaultdict(list)
for r in rows:
    by_tier[r["tier"]].append(r)

TITULOS = {
 "A1": "A1 — Desfecho cardiovascular clínico (eventos / mortalidade) estratificado pelo início da PE",
 "A2": "A2 — Aterosclerose e estrutura/função cardiovascular subclínica, PE precoce *vs* tardia",
 "A3": "A3 — Fatores de risco cardiovascular e biomarcadores pós-parto, PE precoce *vs* tardia",
 "B1": "B1 — PE precoce (I) *vs* controles normotensas, desfecho cardiovascular pós-parto",
 "B2": "B2 — PE tardia (C) *vs* controles normotensas, desfecho cardiovascular pós-parto",
 "B3": "B3 — PE precoce *vs* tardia, função/estrutura cardiovascular **durante** a gestação",
 "C":  "C — Revisões, revisões sistemáticas e estudos metodológicos",
}

def cite(r):
    au = r["primeiro_autor"] or "s/ autor"
    return "**%s et al., %s** — *%s*. %s" % (au, r["ano"], r["revista"], r["titulo"].rstrip("."))

out = []
w = out.append
w("# Pré-eclâmpsia de início precoce *vs* tardio e risco cardiovascular")
w("")
w("Triagem de literatura para a pergunta PICO do projeto.")
w("")
w("| | |")
w("|---|---|")
w("| **P** | Mulheres com pré-eclâmpsia |")
w("| **I** | Pré-eclâmpsia de início precoce (EOPE, < 34 semanas) |")
w("| **C** | Pré-eclâmpsia de início tardio (LOPE, ≥ 34 semanas) |")
w("| **O** | Risco de eventos cardiovasculares |")
w("")
w("---")
w("")
w("## 1. Base consultada — leia antes de usar")
w("")
w("**O Embase não foi consultado.** O `embase.com` é um serviço por assinatura da Elsevier e "
  "está bloqueado pela política de rede deste ambiente (`CONNECT` recusado com HTTP 403). "
  "Não há como executar a busca lá a partir daqui.")
w("")
w("A busca foi executada no **PubMed/MEDLINE**, que aceita a sintaxe exatamente como você a escreveu "
  "(`[Mesh]`, `[Title/Abstract]`). Os resultados abaixo são de PubMed. A Seção 5 traz as duas "
  "estratégias traduzidas para a sintaxe do Embase (Emtree), prontas para colar lá quando você tiver acesso.")
w("")
w("Data da busca: **1 de setembro de 2026**. Sem filtros de data, idioma ou tipo de publicação.")
w("")
w("## 2. Rendimento das estratégias")
w("")
w("| Estratégia | Registros no PubMed |")
w("|---|---:|")
w("| **Principal** — PE `AND` doença cardiovascular | **12.942** |")
w("| **Complementar** — PE `AND` (início precoce `OR` tardio) `AND` doença cardiovascular | **218** |")
w("")
w("A estratégia complementar é a que corresponde à PICO: é a única que traz o eixo I *vs* C "
  "(início precoce *vs* tardio). Os 218 registros foram triados individualmente — 218 títulos e "
  "131 resumos lidos. A estratégia principal, com quase 13 mil registros, é ampla demais para "
  "triagem manual e não discrimina o subtipo de início; ela serve como rede de segurança para a "
  "busca sensível do protocolo, não como fonte de triagem.")
w("")
w("> Você colou o bloco de busca duplicado na mensagem. Tratei como duas estratégias distintas "
  "(principal e complementar), que é o que o texto descreve.")
w("")
w("## 3. Resultado da triagem")
w("")
w("| Camada | n | Uso |")
w("|---|---:|---|")
for t in ["A1", "A2", "A3"]:
    w("| %s | %d | Inclusão prioritária |" % (t, len(by_tier[t])))
for t in ["B1", "B2", "B3"]:
    w("| %s | %d | Evidência indireta |" % (t, len(by_tier[t])))
w("| C | %d | Contexto e busca manual de referências |" % len(by_tier["C"]))
w("| D | %d | Excluídos |" % len(by_tier["D"]))
w("| **Retidos (A+B+C)** | **%d** | |" % sum(len(by_tier[t]) for t in ["A1","A2","A3","B1","B2","B3","C"]))
w("")
w("Critério de exclusão aplicado à camada D: ausência de comparação entre PE precoce e tardia "
  "**ou** ausência de desfecho cardiovascular materno após a gestação. Isso remove os estudos de "
  "predição/diagnóstico de PE, biologia placentária, genética e epigenética, profilaxia com "
  "aspirina, manejo intraparto e desfechos da prole.")
w("")
w("## 4. Estudos por camada")
w("")
for t in ["A1", "A2", "A3", "B1", "B2", "B3", "C"]:
    w("### " + TITULOS[t])
    w("")
    for r in by_tier[t]:
        w("- %s" % cite(r))
        w("  PMID [%s](%s)%s" % (r["pmid"], r["url"],
                                 " · doi:" + r["doi"] if r["doi"] else ""))
        w("  %s" % r["nota_triagem"])
        w("")

w("## 5. Estratégias traduzidas para o Embase (Emtree)")
w("")
w("Equivalências aplicadas: `[Mesh]` → `/exp` (termo Emtree com explosão); "
  "`[Title/Abstract]` → `:ti,ab`. Acrescente `,kw` se quiser incluir palavras-chave do autor "
  "(aumenta a sensibilidade e o volume).")
w("")
w("**Principal**")
w("")
w("```")
w("#1  'preeclampsia'/exp OR preeclampsia:ti,ab OR 'pre-eclampsia':ti,ab")
w("#2  'cardiovascular disease'/exp")
w("      OR 'cardiovascular disease':ti,ab OR 'cardiovascular diseases':ti,ab")
w("      OR 'cardiovascular risk':ti,ab")
w("      OR 'cardiovascular event':ti,ab OR 'cardiovascular events':ti,ab")
w("      OR 'cardiovascular morbidity':ti,ab OR 'cardiovascular mortality':ti,ab")
w("#3  #1 AND #2")
w("```")
w("")
w("**Complementar**")
w("")
w("```")
w("#4  'early onset preeclampsia':ti,ab OR 'early-onset preeclampsia':ti,ab")
w("      OR 'late onset preeclampsia':ti,ab OR 'late-onset preeclampsia':ti,ab")
w("#5  #1 AND #4 AND #2")
w("```")
w("")
w("Notas de execução no Embase:")
w("")
w("- O Embase indexa resumos de congresso, que o MEDLINE em geral não indexa. Espere um "
  "rendimento maior e mais duplicatas. Para separá-los: `#5 AND 'conference abstract'/it`.")
w("- O Emtree tem `'maternal hypertension'/exp` e `'eclampsia and preeclampsia'` como termos "
  "vizinhos; vale verificar na árvore se o protocolo pede sensibilidade máxima.")
w("- Depois de rodar as duas bases, deduplique por DOI e, para os registros sem DOI, por "
  "título normalizado + ano.")
w("")
w("## 6. Leitura dos resultados frente à PICO")
w("")
w("A comparação direta que a PICO pede — precoce *vs* tardia, com evento cardiovascular como "
  "desfecho — é sustentada por poucos estudos, e apenas dois com desfecho clínico duro:")
w("")
w("- **Cirillo 2015 (Circulation)** — 14.062 mulheres, 50 anos de seguimento na coorte CHDS. "
  "A PE tardia previu morte cardiovascular (HR 2,0; IC 95% 1,2–3,5); a PE precoce previu morte "
  "cardiovascular **prematura**, com efeito dependente da idade. É o único estudo do conjunto "
  "com mortalidade cardiovascular estratificada por início.")
w("- **Lailler 2024 (JAHA, coorte CONCEPTION)** — 2.819.655 mulheres na França, com o tempo de "
  "início da doença hipertensiva como exposição explícita contra mortalidade e um espectro amplo "
  "de desfechos cardiovasculares.")
w("")
w("O restante da camada A mede aterosclerose e disfunção cardíaca subclínicas, não eventos. "
  "**Hauge 2024** é o estudo mais próximo da pergunta em desenho (139 PE precoce *vs* 772 PE "
  "tardia, angio-TC coronariana ~13 anos após o parto). **Veerbeek 2015** é o maior conjunto de "
  "fatores de risco pós-parto com os três braços (448 / 76 / 224).")
w("")
w("Duas limitações do conjunto que valem registro no protocolo:")
w("")
w("1. **Assimetria dos braços.** A literatura é dominada por coortes de PE precoce *vs* "
  "normotensas (camada B1, 26 estudos) — o braço de PE tardia costuma estar ausente ou ser "
  "pequeno. Vários estudos da camada A também têm o grupo tardio sub-representado "
  "(Christensen 2017: 24 por braço; Yinon 2010: 9 no grupo tardio).")
w("2. **Viés de classificação da exposição.** Bokslag 2020 (camada C) mostra que a PE precoce é "
  "recuperada com boa sensibilidade e especificidade por questionário, mas a PE tardia não. "
  "Estudos que definem a exposição por autorrelato tendem a classificar mal justamente o "
  "comparador C.")
w("")
w("## 7. Arquivos")
w("")
w("| Arquivo | Conteúdo |")
w("|---|---|")
w("| `results/triagem_completa.csv` | Os 218 registros com camada, decisão e nota de triagem |")
w("| `results/incluidos_pico.csv` | Apenas os 70 retidos (A + B + C) |")
w("| `results/referencias.ris` | RIS com resumos e a camada como palavra-chave, para Rayyan / EndNote / Zotero |")
w("| `results/classificacao.json` | Mapa PMID → camada + nota |")
w("| `data/s2_records.jsonl` | Metadados brutos dos 218 registros (PubMed) |")
w("| `scripts/classificar.py` | Regras de classificação, reexecutáveis |")
w("")

open(os.path.join(BASE, "docs/relatorio.md"), "w").write("\n".join(out) + "\n")
print("docs/relatorio.md:", len(out), "linhas")
