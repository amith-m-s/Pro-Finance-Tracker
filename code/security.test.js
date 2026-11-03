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

function loadStorageHelper(name, storage) {
  const helperMatch = inlineScript.match(new RegExp(
    "const " + name + " = (\\([\\s\\S]*?\\n            \\})\\s*;"
  ));
  assert.ok(helperMatch, name + " should be defined");
  return vm.runInNewContext("(" + helperMatch[1] + ")", { localStorage: storage });
}

test("stored JSON recovers from missing and malformed browser data", () => {
  let storedValue = null;
  const readStoredJson = loadStorageHelper("readStoredJson", {
    getItem: () => storedValue
  });

  assert.equal(readStoredJson("transactions", "fallback"), "fallback");
  storedValue = "{malformed";
  assert.equal(readStoredJson("transactions", "fallback"), "fallback");
  storedValue = '{"theme":"dark"}';
  assert.equal(readStoredJson("settings", {}).theme, "dark");
});

test("stored JSON falls back when browser storage access is blocked", () => {
  const readStoredJson = loadStorageHelper("readStoredJson", {
    getItem: () => { throw new Error("Storage access denied"); }
  });

  assert.equal(readStoredJson("transactions", "fallback"), "fallback");
});

test("stored collections reject unexpected transaction and budget shapes", () => {
  const invalidTransactions = loadStorageHelper("readStoredJson", {
    getItem: () => '[null, "not a transaction", []]'
  });
  const validTransactionList = value =>
    Array.isArray(value) &&
    value.every(transaction => transaction !== null && typeof transaction === "object" && !Array.isArray(transaction));
  assert.deepEqual(JSON.parse(JSON.stringify(invalidTransactions("transactions", [], validTransactionList))), []);

  const invalidBudgets = loadStorageHelper("readStoredJson", {
    getItem: () => '["not", "a", "budget map"]'
  });
  const validBudgetMap = value => value !== null && typeof value === "object" && !Array.isArray(value);
  assert.deepEqual(JSON.parse(JSON.stringify(invalidBudgets("budgets", {}, validBudgetMap))), {});
});

test("stored JSON writes report quota or permission failures without throwing", () => {
  const savedEntries = [];
  const saveStoredJson = loadStorageHelper("saveStoredJson", {
    setItem: (key, value) => savedEntries.push([key, value])
  });
  assert.equal(saveStoredJson("transactions", [{ id: 1 }]), true);
  assert.deepEqual(savedEntries, [["transactions", '[{"id":1}]']]);

  const blockedSave = loadStorageHelper("saveStoredJson", {
    setItem: () => { throw new Error("QuotaExceededError"); }
  });
  assert.equal(blockedSave("transactions", []), false);
});

test("application state uses validated storage reads and warns on failed persistence", () => {
  assert.match(inlineScript, /transactions: readStoredJson\("transactions", \[\], value =>/);
  assert.match(inlineScript, /budgets: readStoredJson\("budgets", \{\}, value =>/);
  assert.match(inlineScript, /Browser storage is unavailable or full\. Changes may not persist\./);
});
