'use strict';
// Contract tests for browser-only dependencies in Node vm; no real HTTP or payments.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '../rio_pey_codi/static/app.js'), 'utf8'
).replace(/\nboot\(\);\s*$/, '\n');

const userId = 'b'.repeat(32);
const merchantId = 'a'.repeat(32);
const reply = (status, body) => ({
  ok: status >= 200 && status < 300, status, json: async () => body
});

function fixture(authenticated) {
  const elements = new Map();
  const redirects = [], locks = [], requests = [], writes = [], activations = [];
  function element() {
    return {
      listeners: {}, dataset: {}, children: [], value: '', hidden: false,
      disabled: false, textContent: '', checked: false, required: false,
      button: {disabled: false}, addEventListener(name, fn) { this.listeners[name] = fn; },
      querySelector() { return this.button; }, querySelectorAll() { return []; },
      replaceChildren() { this.children = []; }, append(...items) { this.children.push(...items); },
      add(item) { this.children.push(item); },
      setAttribute() {}, removeAttribute() {}, focus() {}
    };
  }
  function get(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  const location = {
    hash: '', search: '', pathname: '/', origin: 'https://example.test',
    replace(url) { redirects.push(url); }
  };
  async function fetch(url, options = {}) {
    requests.push(url);
    if (url === '/v1/auth/me') {
      return authenticated
        ? reply(200, {id: userId, email: 'user@example.test', csrf_token: 'csrf-test', can_invite: false})
        : reply(401, {detail: 'Sign in required'});
    }
    if (url === '/public-status') {
      return reply(200, {
        mode: 'DEMO', launch_mode: 'LIMITED', access_enabled: true,
        registration_enabled: true, registration_email_required: false,
        verification_email_enabled: false, password_reset_enabled: false,
        payment_requests_enabled: false, live_payments_enabled: false
      });
    }
    if (url === '/v1/merchants') return reply(200, {merchants: []});
    if (url === '/v1/merchants/' + merchantId + '/own-pey-account-checks') {
      writes.push({url, method: options.method, body: JSON.parse(options.body), headers: options.headers});
      return reply(201, {
        key_saved: false,
        observation: {
          status: 'ACTIVE', source: 'SERVER_PEY_HTTPS_READ_ONLY',
          merchant_ownership_verified: false, live_payments_enabled: false
        }
      });
    }
    throw Error('Unexpected mocked request: ' + url);
  }
  const context = vm.createContext({
    document: {
      getElementById: get, createElement: element, querySelectorAll() { return []; }
    },
    window: {
      RioSession: {lock() { locks.push('locked'); }},
      RioWorkspace: {activate() { activations.push('activated'); }},
      dispatchEvent() {}
    },
    location, history: {replaceState() {}}, navigator: {},
    sessionStorage: {getItem() { return null; }, removeItem() {}},
    localStorage: {
      getItem() { return null; },
      setItem() { throw Error('Unexpected local storage write'); }
    },
    crypto: {randomUUID: () => '11111111-2222-4333-8444-555555555555'},
    fetch, Event: class Event { constructor(type) { this.type = type; } },
    URLSearchParams, URL, AbortController, setTimeout, clearTimeout,
    Uint32Array, Blob, TextEncoder
  });
  vm.runInContext(source, context, {timeout: 2000});
  return {context, get, redirects, locks, requests, writes, activations};
}

async function unauthorizedScenario() {
  const state = fixture(false);
  await vm.runInContext('boot()', state.context, {timeout: 2000});
  assert.deepEqual(state.requests, ['/v1/auth/me']);
  assert.ok(state.locks.length >= 1, '401 must lock browser session');
  assert.ok(state.redirects.length >= 1, '401 must redirect to login');
  assert.ok(state.redirects.every(url => url === '/login?next=%2F'));
  assert.match(state.get('session-loading').textContent, /Redirigiendo/);
  assert.equal(state.get('welcome').textContent, '', '401 must not initialize authenticated UI');
  assert.equal(state.writes.length, 0);
  console.log('PASS unauthenticated 401: locked and redirected, no commerce request');
}

async function authenticatedScenario() {
  const state = fixture(true);
  await vm.runInContext('boot()', state.context, {timeout: 2000});
  assert.deepEqual(state.requests.slice(0, 3), ['/v1/auth/me', '/public-status', '/v1/merchants']);
  assert.deepEqual(state.redirects, [], 'authenticated boot must not redirect');
  assert.equal(state.locks.length, 0);
  assert.equal(state.get('welcome').textContent, 'user@example.test');
  assert.equal(state.get('session-loading').hidden, true);
  assert.equal(state.get('environment').textContent, 'DEMOSTRACIÓN');
  assert.equal(state.get('business-results').textContent, '0 de 0 negocios');
  assert.equal(state.activations.length, 1, 'authenticated workspace must activate');

  // Isolated owner-check contract: the fake key is never persisted or sent to pey.
  vm.runInContext(
    "currentMerchant='" + merchantId + "';csrf='csrf-test';" +
    "merchantRoles.set('" + merchantId + "','owner');resetBeneficiary()",
    state.context, {timeout: 2000}
  );
  const key = 'synthetic-test-key';
  state.get('own-pey-key').value = key;
  await state.get('own-pey-form').listeners.submit({preventDefault() {}});
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].url, '/v1/merchants/' + merchantId + '/own-pey-account-checks');
  assert.equal(state.writes[0].method, 'POST');
  assert.equal(state.writes[0].body.api_key, key);
  assert.equal(state.writes[0].headers['X-CSRF-Token'], 'csrf-test');
  assert.equal(state.get('own-pey-key').value, '', 'API key input must be cleared');
  assert.match(state.get('own-pey-status').textContent, /La clave no se guardó/i);
  assert.match(state.get('own-pey-status').textContent, /no activa cobros/i);
  console.log('PASS authenticated boot and isolated owner-check client contract');
}

(async () => {
  await unauthorizedScenario();
  await authenticatedScenario();
  console.log('SELF_SIGNUP_UI_OK');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
