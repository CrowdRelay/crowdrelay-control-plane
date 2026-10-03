/**
 * Every source file under `src/` as raw text, loaded on demand — the
 * Inventory tab parses imports out of them.
 *
 * Kept in a plain `.ts` file on purpose: Vite's dependency scanner fails to
 * parse a `.tsx` file that calls `import.meta.glob`, and a failed scan turns
 * off dependency pre-bundling for the whole dev server. Every lazy chunk
 * (the command palette, for one) then forces a full page reload the first
 * time it pulls in a new library.
 */
export async function loadSourceFiles(): Promise<Map<string, string>> {
  const loaders = import.meta.glob(['/src/**/*.ts', '/src/**/*.tsx', '!/src/pages/styleguide/**'], { query: '?raw', import: 'default' })
  const sources = new Map<string, string>()
  await Promise.all(Object.entries(loaders).map(async ([abs, load]) => {
    sources.set(abs.replace(/^\/src\//, ''), (await load()) as string)
  }))
  return sources
}
