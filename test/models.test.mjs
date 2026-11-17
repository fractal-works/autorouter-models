/** Checks models.json against schema.json and catches swapped price columns. */

import assert from "node:assert/strict";
import { test } from "node:test";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import schema from "../schema.json" with { type: "json" };
import data, { models } from "../index.js";

test("models.json matches schema.json", () => {
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  assert.ok(validate(data), JSON.stringify(validate.errors, null, 2));
});

test("ids are unique and prices are in input, cached, output order", () => {
  assert.equal(new Set(models.map((m) => m.id)).size, models.length);
  for (const { id, price } of models) {
    for (const rate of [price, price?.longContext].filter(Boolean)) {
      assert.ok(rate.cachedInput <= rate.input, `${id} cached above input`);
      assert.ok(rate.input <= rate.output, `${id} input above output`);
    }
  }
});
