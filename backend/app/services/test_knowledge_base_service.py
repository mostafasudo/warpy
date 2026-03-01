from uuid import UUID

import pytest
from fastapi import HTTPException

from app.models import Agent, DocumentStatus, KnowledgeChunk, KnowledgeDocument
from app.services.knowledge_base_service import (
    create_document_record,
    delete_document,
    get_document_chunks,
    get_knowledge_base_status,
    list_documents,
    toggle_knowledge_base,
    update_document_status,
)


class FakeSession:
    def __init__(self, scalar_results=None, scalars_result=None):
        self.scalar_results = scalar_results or []
        self.scalars_result = scalars_result or []
        self.added = []
        self.deleted = []
        self.flushed = False

    def scalar(self, _query):
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None

    def scalars(self, _query):
        class Result:
            def __init__(self, rows):
                self._rows = rows
            def all(self):
                return self._rows
        return Result(self.scalars_result)

    def add(self, obj):
        self.added.append(obj)

    def delete(self, obj):
        self.deleted.append(obj)

    def flush(self):
        self.flushed = True

    def get(self, model, pk):
        for result in self.scalar_results:
            if hasattr(result, 'id') and result.id == pk:
                return result
        if self.scalar_results:
            return self.scalar_results.pop(0)
        return None


def test_list_documents_returns_docs():
    doc = KnowledgeDocument(user_id="u", file_name="a.pdf", file_type=".pdf", file_size=100)
    session = FakeSession(scalars_result=[doc])
    docs, total = list_documents(session, "u")
    assert total == 1
    assert docs[0] is doc


def test_list_documents_empty():
    session = FakeSession(scalars_result=[])
    docs, total = list_documents(session, "u")
    assert total == 0
    assert docs == []


def test_create_document_record():
    session = FakeSession()
    doc = create_document_record(session, "u", "test.pdf", ".pdf", 1000)
    assert isinstance(doc, KnowledgeDocument)
    assert doc.file_name == "test.pdf"
    assert session.added
    assert session.flushed


def test_update_document_status():
    doc_id = UUID(int=1)
    doc = KnowledgeDocument(id=doc_id, user_id="u", file_name="a.pdf", file_type=".pdf", file_size=100)
    session = FakeSession(scalar_results=[doc])
    update_document_status(session, doc_id, DocumentStatus.ready, chunk_count=5)
    assert doc.status == DocumentStatus.ready
    assert doc.chunk_count == 5
    assert session.flushed


def test_update_document_status_preserves_chunk_count_when_not_provided():
    doc_id = UUID(int=1)
    doc = KnowledgeDocument(id=doc_id, user_id="u", file_name="a.pdf", file_type=".pdf", file_size=100)
    doc.chunk_count = 5
    session = FakeSession(scalar_results=[doc])
    update_document_status(session, doc_id, DocumentStatus.error, error_message="fail")
    assert doc.chunk_count == 5


def test_update_document_status_clears_error_on_ready():
    doc_id = UUID(int=1)
    doc = KnowledgeDocument(id=doc_id, user_id="u", file_name="a.pdf", file_type=".pdf", file_size=100)
    doc.error_message = "old error"
    session = FakeSession(scalar_results=[doc])
    update_document_status(session, doc_id, DocumentStatus.ready, chunk_count=3)
    assert doc.error_message is None
    assert doc.chunk_count == 3


def test_update_document_status_not_found():
    session = FakeSession(scalar_results=[])
    update_document_status(session, UUID(int=99), DocumentStatus.error, error_message="fail")
    assert not session.flushed


def test_delete_document_success():
    doc_id = UUID(int=2)
    doc = KnowledgeDocument(id=doc_id, user_id="u", file_name="b.pdf", file_type=".pdf", file_size=200)
    session = FakeSession(scalar_results=[doc])
    delete_document(session, doc_id, "u")
    assert doc in session.deleted


def test_delete_document_not_found():
    session = FakeSession(scalar_results=[None])
    with pytest.raises(HTTPException) as exc:
        delete_document(session, UUID(int=3), "u")
    assert exc.value.status_code == 404


def test_get_knowledge_base_status_no_agent():
    session = FakeSession(scalar_results=[None, 2, 1])
    result = get_knowledge_base_status(session, "u")
    assert result["enabled"] is False
    assert result["document_count"] == 2
    assert result["ready_document_count"] == 1


def test_get_knowledge_base_status_auto_disables():
    agent = Agent(user_id="u", knowledge_base_enabled=True)
    session = FakeSession(scalar_results=[agent, 1, 0])
    result = get_knowledge_base_status(session, "u")
    assert result["enabled"] is False
    assert agent.knowledge_base_enabled is False


def test_toggle_knowledge_base_enable():
    agent = Agent(user_id="u", knowledge_base_enabled=False)
    session = FakeSession(scalar_results=[agent, 1, agent, 1, 1])
    result = toggle_knowledge_base(session, "u", True)
    assert agent.knowledge_base_enabled is True


def test_toggle_knowledge_base_no_agent():
    session = FakeSession(scalar_results=[None])
    with pytest.raises(HTTPException) as exc:
        toggle_knowledge_base(session, "u", True)
    assert exc.value.status_code == 404


def test_toggle_knowledge_base_no_ready_docs():
    agent = Agent(user_id="u", knowledge_base_enabled=False)
    session = FakeSession(scalar_results=[agent, 0])
    with pytest.raises(HTTPException) as exc:
        toggle_knowledge_base(session, "u", True)
    assert exc.value.status_code == 400


def test_get_document_chunks_success():
    doc_id = UUID(int=10)
    doc = KnowledgeDocument(id=doc_id, user_id="u", file_name="a.pdf", file_type=".pdf", file_size=100)
    c1 = KnowledgeChunk(document_id=doc_id, user_id="u", content="first", chunk_index=0)
    c2 = KnowledgeChunk(document_id=doc_id, user_id="u", content="second", chunk_index=1)
    session = FakeSession(scalar_results=[doc], scalars_result=[c1, c2])
    result_doc, result_chunks = get_document_chunks(session, doc_id, "u")
    assert result_doc is doc
    assert len(result_chunks) == 2
    assert result_chunks[0].content == "first"
    assert result_chunks[1].content == "second"


def test_get_document_chunks_not_found():
    session = FakeSession(scalar_results=[None])
    with pytest.raises(HTTPException) as exc:
        get_document_chunks(session, UUID(int=99), "u")
    assert exc.value.status_code == 404
