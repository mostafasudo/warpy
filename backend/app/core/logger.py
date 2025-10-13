import logging
import sys
from functools import lru_cache
from typing import Any


class AppLogger:
    _instance: logging.Logger | None = None

    @classmethod
    def get_logger(cls) -> logging.Logger:
        if cls._instance is None:
            cls._instance = cls._setup_logger()
        return cls._instance

    @classmethod
    def _setup_logger(cls) -> logging.Logger:
        logger = logging.getLogger("chat_to_api")
        logger.setLevel(logging.INFO)
        logger.propagate = False

        if not logger.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setLevel(logging.INFO)
            formatter = logging.Formatter(
                "%(asctime)s - %(levelname)s - %(message)s",
                datefmt="%Y-%m-%d %H:%M:%S"
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)

        return logger


@lru_cache(maxsize=1)
def get_logger() -> logging.Logger:
    return AppLogger.get_logger()


def log_info(scope: str, method: str, message: str, **kwargs: Any) -> None:
    logger = get_logger()
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    log_msg = f"[{scope}] [{method}]: {message}"
    if extra:
        log_msg += f" | {extra}"
    logger.info(log_msg)


def log_warning(scope: str, method: str, message: str, **kwargs: Any) -> None:
    logger = get_logger()
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    log_msg = f"[{scope}] [{method}]: {message}"
    if extra:
        log_msg += f" | {extra}"
    logger.warning(log_msg)


def log_error(scope: str, method: str, message: str, exc: Exception | None = None, **kwargs: Any) -> None:
    logger = get_logger()
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    log_msg = f"[{scope}] [{method}]: {message}"
    if extra:
        log_msg += f" | {extra}"
    logger.error(log_msg, exc_info=exc)


def log_debug(scope: str, method: str, message: str, **kwargs: Any) -> None:
    logger = get_logger()
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items()) if kwargs else ""
    log_msg = f"[{scope}] [{method}]: {message}"
    if extra:
        log_msg += f" | {extra}"
    logger.debug(log_msg)

