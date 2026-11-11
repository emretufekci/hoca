"""Local speech engines behind one interface. One model load per call, however many clips.

  tts_local.py --engine ema --text "Merhaba" --out hello.wav
  tts_local.py --engine kokoro --voice af_heart --jobs jobs.json     # [{"text": "...", "out": "a.wav"}, ...]

  tts_local.py --engine piper --model voices/de_DE-thorsten-medium.onnx --jobs jobs.json

Engines: ema (Turkish), antalia (Turkish), freya (Turkish), kokoro (English, French, Italian,
Portuguese, Spanish and a few others), piper (one .onnx voice per language: German, Russian, ...).
"""

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KOKORO_DIR = ROOT / "voices" / "kokoro"
# Kokoro's own voice for each language; one from another language reads with the wrong accent.
KOKORO_VOICES = {"en-us": "af_heart", "en-gb": "bf_emma", "es": "ef_dora", "fr-fr": "ff_siwis", "it": "if_sara", "pt-br": "pf_dora", "hi": "hf_alpha", "ja": "jf_alpha", "cmn": "zf_xiaoxiao"}
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
        raise SystemExit("FreyaTTS source missing. See Voices in README.md for the two install commands.")
    sys.path.insert(0, str(source))
    from freyatts import FreyaTTS

    tts = FreyaTTS.from_pretrained(args.model or "freyavoice/freya-tts", device=args.device)
    for job in jobs:
        tts.save_wav(tts.synthesize(job["text"]), job["out"])
        done()


def kokoro(jobs, args):
    model, voices = KOKORO_DIR / "kokoro-v1.0.onnx", KOKORO_DIR / "voices-v1.0.bin"
    if not model.is_file() or not voices.is_file():
        raise SystemExit("Kokoro model files missing. Run: npm run setup -- --voices en")
    import soundfile
    from kokoro_onnx import Kokoro

    tts = Kokoro(str(model), str(voices))
    lang = KOKORO_LANGS.get(args.lang) or KOKORO_LANGS.get(args.lang.split("-")[0])
    if lang is None:
        raise SystemExit(f"Kokoro has no voice for '{args.lang}'")
    for job in jobs:
        samples, rate = tts.create(job["text"], voice=args.voice or KOKORO_VOICES[lang], speed=1.0, lang=lang)
        soundfile.write(job["out"], samples, rate)
        done()


def piper(jobs, args):
    import wave

    from piper import PiperVoice, SynthesisConfig

    if not args.model or not Path(args.model).is_file():
        raise SystemExit(f"Piper voice missing: {args.model or '(none given)'}. Run: npm run setup")
    tts = PiperVoice.load(args.model)
    # TTS_VOICE picks a speaker by number in a voice that has several.
    config = SynthesisConfig(speaker_id=int(args.voice)) if args.voice.isdigit() else None
    for job in jobs:
        with wave.open(job["out"], "wb") as out:
            tts.synthesize_wav(job["text"], out, syn_config=config)
        done()


ENGINES = {"ema": ema, "antalia": antalia, "freya": freya, "kokoro": kokoro, "piper": piper}


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
