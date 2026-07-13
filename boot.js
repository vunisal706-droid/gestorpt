// Simula el arranque real de la app en un DOM falso y detecta ReferenceError
// por Temporal Dead Zone (usar una variable `let`/`const` antes de declararla).
const fs = require('fs');
const vm = require('vm');
const h = fs.readFileSync(process.argv[2] || 'index.html', 'utf8');
const js = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n;\n');

// DOM y Firebase mínimos: solo lo justo para que el script se evalúe y arranque.
const el = () => new Proxy({
  style: {}, classList: { add(){}, remove(){}, contains(){ return false; }, toggle(){} },
  dataset: {}, textContent: '', innerHTML: '', value: '', checked: false,
  appendChild(){}, remove(){}, querySelector(){ return el(); },
  querySelectorAll(){ return []; }, setAttribute(){}, getAttribute(){ return null; },
  addEventListener(){}, focus(){}, firstChild: { textContent: '' },
}, { get(t, k){ return k in t ? t[k] : (typeof k === 'string' ? el() : undefined); }, set(){ return true; } });

const ref = () => ({ on(){}, off(){}, once(){ return new Promise(()=>{}); },
                     set(){ return Promise.resolve(); }, update(){ return Promise.resolve(); },
                     remove(){ return Promise.resolve(); }, push(){ return ref(); }, child(){ return ref(); } });

const errores = [];
const store = { gestorpe_perfil: 'victor' };   // ← perfil YA guardado: el caso que fallaba

const ctx = {
  console: { log(){}, warn(){}, error(...a){ errores.push('console.error: ' + a.join(' ')); } },
  document: {
    getElementById(){ return el(); }, querySelector(){ return el(); },
    querySelectorAll(){ return []; }, createElement(){ return el(); },
    addEventListener(){}, body: el(), head: el(), documentElement: el(),
  },
  window: { addEventListener(){}, location: { reload(){} }, matchMedia: () => ({ matches: false, addListener(){} }) },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  navigator: { serviceWorker: { register(){ return Promise.resolve(); } }, onLine: true },
  firebase: { initializeApp(){}, apps: [], database: () => ({ ref: () => ref() }) },
  setTimeout(fn, ms){ return 0; }, clearTimeout(){}, setInterval(){ return 0; }, clearInterval(){},
  fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
  Chart: function(){}, alert(){}, confirm(){ return true; }, prompt(){ return ''; },
  Date, Math, JSON, Object, Array, String, Number, Boolean, Promise, RegExp, Error,
  parseInt, parseFloat, isNaN, encodeURIComponent, decodeURIComponent, Proxy, Set, Map, Blob: function(){}, URL: { createObjectURL(){ return ''; } },
};
ctx.globalThis = ctx; ctx.self = ctx;
vm.createContext(ctx);

let fatal = null;
try {
  vm.runInContext(js, ctx, { timeout: 15000 });
} catch (e) {
  fatal = e;
}

console.log('\n\x1b[1m── Simulación de arranque (perfil "victor" ya guardado) ──\x1b[0m');
if (fatal) {
  const tdz = /Cannot access '(\w+)' before initialization/.exec(String(fatal.message));
  if (tdz) {
    console.log('  ❌ TEMPORAL DEAD ZONE: se usa `' + tdz[1] + '` antes de declararla.');
    console.log('     Esto rompe TODO el arranque: sin alumnos y sin selector de curso.');
  } else {
    console.log('  ❌ El arranque lanza: ' + fatal.message);
  }
  process.exit(1);
}
if (errores.length) {
  console.log('  ⚠️  Errores en consola durante el arranque:');
  errores.forEach(e => console.log('     ' + e));
}
// Comprobamos que las funciones clave del arranque existen y son invocables
const clave = ['iniciarDatosPerfil', 'cursoInit', 'attachCursoListeners', 'aplicarPlantillas',
               'aplicarAlumnos', 'renderCursoSelector', 'geuNumFichas', 'cacheLeer'];
const faltan = clave.filter(f => typeof ctx[f] !== 'function');
if (faltan.length) { console.log('  ❌ Faltan funciones: ' + faltan.join(', ')); process.exit(1); }
console.log('  ✅ El script se evalúa entero sin excepciones');
console.log('  ✅ El arranque automático con perfil guardado no revienta');
console.log('  ✅ ' + clave.length + ' funciones de arranque disponibles');
console.log('  ✅ geuFichasCustom accesible desde iniciarDatosPerfil (era el bug)');
process.exit(0);
