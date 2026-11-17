# @autorouter/models

Prices, context windows and roles for the AI models [AutoRouter](https://autorouter.com) adds to Codex and Claude Code, as one JSON file. Rebuilt every night; a dated release is cut each day the data changes.

AutoRouter is a Mac app that puts these models in Codex and Claude Code and picks the right one for each task: [autorouter.com](https://autorouter.com).

## Use it

Raw file:

```
https://raw.githubusercontent.com/fractal-works/autorouter-models/main/models.json
```

From npm:

```sh
npm install @autorouter/models
```

```js
import { models } from "@autorouter/models";

const opus = models.find((model) => model.id === "anthropic/claude-opus-5-5");
console.log(opus.price.input, opus.price.output); // 4 20
```

From the command line:

```sh
npx @autorouter/models          # the whole file
npx @autorouter/models opus     # models whose id or name matches
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

`price` has `input`, `cachedInput` (cache reads) and `output`, plus `source` (where the price was read) and `checked` (the day it was last checked, when known). `longContext`, when present, replaces the rate for prompts over `above` tokens.

Any field without public evidence is `null`. `schema.json` is the JSON Schema for the file.

## Sources

- Model list, names, roles and context windows: AutoRouter's public model list (`list_models` on `https://api.autorouter.com/v1/mcp/public`, no account needed).
- Prices: AutoRouter's published list prices, the ones on [autorouter.com/models](https://autorouter.com/models). A price ships only when it comes from a public list (the vendor's own pricing page or OpenRouter's public API). Other gateway rates are left out, so some models have `price: null`.
- Max output and modalities: [OpenRouter's public models API](https://openrouter.ai/api/v1/models).

To rebuild locally:

```sh
npm install
npm run build
npm test
```

## Licence

Code is MIT (see `LICENSE`). The data in `models.json` is [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/): use it for anything, and credit AutoRouter with a link to this repository or autorouter.com.
