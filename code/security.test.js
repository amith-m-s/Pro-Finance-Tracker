const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const assert = require("node:assert/strict");

const html = fs.readFileSync(path.join(__dirname, "expenses.html"), "utf8");
const inlineScriptMatch = html.match(/<script>\s*([\s\S]*?)<\/script>/i);
assert.ok(inlineScriptMatch, "the application inline script should exist");
const inlineScript = inlineScriptMatch[1];

test("inline application script has valid JavaScript syntax", () => {
  assert.doesNotThrow(() => new vm.Script(inlineScript));
});

test("transaction rendering never inserts user-controlled values as HTML", () => {
  const renderer = inlineScript.match(/const renderTransactions = \(\) => \{([\s\S]*?)\n            \};/);
  assert.ok(renderer, "renderTransactions should be present");
  assert.doesNotMatch(renderer[1], /row\.innerHTML\s*=/);
  assert.match(renderer[1], /categoryCell\.appendChild\(document\.createTextNode\(String\(tx\.category \?\? ""\)\)\)/);
  assert.match(renderer[1], /noteCell\.textContent = String\(tx\.note \?\? ""\)/);
});

test("CSV export neutralizes spreadsheet formulas and escapes quotes", () => {
  const helper = inlineScript.match(/const escapeCsvCell = \(value\) => \{[\s\S]*?\n            \};/);
  assert.ok(helper, "escapeCsvCell should be present");
  const expression = helper[0]
    .replace(/^const escapeCsvCell = /, "")
    .replace(/;\s*$/, "");
  const escapeCsvCell = vm.runInNewContext("(" + expression + ")");
  assert.equal(escapeCsvCell("=1+1"), "\"'=1+1\"");
  assert.equal(escapeCsvCell("  @SUM(A1:A2)"), "\"'  @SUM(A1:A2)\"");
  assert.equal(escapeCsvCell('hello,"world"'), '"hello,""world"""');
  assert.equal(escapeCsvCell(null), '""');
});

test("category options are created as text rather than HTML strings", () => {
  assert.match(inlineScript, /categoryInput\.replaceChildren\(\.\.\.categories\.map\(category => \{/);
  assert.doesNotMatch(inlineScript, /categoryInput\.innerHTML\s*=/);
});
