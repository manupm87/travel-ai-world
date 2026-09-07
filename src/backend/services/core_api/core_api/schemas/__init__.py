"""Pydantic request/response models, one module per entity.

`XBase` is the writable shape, `XCreate` what POST accepts, `XUpdate` the
all-optional PATCH body (derived with `partial()`), `XResponse` what we return.
"""
