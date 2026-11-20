import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { routes } from '../routes';

// API Gateway only forwards routes listed in template.yaml; a route missing there works locally but 404s once deployed.
it('template.yaml declares exactly the routes in routes.ts', () => {
  const template = readFileSync(new URL('../../template.yaml', import.meta.url), 'utf8');
  const declared = [...template.matchAll(/Path: (\S+)\s+Method: (\w+)/g)].map(([, path, method]) => `${method} ${path}`);

  expect(declared.sort()).toEqual(routes.map((r) => `${r.method} ${r.path}`).sort());
});
