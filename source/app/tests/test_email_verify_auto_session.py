"""Email verification must create one verified, rotated session, not just mark the email.

Runs through real FastAPI routes and local SQLAlchemy transactions; no external SMTP,
banking, production data, or fake authentication endpoint.
"""
import time

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from rio_pey_codi.identity import SESSION_ABSOLUTE_S, SESSION_IDLE_S, sha
from rio_pey_codi.models import OneTimeToken, SessionRow, User
from rio_pey_codi.platform import Settings, create_platform


def setup(tmp_path):
    app = create_platform(Settings(database_url='sqlite+pysqlite:///' + str(tmp_path / 'auth.sqlite3')))
    return app, TestClient(app)


def register(app, client, email, *, expect_unauthenticated=True):
    payload = {'email': email, 'password': 'Local-test-password-123', 'business_name': 'Comercio de prueba'}
    response = client.post('/v1/auth/signup', json=payload)
    assert response.status_code == 201, response.text
    if expect_unauthenticated:
        assert client.get('/v1/auth/me').status_code == 401
    return app.state.mailer.outbox[-1]['token']


def test_link_automatically_establishes_verified_session_without_password(tmp_path):
    app, client = setup(tmp_path)
    token = register(app, client, 'verified@example.org')
    result = client.post('/v1/auth/verify-email', json={'token': token})
    assert result.status_code == 200, result.text
    body = result.json()
    assert body['status'] == 'EMAIL_VERIFIED'
    assert body['session_established'] is True
    assert len(body['user_id']) == 32
    assert client.cookies.get('rio_sid')
    cookie = result.headers['set-cookie'].lower()
    assert 'httponly' in cookie and 'samesite=lax' in cookie
    assert client.get('/v1/auth/me').json()['id'] == body['user_id']
    assert client.get('/v1/auth/me').json()['verified'] is True
    sid = client.cookies.get('rio_sid')
    with app.state.accounts.Session() as db:
        row = db.get(SessionRow, sha(sid))
        assert row.user_id == body['user_id']
        assert row.expires_at - row.created_at == SESSION_IDLE_S
    assert SESSION_ABSOLUTE_S > SESSION_IDLE_S


def test_invalid_and_expired_links_do_not_create_session(tmp_path):
    app, client = setup(tmp_path)
    token = register(app, client, 'expired@example.org')
    with app.state.accounts.Session.begin() as db:
        row = db.scalar(select(OneTimeToken).where(OneTimeToken.token_hash == sha(token)))
        row.expires_at = int(time.time()) - 1
    expired = client.post('/v1/auth/verify-email', json={'token': token})
    invalid = client.post('/v1/auth/verify-email', json={'token': 'x' * 40})
    assert expired.status_code == invalid.status_code == 400
    assert client.get('/v1/auth/me').status_code == 401
    assert client.cookies.get('rio_sid') is None
    with app.state.accounts.Session() as db:
        assert db.scalar(select(User.verified_at)) is None
        assert db.scalar(select(func.count()).select_from(SessionRow)) == 0


def test_token_replay_cannot_mint_another_session(tmp_path):
    app, client = setup(tmp_path)
    token = register(app, client, 'one-time@example.org')
    first = client.post('/v1/auth/verify-email', json={'token': token})
    assert first.status_code == 200
    sid = client.cookies.get('rio_sid')
    replay = client.post('/v1/auth/verify-email', json={'token': token})
    assert replay.status_code == 400
    assert 'set-cookie' not in replay.headers
    assert client.cookies.get('rio_sid') == sid
    stranger = TestClient(app)
    assert stranger.post('/v1/auth/verify-email', json={'token': token}).status_code == 400
    assert stranger.get('/v1/auth/me').status_code == 401
    with app.state.accounts.Session() as db:
        assert db.scalar(select(func.count()).select_from(SessionRow)) == 1


def test_link_rotates_previous_browser_session_and_does_not_mix_accounts(tmp_path):
    app, client = setup(tmp_path)
    first_token = register(app, client, 'first@example.org')
    first = client.post('/v1/auth/verify-email', json={'token': first_token})
    assert first.status_code == 200
    first_sid, first_id = client.cookies.get('rio_sid'), first.json()['user_id']
    second_token = register(app, client, 'second@example.org', expect_unauthenticated=False)
    # Creating a second pending account must not switch the current identity.
    assert client.get('/v1/auth/me').json()['id'] == first_id
    second = client.post('/v1/auth/verify-email', json={'token': second_token})
    assert second.status_code == 200
    assert second.json()['user_id'] != first_id
    assert client.cookies.get('rio_sid') != first_sid
    assert client.get('/v1/auth/me').json()['email'] == 'second@example.org'
    previous_browser = TestClient(app)
    previous_browser.cookies.set('rio_sid', first_sid)
    assert previous_browser.get('/v1/auth/me').status_code == 401
    with app.state.accounts.Session() as db:
        assert db.get(SessionRow, sha(first_sid)).revoked_at is not None


def test_browser_contract_confirms_server_session_before_redirect():
    from pathlib import Path
    auth = (Path(__file__).resolve().parents[1] / 'rio_pey_codi/static/auth.js').read_text()
    assert "verified.session_established !== true" in auth
    assert "await request('/v1/auth/me')" in auth
    assert 'me.id !== verified.user_id' in auth
    assert "location.replace(destination())" in auth
    assert 'authChannel?.postMessage' in auth
    assert 'localStorage.setItem' not in auth
