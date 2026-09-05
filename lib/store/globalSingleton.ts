/**
 * Next.js dev mode compiles each Route Handler file into its own webpack
 * bundle on demand, so a plain `const x = new Map()` at module scope is not
 * actually shared across route handlers — each bundle gets its own instance
 * of the module. `globalThis` is the one thing every bundle in the same
 * Node process really does share, so singletons are anchored there instead.
 */
declare global {
  // eslint-disable-next-line no-var
  var __bidstreamSingletons: Record<string, unknown> | undefined;
}

export function globalSingleton<T>(key: string, init: () => T): T {
  globalThis.__bidstreamSingletons ??= {};
  const store = globalThis.__bidstreamSingletons;
  if (!(key in store)) {
    store[key] = init();
  }
  return store[key] as T;
}
