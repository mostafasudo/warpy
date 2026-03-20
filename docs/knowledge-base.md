# Knowledge Base

## Overview
The knowledge base now supports two top-level source types:

- uploaded documents
- public websites or scoped website paths

Both source types feed the same retrieval rail:

`knowledge_documents` -> `knowledge_chunks` -> `knowledge_embeddings` -> `search_knowledge_base`

Website pages are stored as hidden `knowledge_documents` rows with `source_kind=website_page`, so chunking, embeddings, and search stay on the existing path.

## Architecture
```text
Upload file ------------------------------+
                                          v
Add website -> normalize scope -> crawl pages -> section-aware chunk -> embed -> pgvector
                                          ^
Weekly refresh / manual refresh ----------+

Agent -> search_knowledge_base
      -> multi-query expansion
      -> dense + lexical + field matches
      -> reciprocal-rank fusion
      -> deterministic rerank
      -> model rerank
      -> source-aware evidence
```

Files are parsed through Unstructured. Website pages are fetched with `httpx` first and fall back to Playwright when the raw HTML is not good enough, such as app-shell responses, JS-heavy pages, or weak extracted text. Website extraction is completeness-first: Warpy stores the full cleaned text from the page-wide content root in DOM order instead of trying to keep only selected semantic tags, and it also captures human-readable control metadata such as option labels or pricing values that live in attributes instead of text nodes. Crawl discovery also seeds from sitemap files, so websites with broken or shell-only root pages can still ingest their article URLs.

## Source Model

### `knowledge_documents`
Used for:

- uploaded files (`source_kind=file`)
- crawled website pages (`source_kind=website_page`)

Extra website-page fields:

- `website_id`
- `source_url`
- `source_hash`
- `content_language`
- `is_searchable`

### `knowledge_chunks`
Retrieval-critical fields now live directly on the chunk row:

- `section_title`
- `search_text`
- `metadata` for safe display-only details such as page numbers and element types

### `knowledge_websites`
Top-level website source record with:

- `processing | ready | partial | error`
- `input_url`
- `scope_url`
- `error_message`
- `last_crawled_at`
- `last_successful_crawled_at`
- `next_refresh_at`

The UI shows websites as top-level sources. Per-page rows live in the website detail modal.

## Website Crawl Rules

- Accept bare domains such as `example.com`; normalize to HTTPS first, then fall back to HTTP if needed.
- Follow redirects and use the final redirected URL as the crawl scope.
- Reject private, loopback, link-local, metadata, and other non-public targets before fetching.
- Same-origin means the final resolved scheme, host, and port.
- If the user enters a path such as `knowledge.example.com/docs`, crawl only that path and descendants.
- Reject overlapping scopes for the same user to avoid duplicate indexing.
- Crawl breadth-first and dedupe by canonical URL.
- Equivalent path encodings such as `%26` and `&` are normalized onto one page record so refreshes do not leave duplicate alias rows behind.
- Use `sitemap.xml`, `sitemap_index.xml`, and `robots.txt` sitemap directives as discovery seeds before relying only on in-page links.
- If sitemap discovery hits its document cap, the website stays `partial` instead of incorrectly reporting `ready`.
- Navigation-only pages that only help discovery, such as shell homepages or empty hub pages, are skipped instead of being surfaced as failed pages.
- When a page has both a page-wide root and a narrower nested article, extraction prefers the page-wide root so pricing cards, grids, and other non-paragraph content are not dropped.
- Drop fragments and strip tracking query params.
- Keep functional query params.
- Hard cap website crawls at `2000` pages.

## Processing and Consistency

- One coordinated RQ job owns a website crawl.
- Each page is persisted through the existing chunk/embed path.
- Website pages are always re-chunked on successful crawls, even when the page text hash is unchanged, so improved chunk structure or search metadata cannot get stuck behind stale content.
- Page refreshes are atomic at the DB transaction level, so search sees either the previous good version or the new one.
- If a page refresh fails, the last good searchable content stays available.
- Missing pages are deleted only after a fully successful crawl.
- Deleting a website deletes the top-level source and cascades page/chunk/embedding cleanup.
- If a website is deleted during processing, the running job exits as soon as it notices the missing source row.

## Refresh Model

- Manual refresh uses the same crawl job as the initial ingest.
- A repeating sweep job runs hourly in the existing worker scheduler and enqueues websites whose `next_refresh_at` is due.
- The sweep also retries websites stuck in `processing` past the stale timeout so crashed jobs can recover automatically.
- Startup also enqueues a one-time retrieval backfill job when legacy documents or website pages are missing the new search metadata.
- Successful crawls schedule the next refresh for 7 days later.

No extra AWS services or extra worker types were added. The existing worker now runs with `rq worker default --with-scheduler`.

## Frontend

- Knowledge Base has both `Upload documents` and `Add website`.
- `Add website` opens a modal with plain helper text:
  - the website must be publicly accessible
  - everything under the provided website or path will be read
- Website rows show overall status, delete, and view actions. Manual refresh stays disabled while a website is already processing.
- The website detail modal is large, vertically scrollable, and never relies on horizontal scrolling.
- Page statuses poll every 3 seconds while a website is still processing.
- The weekly refresh behavior is surfaced in the website row and detail modal.

## Search Behavior
`search_knowledge_base` now filters on `knowledge_documents.is_searchable = true`, so failed refreshes do not remove previously-good website pages from retrieval until a successful replacement or explicit deletion.

Retrieval is now hybrid and source-aware:

- up to 4 query variants are generated from the user question
- each variant searches dense embeddings and lexical search text
- exact matches on document title, section title, and source URL are added separately
- candidates are merged with reciprocal-rank fusion
- deterministic reranking boosts matching section titles, same-language results, and direct answer sections like pricing or policies
- legal/privacy/terms pages are downweighted for non-legal questions
- duplicate website pages are suppressed by `source_hash`
- the final result sent to the agent is structured evidence with `snippet`, `title`, `sectionTitle`, `sourceUrl`, and `sourceKind`

## Worker and Runtime

- Backend dependency additions:
  - `beautifulsoup4`
  - `playwright`
- Backend image installs Chromium with Playwright.
- ECS worker task definition increased from `256/512` to `256/1024`.

## Supported Document File Types
PDF, DOCX, DOC, PPTX, PPT, TXT, MD, XLSX, XLS, CSV, RTF, HTML, HTM, XML, JSON, PNG, JPG, JPEG, GIF, BMP, TIFF, TIF, RST, TSV, EML, MSG, EPUB.

Max document upload size remains **50 MB** per file.
