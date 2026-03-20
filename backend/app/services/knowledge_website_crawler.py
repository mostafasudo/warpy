from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlparse

try:
    from defusedxml import ElementTree
except ModuleNotFoundError:
    from xml.etree import ElementTree

import httpx

from .embedding_service import _compute_hash
from .knowledge_website_service import (
    canonicalize_url,
    ensure_public_website_url,
    get_page_display_name,
    get_scope_parts,
    is_url_in_scope,
)


CRAWLER_TIMEOUT = httpx.Timeout(20.0, connect=5.0)
CRAWLER_HEADERS = {"User-Agent": "WarpyBot/1.0 (+https://warpy.ai)"}
BROWSER_FALLBACK_TEXT_THRESHOLD = 1200
SITEMAP_PATHS = ("/sitemap.xml", "/sitemap_index.xml")
SITEMAP_DOCUMENT_LIMIT = 16
PLAYWRIGHT_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/134.0.0.0 Safari/537.36"
)
PLAYWRIGHT_EXTRA_HEADERS = {"Accept-Language": "en-US,en;q=0.9"}
SAFE_BROWSER_REQUEST_SCHEMES = {"about", "blob", "chrome-extension", "data"}
ROOT_SELECTORS = (
    "main",
    "[role='main']",
    "#main",
    ".main",
    ".main-content",
    ".main-wrapper",
    "#content",
    ".page-content",
    ".page-wrapper",
    ".content-wrapper",
    "article",
    ".content",
    ".article",
    ".docs",
    ".doc-content",
    ".markdown",
    ".markdown-body",
    ".prose",
    ".theme-doc-markdown",
    ".vp-doc",
    ".entry-content",
    ".post-content",
)
VISIBLE_ATTRIBUTE_NAMES = {"alt", "aria-description", "aria-label", "label", "placeholder", "text", "title"}
OPTION_ATTRIBUTE_KEYWORDS = ("credit", "description", "label", "name", "plan", "price", "text", "title")
HTML_SHELL_MARKERS = (
    "__next",
    "__nuxt",
    "data-reactroot",
    "id=\"app\"",
    "id='app'",
    "vite/client",
)
SHORT_TEXT_FALLBACK_MARKERS = (
    "enable javascript",
    "loading...",
    "loading",
    "please wait",
    "something went wrong",
    "unexpected error",
    "application error",
)


class WebsiteCrawlError(RuntimeError):
    pass


@dataclass(frozen=True)
class ExtractedPage:
    page_url: str
    page_name: str
    text: str
    links: set[str]
    elements: list[dict[str, Any]]
    file_size: int
    source_hash: str
    used_browser: bool


@dataclass(frozen=True)
class SitemapDiscoveryResult:
    urls: set[str]
    truncated: bool = False


def _get_beautiful_soup():
    try:
        from bs4 import BeautifulSoup
    except ModuleNotFoundError as exc:
        raise WebsiteCrawlError("Website parsing is not available") from exc
    return BeautifulSoup


def _is_html_response(response: httpx.Response) -> bool:
    content_type = response.headers.get("content-type", "").lower()
    return "text/html" in content_type or "application/xhtml+xml" in content_type


def _remove_noise(soup: Any) -> None:
    for element in soup(["script", "style", "noscript", "template", "svg"]):
        element.decompose()


def _select_content_root(soup: Any):
    for selector in ROOT_SELECTORS:
        root = soup.select_one(selector)
        if root and root.get_text(" ", strip=True):
            return root
    return soup.body or soup


def _normalize_text(raw_text: str) -> str:
    lines = [line.strip() for line in raw_text.splitlines()]
    return "\n".join(line for line in lines if line)


def _is_relevant_attribute(tag_name: str, attr_name: str, value: str) -> bool:
    lowered_name = attr_name.lower()
    lowered_value = value.strip().lower()
    if not lowered_value or lowered_value in {"true", "false"}:
        return False
    if lowered_name in VISIBLE_ATTRIBUTE_NAMES or lowered_name.startswith("aria-"):
        return True
    if tag_name == "option" and any(keyword in lowered_name for keyword in OPTION_ATTRIBUTE_KEYWORDS):
        return True
    return False


def _extract_attribute_text(root: Any, existing_text: str) -> list[str]:
    parts: list[str] = []
    seen: set[str] = set()

    for element in root.find_all(True):
        tag_name = getattr(element, "name", "") or ""
        for attr_name, attr_value in (element.attrs or {}).items():
            if isinstance(attr_value, (list, tuple)):
                raw_value = " ".join(str(part).strip() for part in attr_value if str(part).strip())
            else:
                raw_value = str(attr_value).strip()
            if not _is_relevant_attribute(tag_name, attr_name, raw_value):
                continue
            normalized_value = _normalize_text(raw_value)
            if not normalized_value or normalized_value in seen:
                continue
            if existing_text and normalized_value in existing_text:
                continue
            parts.append(normalized_value)
            seen.add(normalized_value)

    return parts


def _extract_text(root: Any) -> str:
    text = _normalize_text(root.get_text("\n", strip=True))
    attribute_text = _extract_attribute_text(root, text)
    if not attribute_text:
        return text
    return _normalize_text("\n".join([text, *attribute_text]))


def _extract_section_headings(root: Any) -> list[str]:
    headings: list[str] = []
    for heading in root.find_all(["h1", "h2", "h3", "h4", "h5", "h6"]):
        text = _normalize_text(heading.get_text(" ", strip=True))
        if not text:
            continue
        if headings and headings[-1] == text:
            continue
        headings.append(text)
    return headings


def _extract_links(soup: Any, base_url: str, scope_url: str) -> set[str]:
    links: set[str] = set()
    for anchor in soup.find_all("a", href=True):
        href = (anchor.get("href") or "").strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:")):
            continue
        resolved = urljoin(base_url, href)
        parsed = urlparse(resolved)
        if parsed.scheme not in {"http", "https"}:
            continue
        candidate = canonicalize_url(resolved)
        if is_url_in_scope(candidate, scope_url):
            links.add(candidate)
    return links


def _resolve_canonical_url(soup: Any, base_url: str, scope_url: str) -> str:
    canonical_tag = soup.find("link", rel=lambda value: value and "canonical" in str(value).lower(), href=True)
    if not canonical_tag:
        return canonicalize_url(base_url)
    resolved = canonicalize_url(urljoin(base_url, canonical_tag["href"]))
    if is_url_in_scope(resolved, scope_url):
        return resolved
    return canonicalize_url(base_url)


def _build_elements(page_name: str, root: Any, text: str) -> list[dict[str, Any]]:
    elements: list[dict[str, Any]] = []
    if not text:
        return elements

    headings = _extract_section_headings(root)
    heading_positions: list[tuple[int, str]] = []
    cursor = 0
    for heading in headings:
        position = text.find(heading, cursor)
        if position < 0:
            continue
        heading_positions.append((position, heading))
        cursor = position + len(heading)

    first_heading = heading_positions[0][1] if heading_positions else ""
    if page_name and page_name != first_heading:
        elements.append({"type": "Title", "text": page_name, "metadata": {}})

    if not heading_positions:
        elements.append({"type": "NarrativeText", "text": text, "metadata": {}})
        return elements

    leading_text = text[:heading_positions[0][0]].strip()
    if leading_text:
        elements.append({"type": "NarrativeText", "text": leading_text, "metadata": {}})

    for index, (start, heading) in enumerate(heading_positions):
        end = heading_positions[index + 1][0] if index + 1 < len(heading_positions) else len(text)
        section_text = text[start:end].strip()
        body_text = section_text[len(heading):].strip() if section_text.startswith(heading) else section_text
        elements.append({"type": "Title", "text": heading, "metadata": {}})
        if body_text:
            elements.append({"type": "NarrativeText", "text": body_text, "metadata": {}})

    return elements


def _looks_like_non_content_text(text: str) -> bool:
    lowered_text = text.lower().strip()
    if not lowered_text:
        return True
    return len(lowered_text) <= 200 and any(
        marker in lowered_text for marker in SHORT_TEXT_FALLBACK_MARKERS
    )


def _should_use_browser_fallback(html: str, text: str) -> bool:
    lowered_html = html.lower()
    lowered_text = text.lower().strip()
    if len(text) < BROWSER_FALLBACK_TEXT_THRESHOLD and any(
        marker in lowered_html for marker in HTML_SHELL_MARKERS
    ):
        return True
    if len(lowered_text) <= 300 and any(
        marker in lowered_text for marker in SHORT_TEXT_FALLBACK_MARKERS
    ):
        return True
    return False


def _parse_html(
    html: str,
    base_url: str,
    scope_url: str,
    *,
    used_browser: bool,
    allow_empty_text: bool = False,
) -> ExtractedPage:
    BeautifulSoup = _get_beautiful_soup()
    soup = BeautifulSoup(html, "html.parser")
    _remove_noise(soup)

    page_url = _resolve_canonical_url(soup, base_url, scope_url)
    root = _select_content_root(soup)
    text = _extract_text(root)
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    page_name = get_page_display_name(page_url, title)
    links = _extract_links(soup, page_url, scope_url)
    if _looks_like_non_content_text(text):
        text = ""
    if not text and not allow_empty_text:
        raise WebsiteCrawlError("We couldn't read any text from this page")
    elements = _build_elements(page_name, root, text)
    return ExtractedPage(
        page_url=page_url,
        page_name=page_name,
        text=text,
        links=links,
        elements=elements,
        file_size=len(html.encode("utf-8")),
        source_hash=_compute_hash(f"{page_name}\n{text}"),
        used_browser=used_browser,
    )


def _sitemap_document_type(root: ElementTree.Element) -> str:
    return root.tag.rsplit("}", 1)[-1].lower()


def _sitemap_locations(xml_text: str) -> tuple[str, list[str]]:
    root = ElementTree.fromstring(xml_text)
    document_type = _sitemap_document_type(root)
    locations = [
        (element.text or "").strip()
        for element in root.iter()
        if element.tag.rsplit("}", 1)[-1].lower() == "loc" and (element.text or "").strip()
    ]
    return document_type, locations


def _robots_sitemaps(origin: str, robots_text: str) -> set[str]:
    sitemap_urls: set[str] = set()
    for line in robots_text.splitlines():
        prefix, _, value = line.partition(":")
        if prefix.strip().lower() != "sitemap":
            continue
        candidate = value.strip()
        if not candidate:
            continue
        try:
            sitemap_urls.add(canonicalize_url(urljoin(f"{origin}/", candidate)))
        except Exception:
            continue
    return sitemap_urls


def _is_sitemap_in_origin(candidate_url: str, origin: str) -> bool:
    candidate_origin, _ = get_scope_parts(candidate_url)
    return candidate_origin == origin


def discover_sitemap_urls(client: httpx.Client, scope_url: str) -> SitemapDiscoveryResult:
    origin, _ = get_scope_parts(scope_url)
    discovered_urls: set[str] = set()
    pending_sitemaps = deque(canonicalize_url(f"{origin}{path}") for path in SITEMAP_PATHS)
    seen_sitemaps = set(pending_sitemaps)

    try:
        robots_response = client.get(f"{origin}/robots.txt")
        if robots_response.is_success:
            for sitemap_url in _robots_sitemaps(origin, robots_response.text):
                if not _is_sitemap_in_origin(sitemap_url, origin):
                    continue
                if sitemap_url in seen_sitemaps:
                    continue
                pending_sitemaps.append(sitemap_url)
                seen_sitemaps.add(sitemap_url)
    except httpx.RequestError:
        pass

    fetched_documents = 0
    while pending_sitemaps and fetched_documents < SITEMAP_DOCUMENT_LIMIT:
        sitemap_url = pending_sitemaps.popleft()
        fetched_documents += 1
        try:
            response = client.get(sitemap_url)
            response.raise_for_status()
            document_type, locations = _sitemap_locations(response.text)
        except (httpx.RequestError, httpx.HTTPStatusError, ElementTree.ParseError):
            continue

        if document_type == "sitemapindex":
            for location in locations:
                try:
                    candidate = canonicalize_url(location)
                except Exception:
                    continue
                if not _is_sitemap_in_origin(candidate, origin):
                    continue
                if candidate in seen_sitemaps:
                    continue
                pending_sitemaps.append(candidate)
                seen_sitemaps.add(candidate)
            continue

        if document_type != "urlset":
            continue

        for location in locations:
            try:
                candidate = canonicalize_url(location)
            except Exception:
                continue
            if is_url_in_scope(candidate, scope_url):
                discovered_urls.add(candidate)

    return SitemapDiscoveryResult(
        urls=discovered_urls,
        truncated=bool(pending_sitemaps),
    )


def _get_sync_playwright():
    try:
        from playwright.sync_api import sync_playwright
    except ModuleNotFoundError as exc:
        raise WebsiteCrawlError("Browser rendering is not available") from exc
    return sync_playwright


class BrowserRenderer:
    def __init__(self) -> None:
        self._playwright = None
        self._browser = None
        self._context = None

    def render(self, url: str) -> tuple[str, str]:
        if self._playwright is None or self._browser is None:
            self._playwright = _get_sync_playwright()().start()
            self._browser = self._playwright.chromium.launch(
                headless=True,
                args=["--disable-dev-shm-usage", "--no-sandbox"],
            )
            self._context = self._browser.new_context(
                viewport={"width": 1440, "height": 1200},
                locale="en-US",
                timezone_id="UTC",
                user_agent=PLAYWRIGHT_USER_AGENT,
                extra_http_headers=PLAYWRIGHT_EXTRA_HEADERS,
            )

        page = self._context.new_page()
        blocked_request_error: Exception | None = None

        def guard_route(route) -> None:
            nonlocal blocked_request_error
            request_url = route.request.url
            request_scheme = (urlparse(request_url).scheme or "").lower()
            if request_scheme not in {"http", "https"}:
                if request_scheme in SAFE_BROWSER_REQUEST_SCHEMES:
                    route.continue_()
                    return
                route.abort()
                return
            try:
                ensure_public_website_url(
                    request_url,
                    error_message="This page is not publicly accessible",
                )
            except Exception as exc:
                if blocked_request_error is None:
                    blocked_request_error = exc
                route.abort()
                return
            route.continue_()

        try:
            page.route("**/*", guard_route)
            page.goto(url, wait_until="load", timeout=30000)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            page.wait_for_timeout(2000)
            if blocked_request_error is not None:
                raise blocked_request_error
            html = page.content()
            return page.url, html
        except Exception:
            if blocked_request_error is not None:
                raise blocked_request_error
            raise
        finally:
            try:
                page.unroute("**/*", guard_route)
            except Exception:
                pass
            page.close()

    def close(self) -> None:
        if self._context is not None:
            self._context.close()
            self._context = None
        if self._browser is not None:
            self._browser.close()
            self._browser = None
        if self._playwright is not None:
            self._playwright.stop()
            self._playwright = None


def crawl_page(client: httpx.Client, browser: BrowserRenderer, page_url: str, scope_url: str) -> ExtractedPage:
    response = client.get(page_url)
    if response.status_code == 401:
        raise WebsiteCrawlError("This page is not publicly accessible")
    if response.status_code == 403:
        raise WebsiteCrawlError("This page is not publicly accessible")
    if response.status_code == 404:
        raise WebsiteCrawlError("This page could not be found")
    response.raise_for_status()

    if not _is_html_response(response):
        raise WebsiteCrawlError("This page could not be read as a website page")

    parsed = _parse_html(
        response.text,
        str(response.url),
        scope_url,
        used_browser=False,
        allow_empty_text=True,
    )
    if not is_url_in_scope(parsed.page_url, scope_url):
        raise WebsiteCrawlError("This page redirects outside the website")
    if parsed.text and not _should_use_browser_fallback(response.text, parsed.text):
        return parsed

    try:
        rendered_url, rendered_html = browser.render(str(response.url))
    except Exception:
        if parsed.text or parsed.links:
            return parsed
        raise

    rendered = _parse_html(
        rendered_html,
        rendered_url,
        scope_url,
        used_browser=True,
        allow_empty_text=True,
    )
    if not is_url_in_scope(rendered.page_url, scope_url):
        raise WebsiteCrawlError("This page redirects outside the website")
    if rendered.text and len(rendered.text) >= len(parsed.text):
        return rendered
    if parsed.text:
        return parsed
    if rendered.links or parsed.links:
        return rendered if len(rendered.links) >= len(parsed.links) else parsed
    return rendered


def build_http_client() -> httpx.Client:
    def validate_request(request: httpx.Request) -> None:
        ensure_public_website_url(
            str(request.url),
            error_message="This page is not publicly accessible",
        )

    return httpx.Client(
        follow_redirects=True,
        timeout=CRAWLER_TIMEOUT,
        headers=CRAWLER_HEADERS,
        event_hooks={"request": [validate_request]},
    )
