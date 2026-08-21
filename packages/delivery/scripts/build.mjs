import { execSync } from "node:child_process";
import { copyFileSync, mkdirSync, renameSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

execSync("tsc -p tsconfig.json", { cwd: root, stdio: "inherit" });
execSync("tsc -p tsconfig.esm.json", { cwd: root, stdio: "inherit" });

const esmOut = join(root, "dist", "esm");
const esmEntry = join(esmOut, "index.js");
const finalEsm = join(root, "dist", "index.mjs");
const dts = join(root, "dist", "index.d.ts");

if (existsSync(esmEntry)) {
  renameSync(esmEntry, finalEsm);
  if (existsSync(join(esmOut, "index.d.ts"))) {
    copyFileSync(join(esmOut, "index.d.ts"), dts);
  }
  rmSync(esmOut, { recursive: true, force: true });
}

console.log("build: dist/index.js (CJS) + dist/index.mjs (ESM) + dist/index.d.ts");
