#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, '..', 'src', 'data');

const sampleData = JSON.parse(readFileSync(resolve(dataDir, 'sampleData.json'), 'utf-8'));
const libraries = JSON.parse(readFileSync(resolve(dataDir, 'sample.json'), 'utf-8'));
const rows = sampleData.Transactions;

// --- Rule evaluation (mirrors src/utils logic) ---

function contextMatchesRow(context, row) {
  return context.every((entry) => String(row[entry.Key] ?? '') === entry.Value);
}

function evaluateCondition(condition, row) {
  const fieldValue = row[condition.SourceField];
  if (fieldValue === undefined || fieldValue === null) return false;

  const numericPrefixes = [
    { prefix: '__NUMERIC_GT:', compare: (a, b) => a > b },
    { prefix: '__NUMERIC_LT:', compare: (a, b) => a < b },
    { prefix: '__NUMERIC_GTE:', compare: (a, b) => a >= b },
    { prefix: '__NUMERIC_LTE:', compare: (a, b) => a <= b },
  ];
  for (const { prefix, compare } of numericPrefixes) {
    if (condition.Regex.startsWith(prefix)) {
      const threshold = parseFloat(condition.Regex.slice(prefix.length));
      const numValue = parseFloat(String(fieldValue));
      return !isNaN(numValue) && !isNaN(threshold) && compare(numValue, threshold);
    }
  }

  try {
    return new RegExp(condition.Regex).test(String(fieldValue).trim());
  } catch {
    return false;
  }
}

function analyzeRow(row, libs) {
  const tags = [];
  for (const lib of libs) {
    if (lib.Context.length > 0 && !contextMatchesRow(lib.Context, row)) continue;
    for (const def of lib.TagSpecDefinitions) {
      if (def.StatusTag !== 'ACTIVE') continue;
      const now = new Date().toISOString().split('T')[0];
      if (def.Validity.StartDate && now < def.Validity.StartDate) continue;
      if (def.Validity.EndDate && now > def.Validity.EndDate) continue;
      if (def.Context.length > 0 && !contextMatchesRow(def.Context, row)) continue;

      const matches =
        def.TagRuleExpressions.length === 0 ||
        def.TagRuleExpressions.some((andGroup) =>
          andGroup.every((cond) => evaluateCondition(cond, row))
        );

      if (matches) tags.push(def.Tag);
    }
  }
  return tags;
}

// --- Group by bank+side and compute stats ---

const groups = {};
for (const row of rows) {
  const key = `${row.BankSwiftCode}|${row.Side}`;
  if (!groups[key]) groups[key] = { bank: row.BankSwiftCode, side: row.Side, rows: [] };
  groups[key].rows.push(row);
}

const stats = Object.values(groups)
  .map((g) => {
    let untagged = 0;
    let multiTagged = 0;
    let deadEnd = 0;

    for (const row of g.rows) {
      const tags = analyzeRow(row, libraries);
      if (tags.length === 0) untagged++;
      if (tags.length > 1) multiTagged++;
      if (row.IsDeadEnd === true) deadEnd++;
    }

    return {
      bank: g.bank,
      side: g.side,
      totalTransactions: g.rows.length,
      untaggedCount: untagged,
      multiTaggedCount: multiTagged,
      deadEndCount: deadEnd,
      missingMandatoryAttributes: 0,
      missingOptionalAttributes: 0,
      status: 'Unchecked',
      checkedOutBy: null,
    };
  })
  .sort((a, b) => a.bank.localeCompare(b.bank) || a.side.localeCompare(b.side));

const outPath = resolve(dataDir, 'bankStats.json');
writeFileSync(outPath, JSON.stringify(stats, null, 2) + '\n');

const totalTx = stats.reduce((s, r) => s + r.totalTransactions, 0);
const totalUntagged = stats.reduce((s, r) => s + r.untaggedCount, 0);
const totalMulti = stats.reduce((s, r) => s + r.multiTaggedCount, 0);
console.log(`Generated bankStats.json — ${stats.length} bank/side combinations, ${totalTx} transactions`);
console.log(`  Untagged: ${totalUntagged} | Multi-tagged: ${totalMulti}`);
