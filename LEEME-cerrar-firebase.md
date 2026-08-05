# Cerrar Gestor PE · guía paso a paso

Solo afecta al proyecto **`gestorpt`**. Los otros ocho se quedan como están.

**Regla de oro:** los pasos van en este orden. Si cambias las reglas antes de
subir los archivos, la app dejará de funcionar hasta que los subas.

---

## Paso 0 · Copia de seguridad (2 minutos)

Consola de Firebase → proyecto **gestorpt** → Realtime Database → Datos →
los tres puntos de arriba a la derecha → **Exportar JSON**. Guárdalo.

Y copia tus reglas actuales en un archivo de texto, para poder volver atrás.

---

## Paso 1 · Activar la sesión anónima en Firebase

Consola de Firebase → proyecto **gestorpt** → **Authentication**.

1. Si nunca lo has usado, pulsa **Comenzar**.
2. Pestaña **Sign-in method** (Método de acceso).
3. Busca **Anónimo** en la lista, ábrelo, **Habilitar**, y **Guardar**.

Sin este paso, lo demás no funciona.

---

## Paso 2 · Subir los dos archivos

A la carpeta donde tengas alojada la app Gestor PE:

- `index.html`
- `sw.js`

Son los tuyos: solo he añadido una etiqueta de script y un bloque de veinte
líneas. Todo lo demás está intacto.

---

## Paso 3 · Comprobar que sigue funcionando (importante)

**Antes de tocar las reglas.** Abre la app y:

1. Pulsa **F12 → pestaña Consola**.
2. Recarga con Ctrl+F5.
3. Debe aparecer: `[GestorPE] Sesión iniciada`

Si aparece eso, todo listo. Si sale `Sesión anónima no disponible`, vuelve al
paso 1: el método anónimo no está habilitado.

Prueba también a entrar con tu contraseña y ver los alumnos de un perfil.
Todo debe ir exactamente igual que antes.

**Si algo va mal, para aquí.** No cambies las reglas y avísame. La app sigue
funcionando como siempre porque las reglas todavía están abiertas.

---

## Paso 4 · Cerrar las reglas

Solo cuando el paso 3 haya salido bien.

Realtime Database → **Reglas** → sustituye todo por esto:

```json
{
  "rules": {
    "gestorpe": {
      "alumnos":    { ".read": "auth != null", ".write": "auth != null" },
      "plantillas": { ".read": "auth != null", ".write": "auth != null" },
      "grupos":     { ".read": "auth != null", ".write": "auth != null" },
      "aci":        { ".read": "auth != null", ".write": "auth != null" },
      "config":     { ".read": "auth != null", ".write": "auth != null" },
      "cursos":     { ".read": "auth != null", ".write": "auth != null" }
    },
    "gestorpe_encarna": {
      "alumnos":    { ".read": "auth != null", ".write": "auth != null" },
      "plantillas": { ".read": "auth != null", ".write": "auth != null" },
      "grupos":     { ".read": "auth != null", ".write": "auth != null" },
      "aci":        { ".read": "auth != null", ".write": "auth != null" },
      "config":     { ".read": "auth != null", ".write": "auth != null" },
      "cursos":     { ".read": "auth != null", ".write": "auth != null" }
    }
  }
}
```

**Publicar.** Los cambios tardan unos segundos en aplicarse.

---

## Paso 5 · Comprobar que ha funcionado

**a) La app sigue yendo.** Recarga y entra. Todo normal.

**b) Desde fuera ya no se ve.** Abre esta dirección en el navegador:

```
https://gestorpt-7946b-default-rtdb.europe-west1.firebasedatabase.app/gestorpe.json
```

Antes te devolvía todos los datos. Ahora debe decir **`"error": "Permission denied"`**.

Ese es el momento en que sabes que ha funcionado.

---

## Si algo falla

Vuelve a poner las reglas antiguas y todo regresa a como estaba:

```json
{
  "rules": {
    "gestorpe":        { ".read": true, ".write": true },
    "gestorpe_encarna":{ ".read": true, ".write": true }
  }
}
```

Y avísame con lo que diga la consola del navegador.

---

## Qué cambia para quien usa la app

**Nada.** No hay pantalla nueva, no hay que registrarse, las contraseñas de
siempre siguen igual y sigue funcionando sin conexión: la sesión anónima queda
guardada en el propio dispositivo.

Lo único que cambia es que Firebase ya distingue entre "una petición de la app"
y "alguien escribiendo la URL en el navegador".

---

## Un apunte honesto sobre el alcance

Esto cierra la puerta que estaba abierta de par en par, que es lo que importaba.
No es una fortaleza: alguien con conocimientos podría crear una sesión anónima
por su cuenta.

Para cerrarlo del todo haría falta **App Check**, que restringe el acceso a tus
propios dominios. Se puede hacer más adelante, pero requiere más configuración
y no es urgente. Con esto ya no estás expuesto a que cualquiera copie una URL
y descargue o borre los datos.
