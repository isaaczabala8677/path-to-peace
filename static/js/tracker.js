/* ============================================================
   The path to Peace — identificación, progreso y reporte docente
   Ubicación:  static/js/tracker.js
   ============================================================ */
(function () {
  'use strict';

  var CONFIG = {
    // 1) URL del Apps Script publicado (termina en /exec).
    //    Si la dejas vacía, el juego funciona igual pero sin guardar en la nube.
    endpoint: '',

    // 2) Archivos del motor de Genially. Si vuelves a exportar desde Genially,
    //    revisa estos dos nombres: los códigos del final cambian en cada export.
    runtime: [
      'static/js/offline-runtime.5645a9b4.js',
      'static/js/main.1e575690.js'
    ],

    // 3) Lista de estudiantes por curso.
    roster: 'estudiantes.json',

    // 4) Escena de Genially en la que se entrega cada runa.
    runas: { 21: 'Empathy', 26: 'Tolerance', 33: 'Cooperation', 36: 'Dialogue', 39: 'Forgiveness' },
    ordenRunas: ['Empathy', 'Tolerance', 'Cooperation', 'Dialogue', 'Forgiveness'],
    escenaFinal: 43,

    autoguardadoMs: 20000,
    sondeoMs: 1500
  };

  var K_ALUMNO = 'ptp_alumno';
  var K_PROGRESO = 'ptp_progreso';

  var alumno = null;
  var progreso = { escena: 1, runas: [], completado: false };
  var sucio = false;
  var ultimaEscena = null;

  /* ---------------- utilidades ---------------- */

  function normalizar(s) {
    return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function leerLocal(c) { try { return localStorage.getItem(c); } catch (e) { return null; } }
  function escribirLocal(c, v) { try { localStorage.setItem(c, v); } catch (e) { } }

  function jsonp(url) {
    return new Promise(function (resolve, reject) {
      var nombre = 'ptp_cb_' + Math.random().toString(36).slice(2);
      var s = document.createElement('script');
      var listo = false;
      window[nombre] = function (datos) {
        listo = true;
        resolve(datos);
        window[nombre] = undefined;
        if (s.parentNode) s.parentNode.removeChild(s);
      };
      s.src = url + (url.indexOf('?') === -1 ? '?' : '&') + 'callback=' + nombre;
      s.onerror = function () { if (!listo) reject(new Error('sin conexion')); };
      document.head.appendChild(s);
      setTimeout(function () { if (!listo) reject(new Error('tiempo agotado')); }, 12000);
    });
  }

  function enviar(datos, alSalir) {
    if (!CONFIG.endpoint) return;
    var cuerpo = JSON.stringify(datos);
    if (alSalir && navigator.sendBeacon) {
      try {
        navigator.sendBeacon(CONFIG.endpoint, new Blob([cuerpo], { type: 'text/plain;charset=utf-8' }));
        return;
      } catch (e) { }
    }
    try {
      fetch(CONFIG.endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: cuerpo
      });
    } catch (e) { }
  }

  /* ---------------- estado del juego ----------------
     El motor de sandbox ya guarda en el navegador el marcapáginas, las runas
     recogidas, el nombre y los aciertos por reto. Aquí solo lo copiamos. */

  function tomarInstantanea() {
    var estado = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('ptp_') !== 0) estado[k] = localStorage.getItem(k);
      }
    } catch (e) { }
    return estado;
  }

  function restaurarInstantanea(estado) {
    if (!estado) return;
    Object.keys(estado).forEach(function (k) {
      if (k.indexOf('ptp_') !== 0) escribirLocal(k, estado[k]);
    });
  }

  function mapaEscenas() {
    var mapa = {};
    try {
      var s = window.dataGeniallyOffline.Slides;
      for (var i = 0; i < s.length; i++) mapa[s[i].Id] = parseInt(s[i].Order, 10);
    } catch (e) { }
    return mapa;
  }

  function guardar(alSalir) {
    if (!alumno) return;
    escribirLocal(K_PROGRESO, JSON.stringify(progreso));
    enviar({
      id: alumno.id,
      curso: alumno.curso,
      nombre: alumno.nombre,
      escena: progreso.escena,
      runas: progreso.runas,
      completado: progreso.completado,
      estado: tomarInstantanea()
    }, alSalir);
    sucio = false;
  }

  function vigilarProgreso() {
    var escenas = mapaEscenas();

    setInterval(function () {
      var el = document.getElementsByClassName('genially-view-slide')[0];
      if (!el) return;
      var orden = escenas[el.getAttribute('id')];
      if (!orden || orden === ultimaEscena) return;

      ultimaEscena = orden;
      if (orden > progreso.escena || orden === 11) progreso.escena = orden;
      sucio = true;

      var runa = CONFIG.runas[orden];
      if (runa && progreso.runas.indexOf(runa) === -1) {
        progreso.runas.push(runa);
        guardar(false);
      }
      if (orden >= CONFIG.escenaFinal && !progreso.completado) {
        progreso.completado = true;
        guardar(false);
      }
    }, CONFIG.sondeoMs);

    setInterval(function () { if (sucio) guardar(false); }, CONFIG.autoguardadoMs);

    window.addEventListener('pagehide', function () { guardar(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') guardar(true);
    });
  }

  /* ---------------- arranque del motor ---------------- */

  function cargarScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('No se pudo cargar ' + src)); };
      document.body.appendChild(s);
    });
  }

  function iniciarJuego() {
    var cadena = Promise.resolve();
    CONFIG.runtime.forEach(function (src) {
      cadena = cadena.then(function () { return cargarScript(src); });
    });
    cadena.then(vigilarProgreso).catch(function (e) {
      alert('No se pudo iniciar el juego: ' + e.message);
    });
  }

  /* ---------------- pantalla de entrada ---------------- */

  var CSS =
    '#ptp-velo{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;' +
    'background:radial-gradient(ellipse at 50% 28%,#12235c 0%,#050b22 55%,#02040d 100%);' +
    "font-family:'Aldrich','Trebuchet MS',system-ui,sans-serif;color:#e8ecff;padding:24px;overflow-y:auto}" +
    '#ptp-caja{width:100%;max-width:420px;text-align:center}' +
    '#ptp-eyebrow{font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:#c9a227;margin:0 0 10px}' +
    '#ptp-titulo{font-size:26px;line-height:1.25;margin:0 0 8px;font-weight:400}' +
    '#ptp-sub{font-size:13px;line-height:1.6;color:#93a0cc;margin:0 0 26px}' +
    '#ptp-runas{display:flex;justify-content:center;gap:14px;margin:0 0 28px}' +
    '.ptp-runa{width:40px}' +
    '.ptp-disco{width:34px;height:34px;margin:0 auto 7px;border-radius:50%;' +
    'border:1px solid rgba(201,162,39,.35);background:rgba(255,255,255,.03);' +
    'transition:transform .45s ease,box-shadow .45s ease,background .45s ease}' +
    '.ptp-runa.on .ptp-disco{background:radial-gradient(circle at 35% 30%,#ffe9a8,#c9a227 70%);' +
    'border-color:#ffdf87;box-shadow:0 0 16px rgba(201,162,39,.55);transform:scale(1.08)}' +
    '.ptp-nombre{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:#5a6796}' +
    '.ptp-runa.on .ptp-nombre{color:#c9a227}' +
    '#ptp-form{display:flex;flex-direction:column;gap:12px;text-align:left}' +
    '#ptp-form label{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8290bd;' +
    'margin-bottom:5px;display:block}' +
    '#ptp-form select,#ptp-form input{width:100%;padding:12px 13px;font:inherit;font-size:15px;' +
    'color:#e8ecff;background:rgba(255,255,255,.05);border:1px solid rgba(201,162,39,.3);' +
    'border-radius:3px;appearance:none;box-sizing:border-box}' +
    '#ptp-form select:focus,#ptp-form input:focus{outline:2px solid #c9a227;outline-offset:2px}' +
    '#ptp-form select option{background:#0b1636;color:#e8ecff}' +
    '#ptp-entrar{margin-top:10px;width:100%;padding:14px;font:inherit;font-size:14px;letter-spacing:.16em;' +
    'text-transform:uppercase;color:#0a1330;background:linear-gradient(180deg,#f0d27a,#c9a227);' +
    'border:0;border-radius:3px;cursor:pointer;transition:filter .2s ease}' +
    '#ptp-entrar:hover:not(:disabled){filter:brightness(1.12)}' +
    '#ptp-entrar:disabled{opacity:.45;cursor:default}' +
    '#ptp-aviso{margin-top:16px;font-size:12px;line-height:1.5;color:#c98d4a;min-height:18px}' +
    '@media (prefers-reduced-motion:reduce){.ptp-disco{transition:none}}';

  function pintarRunas(lista) {
    return CONFIG.ordenRunas.map(function (r) {
      var on = lista && lista.indexOf(r) !== -1;
      return '<div class="ptp-runa' + (on ? ' on' : '') + '">' +
        '<div class="ptp-disco"></div><div class="ptp-nombre">' + r.slice(0, 4) + '</div></div>';
    }).join('');
  }

  function pantalla(roster) {
    var cursos = roster ? Object.keys(roster) : [];
    var manual = cursos.length === 0;

    var campos = manual
      ? '<div><label for="ptp-curso">Curso</label>' +
        '<input id="ptp-curso" placeholder="Ej. 8-1" autocomplete="off"></div>' +
        '<div><label for="ptp-alumno">Tu nombre</label>' +
        '<input id="ptp-alumno" placeholder="Nombre y apellido" autocomplete="off"></div>'
      : '<div><label for="ptp-curso">Curso</label><select id="ptp-curso"></select></div>' +
        '<div><label for="ptp-alumno">Tu nombre</label><select id="ptp-alumno" disabled></select></div>';

    var velo = document.createElement('div');
    velo.id = 'ptp-velo';
    velo.innerHTML =
      '<div id="ptp-caja">' +
      '<p id="ptp-eyebrow">Defenders of Arcanis</p>' +
      '<h1 id="ptp-titulo">The path to Peace</h1>' +
      '<p id="ptp-sub">El Pilar recuerda a quienes lo han sostenido.<br>Identifícate para conservar tu avance.</p>' +
      '<div id="ptp-runas">' + pintarRunas([]) + '</div>' +
      '<div id="ptp-form">' + campos +
      '<button id="ptp-entrar"' + (manual ? '' : ' disabled') + '>Entrar al templo</button></div>' +
      '<p id="ptp-aviso"></p>' +
      '</div>';
    document.body.appendChild(velo);

    var cCurso = velo.querySelector('#ptp-curso');
    var cAlumno = velo.querySelector('#ptp-alumno');
    var btn = velo.querySelector('#ptp-entrar');
    var aviso = velo.querySelector('#ptp-aviso');
    var fase = 'identificar';

    if (!manual) {
      cCurso.innerHTML = '<option value="">Elige tu curso</option>' +
        cursos.map(function (c) { return '<option>' + c + '</option>'; }).join('');

      cCurso.addEventListener('change', function () {
        var lista = roster[cCurso.value] || [];
        cAlumno.innerHTML = '<option value="">Elige tu nombre</option>' +
          lista.map(function (n) { return '<option>' + n + '</option>'; }).join('');
        cAlumno.disabled = !lista.length;
        btn.disabled = true;
      });
      cAlumno.addEventListener('change', function () { btn.disabled = !cAlumno.value; });

      // Si ya jugó en este equipo, lo dejamos preseleccionado.
      var recordado = null;
      try { recordado = JSON.parse(leerLocal(K_ALUMNO)); } catch (e) { }
      if (recordado && roster[recordado.curso] &&
          roster[recordado.curso].indexOf(recordado.nombre) !== -1) {
        cCurso.value = recordado.curso;
        cCurso.dispatchEvent(new Event('change'));
        cAlumno.value = recordado.nombre;
        btn.disabled = false;
      }
    }

    btn.addEventListener('click', function () {
      if (fase === 'jugar') { velo.remove(); iniciarJuego(); return; }

      var curso = (cCurso.value || '').trim();
      var nombre = (cAlumno.value || '').trim();
      if (!curso || !nombre) {
        aviso.textContent = 'Elige tu curso y tu nombre para continuar.';
        return;
      }

      alumno = { curso: curso, nombre: nombre, id: normalizar(curso) + '__' + normalizar(nombre) };
      escribirLocal(K_ALUMNO, JSON.stringify(alumno));
      btn.disabled = true;
      btn.textContent = 'Recuperando tu avance…';
      aviso.textContent = '';

      recuperar(alumno.id).then(function (nube) {
        try { progreso = JSON.parse(leerLocal(K_PROGRESO)) || progreso; } catch (e) { }

        if (nube && nube.runas && nube.runas.length >= progreso.runas.length) {
          restaurarInstantanea(nube.estado);
          progreso = {
            escena: nube.escena || 1,
            runas: nube.runas || [],
            completado: !!nube.completado
          };
        }
        escribirLocal(K_PROGRESO, JSON.stringify(progreso));
        velo.querySelector('#ptp-runas').innerHTML = pintarRunas(progreso.runas);

        if (progreso.runas.length) {
          aviso.style.color = '#8fbf8a';
          aviso.textContent = 'Recuperamos ' + progreso.runas.length +
            (progreso.runas.length === 1 ? ' runa' : ' runas') + ' de tu última sesión.';
        }
        fase = 'jugar';
        btn.disabled = false;
        btn.textContent = progreso.runas.length ? 'Continuar tu misión' : 'Comenzar';
      }).catch(function () {
        aviso.textContent = 'Sin conexión con el servidor. Puedes jugar: tu avance se guardará en este equipo.';
        fase = 'jugar';
        btn.disabled = false;
        btn.textContent = 'Comenzar';
      });
    });
  }

  function recuperar(id) {
    if (!CONFIG.endpoint) return Promise.resolve(null);
    return jsonp(CONFIG.endpoint + '?action=cargar&id=' + encodeURIComponent(id))
      .then(function (r) { return r && r.ok ? r : null; });
  }

  /* ---------------- inicio ---------------- */

  var estilo = document.createElement('style');
  estilo.textContent = CSS;
  document.head.appendChild(estilo);

  fetch(CONFIG.roster, { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(pantalla)
    .catch(function () { pantalla(null); });
})();
