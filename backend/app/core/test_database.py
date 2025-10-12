import importlib

import pytest
from sqlalchemy import text


def load_database(monkeypatch, url: str):
    from app.core.config import get_settings

    monkeypatch.setenv("DATABASE_URL", url)
    get_settings.cache_clear()
    module = importlib.import_module("app.core.database")
    return importlib.reload(module)


def test_session_scope_commits(monkeypatch):
    database_module = load_database(monkeypatch, "sqlite:///:memory:")
    with database_module.session_scope() as session:
        session.execute(text("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"))
    with database_module.session_scope() as session:
        result = session.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='items'")
        ).scalar()
        assert result == "items"


def test_session_scope_rolls_back(monkeypatch):
    database_module = load_database(monkeypatch, "sqlite:///:memory:")
    with database_module.session_scope() as session:
        session.execute(text("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT)"))
    with pytest.raises(RuntimeError):
        with database_module.session_scope() as session:
            session.execute(text("INSERT INTO items (name) VALUES ('sample')"))
            raise RuntimeError("fail")
    with database_module.session_scope() as session:
        total = session.execute(text("SELECT COUNT(*) FROM items")).scalar()
        assert total == 0


def test_get_session_generator(monkeypatch):
    database_module = load_database(monkeypatch, "sqlite:///:memory:")
    with database_module.session_scope() as session:
        session.execute(text("CREATE TABLE counters (id INTEGER PRIMARY KEY)"))
    generator = database_module.get_session()
    session = next(generator)
    session.execute(text("INSERT INTO counters (id) VALUES (1)"))
    with pytest.raises(StopIteration):
        next(generator)

