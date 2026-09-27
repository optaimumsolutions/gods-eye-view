import { readFileSync } from 'node:fs';

/**
 * The committed operator alias table (docs/COMMODITIES-PLAN.md §16, R14.7):
 * filed spelling → canonical spelling, for two spellings of ONE company only.
 * Never a parent and its subsidiaries, never a predecessor and its buyer:
 * those stay separate rows, as filed. The builders print colliding spellings
 * the table does not cover yet; a human decides.
 */
export function loadOperatorAliases(
  file = new URL('./operator-aliases.json', import.meta.url),
) {
  const table = JSON.parse(readFileSync(file, 'utf8'));
  const aliases = table?.aliases ?? {};
  for (const [filed, canonical] of Object.entries(aliases)) {
    if (typeof canonical !== 'string' || !canonical.trim())
      throw new Error(
        `operator-aliases.json: "${filed}" has no canonical name`,
      );
    if (aliases[canonical] !== undefined)
      throw new Error(
        `operator-aliases.json: "${canonical}" is itself an alias; point "${filed}" at its canonical name`,
      );
  }
  return aliases;
}
