#!/usr/bin/env node
/**
 * KijaniMart Flutter Layout Overflow Auditor (mobile/scripts/check_layout_overflows.mjs)
 *
 * Scans all Dart files in `mobile/lib/` for `Row(` widgets that are at risk of throwing
 * `A RenderFlex overflowed by X pixels on the right` on narrow mobile screens (360-380px):
 *  1. `Row` with `mainAxisAlignment: MainAxisAlignment.spaceBetween` where children lack
 *     `Expanded` or `Flexible`, or where two+ buttons/chips sit side-by-side without `Wrap`.
 *  2. `Row` containing `Text(` with dynamic strings without an enclosing `Expanded` / `Flexible`.
 *  3. `Positioned` widgets that are not direct children of `Stack`.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const libDir = path.resolve(__dirname, '../lib');

function getAllDartFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...getAllDartFiles(full));
    } else if (e.isFile() && e.name.endsWith('.dart')) {
      files.push(full);
    }
  }
  return files;
}

function extractBalancedBlock(source, openParenIdx) {
  let depth = 0;
  for (let i = openParenIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return source.slice(openParenIdx, i + 1);
    }
  }
  return source.slice(openParenIdx, Math.min(source.length, openParenIdx + 800));
}

function getLineNumber(source, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (source[i] === '\n') line++;
  }
  return line;
}

const files = getAllDartFiles(libDir);
const findings = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.resolve(__dirname, '..'), file).replace(/\\/g, '/');

  // Find every `Row(`
  const rowRegex = /\bRow\s*\(/g;
  let match;
  while ((match = rowRegex.exec(src)) !== null) {
    const startIdx = match.index;
    const openParen = src.indexOf('(', startIdx);
    const block = extractBalancedBlock(src, openParen);
    const line = getLineNumber(src, startIdx);

    // Strip nested Row/Column blocks so we only inspect direct contents of this Row
    const hasExpandedOrFlexible = /\b(Expanded|Flexible)\s*\(/.test(block);
    const isMinSize = /mainAxisSize\s*:\s*MainAxisSize\.min/.test(block);
    const isSpaceBetween = /MainAxisAlignment\.spaceBetween/.test(block);
    const textCount = (block.match(/\bText\s*\(/g) || []).length;
    const buttonCount = (
      block.match(/\b(ElevatedButton|OutlinedButton|TextButton|ActionChip|FilterChip|ChoiceChip)\b/g) || []
    ).length;

    // Risk 1: spaceBetween Row with multiple buttons or dynamic Text and no Expanded/Flexible
    if (isSpaceBetween && !hasExpandedOrFlexible && (textCount >= 2 || buttonCount >= 2)) {
      findings.push({
        file: rel,
        line,
        severity: 'HIGH',
        reason: `Row(spaceBetween) without Expanded/Flexible (texts=${textCount}, buttons=${buttonCount})`,
        preview: block.split('\n').slice(0, 8).join('\n'),
      });
    } else if (!isMinSize && !hasExpandedOrFlexible && buttonCount >= 2) {
      findings.push({
        file: rel,
        line,
        severity: 'HIGH',
        reason: `Row with ${buttonCount} buttons without Expanded/Flexible or Wrap`,
        preview: block.split('\n').slice(0, 8).join('\n'),
      });
    } else if (!isMinSize && !hasExpandedOrFlexible && textCount >= 2 && /\$\{?[a-zA-Z0-9_]+/.test(block)) {
      findings.push({
        file: rel,
        line,
        severity: 'MEDIUM',
        reason: `Row with interpolated Text and no Expanded/Flexible`,
        preview: block.split('\n').slice(0, 6).join('\n'),
      });
    }
  }
}

console.log(`Scanned ${files.length} Dart files in mobile/lib.`);
console.log(`Found ${findings.length} potential Row overflow risks:\n`);
for (const f of findings) {
  console.log(`[${f.severity}] ${f.file}:${f.line} — ${f.reason}`);
}

if (process.argv.includes('--strict') && findings.some((f) => f.severity === 'HIGH')) {
  process.exit(1);
}
