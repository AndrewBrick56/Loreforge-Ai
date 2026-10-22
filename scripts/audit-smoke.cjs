#!/usr/bin/env node
'use strict';

/* eslint-disable @typescript-eslint/no-require-imports -- This standalone smoke test intentionally uses CommonJS. */
// Fast, dependency-free structural regression checks for the confirmed audit fixes.
// These checks do not replace the TypeScript check, build, or live Supabase tests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.isAbsolute(p) ? p : path.join(root, p));

for (const file of ['package.json', 'package-lock.json', 'tsconfig.json', 'vercel.json']) {
  assert.doesNotThrow(() => JSON.parse(read(file)), `${file} should be valid JSON`);
}

const pkg = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
assert.equal(lock.packages[''].name, pkg.name, 'lockfile root package name should match');
assert.equal(lock.packages[''].version, pkg.version, 'lockfile root package version should match');

// Resolve every project-local @/ import without needing node_modules installed.
let localImports = 0;
const missingImports = [];
function walkSource(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkSource(fullPath);
      continue;
    }
    if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
    const source = fs.readFileSync(fullPath, 'utf8');
    const pattern = /(?:from\s*|import\s*\()\s*["'](@\/[^"']+)["']/g;
    for (const match of source.matchAll(pattern)) {
      localImports++;
      const rel = match[1].slice(2);
      const target = path.join(root, 'src', rel);
      const candidates = [target, ...['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].map((ext) => target + ext), ...['index.ts', 'index.tsx', 'index.js', 'index.jsx'].map((f) => path.join(target, f))];
      if (!candidates.some(exists)) missingImports.push(`${path.relative(root, fullPath)} -> ${match[1]}`);
    }
  }
}
walkSource(path.join(root, 'src'));
assert.deepEqual(missingImports, [], `unresolved local imports: ${missingImports.join(', ')}`);

const mint = read('src/lib/solana/mint.ts');
assert.match(mint, /TOKEN_PROGRAM_ID/);
assert.match(mint, /info\.data\.length !== 82/);
assert.match(mint, /info\.data\[165\] === 1/);
assert.match(mint, /info\.data\[45\] !== 1/);

const storage = read('src/lib/storage.ts');
assert.match(storage, /export async function removeFromStorage[\s\S]*?StorageRemovalResult/);
assert.match(storage, /failedPaths/);

const save = read('src/app/api/characters/route.ts');
assert.match(save, /sniffImageType\(sourceBytes\)/);
assert.match(save, /sourceExt/);
assert.match(save, /p_source_file_ext:/);

const limiter = read('src/lib/rate-limit.ts');
assert.match(limiter, /checkRateLimitAsync/);
assert.match(limiter, /reserve_rate_limit/);
assert.match(limiter, /NODE_ENV === "production"/);
for (const route of [
  'src/app/api/generate/route.ts',
  'src/app/api/identity/route.ts',
  'src/app/api/characters/[id]/scenes/route.ts',
  'src/app/api/characters/[id]/brand/route.ts',
]) {
  assert.match(read(route), /checkRateLimitAsync/, `${route} should use shared rate limits`);
}

// SQL trigger/policy declarations can safely be re-run after a partial SQL Editor execution.
function assertIdempotentDefinitions(file) {
  const sql = read(file);
  for (const match of sql.matchAll(/create\s+trigger\s+([a-z0-9_]+)\b[^;]*?\bon\s+([a-z0-9_.]+)/ig)) {
    const [, name, table] = match;
    const before = sql.slice(Math.max(0, match.index - 400), match.index);
    const drop = new RegExp(`drop\\s+trigger\\s+if\\s+exists\\s+${name}\\s+on\\s+${table.replace('.', '\\.') }\\s*;`, 'i');
    assert.match(before, drop, `${file}: trigger ${name} on ${table} must be dropped before recreation`);
  }
  for (const match of sql.matchAll(/create\s+policy\s+([a-z0-9_]+)\s+on\s+([a-z0-9_.]+)/ig)) {
    const [, name, table] = match;
    const before = sql.slice(Math.max(0, match.index - 300), match.index);
    const drop = new RegExp(`drop\\s+policy\\s+if\\s+exists\\s+${name}\\s+on\\s+${table.replace('.', '\\.') }\\s*;`, 'i');
    assert.match(before, drop, `${file}: policy ${name} on ${table} must be dropped before recreation`);
  }
}
assertIdempotentDefinitions('supabase/schema.sql');
assertIdempotentDefinitions('supabase/migrations/002_source_photos_and_memecoin.sql');

const migration = read('supabase/migrations/003_atomic_rate_limits_and_source_images.sql');
assert.match(migration, /create table if not exists public\.rate_limit_events/i);
assert.match(migration, /create or replace function public\.reserve_rate_limit/i);
assert.match(migration, /pg_advisory_xact_lock/i);
assert.match(migration, /create table if not exists public\.storage_cleanup_jobs/i);
assert.match(migration, /file_ext in \('png', 'jpg', 'webp'\)/i);

const deleteRoute = read('src/app/api/characters/[id]/route.ts');
const enqueueAt = deleteRoute.indexOf('.from("storage_cleanup_jobs")');
const deleteAt = deleteRoute.indexOf('.from("characters").delete()');
assert.ok(enqueueAt >= 0 && deleteAt > enqueueAt, 'cleanup paths must be queued before character rows are deleted');

const cron = read('src/app/api/cron/cleanup-pending/route.ts');
assert.match(cron, /\.from\("storage_cleanup_jobs"\)/);
assert.match(cron, /\.from\("character_images"\)/);
assert.match(cron, /referencedPaths/);
assert.match(cron, /result\.failedPaths/);

assert.ok(exists('supabase/migrations/003_atomic_rate_limits_and_source_images.sql'));
const gitignore = read('.gitignore');

assert.match(
  gitignore,
  /^\.env\.local$/m,
  '.gitignore must exclude .env.local',
);

assert.match(
  gitignore,
  /^\.env$/m,
  '.gitignore must exclude .env',
);
console.log(`PASS audit smoke checks: package metadata, ${localImports} local imports, mint layout guards, source image extension flow, shared rate limiting, durable cleanup queue, and idempotent SQL trigger/policy definitions.`);
console.log('NOTE these structural checks do not verify a production build or live Supabase behavior.');
