import pytest

from app.services.agent_schema import SchemaFactory


def test_schema_factory_preserves_string_enum():
    factory = SchemaFactory()
    schema = {
        "type": "object",
        "properties": {
            "status": {"type": "string", "enum": ["open", "closed"], "description": "status"}
        },
        "required": ["status"]
    }

    model = factory.model_from_schema("StatusInput", schema)
    props = model.model_json_schema()["properties"]["status"]

    assert props.get("enum") == ["open", "closed"]


def test_schema_factory_preserves_number_enum_optional():
    factory = SchemaFactory()
    schema = {
        "type": "object",
        "properties": {"price": {"type": "number", "enum": [100, 200, 200]}},
        "required": []
    }

    model = factory.model_from_schema("PriceInput", schema)
    props = model.model_json_schema()["properties"]["price"]
    variants = props.get("anyOf", [])
    enum_variant = next((variant for variant in variants if "enum" in variant), {})

    assert enum_variant.get("enum") == [100.0, 200.0]
    assert any(variant.get("type") == "null" for variant in variants)


def test_literal_from_enum_empty_raises():
    factory = SchemaFactory()
    with pytest.raises(ValueError):
        factory._literal_from_enum([])


def test_schema_factory_skips_invalid_enum_values():
    factory = SchemaFactory()
    schema = {
        "type": "object",
        "properties": {"count": {"type": "integer", "enum": ["abc", 1, "2"]}},
        "required": ["count"]
    }

    model = factory.model_from_schema("CountInput", schema)
    props = model.model_json_schema()["properties"]["count"]

    assert props.get("enum") == [1, 2]
