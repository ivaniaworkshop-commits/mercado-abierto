"""Targeted PR306 regressions; exercise the real FastAPI session/owner/webhook routes."""
import time

from sqlalchemy import select

from rio_pey_codi.identity import SESSION_ABSOLUTE_S, SESSION_IDLE_S, sha
from rio_pey_codi.models import ActivityEvent, SessionRow
from test_platform import env, signup, verified_login


def test_successful_relogin_rotates_prior_server_session(env):
    signup(env)
    verified_login(env)
    app, client = env
    old = client.cookies.get('rio_sid')
    csrf = client.get('/v1/auth/me').json()['csrf_token']
    second = client.post('/v1/auth/login', json={
        'email': 'owner@example.com', 'password': 'veryLongSecurePass123'})
    assert second.status_code == 200
    new = client.cookies.get('rio_sid')
    assert new and new != old and second.json()['csrf_token'] != csrf
    with app.state.accounts.Session() as db:
        previous = db.get(SessionRow, sha(old))
        assert previous is not None and previous.revoked_at is not None
        active = db.get(SessionRow, sha(new))
        assert active is not None and active.revoked_at is None
        assert active.expires_at - active.created_at == SESSION_IDLE_S


def test_idle_and_absolute_server_timeouts(env):
    signup(env)
    verified_login(env)
    app, client = env
    sid = client.cookies.get('rio_sid')
    with app.state.accounts.Session.begin() as db:
        row = db.get(SessionRow, sha(sid))
        row.expires_at = int(time.time()) + 90
    assert client.get('/v1/auth/me').status_code == 200
    with app.state.accounts.Session() as db:
        row = db.get(SessionRow, sha(sid))
        assert row.expires_at > int(time.time()) + 90
        assert row.expires_at <= row.created_at + SESSION_ABSOLUTE_S
    with app.state.accounts.Session.begin() as db:
        row = db.get(SessionRow, sha(sid))
        row.created_at = int(time.time()) - SESSION_ABSOLUTE_S - 1
        row.expires_at = int(time.time()) + SESSION_IDLE_S
    assert client.get('/v1/auth/me').status_code == 401


def test_logout_deletes_server_token_and_invalidates_cookie(env):
    signup(env)
    csrf = verified_login(env)
    app, client = env
    sid = client.cookies.get('rio_sid')
    assert client.post('/v1/auth/logout', headers={'x-csrf-token': csrf}).status_code == 200
    with app.state.accounts.Session() as db:
        assert db.get(SessionRow, sha(sid)) is None
    client.cookies.set('rio_sid', sid)
    assert client.get('/v1/auth/me').status_code == 401


def test_market_assets_and_reserved_api_require_owner_but_shared_state_remains_accessible(env):
    signup(env)
    verified_login(env)
    app, client = env
    resource = '/static/unificada/mercado/styles.css'
    # Existing hackathon commercial-state is shared and keeps its own tenant ACL.
    assert client.get(resource).status_code == 403
    assert client.get('/api/mercado/restricted').status_code == 403
    assert client.get('/api/hackaton/commercial-state').status_code == 200
    me = client.get('/v1/auth/me').json()
    app.state.accounts.platform_owner_id = me['id']
    assert client.get(resource).status_code == 200
    assert client.get('/api/mercado/restricted').status_code == 404


def test_six_failed_logins_raise_privacy_safe_security_alert(env, caplog):
    signup(env)
    app, client = env
    for _ in range(6):
        response = client.post('/v1/auth/login', json={
            'email': 'owner@example.com', 'password': 'incorrect-credential'})
        assert response.status_code == 401
    assert 'security_alert_login_failures' in caplog.text
    assert 'incorrect-credential' not in caplog.text
    with app.state.accounts.Session() as db:
        types = [row.event_type for row in db.scalars(select(ActivityEvent))]
    assert types.count('LOGIN_FAILURE_BURST') == 1


def test_bad_webhook_signature_cannot_process_event_and_is_audited(env):
    app, client = env
    response = client.post('/v1/webhooks/pey',
        content=b'{"type":"codi.qr.payment_received"}',
        headers={'webhook-id': 'evt-security', 'webhook-timestamp': str(int(time.time())),
                 'webhook-signature': 'v1,' + 'A' * 44})
    assert response.status_code == 401
    with app.state.accounts.Session() as db:
        types = [row.event_type for row in db.scalars(select(ActivityEvent))]
    assert 'WEBHOOK_INVALID' in types
