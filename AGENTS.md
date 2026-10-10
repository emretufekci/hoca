# Agent guide: Hoca, animated explainer videos

Hoca (Turkish for teacher) turns a topic into a short animated explainer video. An agent writes the script and the animation code; the pipeline adds the voice, the subtitles and the MP4. Every production setting (format, length, languages, voice, subtitles) lives in `.env`, so do not hard-code any of them and do not ask the user for them.

## When asked to make a video

1. Get the brief for the topic. Pass your own name as the agent so the output lands in your folder:

   ```bash
   node bin/hoca.mjs brief "<topic>" --agent claude    # or: --agent codex
   ```

   The brief is generated from `.env` and is the full specification: the target folder `outputs/<topic>/<agent>/`, frame size and safe areas, target length and word budget, narration and subtitle languages, the scene module contract, the `#kit` drawing helpers, style guidance and the workflow. Follow it rather than this summary. If the user states a setting in their request ("make it landscape", "in Turkish", "no voice"), pass it as a flag (`--format landscape`, `--lang tr`, `--no-voiceover`; see `--help`) on every command for that video instead of editing `.env`.

2. Write `video.json` and the scene modules in that folder, then iterate:

   ```bash
   node bin/hoca.mjs check <topic> --agent <you>     # validates, writes preview/contact-sheet.png
   node bin/hoca.mjs render <topic> --agent <you>    # voice, subtitles, MP4
   ```

   `check` needs no speech synthesis, so run it often and look at the frames it writes. Unchanged sentences reuse cached audio, so re-rendering after a small edit is cheap.

3. Report the MP4 path and its duration, plus anything you could not verify. Do not stop at a plan, a script or static frames when a video was requested.

## Through MCP

The same steps are available as MCP tools, registered for Claude Code in `.mcp.json` and for Codex in `.codex/config.toml`: `hoca_brief`, `hoca_check` (returns the contact sheet as an image), `hoca_render`, `hoca_list`, `hoca_config` and `hoca_doctor`. When they are available, use them in place of the shell commands above. The project folder defaults to your client's name, and a setting the user states goes in as a tool argument (`format`, `language`, `voiceover`, ...) on every call for that video.

## Layout

| Path | Purpose |
| --- | --- |
| `.env`, `.env.example` | All settings. `node bin/hoca.mjs config` shows what is in effect. |
| `bin/hoca.mjs` | The CLI: `make`, `brief`, `check`, `render`, `tts`, `config`, `doctor`, `list`, `mcp`. |
| `lib/kit.mjs` | Scene helpers, a port of manim's palette and animations to SVG, imported as `#kit`. |
| `lib/` | Config, timeline, TTS providers, subtitles, renderer, agent runners, MCP server. |
| `prompts/brief.md` | Template for the brief. |
| `outputs/<topic>/<agent>/` | One project per topic and agent: sources, previews, audio cache and the video. |

## Ground rules

- Work only inside your project folder unless the user asks for a change to the pipeline itself.
- Each topic and agent has its own folder; never edit another agent's project.
- Scenes must lay out from `ctx.width`, `ctx.height` and `ctx.safe`, so the same project renders in landscape and vertical.
- Verify facts that matter and note sources in `sources.md`. The visual style follows manim (MIT); do not use the 3Blue1Brown name, logo or pi creature characters.
