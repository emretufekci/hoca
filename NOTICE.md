# Third-party notices

## manim

`lib/kit.mjs` ports the color palette, the rate functions and the behaviour of several animations
(Write / DrawBorderThenFill, ShowCreation, ShowPassingFlash, Indicate, Flash, FlashAround, Transform)
from [manim](https://github.com/3b1b/manim) by 3Blue1Brown, used under the MIT License:

> MIT License
>
> Copyright (c) 2020-2026 3Blue1Brown LLC
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

The MIT license covers manim's code. It does not cover the 3Blue1Brown name, logo or the pi creature
characters, and this project does not use them.

## Fonts

`assets/fonts/` contains Latin Modern Roman and Latin Modern Mono (GUST e-foundry), distributed
under the GUST Font License; see `assets/fonts/GUST-FONT-LICENSE.TXT`.

## MathJax

Formulas are typeset with [MathJax](https://www.mathjax.org/) (Apache License 2.0), installed from npm.

## Voices (downloaded by `npm run setup`, not stored in this repository)

- [EMA Lightning](https://huggingface.co/canberkkkkkk/ema-lightning) by canberkkkkkk: Turkish, Apache-2.0
- [Antalia-2 Mini](https://huggingface.co/cloud0day3/antalia-mini) by Patientdesk.ai: Turkish, Apache-2.0
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) by hexgrad, via [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx): English, Apache-2.0
- [FreyaTTS](https://huggingface.co/freyavoice/Freya-TTS) by Freya Voice (optional): Turkish, Apache-2.0

The choice of Turkish defaults rests on [Freya-TR-Eval](https://huggingface.co/datasets/freyavoice/freya-tr-eval)
by Freya Voice and the independent re-run published by Patientdesk.ai at
https://speech.patientdesk.ai/benchmarks.

## Inspiration

The idea for this project came from a post by Andrej Karpathy: https://x.com/karpathy/status/2105819303471976479
