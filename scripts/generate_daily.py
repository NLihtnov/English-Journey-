#!/usr/bin/env python3
"""Gera o conteúdo novo do dia (roda todo dia no GitHub Actions).

- Com o segredo ANTHROPIC_API_KEY configurado, o Claude cria uma aula diária
  inédita em 3 níveis (palavras, expressão, idiom, dica de gramática, mini
  história, ditado, quiz, desafio de fala e de escrita), evitando repetir
  palavras dos dias anteriores.
- Sem a chave (ou se a chamada falhar), monta o conteúdo do dia a partir do
  currículo, num rodízio determinístico, para o app nunca ficar sem novidade.

Saídas: data/daily.json (hoje) e data/archive/AAAA-MM-DD.json + index.json.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ARCHIVE = DATA / "archive"
TODAY = dt.date.today()
MODEL = "claude-opus-5-5"
TIERS = {
    "basic": "A0–A1 (iniciante absoluto; frases muito curtas, só presente, vocabulário do dia a dia)",
    "intermediate": "A2–B1 (passado, futuro, present perfect, situações de viagem e trabalho)",
    "advanced": "B2–C1 (idioms, phrasal verbs, collocations, registro formal e informal)",
}


# ----------------------------------------------------------------- schema
def obj(props: dict) -> dict:
    return {"type": "object", "properties": props, "required": list(props), "additionalProperties": False}


S = {"type": "string"}
WORD = obj({"en": S, "pt": S, "ipa": S, "example": S, "example_pt": S})
QUIZ = obj({"q": S, "o": {"type": "array", "items": S}, "a": {"type": "integer"}, "explain": S})
TIER = obj({
    "theme": S,
    "words": {"type": "array", "items": WORD},
    "phrase": obj({"en": S, "pt": S, "when": S}),
    "idiom": obj({"en": S, "pt": S, "example": S}),
    "grammar_tip": obj({"title": S, "explanation_pt": S, "examples": {"type": "array", "items": S}}),
    "story": obj({"title": S, "text": S, "translation_pt": S}),
    "dictation": {"type": "array", "items": S},
    "quiz": {"type": "array", "items": QUIZ},
    "speaking_challenge": S,
    "writing_prompt": S,
    "culture_fact": S,
})
SCHEMA = obj({tier: TIER for tier in TIERS})


def recent_words(days: int = 60) -> list[str]:
    words = []
    for i in range(1, days + 1):
        p = ARCHIVE / f"{(TODAY - dt.timedelta(days=i)).isoformat()}.json"
        if p.exists():
            d = json.loads(p.read_text("utf-8"))
            for t in d.get("levels", {}).values():
                words += [w["en"] for w in t.get("words", [])]
                words.append(t.get("idiom", {}).get("en", ""))
    return sorted({w for w in words if w})


# ----------------------------------------------------------------- Claude
def from_claude() -> dict:
    import anthropic  # instalado só no workflow

    avoid = recent_words()
    tiers = "\n".join(f"- {k}: {v}" for k, v in TIERS.items())
    prompt = f"""Hoje é {TODAY.isoformat()} ({TODAY.strftime('%A')}). Crie a aula diária de inglês de um app para brasileiros que estão aprendendo inglês do zero.

Gere um bloco para cada nível:
{tiers}

Regras para cada nível:
- "theme": um tema do cotidiano diferente para cada nível (ex.: no mercado, reunião online, um feriado que acontece nesta época do ano). Varie de um dia para o outro.
- "words": exatamente 5 palavras ou expressões úteis ligadas ao tema, com tradução, IPA, exemplo em inglês e tradução do exemplo.
- "phrase": 1 frase pronta muito útil, com tradução e quando usar (em português).
- "idiom": 1 expressão idiomática ou gíria atual (no básico, uma expressão bem simples, ex.: "No worries").
- "grammar_tip": 1 dica de gramática curta, explicada em português, com 2 a 3 exemplos.
- "story": uma mini história no nível (básico ~60 palavras, intermediário ~110, avançado ~170) usando as palavras do dia, com tradução.
- "dictation": 5 frases curtas, naturais, para ditado (tiradas ou inspiradas na história).
- "quiz": 3 perguntas de múltipla escolha (3 opções em "o", índice da correta em "a", explicação curta em português em "explain"), enunciado em português.
- "speaking_challenge": desafio de fala de 1–2 minutos (em português, com uma pergunta em inglês para responder em voz alta).
- "writing_prompt": tema de escrita curto (em português, com o comando em inglês).
- "culture_fact": uma curiosidade cultural de países de língua inglesa, em português (2 frases).

Não repita estas palavras/expressões de dias anteriores: {', '.join(avoid) if avoid else '(nenhuma ainda)'}.
O inglês deve ser natural e correto, como um nativo falaria hoje."""

    client = anthropic.Anthropic()
    resp = client.beta.messages.create(
        model=MODEL,
        max_tokens=16000,
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        output_config={"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}},
        messages=[{"role": "user", "content": prompt}],
    )
    if resp.stop_reason in ("refusal", "max_tokens"):
        raise RuntimeError(f"stop_reason={resp.stop_reason}")
    text = next(b.text for b in resp.content if b.type == "text")
    return json.loads(text)


# ----------------------------------------------------------------- fallback
IDIOMS = [
    ("No worries", "Sem problemas", "— Sorry I'm late! — No worries."),
    ("Break a leg", "Boa sorte (antes de apresentação)", "You have an interview today? Break a leg!"),
    ("It's up to you", "Você que sabe / depende de você", "Pizza or sushi? It's up to you."),
    ("Better late than never", "Antes tarde do que nunca", "You started English at 40? Better late than never!"),
    ("Hang in there", "Aguenta firme", "Exams are almost over. Hang in there!"),
    ("Piece of cake", "Moleza", "The test was a piece of cake."),
    ("Let's call it a day", "Vamos encerrar por hoje", "We've worked enough. Let's call it a day."),
    ("I'm all ears", "Sou todo ouvidos", "Tell me what happened. I'm all ears."),
    ("Speak of the devil", "Falando no diabo", "Speak of the devil! We were just talking about you."),
    ("Easier said than done", "Falar é fácil", "Wake up at 5 am every day? Easier said than done."),
    ("Under the weather", "Indisposto", "I'm a bit under the weather today."),
    ("Get the hang of it", "Pegar o jeito", "Driving is hard at first, but you'll get the hang of it."),
    ("On the same page", "Na mesma página", "Let's talk to make sure we're on the same page."),
    ("Once in a blue moon", "Muito raramente", "I eat fast food once in a blue moon."),
]


def word_entry(v: str, phrases: list[list[str]]) -> dict:
    en, pt = v.split("|")
    ex = next((p for p in phrases if en.lower().split()[0] in p[0].lower()), ["", ""])
    return {"en": en, "pt": pt, "ipa": "", "example": ex[0], "example_pt": ex[1]}


def from_bank() -> dict:
    cur = json.loads((DATA / "curriculum.json").read_text("utf-8"))
    groups = {"basic": ["A0", "A1"], "intermediate": ["A2", "B1"], "advanced": ["B2", "C1"]}
    rng = random.Random(TODAY.toordinal())
    out = {}
    for tier, phases in groups.items():
        units = [u for p in cur["phases"] if p["id"] in phases for u in p["units"]]
        u = units[TODAY.toordinal() % len(units)]
        vocab = rng.sample(u["vocab"], min(5, len(u["vocab"])))
        phrases = [p.split("|") for p in u["phrases"]]
        idiom = IDIOMS[(TODAY.toordinal() + len(tier)) % len(IDIOMS)]
        out[tier] = {
            "theme": f"Revisão: {u['title']}",
            "words": [word_entry(v, phrases) for v in vocab],
            "phrase": {"en": phrases[0][0], "pt": phrases[0][1], "when": u["goals"]},
            "idiom": {"en": idiom[0], "pt": idiom[1], "example": idiom[2]},
            "grammar_tip": {"title": u["en"], "explanation_pt": u["grammar"][0], "examples": [p[0] for p in phrases[:3]]},
            "story": {"title": "", "text": "", "translation_pt": ""},
            "dictation": [p[0] for p in phrases],
            "quiz": [dict(q, explain="") for q in u["quiz"]],
            "speaking_challenge": f"Fale 1 minuto sobre o tema '{u['title']}' usando as palavras do dia.",
            "writing_prompt": f"Escreva 5 frases sobre '{u['en']}'.",
            "culture_fact": "",
        }
    return out


def main() -> None:
    source = "bank"
    levels = None
    if os.environ.get("ANTHROPIC_API_KEY"):
        try:
            levels = from_claude()
            source = "claude"
        except Exception as e:  # noqa: BLE001
            print(f"! Claude indisponível ({e}); usando o rodízio do currículo.", file=sys.stderr)
    if levels is None:
        levels = from_bank()

    day = {"date": TODAY.isoformat(), "source": source, "levels": levels}
    ARCHIVE.mkdir(exist_ok=True)
    dump = json.dumps(day, ensure_ascii=False, indent=1) + "\n"
    (DATA / "daily.json").write_text(dump, "utf-8")
    (ARCHIVE / f"{TODAY.isoformat()}.json").write_text(dump, "utf-8")
    dates = sorted({p.stem for p in ARCHIVE.glob("20*.json")}, reverse=True)
    (ARCHIVE / "index.json").write_text(json.dumps({"dates": dates}, indent=1) + "\n", "utf-8")
    print(f"daily.json gerado ({source}) — {len(dates)} dias no arquivo")


if __name__ == "__main__":
    main()
