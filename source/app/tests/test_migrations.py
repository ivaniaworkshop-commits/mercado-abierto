import sqlite3
from dataclasses import replace
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy.engine import Engine

from rio_pey_codi.platform import EXPECTED_SCHEMA_REVISION, Settings, create_platform


def test_public_readiness_revision_tracks_migration_head():
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    assert ScriptDirectory.from_config(config).get_current_head() == EXPECTED_SCHEMA_REVISION


@pytest.mark.parametrize('evidence', ['review', 'event', 'provider_readback', 'pending_provider_readback'])
def test_016_downgrade_rejects_evidence_before_changing_database(tmp_path, monkeypatch, evidence):
    from sqlalchemy import update
    from rio_pey_codi.models import Event, Intent, PendingEvent
    from test_platform import checkout, signup, verified_login

    source = tmp_path / 'retained.sqlite3'
    url = f'sqlite:///{source}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '016')
    app = create_platform(Settings(database_url=url, auto_create=False))
    env = (app, TestClient(app))
    merchant = signup(env)['merchant_id']
    csrf = verified_login(env)
    intent = checkout(env, merchant, csrf).json()['intent']
    factory = app.state.accounts.Session
    if evidence == 'review':
        response = env[1].post(f"/v1/checkout/qr/{intent['id']}/reconciliation-reviews",
                              headers={'x-csrf-token': csrf, 'idempotency-key': 'b' * 32},
                              json={'bank_records': []})
        assert response.status_code == 201
        reason = 'Refusing to discard account comparison evidence'
    elif evidence == 'event':
        with factory.begin() as db:
            db.add(Event(id='retained-event', intent_id=intent['id'], sha256='a' * 64,
                         processed_at=1, signature='synthetic-migration-fixture'))
        reason = 'Refusing to discard stored webhook signature evidence'
    elif evidence == 'provider_readback':
        with factory.begin() as db:
            db.execute(update(Intent).where(Intent.id == intent['id']).values(
                provider_payment_source='PEY_API', provider_payment_observed_at=1,
                provider_payment_sha256='b' * 64))
        reason = 'Refusing to discard pey payment evidence'
    else:
        with factory.begin() as db:
            db.add(PendingEvent(id='retained-pending', sha256='c' * 64, qr_id='fixture-qr',
                                amount_minor=100, numref='fixture', transaction_id='fixture-tx',
                                received_at=1, merchant_id=merchant, intent_id=intent['id'],
                                provider_verified=True, provider_payment_sha256='d' * 64))
        reason = 'Refusing to discard pey payment evidence'
    with sqlite3.connect(source) as connection:
        before = '\n'.join(connection.iterdump())
    with pytest.raises(RuntimeError, match=reason):
        command.downgrade(config, '015')
    with sqlite3.connect(source) as connection:
        assert '\n'.join(connection.iterdump()) == before
        assert connection.execute('SELECT version_num FROM alembic_version').fetchone()[0] == '016'


def test_migrated_database_backup_preserves_session_and_merchant(tmp_path, monkeypatch):
    source = tmp_path / 'original.sqlite3'
    restored = tmp_path / 'restored.sqlite3'
    url = f'sqlite:///{source}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, 'head')
    command.check(config)
    command.downgrade(config, 'base')
    command.upgrade(config, 'head')

    settings = Settings(database_url=url, auto_create=False)
    app = create_platform(settings)
    client = TestClient(app)
    credentials = {'email':'restore@example.com', 'password':'synthetic-password-123'}
    signup = client.post('/v1/auth/signup', json={**credentials, 'business_name':'Restauración'})
    assert signup.status_code == 201
    mail = app.state.mailer.outbox[0]
    assert '#token=' in mail['link'] and '?token=' not in mail['link']
    assert client.post('/v1/auth/verify-email', json={'token':mail['token']}).status_code == 200
    session = client.post('/v1/auth/login', json=credentials)
    assert session.status_code == 200
    assert 'HttpOnly' in session.headers['set-cookie']

    with sqlite3.connect(source) as src, sqlite3.connect(restored) as dst:
        src.backup(dst)
    restored_app = create_platform(replace(settings, database_url=f'sqlite:///{restored}'))
    reopened = TestClient(restored_app, cookies=client.cookies)
    assert reopened.get('/v1/auth/me').status_code == 200
    assert reopened.get('/v1/merchants').json()['merchants'][0]['id'] == signup.json()['merchant_id']


def test_recorded_review_survives_backup_and_blocks_destructive_downgrade(tmp_path, monkeypatch):
    from test_platform import checkout, signup, verified_login

    source, restored = tmp_path / 'reviews.sqlite3', tmp_path / 'reviews-copy.sqlite3'
    url = f'sqlite:///{source}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '017')
    settings = Settings(database_url=url, auto_create=False)
    app = create_platform(settings)
    env = (app, TestClient(app))
    merchant = signup(env, 'restore-review@example.com')['merchant_id']
    csrf = verified_login(env, 'restore-review@example.com')
    intent = checkout(env, merchant, csrf, order='restore-review').json()['intent']['id']
    path = f'/v1/checkout/qr/{intent}/reconciliation-reviews'
    created = env[1].post(path, headers={'x-csrf-token':csrf, 'idempotency-key':'a' * 32},
                          json={'bank_records':[]})
    assert created.status_code == 201 and created.json()['review']['classification'] == 'NO_PROVIDER_REPORT'
    assert created.json()['review']['account_assessment_at_review'] == 'SIGNATURE_NOT_VERIFIED'
    with pytest.raises(RuntimeError, match='Refusing to discard account comparison evidence'):
        command.downgrade(config, '011')
    with pytest.raises(RuntimeError, match='Refusing to (remove reconciliation reviews|discard recorded signature assessments|discard account comparison evidence)'):
        command.downgrade(config, '008')
    assert len(env[1].get(path).json()['reviews']) == 1
    with sqlite3.connect(source) as src, sqlite3.connect(restored) as dst:
        src.backup(dst)
    restored_app = create_platform(replace(settings, database_url=f'sqlite:///{restored}'))
    readback = TestClient(restored_app, cookies=env[1].cookies).get(path)
    assert readback.status_code == 200 and readback.json()['reviews'][0]['id'] == created.json()['review']['id']
    assert readback.json()['reviews'][0]['account_assessment_at_review'] == 'SIGNATURE_NOT_VERIFIED'


def test_recorded_beneficiary_claim_survives_backup_and_blocks_downgrade(tmp_path, monkeypatch):
    from test_platform import signup, verified_login
    from test_beneficiary_claims import path, post

    source, restored = tmp_path / 'claims.sqlite3', tmp_path / 'claims-copy.sqlite3'
    url = f'sqlite:///{source}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '017')
    settings = Settings(database_url=url, auto_create=False)
    app = create_platform(settings)
    env = (app, TestClient(app))
    merchant = signup(env, 'restore-claim@example.com')['merchant_id']
    csrf = verified_login(env, 'restore-claim@example.com')
    saved = post(env[1], merchant, csrf, 'f' * 32)
    assert saved.status_code == 201
    with pytest.raises(RuntimeError, match='Refusing to remove recorded beneficiary claims'):
        command.downgrade(config, '009')
    with sqlite3.connect(source) as src, sqlite3.connect(restored) as dst:
        src.backup(dst)
    reopened = create_platform(replace(settings, database_url=f'sqlite:///{restored}'))
    readback = TestClient(reopened, cookies=env[1].cookies).get(path(merchant))
    assert readback.status_code == 200 and readback.json()['claims'][0] == saved.json()['claim']


def test_provider_observation_survives_backup_and_blocks_downgrade(tmp_path, monkeypatch):
    from test_platform import signup, verified_login
    from test_beneficiary_claims import post
    from test_provider_account_observations import TOKEN, check
    import rio_pey_codi.platform as platform

    source, restored = tmp_path/'provider.sqlite3', tmp_path/'provider-copy.sqlite3'
    url = f'sqlite:///{source}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '017')
    base = create_platform(Settings(database_url=url, auto_create=False))
    env = (base, TestClient(base))
    merchant = signup(env)['merchant_id']; csrf = verified_login(env)
    assert post(env[1], merchant, csrf, 'a' * 32).status_code == 201
    settings = Settings(database_url=url, auto_create=False, account_lookup_enabled=True,
                        account_lookup_merchant_id=merchant, account_lookup_key_ref='test_key',
                        account_lookup_api_key=TOKEN)
    app = create_platform(settings)
    owner = (app, TestClient(app, cookies=env[1].cookies))
    monkeypatch.setattr(platform, 'lookup_pey_account', lambda *_: 'ACTIVE')
    saved = check(owner, merchant, csrf).json()['observation']
    with pytest.raises(RuntimeError, match='Refusing to discard provider observations'):
        command.downgrade(config, '012')
    with sqlite3.connect(source) as src, sqlite3.connect(restored) as dst:
        src.backup(dst)
    reopened = create_platform(replace(settings, database_url=f'sqlite:///{restored}'))
    readback = TestClient(reopened, cookies=owner[1].cookies).get(f'/v1/merchants/{merchant}/production-readiness')
    assert readback.status_code == 200 and readback.json()['provider_observation']['id'] == saved['id']
    assert readback.json()['production'] == 'BLOCKED'


def test_webhook_signature_survives_backup_and_prevents_downgrade(tmp_path, monkeypatch):
    from test_platform import SECRET, checkout, signed_webhook, signup, verified_login
    from test_reconciliation_preview import CLABE, RECORD, TRACKING

    source, restored = tmp_path / 'signature.sqlite3', tmp_path / 'signature-copy.sqlite3'
    url = f'sqlite:///{source}'
    monkeypatch.setenv('DATABASE_URL', url)
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, '017')
    settings = Settings(database_url=url, auto_create=False, webhook_secret=SECRET)
    app = create_platform(settings)
    env = (app, TestClient(app))
    merchant = signup(env, 'restore-signature@example.com')['merchant_id']
    csrf = verified_login(env, 'restore-signature@example.com')
    intent = checkout(env, merchant, csrf, order='restore-signature', amount=15000).json()['intent']
    payload = {'amount':150,'apiKeyId':'synthetic','codiQrId':intent['qr_display'],
               'numRef':'restore-signature','transactionId':'tx-fixture',
               'type':'codi.qr.payment_received','metadata':{'clabe':CLABE,'trackingKey':TRACKING}}
    payload['codiQrId'] = app.state.payments.get(intent['id']).provider_qr_id
    assert signed_webhook(env[1], payload, 'restore-signature-event').status_code == 200
    with pytest.raises(RuntimeError, match='Refusing to discard stored webhook signature evidence'):
        command.downgrade(config, '010')
    with sqlite3.connect(source) as src, sqlite3.connect(restored) as dst:
        src.backup(dst)
    reopened = create_platform(replace(settings, database_url=f'sqlite:///{restored}'))
    client = TestClient(reopened, cookies=env[1].cookies)
    result = client.post(f"/v1/checkout/qr/{intent['id']}/reconciliation-preview",
                         headers={'x-csrf-token':csrf}, json={'bank_records':[RECORD]})
    assert result.status_code == 200 and result.json()['signature_assessment'] == 'VERIFIED'


def test_sqlite_review_downgrade_locks_out_concurrent_writers(tmp_path, monkeypatch):
    source = tmp_path / 'concurrent-migration.sqlite3'
    monkeypatch.setenv('DATABASE_URL', f'sqlite:///{source}')
    config = Config(str(Path(__file__).resolve().parents[1] / 'alembic.ini'))
    command.upgrade(config, 'head')
    observed = []
    def check_lock(_conn, _cursor, statement, _parameters, _context, _many):
        if statement.strip().upper().startswith('SELECT 1 FROM RECONCILIATION_REVIEWS'):
            with sqlite3.connect(source, timeout=.1) as other:
                try:
                    other.execute("UPDATE users SET email = email")
                except sqlite3.OperationalError as error:
                    observed.append('locked' if 'locked' in str(error).lower() else 'other error')
                else:
                    observed.append('write admitted')
    event.listen(Engine, 'before_cursor_execute', check_lock)
    try:
        command.downgrade(config, '008')
    finally:
        event.remove(Engine, 'before_cursor_execute', check_lock)
    assert observed and all(value == 'locked' for value in observed)
