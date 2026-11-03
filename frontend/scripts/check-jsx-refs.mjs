#!/usr/bin/env node
/**
 * Every capitalised JSX tag must be imported or defined in its own file.
 *
 * This exists because two blank-page crashes reached production in one day —
 * a missing lucide-react import and a const read before its declaration.
 * `npm run build` emits a bundle for both, and eslint did not flag the
 * missing import either, so nothing between the editor and the user said a
 * word. This does.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (/\.jsx?$/.test(p) ? [p] : []);
});

let problems = 0;
for (const file of walk(ROOT)) {
  const src = readFileSync(file, "utf8");

  const scope = new Set(["Fragment", "React"]);
  for (const m of src.matchAll(/import\s+(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*from/g)) {
    if (m[1]) scope.add(m[1].trim());
    for (const part of (m[2] || "").split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name) scope.add(name);
    }
  }
  for (const m of src.matchAll(/import\s+\*\s+as\s+([\w$]+)/g)) scope.add(m[1]);
  for (const m of src.matchAll(/(?:function|class)\s+([A-Z][\w$]*)/g)) scope.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z][\w$]*)\s*[=(]/g)) scope.add(m[1]);
  // Renamed in a destructuring pattern, including function props:
  //   function Tile({ icon: Icon = Upload })  →  Icon is in scope
  for (const m of src.matchAll(/[{,]\s*[\w$]+\s*:\s*([A-Z][\w$]*)\s*[=,}]/g)) scope.add(m[1]);
  for (const m of src.matchAll(/(?:const|let|var)\s*\{([^}]*)\}\s*=/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(":").pop().trim();
      if (/^[A-Z]/.test(name)) scope.add(name);
    }
  }

  const used = new Set();
  for (const m of src.matchAll(/<([A-Z][\w$]*)[\s/>]/g)) used.add(m[1]);

  // A dotted tag (<Foo.Bar />) only needs Foo.
  const missing = [...used].filter((n) => !scope.has(n.split(".")[0]));
  if (missing.length) {
    problems += missing.length;
    console.error(`${relative(ROOT, file)}: ${missing.join(", ")} used but not imported or defined`);
  }
}

if (problems) {
  console.error(`\n${problems} undefined component reference(s) — these render as a blank page.`);
  process.exit(1);
}
console.log("All JSX component references resolve.");
