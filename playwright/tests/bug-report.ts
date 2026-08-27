/**
 * Bug report writer — collects test failures and writes them to a structured
 * JSON file that can be picked up by an automated fix loop.
 *
 * Format:
 * {
 *   "generated_at": "2026-08-28T...",
 *   "total_bugs": N,
 *   "bugs": [
 *     {
 *       "id": "bug-001",
 *       "severity": "critical|high|medium|low",
 *       "category": "http|ui|api|auth|data",
 *       "title": "short description",
 *       "test_name": "test file::test name",
 *       "url": "the URL that was tested",
 *       "expected": "what should happen",
 *       "actual": "what actually happened",
 *       "screenshot": "path to screenshot if available",
 *       "stack": "error stack trace",
 *       "fix_hint": "suggested fix area"
 *     }
 *   ]
 * }
 */

import fs from 'node:fs'
import path from 'node:path'

export interface Bug {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'http' | 'ui' | 'api' | 'auth' | 'data'
  title: string
  test_name: string
  url: string
  expected: string
  actual: string
  screenshot?: string
  stack?: string
  fix_hint: string
}

export interface BugReport {
  generated_at: string
  total_bugs: number
  bugs: Bug[]
}

const REPORT_PATH = path.resolve(import.meta.dirname, '..', 'bug-report.json')

let bugs: Bug[] = []

export function resetBugs() {
  bugs = []
}

export function addBug(bug: Omit<Bug, 'id'>) {
  const id = `bug-${String(bugs.length + 1).padStart(3, '0')}`
  bugs.push({ ...bug, id })
}

export function writeBugReport() {
  const report: BugReport = {
    generated_at: new Date().toISOString(),
    total_bugs: bugs.length,
    bugs,
  }
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2))
  console.log(`\n📋 Bug report written to ${REPORT_PATH}`)
  console.log(`   ${bugs.length} bug(s) found`)
  if (bugs.length > 0) {
    console.log(`   Severities: ${bugs.map(b => b.severity).join(', ')}`)
  }
  return report
}

export function getBugReportPath() {
  return REPORT_PATH
}
