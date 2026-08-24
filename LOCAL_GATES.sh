#!/usr/bin/env bash
# Local mirror of CI: same recipes, one task runner.
set -euo pipefail
cd "$(dirname "$0")"
exec just ci
