"""Wizard payload contract: the SPA may not send a field the API rejects.

`CreateTenantRequest` is `#[serde(deny_unknown_fields)]`. The onboarding wizard
sent `signalEnabled`, `synesthesiaEnabled`, `northStarMetric` and
`fanbaseSources` for a long time while the struct declared none of them, so
every submission failed with 422 and no tenant could be created through the UI.
Nothing caught it: the browser smoke test only logs in, navigates and logs out.

This gate compares the keys the wizard actually posts against the fields the
request struct accepts, in both directions, so the two cannot drift again.
"""

from __future__ import annotations

import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MODEL = ROOT / "crates/control-plane-api/src/model.rs"
WIZARD = ROOT / "frontend/src/pages/TenantWizardPage.tsx"
API_CLIENT = ROOT / "frontend/src/lib/api.ts"


def snake_to_camel(value: str) -> str:
    head, *rest = value.split("_")
    return head + "".join(part.title() for part in rest)


def request_struct_fields() -> set[str]:
    """Field names of CreateTenantRequest, as the camelCase wire names."""
    source = MODEL.read_text(encoding="utf-8")
    start = source.index("pub struct CreateTenantRequest {")
    body = source[start : source.index("\n}", start)]
    fields = re.findall(r"^\s*pub (\w+):", body, flags=re.MULTILINE)
    assert fields, "no fields parsed from CreateTenantRequest"
    return {snake_to_camel(name) for name in fields}


def strip_nested_braces(body: str) -> str:
    """Blank out anything nested deeper than the outer object literal.

    `initialOperator: { username, password }` would otherwise contribute its
    inner keys as if the wizard posted them at the top level.
    """
    out: list[str] = []
    depth = 0
    for char in body:
        if char == "{":
            depth += 1
            out.append(char if depth == 1 else " ")
        elif char == "}":
            out.append(char if depth == 1 else " ")
            depth -= 1
        else:
            out.append(char if depth <= 1 else " ")
    return "".join(out)


def wizard_payload_keys() -> set[str]:
    """Top-level keys the wizard passes to api.createTenant({...})."""
    source = WIZARD.read_text(encoding="utf-8")
    start = source.index("api.createTenant({")
    body = strip_nested_braces(source[start : source.index("\n    }),", start)])
    keys = re.findall(r"[{,]\s*(\w+):", body)
    assert keys, "no keys parsed from the wizard createTenant call"
    return set(keys)


def client_input_fields() -> set[str]:
    """Fields declared on the CreateTenantInput TypeScript type."""
    source = API_CLIENT.read_text(encoding="utf-8")
    start = source.index("type CreateTenantInput = {")
    body = source[start : source.index("\n}", start)]
    return set(re.findall(r"^\s*(\w+)\??:", body, flags=re.MULTILINE))


class WizardPayloadContract(unittest.TestCase):
    def test_every_wizard_key_is_accepted_by_the_api(self) -> None:
        unknown = wizard_payload_keys() - request_struct_fields()
        self.assertEqual(
            unknown,
            set(),
            "wizard posts fields CreateTenantRequest rejects (deny_unknown_fields "
            f"=> HTTP 422): {sorted(unknown)}",
        )

    def test_every_wizard_key_is_typed_on_the_client(self) -> None:
        untyped = wizard_payload_keys() - client_input_fields()
        self.assertEqual(
            untyped,
            set(),
            f"wizard posts keys absent from CreateTenantInput: {sorted(untyped)}",
        )

    def test_client_type_claims_nothing_the_api_rejects(self) -> None:
        unknown = client_input_fields() - request_struct_fields()
        self.assertEqual(
            unknown,
            set(),
            f"CreateTenantInput declares fields the API rejects: {sorted(unknown)}",
        )

    def test_product_and_growth_intent_is_carried(self) -> None:
        """The four fields whose absence broke tenant creation stay wired."""
        posted = wizard_payload_keys()
        for key in (
            "signalEnabled",
            "synesthesiaEnabled",
            "areaEnabled",
            "northStarMetric",
            "fanbaseSources",
        ):
            self.assertIn(key, posted, f"wizard stopped sending {key}")
            self.assertIn(
                key,
                request_struct_fields(),
                f"CreateTenantRequest stopped accepting {key}",
            )


if __name__ == "__main__":
    unittest.main()
