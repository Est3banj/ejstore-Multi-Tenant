# Contención Wompi corregida — cierre local

Inversión de locks reproducida: checkout leía request antes del lock y liquidación
recibo antes de beneficiario; trazas fallaban en recharge_locks/customers. El SDK
code 3 era el síntoma tras timeout, no cleanup temprano. Control SDK sin handlers:
orden inverso 5/10, lock primero 10/10. Handler original 8/10 checkout y 9/10
liquidación; regresión de checkout intercalado 4/10 antes del fix.

wompi.js/recharges.js ordenan las lecturas del lock y beneficiario primero. Hint
de beneficiario validado contra intent transaccional, no autoridad nueva. Test
rechaza hint ajeno sin crédito/ledger/consumo. Scheduler de tests con promesas y
commit real, sin sleeps/errores falsos/serialización. Sin retries nuevos ni tocar
SDK o timeouts. Instrumentación exploratoria fuera de selección; source congelado
en finance-investigation-sources.json junto a logs de todos los intentos.

Ventana final **100/100**, sin fallos/cancel/skip/todo: 20 checkout natural, 20
intercalado, 20 claves distintas, 20 webhook/manual, 20 webhook/reconciliación.
Crédito base y ledger/consumo únicos, estado/lock consistentes; cero transacciones
vivas al cerrar. **P0 78/78**, handlers 26, HTTP 19, workflow/readiness PASS.
Frontend 216/tipos 0/candidato 31: heredados, no repetidos; fuentes/harness de esos
gates intactos por hash respecto a 7955a737… (selección anterior preservada).
Node22/Java21, proyecto demo aislado en 8088/9098; sin provider/datos personales.

Evidencia nueva en el temporal habitual: finance-review/, finance-reviewed.patch,
finance-manifest.json y finance-patch-proof/, logs finance-*.log. Selección y árbol
unificado contrastados por archivo, no equivalentes; fuentes propias financieras
coinciden byte a byte. Sin Engram: registro aquí. Bloqueo local de intermitencia
resuelto; listo para revisión/integración siguiente, sin ejecutar CI remoto,
build/deploy/commit/push. Texto inferior: evidencia histórica supersedida.

# Seguimiento privacidad SPA / carreras — 2026-11-27

**Privacidad implementada; intermitencia financiera ABIERTA, no habilitar CI.**
Guarda previa al SDK en analyticsPrivacy.ts: latch de colección antes de History
(incluidos wrappers posteriores), popstate/hashchange/click, entrada y referrer.
gtag propio reconoce ID remoto antes de config; bloquea comandos/params sensibles.
no-referrer desde bootstrap. Tradeoff: sin tracking posterior a una capacidad
durante ese documento. Chrome 158, 4/4 escenarios con colector SIMULADO según
ga-disable; no se cargó GA remoto ni se afirma captura de tráfico del proveedor.

Checkout espera allSettled; teardown exige cero transacciones activas. Nueva
carrera webhook/reconciliación y checks atómicos de saldo base, ledger/consumo,
estado y lock antes de exigir éxito. Handlers financieros sin cambios. Reproduce
lock timeout → ID cerrado gRPC 3, que el SDK sólo reintenta si dice transaction
has expired. Contención última no aislada; cleanup temprano no explica allSettled.
Experimentos RPC/normalización/transporte fallidos fueron retirados, no seleccionados.
Stress inicial 19 pass/3 fail/1 cancel; diagnóstico 15/4/1; ventana final checkout
9/10 + webhook/manual 10/10, sin cancelaciones. P0 75/76 inicial, luego 76/76 con
checks atómicos y 76/76 con runner final. No demuestra estabilidad. Sin elevar
timeouts, relajar aserciones ni agregar retries financieros.

Esta selección: candidato 31, handlers 26, HTTP 19, frontend 216/216 (10 archivos,
sin skip/todo), tipos 0 errores/46 sources/206 imports; baseline histórico 20;
workflow/readiness PASS. Temporal original: links-followup-review/, patch y
manifest links-followup-reviewed.patch / links-followup-manifest.json; proof en
links-followup-patch-proof/. Logs links-followup-*.log registran todos los intentos.
Original b1702db… intacto. Fuentes/hashes del árbol unificado se contrastan por
archivo; no equivale a esta selección dual. Sin Engram: registro aquí. Pendiente
resolver contención y stress sin fallos antes de CI. Sin build/deploy/commit/push,
datos personales/demo/provider requests. Notas inferiores: evidencia anterior.

# Revisión aislada de enlaces públicos — 2026-11-27

Base: `d0644bc7a6e44b792d728b50e2cadfef5ff47e26`. Selección de sources
para revisión previa a GitHub. NO-GO publicación/CONTRACT.

## Selección y procedencia

Directorio de evidencia:
`/var/folders/zq/6h6qz_616b371m8v3q93wklh0000gn/T/opencode/`.
Snapshot: `links-clean-review/`; patch completo, incluidos nuevos archivos:
`links-reviewed.patch`; manifiesto: `links-manifest.json`.
El manifiesto registra archivos, hunks, SHA256 y verificación de reconstrucción
aplicando el patch a otro export HEAD. No se usa el índice del usuario.

Se seleccionaron los cambios de seguridad de accounts, registry, middleware,
writers, resolver y consumidores. `MisClientes` conserva adminDb/adminUser y el
apiClient dual de HEAD. firebase.ts incluye sólo las guardas nuevas de privacidad;
no la migración Auth del working tree. El harness conserva los tres proyectos
frontend de HEAD y agrega consumidores/privacidad. SweetAlert2 11.26.25 y sus
tipos reales se agregaron al lock aislado; no se simulan tipos faltantes.
Baseline/config de emulador provienen de HEAD y apuntan a
`fixtures/audited-original.rules`, SHA256
`c24b7c5fb757eeba7ec67e22fc0c5e514332624ae608584a6261e99cc62e276c`.
No se seleccionan firestore.rules, firebase.json, cambios financieros Wompi,
env, artefactos, dependencias de aplicación ni selecciones históricas A1.

## Defectos corregidos durante la revisión

- Desactivar visibilidad de un servicio no revoca una compra activa asignada.
  Tenant deshabilitado, servicio eliminado/cross-tenant, compra cancelada,
  reembolsada/expirada y reasignación siguen rechazados.
- Generación automática usa referencias devueltas por la transacción financiera,
  sin nuevas relecturas de tenant/catálogo después del débito. Single retorna su
  profileId; bulk persiste parent accountId y recibo assignmentId por perfil.
  El riesgo preexistente de escrituras post-commit no se rediseñó.
- El reseller redundante se compara con purchase.resellerId, no con customerId.
- VerCuenta ya recibía metadata + lastEmail sintético, sin credential. Se evita
  el crash de Object.keys(undefined) y se prueba la respuesta exitosa real.
  No se agrega extracción IMAP ni entrega pública de passwords/PIN.
- La página aplica no-referrer durante su montaje. Entradas directas por
  /r/:token y ?token= no inicializan Analytics; el wrapper también omite eventos
  en esas URLs. No se afirma haber probado el tracking automático de un SDK GA
  previamente inicializado durante navegación SPA: verificar configuración de
  enhanced measurement en staging antes de rollout con Analytics habilitado.

## Compatibilidad sintética / migración pendiente

| Cohorte | Resolución / acción previa al rollout |
| --- | --- |
| Nuevo single cuenta / perfil; bulk cuenta / perfiles con email compartido | Resoluble; links independientes por perfil, sin secretos copiados |
| Histórico single con purchase/account/profile autoritativos y expiry finito | Resoluble aun sin tenant/assignment redundantes; accountIndex ausente admite single 0 |
| Histórico con inline credential pero accountId=profileId/vacío | Rechazado; rebind sólo con padre/asignación demostrables |
| Bulk viejo sin parent accountId o assignmentId | Revisión manual; no inferir por email ni posición de credenciales deduplicadas |
| Expiry faltante/inválido, expirado, revocado o asignación ajena | 404 genérico; no renovar silenciosamente |

No se inventan referencias ni expiraciones. Una futura reparación debe operar
desde relaciones autoritativas, retirar campos credential/PIN duplicados y ser
idempotente. No se ejecutó migración ni inventario real: conteos desconocidos.
EXPAND/consumidores compatibles e históricos deben validarse antes de CONTRACT;
no activar primero las reglas cerradas.

## Validación local de la selección

Node 22.23.5 + Java 21.0.8. Cuatro paquetes de pruebas aislados instalados con
npm ci --ignore-scripts; fuentes sin symlinks hacia el working tree.

| Gate | Resultado |
| --- | --- |
| Candidato Firestore / SDK real, demo aislado 8089 | 31/31 |
| Handlers/registry/writers/resolver | 26/26 (incluye 12 links) |
| Express HTTP/runtime real; DB/Auth sintéticos | 19/19 |
| Frontend completo histórico + nuevos casos | 200/200; 0 skip/todo |
| TypeScript focalizado noEmit + imports locales | 0 diagnósticos; detalle en manifiesto |
| P0 + Wompi, Admin SDK y emuladores 8088/9098 | 75/75 en repetición única; 0 skip |
| Baseline histórico | 20/20; reproduce leaks, NO demuestra seguridad |
| Workflow YAML/Bash/locks y readiness dry-runs | PASS; publicación sigue NO-GO |

Primera ejecución P0 previa al último ajuste del writer: 75/75. Tras ese ajuste:
74/75 por aserción fulfilled/rejected en carrera webhook/aprobación manual,
`wompi.test.cjs:273`; repetición única 75/75. Causa no demostrada; no se relajó la
prueba ni se cambió liquidación. Logs del fallo y repetición conservados.
El primer typecheck detectó SweetAlert2 ausente en el harness; se agregó la
dependencia real y se repitió el gate completo exitosamente.

## Preservación y cierre

Fingerprint inicial: 497 paths tracked/untracked, sin imprimir contenidos.
Cambios de esta revisión acotados a los nueve paths listados en el manifiesto;
resto verificado por hash. HEAD e índice vacío preservados; reglas/config activas
conservan sus bytes iniciales. La selección adapta Auth y harness sólo en copia
limpia; no representa la UI servida por el working tree unificado/HMR.
Sin commit, push, build, deploy, subagentes, provider requests ni datos reales.
Registry leído; sin skill pertinente forzada. Engram no disponible: decisiones,
bugs, evidencia y próximos pasos quedan aquí. Próximo paso: revisar el patch;
commit/push requieren nueva instrucción. Rollout requiere históricos/staging y
artefactos compatibles trazables por separado.
