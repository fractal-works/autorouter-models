#!/usr/bin/env node
/** Prints the dataset as JSON, or one model when given its id or a name fragment. */

import data from "./models.json" with { type: "json" };

const query = process.argv[2]?.toLowerCase();
const output = query
  ? data.models.filter((m) => m.id === query || m.name.toLowerCase().includes(query))
  : data;
console.log(JSON.stringify(output, null, 2));
