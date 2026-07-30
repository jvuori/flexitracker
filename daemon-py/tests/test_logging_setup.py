import logging

import pytest

from flexitracker.logging_setup import LOGGER_NAME, configure_logging


@pytest.fixture(autouse=True)
def _reset_logger():
    # configure_logging is idempotent (no-op once handlers exist), so each
    # test needs a clean slate rather than reusing the process-wide singleton.
    logger = logging.getLogger(LOGGER_NAME)
    logger.handlers.clear()
    logger.setLevel(logging.NOTSET)
    yield
    logger.handlers.clear()
    logger.setLevel(logging.NOTSET)


def _log_path(tmp_path):
    return tmp_path / "flexitracker.log"


def test_writes_to_a_rotating_file_next_to_config(tmp_path):
    config_path = tmp_path / "config.toml"
    logger = configure_logging(config_path)
    logger.info("hello")
    for h in logger.handlers:
        h.flush()
    assert "hello" in _log_path(tmp_path).read_text(encoding="utf-8")


def test_default_level_is_info_debug_is_suppressed(tmp_path):
    config_path = tmp_path / "config.toml"
    logger = configure_logging(config_path)
    logger.info("span start")
    logger.debug("heartbeat tick")
    for h in logger.handlers:
        h.flush()
    text = _log_path(tmp_path).read_text(encoding="utf-8")
    assert "span start" in text
    assert "heartbeat tick" not in text


def test_env_var_raises_level_to_debug(tmp_path, monkeypatch):
    monkeypatch.setenv("FLEXITRACKER_LOG_LEVEL", "DEBUG")
    config_path = tmp_path / "config.toml"
    logger = configure_logging(config_path)
    logger.debug("heartbeat tick")
    for h in logger.handlers:
        h.flush()
    assert "heartbeat tick" in _log_path(tmp_path).read_text(encoding="utf-8")


def test_rotates_past_the_size_limit(tmp_path):
    config_path = tmp_path / "config.toml"
    logger = configure_logging(config_path, max_bytes=500, backup_count=2)
    for i in range(200):
        logger.info("padding line number %d to force rotation", i)
    assert _log_path(tmp_path).exists()
    assert (tmp_path / "flexitracker.log.1").exists()


def test_no_stderr_handler_when_stderr_is_absent(tmp_path, monkeypatch):
    # Mirrors a --windowed frozen build, where sys.stderr is None.
    monkeypatch.setattr("flexitracker.logging_setup.sys.stderr", None)
    config_path = tmp_path / "config.toml"
    logger = configure_logging(config_path)
    assert len(logger.handlers) == 1


def test_stderr_handler_present_when_stderr_is_attached(tmp_path):
    config_path = tmp_path / "config.toml"
    logger = configure_logging(config_path)
    assert len(logger.handlers) == 2


def test_second_call_is_a_no_op(tmp_path):
    config_path = tmp_path / "config.toml"
    configure_logging(config_path)
    handlers_after_first = list(logging.getLogger(LOGGER_NAME).handlers)
    configure_logging(config_path)
    assert logging.getLogger(LOGGER_NAME).handlers == handlers_after_first
