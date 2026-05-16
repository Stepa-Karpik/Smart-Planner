from app.services.identity_bridge import IdentityBridge


def test_identity_bridge_builds_exchange_payload():
    bridge = IdentityBridge(base_url='https://auth.example.com')
    assert bridge.exchange_url == 'https://auth.example.com/api/v1/session-exchange'
