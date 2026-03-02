from dataclasses import dataclass

from .config import get_settings


@dataclass(frozen=True)
class LLMConfig:
    chat_model: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-large"
    embedding_dimensions: int = 3072
    whisper_model: str = "whisper-1"
    max_audio_bytes: int = 5_242_880
    temperature: float = 0.7
    top_k_ratio: float = 0.3
    top_k_min: int = 2
    top_k_max: int = 10
    max_iterations: int = 20
    max_cached_tools: int = 24
    tool_cache_ttl: int = 86400
    kb_top_k_min: int = 3
    kb_top_k_max: int = 8
    kb_chunk_max_chars: int = 1500
    kb_chunk_overlap_chars: int = 200

    def calculate_top_k(self, total_tools: int) -> int:
        if total_tools <= 0:
            return 0
        calculated = int(total_tools * self.top_k_ratio)
        return min(total_tools, max(self.top_k_min, min(calculated, self.top_k_max)))

    def calculate_kb_top_k(self, total_chunks: int) -> int:
        if total_chunks <= 0:
            return 0
        calculated = int(total_chunks * 0.02)
        return min(total_chunks, max(self.kb_top_k_min, min(calculated, self.kb_top_k_max)))


def build_llm_config(environment: str, use_good_models: bool = False) -> LLMConfig:
    if environment == "production":
        return LLMConfig(
            chat_model="gpt-5.2",
            embedding_model="text-embedding-3-large",
            embedding_dimensions=3072,
            whisper_model="gpt-4o-transcribe",
        )
    if use_good_models:
        return LLMConfig(
            chat_model="gpt-5.2",
            whisper_model="gpt-4o-transcribe",
        )
    return LLMConfig()


llm_config = build_llm_config(get_settings().environment, get_settings().use_good_models)
