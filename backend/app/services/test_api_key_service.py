import pytest

from app.services.api_key_service import decrypt_api_key, encrypt_api_key, generate_api_key, hash_api_key, is_warpy_api_key


@pytest.fixture(autouse=True)
def configure_settings(monkeypatch: pytest.MonkeyPatch):
    from app.core.config import get_settings

    monkeypatch.setenv("API_KEY_ENCRYPTION_SECRET", "secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_generate_api_key_uses_expected_prefix():
    api_key, last4 = generate_api_key()
    assert api_key.startswith("wrk_")
    assert api_key.endswith(last4)


def test_hash_api_key_is_stable():
    first = hash_api_key("key")
    second = hash_api_key("key")
    assert first == second


def test_encrypt_and_decrypt_api_key_round_trip():
    api_key, _ = generate_api_key()
    ciphertext = encrypt_api_key(api_key)
    assert ciphertext != api_key
    assert decrypt_api_key(ciphertext) == api_key


def test_is_warpy_api_key_detects_prefix():
    assert is_warpy_api_key("wrk_test")
    assert not is_warpy_api_key("token")
