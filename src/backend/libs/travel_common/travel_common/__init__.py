"""Shared kernel for Kyrian World services.

Only what crosses a service boundary lives here: caller identity, common
settings, domain errors, JWT handling and the FastAPI app factory. Anything
used by a single service belongs to that service.
"""
