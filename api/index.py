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

from .utils.stream import stream_text


load_dotenv(".env.local")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI()
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
        model="gpt-5-mini-2025-08-07",
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
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=os.environ.get("OPENROUTER_API_KEY"),
    )

    stream = client.chat.completions.create(
        messages=body.messages,
        model="qwen/qwen3-vl-235b-a22b-instruct",
        extra_body={
            "provider": {
                "order": ["Fireworks", "DeepInfra"],
                "allow_fallbacks": True,
            }
        },
        stream=True,
    )

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
