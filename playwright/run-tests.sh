#!/usr/bin/env bash
#
# Run Playwright tests, parse bug-report.json, and output a summary
# of bugs found with fix hints. Designed to be used in an auto-fix loop:
#
#   1. Run tests → bug-report.json
#   2. Parse bugs
#   3. Fix each bug
#   4. Re-run tests
#   5. Repeat until 0 bugs
#
set -euo pipefail

cd "$(dirname "$0")"

echo "=== Running Playwright tests ==="
npx playwright test "$@" 2>&1 || true

echo ""
echo "=== Bug Report ==="

if [ ! -f bug-report.json ]; then
  echo "No bug-report.json found — tests may not have run"
  exit 1
fi

# Parse bug report with node
node -e '
const report = JSON.parse(require("fs").readFileSync("bug-report.json", "utf8"));
console.log(`Total bugs: ${report.total_bugs}`);
console.log("");
if (report.total_bugs === 0) {
  console.log("✓ All tests passed — no bugs found");
  process.exit(0);
}
const bySeverity = {};
const byCategory = {};
for (const bug of report.bugs) {
  bySeverity[bug.severity] = (bySeverity[bug.severity] || 0) + 1;
  byCategory[bug.category] = (byCategory[bug.category] || 0) + 1;
}
console.log("By severity:", JSON.stringify(bySeverity));
console.log("By category:", JSON.stringify(byCategory));
console.log("");
console.log("Bugs:");
for (const bug of report.bugs) {
  console.log(`  [${bug.severity.toUpperCase()}] ${bug.title}`);
  console.log(`    Test: ${bug.test_name}`);
  console.log(`    URL: ${bug.url}`);
  console.log(`    Expected: ${bug.expected}`);
  console.log(`    Actual: ${bug.actual}`);
  console.log(`    Fix: ${bug.fix_hint}`);
  console.log("");
}
process.exit(report.total_bugs > 0 ? 1 : 0);
'
