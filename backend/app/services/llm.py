from langchain_cohere import ChatCohere
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate

from ..core.config import get_settings


def build_cohere_chain() -> StrOutputParser:
    settings = get_settings()
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "You are a concise assistant."),
            ("human", "{input}")
        ]
    )
    model = ChatCohere(cohere_api_key=settings.cohere_api_key, model=settings.cohere_model)
    parser = StrOutputParser()
    return prompt | model | parser
