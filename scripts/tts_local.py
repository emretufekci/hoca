"""Local speech engines behind one interface. One model load per call, however many clips.

  tts_local.py --engine ema --text "Merhaba" --out hello.wav
  tts_local.py --engine kokoro --voice af_heart --jobs jobs.json     # [{"text": "...", "out": "a.wav"}, ...]

Engines: ema (Turkish), antalia (Turkish), freya (Turkish), kokoro (English and a few others).
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KOKORO_DIR = ROOT / "voices" / "kokoro"
KOKORO_LANGS = {"en": "en-us", "en-US": "en-us", "en-GB": "en-gb", "es": "es", "fr": "fr-fr", "it": "it", "pt": "pt-br", "pt-BR": "pt-br", "hi": "hi", "ja": "ja", "zh": "cmn"}


def done():
    # One line per finished clip; the Node side turns these into a progress bar.
    print("CLIP_DONE", flush=True)


def ema(jobs, args):
    from ema_lightning import EMA

    tts = EMA()
    for job in jobs:
        tts.say(job["text"], path=job["out"], seed=0)
        done()


def antalia(jobs, args):
    from antalia_mini import Antalia

    tts = Antalia()
    for job in jobs:
        tts.say(job["text"], path=job["out"], seed=0)
        done()


def freya(jobs, args):
    source = ROOT / ".cache" / "FreyaTTS"
    if not (source / "freyatts" / "pipeline.py").is_file():
        raise SystemExit("FreyaTTS source missing. Run: npm run setup -- freya")
    sys.path.insert(0, str(source))
    from freyatts import FreyaTTS

    tts = FreyaTTS.from_pretrained(args.model or "freyavoice/freya-tts", device=args.device)
    for job in jobs:
        tts.save_wav(tts.synthesize(job["text"]), job["out"])
        done()


def kokoro(jobs, args):
    model, voices = KOKORO_DIR / "kokoro-v1.0.onnx", KOKORO_DIR / "voices-v1.0.bin"
    if not model.is_file() or not voices.is_file():
        raise SystemExit("Kokoro model files missing. Run: npm run setup")
    import soundfile
    from kokoro_onnx import Kokoro

    tts = Kokoro(str(model), str(voices))
    lang = KOKORO_LANGS.get(args.lang) or KOKORO_LANGS.get(args.lang.split("-")[0])
    if lang is None:
        raise SystemExit(f"Kokoro has no voice for '{args.lang}'")
    for job in jobs:
        samples, rate = tts.create(job["text"], voice=args.voice or "af_heart", speed=1.0, lang=lang)
        soundfile.write(job["out"], samples, rate)
        done()


ENGINES = {"ema": ema, "antalia": antalia, "freya": freya, "kokoro": kokoro}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", required=True, choices=sorted(ENGINES))
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--jobs", type=Path, help="JSON array of {text, out} objects")
    source.add_argument("--text", help="one narration string")
    parser.add_argument("--out", type=Path, help="output WAV file for --text")
    parser.add_argument("--voice", default="")
    parser.add_argument("--model", default="")
    parser.add_argument("--lang", default="en")
    parser.add_argument("--device", default="cpu", choices=("cpu", "mps"))
    args = parser.parse_args()

    if (args.text is None) != (args.out is None):
        parser.error("use --text together with --out, or --jobs alone")
    jobs = [{"text": args.text, "out": str(args.out)}] if args.text is not None else json.loads(args.jobs.read_text(encoding="utf-8"))
    if not isinstance(jobs, list) or not jobs or any(not isinstance(j, dict) or not str(j.get("text", "")).strip() or not j.get("out") for j in jobs):
        parser.error("jobs must be a nonempty JSON array of {text, out} objects")
    for job in jobs:
        Path(job["out"]).parent.mkdir(parents=True, exist_ok=True)
    ENGINES[args.engine](jobs, args)


if __name__ == "__main__":
    main()
