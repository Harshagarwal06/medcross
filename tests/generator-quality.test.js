#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = {
  console,
  Math,
  Date,
  setTimeout,
  clearTimeout
};
context.globalThis = context;
vm.createContext(context);

function runFile(file, trailer = '') {
  const code = fs.readFileSync(path.join(root, file), 'utf8');
  vm.runInContext(`${code}\n${trailer}`, context, { filename: file });
}

runFile('validation.js');
runFile('medical-database.js', 'globalThis.medicalCrosswordData = medicalCrosswordData;');
runFile('crossword-generator.js', 'globalThis.CrosswordGenerator = CrosswordGenerator;');

const categories = Object.keys(context.medicalCrosswordData);
const sample = process.env.MEDCROSS_BENCH_ALL === '1' ? categories : categories.slice(0, 5);
const generator = new context.CrosswordGenerator(context.medicalCrosswordData);
const rows = [];

for (const category of sample) {
  const startFull = Date.now();
  const full = generator.generateCrossword(category, 'm1');
  const fullValidation = context.MedCrossValidation.validatePuzzle(full);
  assert.strictEqual(fullValidation.valid, true, `${category} full puzzle failed validation`);

  const startMini = Date.now();
  const mini = generator.generateMiniCrossword(category, 'm1');
  const miniValidation = context.MedCrossValidation.validatePuzzle(mini);
  assert.strictEqual(miniValidation.valid, true, `${category} mini puzzle failed validation`);

  rows.push({
    category,
    fullMs: Date.now() - startFull,
    fullWarnings: fullValidation.warnings.length,
    fullCheckedPct: fullValidation.stats.checkedPct,
    miniMs: Date.now() - startMini,
    miniWarnings: miniValidation.warnings.length,
    miniCheckedPct: miniValidation.stats.checkedPct,
    miniFallback: Boolean(mini.stats && mini.stats.curatedFallback)
  });
}

const fallbackCount = rows.filter(r => r.miniFallback).length;
console.table(rows);
console.log(`Validated ${rows.length} categories. Mini fallback rate: ${fallbackCount}/${rows.length}.`);
