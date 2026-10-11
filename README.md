# Hoca

*Hoca* is Turkish for teacher (in English, "hodja"). Give Hoca a topic and it teaches it back as a short animated video in the style of 3Blue1Brown: black background, formulas that write themselves in, diagrams that draw and transform in step with a narrator.

```bash
npm run hoca -- "Türev nedir" --lang tr
```

**If Hoca teaches you something, please give it a ⭐. It is the only thing this project asks for, and it helps other people find it.**

## Examples

Both videos below were made by Hoca from a single command. Claude Code wrote the script and the animation; the voice and every frame were produced on a laptop CPU (Apple M2 Pro), with no GPU and no speech API.

<table>
  <tr><th>Turkish</th><th>English</th></tr>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/66993fc1-7982-4367-a510-8b6273fdb971" controls width="300"></video></td>
    <td><video src="https://github.com/user-attachments/assets/83030a67-4269-4bb3-aae3-89577a94905b" controls width="300"></video></td>
  </tr>
  <tr>
    <td><code>npm run hoca -- "Türev nedir" --lang tr</code></td>
    <td><code>npm run hoca -- "How text-to-speech works"</code></td>
  </tr>
  <tr>
    <td>Voice: EMA Lightning, on this machine's CPU</td>
    <td>Voice: Kokoro, on this machine's CPU</td>
  </tr>
</table>

Press play for the full video with sound. The agent keeps its source notes next to each video in `sources.md`.

## Quick start

You need [Node 22+](https://nodejs.org) and three tools: FFmpeg, librsvg and [uv](https://docs.astral.sh/uv/). Install them for your system:

**macOS**

```bash
brew install ffmpeg librsvg uv
```

**Linux**

```bash
# Debian, Ubuntu
sudo apt update && sudo apt install -y ffmpeg librsvg2-bin fontconfig curl git
# Arch
sudo pacman -S --needed ffmpeg librsvg fontconfig curl git
# Fedora: enable RPM Fusion first (https://rpmfusion.org/Configuration); the stock ffmpeg-free has no H.264 encoder
sudo dnf install -y librsvg2-tools fontconfig curl git && sudo dnf install -y ffmpeg --allowerasing

curl -LsSf https://astral.sh/uv/install.sh | sh    # uv, on any distribution
```

If your distribution ships a Node older than 22, install a current one with [nvm](https://github.com/nvm-sh/nvm) (`nvm install 22`).

**Windows**

Hoca runs on Windows through [WSL 2](https://learn.microsoft.com/windows/wsl/install); it does not run in PowerShell or cmd directly, since the setup and the pipeline rely on a Unix shell. In an administrator PowerShell:

```powershell
wsl --install
```

Restart, open the Ubuntu terminal it installed, and follow the Linux steps above inside it. Clone the repo into the Linux home folder (`~/hoca`, not `/mnt/c/...`), where rendering is much faster. `explorer.exe outputs` opens the finished videos in Windows.

Then, in this folder:

```bash
npm install             # 1. dependencies
cp .env.example .env    # 2. your settings: Hoca reads everything from this file
npm run setup           # 3. local voices (Turkish and English, about 400 MB, one time)
npm run doctor          # 4. checks that everything is ready
npm run hoca -- "Why is the sky blue?"     # 5. your first video
```

Hoca is configured through `.env`: who writes the video, its language, format, length, voice and subtitles all come from that file, and `npm run config` shows what is in effect. As copied, it gives you:

- **Writer:** [Claude Code](https://claude.com/claude-code) (`AGENT=claude`). If you use Codex instead, set `AGENT=codex` or add `--agent codex`. Neither needs an API key.
- **Voice:** EMA Lightning for Turkish and Kokoro for English, both local. Hoca picks by the video's language; `TTS_PROVIDER` overrides it.

The video lands in `outputs/<topic>/<agent>/<topic>.mp4`.

## If you are a coding agent

Asked to install Hoca, or to make a video with it? Do this, in order:

1. **Install what is missing.** Check `node --version` (22 or newer), `ffmpeg`, `rsvg-convert` and `uv`, and install the absent ones with the command for this system from [Quick start](#quick-start). On Windows, work inside WSL 2.
2. **Set up the repo.** Run `npm install`, then `cp .env.example .env` unless a `.env` is already there (never overwrite one), then `npm run setup` (it downloads about 400 MB of voices once, so let it finish), then `npm run doctor`. Fix every `FAIL` line before going on; a `note` line is informational.
3. **Write the video yourself.** Do not run `npm run hoca -- "<topic>"`: that starts a second agent to do the writing. Read [AGENTS.md](AGENTS.md) and follow it. In short: if the `hoca_*` MCP tools are available, call `hoca_brief`, write the files it asks for, call `hoca_check` until the frames read clearly, then `hoca_render`. Otherwise use `node bin/hoca.mjs brief "<topic>" --agent <you>`, then `check` and `render` the same way.
4. **Take settings from the user, not from guesses.** Everything comes from `.env`. Pass a flag or tool argument (`--format landscape`, `--lang tr`, `--no-voiceover`) only when the user asked for it, and then on every command for that video. Do not edit `.env`.
5. **Report** the MP4 path, its duration and anything you could not verify. A plan, a script or still frames is not a finished video.

## Make a video

```bash
npm run hoca -- "Türev nedir" --lang tr                  # Turkish, Turkish voice and subtitles
npm run hoca -- "How does HTTPS work?" --agent codex     # written by Codex
npm run hoca -- "Fourier series" --format landscape --duration 120    # a longer YouTube-style video
npm run hoca -- "What is entropy?" --no-voiceover        # silent, subtitles only
```

By default you get a vertical video of about 45 seconds (Reels, TikTok, Shorts) in English, with a voice-over and burned-in subtitles.

While it works, Hoca tells you what runs where and how far along it is:

```
Hoca: "Türev nedir"

Script     Claude Code CLI: remote model, on your Claude subscription or API login
Voice      EMA Lightning: local, on this machine's CPU, tr
Subtitles  tr, burned in + .srt file
Video      on this machine's CPU, 9 workers: vertical 1080x1920, about 45 s
Folder     outputs/turev/claude

Writing    done in 4:12  script and scenes pass the check
Voice      ████████████████████████ 100%  12/12 sentences
Frames     ██████████░░░░░░░░░░░░░░  42%  567/1350 frames  ETA 0:14
```

Writing the script takes a few minutes, since an AI agent researches the topic, writes the narration and codes the animation. Voice and rendering take well under a minute.

## Settings

Every setting lives in `.env`, the copy of `.env.example` you made in [Quick start](#quick-start) (`cp .env.example .env`). Edit it to change the defaults for every video:

```ini
AGENT=claude            # who writes: claude | codex | ollama | openai | anthropic
LANGUAGE=en             # on-screen text, voice and subtitles: en, tr, ...
VIDEO_FORMAT=vertical   # vertical | landscape | square
VIDEO_DURATION=         # seconds; empty = 45 vertical, 120 landscape, 60 square
VOICEOVER=true
SUBTITLES=true
VIDEO_STYLE=3b1b        # add your own direction after it, e.g. "3b1b, warmer colors"
```

Or change one thing for one video with a flag: `--agent`, `--lang`, `--format`, `--duration`, `--no-voiceover`, `--no-subtitles`.

## What runs where

| Step | Default | Where it runs |
| --- | --- | --- |
| Writing the script and animation | Claude Code or Codex CLI | Remote model, through the CLI you are already logged in to (your subscription) |
| Voice | EMA Lightning (Turkish), Kokoro (English) | Local, on your CPU. No account, nothing uploaded |
| Rendering | librsvg + FFmpeg | Local, on your CPU |

If you choose a remote option instead (an API model, or an API voice), Hoca says so in the header before it starts.

## If something goes wrong

- Run `npm run doctor`. It checks each tool, the voice and the agent, and says what to install.
- **"already has a project"**: that topic was made before. Use `npm run hoca -- render "<topic>"` to render it again, or add `--force` to rewrite it.
- **The video is too long or too short**: the length is a target the script is written to. Hoca reports the real length; set `--duration` or edit the narration in `video.json` and render again.
- **No voice for your language**: only Turkish and English voices are installed by default. On macOS the system voice is used for other languages; see Voices under Advanced.

---

## Advanced

Everything below is optional.

<details>
<summary><b>Edit a video after it is made</b></summary>

Each video is a small folder you can edit and render again:

```
outputs/turev/claude/
  video.json         the script: narration per scene (and subtitle translations)
  scene-1.mjs ...    one animation per scene
  sources.md         what the agent verified
  turev.mp4, turev.tr.srt
```

Change the narration or a scene, then:

```bash
npm run hoca -- check turev      # fast validation, writes preview/contact-sheet.png
npm run hoca -- render turev     # new MP4; unchanged sentences reuse their audio
npm run hoca -- render turev --format landscape    # same project, another format
```

`examples/ratchet-algorithm/` is a small hand-written project to read or copy from: `npm run hoca -- render examples/ratchet-algorithm`.

</details>

<details>
<summary><b>All commands</b></summary>

```bash
npm run hoca -- "<topic>"            # write and render (same as: make "<topic>")
npm run hoca -- brief "<topic>"      # print the brief, for an agent you are chatting with
npm run hoca -- check <project>      # validate and write preview frames; no speech needed
npm run hoca -- render <project>     # MP4 + .srt
npm run hoca -- tts "<text>" -o clip.wav
npm run hoca -- config | doctor | list
npm run hoca -- mcp                  # MCP server over stdio, for Claude Code and Codex
```

`<project>` is a folder or a topic. Run `npm link` once to type `hoca "<topic>"` instead of `npm run hoca -- "<topic>"`.

Working interactively also works: open Claude Code or Codex in this folder and ask for a video. [AGENTS.md](AGENTS.md) tells the agent how to get its brief and where to write.

</details>

<details>
<summary><b>MCP server: Hoca as tools in Claude Code and Codex</b></summary>

Hoca ships an [MCP](https://modelcontextprotocol.io) server, so an agent can call the pipeline as tools instead of shell commands. It is already registered for this folder: `.mcp.json` for Claude Code and `.codex/config.toml` for Codex. Open either one here, approve the `hoca` server when asked (Codex loads project settings only in a trusted folder), and ask for a video.

| Tool | What it does |
| --- | --- |
| `hoca_brief` | Creates the project folder and returns the brief for a topic |
| `hoca_check` | Validates the project and returns the contact sheet as an image |
| `hoca_render` | Voice, subtitles and MP4, with progress while it runs |
| `hoca_list`, `hoca_config`, `hoca_doctor` | Projects, settings in effect, environment check |

Settings still come from `.env`; each tool also takes `format`, `duration`, `language`, `voice_language`, `subtitle_language`, `voiceover` and `subtitles` for one video. The project lands in `outputs/<topic>/claude/` or `outputs/<topic>/codex/` according to who is calling.

To use it from another folder, or from any other MCP client, register the server by its full path:

```bash
claude mcp add --scope user hoca -- node /path/to/hoca/bin/hoca.mjs mcp
codex mcp add hoca -- node /path/to/hoca/bin/hoca.mjs mcp
```

Projects are still written under this repo's `outputs/`, so the agent needs permission to write there. Codex stops a tool call after 60 seconds unless `tool_timeout_sec` is raised for the server (the bundled config sets 1800), which matters for renders. The server has no `make` tool: the agent that calls it is the one writing the video. `hoca_check` and `hoca_render` run the scene modules the agent wrote, as your user and outside any sandbox your client puts around the agent's own commands, so approve them as you would approve running its code.

</details>

<details>
<summary><b>Other agents: local models and APIs</b></summary>

| `AGENT` | How it runs | Needs |
| --- | --- | --- |
| `claude` | `claude -p` in this folder; edits auto-accepted, shell limited to Hoca's own CLI | Claude Code CLI |
| `codex` | `codex exec --sandbox workspace-write` | Codex CLI |
| `ollama` | local model through Ollama | `ollama serve`, `AGENT_MODEL` |
| `openai` | any OpenAI-compatible endpoint (`LLM_BASE_URL`): OpenAI, LM Studio, llama.cpp, vLLM, OpenRouter | `AGENT_MODEL`, a key if remote |
| `anthropic` | Claude API through the official SDK (`claude-opus-5-5` unless `AGENT_MODEL` says otherwise) | `ANTHROPIC_API_KEY` |
| any other name | your own CLI via `AGENT_COMMAND`; the brief arrives on stdin and in `{prompt_file}` | |

```bash
npm run hoca -- "Bubble sort" --agent ollama --model qwen2.5-coder:32b
```

Coding agents write the files, run the check and look at preview frames themselves. Chat models cannot run anything, so Hoca checks their files and sends errors back for fixing, up to `AGENT_MAX_FIXES` times. Small local models often struggle to write correct animation code; a coding-tuned model of 30B+ parameters is a realistic minimum.

Scene files are code written by a model and run on your machine by Node. Use agents you trust, and read the `.mjs` files before rendering a project that came from someone else.

</details>

<details>
<summary><b>Voices</b></summary>

| `TTS_PROVIDER` | Language | Runs | Notes |
| --- | --- | --- | --- |
| `ema` | Turkish | local, CPU | [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning). Default for Turkish. |
| `antalia` | Turkish | local, CPU | [Antalia-2 Mini](https://huggingface.co/cloud0day3/antalia-mini). Male voice; reads numbers, dates and amounts. |
| `kokoro` | English (also es, fr, it, pt, hi, ja, zh) | local, CPU | [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M). Default for English. `TTS_VOICE=af_heart`, `am_michael`, `bf_emma`, ... |
| `piper` | any language with a `voices/<lang>_*.onnx` file | local, CPU | [Piper](https://github.com/rhasspy/piper) voices you add yourself. |
| `freya` | Turkish | local | [FreyaTTS](https://huggingface.co/freyavoice/Freya-TTS), larger and slower. Install with `npm run setup -- freya`. |
| `say` | many | macOS | Built-in system voices, no setup. |
| `openai`, `elevenlabs` | many | remote API | Need a key. `openai` also talks to a local OpenAI-compatible speech server via `TTS_BASE_URL`. |
| `command` | any | yours | `TTS_COMMAND=my-tts --text-file {text_file} --out {out}` |

With `TTS_PROVIDER=auto` (the default) Hoca takes the first installed local voice for the language. To compare voices:

```bash
npm run hoca -- tts "Merhaba dünya" --lang tr --tts antalia -o test.wav
```

</details>

<details>
<summary><b>All settings</b></summary>

Add any of these to `.env`, or pass `--set KEY=VALUE` for one run. `--env other.env` switches the whole file, so you can keep `reels.env` and `youtube.env` side by side. `npm run config` shows what is in effect.

| Key | Purpose |
| --- | --- |
| `AGENT_MODEL` | Model name. Required for `ollama` and `openai`. |
| `AGENT_NAME` | Output folder name, to keep takes apart (e.g. `ollama-qwen`). |
| `AGENT_COMMAND`, `AGENT_ARGS` | Your own agent CLI, or extra flags for the built-in ones. |
| `AGENT_MAX_FIXES`, `AGENT_TIMEOUT_MIN` | How many fix rounds to allow (3) and when to give up on a CLI agent (45 min). |
| `OLLAMA_HOST`, `LLM_BASE_URL`, `LLM_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Endpoints and keys for model APIs. |
| `VOICEOVER_LANG`, `SUBTITLE_LANG` | Voice or subtitles in a different language than `LANGUAGE`. If they differ from each other, the agent also writes a sentence-for-sentence translation. |
| `TTS_PROVIDER`, `TTS_VOICE`, `TTS_MODEL`, `TTS_SPEED` | Which voice, and how fast it speaks (1 = normal). |
| `TTS_BASE_URL`, `TTS_API_KEY`, `ELEVENLABS_API_KEY`, `TTS_COMMAND` | Remote or custom speech engines. |
| `SUBTITLE_MODE` | `both` (default), `burn`, `file`. |
| `VIDEO_FPS`, `VIDEO_RESOLUTION`, `VIDEO_CRF` | Frame rate (30), pixel size (e.g. `1280x720` for drafts), quality (18). |
| `OUTPUT_DIR` | Where videos go (`outputs`). |

How the main settings combine:

- **Voice-over on**: narration is synthesized sentence by sentence, and every scene and subtitle is timed from the real audio.
- **Voice-over off**: the video is silent and paced by reading speed, stretched toward `VIDEO_DURATION`.
- **Vertical**: the agent is told to hook in the first two seconds, stack the layout and use large type; scenes keep clear of platform buttons and the subtitle band.
- **Rendering an existing project** uses the language its narration was written in, whatever `LANGUAGE` is set to now.

</details>

<details>
<summary><b>How the animation works</b></summary>

A scene is a function from time to an SVG frame. Hoca calls it for every frame, rasterizes with librsvg and encodes with FFmpeg.

```js
import { scene, numberPlane, tex, split, onBeat, duringBeat, lerp, linear } from '#kit';

const f = x => x * x;

export function render(ctx) {
  return scene(ctx, { title: 'How steep is a parabola?' }, rect => {
    const [graph, side] = split(rect, rect.vertical ? 'rows' : 'cols', [3, 2], rect.u * 4);
    const plane = numberPlane(graph, { x: [-3, 3], y: [-1, 5], numbers: true });
    const x = lerp(-1.5, 1.5, duringBeat(ctx, 1));
    return plane.svg(onBeat(ctx, 0)) + plane.plot(f, { draw: onBeat(ctx, 0, { delay: 0.6 }) })
      + (ctx.beat >= 1 ? plane.tangent(f, x) + plane.point(x, f(x)) : '')
      + tex(side.cx, side.cy, String.raw`\frac{d}{dx}\,x^2 = 2x`, { size: rect.u * 7, write: onBeat(ctx, 2, { length: 1.8, rate: linear }) });
  });
}
```

`ctx` carries the frame size, safe margins and `beats`: the measured start and end of every narration sentence, so an animation starts exactly when its sentence does.

[lib/kit.mjs](lib/kit.mjs) (imported as `#kit`) is a port of [manim](https://github.com/3b1b/manim)'s vocabulary to SVG: its palette and rate functions, `Write` for text and real LaTeX (`tex()`), draw-on strokes, `fadeIn`/`grow`, shape morphing, `indicate`/`flash`/`flashAround`, braces, and number planes with graphs, tangents, shaded areas and Riemann sums. `npm run hoca -- brief "<topic>"` prints the full reference that agents receive.

</details>

<details>
<summary><b>Repository layout</b></summary>

| Path | Purpose |
| --- | --- |
| `bin/hoca.mjs` | The command line |
| `lib/config.mjs` | `.env` loading, defaults, output paths |
| `lib/author.mjs`, `lib/llm.mjs`, `lib/brief.mjs`, `prompts/brief.md` | Running agents and models; the brief they receive |
| `lib/project.mjs` | Script, sentence beats, timeline |
| `lib/tts.mjs`, `scripts/tts_local.py` | Voices and the per-sentence audio cache |
| `lib/subtitles.mjs` | Subtitle timing, `.srt`, burn-in |
| `lib/render.mjs`, `lib/check.mjs`, `lib/progress.mjs`, `lib/runtime.mjs` | Frames to MP4, validation and previews, progress bars, the "what runs where" header |
| `lib/kit.mjs`, `lib/tex.mjs`, `assets/fonts/` | Scene helpers (manim port), LaTeX typesetting, Computer Modern fonts |
| `examples/` | A hand-written project |
| `outputs/` | Your videos (not tracked by git) |
| `test/` | `npm test` |

</details>

---

## Credits and references

**Inspiration.** Hoca was inspired by [a post by Andrej Karpathy](https://x.com/karpathy/status/2105819303471976479).

**Animation style.** The look and the animation vocabulary come from [manim](https://github.com/3b1b/manim), the open-source library Grant Sanderson built for [3Blue1Brown](https://www.3blue1brown.com/) (MIT). Hoca ports its palette, rate functions and core animations to SVG. The 3Blue1Brown name, logo and pi characters are not part of that license and are not used.

**Local voices.** Speech is generated on your own CPU, which means no account, no per-character cost, nothing uploaded, and it works offline. The default models are tiny: on a laptop, the narration for a 45-second video is spoken in about five seconds.

| Model | By | What Hoca gets from it |
| --- | --- | --- |
| [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning) | canberkkkkkk | Default Turkish voice. 8.6M parameters, 48 kHz, Apache-2.0. |
| [Antalia-2 Mini](https://huggingface.co/cloud0day3/antalia-mini) | [Patientdesk.ai](https://speech.patientdesk.ai/benchmarks) | Second Turkish voice. 7.6M parameters, 48 kHz, built-in reading of numbers, dates and amounts, Apache-2.0. |
| [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) | hexgrad, run through [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) | Default English voice. 82M parameters, Apache-2.0. |
| [FreyaTTS](https://huggingface.co/freyavoice/Freya-TTS) | Freya Voice | Optional Turkish voice, Apache-2.0. |
| [Piper](https://github.com/rhasspy/piper) | Rhasspy | Optional voices for other languages. |

Both Turkish model cards measure themselves on [Freya-TR-Eval](https://huggingface.co/datasets/freyavoice/freya-tr-eval), the Turkish benchmark published by Freya Voice, and Patientdesk.ai keeps an independent [re-run for every Turkish system](https://speech.patientdesk.ai/benchmarks). Those results are why EMA Lightning and Antalia-2 Mini are the Turkish defaults here.

**Typesetting.** Formulas are set with [MathJax](https://www.mathjax.org/); text uses [Latin Modern](https://www.gust.org.pl/projects/e-foundry/latin-modern) (GUST Font License).

Hoca itself is released under the [MIT License](LICENSE). Third-party license texts are in [NOTICE.md](NOTICE.md).

## Support the project

Hoca is free and open source. If it was useful, [star the repository](https://github.com/emretufekci/hoca), share a video you made with it, or open an issue with the topic it explained badly. Pull requests for new voices, languages and scene helpers are welcome.
