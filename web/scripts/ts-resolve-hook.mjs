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
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs <script>
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import ts from "typescript";

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
    if (url.endsWith(".tsx")) {
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
