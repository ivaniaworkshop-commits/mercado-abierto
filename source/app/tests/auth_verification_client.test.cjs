'use strict';
// DOM-level client contract test for email verification (mocked HTTP responses).
// Does not constitute a browser/SMTP/production E2E observation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../rio_pey_codi/static/auth.js'), 'utf8');

async function scenario(label, options) {
  const elements = new Map();
  const panels = [];
  const element = id => ({
    id, hidden: false, disabled: false, value: '', textContent: '',
    dataset: {}, listeners: {},
    addEventListener(type, callback) { this.listeners[type] = callback; },
    querySelector() { return {scrollIntoView() {}}; },
    reportValidity() { return true; },
  });
  const get = id => {
    if (!elements.has(id)) {
      const item = element(id);
      if (id === 'login') item.elements = {namedItem: () => element('field')};
      elements.set(id, item);
    }
    return elements.get(id);
  };
  for (const view of ['login', 'signup', 'verify', 'forgot', 'reset', 'invite']) {
    const panel = element('view:' + view);
    panel.dataset.authView = view;
    panels.push(panel);
  }
  const document = {
    visibilityState: 'visible', getElementById: get,
    querySelectorAll: selector => selector === '[data-auth-view]' ? panels : [],
    querySelector: () => ({scrollIntoView() {}}),
    addEventListener() {},
  };
  const stripped = [], redirects = [], requests = [], notices = [];
  const location = {
    href: 'https://example.test/verify-email#token=valid-token-12345678901234567890123456789012',
    hash: '#token=valid-token-12345678901234567890123456789012',
    search: '', origin: 'https://example.test', pathname: '/verify-email',
    replace: value => redirects.push(value),
  };
  const reply = (status, body) => ({ok: status >= 200 && status < 300, status, json: async () => body});
  class BroadcastChannel {
    addEventListener() {}
    postMessage(value) { notices.push(value); }
  }
  async function fetch(url) {
    requests.push(url);
    if (url === '/public-status') {
      return options.statusDown ? reply(503, {detail: 'status unavailable'}) : reply(200, {
        access_enabled: true, registration_enabled: true,
        password_reset_enabled: true, verification_email_enabled: true,
      });
    }
    if (url === '/v1/auth/verify-email') {
      return options.invalid ? reply(400, {detail: 'expired'}) :
        reply(200, {status: 'EMAIL_VERIFIED', session_established: true, user_id: 'id-verified'});
    }
    if (url === '/v1/auth/me') {
      return reply(200, {id: options.wrongMe ? 'wrong-account' : 'id-verified'});
    }
    throw new Error('Unexpected request ' + url);
  }
  const context = vm.createContext({
    document, window: {}, location,
    history: {replaceState: (...args) => stripped.push(args)},
    fetch, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    BroadcastChannel, FormData, console,
  });
  vm.runInContext(source, context, {timeout: 1000});
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(requests.filter(url => url === '/v1/auth/verify-email').length, 1, label);
  assert.equal(stripped.length, 1, label);
  assert(!stripped[0][2].includes('token='), label + ': scrub URL');
  if (options.invalid || options.wrongMe) {
    assert.equal(redirects.length, 0, label + ': must not enter without validated session');
    assert.match(get('verification-status').textContent, /no se pudo|no es válido/i);
  } else {
    assert.deepEqual(redirects, ['/'], label + ': home');
    assert.equal(requests.filter(url => url === '/v1/auth/me').length, 1, label + ': server session check');
    assert.equal(notices.length, 1, label + ': notify other tabs');
    assert.deepEqual(Object.keys(notices[0]), ['event'], label + ': no personal information');
  }
  console.log('PASS ' + label);
}

(async () => {
  await scenario('valid link', {});
  await scenario('expired link', {invalid: true});
  await scenario('status failure still verifies', {statusDown: true});
  await scenario('mismatched account does not redirect', {wrongMe: true});
  console.log('4/4 auth verification client scenarios passed');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
