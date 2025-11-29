from pydantic import BaseModel

from app.services.agent_schema import SchemaFactory, serialize_args


def test_schema_factory_builds_models_with_required_and_optional_fields():
    factory = SchemaFactory()
    schema = {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Person name"},
            "age": {"type": "integer", "description": "Age"},
            "tags": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["name"]
    }
    Model = factory.model_from_schema("Person", schema)
    instance = Model(name="Ada", tags=["engineer"])
    assert instance.name == "Ada"
    assert instance.age is None
    assert instance.tags == ["engineer"]


def test_schema_factory_caches_models():
    factory = SchemaFactory()
    schema = {"type": "object", "properties": {"value": {"type": "number"}}}
    first = factory.model_from_schema("Metric", schema)
    second = factory.model_from_schema("Metric", schema)
    assert first is second


def test_serialize_args_handles_nested_pydantic_models():
    class Child(BaseModel):
        label: str

    class Parent(BaseModel):
        child: Child
        values: list[int]

    payload = Parent(child=Child(label="x"), values=[1, 2])
    serialized = serialize_args(payload)
    assert serialized == {"child": {"label": "x"}, "values": [1, 2]}
