/**
 * Node.js custom loader — resolves extensionless TS imports inside src/.
 * Handles both bare relative imports (no ext) and directory imports (index.ts).
 * Usage: node --loader ./test/ts-resolve.mjs --experimental-strip-types test/foo.test.ts
 */

import { resolve as pathResolve, extname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync, statSync } from 'fs';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && extname(specifier) === '') {
    const parentDir = context.parentURL
      ? fileURLToPath(new URL('.', context.parentURL))
      : process.cwd();
    const base = pathResolve(parentDir, specifier);

    // Try base.ts first
    const withTs = base + '.ts';
    if (existsSync(withTs)) {
      return nextResolve(pathToFileURL(withTs).href, context);
    }

    // Try directory/index.ts
    const indexTs = pathResolve(base, 'index.ts');
    if (existsSync(indexTs)) {
      return nextResolve(pathToFileURL(indexTs).href, context);
    }
  }
  return nextResolve(specifier, context);
}
