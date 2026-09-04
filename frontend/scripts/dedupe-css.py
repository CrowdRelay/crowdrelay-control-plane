#!/usr/bin/env python3
"""Remove declarations the cascade already throws away.

`styles.css` grew by appending a fix layer whenever something looked wrong,
so the same selector is declared up to eight times and most of the earlier
declarations never reach a pixel. This deletes only the ones that are provably
dead:

  same at-rule context, byte-identical selector group, same property declared
  again later, neither marked `!important`

For a fixed selector and specificity the last declaration of a property wins,
whatever other rules sit between them, so dropping an earlier one cannot change
what any element computes. Everything else — comments, keyframes, ordering,
shorthand/longhand pairs, anything touching `!important` — is left alone.

Run from `frontend/`:  python3 scripts/dedupe-css.py src/styles.css
Pass --check to report without writing.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field


@dataclass
class Rule:
    prelude: str
    body: str
    start: int
    end: int
    context: str
    decls: list[tuple[str, str, str]] = field(default_factory=list)  # prop, raw, whole


def split_top_level(css: str, start: int, end: int, context: str, out: list[Rule]) -> None:
    """Walk a block, collecting leaf rules and recursing into at-rules."""
    i = start
    depth = 0
    prelude_start = i
    while i < end:
        ch = css[i]
        if ch == '/' and css[i + 1:i + 2] == '*':
            close = css.find('*/', i + 2)
            i = end if close == -1 else close + 2
            continue
        if ch == '{':
            if depth == 0:
                prelude = css[prelude_start:i].strip()
                block_start = i + 1
                block_end = matching_brace(css, i)
                if prelude.startswith('@'):
                    keyword = prelude.split()[0].lower()
                    if keyword in ('@media', '@supports', '@layer', '@container'):
                        split_top_level(css, block_start, block_end, f'{context}||{prelude}', out)
                    # @keyframes and friends: leave the whole block untouched.
                else:
                    out.append(Rule(prelude, css[block_start:block_end], block_start, block_end, context))
                i = block_end + 1
                prelude_start = i
                continue
            depth += 1
        elif ch == '}':
            depth -= 1
        i += 1


def matching_brace(css: str, open_index: int) -> int:
    depth = 0
    i = open_index
    while i < len(css):
        ch = css[i]
        if ch == '/' and css[i + 1:i + 2] == '*':
            close = css.find('*/', i + 2)
            i = len(css) if close == -1 else close + 2
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i
        i += 1
    raise ValueError('unbalanced braces')


DECL_RE = re.compile(r'([^;{}]+)(;|$)')


def parse_decls(body: str) -> list[tuple[str, str, str]]:
    decls = []
    for match in DECL_RE.finditer(body):
        raw = match.group(1)
        text = raw.strip()
        if not text or ':' not in text:
            continue
        prop = text.split(':', 1)[0].strip().lower()
        if not prop or prop.startswith('/*'):
            continue
        decls.append((prop, text, match.group(0)))
    return decls


def normalize_selector(prelude: str) -> str:
    parts = [re.sub(r'\s+', ' ', p.strip()) for p in prelude.split(',')]
    return ','.join(sorted(p for p in parts if p))


def main() -> int:
    path = sys.argv[1] if len(sys.argv) > 1 else 'src/styles.css'
    check_only = '--check' in sys.argv
    fail_on_dead = '--fail-on-dead' in sys.argv
    css = open(path, encoding='utf-8').read()

    rules: list[Rule] = []
    split_top_level(css, 0, len(css), '', rules)
    for rule in rules:
        rule.decls = parse_decls(rule.body)

    groups: dict[tuple[str, str], list[int]] = {}
    for index, rule in enumerate(rules):
        groups.setdefault((rule.context, normalize_selector(rule.prelude)), []).append(index)

    # prop -> highest rule index that declares it, per group
    dead: list[tuple[int, str]] = []
    for indices in groups.values():
        if len(indices) < 2:
            continue
        last_seen: dict[str, int] = {}
        for index in indices:
            for prop, text, _ in rules[index].decls:
                if '!important' in text.lower():
                    last_seen.pop(prop, None)
                    continue
                last_seen[prop] = index
        for index in indices:
            for prop, text, _ in rules[index].decls:
                if '!important' in text.lower():
                    continue
                if last_seen.get(prop, index) > index:
                    dead.append((index, prop))

    if not dead:
        print('CSS_DEDUPE=NOOP')
        return 0

    by_rule: dict[int, set[str]] = {}
    for index, prop in dead:
        by_rule.setdefault(index, set()).add(prop)

    # Rewrite from the back so earlier offsets stay valid.
    out = css
    removed_decls = 0
    removed_rules = 0
    for index in sorted(by_rule, reverse=True):
        rule = rules[index]
        kept = []
        for prop, text, _ in rule.decls:
            if prop in by_rule[index]:
                removed_decls += 1
            else:
                kept.append(text)
        if kept:
            replacement = ';'.join(kept)
            out = out[:rule.start] + replacement + out[rule.end:]
        else:
            # Drop the whole rule, including its prelude and braces.
            removed_rules += 1
            prelude_start = rule.start - 1 - len(rule.prelude)
            # Walk back over whitespace between the previous token and prelude.
            while prelude_start > 0 and out[prelude_start - 1] in ' \n\t':
                prelude_start -= 1
            out = out[:prelude_start] + out[rule.end + 1:]

    before = len(css)
    after = len(out)
    print(
        f'CSS_DEDUPE=PASS rules={len(rules)} dead_declarations={removed_decls} '
        f'emptied_rules={removed_rules} bytes={before}->{after} saved={before - after}'
    )
    if not check_only:
        open(path, 'w', encoding='utf-8').write(out)
    if fail_on_dead:
        print(
            'ERROR: dead declarations in the stylesheet. Run '
            '`python3 scripts/dedupe-css.py src/styles.css` and commit the result.',
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
