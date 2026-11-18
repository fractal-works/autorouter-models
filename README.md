# @auto.router/models

Prices, context windows and roles for the AI models [AutoRouter](https://autorouter.com) adds to Codex and Claude Code, as one JSON file. Rebuilt every night; a dated release is cut each day the data changes.

AutoRouter is a Mac app that puts these models in Codex and Claude Code and picks the right one for each task: [autorouter.com](https://autorouter.com).

## Models

USD per million tokens, input / output. "On a plan" is AutoRouter's assumed price when a Claude or ChatGPT plan covers the model. "Plan value" is how many dollars of API-priced use the plan gives per dollar of its fee, so the plan price is the list price divided by it. `*` marks a model with no measurement of its own, which gets its vendor's lowest measured value. The nightly build rewrites this table from `models.json`.

<!-- models:start -->
| Model | Maker | Context | List price | On a plan | Plan value |
| --- | --- | --- | --- | --- | --- |
| Claude Fable 5.2 | Anthropic | 1M | $8 / $40 | $0.721 / $3.6 | 11.1x |
| GPT-6.2 Astra | OpenAI | 1.05M | $8 / $40 | $0.769 / $3.85 | 10.4x* |
| Claude Opus 5.5 | Anthropic | 1M | $4 / $20 | $0.0699 / $0.35 | 57.2x |
| GPT-5.6 Sol | OpenAI | 1.05M | $4 / $20 | $0.385 / $1.92 | 10.4x* |
| Claude Sonnet 5.5 | Anthropic | 1M | $2 / $10 | $0.0338 / $0.169 | 59.2x |
| Gemini 4 Carbon | Google | 1.05M | $2 / $10 | — | — |
| GPT-6 Sol | OpenAI | 1.05M | $2 / $10 | $0.154 / $0.769 | 13x |
| GPT-6.2 Sol | OpenAI | 1.05M | $2 / $10 | $0.192 / $0.962 | 10.4x* |
| Kimi K3.1 Pro | Moonshot AI | 1M | $2 / $10 | — | — |
| Grok 4.7 | xAI | 500K | $2 / $6 | — | — |
| GPT-6.1 Terra | OpenAI | 1.05M | $1 / $5 | $0.0961 / $0.481 | 10.4x* |
| Hy4 | Tencent | 1.05M | $0.417 / $1.25 | — | — |
| GPT-5.6 Luna | OpenAI | 1.05M | $0.2 / $1.2 | $0.0192 / $0.115 | 10.4x* |
| MiniMax M3.1 Flash | MiniMax | 1.05M | $0.15 / $0.6 | — | — |
| Claude Haiku 5.5 | Anthropic | 1M | $0.1 / $0.5 | $0.00901 / $0.045 | 11.1x* |
| GPT-6 Luna | OpenAI | 1.05M | $0.1 / $0.5 | $0.00962 / $0.0481 | 10.4x* |
| Muse Ember | Meta | 1.05M | $0.1 / $0.5 | — | — |
| Crouton Alpha | Unnamed | — | — | — | — |
| DeepSeek V4.1 Flash 1017 | DeepSeek | 1M | — | — | — |
| Gemini 4 Argon | Google | 1.05M | — | — | — |
| Gemini 4 Hydrogen | Google | 1M | — | — | — |
| GLM 5.3 | Z.ai | 1.05M | — | — | — |
| GLM 5.3 Flash | Z.ai | 1M | — | — | — |
| MiMo-V2.6-Flash | Xiaomi | 1.05M | — | — | — |
| MiMo-V2.6-Pro | Xiaomi | 1.05M | — | — | — |
| Muse Spark 1.3 | Meta | 1.05M | — | — | — |
| Muse Spark Open | Meta | 1.05M | — | — | — |
| Muse Wonder | Meta | 1.05M | — | — | — |
| Qwen4 Max | Alibaba | 1M | — | — | — |
<!-- models:end -->

## Use it

Raw file:

```
https://raw.githubusercontent.com/fractal-works/autorouter-models/main/models.json
```

From npm:

```sh
npm install @auto.router/models
```

```js
import { models } from "@auto.router/models";

const opus = models.find((model) => model.id === "anthropic/claude-opus-5-5");
console.log(opus.price.input, opus.price.output); // 4 20
```

From the command line:

```sh
npx @auto.router/models          # the whole file
npx @auto.router/models opus     # models whose id or name matches
```

## Fields

Each entry in `models`:

| Field           | Meaning                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------- |
| `id`            | `vendor/slug`, as AutoRouter names the model                                             |
| `name`          | Display name                                                                             |
| `vendor`        | The id's vendor prefix                                                                   |
| `maker`         | The company that makes the model                                                         |
| `role`          | One line on what the model is good for, as on [autorouter.com/models](https://autorouter.com/models) |
| `contextWindow` | Largest prompt in tokens                                                                 |
| `maxOutput`     | Largest response in tokens                                                               |
| `modalities`    | `input` and `output` types, such as `text` and `image`                                   |
| `price`         | List price in USD per million tokens, or `null` when no public price is known            |
| `subscription`  | AutoRouter's assumed price on a Claude or ChatGPT plan, USD per million tokens, or `null` |

`price` has `input`, `cachedInput` (cache reads) and `output`, plus `source` (where the price was read) and `checked` (the day it was last checked, when known). `longContext`, when present, replaces the rate for prompts over `above` tokens.

`subscription` is `price` divided by `multiple`: a plan's API-priced value per month over its fee, from [SemiAnalysis](https://newsletter.semianalysis.com/p/anthropic-subscriptions-offer-5x) (lowest current tier, agentic workload). `measured: false` means the model has no measurement of its own and gets its vendor's least generous multiple, the way AutoRouter's router prices it. `allowanceCap` is the share of the plan this model may use, when capped.

Units: every price is USD per 1,000,000 tokens; `contextWindow` and `maxOutput` are tokens. The file's `units` field says the same.

Any field without public evidence is `null`. `schema.json` is the JSON Schema for the file.

## Sources

- Model list, names, roles and context windows: AutoRouter's public model list (`list_models` on `https://api.autorouter.com/v1/mcp/public`, no account needed).
- Prices: AutoRouter's published list prices, the ones on [autorouter.com/models](https://autorouter.com/models). A price ships only when it comes from a public list (the vendor's own pricing page or OpenRouter's public API). Other gateway rates are left out, so some models have `price: null`.
- Max output and modalities: [models.dev](https://models.dev) (MIT), from the vendor's own entry or, failing that, its OpenRouter entry.
- Plan value multiples: [SemiAnalysis](https://newsletter.semianalysis.com/p/anthropic-subscriptions-offer-5x), in `data/subscription-value.json`.

To rebuild locally:

```sh
npm install
npm run build
npm test
```

## Licence

Code is MIT (see `LICENSE`). The data in `models.json` is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): use it for anything, and credit AutoRouter with a link to this repository or autorouter.com.
