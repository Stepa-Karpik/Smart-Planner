import pytest


@pytest.mark.integration
@pytest.mark.asyncio
async def test_register_login_refresh_logout(app_client):
    register_payload = {
        "email": "auth@example.com",
        "username": "authuser",
        "password": "StrongPass123",
    }
    register = await app_client.post("/api/v1/auth/register", json=register_payload)
    assert register.status_code == 201
    body = register.json()
    assert body["data"]["email"] == register_payload["email"]

    login = await app_client.post(
        "/api/v1/auth/login",
        json={"login": "authuser", "password": "StrongPass123"},
    )
    assert login.status_code == 200
    login_body = login.json()
    refresh_token = login_body["data"]["tokens"]["refresh_token"]

    refreshed = await app_client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200
    refreshed_body = refreshed.json()
    assert refreshed_body["data"]["tokens"]["access_token"]

    logout = await app_client.post("/api/v1/auth/logout", json={"refresh_token": refreshed_body["data"]["tokens"]["refresh_token"]})
    assert logout.status_code == 200
    assert logout.json()["data"]["ok"] is True
