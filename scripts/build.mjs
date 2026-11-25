/**
 * Builds the extension into dist/chrome and dist/firefox, and (unless --dev) the store packages
 * release/sudoo-extension-<version>-chrome.zip and -firefox.zip. No remote code: everything is bundled here.
 *
 *   node scripts/build.mjs            production build + zips
 *   node scripts/build.mjs --dev      unminified, with source maps, no zips
 *   node scripts/build.mjs --dev --watch
 */

import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import { zipDirectory } from "./zip.mjs";

/** Repository root, one folder above scripts/. */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/** True for a development build: unminified, with linked source maps and no store packages. */
const dev = process.argv.includes("--dev");
/** True when the bundler should keep running and rebuild when a source file changes. */
const watch = process.argv.includes("--watch");
/** Contents of package.json; its version must match the manifest's. */
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
/** Folder of the Chrome build, dist/chrome. The Firefox build is copied from it. */
const out = join(root, "dist", "chrome");

/** Contents of static/manifest.json. */
const manifest = JSON.parse(readFileSync(join(root, "static", "manifest.json"), "utf8"));
if (manifest.version !== pkg.version)
  throw new Error(`manifest ${manifest.version} and package.json ${pkg.version} differ`);

rmSync(join(root, "dist"), { recursive: true, force: true });
mkdirSync(out, { recursive: true });

/**
 * Bundler options shared by all builds: bundle everything (no remote code), minify outside development, and target the
 * oldest supported Chrome and Firefox.
 */
const common = {
  bundle: true,
  minify: !dev,
  sourcemap: dev ? "linked" : false,
  target: ["chrome121", "firefox128"],
  legalComments: "none",
  logLevel: "info",
  define: { "process.env.NODE_ENV": dev ? '"development"' : '"production"' },
};

/**
 * The two bundler runs: the background worker and the pages as ES modules, and the GitHub content script as a plain
 * script, because a content script cannot be a module.
 */
const builds = [
  // pages and the service worker are modules; a content script cannot be one
  {
    ...common,
    format: "esm",
    entryPoints: {
      background: "src/background.ts",
      "popup/popup": "src/popup/popup.ts",
      "options/options": "src/options/options.ts",
    },
    outdir: out,
  },
  { ...common, format: "iife", entryPoints: { "content/github": "src/content/github.ts" }, outdir: out },
];

/**
 * Copies the files that are not bundled (static assets, the popup and options HTML and CSS, the shared stylesheet and
 * the licence) into the Chrome build folder.
 */
function copyStatic() {
  cpSync(join(root, "static"), out, { recursive: true });
  for (const file of ["popup/popup.html", "popup/popup.css", "options/options.html", "options/options.css", "ui.css"]) {
    mkdirSync(dirname(join(out, file)), { recursive: true });
    cpSync(join(root, "src", file), join(out, file));
  }
  cpSync(join(root, "LICENSE"), join(out, "LICENSE"));
}

/** Firefox reads Manifest V3 too, with a background script instead of a service worker and its own id. */
function firefox() {
  const target = join(root, "dist", "firefox");
  rmSync(target, { recursive: true, force: true });
  cpSync(out, target, { recursive: true });
  const ff = structuredClone(manifest);
  delete ff.minimum_chrome_version;
  ff.background = { scripts: ["background.js"], type: "module" };
  ff.browser_specific_settings = {
    gecko: {
      id: "extension@sudoo.sh",
      strict_min_version: "128.0",
      data_collection_permissions: { required: ["none"] },
    },
  };
  writeFileSync(join(target, "manifest.json"), `${JSON.stringify(ff, null, 2)}\n`);
  return target;
}

if (watch) {
  copyStatic();
  for (const options of builds) await (await esbuild.context(options)).watch();
  console.log(`watching; load ${out} as an unpacked extension`);
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
  copyStatic();
  const ff = firefox();
  if (!dev) {
    mkdirSync(join(root, "release"), { recursive: true });
    const chromeZip = join(root, "release", `sudoo-extension-${pkg.version}-chrome.zip`);
    const firefoxZip = join(root, "release", `sudoo-extension-${pkg.version}-firefox.zip`);
    zipDirectory(out, chromeZip);
    zipDirectory(ff, firefoxZip);
    console.log(`\n${chromeZip}\n${firefoxZip}`);
  }
}
