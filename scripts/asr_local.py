"""Listen back to narration clips with a local speech recognizer (faster-whisper), so the pipeline can
catch sentences the voice engine slurred, cut short or garbled. One model load per call.

  asr_local.py --lang en --jobs jobs.json      # [{"audio": "a.wav", "out": "a.txt"}, ...]

Each finished clip prints CLIP_DONE; the transcript is written to its "out" file as UTF-8 text.
The model (VOICE_CHECK_MODEL, default "small") is downloaded once into .cache/whisper.
"""

import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load(file):
    """16 kHz mono float samples, decoded by ffmpeg (already required by Hoca) rather than PyAV."""
    import numpy

    raw = subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-i", str(file), "-f", "s16le", "-ac", "1", "-ar", "16000", "-"], check=True, capture_output=True).stdout
    return numpy.frombuffer(raw, numpy.int16).astype(numpy.float32) / 32768.0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--jobs", type=Path, required=True)
    parser.add_argument("--lang", default="en")
    parser.add_argument("--model", default="small")
    args = parser.parse_args()

    jobs = json.loads(args.jobs.read_text(encoding="utf-8"))
    from faster_whisper import WhisperModel

    model = WhisperModel(args.model, device="cpu", compute_type="int8", download_root=str(ROOT / ".cache" / "whisper"))
    lang = args.lang.split("-")[0].lower()
    for job in jobs:
        # Greedy, no context carried between clips: each sentence is judged on its own sound.
        segments, _ = model.transcribe(load(job["audio"]), language=lang, beam_size=1, condition_on_previous_text=False, vad_filter=False, without_timestamps=True)
        Path(job["out"]).write_text(" ".join(segment.text.strip() for segment in segments).strip(), encoding="utf-8")
        print("CLIP_DONE", flush=True)


if __name__ == "__main__":
    main()
