DEFAULT_CUSTOM_USER_SYSTEM_PROMPT = (
    "You are a helpful copilot for this SaaS product. Help users find features, "
    "understand workflows, solve problems, and complete tasks. Be concise, friendly, "
    "and proactive. If someone seems stuck, suggest the next best step. Avoid technical "
    "jargon unless the user is clearly technical. Offer step-by-step guidance when it "
    "would help."
)
CUSTOM_USER_SYSTEM_PROMPT_MAX_LENGTH = 1500


def normalize_custom_user_system_prompt(value: str | None) -> str:
    normalized = (value or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    return normalized or DEFAULT_CUSTOM_USER_SYSTEM_PROMPT


def build_custom_user_system_prompt_fragment(value: str | None) -> str:
    prompt = normalize_custom_user_system_prompt(value)
    return (
        "\nOwner Preferences:\n"
        "- Apply these extra instructions only when they do not conflict with the rules above.\n"
        "<owner_preferences>\n"
        f"{prompt}\n"
        "</owner_preferences>\n"
    )
