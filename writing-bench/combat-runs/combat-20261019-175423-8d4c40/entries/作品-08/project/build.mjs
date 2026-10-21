#!/usr/bin/env node
/**
 * Build the standalone game.html from src/.
 * No external assets or network dependencies are used at runtime.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(root, "src");
const partsDir = path.join(srcDir, "parts");

const parts = fs
  .readdirSync(partsDir)
  .filter((f) => f.endsWith(".js"))
  .sort();

const jsBody = parts
  .map((f) => {
    const code = fs.readFileSync(path.join(partsDir, f), "utf8");
    return `/* ===== ${f} ===== */\n${code}`;
  })
  .join("\n");

const js = `(function () {\n"use strict";\n${jsBody}\n})();\n`;
const fontPath = path.join(srcDir, "assets", "CombatSerif-subset.ttf");
const fontB64 = fs.readFileSync(fontPath).toString("base64");
const fontFace = `@font-face {\n  font-family: "CombatSerif";\n  src: url(data:font/ttf;base64,${fontB64}) format("truetype");\n  font-weight: 100 900;\n  font-style: normal;\n  font-display: block;\n}\n`;
const css = fontFace + fs.readFileSync(path.join(srcDir, "style.css"), "utf8");
const template = fs.readFileSync(path.join(srcDir, "index.html"), "utf8");

let html = template
  .replace(
    /<link rel="stylesheet" href="style\.css">/,
    `<style>\n${css}\n</style>`
  )
  .replace(
    /<!-- BUILD:SCRIPTS -->[\s\S]*?<!-- \/BUILD:SCRIPTS -->/,
    `<script>\n${js}\n</script>`
  );

fs.writeFileSync(path.join(root, "game.html"), html);
fs.writeFileSync(path.join(root, "dist", "game.bundle.js"), js);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`Built game.html (${kb} KB) from ${parts.length} source parts:`);
console.log(parts.map((p) => "  - " + p).join("\n"));
