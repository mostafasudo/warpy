from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings


def configure_cors(app: FastAPI, _settings: Settings) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
