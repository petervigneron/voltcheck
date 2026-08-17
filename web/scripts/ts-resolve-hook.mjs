// Node resolve hook for running lib/*.ts under --experimental-strip-types:
// the web code imports relative modules extensionless (the bundler's
// convention), while plain Node ESM demands the ".ts". Retry failed relative
// resolutions with the extension appended instead of rewriting the lib's
// imports into something the bundler would then have to be taught.
//
//   node --experimental-strip-types --import ./scripts/ts-resolve-hook.mjs <script>
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier)) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
});
