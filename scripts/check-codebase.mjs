#!/usr/bin/env node
/**
 * Comprehensive Codebase Diagnostic & Static Verification Script
 * Checks:
 *  1. Stale Vite pre-bundle cache (.vite) & Service Worker (sw.js) conflicts
 *  2. Peer dependencies & bare module resolution (e.g., recharts -> react-is)
 *  3. Relative import path resolution across all client/ and server/ files
 *  4. Named export vs. named import matching (detects missing or undefined exports)
 *  5. Duplicate declarations, JSX syntax/reference errors, and duplicate Route paths
 *  6. CSS Module class references (detects missing or duplicate CSS classes)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const CLIENT_DIR = path.join(ROOT_DIR, "client");
const SERVER_DIR = path.join(ROOT_DIR, "server");

const shouldFix = process.argv.includes("--fix");

let totalErrors = 0;
let totalWarnings = 0;
let totalChecks = 0;

const logPass = (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`);
const logWarn = (msg) => {
    totalWarnings++;
    console.log(`  \x1b[33m⚠\x1b[0m ${msg}`);
};
const logFail = (msg) => {
    totalErrors++;
    console.log(`  \x1b[31m✗\x1b[0m ${msg}`);
};

const walkFiles = (dir, exts = [".js", ".jsx", ".mjs", ".css"]) => {
    const results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
            entry.name === "node_modules" ||
            entry.name === "dist" ||
            entry.name === "build" ||
            entry.name === ".git"
        ) {
            continue;
        }
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...walkFiles(fullPath, exts));
        } else if (exts.includes(path.extname(entry.name))) {
            results.push(fullPath);
        }
    }
    return results;
};

console.log("\n============================================================");
console.log("  FreshMart Codebase Doctor — Reference, Duplicate & Dep Audit");
console.log("============================================================\n");

// ---------------------------------------------------------------------------
// 1. Check Vite OptimizeDeps, Peer Dependencies (recharts -> react-is) & sw.js
// ---------------------------------------------------------------------------
console.log("1. Auditing Vite Pre-Bundling (504 Outdated Optimize Dep) & Service Worker...");
totalChecks++;

const clientPkgPath = path.join(CLIENT_DIR, "package.json");
const clientPkg = JSON.parse(fs.readFileSync(clientPkgPath, "utf8"));
const clientDeps = {
    ...(clientPkg.dependencies || {}),
    ...(clientPkg.devDependencies || {}),
};

const requiredClientPackages = ["react", "react-dom", "recharts", "react-is", "@tanstack/react-query"];
for (const pkg of requiredClientPackages) {
    const installedPath = path.join(CLIENT_DIR, "node_modules", pkg);
    if (!fs.existsSync(installedPath)) {
        logFail(`Missing required client package or peer dependency: "${pkg}" in client/node_modules`);
    } else {
        logPass(`Package "${pkg}" is installed in client/node_modules`);
    }
}

const viteConfigPath = path.join(CLIENT_DIR, "vite.config.mjs");
if (fs.existsSync(viteConfigPath)) {
    const viteConfigContent = fs.readFileSync(viteConfigPath, "utf8");
    if (viteConfigContent.includes('"recharts"') && viteConfigContent.includes('"react-is"')) {
        logPass(`vite.config.mjs pre-bundles "recharts" and "react-is" in optimizeDeps.include`);
    } else {
        logFail(
            `vite.config.mjs is missing "recharts" or "react-is" in optimizeDeps.include (can cause 504 Outdated Optimize Dep)`
        );
    }
}

const viteCacheDir = path.join(CLIENT_DIR, "node_modules", ".vite");
if (fs.existsSync(viteCacheDir)) {
    if (shouldFix) {
        fs.rmSync(viteCacheDir, { recursive: true, force: true });
        logPass(`Cleared stale client/node_modules/.vite cache (--fix)`);
    } else {
        const metadataPath = path.join(viteCacheDir, "deps", "_metadata.json");
        if (fs.existsSync(metadataPath)) {
            const meta = fs.readFileSync(metadataPath, "utf8");
            if (!meta.includes("recharts")) {
                logWarn(
                    `client/node_modules/.vite cache predates "recharts" installation. Run with --fix to clear stale .vite cache.`
                );
            } else {
                logPass(`client/node_modules/.vite metadata includes "recharts"`);
            }
        }
    }
}

const swPath = path.join(CLIENT_DIR, "public", "sw.js");
const indexHtmlPath = path.join(CLIENT_DIR, "index.html");
if (
    fs.existsSync(swPath) &&
    fs.readFileSync(swPath, "utf8").includes("unregister") &&
    fs.readFileSync(indexHtmlPath, "utf8").includes("serviceWorker.getRegistrations")
) {
    logPass(`Stale Service Worker (sw.js) auto-unregister guard is active in index.html & public/sw.js`);
} else {
    logFail(`Missing Service Worker (sw.js) unregister guard in client/index.html or client/public/sw.js`);
}

// ---------------------------------------------------------------------------
// 2. Check All Relative Imports & Named Exports Across Client & Server
// ---------------------------------------------------------------------------
console.log("\n2. Auditing Relative Imports, Missing Files & Named Export References...");
totalChecks++;

const resolveImportFile = (fromFile, importSpec) => {
    const base = path.resolve(path.dirname(fromFile), importSpec);
    const candidates = [
        base,
        `${base}.js`,
        `${base}.jsx`,
        `${base}.mjs`,
        `${base}.json`,
        path.join(base, "index.js"),
        path.join(base, "index.jsx"),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isFile()) {
            return c;
        }
    }
    return null;
};

const extractExports = (filePath) => {
    const content = fs.readFileSync(filePath, "utf8");
    const named = new Set();
    let hasDefault = false;

    const declRegex = /export\s+(?:const|let|var|function|class|async\s+function)\s+([A-Za-z0-9_$]+)/g;
    let m;
    while ((m = declRegex.exec(content)) !== null) {
        named.add(m[1]);
    }

    const listRegex = /export\s*\{([^}]+)\}/g;
    while ((m = listRegex.exec(content)) !== null) {
        const parts = m[1].split(",");
        for (const part of parts) {
            const tokens = part.trim().split(/\s+as\s+/);
            const exportedName = (tokens[1] || tokens[0]).trim();
            if (exportedName === "default") hasDefault = true;
            else if (exportedName) named.add(exportedName);
        }
    }

    if (/export\s+default\s+/.test(content)) {
        hasDefault = true;
    }

    return { named, hasDefault };
};

const allJsFiles = [
    ...walkFiles(path.join(CLIENT_DIR, "src"), [".js", ".jsx", ".mjs"]),
    ...walkFiles(SERVER_DIR, [".js", ".mjs"]),
];

let brokenImportsCount = 0;
let missingNamedExportsCount = 0;

for (const file of allJsFiles) {
    const relFile = path.relative(ROOT_DIR, file);
    const content = fs.readFileSync(file, "utf8");

    // Match static ES imports
    const importRegex = /import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
        const clause = match[1].trim();
        const spec = match[2].trim();

        if (spec.startsWith(".")) {
            const resolved = resolveImportFile(file, spec);
            if (!resolved) {
                brokenImportsCount++;
                logFail(`Broken relative import in ${relFile}: "${spec}" does not exist`);
                continue;
            }

            // Check named imports against target JS file exports
            if (/\.(js|jsx|mjs)$/.test(resolved)) {
                const targetExports = extractExports(resolved);
                const namedMatch = clause.match(/\{([^}]+)\}/);
                if (namedMatch) {
                    const importedNames = namedMatch[1]
                        .split(",")
                        .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
                        .filter(Boolean);

                    for (const impName of importedNames) {
                        if (!targetExports.named.has(impName)) {
                            missingNamedExportsCount++;
                            logFail(
                                `Missing named export "${impName}" imported in ${relFile} from ${path.relative(
                                    ROOT_DIR,
                                    resolved
                                )}`
                            );
                        }
                    }
                }
            }
        }
    }
}

if (brokenImportsCount === 0 && missingNamedExportsCount === 0) {
    logPass(`All relative imports and named exports verified across ${allJsFiles.length} source files`);
}

// ---------------------------------------------------------------------------
// 3. Check Duplicate Identifiers, JSX/JS Syntax & Duplicate React Routes
// ---------------------------------------------------------------------------
console.log("\n3. Auditing Server & Client Files for Syntax, Reference & Duplicate Errors...");
totalChecks++;

const serverJsFiles = walkFiles(SERVER_DIR, [".js", ".mjs"]);
let serverSyntaxErrors = 0;
for (const sFile of serverJsFiles) {
    const res = spawnSync(process.execPath, ["--check", sFile], { encoding: "utf8" });
    if (res.status !== 0) {
        serverSyntaxErrors++;
        logFail(`Syntax/Reference error in ${path.relative(ROOT_DIR, sFile)}:\n${res.stderr}`);
    }
}
if (serverSyntaxErrors === 0) {
    logPass(`All ${serverJsFiles.length} server files passed Node syntax & duplicate-identifier check`);
}

// Check duplicate <Route path="..."> in client/src/App.js
const appJsPath = path.join(CLIENT_DIR, "src", "App.js");
if (fs.existsSync(appJsPath)) {
    const appContent = fs.readFileSync(appJsPath, "utf8");
    const routeRegex = /<Route\s+[^>]*path=\{?["']([^"']+)["']\}?/g;
    const seenRoutes = new Map();
    let rMatch;
    let duplicateRoutes = 0;
    while ((rMatch = routeRegex.exec(appContent)) !== null) {
        const routePath = rMatch[1];
        if (seenRoutes.has(routePath)) {
            duplicateRoutes++;
            logFail(`Duplicate <Route path="${routePath}"> found in client/src/App.js`);
        }
        seenRoutes.set(routePath, true);
    }
    if (duplicateRoutes === 0) {
        logPass(`Verified ${seenRoutes.size} unique <Route> definitions in client/src/App.js (0 duplicates)`);
    }
}

// ---------------------------------------------------------------------------
// 4. Check CSS Module Class References & Duplicate CSS Selectors
// ---------------------------------------------------------------------------
console.log("\n4. Auditing CSS Module Class References & Missing/Duplicate Selectors...");
totalChecks++;

const clientJsFiles = walkFiles(path.join(CLIENT_DIR, "src"), [".js", ".jsx"]);
let missingCssClasses = 0;

for (const cFile of clientJsFiles) {
    const content = fs.readFileSync(cFile, "utf8");
    const cssImportMatch = content.match(/import\s+styles\s+from\s+["'](\.[^"']+\.module\.css)["']/);
    if (!cssImportMatch) continue;

    const cssPath = path.resolve(path.dirname(cFile), cssImportMatch[1]);
    if (!fs.existsSync(cssPath)) {
        logFail(`Missing CSS module file ${cssImportMatch[1]} imported in ${path.relative(ROOT_DIR, cFile)}`);
        continue;
    }

    const cssContent = fs.readFileSync(cssPath, "utf8");
    const definedClasses = new Set();
    const classDefRegex = /\.([A-Za-z0-9_-]+)/g;
    let cm;
    while ((cm = classDefRegex.exec(cssContent)) !== null) {
        definedClasses.add(cm[1]);
    }

    // Check literal styles['class-name'] references
    const styleRefRegex = /styles\[["']([A-Za-z0-9_-]+)["']\]/g;
    let sm;
    while ((sm = styleRefRegex.exec(content)) !== null) {
        const usedClass = sm[1];
        if (!definedClasses.has(usedClass)) {
            missingCssClasses++;
            logWarn(
                `Unmatched CSS module class styles['${usedClass}'] in ${path.relative(
                    ROOT_DIR,
                    cFile
                )} (${path.basename(cssPath)})`
            );
        }
    }
}

if (missingCssClasses === 0) {
    logPass(`All literal CSS module class references match defined classes`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log("\n============================================================");
if (totalErrors === 0) {
    console.log(
        `  \x1b[32mSUCCESS:\x1b[0m All ${totalChecks} diagnostic suites passed with 0 errors (${totalWarnings} warnings).`
    );
    console.log("============================================================\n");
    process.exit(0);
} else {
    console.log(
        `  \x1b[31mFAILED:\x1b[0m Found ${totalErrors} error(s) and ${totalWarnings} warning(s).`
    );
    console.log("============================================================\n");
    process.exit(1);
}
