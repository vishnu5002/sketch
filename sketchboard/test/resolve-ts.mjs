// Lets `node --test` load the app's TypeScript modules directly: Node strips
// the types itself, and this resolves extensionless imports ("./id") to .ts files.
import { register } from "node:module";

register(
  "data:text/javascript," +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (/^\\.{1,2}\\//.test(specifier) && !/\\.[cm]?[jt]sx?$/.test(specifier)) {
    try {
      return await next(specifier + ".ts", context);
    } catch {}
  }
  return next(specifier, context);
}`),
);
