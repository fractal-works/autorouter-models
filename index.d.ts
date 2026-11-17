/** Types for the AutoRouter models dataset. Prices are USD per million tokens. */

export type Rate = { input: number; cachedInput: number; output: number };

export type Model = {
  /** `vendor/slug`, as AutoRouter names the model. */
  id: string;
  name: string;
  vendor: string;
  maker: string | null;
  /** One line on what the model is good for. */
  role: string | null;
  contextWindow: number | null;
  maxOutput: number | null;
  modalities: { input: string[]; output: string[] } | null;
  /** Null when no public list price is known. */
  price:
    | (Rate & {
        /** Replaces the rate for prompts over `above` tokens. */
        longContext?: Rate & { above: number };
        source: string;
        checked: string | null;
      })
    | null;
};

export type Dataset = {
  description: string;
  sources: Record<string, string>;
  models: Model[];
};

export declare const models: Model[];
declare const data: Dataset;
export default data;
