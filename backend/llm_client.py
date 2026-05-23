import logging
from openai import AsyncOpenAI, RateLimitError, AuthenticationError

logger = logging.getLogger(__name__)

AI_UNAVAILABLE_MSG = "Funkcja AI jest chwilowo niedostępna. Spróbuj ponownie później."


class UserMessage:
    def __init__(self, text: str):
        self.text = text


class LlmChat:
    def __init__(self, api_key: str, session_id: str, system_message: str):
        self.api_key = api_key
        self.system_message = system_message
        self._model = "gpt-4o-mini"

    def with_model(self, provider: str, model: str) -> "LlmChat":
        self._model = model
        return self

    async def send_message(self, message: UserMessage) -> str:
        try:
            client = AsyncOpenAI(api_key=self.api_key)
            response = await client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": self.system_message},
                    {"role": "user", "content": message.text},
                ],
            )
            return response.choices[0].message.content
        except RateLimitError:
            logger.warning("OpenAI rate limit or quota exceeded")
            return AI_UNAVAILABLE_MSG
        except AuthenticationError:
            logger.error("OpenAI authentication failed — check EMERGENT_LLM_KEY")
            return AI_UNAVAILABLE_MSG
        except Exception as e:
            logger.error(f"LLM error: {e}")
            return AI_UNAVAILABLE_MSG
