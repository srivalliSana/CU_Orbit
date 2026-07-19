/**
 * CU Orbit sign-in bootstrap.
 *
 * Two ways in, one code path:
 *
 *   1. Embedded — CampusOne's /connect page frames us and postMessages a
 *      60-second handoff token. We exchange it for an Orbit session.
 *   2. Standalone — someone opens the site directly. There is no local login
 *      (CampusOne is the only identity source), so we bounce them to
 *      CampusOne, which signs them in and frames us back.
 *
 * A stored session short-circuits both.
 */
(function () {
    'use strict';

    var KEY = 'orbit_session';
    var api = { session: null, user: null, ready: false };
    window.OrbitAuth = api;

    function saveSession(token, user) {
        try { localStorage.setItem(KEY, token); } catch (e) { /* private mode */ }
        api.session = token;
        api.user = user;
        api.ready = true;
        document.dispatchEvent(new CustomEvent('orbit:authenticated', { detail: { user: user } }));
    }

    function clearSession() {
        try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
        api.session = null; api.user = null;
    }

    /** Attach the session to every same-origin API call, so callers need not. */
    var origFetch = window.fetch;
    window.fetch = function (input, init) {
        init = init || {};
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('/api/') === 0 && api.session) {
            init.headers = new Headers(init.headers || {});
            if (!init.headers.has('Authorization')) init.headers.set('Authorization', 'Bearer ' + api.session);
        }
        return origFetch.call(this, input, init);
    };

    function exchange(token) {
        return origFetch('/api/auth/sso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
        }).then(function (r) {
            if (!r.ok) throw new Error('handoff rejected (' + r.status + ')');
            return r.json();
        }).then(function (d) {
            saveSession(d.session, d.user);
            return d;
        });
    }

    function validateStored() {
        var stored = null;
        try { stored = localStorage.getItem(KEY); } catch (e) { /* ignore */ }
        if (!stored) return Promise.resolve(false);
        return origFetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + stored } })
            .then(function (r) {
                if (!r.ok) { clearSession(); return false; }
                return r.json().then(function (d) { saveSession(stored, d.user); return true; });
            })
            .catch(function () { return false; });
    }

    var inIframe = window.self !== window.top;

    // Only ever trust a handoff from CampusOne's exact origin.
    function listenForHandoff(campusOrigin) {
        window.addEventListener('message', function (ev) {
            if (ev.origin !== campusOrigin) return;
            var d = ev.data || {};
            if (d.type !== 'campusone:handoff' || !d.token) return;
            exchange(d.token).catch(function (e) {
                console.error('[orbit] handoff failed:', e.message);
                document.dispatchEvent(new CustomEvent('orbit:auth-failed', { detail: { error: e.message } }));
            });
        });
    }

    function start() {
        origFetch('/api/config')
            .then(function (r) { return r.json(); })
            .then(function (cfg) {
                var campusOrigin = new URL(cfg.campus_url).origin;
                if (inIframe) listenForHandoff(campusOrigin);

                return validateStored().then(function (ok) {
                    if (ok || inIframe) return;
                    // Standalone with no valid session: CampusOne signs them in
                    // and frames us back. Guard against a redirect loop if the
                    // handshake is misconfigured.
                    var flag = 'orbit_redirected';
                    if (sessionStorage.getItem(flag)) {
                        document.dispatchEvent(new CustomEvent('orbit:auth-failed', {
                            detail: { error: 'Could not sign in through CampusOne.' }
                        }));
                        return;
                    }
                    sessionStorage.setItem(flag, '1');
                    window.location.href = cfg.campus_url + cfg.connect_path;
                });
            })
            .catch(function (e) { console.error('[orbit] auth bootstrap failed:', e.message); });
    }

    document.addEventListener('orbit:authenticated', function () {
        try { sessionStorage.removeItem('orbit_redirected'); } catch (e) { /* ignore */ }
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
