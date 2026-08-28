import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import * as addFormatsModule from 'ajv-formats';

export type SchemaRegistry = Map<string, ValidateFunction>;

const inboundSchemaFiles: Readonly<Record<string, string>> = {
  'ppd.cos.intake.v1': 'intake-event.v1.schema.json',
  'ppd.cos.clarification-answer.v1': 'clarification-answer.v1.schema.json',
  'ppd.cos.approval-decision.v1': 'approval-decision.v1.schema.json',
};

export function createSchemaRegistry(directory: string): SchemaRegistry {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    // Conditional required fields are declared at the approved schema root.
    strictRequired: false,
  });
  addFormatsModule.default.default(ajv);

  const registry: SchemaRegistry = new Map();
  for (const [version, filename] of Object.entries(inboundSchemaFiles)) {
    const schema = JSON.parse(readFileSync(path.join(directory, filename), 'utf8')) as object;
    registry.set(version, ajv.compile(schema));
  }
  return registry;
}
