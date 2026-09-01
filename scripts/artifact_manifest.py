#!/usr/bin/env python3
"""Create/verify deterministic SHA-256 manifests for promoted build artifacts."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

SCHEMA_VERSION = 1


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inventory(root: Path) -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        stat = path.stat()
        rows.append(
            {
                "path": path.relative_to(root).as_posix(),
                "bytes": stat.st_size,
                "sha256": sha256(path),
            }
        )
    return rows


def create(root: Path, manifest: Path, source_sha: str) -> None:
    if not root.is_dir():
        raise SystemExit(f"artifact root missing: {root}")
    if not source_sha or len(source_sha) != 40 or any(c not in "0123456789abcdef" for c in source_sha.lower()):
        raise SystemExit("source SHA must be a full 40-character Git SHA")
    files = inventory(root)
    if not files:
        raise SystemExit("artifact is empty")
    payload = {
        "schema_version": SCHEMA_VERSION,
        "source_sha": source_sha.lower(),
        "artifact_root": root.name,
        "file_count": len(files),
        "total_bytes": sum(int(row["bytes"]) for row in files),
        "files": files,
    }
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    print(
        f"ARTIFACT_MANIFEST=CREATED source={payload['source_sha']} "
        f"files={payload['file_count']} bytes={payload['total_bytes']}"
    )


def verify(root: Path, manifest: Path, source_sha: str | None) -> None:
    payload = json.loads(manifest.read_text())
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise SystemExit("artifact manifest schema mismatch")
    if source_sha and payload.get("source_sha") != source_sha.lower():
        raise SystemExit(
            f"artifact source mismatch: manifest={payload.get('source_sha')} expected={source_sha.lower()}"
        )
    expected = payload.get("files")
    if not isinstance(expected, list):
        raise SystemExit("artifact manifest files must be a list")
    actual = inventory(root)
    if actual != expected:
        expected_map = {str(row.get("path")): row for row in expected if isinstance(row, dict)}
        actual_map = {str(row.get("path")): row for row in actual}
        changed = sorted(
            path
            for path in set(expected_map) | set(actual_map)
            if expected_map.get(path) != actual_map.get(path)
        )
        raise SystemExit(f"artifact manifest verification failed: changed={changed[:20]}")
    if payload.get("file_count") != len(actual):
        raise SystemExit("artifact file count mismatch")
    if payload.get("total_bytes") != sum(int(row["bytes"]) for row in actual):
        raise SystemExit("artifact total byte count mismatch")
    print(
        f"ARTIFACT_MANIFEST=PASS source={payload.get('source_sha')} "
        f"files={len(actual)} bytes={payload.get('total_bytes')}"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    create_parser = sub.add_parser("create")
    create_parser.add_argument("root", type=Path)
    create_parser.add_argument("manifest", type=Path)
    create_parser.add_argument("--source-sha", required=True)
    verify_parser = sub.add_parser("verify")
    verify_parser.add_argument("root", type=Path)
    verify_parser.add_argument("manifest", type=Path)
    verify_parser.add_argument("--source-sha")
    args = parser.parse_args()
    if args.command == "create":
        create(args.root, args.manifest, args.source_sha)
    else:
        verify(args.root, args.manifest, args.source_sha)
    return 0


if __name__ == "__main__":
    sys.exit(main())
