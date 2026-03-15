from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_INSTALL_DOC = ROOT / "docs-site" / "setup" / "activate-agent.mdx"
INTERNAL_FRONTEND_DOC = ROOT / "docs" / "frontend-agent.md"


def test_public_activate_agent_doc_stays_customer_facing() -> None:
    content = PUBLIC_INSTALL_DOC.read_text(encoding="utf-8")

    assert "Warpy-managed widget routes" not in content
    assert "GET /widget/config" not in content
    assert "WS /widget/session" not in content
    assert "POST /widget/transcribe" not in content


def test_internal_frontend_agent_doc_keeps_route_ownership_note() -> None:
    content = INTERNAL_FRONTEND_DOC.read_text(encoding="utf-8")

    assert "## Route ownership" in content
    assert "GET /widget/config/{agentId}" in content
    assert "WS /widget/session" in content
    assert "POST /widget/transcribe" in content
