#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHELL = (ROOT / "frontend/src/components/Shell.tsx").read_text(encoding="utf-8")
CHAT = (ROOT / "frontend/src/components/ChatWidget.tsx").read_text(encoding="utf-8")

# The shell must keep the chat chunk off the tenant hot path until a person
# explicitly asks for it. Lazy import alone is not enough if the lazy component
# is mounted immediately.
assert "const ChatWidget = lazy(" in SHELL
assert "const [chatLoaded, setChatLoaded]" in SHELL
assert "<Show when={chatLoaded()}>" in SHELL
assert "onClick={() => setChatOpen(true)}" in SHELL

# Chat uses the shared Kobalte/shadCN-style Sheet. Do not grow another custom
# modal implementation with its own focus trap, viewport math and shadows.
assert "SheetContent" in CHAT
assert "visualViewport" not in CHAT
assert "panelRef" not in CHAT
assert "trapTab" not in CHAT
assert "shadow-xl" not in CHAT
assert 'AI Assistant' not in CHAT
assert "CrowdRelay" in CHAT

print("CHAT_SHELL_CONTRACT=PASS lazy=true sheet=true legacy_modal=false")
