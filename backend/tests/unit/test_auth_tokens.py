from uuid import uuid4

from app.core.security import create_refresh_token


def test_refresh_tokens_are_unique_even_if_issued_immediately():
    user_id = uuid4()
    first = create_refresh_token(user_id)
    second = create_refresh_token(user_id)
    assert first != second

