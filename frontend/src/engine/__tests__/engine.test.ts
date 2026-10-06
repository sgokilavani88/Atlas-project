import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { runAllSelfChecks } from '../selfCheckSuite';

function collectSourceFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') {
        files.push(...collectSourceFiles(full));
      }
    } else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

describe('Study Sentinel Deterministic Engine & Hard-Code Guard Suite', () => {
  const checks = runAllSelfChecks();

  for (const check of checks) {
    it(`${check.id}: ${check.name}`, () => {
      expect(check.passed, `${check.name} failed: ${check.assertionSummary}`).toBe(true);
    });
  }

  it('Dev-only Hard-Code Guard: greps source files for hardcoded site/subject ID comparisons', () => {
    const srcRoot = path.resolve(process.cwd(), 'src');
    const files = collectSourceFiles(srcRoot);
    expect(files.length).toBeGreaterThan(0);

    const siteLiteralPattern = new RegExp('site\\s*===\\s*["\']S[0-9A-Za-z_-]+["\']');
    const subjLiteralPattern = new RegExp('usubjid\\s*===\\s*["\'][A-Z0-9_-]{4,}["\']');

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(siteLiteralPattern.test(content), `Hardcoded site check found in ${file}`).toBe(false);
      expect(subjLiteralPattern.test(content), `Hardcoded usubjid check found in ${file}`).toBe(false);
    }
  });
});
