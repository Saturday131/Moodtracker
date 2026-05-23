from openai import AsyncOpenAI


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
        client = AsyncOpenAI(api_key=self.api_key)
        response = await client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": self.system_message},
                {"role": "user", "content": message.text},
            ],
        )
        return response.choices[0].message.content
