#!/usr/bin/env bash
# One-time install of the local voices, all of which run on the CPU:
#   Turkish: EMA Lightning and Antalia-2 Mini      English: Kokoro
# Add "freya" to also install FreyaTTS (Turkish, much larger):  npm run setup -- freya
set -euo pipefail
cd "$(dirname "$0")/.."
export UV_CACHE_DIR="$PWD/.cache/uv"

command -v uv >/dev/null 2>&1 || { echo "Install uv first: https://docs.astral.sh/uv/getting-started/installation/" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "Install FFmpeg first: brew install ffmpeg" >&2; exit 1; }

[ -x .venv/bin/python ] || uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python ema-lightning antalia-mini kokoro-onnx soundfile

mkdir -p voices/kokoro
for file in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s "voices/kokoro/$file" ] || curl -fL --progress-bar -o "voices/kokoro/$file" "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$file"
done

if [ "${1:-}" = "freya" ]; then
  [ -d .cache/FreyaTTS/freyatts ] || git clone --depth 1 https://github.com/freyavoiceai/FreyaTTS.git .cache/FreyaTTS
  uv pip install --python .venv/bin/python -r .cache/FreyaTTS/requirements.txt
fi

# Speak one line with each engine: this downloads their weights now and proves they work offline later.
smoke="$(mktemp -d)"
trap 'rm -rf "$smoke"' EXIT
.venv/bin/python scripts/tts_local.py --engine ema --lang tr --text "Merhaba, bu yerel bir ses denemesidir." --out "$smoke/ema.wav"
.venv/bin/python scripts/tts_local.py --engine antalia --lang tr --text "Merhaba, bu yerel bir ses denemesidir." --out "$smoke/antalia.wav"
.venv/bin/python scripts/tts_local.py --engine kokoro --lang en --text "Hello, this is a local voice test." --out "$smoke/kokoro.wav"
if [ "${1:-}" = "freya" ]; then
  .venv/bin/python scripts/tts_local.py --engine freya --lang tr --text "Merhaba, bu yerel bir ses denemesidir." --out "$smoke/freya.wav"
fi

echo "Local voices are ready: Turkish (ema, antalia$([ "${1:-}" = "freya" ] && echo ", freya")) and English (kokoro)."
