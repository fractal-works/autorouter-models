/**
 * Regenerates models.json from public sources only:
 * - AutoRouter's public MCP server (no account) for the model list, names,
 *   roles and context windows.
 * - autorouter.com's calculator script for AutoRouter's published list
 *   prices, kept only for models whose price has a named public source.
 * - OpenRouter's public models API for max output and modalities.
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
const target = new URL("../models.json", import.meta.url);

/** Fetches every source, then writes models.json and prints its changes. */
async function main() {
  const [listed, prices, openrouter] = await Promise.all([
    listModels(),
    listPrices(),
    openRouterModels(),
  ]);
  const models = listed
    .map((model) => entry(model, prices, openrouter))
    .sort((a, b) => a.id.localeCompare(b.id));
  const data = {
    $schema: "./schema.json",
    description:
      "AI models AutoRouter adds to Codex and Claude Code: list prices in USD per million tokens, context windows and roles. https://autorouter.com/models",
    sources: {
      models: MCP_URL,
      prices: "https://autorouter.com/models",
      limits: OPENROUTER_URL,
    },
    models,
  };
  const previous = JSON.parse(
    await readFile(target, "utf8").catch(() => '{"models":[]}'),
  );
  await writeFile(target, `${JSON.stringify(data, null, 2)}\n`);
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

/** OpenRouter's public model list, by id. */
async function openRouterModels() {
  const response = await fetch(OPENROUTER_URL);
  if (!response.ok)
    throw new Error(`${OPENROUTER_URL}: HTTP ${response.status}`);
  const { data } = await response.json();
  return new Map(data.map((model) => [model.id, model]));
}

/** One dataset entry. Fields with no public evidence are null. */
function entry(model, prices, openrouter) {
  const [vendor, slug] = model.id.split("/");
  const source = PRICE_SOURCES[slug];
  const price = source && prices.get(slug);
  const limits = openRouterMatch(vendor, slug, openrouter);
  return {
    id: model.id,
    name: model.name,
    vendor,
    maker: MAKERS[vendor] ?? null,
    role: model.role ?? null,
    contextWindow: model.contextWindow ?? null,
    maxOutput: limits?.top_provider?.max_completion_tokens ?? null,
    modalities: limits
      ? {
          input: [...limits.architecture.input_modalities].sort(),
          output: [...limits.architecture.output_modalities].sort(),
        }
      : null,
    price: price ? { ...price, ...source } : null,
  };
}

/**
 * The OpenRouter entry for an AutoRouter id. OpenRouter spells some vendors
 * and versions differently: `moonshotai`, `claude-opus-5.5`, `glm-5.3`.
 */
function openRouterMatch(vendor, slug, openrouter) {
  const prefix = OPENROUTER_VENDORS[vendor] ?? vendor;
  const dotted = slug.replace(/(\d)[-p](\d)$/, "$1.$2");
  return (
    openrouter.get(`${prefix}/${slug}`) ?? openrouter.get(`${prefix}/${dotted}`)
  );
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

const OPENROUTER_VENDORS = { moonshot: "moonshotai", xai: "x-ai", zai: "z-ai" };

// Called last: the tables above are consts, not hoisted.
await main();
