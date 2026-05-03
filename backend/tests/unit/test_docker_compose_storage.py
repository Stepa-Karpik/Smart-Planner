from pathlib import Path


def test_api_persists_support_upload_storage_in_docker_compose():
    compose = Path(__file__).resolve().parents[3] / "docker-compose.yml"
    content = compose.read_text(encoding="utf-8")

    assert "support_storage:/app/storage/support" in content
    assert "support_storage:" in content
