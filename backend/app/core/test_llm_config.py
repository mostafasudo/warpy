from app.core.llm_config import llm_config


def test_calculate_top_k_bounds():
    assert llm_config.calculate_top_k(0) == 0
    assert llm_config.calculate_top_k(1) == 1
    assert llm_config.calculate_top_k(100) <= llm_config.top_k_max
