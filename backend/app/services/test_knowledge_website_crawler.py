import httpx
import pytest

from app.services import knowledge_website_crawler
from app.services.knowledge_website_crawler import BrowserRenderer, crawl_page, discover_sitemap_urls


DIV_HEAVY_PRICING_HTML = """
<html>
  <head>
    <title>Popcorn Pricing</title>
  </head>
  <body>
    <header>
      <a href="/home">Home</a>
      <a href="/pricing">Pricing</a>
    </header>
    <main>
      <section class="pricing_section">
        <h2>Simple, Transparent Pricing</h2>
        <div>Start free, scale as you grow. No hidden fees.</div>
        <div class="pricing_toggle">
          <span>Billed annually</span>
          <span>-20%</span>
          <span>Billed monthly</span>
        </div>
        <div class="pricing_list">
          <div class="pricing-list_item">
            <div class="plan_name">Plain</div>
            <div class="plan_copy">Perfect for solo founders testing conversational commerce</div>
            <div class="plan_price">
              <span>$139</span>
              <span>per month</span>
            </div>
            <div class="plan_credits">2,000 credits/month</div>
            <div class="plan_cta">Start Free Trial</div>
            <div class="plan_features">
              <span>AI Agent with Memory</span>
              <span>Unlimited Knowledge Base</span>
              <span>Inbox with Smart Handover</span>
            </div>
          </div>
          <div class="pricing-list_item">
            <div class="plan_name">Cheese</div>
            <div class="plan_copy">For teams scaling WhatsApp as a revenue channel</div>
            <div class="plan_price">
              <span>$239</span>
              <span>per month</span>
            </div>
            <div class="plan_credits">4,000 credits/month</div>
            <div class="plan_features">
              <span>Everything in Plain</span>
              <span>Broadcast Marketing Campaigns</span>
            </div>
          </div>
          <div class="pricing-list_item">
            <div class="plan_name">Caramel</div>
            <div class="plan_copy">High-volume operations with optimized economics</div>
            <div class="pricing-dropdown-link_text">Dropdown</div>
            <select class="hide">
              <option value="10" text="10,000 credits/month" price-annually="$479/mo" price-monthly="$599/mo"></option>
            </select>
            <div class="plan_cta">Talk to Sales</div>
          </div>
          <div class="pricing-list_item">
            <div class="plan_name">Enterprise</div>
            <div class="plan_copy">Multi-brand operations with enterprise requirements</div>
            <div class="plan_price">Custom Pricing</div>
            <div class="plan_credits">100k+ credits/month</div>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>
"""


def _response(url: str, body: str, *, status: int = 200, content_type: str = "text/html; charset=utf-8") -> httpx.Response:
    return httpx.Response(
        status,
        request=httpx.Request("GET", url),
        headers={"content-type": content_type},
        text=body,
    )


class FakeClient:
    def __init__(self, responses: dict[str, httpx.Response]):
        self.responses = responses
        self.requested_urls: list[str] = []

    def get(self, url: str) -> httpx.Response:
        self.requested_urls.append(url)
        return self.responses[url]


class FakeBrowser:
    def __init__(self, rendered: dict[str, tuple[str, str]] | None = None, *, error: Exception | None = None):
        self.rendered = rendered or {}
        self.error = error

    def render(self, url: str) -> tuple[str, str]:
        if self.error is not None:
            raise self.error
        return self.rendered[url]


class FakeRoute:
    def __init__(self, url: str):
        self.request = type("Request", (), {"url": url})()
        self.aborted = False
        self.continued = False

    def abort(self) -> None:
        self.aborted = True

    def continue_(self) -> None:
        self.continued = True


class FakeRenderedPage:
    def __init__(self, request_urls: list[str]):
        self._request_urls = request_urls
        self._route_handler = None
        self.url = "https://docs.example.com/rendered"

    def route(self, _pattern: str, handler) -> None:
        self._route_handler = handler

    def goto(self, _url: str, **_kwargs) -> None:
        for request_url in self._request_urls:
            if self._route_handler is not None:
                self._route_handler(FakeRoute(request_url))

    def wait_for_load_state(self, *_args, **_kwargs) -> None:
        return None

    def wait_for_timeout(self, *_args, **_kwargs) -> None:
        return None

    def content(self) -> str:
        return "<html><body><main><p>Rendered page</p></main></body></html>"

    def unroute(self, *_args, **_kwargs) -> None:
        return None

    def close(self) -> None:
        return None


class FakeBrowserContext:
    def __init__(self, page: FakeRenderedPage):
        self.page = page

    def new_page(self) -> FakeRenderedPage:
        return self.page

    def close(self) -> None:
        return None


class FakeChromium:
    def __init__(self, page: FakeRenderedPage):
        self.page = page

    def launch(self, **_kwargs):
        page = self.page

        class FakeBrowserInstance:
            def new_context(self, **_kwargs):
                return FakeBrowserContext(page)

            def close(self) -> None:
                return None

        return FakeBrowserInstance()


class FakeSyncPlaywrightFactory:
    def __init__(self, page: FakeRenderedPage):
        self.page = page

    def __call__(self):
        return self

    def start(self):
        page = self.page

        class FakePlaywrightInstance:
            chromium = FakeChromium(page)

            def stop(self) -> None:
                return None

        return FakePlaywrightInstance()


def test_crawl_page_captures_div_heavy_pricing_content():
    url = "https://docs.example.com/pricing"
    client = FakeClient({url: _response(url, DIV_HEAVY_PRICING_HTML)})
    browser = FakeBrowser()

    page = crawl_page(client, browser, url, "https://docs.example.com")

    assert page.used_browser is False
    assert "Simple, Transparent Pricing" in page.text
    assert "Plain" in page.text
    assert "$139" in page.text
    assert "2,000 credits/month" in page.text
    assert "Unlimited Knowledge Base" in page.text
    assert "Cheese" in page.text
    assert "$239" in page.text
    assert "Caramel" in page.text
    assert "10,000 credits/month" in page.text
    assert "$479/mo" in page.text
    assert "$599/mo" in page.text
    assert "Enterprise" in page.text
    assert "Custom Pricing" in page.text


def test_browser_renderer_blocks_private_requests(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "app.services.knowledge_website_service.socket.getaddrinfo",
        lambda host, port, proto=0: [(0, 0, proto, "", ("93.184.216.34", 0))],
    )
    page = FakeRenderedPage([
        "https://docs.example.com/",
        "http://169.254.169.254/latest/meta-data",
    ])
    monkeypatch.setattr(
        knowledge_website_crawler,
        "_get_sync_playwright",
        lambda: FakeSyncPlaywrightFactory(page),
    )

    renderer = BrowserRenderer()

    with pytest.raises(Exception, match="publicly accessible"):
        renderer.render("https://docs.example.com/")

    renderer.close()


def test_browser_renderer_ignores_browser_internal_requests(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        "app.services.knowledge_website_service.socket.getaddrinfo",
        lambda host, port, proto=0: [(0, 0, proto, "", ("93.184.216.34", 0))],
    )
    page = FakeRenderedPage([
        "https://docs.example.com/",
        "chrome-extension://liecbddmkiiihnedobmlmillhodjkdmb/img/installed.jpg",
    ])
    monkeypatch.setattr(
        knowledge_website_crawler,
        "_get_sync_playwright",
        lambda: FakeSyncPlaywrightFactory(page),
    )

    renderer = BrowserRenderer()

    rendered_url, rendered_html = renderer.render("https://docs.example.com/")

    assert rendered_url == "https://docs.example.com/rendered"
    assert "Rendered page" in rendered_html

    renderer.close()


def test_crawl_page_prefers_page_wide_root_over_nested_article():
    url = "https://docs.example.com/overview"
    client = FakeClient({
        url: _response(
            url,
            """
            <html>
              <head><title>Overview</title></head>
              <body>
                <header>Global navigation</header>
                <main>
                  <section>
                    <h1>Product overview</h1>
                    <div>Pricing cards and support policies live on this page.</div>
                  </section>
                  <article>
                    <h2>Getting started</h2>
                    <p>How to connect your store.</p>
                  </article>
                </main>
              </body>
            </html>
            """,
        ),
    })
    browser = FakeBrowser()

    page = crawl_page(client, browser, url, "https://docs.example.com")

    assert "Product overview" in page.text
    assert "Pricing cards and support policies live on this page." in page.text
    assert "Getting started" in page.text
    assert "How to connect your store." in page.text


def test_crawl_page_falls_back_to_browser_for_shell_pages():
    url = "https://docs.example.com/"
    client = FakeClient({
        url: _response(
            url,
            "<html><head><title>Docs</title></head><body><div id='app'></div></body></html>",
        ),
    })
    browser = FakeBrowser({
        url: (
            url,
            "<html><head><title>Getting Started</title></head><body><article><h1>Getting Started</h1><p>Hello from the rendered article.</p></article></body></html>",
        )
    })

    page = crawl_page(client, browser, url, url)

    assert page.page_name == "Getting Started"
    assert "Hello from the rendered article." in page.text
    assert page.used_browser is True


def test_crawl_page_returns_link_only_page_when_browser_fails():
    url = "https://docs.example.com/"
    client = FakeClient({
        url: _response(
            url,
            "<html><head><title>Docs</title></head><body><div id='app'></div><a href='/articles/page-1'></a></body></html>",
        ),
    })
    browser = FakeBrowser(error=RuntimeError("browser failed"))

    page = crawl_page(client, browser, url, url)

    assert page.text == ""
    assert page.links == {"https://docs.example.com/articles/page-1"}
    assert page.used_browser is False


def test_discover_sitemap_urls_reads_robots_and_sitemap_index():
    origin = "https://docs.example.com"
    client = FakeClient({
        f"{origin}/robots.txt": _response(
            f"{origin}/robots.txt",
            "User-agent: *\nSitemap: https://docs.example.com/custom-index.xml\n",
            content_type="text/plain; charset=utf-8",
        ),
        f"{origin}/sitemap.xml": _response(f"{origin}/sitemap.xml", "missing", status=404),
        f"{origin}/sitemap_index.xml": _response(f"{origin}/sitemap_index.xml", "missing", status=404),
        "https://docs.example.com/custom-index.xml": _response(
            "https://docs.example.com/custom-index.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://docs.example.com/articles.xml</loc></sitemap>
            </sitemapindex>""",
            content_type="application/xml",
        ),
        "https://docs.example.com/articles.xml": _response(
            "https://docs.example.com/articles.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://docs.example.com/help/article-1</loc></url>
              <url><loc>https://docs.example.com/blog/post-1</loc></url>
            </urlset>""",
            content_type="application/xml",
        ),
    })

    result = discover_sitemap_urls(client, "https://docs.example.com/help")

    assert result.urls == {"https://docs.example.com/help/article-1"}
    assert result.truncated is False


def test_discover_sitemap_urls_skips_cross_origin_sitemaps():
    origin = "https://docs.example.com"
    client = FakeClient({
        f"{origin}/robots.txt": _response(
            f"{origin}/robots.txt",
            "User-agent: *\nSitemap: https://cdn.example.net/docs.xml\nSitemap: https://docs.example.com/custom-index.xml\n",
            content_type="text/plain; charset=utf-8",
        ),
        f"{origin}/sitemap.xml": _response(f"{origin}/sitemap.xml", "missing", status=404),
        f"{origin}/sitemap_index.xml": _response(f"{origin}/sitemap_index.xml", "missing", status=404),
        "https://docs.example.com/custom-index.xml": _response(
            "https://docs.example.com/custom-index.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://docs.example.com/articles.xml</loc></sitemap>
              <sitemap><loc>https://cdn.example.net/other.xml</loc></sitemap>
            </sitemapindex>""",
            content_type="application/xml",
        ),
        "https://docs.example.com/articles.xml": _response(
            "https://docs.example.com/articles.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://docs.example.com/help/article-1</loc></url>
            </urlset>""",
            content_type="application/xml",
        ),
    })

    result = discover_sitemap_urls(client, "https://docs.example.com/help")

    assert result.urls == {"https://docs.example.com/help/article-1"}
    assert "https://cdn.example.net/docs.xml" not in client.requested_urls
    assert "https://cdn.example.net/other.xml" not in client.requested_urls


def test_discover_sitemap_urls_reports_when_sitemap_walk_is_truncated(monkeypatch: pytest.MonkeyPatch):
    origin = "https://docs.example.com"
    monkeypatch.setattr(knowledge_website_crawler, "SITEMAP_DOCUMENT_LIMIT", 1)

    client = FakeClient({
        f"{origin}/robots.txt": _response(f"{origin}/robots.txt", "", content_type="text/plain; charset=utf-8"),
        f"{origin}/sitemap.xml": _response(
            f"{origin}/sitemap.xml",
            """<?xml version="1.0" encoding="UTF-8"?>
            <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <sitemap><loc>https://docs.example.com/articles.xml</loc></sitemap>
            </sitemapindex>""",
            content_type="application/xml",
        ),
        f"{origin}/sitemap_index.xml": _response(f"{origin}/sitemap_index.xml", "missing", status=404),
    })

    result = discover_sitemap_urls(client, "https://docs.example.com/help")

    assert result.urls == set()
    assert result.truncated is True
