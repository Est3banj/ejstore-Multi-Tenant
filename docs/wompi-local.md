# Wompi Colombia opcional por tenant — implementación local

Fecha: **2026-11-25**. Rama `feature/landing-page`, HEAD al inicio
`45c2ba19599d6dca361e1d27ecc5257f3c367f20`.

Estado: **selección Wompi sobre HEAD verificada, GO para revisión de ese patch;
working tree completo todavía NO-GO** por dirty previo incompatible. **Sin activar Wompi,
sin credenciales reales, sin llamadas al API de Wompi, sin webhook registrado,
sin build/deploy/commit/push y sin cambios de infraestructura.** La consulta web
se limitó a documentación pública. Engram no estaba disponible; este documento
deja decisiones y resumen de continuidad en la convención existente `docs/`.
Se revisaron el registry de skills y los artefactos existentes de API, auth y
secretos; no había un cambio SDD específico de Wompi y no se inventaron artefactos.

## Decisiones y contrato

- **Un comercio propio por tenant.** No hay cuenta de plataforma, credenciales
  globales de fallback, reparto de fondos ni supuesto de subcomercios. Ausencia,
  deshabilitación o configuración incompleta oculta la nueva opción. QR/BRE-B
  continúa disponible, con sus recargas legacy sin campo `provider`.
- **Autorización:** los cuatro callables nuevos requieren Firebase Bearer.
  `saveWompiConfig` y `getWompiConfig` resuelven el tenant del claim de admin;
  superadmin debe indicar explícitamente el tenant seleccionado. No hay lectura
  de secretos desde el navegador. El GET de configuración devuelve sólo
  `enabled`, `configured`, `environment` y `publicKey`.
- **Titular:** `getUserRole` consulta claims de Auth en el servidor. Wompi exige
  un claim `tenantId` válido y un perfil propio coincidente; acepta roles
  `client`/`customer` y `reseller`. No toma la tienda del payload ni de la URL
  como autoridad. Los customers con tenant sólo en su documento mutable o sin
  claims continúan usando QR: no se hace backfill ni migración automática.
- **Almacenamiento privado:** `tenants/{tenantId}/secrets/wompi`, más versiones
  inmutables `secrets/wompi_{uuid}`. Guarda `publicKey`, `privateKey`,
  `integritySecret` y `eventsSecret`, con prefijos y ambiente coherentes. Las
  cuatro credenciales deben pertenecer al MISMO comercio; los prefijos validan
  ambiente, no prueban por sí solos la identidad del comercio. La verificación
  efectiva con credenciales reales queda para una etapa autorizada.
- **Rotación:** cada guardado crea una versión; el intento referencia la versión
  con la que se creó. Deshabilitar bloquea nuevos intentos, pero permite liquidar
  y retomar pagos ya iniciados, sólo por su dueño. La disponibilidad de un intento
  usa su versión congelada, aunque el comercio cambie de ambiente o se deshabilite.
  No elimina versiones ni registros financieros.
- **Intento autoritativo:** `wompi_intents/{reference}` conserva tenant, titular,
  colección beneficiaria, COP, importe en centavos, ambiente, llave pública y
  versión de configuración. Referencia aleatoria de 192 bits generada en server.
  `recharges/{reference}` es el registro visible, con `provider: 'wompi'`.
  Ningún secreto se copia a ese registro ni al documento público del tenant.
- **Creación/idempotencia:** `createWompiCheckout` reutiliza los límites exactos
  de recargas (`RECHARGE_MIN`/`RECHARGE_MAX`), valida enteros seguros y multiplica
  por 100 para COP. Requiere idempotency key; `wompi_requests/{sha256(uid:key)}`
  y el lock existente `recharge_locks/{uid}` serializan el alta. QR pendiente
  bloquea Wompi y viceversa. La consulta legacy se hace fuera de la transacción,
  como QR; hacerla dentro produjo un conflicto real de locks en el emulador y
  se corrigió. Retomar acepta sólo un intento pendiente propio por ID, sin
  importe ni beneficiario del navegador. Replay de una clave con otro importe
  o de un intento finalizado falla.
- **Checkout:** enlace a `https://checkout.wompi.co/p/` con los cinco parámetros
  oficiales y firma SHA256 server-side. Es Web Checkout sin SDK, widget, script,
  iframe ni nueva dependencia. Usa nueva pestaña con `noopener noreferrer`; la
  URL se valida también en frontend. No cambia CSP. Una política de navegación
  impuesta fuera del repo deberá verificarse en la futura prueba de dominio;
  no requiere agregar permisos `script-src`/`frame-src` de Widget.
- **Browser:** ni retorno, querystring, callback ni botón de admin acredita saldo.
  El historial y el modal permiten retomar; al volver a la pestaña se conserva
  el refetch existente. Cambios de tenant/importe descartan respuestas tardías.
  En la selección limpia el modal de HEAD ofrece el checkout nuevo y el historial
  permite retomar/refetch; la vista adicional de pending del modal pertenece al
  dirty anterior y no se incorporó completa al patch.
- **Dos sesiones:** configuración Wompi usa `customAdminCallable`; checkout usa
  cliente o panel explícito para reseller, sin fallback de una sesión a otra.
  Los wrappers de historial/verificación aceptan `panel` booleano (default cliente).
  Un fallo de disponibilidad muestra un error aislado y persistente al editar
  importe; no presenta el fallo como configuración deshabilitada ni bloquea QR.

## Webhook y acreditación

Rutas públicas explícitas, fuera del dispatcher autenticado:

```text
POST /api/wompi/events/test
POST /api/wompi/events/prod
```

1. El cuerpo es el evento oficial, **sin** envelope `{data: ...}` de callable.
   La referencia sirve para buscar el intento privado; nunca se acepta un
   tenant del evento, URL o querystring para seleccionar credenciales.
2. Verifica evento `transaction.updated`, ambiente esperado y checksum sobre
   valores de `signature.properties`, en su orden, más `timestamp` y secreto
   de eventos. Extracción mediante propiedades propias, sin claves de prototipo,
   sólo paths acotados de `transaction` y valores escalares. Exige cobertura de
   ID, estado e importe; permite propiedades adicionales y orden dinámico.
   Compara hex normalizado con `timingSafeEqual`. No necesita raw body.
3. La firma oficial de ejemplo **no cubre referencia ni moneda**. Por eso SIEMPRE
   consulta la transacción desde backend con la llave privada de esa versión:
   `https://sandbox.wompi.co/v1/transactions/{id}` o
   `https://production.wompi.co/v1/transactions/{id}`. Hosts fijos, ID restringido,
   timeout 10 s, límite de respuesta, sin redirects ni proxy. Errores de Axios
   no se propagan ni se registran porque contienen Authorization.
4. Compara ID, referencia, importe exacto, COP y estado entre evento, respuesta
   privada e intento. Si hay llave pública en `merchant.public_key` o en
   `merchant.id` con prefijo `pub_`, exige coincidencia. No inventa un campo de
   comercio obligatorio ausente del ejemplo oficial de consulta. La consulta
   privada y la firma del comercio son ambas obligatorias.
5. `PENDING` no acredita. `DECLINED`/`ERROR`/`VOIDED` finalizan rechazadas sin saldo.
   Sólo `APPROVED` puede aprobar. Sandbox finaliza como `sandbox_approved`:
   **sin saldo real y sin ledger monetario**. UI cliente/admin lo identifica.
6. Usa `settleRechargeTransaction`: guard pending, estado privado y público,
   saldo, ledger determinista `balanceTransactions/{rechargeId}`, consumo
   `wompi_payment_consumptions/{sha256(environment:transactionId)}` y liberación
   de lock en UNA transacción, con todas las lecturas antes de escribir.
   El ID de transacción no puede pagar otra recarga en el mismo ambiente.
   Beneficiario fijado al crear: customer o reseller propio, tenant coincidente.
7. La misma función impide aprobar/rechazar manualmente Wompi sin confirmación,
   incluso si alguien altera/elimina el campo público `provider`. IMAP no se
   ejecuta para estas recargas. QR conserva aprobación manual/IMAP anteriores.
8. Retries duplicados verificados son 200 sin nuevo crédito. Timestamp entero
   firmado, sin ventana de reloj estrecha: el proveedor documenta reintentos
   hasta 24 h; la protección de replay es consumo+estado+ledger persistentes.
   Los eventos inválidos usan respuesta genérica 400 y los fallos del API de
   consulta 503. La notificación determinista se escribe fuera de la transacción;
   su fallo no vuelve a ejecutar una acreditación.

No implementa devoluciones/chargebacks ni reversión de créditos finales. Esas
operaciones necesitan un flujo financiero separado; no se infieren del retorno
del checkout ni se inventan a partir de un evento tardío.

## Documentación oficial verificada

Consultada por HTTPS el **2026-11-25**, sin usar APIs privadas:

- [Widget & Checkout Web](https://docs.wompi.co/docs/colombia/widget-checkout-web/):
  Web Checkout `/p/`, cinco parámetros, firma
  `SHA256(reference + amountInCents + currency + integritySecret)` sin expiration,
  checkout definido por llave pública y retorno sólo informativo.
- [Eventos](https://docs.wompi.co/docs/colombia/eventos/): formato del payload,
  `environment: test|prod`, checksum de propiedades+timestamp+eventsSecret,
  propiedades variables y 3 reintentos (30 min, 3 h y 24 h).
  **Errata comprobada del ejemplo:** la cadena publicada
  `1234-1610641025-49201APPROVED44900001530291411prod_events_OcHnIzeBl5socpwByQ4hA52Em3USQ93Z`
  produce `5a18ec5e8fdb7df463e9f94774cba8f583ba21bd04a09ceff2ea68a4bc0aefbe`
  tanto en Node crypto como en Python hashlib, no el `3476DDA...` impreso.
  El test rechaza la firma inconsistente y acepta el digest calculado de forma
  independiente. No hay excepción para ejemplos ni relajación de SHA256.
- [Ambientes y llaves](https://docs.wompi.co/docs/colombia/ambientes-y-llaves/):
  bases sandbox/production y prefijos `pub_`, `prv_`, `events`, `integrity`.
- [Seguimiento de transacciones](https://docs.wompi.co/docs/colombia/seguimiento-de-transacciones/):
  estados y consulta por ID exclusivamente con llave privada desde backend.
- [Transacciones](https://docs.wompi.co/docs/colombia/transacciones/):
  GET por ID con Bearer privado y campos de respuesta. La sección específica
  de autenticación/GET prevalece sobre snippets auxiliares inconsistentes de
  esa página que aún mencionan una llave pública.

## Verificación ejecutada (offline, sin build)

Node **22.16.0** (`/usr/local/bin/node`), npm **10.9.2**, Java **21**.
La nueva verificación se ejecutó en `wompi-clean-head` (ruta completa abajo),
extraído con `git archive HEAD`, sin symlinks a fuentes del working tree.
Se instalaron los CUATRO paquetes aislados con `npm ci --ignore-scripts
--no-audit --no-fund`, usando sus locks de HEAD sin modificaciones. No se instaló
root, API ni functions. Firebase CLI **15.15.0**, emulador **1.20.4** existente.
P0 resuelve Express desde el paquete aislado de rules mediante `NODE_PATH`;
no depende de un `api/node_modules` accidental.

```sh
export PATH="/usr/local/bin:$PWD/tests/security-tools/node_modules/.bin:$PATH"
export JAVA_HOME="/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home"
node tests/security-p0/run.mjs
node tests/security-rules/manual-validation.mjs
python3 tests/security-tools/check-workflow.py
```

| Gate | Resultado observado |
|---|---|
| P0 + Wompi | **55/55**: 25 regresiones previas y 30 nuevas; Auth/Firestore reales de emulador demo |
| Rules candidato | **29/29**: 28 existentes y matriz server-only Wompi para anónimo, cliente, reseller, admin y superadmin; matriz repetida también con reglas auditadas pre-CONTRACT SHA `c24b7c5...` |
| Frontend | **83/83**: **65 históricos intactos + 10 Wompi legacy + 8 Wompi de contratos reales** |
| Handlers/registry | **14/14**, tabla exacta de 49 rutas callable; webhook separado |
| Runtime existente | **15/15**, Express real con boundaries sintéticas |
| HTTP Wompi | Incluido en 55/55: Express+middleware+handler real, sin Bearer en webhook, Bearer/no-store en callables, firma inválida, duplicado y ambiente incorrecto |
| Readiness | Inspección read-only completada; artefactos existentes obsoletos, publicación NO-GO |
| TypeScript | **0 diagnósticos**, `noEmit`, 36 fuentes y **155 imports locales**; cierre ampliado a modal, configuración e historiales Wompi |
| YAML offline | PASS: sólo dispatch, contents read, cuatro locks exactos, cinco gates + P0, sintaxis Bash válida |

**Total: 196 casos = 147 históricos + 49 nuevos.** Parsers exigen conteo exacto,
cero fallos y cero skipped/cancelled/todo. El checker noEmit vuelve a ser
obligatorio en el wrapper seleccionado. Los ocho contratos Wompi usan módulos
reales de API client, Firebase init, stores, marketplace, modal e historial;
sólo simulan SDK externo y HTTP. Los diez tests originales con mocks internos
quedan identificados explícitamente como fixtures legacy, no evidencia de imports.

Todos los casos ejecutados terminaron con **0 skipped/cancelled/todo**. Las
pruebas no contactan Wompi: reemplazan únicamente su transporte de salida con
fixtures sintéticas basadas en docs. Se comprobaron firma inválida, alteración
de campos firmados/no firmados, tenant/ambiente/comercio incorrectos, concurrencia,
replay, carrera manual/webhook, beneficiarios y rollback, config por tenant,
sandbox sin saldo, QR sin proveedor, retomar checkout y UI sin scripts externos.

**Alcance frente a dirty previo:** la primera corrida de esta integración fue
45 casos (35 del working tree + 10 Wompi), sin los 30 contratos de HEAD. Esa
corrida NO justificaba compatibilidad histórica. La continuación reconstruyó
ambos proyectos desde HEAD en el snapshot y repitió los 147 históricos completos.
El archivo de los 30 contratos históricos sólo tiene inserciones: ningún caso
anterior fue eliminado/reemplazado. Locks, setup SDK, fuentes dual-session y
todos los archivos de HEAD no seleccionados son byte-idénticos en el snapshot.

El árbol local sigue mezclado: su `firebase.ts`/`apiClient.ts` previos eliminan
las identidades/exports duales (`adminAuth`, `customAdminCallable`) que Wompi
ahora usa correctamente sobre HEAD. No se restauraron esos archivos ajenos.
Tampoco se reemplazó wholesale la configuración dirty de tests. **No ejecutar
`git add` de archivos completos ni interpretar estos verdes como validación
del working tree completo.** La unidad revisable es el patch seleccionado.

El cierre ampliado detectó tres argumentos SMTP obsoletos en Settings de HEAD;
la selección elimina sólo esos argumentos (wrappers ya usan sesión admin),
conservando `adminDb`, QR y el resto de Settings. No agrega cambios SMTP del dirty.

El workflow `security-compatibility.yml` sigue siendo **sólo workflow_dispatch**;
usa los mismos runners, ahora con Wompi. No se inició ninguna corrida remota.
Los manifiestos históricos/selección no se regeneraron ni se usaron como prueba
de fuentes nuevas; readiness calcula hashes actuales sin escribir bundles.

## Archivos de la selección revisable (28)

```text
functions/services/wompiProtocol.js                 nuevo
functions/wompi.js                                  nuevo
functions/recharges.js
api/src/app.js
api/src/registry.js
api/tests/registry.test.js
src/components/WompiPaymentOption.tsx               nuevo
src/components/admin/WompiSettings.tsx              nuevo
src/components/RechargeModal.tsx
src/pages/admin/Settings.tsx
src/pages/admin/Recharges.tsx
src/pages/recargas/HistorialRecargas.tsx
src/types/index.ts
src/types/marketplace.ts
src/services/marketplace.ts                         sólo wrappers de recargas
src/test/WompiPayments.test.tsx                     nuevo
tests/security-p0/boundaries.cjs
tests/security-p0/wompi.test.cjs                    nuevo
tests/security-p0/run.mjs
tests/security-rules/candidate.test.mjs
tests/security-rules/runtime.test.cjs
tests/security-rules/manual-validation.mjs
tests/security-frontend/vitest.config.mjs
tests/security-frontend/check-contracts.mjs          cierre Wompi noEmit
tests/security-frontend/contracts.test.tsx           +8; 30 previos intactos
tests/security-tools/check-workflow.py              reconoce P0 estricto
.github/workflows/security-compatibility.yml
docs/wompi-local.md                                nuevo
```

Parches localizados mediante `apply_patch`, sin limpiar/restaurar el working tree
ajeno ni recrear archivos previamente eliminados. No hay nueva dependencia.

Revisión: el patch se aplica sin errores/whitespace sobre un SEGUNDO git archive
limpio; sus 28 archivos coinciden byte a byte con el snapshot probado. El índice
continúa vacío. Los siguientes SHA256 del working tree coinciden con el inicio:

```text
firestore.rules              c24b7c5fb757eeba7ec67e22fc0c5e514332624ae608584a6261e99cc62e276c
firebase.json                e4ea492e6854e11bcb53980063a2b8490acefa9243b3c234adabaf8ff23ac8ba
firebase.security-rules.json  969272fc6806669f0d742f8a9eaca9bc2641034b9360a2d306034637d27cac7d
```

Readiness de la corrida anterior en working tree: manifiesto de 50 entradas
`30a783f30773671b94f7f4d10d598b54ad5ec378685d701b77a1a8238e2c1cb1`.
El fingerprint de subconjunto de CONTRACT no incluye Wompi; no se lo presenta
como evidencia de la integración. Ninguno de estos hashes prueba un despliegue.

### Evidencia temporal de esta continuación

Base aprobada: `/var/folders/zq/6h6qz_616b371m8v3q93wklh0000gn/T/opencode/`.

- `wompi-clean-head/`: snapshot probado de HEAD + selección.
- `wompi-reviewed.patch`: patch mínimo aplicable sobre HEAD, incluidos archivos nuevos.
- `wompi-manifest.json`: los 28 paths con SHA256 seleccionado y SHA256 del working
  tree, para distinguir fuentes mixtas de las probadas.
- `wompi-selection.py`: reconstruye sólo esa selección; no escribe el repo/índice.
- `wompi-proof.py`: segundo archive, apply/reverse check, igualdad de archivos
  seleccionados/no seleccionados, contratos históricos sin remociones e índice vacío.
- `wompi-gate.py`: captura la salida completa y comprueba el exit code.
- `wompi-full.log`: gate completo, SHA256
  `c83157f518ace9beff22e700c17457b786fc688db294b697c39eeab0ecc79a08`.
- `wompi-frontend.log`: repetición tras ajuste de error persistente/refetch,
  SHA256 `75ed7980096ea2eef2e32d220e890e82e5fc59cde589403691925a84594ef489`.
- `wompi-p0.log`: P0 final, SHA256
  `df063ad5b1e72bb3b18c68fd0e1dc075ac465afc5e73937564b346cf268e7d23`.
- `wompi-workflow.log`: checker offline, SHA256
  `d152b128654595360d53f94ddd0de59b03d6f80d1502e5798190a8f44e8b7911`.

Fingerprint de las 27 entradas seleccionadas excluyendo este documento (JSON
de path+sha256 ordenado, serialización documentada en `wompi-proof.py`):
`13f4c8df86a78efd08503a2a2b3d6f4f416269d71423fc867ae38da0dbab78f1`.
Los archivos temporales son evidencia local recuperable mientras exista ese
directorio, no artefactos publicables ni nuevos documentos en el proyecto.

## Próximos pasos autorizables (no ejecutados)

1. Revisión humana del patch limpio ya reconstruido; incorporar únicamente esa
   selección mediante una operación futura explícitamente autorizada. El dirty
   completo no está listo para commit. Resolver artefactos bajo NEVER BUILD.
2. En una futura publicación autorizada: API primero; frontend después, conservando
   opt-in ausente/deshabilitado por defecto. Frontend con API anterior simplemente
   conserva QR y muestra error aislado si la disponibilidad Wompi falla.
3. Configurar únicamente el tenant cuyo comercio fue aprobado. Verificar los
   claims autoritativos de sus titulares sin migrar/bloquear al resto de usuarios QR.
4. Sandbox con credenciales propias y URL de eventos `/test`, comprobando el
   comercio, respuesta real del GET privado y que las pruebas no acreditan saldo.
   Esto aún **no se probó contra Wompi** por falta de credenciales/autorización.
5. Sólo tras validación y autorización posteriores, configurar el comercio de
   producción y webhook `/prod`; no existe activación automática.

## Resumen de continuidad

- **Goal:** integrar Wompi opcional por tenant sin reemplazar QR ni debilitar crédito.
- **Instructions:** sin subdelegación, build, publicación, commits, dinero real,
  secretos reales, cambios de infraestructura ni lectura de datos de producción.
- **Discoveries:** firma de ejemplo no cubre referencia/moneda; GET privado es
  obligatorio; checksum impreso del ejemplo oficial inconsistente (Node/Python);
  configuración admin usaba sesión cliente; UI no permitía retomar tras disable;
  dirty anterior había quitado 30 contratos y exports duales. Se preservó ese dirty.
- **Accomplished:** selección de 28 archivos sobre HEAD, 196/196 (147 históricos
  intactos), noEmit/import graph real, secretos denegados también pre-CONTRACT,
  aislamiento Express sin root installs, rotación+disable+resume verificados,
  error Wompi persistente sin bloquear QR y patch comprobado en segundo archive.
- **Next Steps:** GO revisión del patch; working tree completo y producción NO-GO.
  Integrar selección de forma autorizada y futura prueba sandbox; no activar todavía.
- **Relevant Files:** listado exacto anterior.

Los pendientes de seguridad previos siguen pendientes: no se desplegó CONTRACT,
la exposición previa de reglas en producción no quedó resuelta por Wompi, y una
allowlist de `From` IMAP no autentica por sí sola al remitente. No se afirma que
producción sea segura ni que Wompi esté en vivo.
