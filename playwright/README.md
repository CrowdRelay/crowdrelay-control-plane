# Playwright Tests for control.virya.music

Comprehensive test suite for the CrowdRelay Control Plane at https://control.virya.music.

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Run all tests
npm test

# Run specific suite
npm run smoke    # HTTP smoke tests
npm run auth     # Authentication tests
npm run pages    # UI page tests
npm run api      # API endpoint tests
npm run agents   # Agent panel tests
npm run fanbase  # Fanbase connection tests
npm run safety   # Security/XSS tests

# View test report
npx playwright show-report
```

## Authenticated Tests

Some tests require authentication. Set these env vars:

```bash
export CONTROL_PLANE_TEST_USER="your-username"
export CONTROL_PLANE_TEST_PASS="your-password"
```

Without these, authenticated tests will be skipped.

## Bug Report

Test failures are collected into `bug-report.json` with structured information:
- Severity (critical, high, medium, low)
- Category (http, ui, api, auth, data)
- Title, expected vs actual behavior
- Fix hints

## Test Categories

| Tag | Description |
|-----|-------------|
| `@smoke` | HTTP smoke tests — fastest, catch deployment issues |
| `@http` | HTTP status code checks for all routes |
| `@api` | API endpoint structure validation |
| `@pages` | UI page load and content checks |
| `@agents` | Agent panel (scorecard, templates, tasks, OAuth) |
| `@fanbase` | Fanbase connections and OAuth flows |
| `@safety` | Security: XSS, CORS, secrets, headers |
| `@auth` | Authentication and authorization |

## Design Principles

1. **Read-only**: No destructive actions, no data mutation
2. **Production-safe**: Tests run against production without side effects
3. **Structured reporting**: Failures produce actionable bug reports
4. **Tag-based**: Run subsets with `--grep @tag`
5. **Sequential**: One worker, no parallel execution against production
