#!/usr/bin/env node
/**
 * Cleans stale Vite optimizeDeps cache (client/node_modules/.vite)
 * to resolve "504 (Outdated Optimize Dep)" errors after installing new packages.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viteCacheDir = path.resolve(__dirname, "..", "client", "node_modules", ".vite");

if (fs.existsSync(viteCacheDir)) {
    fs.rmSync(viteCacheDir, { recursive: true, force: true });
    console.log("✓ Removed stale client/node_modules/.vite pre-bundle cache.");
} else {
    console.log("✓ client/node_modules/.vite cache is already clean.");
}
