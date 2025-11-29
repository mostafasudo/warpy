from app.services.agent_schema import SchemaFactory


def test_schema_factory_handles_empty_object():
    factory = SchemaFactory()
    Model = factory.model_from_schema("Empty", {"type": "object"})
    instance = Model()
    assert instance.model_dump() == {}


def test_schema_factory_handles_array_of_objects():
    factory = SchemaFactory()
    schema = {"type": "array", "items": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]}}
    Model = factory.model_from_schema("Items", {"type": "object", "properties": {"items": schema}, "required": ["items"]})
    result = Model(items=[{"id": "1"}])
    assert result.items[0].id == "1"


def test_schema_factory_returns_dict_for_plain_object():
    factory = SchemaFactory()
    Model = factory.model_from_schema("Plain", {"type": "object"})
    assert Model().model_dump() == {}


def test_schema_factory_handles_boolean_type():
    factory = SchemaFactory()
    schema = {"type": "object", "properties": {"flag": {"type": "boolean"}}, "required": ["flag"]}
    Model = factory.model_from_schema("Flags", schema)
    instance = Model(flag=True)
    assert instance.flag is True


def test_schema_factory_object_without_properties_key():
    factory = SchemaFactory()
    schema = {"type": "object", "properties": {"payload": {"type": "object"}}}
    Model = factory.model_from_schema("Wrapper", schema)
    value = Model(payload={"k": "v"})
    assert value.payload == {"k": "v"}
