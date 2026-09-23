#!/usr/bin/env python3
"""Translate stored English abstracts on a GitHub runner, without a paid API."""
import json
import os
import re
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTICLES = ROOT / "docs/data/articles.json"
TRANSLATIONS = ROOT / "docs/data/translations.json"
MODEL = "Helsinki-NLP/opus-mt-en-zh"


def sentences(text):
    """Keep every sentence for translation, splitting unusually long fragments."""
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", re.sub(r"\s+", " ", text).strip())
    chunks = []
    for sentence in parts:
        if len(sentence) > 450:
            pieces = re.split(r"(?<=[;:])\s+|(?<=,)\s+", sentence)
        else:
            pieces = [sentence]
        for piece in pieces:
            while len(piece) > 450:
                boundary = piece.rfind(' ', 0, 450)
                boundary = boundary if boundary > 150 else 450
                chunks.append(piece[:boundary].strip())
                piece = piece[boundary:].strip()
            if piece.strip():
                chunks.append(piece.strip())
    return chunks


def key_sentences(parts):
    """Select source sentences as extractive points, without inventing findings."""
    scored = []
    for index, value in enumerate(parts):
        if len(value) < 30:
            continue
        lower = value.lower()
        score = sum(2 for phrase in ("we found", "we demonstrate", "we show", "results", "conclude", "revealed", "identified", "indicate", "suggest", "significan") if phrase in lower)
        score += int(index >= len(parts) // 2)
        scored.append((score, index))
    selected = sorted(index for _, index in sorted(scored, reverse=True)[:3])
    return selected


def load_model():
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
    torch.set_num_threads(min(2, os.cpu_count() or 2))
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForSeq2SeqLM.from_pretrained(MODEL)
    model.eval()
    return tokenizer, model, torch


def translate_batch(texts, tokenizer, model, torch):
    results = []
    for i in range(0, len(texts), 4):
        batch = [">>cmn_Hans<< " + value for value in texts[i:i + 4]]
        encoded = tokenizer(batch, return_tensors="pt", padding=True, truncation=True, max_length=512)
        with torch.inference_mode():
            tokens = model.generate(**encoded, max_new_tokens=512, num_beams=3)
        results.extend(tokenizer.batch_decode(tokens, skip_special_tokens=True))
    return [value.strip() for value in results]


def run():
    dataset = json.loads(ARTICLES.read_text(encoding="utf-8"))["articles"]
    done = json.loads(TRANSLATIONS.read_text(encoding="utf-8")) if TRANSLATIONS.exists() else {}
    candidates = [a for a in dataset if a.get("key") and a.get("title") and a["key"] not in done and not a.get("titleZh") and not a.get("hidden")]
    if not candidates:
        print("No untranslated articles")
        return
    # New entries are first; the remaining historical entries are processed over subsequent runs.
    candidates.sort(key=lambda a: (a.get("foundAt", ""), a.get("date", "")), reverse=True)
    max_items = int(os.getenv("MAX_TRANSLATIONS", "80"))
    max_seconds = int(os.getenv("MAX_SECONDS", "2700"))
    tokenizer, model, torch = load_model()
    start = time.monotonic()
    translated = 0
    for article in candidates[:max_items]:
        if time.monotonic() - start > max_seconds:
            break
        chunks = sentences(article.get("abstract") or "")
        source = [article["title"]] + chunks
        output = translate_batch(source, tokenizer, model, torch)
        if len(output) != len(source) or not output[0]:
            raise RuntimeError("Translation returned an incomplete result")
        selected = key_sentences(chunks)
        done[article["key"]] = {
            "titleZh": output[0],
            "abstractZh": " ".join(output[1:]) if chunks else "",
            "takeaways": [output[index + 1] for index in selected],
            "method": MODEL,
            "generatedAt": date.today().isoformat(),
            "reviewed": False,
        }
        translated += 1
        if translated % 10 == 0:
            print(f"Translated {translated} articles", flush=True)
    TRANSLATIONS.parent.mkdir(parents=True, exist_ok=True)
    TRANSLATIONS.write_text(json.dumps(done, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Saved {translated} new translations; total {len(done)}", flush=True)


if __name__ == "__main__":
    run()
