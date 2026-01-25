from app.core.llm_config import build_llm_config, llm_config


def test_calculate_top_k_bounds():
    assert llm_config.calculate_top_k(0) == 0
    assert llm_config.calculate_top_k(1) == 1
    assert llm_config.calculate_top_k(100) <= llm_config.top_k_max


def test_build_llm_config_local_defaults():
    config = build_llm_config("local")
    assert config.chat_model == "gpt-4o"
    assert config.embedding_model == "text-embedding-3-small"
    assert config.embedding_dimensions == 1536
    assert config.whisper_model == "whisper-1"


def test_build_llm_config_production_overrides():
    config = build_llm_config("production")
    assert config.chat_model == "gpt-5.2"
    assert config.embedding_model == "text-embedding-3-large"
    assert config.embedding_dimensions == 3072
    assert config.whisper_model == "gpt-4o-transcribe"
