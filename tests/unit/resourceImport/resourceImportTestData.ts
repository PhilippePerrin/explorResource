import fs from 'node:fs';
import path from 'node:path';

export const RESOURCE_IMPORT_FIXTURE_PATH = path.join(
  process.cwd(),
  'tests',
  'fixtures',
  'export-resource.xlsx',
);

export function readResourceImportFixtureBuffer(): ArrayBuffer {
  const file = fs.readFileSync(RESOURCE_IMPORT_FIXTURE_PATH);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}
