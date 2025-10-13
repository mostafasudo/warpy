import logging
from unittest.mock import MagicMock, patch

import pytest

from .logger import AppLogger, get_logger, log_debug, log_error, log_info, log_warning


def test_app_logger_singleton():
    logger1 = AppLogger.get_logger()
    logger2 = AppLogger.get_logger()
    assert logger1 is logger2


def test_get_logger_cached():
    logger1 = get_logger()
    logger2 = get_logger()
    assert logger1 is logger2


def test_log_info_format(caplog):
    with caplog.at_level(logging.INFO):
        log_info("TestController", "test_method", "test message")
    assert "[TestController] [test_method]: test message" in caplog.text


def test_log_info_with_kwargs(caplog):
    with caplog.at_level(logging.INFO):
        log_info("TestController", "test_method", "test message", user_id="123", status="active")
    log_text = caplog.text
    assert "[TestController] [test_method]: test message" in log_text
    assert "user_id=123" in log_text
    assert "status=active" in log_text


def test_log_warning_format(caplog):
    with caplog.at_level(logging.WARNING):
        log_warning("TestService", "test_method", "warning message")
    assert "[TestService] [test_method]: warning message" in caplog.text


def test_log_warning_with_kwargs(caplog):
    with caplog.at_level(logging.WARNING):
        log_warning("TestService", "test_method", "warning message", retries=3)
    log_text = caplog.text
    assert "[TestService] [test_method]: warning message" in log_text
    assert "retries=3" in log_text


def test_log_error_format(caplog):
    with caplog.at_level(logging.ERROR):
        log_error("TestWorker", "test_job", "error occurred")
    assert "[TestWorker] [test_job]: error occurred" in caplog.text


def test_log_error_with_exception(caplog):
    test_exception = ValueError("test error")
    with caplog.at_level(logging.ERROR):
        log_error("TestWorker", "test_job", "error occurred", exc=test_exception)
    log_text = caplog.text
    assert "[TestWorker] [test_job]: error occurred" in log_text
    assert "ValueError" in log_text
    assert "test error" in log_text


def test_log_error_with_kwargs(caplog):
    with caplog.at_level(logging.ERROR):
        log_error("TestWorker", "test_job", "error occurred", task_id="abc123")
    log_text = caplog.text
    assert "[TestWorker] [test_job]: error occurred" in log_text
    assert "task_id=abc123" in log_text


def test_log_debug_format(caplog):
    with caplog.at_level(logging.DEBUG):
        log_debug("TestService", "test_method", "debug info")
    assert "[TestService] [test_method]: debug info" in caplog.text


def test_log_debug_with_kwargs(caplog):
    with caplog.at_level(logging.DEBUG):
        log_debug("TestService", "test_method", "debug info", trace_id="xyz789")
    log_text = caplog.text
    assert "[TestService] [test_method]: debug info" in log_text
    assert "trace_id=xyz789" in log_text


def test_logger_configuration():
    logger = get_logger()
    assert logger.name == "chat_to_api"
    assert logger.level == logging.INFO
    assert len(logger.handlers) > 0
    handler = logger.handlers[0]
    assert isinstance(handler, logging.StreamHandler)


def test_app_logger_reset():
    AppLogger._instance = None
    logger = AppLogger.get_logger()
    assert logger is not None
    assert logger.name == "chat_to_api"

