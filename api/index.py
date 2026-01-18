from typing import Any, List
from pydantic import BaseModel
from dotenv import load_dotenv
from fastapi import FastAPI, Request as FastAPIRequest
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from openai import OpenAI
import os
from google import genai
from google.genai import types

from .utils.stream import stream_text
from .utils.gemini import convert_openai_to_gemini, stream_gemini


# Monkeypatch ThinkingConfig to allow extra fields like thinking_level
types.ThinkingConfig.model_config["extra"] = "allow"
types.ThinkingConfig.model_rebuild(force=True)


load_dotenv(".env.local")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

is_production = (
    os.getenv("RAILWAY_ENVIRONMENT_NAME") == "production"
    or os.getenv("VERCEL_ENV") == "production"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://screen.vision", "https://www.screen.vision"]
    if is_production
    else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MessagesRequest(BaseModel):
    messages: List[Any]


@app.post("/api/step")
@limiter.limit("20/minute;300/hour")
async def handle_step_chat(request: FastAPIRequest, body: MessagesRequest):
    client = OpenAI()

    stream = client.chat.completions.create(
        messages=body.messages,
        model="gpt-5.2",
        stream=True,
        reasoning_effort="low",
    )

    response = StreamingResponse(
        stream_text(stream, {}),
        media_type="text/event-stream",
    )

    return response


@app.post("/api/help")
@limiter.limit("8/minute;100/hour")
async def handle_help_chat(request: FastAPIRequest, body: MessagesRequest):
    client = OpenAI()

    stream = client.chat.completions.create(
        messages=body.messages,
        model="gpt-5-mini-2025-08-07",
        stream=True,
        reasoning_effort="low",
    )

    response = StreamingResponse(
        stream_text(stream, {}),
        media_type="text/event-stream",
    )

    return response


@app.post("/api/check")
@limiter.limit("30/minute;500/hour")
async def handle_check_chat(request: FastAPIRequest, body: MessagesRequest):
    gemini_api_key = os.environ.get("GEMINI_API_KEY")

    if gemini_api_key:
        client = genai.Client(
            vertexai=True,
            api_key=gemini_api_key,
        )
        model = "gemini-3-flash-preview"

        system_instruction_parts = []
        for msg in body.messages:
            if msg.get("role") == "system":
                content = msg.get("content")
                if isinstance(content, str):
                    system_instruction_parts.append(types.Part.from_text(text=content))
                elif isinstance(content, list):
                    for part in content:
                        if part.get("type") == "text":
                            system_instruction_parts.append(
                                types.Part.from_text(text=part.get("text"))
                            )

        system_instruction = (
            types.Content(parts=system_instruction_parts)
            if system_instruction_parts
            else None
        )

        contents = convert_openai_to_gemini(body.messages)

        generate_content_config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            thinking_config=types.ThinkingConfig(
                thinking_level="MINIMAL",
            ),
        )

        stream = client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=generate_content_config,
        )

        response = StreamingResponse(
            stream_gemini(stream),
            media_type="text/event-stream",
        )
        return response
    else:
        client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY"),
        )
        kwargs = {
            "messages": body.messages,
            "model": "google/gemini-3-flash-preview",
            "extra_body": {
                "provider": {
                    "order": ["Google AI Studio"],
                    "allow_fallbacks": True,
                }
            },
            "reasoning_effort": "minimal",
            "stream": True,
        }

    stream = client.chat.completions.create(**kwargs)

    response = StreamingResponse(
        stream_text(stream, {}),
        media_type="text/event-stream",
    )

    return response


@app.post("/api/coordinates")
@limiter.limit("15/minute;200/hour")
async def handle_coordinate_chat(request: FastAPIRequest, body: MessagesRequest):
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY"),
    )

    stream = client.chat.completions.create(
        messages=body.messages,
        model="qwen/qwen3-vl-30b-a3b-instruct",
        extra_body={"provider": {"order": ["Fireworks"], "allow_fallbacks": True}},
        stream=True,
    )

    response = StreamingResponse(
        stream_text(stream, {}),
        media_type="text/event-stream",
    )

    return response
