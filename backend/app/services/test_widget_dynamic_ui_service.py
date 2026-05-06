from app.services.widget_dynamic_ui_service import build_widget_render_payload, format_widget_markdown_response


def test_format_widget_markdown_response_expands_inline_numbered_records():
    response = (
        "Here are the full details for the products: "
        "1. Essence Mascara Lash Princess - ID: 1 - Category: beauty - Price: $9.99 - Reviews: - 3/5 Would not recommend! - Eleanor Collins - 4/5 Very satisfied! - Lucas Gordon "
        "2. Eyeshadow Palette with Mirror - ID: 2 - Category: beauty - Price: $19.99 - Reviews: - 5/5 Great product! - Savannah Gomez - 1/5 Poor quality! - Nicholas Bailey "
        "If you want, I can also format these as JSON."
    )

    formatted = format_widget_markdown_response(response)

    assert formatted.startswith("Here are the full details")
    assert "1. **Essence Mascara Lash Princess**" in formatted
    assert "   - ID: 1" in formatted
    assert "   - Price: $9.99" in formatted
    assert "     - 3/5 Would not recommend! - Eleanor Collins" in formatted
    assert "2. **Eyeshadow Palette with Mirror**" in formatted
    assert formatted.endswith("If you want, I can also format these as JSON.")


def test_format_widget_markdown_response_leaves_simple_text_unchanged():
    assert format_widget_markdown_response("Got 10 products.") == "Got 10 products."


def test_format_widget_markdown_response_expands_flat_keyed_records_generically():
    response = (
        "Here are the records. If you want, I can also format them as a table. "
        "Ticket 1 - id: T-1 - subject: Login broken - priority: high - tags: - auth - urgent - screenshotUrl: https://example.com/login.webp "
        "Ticket 2 - id: T-2 - subject: Billing question - priority: low"
    )

    formatted = format_widget_markdown_response(response, user_message="show everything")

    assert "If you want" not in formatted
    assert formatted.startswith("Here are the records.")
    assert "1. **Login broken**" in formatted
    assert "   - ID: T-1" in formatted
    assert "   - Priority: high" in formatted
    assert "   - Tags:" in formatted
    assert "     - auth" in formatted
    assert "     - urgent" in formatted
    assert "   - Screenshot URL: ![Screenshot URL](https://example.com/login.webp)" in formatted
    assert "2. **Billing question**" in formatted


def test_format_widget_markdown_response_ignores_nested_different_record_labels():
    response = (
        "Order 1 - id: O-1 - title: Renewal order - notes: Review 1 - rating: 5 - comment: Approved "
        "Order 2 - id: O-2 - title: Expansion order - notes: none"
    )

    formatted = format_widget_markdown_response(response, user_message="show full details")

    assert "1. **Renewal order**" in formatted
    assert "2. **Expansion order**" in formatted
    assert "1. **Review 1**" not in formatted


def test_format_widget_markdown_response_converts_embedded_json_collection_to_records():
    response = (
        'Here are 2 products with full details. If you want, I can also format them as a table or JSON. json '
        '{"products":[{"id":1,"title":"Essence Mascara Lash Princess","description":"Mascara description.",'
        '"category":"beauty","price":9.99,"discountPercentage":10.48,"rating":2.56,"stock":99,'
        '"availabilityStatus":"In Stock","tags":["beauty","mascara"],"brand":"Essence",'
        '"sku":"BEA-ESS-ESS-001","dimensions":{"width":15.14,"height":13.08,"depth":22.99},'
        '"warrantyInformation":"1 week warranty","shippingInformation":"Ships in 3-5 business days",'
        '"returnPolicy":"No return policy","minimumOrderQuantity":48,'
        '"meta":{"barcode":"5784719087687","qrCode":"https://cdn.dummyjson.com/public/qr-code.png"},'
        '"images":["https://cdn.dummyjson.com/product-images/beauty/essence/1.webp"],'
        '"thumbnail":"https://cdn.dummyjson.com/product-images/beauty/essence/thumbnail.webp",'
        '"reviews":[{"rating":3,"comment":"Would not recommend!","reviewerName":"Eleanor Collins"}]},'
        '{"id":2,"title":"Eyeshadow Palette with Mirror","category":"beauty","price":19.99,"stock":34}]}'
    )

    formatted = format_widget_markdown_response(response, user_message="get me 10 products show full details")

    assert "If you want" not in formatted
    assert '"products"' not in formatted
    assert "1. **Essence Mascara Lash Princess**" in formatted
    assert "   - Price: 9.99" in formatted
    assert "   - Stock: 99" in formatted
    assert "   - Availability Status: In Stock" in formatted
    assert "   - Dimensions: Width: 15.14, Height: 13.08, Depth: 22.99" in formatted
    assert "     - Rating: 3, Comment: Would not recommend!, Reviewer Name: Eleanor Collins" in formatted
    assert "2. **Eyeshadow Palette with Mirror**" in formatted


def test_format_widget_markdown_response_converts_any_record_collection_key():
    response = (
        'Here are the open tickets. json '
        '{"tickets":[{"id":"T-1","subject":"Login broken","priority":"high","assignee":{"name":"Alex","team":"Support"}},'
        '{"id":"T-2","subject":"Billing question","priority":"low"}],"total":2}'
    )

    formatted = format_widget_markdown_response(response, user_message="show open tickets")

    assert "1. **Login broken**" in formatted
    assert "   - ID: T-1" in formatted
    assert "   - Priority: high" in formatted
    assert "   - Assignee: Name: Alex, Team: Support" in formatted
    assert "2. **Billing question**" in formatted


def test_format_widget_markdown_response_unwraps_plain_record_fence_and_renders_images():
    response = """Here are 10 records with full details. If you want, I can also format them as a table.
```

Essence Mascara Lash Princess

ID: 1
Brand: Essence
Category: beauty
Thumbnail: https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp
Images:
https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp
QR code: https://cdn.dummyjson.com/public/qr-code.png
Reviews:
3/5 Would not recommend! - Eleanor Collins
4/5 Very satisfied! - Lucas Gordon

Eyeshadow Palette with Mirror
ID: 2
Brand: Glamour Beauty
Thumbnail: https://cdn.dummyjson.com/product-images/beauty/eyeshadow-palette-with-mirror/thumbnail.webp
```
"""

    formatted = format_widget_markdown_response(response, user_message="show full details")

    assert "```" not in formatted
    assert "If you want" not in formatted
    assert "1. **Essence Mascara Lash Princess**" in formatted
    assert "   - Thumbnail: ![Thumbnail](https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp)" in formatted
    assert "     - ![Images](https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp)" in formatted
    assert "   - QR code: ![QR Code](https://cdn.dummyjson.com/public/qr-code.png)" in formatted
    assert "     - 3/5 Would not recommend! - Eleanor Collins" in formatted
    assert "2. **Eyeshadow Palette with Mirror**" in formatted


def test_format_widget_markdown_response_renders_image_urls_in_yaml_like_output():
    response = """minimumOrderQuantity: 48
meta:
createdAt: 2025-04-30T09:41:02.053Z
updatedAt: 2025-04-30T09:41:02.053Z
barcode: 5784719087687
qrCode: https://cdn.dummyjson.com/public/qr-code.png
images:
https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp
thumbnail: https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp
docsUrl: https://example.com/docs

```json
{"thumbnail":"https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp"}
```
"""

    formatted = format_widget_markdown_response(response, user_message="show everything")

    assert "qrCode: ![QR Code](https://cdn.dummyjson.com/public/qr-code.png)" in formatted
    assert "images:\n![Images](https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/1.webp)" in formatted
    assert "thumbnail: ![Thumbnail](https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp)" in formatted
    assert "docsUrl: https://example.com/docs" in formatted
    assert '{"thumbnail":"https://cdn.dummyjson.com/product-images/beauty/essence-mascara-lash-princess/thumbnail.webp"}' in formatted


def test_format_widget_markdown_response_fences_json_when_user_requested_json():
    response = 'json {"products":[{"id":1,"title":"Essence Mascara Lash Princess"}],"total":1}'

    formatted = format_widget_markdown_response(response, user_message="format the products as JSON")

    assert formatted.startswith("```json")
    assert '\n  "products": [' in formatted
    assert '"title": "Essence Mascara Lash Princess"' in formatted
    assert formatted.endswith("```")


def test_build_warpy_render_payload_for_bullets():
    payload = build_widget_render_payload(
        "Here are the issues:\n- Two invoices are overdue\n- One refund needs approval",
        "warpy_components",
    )

    assert payload is not None
    assert payload["kind"] == "warpy_components"
    assert payload["markdownFallback"].startswith("Here are the issues")
    assert payload["tree"][0]["component"] == "summary_card"
    assert payload["tree"][1]["component"] == "status_list"


def test_build_warpy_render_payload_falls_back_for_plain_status_text():
    markdown = "Fetched 10 products with full details. I can format them as a table, JSON, or downloadable list next."

    assert build_widget_render_payload(markdown, "warpy_components") is None


def test_build_warpy_render_payload_falls_back_for_oversized_table():
    markdown = "| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 |"

    assert build_widget_render_payload(markdown, "warpy_components") is None


def test_build_warpy_render_payload_falls_back_for_table_with_surrounding_text():
    markdown = "Review this before approving.\n\n| Name | Amount |\n| --- | --- |\n| Acme | $8.2k |\n\nAcme should go first."

    assert build_widget_render_payload(markdown, "warpy_components") is None


def test_build_warpy_render_payload_falls_back_without_truncating_long_content():
    markdown = " ".join(["This detailed update must stay complete."] * 20)

    assert build_widget_render_payload(markdown, "warpy_components") is None


def test_build_native_payload_uses_suitable_string_props():
    payload = build_widget_render_payload(
        "Invoice 42 needs review.",
        "native_components",
        native_components=[
            {
                "key": "invoice_summary",
                "version": "1",
                "propsSchema": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["title", "content"],
                },
                "description": "Invoice review summary card",
                "suitability": "Use only for invoice review and invoice approval summaries.",
            }
        ],
    )

    assert payload is not None
    assert payload["kind"] == "native_components"
    assert payload["componentKey"] == "invoice_summary"
    assert payload["props"]["content"] == "Invoice 42 needs review."


def test_build_native_payload_uses_semantic_fit_not_first_schema_match():
    payload = build_widget_render_payload(
        "Invoice 42 needs review.",
        "native_components",
        native_components=[
            {
                "key": "account_summary",
                "version": "1",
                "description": "Account health card",
                "suitability": "Use for account health, customer status, and account renewal summaries.",
                "propsSchema": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["title", "content"],
                },
            },
            {
                "key": "invoice_summary",
                "version": "1",
                "description": "Invoice review summary card",
                "suitability": "Use only for invoice review and invoice approval summaries.",
                "propsSchema": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "content": {"type": "string"},
                    },
                    "required": ["title", "content"],
                },
            },
        ],
    )

    assert payload is not None
    assert payload["componentKey"] == "invoice_summary"


def test_build_native_payload_falls_back_for_ambiguous_component_fit():
    components = [
        {
            "key": "invoice_summary",
            "version": "1",
            "description": "Invoice card",
            "suitability": "Use for invoice summaries.",
            "propsSchema": {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]},
        },
        {
            "key": "invoice_notice",
            "version": "1",
            "description": "Invoice notice",
            "suitability": "Use for invoice updates.",
            "propsSchema": {"type": "object", "properties": {"content": {"type": "string"}}, "required": ["content"]},
        },
    ]

    assert build_widget_render_payload("Invoice 42 needs review.", "native_components", native_components=components) is None


def test_build_native_payload_falls_back_without_fillable_required_props():
    payload = build_widget_render_payload(
        "Invoice 42 needs review.",
        "native_components",
        native_components=[
            {
                "key": "chart",
                "version": "1",
                "propsSchema": {
                    "type": "object",
                    "properties": {"data": {"type": "array"}},
                    "required": ["data"],
                },
                "description": "Invoice chart",
                "suitability": "Use only for invoice charts.",
            }
        ],
    )

    assert payload is None


def test_build_native_payload_respects_schema_length_constraints():
    payload = build_widget_render_payload(
        "Invoice 42 needs review.",
        "native_components",
        native_components=[
            {
                "key": "invoice_summary",
                "version": "1",
                "propsSchema": {
                    "type": "object",
                    "properties": {"content": {"type": "string", "maxLength": 10}},
                    "required": ["content"],
                },
                "description": "Invoice review summary card",
                "suitability": "Use only for invoice review and invoice approval summaries.",
            }
        ],
    )

    assert payload is None


def test_build_native_payload_applies_default_content_cap():
    payload = build_widget_render_payload(
        "Invoice " + ("details " * 220),
        "native_components",
        native_components=[
            {
                "key": "invoice_summary",
                "version": "1",
                "description": "Invoice review summary card",
                "suitability": "Use only for invoice review and invoice approval summaries.",
                "propsSchema": {
                    "type": "object",
                    "properties": {"content": {"type": "string"}},
                    "required": ["content"],
                },
            }
        ],
    )

    assert payload is None
