// Batería de comprobaciones para Gestor PE
const fs = require('fs');
const FILE = process.argv[2] || 'index.html';
const h = fs.readFileSync(FILE, 'utf8');

let PASS = 0, FAIL = 0, WARN = 0;
const fails = [], warns = [];
function ok(n, extra) { PASS++; console.log('  ✅ ' + n + (extra ? '  → ' + extra : '')); }
function ko(n, extra) { FAIL++; fails.push(n); console.log('  ❌ ' + n + (extra ? '  → ' + extra : '')); }
function wa(n, extra) { WARN++; warns.push(n); console.log('  ⚠️  ' + n + (extra ? '  → ' + extra : '')); }
function t(n, cond, extra) { cond ? ok(n, extra) : ko(n, extra); }
function sec(s) { console.log('\n\x1b[1m── ' + s + ' ' + '─'.repeat(Math.max(0, 62 - s.length)) + '\x1b[0m'); }

// ═══════════ 1. SINTAXIS ═══════════
sec('1. Sintaxis');
const blocks = [...h.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const js = blocks.join('\n;\n');
fs.writeFileSync('/tmp/_main.js', js);
try {
  require('child_process').execSync('node --check /tmp/_main.js', { stdio: 'pipe' });
  ok('JS parsea sin errores', blocks.length + ' bloques inline');
} catch (e) { ko('JS parsea sin errores', String(e.stderr).slice(0, 300)); }

// balance de etiquetas -> solo sobre el HTML real (fuera de <script> y de comentarios)
const htmlOnly = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<!--[\s\S]*?-->/g, '');
const oS = (htmlOnly.match(/<script/g) || []).length, cS = (htmlOnly.match(/<\/script>/g) || []).length;
t('Etiquetas <script> balanceadas', oS === cS, (h.match(/<script[\s\S]*?<\/script>/g) || []).length + ' bloques cerrados');
const oD = (htmlOnly.match(/<div[\s>]/g) || []).length, cD = (htmlOnly.match(/<\/div>/g) || []).length;
let depth = 0, minD = 0;
for (const m of htmlOnly.matchAll(/<div[\s>]|<\/div>/g)) { depth += m[0].startsWith('<div') ? 1 : -1; minD = Math.min(minD, depth); }
t('Etiquetas <div> balanceadas', oD === cD && depth === 0 && minD === 0, oD + ' abren / ' + cD + ' cierran, profundidad final ' + depth);

// ═══════════ 2. EXTRAER CONSTANTES ═══════════
sec('2. Estructuras de datos');
function grab(name) {
  const re = new RegExp('const ' + name + '\\s*=\\s*(\\[[\\s\\S]*?\\n        \\];|\\{[\\s\\S]*?\\};)');
  const m = h.match(re);
  if (!m) { ko('No se encuentra ' + name); return null; }
  try { return eval('(' + m[1].replace(/;$/, '') + ')'); }
  catch (e) { ko('No se puede evaluar ' + name, e.message); return null; }
}
const P = grab('PLANTILLAS_BASE');
const AREAS = grab('AREAS');
const CICLOS = grab('CICLOS');
t('PLANTILLAS_BASE evaluable', !!P, P ? P.length + ' plantillas' : '');
t('AREAS evaluable', !!AREAS, AREAS ? Object.keys(AREAS).length + ' áreas' : '');
t('CICLOS evaluable', !!CICLOS, CICLOS ? Object.keys(CICLOS).join(', ') : '');

if (P && AREAS && CICLOS) {
  // ═══════════ 3. INTEGRIDAD PLANTILLAS ═══════════
  sec('3. Integridad de plantillas');
  const seen = {};
  const dups = [];
  P.forEach(p => { const k = p.ciclo + '|' + p.tipo; if (seen[k]) dups.push(k); seen[k] = (seen[k] || 0) + 1; });
  t('Sin duplicados ciclo+tipo (colisión de ID base_)', dups.length === 0, dups.join(', ') || 'ninguno');

  const badCiclo = P.filter(p => !CICLOS[p.ciclo]);
  t('Todos los ciclos existen en CICLOS', badCiclo.length === 0, badCiclo.map(p => p.nombre + '/' + p.ciclo).join(', ') || 'ok');

  const badTipo = P.filter(p => !AREAS[p.tipo]);
  t('Todos los tipos existen en AREAS', badTipo.length === 0, badTipo.map(p => p.nombre + '/' + p.tipo).join(', ') || 'ok');

  const badLen = P.filter(p => !Array.isArray(p.objetivos) || p.objetivos.length !== 15);
  t('Todas tienen 15 objetivos', badLen.length === 0, badLen.map(p => p.nombre + '/' + p.ciclo + '(' + (p.objetivos ? p.objetivos.length : 0) + ')').join(', ') || 'ok');

  // objetivos bien formados
  const camposMal = [];
  P.forEach(p => p.objetivos.forEach(o => {
    if (typeof o.numero !== 'number') camposMal.push(p.nombre + '/' + p.ciclo + ': numero');
    if (!o.descripcion) camposMal.push(p.nombre + '/' + p.ciclo + ': descripcion');
    if (![1, 2, 3].includes(o.trimestre)) camposMal.push(p.nombre + '/' + p.ciclo + ' O' + o.numero + ': trimestre=' + o.trimestre);
    if (!o.criterio) camposMal.push(p.nombre + '/' + p.ciclo + ' O' + o.numero + ': sin criterio');
    if (!Array.isArray(o.indicadores) || !o.indicadores.length) camposMal.push(p.nombre + '/' + p.ciclo + ' O' + o.numero + ': sin indicadores');
  }));
  t('Objetivos bien formados (numero/desc/trimestre/criterio/indicadores)', camposMal.length === 0, camposMal.slice(0, 5).join(' | ') || 'ok');

  // objetos "basura" colados dentro de objetivos (el bug de DI)
  const basura = [];
  P.forEach(p => p.objetivos.forEach(o => { if (o.nombre || o.tipo || o.ciclo) basura.push(p.nombre + '/' + p.ciclo); }));
  t('Sin plantillas anidadas dentro de objetivos', basura.length === 0, [...new Set(basura)].join(', ') || 'ok');

  // numeración 1..15 correlativa
  const numMal = P.filter(p => JSON.stringify(p.objetivos.map(o => o.numero)) !== JSON.stringify([...Array(15).keys()].map(i => i + 1)));
  t('Numeración 1-15 correlativa', numMal.length === 0, numMal.map(p => p.nombre + '/' + p.ciclo).join(', ') || 'ok');

  // indicadores: 4 por objetivo (convención)
  const indMal = [];
  P.forEach(p => p.objetivos.forEach(o => { if (o.indicadores.length !== 4) indMal.push(p.nombre + '/' + p.ciclo + ' O' + o.numero + '=' + o.indicadores.length); }));
  indMal.length === 0 ? ok('4 indicadores por objetivo', '180 objetivos × 4') : wa('Objetivos que no tienen 4 indicadores', indMal.slice(0, 6).join(', '));

  // reparto por trimestres
  const triMal = [];
  P.forEach(p => {
    const c = { 1: 0, 2: 0, 3: 0 };
    p.objetivos.forEach(o => c[o.trimestre]++);
    if (c[1] === 0 || c[2] === 0 || c[3] === 0) triMal.push(p.nombre + '/' + p.ciclo + ' T1=' + c[1] + ' T2=' + c[2] + ' T3=' + c[3]);
  });
  t('Todas cubren los 3 trimestres', triMal.length === 0, triMal.join(' | ') || 'ok');

  // nombres consistentes por tipo
  const nombrePorTipo = {};
  P.forEach(p => { (nombrePorTipo[p.tipo] = nombrePorTipo[p.tipo] || new Set()).add(p.nombre); });
  const nombreMal = Object.entries(nombrePorTipo).filter(([k, v]) => v.size > 1);
  t('Nombre consistente para cada tipo de área', nombreMal.length === 0, nombreMal.map(([k, v]) => k + ': ' + [...v].join(' / ')).join(' | ') || 'ok');

  // ═══════════ 4. COBERTURA ═══════════
  sec('4. Cobertura ciclo × área');
  const cic = ['infantil', 'ciclo1', 'ciclo2', 'ciclo3'];
  const tipos = Object.keys(AREAS).filter(k => k !== 'lectoescritura');
  console.log('     ' + 'área'.padEnd(14) + cic.map(c => CICLOS[c].nombre.padEnd(9)).join(''));
  const huecos = [];
  tipos.forEach(tp => {
    const row = cic.map(c => {
      const has = P.some(p => p.tipo === tp && p.ciclo === c);
      // dislexia/discalculia/tdah en infantil no aplican
      const naNoAplica = c === 'infantil' && ['dislexia', 'discalculia', 'tdah'].includes(tp);
      if (!has && !naNoAplica) huecos.push(tp + '/' + c);
      return (has ? '  ✓' : (naNoAplica ? '  ·' : '  ✗')).padEnd(9);
    });
    console.log('     ' + (AREAS[tp].short || tp).padEnd(14) + row.join(''));
  });
  console.log('     (· = no aplica en Infantil)');
  t('Sin huecos de cobertura', huecos.length === 0, huecos.join(', ') || 'ok');

  const lectoOK = /const LECTO\s*=/.test(h);
  t('LECTO (lectoescritura predefinida) existe', lectoOK);

  // ═══════════ 5. CRITERIOS LOMLOE POR CICLO ═══════════
  sec('5. Coherencia de criterios LOMLOE');
  const critPorCiclo = {};
  P.forEach(p => p.objetivos.forEach(o => { (critPorCiclo[p.ciclo] = critPorCiclo[p.ciclo] || new Set()).add(o.criterio); }));
  // Reglas: criterios con .01./.1. -> ciclo1, .02./.2. -> ciclo2, .03./.3. -> ciclo3. Infantil: sin numeración de ciclo.
  const cicloDeCriterio = cr => {
    const m = cr.match(/\.0?([123])[\.\d]/);
    return m ? 'ciclo' + m[1] : null;
  };
  const desalineados = [];
  P.forEach(p => p.objetivos.forEach(o => {
    const c = cicloDeCriterio(o.criterio);
    if (c && c !== p.ciclo) desalineados.push(p.nombre + '/' + p.ciclo + ' O' + o.numero + ' → ' + o.criterio);
  }));
  desalineados.length === 0
    ? ok('Criterios numerados coinciden con el ciclo de la plantilla')
    : wa('Criterios cuyo nº de ciclo no coincide con la plantilla', desalineados.length + ' casos: ' + desalineados.slice(0, 4).join(' | '));

  // Infantil no debe usar criterios de Primaria (EF.0x, LCL.x, MA.x)
  const infantilMal = [];
  P.filter(p => p.ciclo === 'infantil').forEach(p => p.objetivos.forEach(o => {
    if (/^(EF\.0|LCL\.[123]|MA\.[123])/.test(o.criterio)) infantilMal.push(p.nombre + ' O' + o.numero + ' → ' + o.criterio);
  }));
  infantilMal.length === 0
    ? ok('Infantil no usa criterios numerados de Primaria')
    : wa('Plantillas de Infantil con criterios de Primaria', infantilMal.slice(0, 5).join(' | '));
  console.log('     Criterios por ciclo → ' + cic.map(c => c + ':' + (critPorCiclo[c] ? critPorCiclo[c].size : 0)).join('  '));

  // ═══════════ 6. LOS 8 ARREGLOS ═══════════
  sec('6. Verificación de los arreglos aplicados');
  t('#1 DI/ciclo3 con 15 objetivos limpios', P.find(p => p.tipo === 'di' && p.ciclo === 'ciclo3')?.objetivos.length === 15);
  t('#1 TEA/TEL/DI Infantil recuperadas', ['tea', 'tel', 'di'].every(tp => P.some(p => p.tipo === tp && p.ciclo === 'infantil')));
  t('#2 TDAH ciclo3 existe', P.some(p => p.tipo === 'tdah' && p.ciclo === 'ciclo3'));
  t("#3 getCicloDeAlumno devuelve 'infantil'", /if\(c\.includes\('Infantil'\)\)\s*return\s*'infantil'/.test(h));
  t('#3 Infantil ya NO cae en ciclo1', !/c\.includes\('Infantil'\)\)\s*return\s*'ciclo1'/.test(h));
  t('#4 Biblioteca muestra el ciclo en el título', /plantilla-titulo">'\+area\.icon\+' '\+p\.nombre\+' <span[^>]*>· '\+ciclo\.nombre/.test(h));
  t('#4 Modal muestra el ciclo en el título', /modalPlantillaTitulo'\)\.textContent=area\.icon\+' '\+p\.nombre\+' · '\+ciclo\.nombre/.test(h));
  t('#5 asignarPlantilla avisa si el ciclo no coincide (salvo elección explícita)', /Ciclo distinto al del alumno/.test(h) && /const otroCiclo=!!\(p\.ciclo&&p\.ciclo!==cicloAl\)/.test(h));
  t('#6 Filtro de biblioteca se preselecciona', /if\(s==='biblioteca'\)\{if\(alumnoActual/.test(h));
  t('#7 addProg usa getCicloDeAlumno', /const cicloAlumno=getCicloDeAlumno\(a\)/.test(h));
  t('#7 addProg ya no usa a.ciclo||ciclo1', !/const cicloAlumno=a\.ciclo\|\|'ciclo1'/.test(h));
  t('#8 Listener reconstruye plantillas (no merge)', /plantillas=\{\};\s*\n\s*PLANTILLAS_BASE\.forEach/.test(h));
  t('#8 Custom no puede pisar las base', /if\(id\.indexOf\('base_'\)===0\)return/.test(h));

  // ═══════════ 7. FUNCIONES Y REFERENCIAS ═══════════
  sec('7. Funciones y referencias');
  const declaradas = new Set([...h.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
  const enHandlers = new Set([...h.matchAll(/on(?:click|change|input|submit)="([A-Za-z_$][\w$]*)\(/g)].map(m => m[1]));
  const faltan = [...enHandlers].filter(f => !declaradas.has(f));
  t('Todas las funciones de los on*= están declaradas', faltan.length === 0, faltan.join(', ') || declaradas.size + ' funciones declaradas');

  const criticas = ['getCicloDeAlumno', 'asignarPlantilla', 'renderBiblioteca', 'verPlantilla', 'usarPlantilla',
    'abrirModalAddProg', 'addPrograma', 'construirIndiceCriterios', 'generarProgramacion', 'crearAlumno', 'cambiarSeccion'];
  const critFaltan = criticas.filter(f => !declaradas.has(f));
  t('Funciones críticas presentes', critFaltan.length === 0, critFaltan.join(', ') || criticas.length + '/' + criticas.length);

  // IDs referenciados por getElementById que no existen en el HTML
  const ids = new Set([...h.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  // ids creados dinámicamente en JS (div.id = 'x')
  [...h.matchAll(/\.id\s*=\s*'([^']+)'/g)].forEach(m => ids.add(m[1]));
  [...h.matchAll(/\.id\s*=\s*"([^"]+)"/g)].forEach(m => ids.add(m[1]));
  const usados = [...new Set([...h.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]))];
  const idsFaltan = usados.filter(i => !ids.has(i));
  idsFaltan.length === 0
    ? ok('Todos los getElementById tienen su elemento', ids.size + ' ids en el DOM')
    : wa('IDs usados pero no definidos en el HTML', idsFaltan.slice(0, 8).join(', '));

  // ═══════════ 8. SIMULACIÓN FUNCIONAL ═══════════
  sec('8. Simulación: alumno → ciclo → plantillas ofrecidas');
  const getCiclo = a => {
    const c = a.curso || '';
    if (c.includes('Infantil')) return 'infantil';
    if (c.includes('1º') || c.includes('2º')) return 'ciclo1';
    if (c.includes('3º') || c.includes('4º')) return 'ciclo2';
    if (c.includes('5º') || c.includes('6º')) return 'ciclo3';
    return a.ciclo || 'ciclo1';
  };
  const plantillas = {};
  P.forEach(p => { plantillas['base_' + p.ciclo + '_' + p.tipo] = { ...p, esBase: true }; });
  t('Catálogo cargado sin pérdidas', Object.keys(plantillas).length === P.length, Object.keys(plantillas).length + ' ids únicos');

  const cursos = ['Infantil 3 años', 'Infantil 4 años', 'Infantil 5 años', '1º Primaria', '2º Primaria', '3º Primaria', '4º Primaria', '5º Primaria', '6º Primaria'];
  let simOK = true;
  cursos.forEach(curso => {
    const cl = getCiclo({ curso });
    const ofrecidas = Object.values(plantillas).filter(p => p.ciclo === cl);
    const nombres = ofrecidas.map(p => p.nombre);
    const repes = nombres.filter((n, i) => nombres.indexOf(n) !== i);
    const bad = repes.length > 0 || ofrecidas.length === 0;
    if (bad) simOK = false;
    console.log('     ' + (bad ? '❌' : '✓') + ' ' + curso.padEnd(16) + '→ ' + cl.padEnd(9) + ofrecidas.length + ' plantillas, repetidas: ' + (repes.length || 'ninguna'));
  });
  t('Ningún curso ve nombres repetidos en el desplegable', simOK);

  // el aviso de ciclo saltaría correctamente
  const alumno6 = { curso: '6º Primaria', siglas: 'AB' };
  const plInf = plantillas['base_infantil_autonomia'];
  t('Aviso de ciclo saltaría (Autonomía Infantil → alumno de 6º)', plInf.ciclo !== getCiclo(alumno6), plInf.ciclo + ' ≠ ' + getCiclo(alumno6));
  const plC3 = plantillas['base_ciclo3_autonomia'];
  t('Aviso NO saltaría con la plantilla correcta', plC3.ciclo === getCiclo(alumno6), plC3.ciclo + ' = ' + getCiclo(alumno6));

  // índice de criterios
  const indice = {};
  P.forEach(pl => {
    indice[pl.tipo] = indice[pl.tipo] || {};
    indice[pl.tipo][pl.ciclo] = indice[pl.tipo][pl.ciclo] || {};
    pl.objetivos.forEach(o => { if (o.criterio) indice[pl.tipo][pl.ciclo][o.numero] = o.criterio; });
  });
  const huecosIdx = [];
  Object.keys(indice).forEach(tp => Object.keys(indice[tp]).forEach(c => {
    for (let n = 1; n <= 15; n++) if (!indice[tp][c][n]) huecosIdx.push(tp + '/' + c + '/O' + n);
  }));
  t('construirIndiceCriterios() cubre los 180 objetivos', huecosIdx.length === 0, huecosIdx.slice(0, 5).join(', ') || (P.length * 15) + ' criterios indexados');

  // Infantil recibe criterios de Infantil, no de ciclo1
  const critInfAut = indice['autonomia']['infantil'][1];
  const critC1Aut = indice['autonomia']['ciclo1'][1];
  t('Infantil y Ciclo1 tienen criterios DISTINTOS (bug corregido)', critInfAut !== critC1Aut, 'infantil=' + critInfAut + ' | ciclo1=' + critC1Aut);
}

// ═══════════ 9. PWA ═══════════
sec('9. PWA / manifest / SW');
t('Enlace al manifest', /rel="manifest"/.test(h));
t('Registro del service worker', /serviceWorker\.register/.test(h));
t('theme-color definido', /name="theme-color"/.test(h));
try {
  const mf = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/manifest.json', 'utf8'));
  t('manifest.json válido', !!mf.name && !!mf.icons, mf.name + ', ' + mf.icons.length + ' iconos');
} catch (e) { ko('manifest.json válido', e.message); }
const sw = fs.readFileSync('sw.js', 'utf8');

const v = (sw.match(/VERSION\s*=\s*'([^']+)'/) || [])[1];
t('Versión del caché del SW actualizada', v && v !== 'v1', v || 'no encontrada');


// ═══════════ 10. MODO OFFLINE (#3) ═══════════
sec('10. Modo sin conexión (#3)');
const swx = fs.readFileSync('sw.js', 'utf8');
t('SW cachea firebase-app-compat', /firebase-app-compat\.js/.test(swx));
t('SW cachea firebase-database-compat', /firebase-database-compat\.js/.test(swx));
t('SW cachea Chart.js', /chart\.umd\.min\.js/.test(swx));
t('SW cache-first para CDN', /CDN_HOSTS\.includes\(url\.hostname\)/.test(swx));
t('SW no intercepta el socket de RTDB', /firebasedatabase\.app/.test(swx));
t('SW: install tolerante a fallos (no addAll)', !/cache\.addAll/.test(swx) && /\.catch\(\(\) => \{\}\)/.test(swx));
t('Espejo en localStorage: alumnos', /cacheGuardar\('alumnos',alumnos,true\)/.test(h));
t('Espejo en localStorage: grupos', /cacheGuardar\('grupos', grupos, true\)/.test(h));
t('Espejo en localStorage: plantillas', /cacheGuardar\('plantillas',custom,false\)/.test(h));
t('Hidratación desde caché al arrancar', /const cA=cacheLeer\('alumnos',true\); if\(cA\)aplicarAlumnos\(cA\)/.test(h));
t('cursoInit tiene tope de espera (no cuelga sin red)', /Promise\.race\(\[/.test(h) && /limite\(7000\)/.test(h));
t('cursoInit cae a la caché si falla', /cacheLeer\('cursosMeta',false\)/.test(h));
t("Vigilancia de conexión con .info/connected", /db\.ref\('\.info\/connected'\)\.on/.test(h));
t('Barra de aviso offline en el DOM', /id="offlineBar"/.test(h));
t('Aviso al cerrar con cambios sin sincronizar', /beforeunload/.test(h) && /ONLINE===false/.test(h));
t('Punto de estado rojo cuando no hay red', /\.status-dot\.off\{/.test(h));
const claves = [...new Set([...h.matchAll(/cacheGuardar\('([^']+)'/g)].map(m => m[1]))];
ok('Claves espejadas en localStorage', claves.join(', '));

// ═══════════ 11. DIÁLOGOS PROPIOS (#4) ═══════════
sec('11. Diálogos propios (#4)');
const soloCodigo = h.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
const nativos = [...soloCodigo.matchAll(/(?:^|[^.\w$])(confirm|prompt|alert)\(/g)].map(m => m[1]);
t('0 confirm()/prompt()/alert() nativos', nativos.length === 0, nativos.join(', ') || 'todos sustituidos');
['confirmar', 'confirmarBorrado', 'pedirTexto', 'avisar'].forEach(f =>
  t('Existe ' + f + '()', new RegExp('function ' + f + '\\(').test(h)));
t('Modal en el DOM', /id="askOverlay"/.test(h) && /id="askInput"/.test(h));
t('Cierra con Escape y acepta con Enter', /e\.key==='Escape'/.test(h) && /e\.key==='Enter'/.test(h));
t('Cierra al pulsar fuera', /e\.target\.id==='askOverlay'/.test(h));
t('Foco automático al abrir', /\.focus\(\)/.test(h));
t('Accesible (role=dialog + aria-modal)', /role="dialog"/.test(h) && /aria-modal="true"/.test(h));
t('Por encima de modales (1000) y perfil (5000)', /\.ask-overlay\{[^}]*z-index:6000/.test(h));
// toda función con await de diálogo debe ser async
const declRe = /(async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g;
const awaits = [...h.matchAll(/await (confirmar|confirmarBorrado|pedirTexto)\(/g)];
const sinAsync = [];
awaits.forEach(m => {
  let last = null, d;
  const re = new RegExp(declRe.source, 'g');
  while ((d = re.exec(h)) && d.index < m.index) last = d;
  if (last && !last[1]) sinAsync.push(last[2]);
});
t('Todas las funciones con await son async', sinAsync.length === 0, [...new Set(sinAsync)].join(', ') || awaits.length + ' llamadas await verificadas');
const asyncNuevas = ['cambiarPerfil', 'asignarPlantilla', 'eliminarPlantilla', 'eliminarAlumno', 'elimProg', 'crearNuevoCurso', 'eliminarGrupo', 'aciEliminar'];
const noAsync = asyncNuevas.filter(f => !new RegExp('async function ' + f + '\\(').test(h));
t('Funciones clave convertidas a async', noAsync.length === 0, noAsync.join(', ') || asyncNuevas.length + '/' + asyncNuevas.length);


// ═══════════ 12. ADAPTACIÓN DE CICLO ═══════════
sec('12. Plantillas de otros ciclos (adaptación curricular)');
t('Desplegable con optgroup por ciclo', /<optgroup label="/.test(h));
t('Su ciclo va primero y marcado', /✅ Su ciclo · /.test(h));
t('Otros ciclos etiquetados inferior/superior', /⬇️ Ciclo inferior/.test(h) && /⬆️ Ciclo superior/.test(h));
t('Ya NO filtra por ciclo (se ofrecen todas)', !/if\(p\.ciclo===cicloAlumno\)\{const area/.test(h));
t('Vista previa avisa del ciclo distinto', /Ciclo '\+dir\+' al del alumno/.test(h));
t('Elección desde el desplegable = explícita (no repregunta)', /asignarPlantilla\(plantillaId,alumnoActual,\{explicito:true\}\)/.test(h));
t('Biblioteca → "Usar" SIGUE preguntando', /otroCiclo&&!opts\.explicito/.test(h));
t('Se guarda cicloOrigen en el programa', /programa\.cicloOrigen=p\.ciclo/.test(h));
t('Se marca adaptacionCiclo', /programa\.adaptacionCiclo=true/.test(h));
t('Chip de ciclo en la tarjeta del programa', /const chipCiclo=cOrig/.test(h));
t('Chip "Adaptación de ciclo" visible', /Adaptación de ciclo/.test(h));
t('actualizarCriteriosLOMLOE respeta cicloOrigen', /const cicloProg = p\.cicloOrigen \|\| cicloAlumno;/.test(h));
t('repararTodosCriterios respeta cicloOrigen', (h.match(/p\.cicloOrigen \|\| cicloAlumno/g) || []).length >= 2);
t('asignarPlantilla tiene .catch (no falla en silencio)', /toast\('No se pudo guardar','error'\)/.test(h));

// simulación del desplegable
if (P && CICLOS) {
  const plant = {}; P.forEach(p => { plant['base_' + p.ciclo + '_' + p.tipo] = p; });
  const orden = ['infantil', 'ciclo1', 'ciclo2', 'ciclo3'];
  const casos = [['Infantil 5 años', 'infantil'], ['2º Primaria', 'ciclo1'], ['4º Primaria', 'ciclo2'], ['6º Primaria', 'ciclo3']];
  let simOK = true;
  casos.forEach(([curso, cl]) => {
    const suyas = Object.values(plant).filter(p => p.ciclo === cl).length;
    const otras = Object.values(plant).filter(p => p.ciclo !== cl).length;
    const grupos = orden.filter(c => c !== cl).filter(c => Object.values(plant).some(p => p.ciclo === c)).length + (suyas ? 1 : 0);
    if (suyas + otras !== P.length) simOK = false;
    console.log('     ' + curso.padEnd(16) + '→ ' + String(suyas).padStart(2) + ' de su ciclo + ' + String(otras).padStart(2) + ' de otros = ' + (suyas + otras) + ' opciones en ' + grupos + ' grupos');
  });
  t('Todos los alumnos ven las 45 plantillas, agrupadas', simOK);
}


// ═══════════ 12. PROGRAMAS DE OTRO CICLO (adaptación curricular) ═══════════
sec('12. Programas de otro ciclo');
t('Desplegable agrupado por ciclos (optgroup)', /<optgroup label=/.test(h));
t('Grupo "Su ciclo" primero y marcado', /pintaGrupo\('✅ Su ciclo · '\+cn/.test(h));
t('Grupos etiquetados como inferior/superior', /⬇️ Ciclo inferior/.test(h) && /⬆️ Ciclo superior/.test(h));
t('Se ofrecen TODOS los ciclos, no solo el suyo', /orden\.filter\(c=>c!==cicloAlumno\)/.test(h));
t('Sin filtro estricto por ciclo en el desplegable', !/if\(p\.ciclo===cicloAlumno\)\{const area/.test(h));
t('El programa guarda de qué ciclo salió (cicloOrigen)', /programa\.cicloOrigen=p\.ciclo/.test(h));
t('Se marca como adaptación de ciclo', /programa\.adaptacionCiclo=true/.test(h));
t('renderProgs pinta el chip del ciclo', /p\.cicloOrigen\?/.test(h));
t('renderProgs avisa "⚠️ Adaptación de ciclo"', /⚠️ Adaptación de ciclo/.test(h));
t('Elección desde el desplegable = explícita (sin doble pregunta)', /\{explicito:true\}/.test(h));
t('Desde Biblioteca SÍ pregunta', /otroCiclo&&!opts\.explicito/.test(h));
t('repararTodosCriterios respeta cicloOrigen (no destruye la adaptación)',
  (h.match(/const cicloProg = p\.cicloOrigen \|\| cicloAlumno/g) || []).length >= 2);

// simulación del desplegable
if (P && CICLOS) {
  const pl = {}; P.forEach(p => { pl['base_' + p.ciclo + '_' + p.tipo] = p; });
  const orden = ['infantil', 'ciclo1', 'ciclo2', 'ciclo3'];
  [['Infantil 5 años','infantil'], ['2º Primaria','ciclo1'], ['6º Primaria','ciclo3']].forEach(([curso, cl]) => {
    const suyas = Object.keys(pl).filter(i => pl[i].ciclo === cl).length;
    const otras = orden.filter(c => c !== cl).map(c => {
      const n = Object.keys(pl).filter(i => pl[i].ciclo === c).length;
      const pos = orden.indexOf(c) < orden.indexOf(cl) ? '⬇️ inferior' : '⬆️ superior';
      return (CICLOS[c].nombre) + ' (' + pos + '): ' + n;
    });
    console.log('     ' + curso.padEnd(16) + '→ ✅ Su ciclo: ' + suyas + '  |  ' + otras.join('  ·  '));
  });
  const total = Object.keys(pl).length;
  t('Todas las plantillas alcanzables desde cualquier curso', total === 45, total + ' plantillas ofrecidas siempre');
}


// ═══════════ 13. DUPLICADOS DE FIREBASE ═══════════
sec('13. Deduplicación de plantillas');
t('Existe _firmaPlantilla()', /function _firmaPlantilla\(p\)/.test(h));
t('Existe plantillasUnicas()', /function plantillasUnicas\(\)/.test(h));
t('Existe plantillasDuplicadas()', /function plantillasDuplicadas\(\)/.test(h));
t('La firma incluye tipo+ciclo+nombre+objetivos', /\[p\.tipo,p\.ciclo,\(p\.nombre\|\|''\)\.trim\(\)\.toLowerCase\(\)/.test(h));
t('La plantilla BASE gana ante una copia', /p\.esBase && !porFirma\[f\]\.p\.esBase/.test(h));
t('Las base nunca se marcan para borrar', /filter\(id=>plantillas\[id\]\.esBase\)/.test(h));
t('El desplegable usa plantillasUnicas()', /const unicas=plantillasUnicas\(\)/.test(h));
t('La Biblioteca usa plantillasUnicas()', /const lista=plantillasUnicas\(\)/.test(h));
t('Cada opción indica el ciclo', /txt=area\.icon\+' '\+p\.nombre\+' · '\+cic/.test(h));
t('Las propias se marcan como ✏️ personalizada', /✏️ personalizada/.test(h));
t('Desempate por nº de objetivos si coincide el nombre', /txt\+=' \('\+nObj\+' obj\.\)'/.test(h));
t('Grupo para plantillas sin ciclo válido', /❓ Sin ciclo asignado/.test(h));
t('Badge ✏️ PROPIA en la Biblioteca', /✏️ PROPIA/.test(h));
t('Barra de aviso de duplicados en el DOM', /id="avisoDuplicados"/.test(h));
t('Botón de limpieza', /function limpiarPlantillasDuplicadas\(\)/.test(h) && /onclick="limpiarPlantillasDuplicadas\(\)"/.test(h));
t('El borrado va por update() con nulls (atómico)', /updates\[ROOT\+'\/plantillas\/'\+id\]=null/.test(h));
t('El borrado tiene manejo de errores', /catch\(e\)\{[\s\S]{0,120}No se pudo limpiar/.test(h));

// simulación con Firebase sucio
if (P) {
  const firma = p => [p.tipo, p.ciclo, (p.nombre || '').trim().toLowerCase(),
    JSON.stringify((p.objetivos || []).map(o => [o.numero, o.descripcion, o.criterio]))].join('|');
  const pl = {};
  P.forEach(p => { pl['base_' + p.ciclo + '_' + p.tipo] = { ...p, esBase: true }; });
  let n = 0;
  for (let s = 0; s < 3; s++) P.forEach(p => { pl['pl_' + (n++)] = JSON.parse(JSON.stringify(p)); });
  pl['pl_propia'] = { nombre: 'Autonomía Personal', ciclo: 'infantil', tipo: 'autonomia', objetivos: P[0].objetivos.slice(0, 8) };
  const m = {};
  Object.keys(pl).forEach(id => { const p = pl[id], f = firma(p); if (!m[f] || (p.esBase && !m[f].p.esBase)) m[f] = { id, p }; });
  const unicas = Object.values(m);
  const v = {}, sobran = [];
  Object.keys(pl).filter(i => pl[i].esBase).forEach(i => v[firma(pl[i])] = true);
  Object.keys(pl).filter(i => !pl[i].esBase).forEach(i => { const f = firma(pl[i]); if (v[f]) sobran.push(i); else v[f] = true; });
  console.log('     Firebase sucio simulado: ' + Object.keys(pl).length + ' plantillas (45 base + 135 copias + 1 propia)');
  t('Se muestran 46 (45 base + 1 propia real)', unicas.length === 46, unicas.length + ' únicas');
  t('Se detectan las 135 copias', sobran.length === 135, sobran.length + ' a borrar');
  t('Ninguna base marcada para borrar', !sobran.some(i => pl[i].esBase));
  t('La plantilla propia real se conserva', unicas.some(x => x.id === 'pl_propia'));
}


// ═══════════ 14. CUADERNOS GEU ═══════════
sec('14. Cuadernos GEU');
t('Núcleo con modelo de ancla', /function geuNorm\(valor, primeraSesion\)/.test(h) && /ancla:/.test(h));
t('geuActivos() normaliza', /function geuActivos\(a\)/.test(h));
t('geuSesionesEntre cuenta [ancla, k)', /for\(let x = i; x < j; x\+\+\)/.test(h));
t('geuProyectar aplica el ritmo', /item\.est\.ficha \+ n \* \(item\.est\.ritmo \|\| 1\)/.test(h));
t('El avance reancla en la sesión actual', /const est = \{ ficha: f\.fichaEsperada, ancla: k, ritmo: f\.ritmo \|\| 1 \}/.test(h));
t('geuCambiarFicha reancla', /const est=\{ficha:f, ancla:geuSesionHoy\(a\), ritmo:prev\.ritmo\|\|1\}/.test(h));
t('Ya NO se guarda un número suelto', !/db\.ref\(PA\+'\/'\+alumId\+'\/geu\/'\+nivelId\)\.set\(f\)/.test(h));
t('Encadena al siguiente cuaderno', /function geuProponerSiguiente/.test(h) && /function geuSiguienteNivel/.test(h));
t('Avisa al completar la colección', /Colección completada/.test(h));
t('Migración automática de datos antiguos', /function geuMigrarLegacy/.test(h) && /_geuMigrado/.test(h));
t('Legacy se ancla a HOY, no al inicio de curso', /const hoy = geuSesionHoy\(a\);[\s\S]{0,200}geuNorm\(geu\[nv\.id\], hoy\)/.test(h));
t('Nº de fichas editable por el usuario', /function geuEditarFichas/.test(h) && /ROOT\+'\/geuFichas\/'\+nivelId/.test(h));
t('geuNumFichas() usa el valor real si existe', /function geuNumFichas\(nv\)/.test(h));
t('Se marca cuáles son estimados', /function geuFichasEsEstimado/.test(h) && /≈ estimado/.test(h));
t('geuFichas se sincroniza y cachea', /_refGeuFichas=db\.ref\(ROOT\+'\/geuFichas'\)/.test(h) && /cacheGuardar\('geuFichas'/.test(h));
t('geuCambiarFicha tiene .catch()', /No se pudo guardar la ficha/.test(h));
t('geuGuardarConfig tiene .catch()', /No se pudo guardar: '\+\(e\.message/.test(h));
t('Ficha de inicio configurable al activar', /parseInt\(el\.dataset\.ini \|\| '1', 10\)/.test(h));
const restos = (h.match(/nv\.fichas/g) || []).length;
t('Sin lecturas directas de nv.fichas fuera del núcleo', restos <= 1, restos + ' ocurrencia(s) (1 = dentro de geuNumFichas)');

// motor de avance: simulación
(function(){
  const NV = { fichas: 30 };
  const ses = []; for (let i = 1; i <= 40; i++) ses.push('s' + i);
  let aus = {};
  const entre = (kD, kH) => { let i = ses.indexOf(kD), j = ses.indexOf(kH); if (j < 0) return null; if (i < 0) i = 0; if (j <= i) return 0; let n = 0; for (let x = i; x < j; x++) if (!aus[ses[x]]) n++; return n; };
  const proy = (e, k) => { const n = entre(e.ancla, k); const b = e.ficha + n * (e.ritmo || 1); return { ficha: Math.min(b, NV.fichas), bruta: b, completado: b > NV.fichas }; };
  let e = { ficha: 1, ancla: 's1', ritmo: 1 }, sinDeriva = true;
  for (let i = 1; i <= 12; i++) { const k = 's' + i; const prop = Math.min(proy(e, k).bruta, 31); if (prop !== i) sinDeriva = false; e = { ficha: prop, ancla: k, ritmo: 1 }; }
  t('Motor: sesión N → ficha N, sin deriva', sinDeriva, 's12 → ficha ' + e.ficha + ' (el motor viejo daba 29 en s8)');
  aus = { s3: 1, s4: 1, s7: 1 }; e = { ficha: 1, ancla: 's1', ritmo: 1 };
  let okAus = true;
  for (let i = 1; i <= 10; i++) { let c = 0; for (let x = 1; x < i; x++) if (!aus['s' + x]) c++; if (proy(e, 's' + i).ficha !== 1 + c) okAus = false; }
  t('Motor: las ausencias no consumen fichas', okAus);
  aus = {}; e = { ficha: 20, ancla: 's20', ritmo: 1 };
  t('Motor: sesión pasada correcta', proy(e, 's20').ficha === 20 && proy(e, 's25').ficha === 25);
  e = { ficha: 1, ancla: 's1', ritmo: 2 };
  t('Motor: ritmo 2 fichas/sesión', proy(e, 's5').ficha === 9, 's5 → ficha ' + proy(e, 's5').ficha);
  e = { ficha: 29, ancla: 's1', ritmo: 1 };
  t('Motor: detecta cuaderno completado', proy(e, 's3').completado);
  const a1 = proy({ ficha: 7, ancla: 's10', ritmo: 1 }, 's15').bruta;
  const a2 = proy({ ficha: a1, ancla: 's15', ritmo: 1 }, 's15').bruta;
  t('Motor: idempotente al reanclar', a1 === a2, a1 + ' = ' + a2);
})();

// catálogo GEU
const Gm = h.match(/const GEU_COLECCIONES = (\[[\s\S]*?\n        \];)/);
if (Gm) {
  const G = eval(Gm[1].replace(/;$/, ''));
  t('2 colecciones', G.length === 2, G.map(c => c.nombre + ' (' + c.niveles.length + ')').join(', '));
  const ids = G.flatMap(c => c.niveles.map(n => n.id));
  t('IDs de nivel únicos', new Set(ids).size === ids.length, ids.length + ' niveles');
  t('Todos los niveles tienen contenidos', G.every(c => c.niveles.every(n => n.contenidos && n.contenidos.length > 20)));
  G.forEach(c => {
    const v = [...new Set(c.niveles.map(n => n.fichas))];
    if (v.length === 1) wa('Fichas uniformes en ' + c.nombre, 'todos los niveles con ' + v[0] + ' → estimación, editable en la app');
    else ok('Fichas variadas en ' + c.nombre, v.join(', '));
  });
  const sinInf = G.filter(c => !c.niveles.some(n => n.curso === 'Infantil'));
  if (sinInf.length) wa('Colecciones sin nivel de Infantil', sinInf.map(c => c.nombre).join(', '));
  else ok('Todas las colecciones cubren Infantil');
}

// ═══════════ RESUMEN ═══════════
console.log('\n' + '═'.repeat(66));
console.log('  ' + PASS + ' OK   ·   ' + FAIL + ' FALLOS   ·   ' + WARN + ' AVISOS');
if (fails.length) console.log('\n  FALLOS:\n' + fails.map(f => '    ✗ ' + f).join('\n'));
if (warns.length) console.log('\n  AVISOS:\n' + warns.map(f => '    ! ' + f).join('\n'));
console.log('═'.repeat(66));
process.exit(FAIL ? 1 : 0);
