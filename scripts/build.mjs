import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = path.join(root, "dist/slack-math-viewer");
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, "extension"), target, { recursive: true });
await mkdir(path.join(target, "vendor"));
for (const name of ["katex.min.js", "katex.min.css", "fonts"]) {
  await cp(path.join(root, "node_modules/katex/dist", name), path.join(target, "vendor", name), { recursive: true });
}
// Content-script CSS resolves relative URLs against the host page, not this file.
// Chrome substitutes its built-in extension ID token when injecting the stylesheet.
const cssPath = path.join(target, "vendor/katex.min.css");
const css = await readFile(cssPath, "utf8");
await writeFile(cssPath, css.replaceAll("url(fonts/", "url(chrome-extension://__MSG_@@extension_id__/vendor/fonts/"));
await cp(path.join(root, "node_modules/katex/LICENSE"), path.join(target, "vendor/KATEX-LICENSE.txt"));
await cp(path.join(root, "README.md"), path.join(target, "README.md"));
const { version } = JSON.parse(await readFile(path.join(root, "node_modules/katex/package.json"), "utf8"));
await writeFile(path.join(target, "vendor/VERSION.txt"), `KaTeX ${version}\nhttps://katex.org\n`);
console.log(`Built unpacked extension: ${target}`);
