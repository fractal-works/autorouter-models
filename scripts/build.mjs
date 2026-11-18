/**
 * Regenerates models.json from public sources only:
 * - AutoRouter's public MCP server (no account) for the model list, names,
 *   roles and context windows.
 * - autorouter.com's calculator script for AutoRouter's published list
 *   prices, kept only for models whose price has a named public source.
 * - models.dev (MIT) for max output and modalities: the vendor's own entry,
 *   else models.dev's OpenRouter entry for the model.
 * - data/subscription-value.json, AutoRouter's assumed API-equivalent value of
 *   Claude and ChatGPT plans, kept by hand from the router's reviewed table.
 * Prints one line per added, removed or changed model, so the nightly job
 * can write release notes. Exits non-zero rather than write a partial file.
 */

import { readFile, writeFile } from "node:fs/promises";

// -----------------------------------------------------------------------------
// Entry point
// -----------------------------------------------------------------------------

const MCP_URL = "https://api.autorouter.com/v1/mcp/public";
const PRICES_URL = "https://autorouter.com/calculator.js";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/models";
const MODELS_DEV_URL = "https://models.dev/api.json";
const target = new URL("../models.json", import.meta.url);
const readme = new URL("../README.md", import.meta.url);
const VALUE = JSON.parse(
  await readFile(new URL("../data/subscription-value.json", import.meta.url), "utf8"),
);

/** Fetches every source, then writes models.json and prints its changes. */
async function main() {
  const [listed, prices, catalog] = await Promise.all([
    listModels(),
    listPrices(),
    modelsDev(),
  ]);
  const models = listed
    .map((model) => entry(model, prices, catalog))
    .sort((a, b) => a.id.localeCompare(b.id));
  const data = {
    $schema: "./schema.json",
    description:
      "AI models AutoRouter adds to Codex and Claude Code: list prices, assumed prices on a Claude or ChatGPT plan, context windows and roles. https://autorouter.com/models",
    units: {
      price: "USD per 1,000,000 tokens",
      subscription: "USD per 1,000,000 tokens, list price divided by the plan's value multiple",
      contextWindow: "tokens",
      maxOutput: "tokens",
    },
    sources: {
      models: MCP_URL,
      prices: "https://autorouter.com/models",
      limits: MODELS_DEV_URL,
      subscription: VALUE.source,
    },
    subscriptionValue: {
      measured: VALUE.measured,
      workload: VALUE.workload,
      note: VALUE.note,
    },
    models,
  };
  const previous = JSON.parse(
    await readFile(target, "utf8").catch(() => '{"models":[]}'),
  );
  await writeFile(target, `${JSON.stringify(data, null, 2)}\n`);
  await writeFile(readme, withTable(await readFile(readme, "utf8"), models));
  for (const line of changes(previous.models, models)) console.log(line);
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/** AutoRouter's recommended models, from the public MCP `list_models` tool. */
async function listModels() {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "list_models",
        arguments: { recommendedOnly: true, limit: 40 },
      },
    }),
  });
  if (!response.ok) throw new Error(`${MCP_URL}: HTTP ${response.status}`);
  const text = await response.text();
  // Streamable HTTP answers with one SSE `data:` line, or plain JSON.
  const json = JSON.parse(text.match(/^data: (.*)$/m)?.[1] ?? text);
  const models = json.result?.structuredContent?.models;
  if (!Array.isArray(models) || models.length < 10)
    throw new Error(`${MCP_URL}: expected a model list, got ${text.slice(0, 200)}`);
  return models;
}

/**
 * AutoRouter's published list prices, by model slug, read from the table
 * autorouter.com's calculator ships: `"slug":f("vendor",input,cached,output)`,
 * with an optional long-prompt rate.
 */
async function listPrices() {
  const response = await fetch(PRICES_URL);
  if (!response.ok) throw new Error(`${PRICES_URL}: HTTP ${response.status}`);
  const source = await response.text();
  const number = String.raw`(\d*\.?\d+(?:e\d+)?)`;
  const rate = new RegExp(
    String.raw`"?([a-z0-9][a-z0-9.-]*)"?:(?:\{\.\.\.)?[\w$]+\("[a-z]+",${number},${number},${number}\)(?:,long:\{above:${number},input:${number},cached:${number},output:${number}\}\})?`,
    "g",
  );
  const prices = new Map();
  for (const m of source.matchAll(rate)) {
    const [, slug, input, cached, output, above, li, lc, lo] = m;
    prices.set(slug, {
      input: Number(input),
      cachedInput: Number(cached),
      output: Number(output),
      ...(above && {
        longContext: {
          above: Number(above),
          input: Number(li),
          cachedInput: Number(lc),
          output: Number(lo),
        },
      }),
    });
  }
  // ponytail: parses minified JS; if the bundle changes shape the build fails
  // here instead of shipping empty prices. Upgrade path: a JSON endpoint.
  if (prices.size < 10)
    throw new Error(`${PRICES_URL}: found ${prices.size} prices, expected 10+`);
  return prices;
}

/** models.dev's catalog: providers, each with its models by id. */
async function modelsDev() {
  const response = await fetch(MODELS_DEV_URL);
  if (!response.ok)
    throw new Error(`${MODELS_DEV_URL}: HTTP ${response.status}`);
  const catalog = await response.json();
  if (!catalog.anthropic?.models || !catalog.openrouter?.models)
    throw new Error(`${MODELS_DEV_URL}: unexpected shape`);
  return catalog;
}

/** One dataset entry. Fields with no public evidence are null. */
function entry(model, prices, catalog) {
  const [vendor, slug] = model.id.split("/");
  const source = PRICE_SOURCES[slug];
  const price = source && prices.get(slug);
  const limits = modelsDevMatch(vendor, slug, catalog);
  return {
    id: model.id,
    name: model.name,
    vendor,
    maker: MAKERS[vendor] ?? null,
    role: model.role ?? null,
    contextWindow: model.contextWindow ?? null,
    maxOutput: limits?.limit?.output ?? null,
    modalities: limits?.modalities
      ? {
          input: [...limits.modalities.input].sort(),
          output: [...limits.modalities.output].sort(),
        }
      : null,
    price: price ? { ...price, ...source } : null,
    subscription: price ? subscription(model.id, vendor, price) : null,
  };
}

/**
 * The list price divided by the plan's value multiple, as AutoRouter's router
 * assumes it. Mirrors the router: a model without its own measurement gets its
 * vendor's least generous measured multiple. Only Claude and ChatGPT plans are
 * measured; other vendors get null.
 */
function subscription(id, vendor, price) {
  const exact = VALUE.entries.find((entry) => entry.model === id);
  const ofVendor = VALUE.entries.filter((entry) => entry.model.startsWith(`${vendor}/`));
  if (!exact && !ofVendor.length) return null;
  const multiple = exact?.multiple ?? Math.min(...ofVendor.map((entry) => entry.multiple));
  return {
    multiple,
    measured: Boolean(exact),
    plans: exact?.plans ?? null,
    allowanceCap: exact?.allowanceCap ?? null,
    input: scale(price.input, multiple),
    cachedInput: scale(price.cachedInput, multiple),
    output: scale(price.output, multiple),
  };
}

/** Four significant digits, like the router's covered rates. */
function scale(value, multiple) {
  return Number((value / multiple).toPrecision(4));
}

/**
 * The models.dev entry for an AutoRouter id: the vendor's own provider first,
 * else models.dev's OpenRouter provider. Both spell some vendors and versions
 * differently: `moonshotai`, `x-ai`, `glm-5.3` for `glm-5p3`.
 */
function modelsDevMatch(vendor, slug, catalog) {
  const dotted = slug.replace(/(\d)[-p](\d)$/, "$1.$2");
  const own = catalog[MODELS_DEV_VENDORS[vendor] ?? vendor]?.models;
  const prefix = OPENROUTER_VENDORS[vendor] ?? vendor;
  const routed = catalog.openrouter.models;
  return (
    own?.[slug] ??
    own?.[dotted] ??
    routed[`${prefix}/${slug}`] ??
    routed[`${prefix}/${dotted}`]
  );
}

/**
 * README with the models table between its markers replaced, so the table
 * ships with every data change. Most expensive first; unpriced models last.
 */
function withTable(text, models) {
  const rows = [...models]
    .sort(
      (a, b) =>
        (b.price?.output ?? -1) - (a.price?.output ?? -1) ||
        a.name.localeCompare(b.name),
    )
    .map((model) =>
      [
        model.name,
        model.maker ?? model.vendor,
        tokens(model.contextWindow),
        rate(model.price),
        rate(model.subscription),
        multiple(model.subscription),
      ].join(" | "),
    );
  const table = [
    "| Model | Maker | Context | List price | On a plan | Plan value |",
    "| --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row} |`),
  ].join("\n");
  if (!/<!-- models:start -->[\s\S]*<!-- models:end -->/.test(text))
    throw new Error("README.md: models table markers not found");
  return text.replace(
    /<!-- models:start -->[\s\S]*<!-- models:end -->/,
    `<!-- models:start -->\n${table}\n<!-- models:end -->`,
  );
}

function tokens(count) {
  if (!count) return "—";
  return count >= 1e6
    ? `${+(count / 1e6).toFixed(2)}M`
    : `${Math.round(count / 1e3)}K`;
}

/** `57.2x`, or `10.4x*` when the vendor's least generous multiple stands in. */
function multiple(subscription) {
  if (!subscription) return "—";
  return `${subscription.multiple}x${subscription.measured ? "" : "*"}`;
}

function rate(price) {
  const usd = (value) => `$${+value.toPrecision(3)}`;
  return price ? `${usd(price.input)} / ${usd(price.output)}` : "—";
}

/** Release-note lines: each added, removed or changed model id. */
function changes(before, after) {
  const old = new Map(before.map((model) => [model.id, JSON.stringify(model)]));
  const now = new Set(after.map((model) => model.id));
  return [
    ...after
      .filter((model) => !old.has(model.id))
      .map((model) => `- Added ${model.id}`),
    ...before
      .filter((model) => !now.has(model.id))
      .map((model) => `- Removed ${model.id}`),
    ...after
      .filter(
        (model) => old.has(model.id) && old.get(model.id) !== JSON.stringify(model),
      )
      .map((model) => `- Updated ${model.id}`),
  ];
}

/**
 * Where each published price comes from. A model's price ships only when it
 * has a public source here. Gateway prices that are not public are left out:
 * those models get `price: null`.
 */
const ANTHROPIC = {
  source: "https://platform.claude.com/docs/en/about-claude/pricing",
  checked: "2026-11-09",
};
const OPENAI = { source: "https://openai.com/api/pricing", checked: null };
const OPENROUTER = { source: OPENROUTER_URL, checked: "2026-11-11" };
const PRICE_SOURCES = {
  "claude-fable-5-2": ANTHROPIC,
  "claude-opus-5-5": ANTHROPIC,
  "claude-sonnet-5-5": ANTHROPIC,
  "claude-haiku-5-5": ANTHROPIC,
  "gpt-6.2-astra": { ...OPENAI, checked: "2026-11-17" },
  "gpt-6.2-sol": { ...OPENAI, checked: "2026-11-17" },
  "gpt-6-sol": OPENAI,
  "gpt-6-luna": OPENAI,
  "gpt-5.6-sol": OPENAI,
  "gpt-5.6-luna": OPENAI,
  "gpt-6.1-terra": OPENROUTER,
  "gemini-4-carbon": OPENROUTER,
  "kimi-k3.1-pro": OPENROUTER,
  "muse-ember": OPENROUTER,
  "grok-4.7": OPENROUTER,
  hy4: OPENROUTER,
  "minimax-m3.1-flash": OPENROUTER,
};

/** Makers by id prefix, as autorouter.com/models writes them. */
const MAKERS = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  moonshot: "Moonshot AI",
  meta: "Meta",
  xai: "xAI",
  tencent: "Tencent",
  qwen: "Alibaba",
  deepseek: "DeepSeek",
  zai: "Z.ai",
  xiaomi: "Xiaomi",
  minimax: "MiniMax",
  stealth: "Unnamed",
};

const MODELS_DEV_VENDORS = { moonshot: "moonshotai", qwen: "alibaba" };
const OPENROUTER_VENDORS = { moonshot: "moonshotai", xai: "x-ai", zai: "z-ai" };

// Called last: the tables above are consts, not hoisted.
await main();
