# Knowledge Base

## Overview
Upload documents to build a per-agent knowledge base. Files are parsed via the Unstructured API, chunked, embedded with OpenAI, and stored in pgvector. The agent receives a `search_knowledge_base` tool that queries the vector store with cosine distance to ground responses in customer-provided content.

## Architecture
```
Upload → Backend (temp bytes) → RQ Job → Unstructured API → Chunk → Embed → pgvector
Agent ← search_knowledge_base ← cosine distance ← pgvector
```

No S3 involved. File bytes are stored directly in RQ job args and discarded after processing.

## Supported file types
PDF, DOCX, DOC, PPTX, PPT, TXT, MD, XLSX, XLS, CSV, RTF, HTML, HTM, XML, JSON, PNG, JPG, JPEG, GIF, BMP, TIFF, TIF, RST, TSV, EML, MSG, EPUB.

Max **50 MB** per file.

## RAG configuration
Lives in `LLMConfig` (`backend/app/core/llm_config.py`).

| Parameter | Default | Description |
|-----------|---------|-------------|
| `kb_top_k_min` | 3 | Minimum chunks returned per query |
| `kb_top_k_max` | 8 | Maximum chunks returned per query |
| `kb_chunk_max_chars` | 1500 | Max characters per chunk |
| `kb_chunk_overlap_chars` | 200 | Overlap between adjacent chunks |

`calculate_kb_top_k()` uses a 2% ratio of total chunks, clamped to `[kb_top_k_min, kb_top_k_max]`.

## Agent tool
`search_knowledge_base` is an **inline tool** — same pattern as `find_tools`. It executes server-side within `agent_chain.py` with no widget round-trip. Defined in `agent_tools.py`, handled inline in the agent chain's tool dispatch.

## Processing pipeline
1. File bytes stored in RQ job args (no S3).
2. `parse_document()` — sends bytes to the Unstructured API.
3. `chunk_elements()` — splits parsed elements into chunks respecting `kb_chunk_max_chars` / `kb_chunk_overlap_chars`.
4. Create `KnowledgeChunk` rows.
5. `upsert_knowledge_embedding()` per chunk — OpenAI embedding → pgvector insert.
6. Update `KnowledgeDocument` status to completed (or failed on error).

## Database
Three tables:

| Table | Purpose |
|-------|---------|
| `knowledge_documents` | Uploaded file metadata, processing status |
| `knowledge_chunks` | Chunked text content, linked to document |
| `knowledge_embeddings` | Vector embeddings with IVFFlat cosine index |

The `Agent` model has a `knowledge_base_enabled` boolean to toggle the feature per agent.

## Frontend
Knowledge Base page sits between Features and Agent in the sidebar.

- Upload files via file picker.
- Enable/disable appears in a dedicated activation card at the top of the panel.
- Delete documents with confirmation dialog.
- Auto-poll every 3s while any document is in a processing state.

## Environment
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `UNSTRUCTURED_API_KEY` | Yes | — | API key for the Unstructured parsing service |

The service uses the Unstructured partition endpoint (`https://api.unstructuredapp.io/general/v0/general`) — synchronous POST, returns parsed elements directly. Multipart POST with `files` + `strategy` fields.

## Limitations
- File bytes in RQ job args impose the 50 MB practical limit.
- No S3 or persistent file storage — original files are not retained after processing.
- Processing is sequential per document (one RQ job per upload).
