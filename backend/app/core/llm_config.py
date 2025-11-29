from dataclasses import dataclass


@dataclass(frozen=True)
class LLMConfig:
    chat_model: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    temperature: float = 0.7
    top_k_ratio: float = 0.3
    top_k_min: int = 2
    top_k_max: int = 10

    def calculate_top_k(self, total_endpoints: int) -> int:
        calculated = int(total_endpoints * self.top_k_ratio)
        return max(self.top_k_min, min(calculated, self.top_k_max))


llm_config = LLMConfig()

