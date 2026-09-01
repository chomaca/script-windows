# -*- coding: utf-8 -*-
"""Classifica os registros da estrategia complementar contra a PICO do projeto.

PICO
  P  mulheres com pre-eclampsia
  I  pre-eclampsia de início precoce (EOPE, < 34 semanas)
  C  pre-eclampsia de início tardio  (LOPE, >= 34 semanas)
  O  risco de eventos cardiovasculares
"""
import csv, json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

TIERS = {
 "A1": ("A1 - Desfecho CV clínico (eventos/mortalidade) estratificado pelo início da PE",
        "Inclusão prioritária"),
 "A2": ("A2 - Aterosclerose e estrutura/função CV subclínica, PE precoce vs tardia",
        "Inclusão prioritária"),
 "A3": ("A3 - Fatores de risco CV e biomarcadores pós-parto, PE precoce vs tardia",
        "Inclusão prioritária"),
 "B1": ("B1 - PE precoce (I) vs controles normotensas, desfecho CV pós-parto",
        "Evidência indireta"),
 "B2": ("B2 - PE tardia (C) vs controles normotensas, desfecho CV pós-parto",
        "Evidência indireta"),
 "B3": ("B3 - PE precoce vs tardia, função/estrutura CV durante a gestação",
        "Evidência indireta"),
 "C":  ("C - Revisões, revisões sistemáticas e estudos metodológicos",
        "Contexto e busca manual de referências"),
 "D":  ("D - Excluído", "Excluído"),
}

# --- A: respondem diretamente a PICO -------------------------------------
A1 = {
 "26391409": "CHDS, 14.062 mulheres, 50 anos de seguimento: PE tardia HR 2,0 (IC 95% 1,2–3,5) para morte CV; PE precoce (≤ 34 sem) prediz morte CV prematura (efeito idade-dependente).",
 "38563390": "Coorte nacional francesa CONCEPTION, 2.819.655 mulheres: avalia explicitamente ocorrência, recorrência, TEMPO DE INÍCIO e gravidade das DHEG contra mortalidade e um amplo espectro de desfechos CV.",
}
A2 = {
 "38588914": "ESTUDO-CHAVE. 911 mulheres com PE prévia (139 precoce vs 772 tardia), angio-TC coronariana ~13 anos após o parto: compara diretamente o risco de aterosclerose coronariana entre precoce e tardia.",
 "28542803": "EOPE (24) vs LOPE (24) vs normotensas (24), pareadas por idade, 12 anos após o parto: placa carotídea, EMI, VOP aórtica e índice de aumento. O grupo precoce teve os piores valores em todos os desfechos.",
 "30527125": "EOPE (31) vs LOPE (22) vs controles (40), mediana de 12 anos: strain longitudinal global do VE significativamente pior na PE precoce do que na tardia e nos controles.",
 "23045462": "EOPE (45) vs LOPE (45) vs normotensas (50), 6–13 anos: PA diastólica pós-parto, incremento de PA e PA noturna maiores na PE precoce. Inclui a prole.",
 "26105355": "Resumo de congresso (PP032) da mesma coorte de Lazdam: fenótipo CV de longo prazo comparando PE precoce, tardia e gestação normal (lipídios, rigidez arterial, EMI, RM cardíaca).",
 "20956209": "EOPE (15) vs LOPE (9) vs RCIU (9) vs normotensas (16), 6–24 meses pós-parto: dilatação fluxo-mediada reduzida apenas na PE precoce e na RCIU.",
}
A3 = {
 "25561694": "ESTUDO-CHAVE. 448 EOPE vs 76 LOPE vs 224 HIG: glicemia, insulina, triglicérides, colesterol total e prevalência de hipertensão pós-parto significativamente maiores após PE precoce.",
 "26105237": "Resumo de congresso (OS023). 81 EOPE vs 76 LOPE vs 229 HIG vs 79 controles: o aumento dos fatores de risco CV foi correlacionado com a gravidade e o tempo de início da doença.",
 "36148698": "417 gestantes (55 EO-PE, 63 LO-PE, 30 HIG, 269 controles) e 341 mulheres 1 ou 3 anos pós-parto: cTnT, NT-proBNP e GDF-15. O GDF-15 permanece elevado após PE precoce.",
 "37481613": "188 mulheres: hipertensão pós-parto persistente ou recorrente mais frequente após PE precoce ou grave do que após PE tardia ou leve (desfecho de curto prazo).",
 "30688668": "120 EOPE vs 126 LOPE: lactação e pressão arterial na consulta pós-parto inicial, comparadas entre os dois subtipos.",
}

# --- B: evidencia indireta ------------------------------------------------
B1 = {
 "40058980": "50 EOPE vs 50 controles pareadas, 3–12 anos após o parto: eventos CV por Kaplan-Meier, aterosclerose subclinica, MAPA 24h, Framingham 10/30 anos. Sem braço de PE tardia.",
 "29894501": "131 EOPE vs 56 normotensas, 9–16 anos: disfunção diastólica pre-clínica do VE na quinta decada de vida (precursora de ICFEP).",
 "28209494": "EOPE vs normotensas, 9–16 anos: prevalência de fatores de risco CV e de doença CV já estabelecida na quinta decada de vida.",
 "32890270": "Coorte PREVFEM, 177 EOPE vs 162 controles, 9–10 anos: troponina I ultrassensível.",
 "22749786": "Coorte PREVFEM, 339 EOPE vs 332 controles, 10 anos: parametros eletrocardiográficos.",
 "29150171": "Coorte PREVFEM, 339 EOPE vs 327 controles, 10 anos: pro-neurotensina e pro-relaxina 2.",
 "31136991": "Coorte PREVFEM, 485 amostras, 8–11 anos após PE precoce: autoanticorpos anti-GPCR e pressão arterial.",
 "30825907": "117 EOPE vs 50 controles, 9–16 anos: creatinoquinase e pressão arterial.",
 "32085575": "90 mulheres 10–20 anos após PE precoce: neutrofilos circulantes e doença arterial coronariana subclinica por angio-TC (escore de cálcio).",
 "23635741": "243 primíparas após PE precoce vs 374 controles: fatores de risco CV maiores e risco absoluto de 10 anos (Framingham).",
 "26711734": "44 mulheres após PE precoce grave vs 29 controles, 1,5–3,5 anos: marcadores inflamatórios e resposta de fase aguda.",
 "25200856": "17 casos vs 16 controles: EMI carotídea e femoral 4–5 anos após PE precoce grave (seguimento do estudo de 2006).",
 "16738162": "22 EOPE vs 22 gestação normal vs 22 nuliparas: EMI femoral aumentada após PE precoce.",
 "15738035": "25 mulheres após PE precoce vs 23 controles, 3–11 meses: reatividade microvascular endotélio-dependente.",
 "21418159": "14 casos vs 16 controles: elasticidade arterial radial reduzida após PE precoce.",
 "22952728": "16 casos vs 18 controles, ~9,5 anos após PE de início muito precoce (<24 sem): fatores angiogênicos.",
 "18571828": "20 mulheres com PE de início muito precoce (<24 sem) e seus parceiros: perfil de risco CV e EMI carotídea.",
 "21880804": "16 mulheres após PE precoce grave vs controles: sistema renina-angiotensina pós-parto sob estresse ortostático.",
 "20551845": "240 mulheres após PE precoce e 456 com SOP: prevalência de síndrome metabólica e elegibilidade para prevencao CV primária.",
 "40673014": "24 puérperas brasileiras: PE precoce com risco 2,36x de hipertensão persistente aos 3 meses pós-parto.",
 "37470772": "1.397 mulheres, 6 meses a 30 anos pós-parto: modelo preditivo de remodelamento cardíaco aberrante que inclui PE precoce como preditor.",
 "20022586": "75 HELLP precoce vs 40 PE precoce sem HELLP, >=6 meses pós-parto: variáveis metabólicas, hemodinâmicas e hemostáticas.",
 "41250989": "FINNPEC (n=1.139) e FinnGen (n=3.603): duração entre diagnóstico de PE e parto associada a DCV composta antes dos 55 anos (HR 1,02/dia). Exposicao e a duração, não o subtipo precoce/tardio.",
 "18574072": "28 mulheres após PE grave vs 20 controles, 5–6 anos: sensibilidade a insulina e vasodilatação.",
 "21606387": "26 pares mae-filho após PE vs 17 controles, 5–8 anos: função endotelial e biomarcadores; avalia especificamente o início precoce.",
 "31487630": "358 mulheres: PE/HIG de início precoce em 28,6% das que precisaram de anti-hipertensivo no pós-parto imediato vs 4,1% das que não precisaram.",
}
B2 = {
 "29677687": "Plasma de mulheres 2,5 anos após PE tardia ou HIG vs normotensas: disfunção da barreira endotelial; IMC elevado como fator determinante. So o braço tardio.",
 "31864208": "6 mulheres com PE tardia grave vs 8 controles: RM cardíaca 1–3 dias, 1 semana e 6 meses pós-parto; alterações revertidas em 6 meses. So o braço tardio, amostra muito pequena.",
}
B3 = {
 "29111423": "50 EOPE vs 50 LOPE: geometria do VE, disfunção diastólica global, contratilidade e resistência vascular total significativamente piores na PE precoce.",
 "26077816": "43 PE precoce vs 41 PE tardia vs 81 normais: strain 3D (GLS, GCS, GAS, GRS) e massa do VE piores na PE precoce.",
 "23911383": "50 PE precoce vs 50 PE tardia vs 100 controles no momento do diagnóstico: EMI carotídea, distensibilidade e colapsabilidade da veia cava inferior.",
 "31487637": "Strain longitudinal por camadas (speckle tracking) em mulheres com PE precoce e tardia. Resumo não disponível no PubMed - requer texto completo.",
 "34464917": "60 gestantes com PE (precoce vs tardia) vs 30 controles: QT, QTc, Tp-e e razões Tp-e/QT como índices de repolarização ventricular.",
 "19300330": "80 mulheres com PE ou HIG vs 80 controles: pressão e índice de aumento significativamente maiores na PE precoce que na tardia.",
 "33581001": "NT-proBNP mais alto na PE precoce que na tardia; ecocardiograma antes do parto e 3–5 meses após.",
 "32336238": "37 PE precoce vs 29 PE tardia vs 49 controles: painel Olink de 92 biomarcadores CV; 9 marcadores diferem entre precoce e tardia (ST2, MMP1, MMP3, fractalquina).",
 "30295110": "26 PE precoce vs 23 PE tardia vs 23 normais: GDF-15 materno mais alto na PE precoce.",
 "34486496": "40 mulheres com PE precoce vs 40 normotensas pareadas por idade gestacional: remodelamento e disfunção diastólica por ecocardiografia. Sem braço de PE tardia.",
}

# --- C: revisoes e metodologia -------------------------------------------
C = {
 "40138925": "Revisão dedicada exatamente a pergunta da PICO: nem todas as mulheres após DHEG tem o mesmo risco CV; PE precoce, PE recorrente e PE na última gestação são os subgrupos de maior risco.",
 "33252700": "Revisão sobre implicações CV de longo prazo da PE: PE mais grave e de início precoce aumenta o risco CV futuro.",
 "38189425": "Revisão abrangente das consequências CV da PE para mae e prole.",
 "22018452": "Revisão crítica comparando PE precoce e tardia (patogênese, biomarcadores, desfechos). Referência conceitual para a definição de I e C.",
 "41210851": "Revisão sistemática e metanálise (12 estudos, 856 mulheres): rigidez arterial após 6 semanas do parto em mulheres com DHEG. Fonte de busca manual de referencias.",
 "32856716": "Revisão sistemática (16 estudos, 870 mulheres com DHEG): speckle tracking; mulheres com história de PE precoce mostram alterações miocárdicas persistentes.",
 "27609819": "Revisão sistemática (36 estudos, 815 mulheres com PE): disfunção diastólica e remodelamento do VE mais marcados na PE grave e de início precoce.",
 "40569067": "Revisão de atualização sobre PE incluindo riscos CV de longo prazo.",
 "40585732": "Revisão narrativa sobre diagnóstico, tratamento e implicações de longo prazo das DHEG.",
 "28961633": "Revisão sobre as origens cardiovasculares da PE e a distinção precoce/tardia.",
 "31343740": "Revisão: PE como síndrome cardiorrenal gestacional; contrasta fisiopatologia da PE precoce e tardia.",
 "26362531": "Revisão conceitual: PE como síndrome ou doença; placentação deficiente e mais relevante na PE precoce.",
 "35462351": "Revisão (húngaro): as duas faces da PE - forma precoce hipovolêmica/placentária vs forma tardia com alto débito cardíaco.",
 "35177225": "Revisão sobre vias hemodinâmicas da HIG e da PE.",
 "35177220": "Revisão histórica sobre a evolução conceitual da PE/eclampsia.",
 "27520604": "Revisão clínica (enfermagem) sobre avaliação, manejo e implicações de saúde da PE precoce, incluindo seguimento CV pós-parto.",
 "34461666": "Revisão integrativa dos achados placentários na PE pre-termo vs a termo.",
 "30317927": "Revisão sobre PE na adolescência; liga fatores de risco CV a PE precoce.",
 "32981372": "ESTUDO METODOLÓGICO. Validação da memória materna: PE precoce e recuperada com alta sensibilidade e especificidade por questionário; PE tardia e HIG, não. Relevante para o risco de vies de classificação da exposição.",
}

MOTIVOS_D = {
 "27926640": "Desfecho não cardiovascular (doencas retinianas), embora estratificado pelo início da PE - coorte de 1.108.541 mulheres, útil como análogo metodológico.",
 "27899314": "Desfecho não cardiovascular (extração de catarata), estratificado pelo início da PE - mesma coorte de Quebec.",
 "24351805": "Desfecho e recorrência de PE, não evento cardiovascular.",
 "30234780": "Compara HELLP vs PE vs controles; não estratifica por início precoce/tardio.",
}

def main():
    recs = {}
    with open(os.path.join(BASE, "data/s2_records.jsonl")) as fh:
        for line in fh:
            r = json.loads(line)
            recs[r["pmid"]] = r

    tier_of, nota_of = {}, {}
    for tier, mapping in (("A1", A1), ("A2", A2), ("A3", A3), ("B1", B1),
                          ("B2", B2), ("B3", B3), ("C", C)):
        for pmid, nota in mapping.items():
            assert pmid in recs, pmid
            assert pmid not in tier_of, f"{pmid} duplicado"
            tier_of[pmid], nota_of[pmid] = tier, nota
    for pmid in recs:
        tier_of.setdefault(pmid, "D")
        nota_of.setdefault(pmid, MOTIVOS_D.get(
            pmid, "Sem comparação PE precoce vs tardia com desfecho cardiovascular materno após a gestação."))

    ordem = {t: i for i, t in enumerate(["A1", "A2", "A3", "B1", "B2", "B3", "C", "D"])}
    linhas = sorted(recs.values(),
                    key=lambda r: (ordem[tier_of[r["pmid"]]], -int(r["year"] or 0), r["pmid"]))

    campos = ["tier", "categoria", "decisao", "pmid", "doi", "ano", "revista",
              "primeiro_autor", "tipo", "titulo", "nota_triagem", "url"]
    with open(os.path.join(BASE, "results/triagem_completa.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        for r in linhas:
            t = tier_of[r["pmid"]]
            w.writerow({
                "tier": t, "categoria": TIERS[t][0], "decisao": TIERS[t][1],
                "pmid": r["pmid"], "doi": r["doi"], "ano": r["year"],
                "revista": r["journal"], "primeiro_autor": r["first_author"].strip(),
                "tipo": r["types"], "titulo": r["title"],
                "nota_triagem": nota_of[r["pmid"]],
                "url": "https://pubmed.ncbi.nlm.nih.gov/" + r["pmid"] + "/",
            })

    with open(os.path.join(BASE, "results/incluidos_pico.csv"), "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        for r in linhas:
            if tier_of[r["pmid"]] != "D":
                t = tier_of[r["pmid"]]
                w.writerow({
                    "tier": t, "categoria": TIERS[t][0], "decisao": TIERS[t][1],
                    "pmid": r["pmid"], "doi": r["doi"], "ano": r["year"],
                    "revista": r["journal"], "primeiro_autor": r["first_author"].strip(),
                    "tipo": r["types"], "titulo": r["title"],
                    "nota_triagem": nota_of[r["pmid"]],
                    "url": "https://pubmed.ncbi.nlm.nih.gov/" + r["pmid"] + "/",
                })

    with open(os.path.join(BASE, "results/referencias.ris"), "w") as fh:
        for r in linhas:
            fh.write("TY  - JOUR\n")
            fh.write("TI  - %s\n" % r["title"])
            for a in r["authors_list"]:
                fh.write("AU  - %s\n" % a)
            fh.write("PY  - %s\n" % r["year"])
            fh.write("JO  - %s\n" % r["journal"])
            if r["doi"]:
                fh.write("DO  - %s\n" % r["doi"])
            fh.write("AN  - %s\n" % r["pmid"])
            fh.write("UR  - https://pubmed.ncbi.nlm.nih.gov/%s/\n" % r["pmid"])
            fh.write("AB  - %s\n" % r["abstract"].replace("\n", " "))
            fh.write("KW  - triagem:%s\n" % tier_of[r["pmid"]])
            fh.write("ER  - \n\n")

    from collections import Counter
    cont = Counter(tier_of.values())
    for t in ["A1", "A2", "A3", "B1", "B2", "B3", "C", "D"]:
        print("%-3s %3d  %s" % (t, cont[t], TIERS[t][0]))
    print("total %d" % sum(cont.values()))
    json.dump({p: {"tier": tier_of[p], "nota": nota_of[p]} for p in tier_of},
              open(os.path.join(BASE, "results/classificacao.json"), "w"),
              ensure_ascii=False, indent=1)

if __name__ == "__main__":
    main()
