(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const incoming = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  const token = incoming.get('token');
  const reset = location.pathname === '/reset-password';
  const views = new Set(['login', 'signup', 'verify', 'forgot', 'reset', 'invite']);
  let emailDeliveryAvailable = false;
  let resendBusy = false;
  const notice = message => { $('notice').textContent = message; };

  function enteredEmail() {
    const panel = document.querySelector('[data-auth-view]:not([hidden])');
    return panel?.querySelector('input[type="email"]')?.value.trim() || '';
  }

  function carryEmail(email) {
    if (!email) return;
    for (const input of [$('login').elements.namedItem('email'), $('signup-email'), $('forgot-email'), $('verification-email')]) input.value = email;
  }

  function verification(email, message, title = 'Verifica tu correo') {
    carryEmail(email);
    show('verify');
    $('verification-title').textContent = title;
    $('verification-status').textContent = message;
  }

  function resendControls() {
    $('resend-verification').disabled = resendBusy || !emailDeliveryAvailable;
    $('verification-resend').disabled = resendBusy || !emailDeliveryAvailable;
    $('verification-email').disabled = resendBusy;
  }

  function show(view) {
    if (!views.has(view)) return;
    document.querySelectorAll('[data-auth-view]').forEach(panel => {
      panel.hidden = panel.dataset.authView !== view;
    });
    notice('');
    document.querySelector('[data-auth-view="' + view + '"] h1, [data-auth-view="' + view + '"] h2')?.scrollIntoView?.({block:'nearest'});
  }

  function destination() {
    const allowed = new Set(['/', '/caja', '/hackaton', '/mercado-abierto', '/static/unificada/index.html',
      '/static/unificada/caja/index.html', '/static/unificada/mercado/index.html',
      '/static/unificada/hackaton/index.html']);
    const hashes = new Set(['#menu', '#mis-negocios', '#cobro-codi', '#historial', '#configuracion-pey', '#negocio', '#modulos']);
    try {
      const url = new URL(new URLSearchParams(location.search).get('next') || '/', location.origin);
      if (url.origin !== location.origin || !allowed.has(url.pathname) || url.search) return '/';
      const hash = hashes.has(url.hash) ? url.hash : hashes.has(location.hash) ? location.hash : '';
      return url.pathname + hash;
    } catch (_) { return '/'; }
  }

  async function request(path, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(path, {method:body ? 'POST' : 'GET', credentials:'same-origin',
        cache:'no-store', signal:controller.signal,
        headers:{Accept:'application/json', ...(body ? {'Content-Type':'application/json'} : {})},
        ...(body ? {body:JSON.stringify(body)} : {})});
      const result = await response.json();
      if (!response.ok) {
        const error = Error(typeof result.detail === 'string' ? result.detail : 'No se pudo completar la solicitud.');
        error.status = response.status;
        error.code = result.code;
        error.accountCreated = result.account_created === true;
        error.verificationRequested = result.verification_requested === true;
        throw error;
      }
      return result;
    } catch (error) {
      if (error.name === 'AbortError') throw Error('El servidor tardó demasiado. Intenta de nuevo.');
      throw error;
    } finally { clearTimeout(timer); }
  }

  async function purgeLegacyHtmlCaches() {
    // Retire cached public pages from versions published before login was mandatory.
    // Sales and tickets in localStorage are left intact.
    if (!('caches' in window)) return;
    for (const name of await caches.keys()) {
      if (!name.startsWith('rio-unificada-')) continue;
      const cache = await caches.open(name);
      if ((await cache.keys()).some(item => new URL(item.url).pathname.endsWith('.html'))) {
        await caches.delete(name);
      }
    }
  }

  document.querySelectorAll('[data-auth-open]').forEach(button => {
    button.addEventListener('click', () => {
      const email = enteredEmail();
      carryEmail(email);
      if (button.dataset.authOpen === 'verify') {
        verification(email, 'Solicita otro enlace para la cuenta registrada. Abrir esta pantalla no envía un correo.');
      } else show(button.dataset.authOpen);
    });
  });
  $('login').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('login-submit');
    if (button.disabled) return;
    button.disabled = true;
    notice('Iniciando sesión…');
    const values = Object.fromEntries(new FormData(event.target).entries());
    try {
      await request('/v1/auth/login', values);
      const me = await request('/v1/auth/me');
      if (typeof me.id !== 'string' || !me.id) throw Error('No se pudo comprobar la sesión.');
      event.target.elements.namedItem('password').value = '';
      location.replace(destination());
    } catch (error) {
      const email = values.email.trim();
      if (error.code === 'ACCOUNT_ACTIVATION_REQUIRED' || error.code === 'EMAIL_DELIVERY_UNAVAILABLE' || error.status === 403) {
        event.target.elements.namedItem('password').value = '';
        verification(email, error.code === 'EMAIL_DELIVERY_UNAVAILABLE'
          ? 'La cuenta necesita verificación, pero el servicio de correo no pudo completar la solicitud. Puedes reintentar el envío aquí.'
          : error.verificationRequested
            ? 'Solicitamos un nuevo correo de verificación. Revisa Recibidos y Spam o Correo no deseado; después inicia sesión.'
            : 'Verifica tu correo antes de iniciar sesión. Si no encuentras el enlace, solicita otro desde esta pantalla.');
      } else notice(error.status === 401 ? 'Revisa tu correo y contraseña.' : error.message);
      button.disabled = false;
    }
  });
  $('signup').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('signup-submit');
    if (button.disabled) return;
    button.disabled = true;
    const values = Object.fromEntries(new FormData(event.target).entries());
    try {
      const result = await request('/v1/auth/signup', values);
      if (result.status !== 'VERIFICATION_REQUIRED') throw Error('Revisa el estado de tu cuenta antes de continuar.');
      event.target.elements.namedItem('password').value = '';
      verification(values.email.trim(), 'Cuenta creada. Revisa tu correo y verifica la cuenta antes de iniciar sesión.');
    } catch (error) {
      if (error.code === 'ACCOUNT_EXISTS' || error.status === 409) {
        event.target.elements.namedItem('password').value = '';
        verification(values.email.trim(), 'Este correo ya tiene una cuenta. Inicia sesión; si aún falta verificarlo, solicita otro enlace. Si olvidaste la contraseña, puedes recuperarla.', 'Tu cuenta ya existe');
      } else if (error.accountCreated || error.code === 'VERIFICATION_DELIVERY_UNAVAILABLE') {
        event.target.elements.namedItem('password').value = '';
        verification(values.email.trim(), 'La cuenta quedó creada, pero no se pudo completar la solicitud del correo de verificación. Puedes reintentar el envío sin volver a registrarte.');
      } else notice(error.status === 422 ? 'Revisa el nombre del comercio, el correo y la contraseña.' : error.message);
    } finally { button.disabled = false; }
  });
  async function resendVerification(input) {
    if (resendBusy || !emailDeliveryAvailable || !input.reportValidity()) return;
    const email = input.value.trim();
    carryEmail(email);
    resendBusy = true;
    resendControls();
    verification(email, 'Solicitando un nuevo enlace…');
    try {
      await request('/v1/auth/resend-verification', {email});
      $('verification-status').textContent = 'Solicitud aceptada. Si la cuenta necesita verificación, recibirás un enlace. Revisa Recibidos y Spam o Correo no deseado.';
    } catch (error) {
      $('verification-status').textContent = error.status === 429
        ? 'Has solicitado varios enlaces. Espera unos minutos antes de intentar de nuevo.'
        : 'No se pudo completar la solicitud de correo. Conservamos la cuenta y el correo escrito; vuelve a intentarlo más tarde.';
    } finally { resendBusy = false; resendControls(); }
  }
  $('resend-verification').addEventListener('click', () => resendVerification($('signup-email')));
  $('verification-form').addEventListener('submit', event => {
    event.preventDefault();
    void resendVerification($('verification-email'));
  });
  $('forgot-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = $('reset-request');
    if (button.disabled) return;
    button.disabled = true;
    $('forgot-password-status').textContent = 'Solicitando el enlace…';
    try {
      await request('/v1/auth/reset-request', {email:$('forgot-email').value.trim()});
      $('forgot-password-status').textContent = 'Si existe una cuenta con ese correo, recibirás un enlace de recuperación. Revisa también spam.';
    } catch (error) { $('forgot-password-status').textContent = error.message; }
    finally { button.disabled = false; }
  });
  $('rio-password-reset-form').addEventListener('submit', async event => {
    event.preventDefault();
    const fields = event.target.elements;
    const password = fields.namedItem('password').value;
    const status = $('rio-reset-result');
    if (!token) { status.textContent = 'Abre el enlace que recibiste por correo.'; return; }
    if (password !== fields.namedItem('confirmation').value) {
      status.textContent = 'Las contraseñas no coinciden.'; return;
    }
    const button = $('rio-reset-submit');
    button.disabled = true;
    try {
      await request('/v1/auth/reset-confirm', {token, password});
      event.target.reset();
      status.textContent = 'Contraseña actualizada. Ya puedes iniciar sesión.';
    } catch (error) { status.textContent = 'No se pudo restablecer el acceso: ' + error.message; }
    finally { button.disabled = false; }
  });

  if (token) {
    const clean = new URL(location.href);
    clean.hash = '';
    clean.searchParams.delete('token');
    history.replaceState(null, '', clean.pathname + clean.search);
    show(reset ? 'reset' : 'verify');
    if (!reset) $('verification-status').textContent = 'Comprobando el enlace y activando la sesión…';
  } else if (incoming.has('owner_invite')) show('invite');
  else show('login');
  void purgeLegacyHtmlCaches().catch(() => {});

  (async () => {
    try {
      const status = await request('/public-status');
      $('login-submit').disabled = status.access_enabled !== true;
      $('signup-submit').disabled = status.registration_enabled !== true;
      $('reset-request').disabled = status.password_reset_enabled !== true;
      emailDeliveryAvailable = status.verification_email_enabled === true;
      resendControls();
      $('resend-verification').hidden = status.verification_email_enabled !== true;
      $('launch-status').hidden = status.access_enabled === true;
      $('launch-status').textContent = status.access_enabled === true ? '' : 'El acceso no está disponible en este momento. Intenta más tarde.';
      $('signup-state').textContent = status.registration_enabled === true
        ? 'Verifica tu correo antes de iniciar sesión.' : 'El registro no está disponible en este momento.';
      $('forgot-password-status').textContent = status.password_reset_enabled === true
        ? 'Recibirás un enlace privado de un solo uso.' : 'La recuperación no está disponible en este momento.';
    } catch (error) { notice(error.message); }
  })();

  // Only a verified server session can update another login tab. No tokens
  // or personal information are placed in BroadcastChannel or localStorage.
  const authChannel = typeof BroadcastChannel === 'function'
    ? new BroadcastChannel('rio-auth-session-v1') : null;
  async function enterIfAuthenticated() {
    try {
      const me = await request('/v1/auth/me');
      if (typeof me.id === 'string' && me.id) location.replace(destination());
    } catch (_) { /* A session must be verified by the server. */ }
  }
  if (authChannel) authChannel.addEventListener('message', event => {
    if (event.data && event.data.event === 'session-established') void enterIfAuthenticated();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !token && !reset) void enterIfAuthenticated();
  });

  if (token && !reset) {
    (async () => {
      try {
        const verified = await request('/v1/auth/verify-email', {token});
        if (verified.status !== 'EMAIL_VERIFIED' || verified.session_established !== true) {
          throw Error('No se pudo comprobar el inicio de sesión tras verificar el correo.');
        }
        const me = await request('/v1/auth/me');
        if (typeof me.id !== 'string' || !me.id || me.id !== verified.user_id) {
          throw Error('El servidor no confirmó la sesión de la cuenta verificada.');
        }
        authChannel?.postMessage({event:'session-established'});
        location.replace(destination());
      } catch (error) {
        verification('', error.status === 400
          ? 'El enlace no es válido, ya se utilizó o venció. Solicita otro correo de verificación.'
          : 'No se pudo completar el acceso automático: ' + error.message,
          'No se pudo completar la verificación');
      }
    })();
  }
})();
