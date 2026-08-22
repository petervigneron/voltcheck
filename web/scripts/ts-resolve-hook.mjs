// Node hooks for running this app's own modules under --experimental-strip-types.
//
// Three things Node will not do that the bundler does:
//
//   resolve  the web code imports relative modules extensionless, while plain
//            Node ESM demands the ".ts". Retry a failed relative resolution
//            with the extension appended instead of rewriting the lib's
//            imports into something the bundler would then have to be taught.
//   alias    "@/..." is tsconfig's path alias for the web root.
//   load     Node strips types but does not transform JSX, so a .tsx file has
//            to go through TypeScript itself. This is what lets a component
//            be rendered in a test rather than only reasoned about.
//   json     the bundler imports a .json file as a module with a default
//            export; plain Node ESM refuses one without an import attribute
//            the bundler doesn't want. Without this, the bundled-snapshot
//            fallback in lib/listings/source.ts is untestable — and that is
//            the path the site takes during an outage, the one most worth a
//            test. Measured at 677 ms for the real 50 MB snapshot.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs <script>
import { createRequire, registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

// typescript is loaded lazily, on the first .tsx file only: the alerts
// workflow (alerts.yml) runs this hook with NO npm install on the runner —
// send-alerts.mjs imports only dependency-free lib modules — and a top-level
// import here would crash that job at startup. require() is sync, which the
// load hook needs anyway.
let _ts = null;
const requireTs = () => (_ts ??= createRequire(import.meta.url)("typescript"));

const WEB_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const base = pathToFileURL(resolvePath(WEB_ROOT, specifier.slice(2))).href;
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
        try {
          return nextResolve(candidate, context);
        } catch {
          // try the next extension
        }
      }
    }
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier)) {
        for (const ext of [".ts", ".tsx"]) {
          try {
            return nextResolve(`${specifier}${ext}`, context);
          } catch {
            // try the next extension
          }
        }
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = readFileSync(fileURLToPath(url), "utf8");
      return { format: "module", source: `export default ${source}`, shortCircuit: true };
    }
    if (url.endsWith(".tsx")) {
      const ts = requireTs();
      const source = readFileSync(fileURLToPath(url), "utf8");
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
        fileName: url,
      });
      return { format: "module", source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
