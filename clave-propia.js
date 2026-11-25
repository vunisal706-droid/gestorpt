/* Contraseña propia (opcional) para entrar en lugar del IdEA.
   Uso: <script src="clave-propia.js" data-idea="idDelCampoIdEA" [data-mod="10.12.0"]></script>
   Se carga DESPUÉS de firebase-auth(-compat). Si la persona escribe su contraseña,
   se usa en vez del IdEA; si marca la casilla, al entrar puede ponerse o cambiar la suya. */
(function () {
  var S = document.currentScript;
  var IDS = ((S && S.dataset.idea) || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  var MOD = S && S.dataset.mod; // versión de firebase-auth modular (si la app no usa compat)
  var K = 'cc-tengo-clave';
  var norm = function (s) { return String(s || '').trim().toLowerCase(); };

  function campoIdea() { for (var i = 0; i < IDS.length; i++) { var e = document.getElementById(IDS[i]); if (e && e.offsetParent !== null) return e; } return document.getElementById(IDS[0]); }
  function claveEscrita() { var c = document.getElementById('ccClave'); return c ? c.value : ''; }
  function quiereCambiar() { var c = document.getElementById('ccCambiar'); return !!(c && c.checked); }
  function aplica(email) {
    var e = campoIdea(); if (!e || !claveEscrita()) return false;
    return norm(String(email).split('@')[0]) === norm(e.value);
  }

  function pintar() {
    if (document.getElementById('ccCaja')) return;
    var e = campoIdea(); if (!e) return;
    var caja = document.createElement('div');
    caja.id = 'ccCaja';
    caja.style.cssText = 'margin:8px 0 10px;font-size:13px;text-align:left';
    caja.innerHTML =
      '<a href="#" id="ccLink" style="color:#475569;text-decoration:underline">🔒 Tengo contraseña propia</a>' +
      '<div id="ccCampo" style="display:none;margin-top:6px"><input type="password" id="ccClave" placeholder="Tu contraseña de esta app" autocomplete="off" ' +
      'style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid #d6dde6;border-radius:10px;font-size:15px"></div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:8px;color:#475569;cursor:pointer"><input type="checkbox" id="ccCambiar"> Ponerme o cambiar mi contraseña al entrar</label>';
    e.insertAdjacentElement('afterend', caja);
    var abrir = function (ev) { if (ev) ev.preventDefault(); document.getElementById('ccCampo').style.display = ''; document.getElementById('ccLink').style.display = 'none'; };
    document.getElementById('ccLink').onclick = function (ev) { abrir(ev); document.getElementById('ccClave').focus(); };
    try { if (localStorage.getItem(K) === '1') abrir(); } catch (x) {}
    document.getElementById('ccClave').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); e.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
    });
  }

  function modal(actualizar) {
    return new Promise(function (resolve) {
      var m = document.createElement('div');
      m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:2147483000;padding:20px;font-family:system-ui,sans-serif';
      m.innerHTML = '<div style="background:#fff;border-radius:14px;padding:24px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);text-align:left">' +
        '<h3 style="margin:0 0 8px;color:#1e3a5f">🔒 Tu contraseña de esta app</h3>' +
        '<p style="font-size:13px;color:#475569;margin:0 0 12px;line-height:1.5">A partir de ahora entrarás con tu IdEA <b>y esta contraseña</b>. Que no sea la de Séneca. Mínimo 8 caracteres.</p>' +
        '<input type="password" id="ccA" placeholder="Nueva contraseña" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:10px;border:2px solid #d6dde6;border-radius:8px;font-size:15px;margin-bottom:8px">' +
        '<input type="password" id="ccB" placeholder="Repite la contraseña" autocomplete="new-password" style="width:100%;box-sizing:border-box;padding:10px;border:2px solid #d6dde6;border-radius:8px;font-size:15px">' +
        '<div id="ccE" style="color:#dc2626;font-size:13px;min-height:18px;margin:8px 0"></div>' +
        '<div style="display:flex;gap:8px"><button id="ccOk" style="flex:1;background:#2563eb;color:#fff;border:none;border-radius:8px;padding:11px;font-weight:700;cursor:pointer">Guardar</button>' +
        '<button id="ccNo" style="background:#f1f5f9;border:none;border-radius:8px;padding:11px 14px;cursor:pointer">Ahora no</button></div></div>';
      document.body.appendChild(m);
      var fin = function (v) { m.remove(); resolve(v); };
      m.querySelector('#ccNo').onclick = function () { fin(false); };
      m.querySelector('#ccOk').onclick = function () {
        var a = m.querySelector('#ccA').value, b = m.querySelector('#ccB').value, er = m.querySelector('#ccE');
        if (a.length < 8) { er.textContent = 'Tiene que tener al menos 8 caracteres.'; return; }
        if (a !== b) { er.textContent = 'Las dos contraseñas no coinciden.'; return; }
        Promise.resolve(actualizar(a)).then(function () {
          try { localStorage.setItem(K, '1'); } catch (x) {}
          alert('✅ Contraseña guardada. La próxima vez entra con tu IdEA y esta contraseña («🔒 Tengo contraseña propia»).');
          fin(true);
        }).catch(function (e) { er.textContent = 'No se pudo guardar (' + (e.code || e.message) + '). Sal, vuelve a entrar y repítelo.'; });
      };
    });
  }

  function errorClave(e) {
    if (e && e.code === 'auth/too-many-requests') return e;
    var x = new Error('La contraseña no es correcta. Si no te has puesto contraseña, deja ese campo vacío.');
    x.code = 'cc/clave-incorrecta';
    alert(x.message);
    return x;
  }

  // ---- Apps con firebase compat: se intercepta el método de acceso ----
  if (window.firebase && firebase.auth && firebase.auth.Auth) {
    var P = firebase.auth.Auth.prototype, orig = P.signInWithEmailAndPassword;
    P.signInWithEmailAndPassword = async function (email, pass) {
      var usar = aplica(email), cred, self = this;
      try { cred = await orig.call(self, email, usar ? claveEscrita() : pass); }
      catch (e) {
        if (!usar) throw e;
        // Si la contraseña falla (p. ej. la rellenó el navegador), se prueba con el IdEA
        try { cred = await orig.call(self, email, pass); } catch (e2) { throw errorClave(e); }
      }
      if (quiereCambiar() && cred && cred.user) await modal(function (n) { return cred.user.updatePassword(n); });
      return cred;
    };
  }

  // ---- Apps con firebase modular: la app llama a window.ccEntrar(signIn, auth, email, pass) ----
  window.ccEntrar = async function (signIn, auth, email, pass) {
    var usar = aplica(email), cred;
    try { cred = await signIn(auth, email, usar ? claveEscrita() : pass); }
    catch (e) {
      if (!usar) throw e;
      try { cred = await signIn(auth, email, pass); } catch (e2) { throw errorClave(e); }
    }
    if (quiereCambiar() && cred && cred.user) {
      await modal(async function (n) {
        var m = await import('https://www.gstatic.com/firebasejs/' + (MOD || '10.12.0') + '/firebase-auth.js');
        return m.updatePassword(cred.user, n);
      });
    }
    return cred;
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pintar); else pintar();
  setTimeout(pintar, 1500);

  // Aviso de novedad (una sola vez por dispositivo)
  try {
    if (!localStorage.getItem('cc-nov-clave-1')) {
      localStorage.setItem('cc-nov-clave-1', '1');
      window.addEventListener('load', function () {
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#1e293b;color:#fff;padding:12px 16px;border-radius:12px;font:14px system-ui,sans-serif;z-index:2147483000;max-width:92vw;box-shadow:0 10px 30px rgba(0,0,0,.3)';
        t.innerHTML = '✨ <b>Novedad:</b> ya puedes entrar con una <b>contraseña propia</b> en vez de solo con el IdEA (opcional). <button style="margin-left:8px;background:#fff;color:#1e293b;border:none;border-radius:6px;padding:4px 10px;cursor:pointer">Vale</button>';
        t.querySelector('button').onclick = function () { t.remove(); };
        document.body.appendChild(t); setTimeout(function () { t.remove(); }, 12000);
      });
    }
  } catch (x) {}
})();
