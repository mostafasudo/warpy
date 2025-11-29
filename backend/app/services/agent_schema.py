import json
from typing import Any

from pydantic import BaseModel, Field, create_model


class SchemaFactory:
    def __init__(self):
        self._cache: dict[str, type[BaseModel]] = {}

    def _type_from_schema(self, schema: dict[str, Any], model_name_prefix: str) -> type:
        schema_type = schema.get("type", "string")
        if schema_type == "object":
            if "properties" in schema:
                return self.model_from_schema(model_name_prefix, schema)
            return dict
        if schema_type == "array":
            items = schema.get("items", {})
            item_type = self._type_from_schema(items, f"{model_name_prefix}Item")
            return list[item_type]  # type: ignore[index]
        if schema_type == "integer":
            return int
        if schema_type == "number":
            return float
        if schema_type == "boolean":
            return bool
        return str

    def model_from_schema(self, name: str, schema: dict[str, Any]) -> type[BaseModel]:
        cache_key = f"{name}_{json.dumps(schema, sort_keys=True)}"
        if cache_key in self._cache:
            return self._cache[cache_key]

        properties = schema.get("properties", {})
        required = set(schema.get("required", []))

        if not properties:
            model = create_model(name)
            self._cache[cache_key] = model
            return model

        field_definitions: dict[str, Any] = {}
        for prop_name, prop_schema in properties.items():
            py_type = self._type_from_schema(prop_schema, f"{name}_{prop_name}")
            description = prop_schema.get("description", "")
            is_required = prop_name in required
            if is_required:
                field_definitions[prop_name] = (py_type, Field(description=description))
            else:
                field_definitions[prop_name] = (py_type | None, Field(default=None, description=description))

        model = create_model(name, **field_definitions)
        self._cache[cache_key] = model
        return model


def serialize_args(obj: Any) -> Any:
    if isinstance(obj, BaseModel):
        return {k: serialize_args(v) for k, v in obj.model_dump(exclude_none=True).items()}
    if isinstance(obj, list):
        return [serialize_args(item) for item in obj]
    if isinstance(obj, dict):
        return {k: serialize_args(v) for k, v in obj.items()}
    return obj
