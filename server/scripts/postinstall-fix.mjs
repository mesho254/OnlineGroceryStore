import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Patches `buffer-equal-constant-time/index.js` inside `node_modules` so that
 * `require('buffer').SlowBuffer` safely falls back to `Buffer` on Node 22/24/25+
 * and Vercel serverless functions (where `SlowBuffer` is undefined).
 */
const candidatePaths = [
    path.resolve(__dirname, "..", "node_modules", "buffer-equal-constant-time", "index.js"),
    path.resolve(__dirname, "..", "..", "node_modules", "buffer-equal-constant-time", "index.js"),
];

for (const targetFile of candidatePaths) {
    try {
        if (!fs.existsSync(targetFile)) continue;
        const original = fs.readFileSync(targetFile, "utf8");
        if (original.includes("require('buffer').SlowBuffer || Buffer")) {
            continue;
        }
        const patched = original.replace(
            "var SlowBuffer = require('buffer').SlowBuffer;",
            "var SlowBuffer = require('buffer').SlowBuffer || Buffer;"
        );
        if (patched !== original) {
            fs.writeFileSync(targetFile, patched, "utf8");
            console.log(`[postinstall-fix] Patched SlowBuffer in ${targetFile}`);
        }
    } catch (err) {
        console.warn(`[postinstall-fix] Skipped ${targetFile}: ${err.message}`);
    }
}
