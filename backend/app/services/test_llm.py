from unittest.mock import MagicMock, patch

from app.services.llm import build_cohere_chain


def test_build_cohere_chain_uses_settings(monkeypatch):
    from app.core.config import get_settings

    get_settings.cache_clear()
    monkeypatch.setenv("COHERE_API_KEY", "abc123")
    monkeypatch.setenv("COHERE_MODEL", "command-xlarge")
    with patch("app.services.llm.ChatCohere") as chat_clazz:
        instance = MagicMock()
        chat_clazz.return_value = instance
        chain = build_cohere_chain()
    assert chain is not None
    chat_clazz.assert_called_once_with(cohere_api_key="abc123", model="command-xlarge")

