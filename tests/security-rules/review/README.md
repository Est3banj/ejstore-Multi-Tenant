# Serie de revisión aislada — 2026-11-24

**GO para revisar fuentes e integración frontend acotada. NO-GO publicación,
SWITCH y CONTRACT.** Engram no está disponible; este archivo y `manifest.json`
persisten resultado, decisiones y próximos pasos.

Base fija: `7c0d85e02d05e3884b9dff2ff44a9f8c3e428086`. Serie estándar
`git apply`, sin commits ni índice. El manifiesto contiene archivos, hunks,
SHA256 antes/después, dependencias, logs hasheados y fingerprints finales.

| Orden | Patch | Rutas | Alcance / dependencia |
| --- | --- | ---: | --- |
| 1 | `A1-runtime-base.patch` | 45 | Base previa API Express, 44 rutas; aplica a HEAD |
| 2 | `A2-consumer-base.patch` | 18 | Hunks frontend + contratos de sesión/HTTP; aplica a HEAD por separado |
| 3 | `B-expand.patch` | 12 | Agregado público, recovery privado, CORS/Vary/no-store + tests/lock; requiere A1 |
| 4 | `C-consumers.patch` | 18 | Hunks stock/recovery + suites/runner/typecheck frontend; requiere A2 y contrato HTTP B |
| 5 | `D-manual-gates.patch` | 14 | Workflow manual, candidato en memoria, fixture histórica y tooling/lock; gates completos requieren A1–C |

Son **97 rutas únicas cambiadas**, no la lista109 renombrada ni la87 previa:
A2 pasó de11 a18 y C de15 a18 al incorporar contratos y su suite. Los locks API
y de los tres harnesses se incluyen una sola vez; raíz/functions conservan HEAD y
no se instalan. B/C no incluyen landing, finanzas, Auth migration ni reglas
activas. D no es un gate independiente de las fuentes: importa rutas y
consumidores reales.

## Unidad actual: contratos frontend y compatibilidad de sesión

Los seis `integrationBlockers` que registraba `--audit-only` sobre HEAD quedan
**resueltos con implementaciones reales seleccionadas**, no con exports inventados
ni fallbacks:

- `SIGNUP_BONUS`: hunk único de `src/services/auth.ts` (política de registro
  $1000). `register()` usa la misma constante; no es un crédito adicional. El
  valor coincide con `firestore.rules:125` (`request.resource.data.balance == 1000`).
- `logAnalyticsEvent`: wrapper real GA4 en `src/services/firebase.ts` sobre la
  misma app `adminApp`/`functions` de HEAD; nunca lanza si analytics no está
  disponible ni si el SDK externo falla.
- `getWholesaleServices`: lectura real tenant-scoped en `src/services/firestore.ts`
  que proyecta `serviceType` y excluye `diamond`; recibe `_db` explícito y
  propaga errores del SDK (no fabrica stock ni lista vacía).
- `patchBalance`: método único de saldo **absoluto** en `src/store/authStore.ts`
  con guardas de identidad/finotéz; no incrementa ni escribe Firestore. Un
  `refreshCustomer` iniciado antes del callback no pisa el patch de compra.
- Tipos: `serviceType?: 'diamond' | 'subscription'` en `src/types/index.ts` y
  `DiamondOrder`/request/response en `src/types/marketplace.ts`, verificados por
  typecheck (Vitest los elimina).

**Sesión: no se migró Auth global.** Se conservan las dos apps Firebase de HEAD
(`auth` + `adminAuth`):

- `customCallable` usa la sesión **cliente**; `customAdminCallable` (nuevo, en
  `src/services/apiClient.ts`) usa la sesión **admin/reseller**. El wrapper espera
  `authStateReady()`, exige token para llamadas privadas y rechaza
  `functions/unauthenticated` si la identidad cambió o el token falló/vino vacío,
  **sin sustituirlo por el otro usuario firmado**. `getStockAvailability` y las
  rutas públicas no envían Authorization.
- `CatalogoMayorista` vuelve a `adminUser`/`adminDb` (HEAD), no a `user`.
- Operaciones administrativas de `marketplace.ts` llaman `customAdminCallable`;
  las de cliente siguen en `customCallable`. `getResellerById` acepta `_db`
  explícito.
- `authStore` preserva ambas sesiones con listeners por slot y versión: un
  callback viejo no pisa rol/customer de otra identidad, y `logout()` limpia
  cliente y admin.

`contracts.test.tsx` (30 casos) importa los módulos **reales**
(`apiClient`, `firebase`, `auth`, `firestore`, `marketplace`, `authStore`,
`Product`, `CatalogoMayorista`, `PurchaseResult`). Los únicos `vi.mock` son del
SDK Firebase y del `fetch` HTTP — **cero mocks de contratos internos**. Cubre:
tokens distintos por rol, ausencia/fallo de token, transición de identidad en
vuelo, respuesta posterior a logout, errores server recuperables, saldo absoluto,
stock desconocido → error recuperable, y credenciales de compra reales.

## Corte real y alcance previo que todavía exige revisión

- A1 conserva la clausura de requires de las **44 rutas previas**, incluidos
  diamondOrders/Free Fire, OTP/publicStats, compras/recargas, administración,
  email/Telegram, tenants y sus services/utils. HEAD usa wrappers onCall/exportaciones
  distintos; conservar el registry previo sin recodificar esos handlers requiere
  esta base de migración. Los 41 chequeos de sintaxis y tabla44 NO auditan sus
  operaciones financieras ni prueban paridad funcional de toda la migración.
- A2 conserva Product/Modal/ServiceCard con diamantes/CTA/términos/saldo/analytics,
  wrappers HTTP de marketplace, contratos wholesale y navegación tenant previos.
  La frontera pre-EXPAND fue **reconstruida explícitamente**, no recuperada de un
  commit histórico ni identificada como producción. `prepare.py` fija cada corte
  y `contractProvenance` guarda el SHA256 working-tree de cada fuente usada.
- Home selecciona exclusivamente contexto tenant y effect de stock existente;
  CTA/marketing/motion/social-proof quedan HEAD en el target. Constants sólo agrega
  categoría diamantes: excluye política de inactividad. No se borró trabajo local.
- Se excluyen dirty `functions/package.json` (scripts/deps), MisServicios/diamantes,
  docs históricos grandes y preparador viejo. La lista exacta está en el manifiesto.
- **A1 y B no se modificaron en esta unidad** (mismos SHA256 que la corrida previa);
  sólo A2/C/D cambiaron.

## Reglas: tres identidades distintas

- `firestore.rules` en snapshot: HEAD, SHA256
  `2fa9c04b0d1362f17dd7ef3952a584aeb8e588126f1c5e1231802bf98db2d149`.
- Archivo dirty local, intacto, y fixture `fixtures/audited-original.rules`: SHA256
  `c24b7c5fb757eeba7ec67e22fc0c5e514332624ae608584a6261e99cc62e276c`.
- Candidato sólo en memoria: SHA256
  `ad8ba4f6f946ecce5918d8a0c5da73653457e8f3772efe3f55c528a392154ec6`.

D redirige únicamente baseline.mjs y config demo a la fixture. Mantiene la
caracterización original de la fuga (18 tests); no compara ni certifica reglas
productivas remotas. Ningún patch modifica `firestore.rules` o `firebase.json`.

## Verificación ejecutada

Export HEAD filtrado en temp aprobado; `git apply --check` + `git apply` por unidad,
hashes antes/después y sources sin symlinks. Instalaciones `npm ci` nuevas con
locks oficiales, `--ignore-scripts --no-audit --no-fund`; cero instalación
raíz/API/functions.

- A1: 41 `node --check` y tabla **44** real contra `api/tests/registry.test.js`.
- B: **14 handlers +15 HTTP Express**. En otro export HEAD, A1+B aplica sin A2/C/D;
  tabla46 y 14 handlers vuelven a pasar, sin dependencias npm para ese check.
- A2: aplicación independiente sobre HEAD verificada.
- C: **65 tests frontend** (35 previos sin modificar expectativas + 30 nuevos de
  contratos) y typecheck enfocado **TypeScript 6.0.2**: 0 diagnósticos, 29 fuentes
  de la clausura Product/Catalog/PurchaseResult/ServiceCard, **133 imports nombrados
  locales** resueltos contra los módulos reales (`check-contracts.mjs`, `noEmit`,
  sin build ni emisión).
- D: **28 candidato +18 histórico**, ambos dry-runs exit0/API48 y chequeo workflow
  YAML; `manual-validation.mjs` dispara el typecheck antes del gate frontend.
- Total seguridad/compatibilidad **122/122** (28 candidato +14 handlers +65
  frontend +15 runtime), histórico18 separado. Límite de runtime cerrado con
  binarios ya instalados: **122/122 y cinco gates completos en
  Node22.16.0/npm10.9.2/Oracle Java21.0.8 macOS**, log
  `final-node22-java21.log` SHA256
  `54ede92a6a95c1ac4458f586da43c205a1952bdba361761dd7738f7c02ff4892`.
  No es evidencia Ubuntu/Temurin de GitHub.

Fingerprints finales (difieren de109 por el recorte explícito):
API48 `e715dc3eff29740fd08c92a2098f5321d2082913cad7a2ac3e0befcddfc92e2e`
(sin cambios respecto de A1/B); subset
`73d111a1d367f53494d6b2275508a71dc7e34ce8954a2f0b7f5293f24c916756`
(cambió: C agregó contratos, typecheck y lock con `zustand`/`typescript`);
sources finales `d5f2b34ac86527d71477a7831afb9cfb4e35092e3fbb760a410d6234acda7264`.
Logs completos sólo en temp; paths/hashes/resultados en manifiesto. Whitespace
heredado en A1/fixture se conserva, no se aplicó autofix.

Reproducción desde el repo actual, sin tocar sus fuentes ni índice:

```sh
python3 tests/security-rules/review/lock-frontend.py
python3 tests/security-rules/review/prepare.py
python3 tests/security-rules/review/verify.py
python3 tests/security-rules/review/verify.py --target-runtime
python3 tests/security-rules/review/remote-proof.py
python3 tests/security-rules/review/verify.py --audit-only
```

`prepare.py` vuelve a generar manifiesto (reinicia evidencia); no ejecutarlo sólo
para consultar resultados. `--audit-only` comprueba hashes, presencia de los seis
contratos y la ausencia de mocks internos, sin repetir tests/red.

## Límites de esta evidencia (sin greenwash)

- **No hay browser/E2E full-app ni bundle de entrega**: los 65 tests frontend son
  unit/integración de módulos con doubles de SDK/HTTP. No prueban despliegue,
  hosting ni el bundle Vercel/`dist`.
- El typecheck es **enfocado** (raíces Product/Catalog/PurchaseResult/ServiceCard),
  `checkJs:false` para el grafo JS preexistente; NO es `tsc --noEmit` de todo el
  proyecto. Los 133 imports nombrados locales sí se resolvieron contra fuentes
  reales para no ocultar exports ausentes.
- La suite de contratos usa fixtures sintéticas (`*.example.invalid`); no contiene
  credenciales reales ni toca datos productivos.
- Gates candidato/handlers/runtime siguen siendo sobre DB/Admin/Auth sintéticos.
- Verificación local en **macOS**; el workflow D declara Ubuntu/Temurin pero no se
  ejecutó en GitHub.

## Remoto y siguiente unidad útil

GET de metadata: default `main`; sólo ci-cd viejo activo, mismo blob en main y ref
remoto feature. Declara push/PR main/master, build y Hosting deploy; continúa con
YAML defectuoso. Hubo runs fallidos de push sobre feature: los filtros declarados
no garantizan silencio efectivo. Hooks repo `[]`; inventario Apps no demostrado
(endpoint instalación401, no retry). No habilitar/corregir auto-CD para este trabajo.
Vercel **ejstore-api**: `createDeployments=disabled`, últimos3 `source=cli`, READY/prod.
No cubre otros proyectos. Firebase conserva el límite401 anterior, sin renovar.

**Recomendación:** revisar A2/C/D con sus dependencias (ya integrados y probados
en snapshot) y activar el workflow D manualmente sólo en etapa autorizada. La
integración frontend acotada quedó resuelta; lo que falta es evidencia externa:
inventario Apps/pipelines Firebase con sesión autorizada, GitHub Ubuntu/Temurin,
revisión de la base financiera (los 44 handlers de A1 no están auditados) y gates
staging/artifact/históricos/legacy/clientes viejos. Un futuro commit/push requiere
permiso explícito posterior y resolver triggers efectivos; este resultado no lo
autoriza.

Preservación final: HEAD y diff tracked global `389e5081803785644620740d07ad6d2575e0f92f42e8bb04db554d16b873bda6`
intactos; índice vacío y hashes working-tree de109 rutas conservados. Cambios
propios sólo bajo este directorio review. Sin subdelegación, build/deploy, staging,
commit/push, ramas, reset/stash/checkout ni mutaciones remotas.
