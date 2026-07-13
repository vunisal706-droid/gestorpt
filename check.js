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
  t('#5 asignarPlantilla avisa si el ciclo no coincide', /Ciclo no coincidente/.test(h) && /if\(p\.ciclo&&p\.ciclo!==cicloAl\)/.test(h));
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
const ver = (sw.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1];
ver === 'gestor-pe-v1'
  ? wa('Versión del caché del SW', "sigue en '" + ver + "' → súbela a v2 para forzar la actualización")
  : ok('Versión del caché del SW', ver);

// ═══════════ RESUMEN ═══════════
console.log('\n' + '═'.repeat(66));
console.log('  ' + PASS + ' OK   ·   ' + FAIL + ' FALLOS   ·   ' + WARN + ' AVISOS');
if (fails.length) console.log('\n  FALLOS:\n' + fails.map(f => '    ✗ ' + f).join('\n'));
if (warns.length) console.log('\n  AVISOS:\n' + warns.map(f => '    ! ' + f).join('\n'));
console.log('═'.repeat(66));
process.exit(FAIL ? 1 : 0);
