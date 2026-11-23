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

function loadInlineHelper(name) {
  const helperMatch = inlineScript.match(new RegExp(
    "const " + name + " = (\\([\\s\\S]*?\\n            \\})\\s*;"
  ));
  assert.ok(helperMatch, name + " should be defined");
  return vm.runInNewContext("(" + helperMatch[1] + ")");
}

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

test("month navigation avoids date overflow and preserves calendar boundaries", () => {
  const helperStart = inlineScript.indexOf("const shiftMonth = ");
  assert.notEqual(helperStart, -1, "shiftMonth should be present");
  const helperEnd = inlineScript.indexOf(";", helperStart);
  assert.notEqual(helperEnd, -1, "shiftMonth should be terminated");
  const helperExpression = inlineScript
    .slice(helperStart, helperEnd)
    .replace("const shiftMonth = ", "");
  const shiftMonth = vm.runInNewContext("(" + helperExpression + ")");

  const januaryThirtyFirst = new Date(2025, 0, 31);
  const february = shiftMonth(januaryThirtyFirst, 1);
  assert.deepEqual(
    [february.getFullYear(), february.getMonth(), february.getDate()],
    [2025, 1, 1]
  );
  assert.deepEqual(
    [januaryThirtyFirst.getFullYear(), januaryThirtyFirst.getMonth(), januaryThirtyFirst.getDate()],
    [2025, 0, 31],
    "month navigation must not mutate the original date"
  );

  const march = shiftMonth(february, 1);
  assert.deepEqual([march.getFullYear(), march.getMonth(), march.getDate()], [2025, 2, 1]);

  const leapFebruary = shiftMonth(new Date(2024, 2, 31), -1);
  assert.deepEqual(
    [leapFebruary.getFullYear(), leapFebruary.getMonth(), leapFebruary.getDate()],
    [2024, 1, 1]
  );

  const previousDecember = shiftMonth(new Date(2025, 0, 1), -1);
  assert.deepEqual(
    [previousDecember.getFullYear(), previousDecember.getMonth(), previousDecember.getDate()],
    [2024, 11, 1]
  );

  assert.ok(inlineScript.includes("appState.selectedDate = shiftMonth(appState.selectedDate, -1)"));
  assert.ok(inlineScript.includes("appState.selectedDate = shiftMonth(appState.selectedDate, 1)"));
});

test("date-only values preserve their local calendar day in UTC-negative timezones", () => {
  const parseDateOnly = loadInlineHelper("parseDateOnly");
  const formatDateInput = loadInlineHelper("formatDateInput");
  const date = parseDateOnly("2025-03-01");

  assert.ok(date, "valid date should parse");
  assert.equal(date.getFullYear(), 2025);
  assert.equal(date.getMonth(), 2);
  assert.equal(date.getDate(), 1);
  assert.equal(formatDateInput(date), "2025-03-01");
  assert.equal(formatDateInput(new Date(2025, 2, 1, 23, 59)), "2025-03-01");
  assert.equal(formatDateInput(new Date(NaN)), "");
});

test("date-only parser rejects invalid calendar dates and malformed values", () => {
  const parseDateOnly = loadInlineHelper("parseDateOnly");

  for (const invalid of ["", "2025-2-01", "2025-02-29", "2024-13-01", "2024-04-31", "0000-01-01", null, 20250301]) {
    assert.equal(parseDateOnly(invalid), null, `expected ${String(invalid)} to be rejected`);
  }

  const leapDay = parseDateOnly("2024-02-29");
  assert.ok(leapDay);
  assert.equal(leapDay.getFullYear(), 2024);
  assert.equal(leapDay.getMonth(), 1);
  assert.equal(leapDay.getDate(), 29);
});

test("calendar-date parsing is used consistently throughout transaction views", () => {
  assert.match(inlineScript, /const txDate = parseDateOnly\(tx\.date\)/);
  assert.match(inlineScript, /const startDate = parseDateOnly\(appState\.filters\.startDate\)/);
  assert.match(inlineScript, /const endDate = parseDateOnly\(appState\.filters\.endDate\)/);
  assert.match(inlineScript, /const transactionDate = parseDateOnly\(tx\.date\)/);
  assert.match(inlineScript, /const aDate = parseDateOnly\(a\.date\)/);
  assert.match(inlineScript, /const bDate = parseDateOnly\(b\.date\)/);
  assert.equal((inlineScript.match(/formatDateInput\(new Date\(\)\)/g) || []).length, 3);
});
