import fs from "node:fs";
import path from "node:path";

function ensureArg(value, label) {
  if (!value) {
    throw new Error(`Missing ${label}. Usage: node scripts/prepare-training-import.mjs <input.html> <output.html>`);
  }
  return value;
}

const inputPath = ensureArg(process.argv[2], "input path");
const outputPath = ensureArg(process.argv[3], "output path");

const source = fs.readFileSync(inputPath, "utf8");

const titleMatch = source.match(/<meta\s+itemprop="title"\s+content="([^"]+)"/i);
const title = titleMatch?.[1]?.trim() || "Тренировки";

const tableMatches = Array.from(source.matchAll(/<en-table\b[\s\S]*?<\/en-table>/gi), match => match[0].trim());

if (tableMatches.length === 0) {
  throw new Error("No <en-table> blocks found in the source file.");
}

const cleaned = `<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title} — import-ready</title>
  </head>
  <body>
    <h1>${title}</h1>
    ${tableMatches.join("\n\n")}
  </body>
</html>
`;

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, cleaned, "utf8");

console.log(`Prepared ${tableMatches.length} tables`);
console.log(`Output: ${outputPath}`);
