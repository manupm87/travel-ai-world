"""The app opens its engine on startup and disposes it on shutdown."""

from httpx import ASGITransport, AsyncClient

from core_api.main import app


async def test_lifespan_provides_a_session_factory_and_disposes_the_engine():
    async with app.router.lifespan_context(app):
        assert app.state.session_factory is not None
        engine = app.state.engine
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://t"
        ) as client:
            assert (await client.get("/api/v1/health/")).status_code == 200
    assert engine.pool.status().startswith("Pool size"), "pool still describable"
