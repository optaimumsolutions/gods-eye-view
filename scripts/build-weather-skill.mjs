#!/usr/bin/env node
/**
 * Row 3 (docs/COMMODITIES-PLAN.md §11.8.14.1): bundle the lead-time
 * confidence curve from the Oil Oracle's MEASURED forecast skill.
 *
 * Input: the JSON `tools/wx_skill.py --json` prints on the VPS (per model,
 * per lead day: n, mae, bias, band_coverage against observed GWDD; the
 * maturity gate is 30 realized inits). Obtain it read-only:
 *
 *   ssh -i ~/.ssh/oil_oracle_laptop_ed25519 ubuntu@15.204.118.186 \
 *     'cd ~/oracle && python3 tools/wx_skill.py --json' > .gev-cache/weather/wx_skill.json
 *   node scripts/build-weather-skill.mjs --from .gev-cache/weather/wx_skill.json
 *   node scripts/build-weather-skill.mjs --check --from ...   # byte-identical?
 *
 * Confidence per lead = MAE(D+1) / MAE(lead), clamped to [0, 1]: the decay of
 * the model's own error with lead, D+0 = 1 by definition. (wx_skill does not
 * yet publish a climatology-baseline MAE; when it does, this becomes the
 * standard skill score 1 − MAE/MAE_climo — an oracle FR-W change, noted in
 * §11.13.) Leads past the last scored one hold the last value and are
 * flagged `extrapolated`; the curve is a running minimum (a longer lead never
 * reads more confident than a shorter one — the tail has 3-5 inits) and leads
 * with n < 5 carry `thin: true`. `provisional` is true until the gate is met; the
 * globe prints it on every card. With no scored inits the curve is flat 1.0
 * and `label` says `no skill measured yet` — a curve is never invented.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'data', 'local_data', 'weather', 'skill.json');
/** Open-Meteo model id → wx_skill model key. WN2 has no oracle score. */
const MODEL_KEYS = {
  ecmwf_aifs025_ensemble: 'AIFS_ENS',
  ncep_aigefs025: 'GEFS',
  ncep_gefs025: 'GEFS',
  google_weathernext2_ensemble: null,
};
export const MAX_LEAD = 16;

export function buildSkill(raw, { vintage }) {
  const gate = Number(raw?.maturity_gate) || 30;
  const models = {};
  for (const [id, key] of Object.entries(MODEL_KEYS)) {
    const scored = key ? raw?.models?.[key] : null;
    const inits = key ? Number(raw?.scored_valid_dates?.[key]) || 0 : 0;
    const leads = [];
    if (!scored || !scored['1']?.mae) {
      for (let d = 0; d <= MAX_LEAD; d++)
        leads.push({ lead: d, confidence: 1, n: 0, extrapolated: d > 0 });
      models[id] = {
        skillKey: key,
        inits: 0,
        provisional: true,
        label: 'no skill measured yet',
        leads,
      };
      continue;
    }
    const mae1 = scored['1'].mae;
    let last = 1;
    let lastN = 0;
    for (let d = 0; d <= MAX_LEAD; d++) {
      if (d === 0) {
        leads.push({
          lead: 0,
          confidence: 1,
          n: scored['1'].n,
          mae: null,
          extrapolated: false,
        });
        continue;
      }
      const row = scored[String(d)];
      if (row?.mae > 0) {
        // running minimum: n shrinks with lead (3-5 inits at the tail), so a
        // longer lead never claims MORE confidence than a shorter one
        last = Number(Math.min(last, 1, mae1 / row.mae).toFixed(3));
        lastN = row.n;
        leads.push({
          lead: d,
          confidence: last,
          n: row.n,
          mae: row.mae,
          extrapolated: false,
          thin: row.n < 5,
        });
      } else {
        leads.push({
          lead: d,
          confidence: last,
          n: lastN,
          mae: null,
          extrapolated: true,
        });
      }
    }
    const provisional = inits < gate;
    models[id] = {
      skillKey: key,
      inits,
      gate,
      provisional,
      label: provisional
        ? `provisional (${inits}/${gate} inits)`
        : `measured (${inits} inits)`,
      basis: 'MAE(D+1) / MAE(lead) vs observed GWDD, tools/wx_skill.py',
      leads,
    };
  }
  return { vintage, gate, models };
}

function main() {
  const args = process.argv.slice(2);
  const from = args[args.indexOf('--from') + 1];
  const check = args.includes('--check');
  if (!from || !existsSync(from)) {
    console.error('usage: --from <wx_skill --json output> [--check]');
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(from, 'utf8'));
  const vintageIdx = args.indexOf('--vintage');
  const vintage =
    vintageIdx >= 0
      ? args[vintageIdx + 1]
      : new Date().toISOString().slice(0, 10);
  const out = JSON.stringify(buildSkill(raw, { vintage }), null, 1) + '\n';
  if (check) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== out) {
      console.error('skill.json DRIFTS from a fresh build');
      process.exit(1);
    }
    console.log('skill.json byte-identical');
    return;
  }
  writeFileSync(OUT, out);
  const a = JSON.parse(out).models.ecmwf_aifs025_ensemble;
  console.log(
    `wrote ${OUT}: AIFS ${a.label}; D+1 ${a.leads[1].confidence} → D+7 ${a.leads[7].confidence} → D+14 ${a.leads[14].confidence}`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  main();
