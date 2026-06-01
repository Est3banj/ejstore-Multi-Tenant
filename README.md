# EJStore - Plataforma Multi-Tenant de Servicios Digitales

Plataforma web moderna para venta de servicios digitales y streaming con soporte multi-tenant. Un solo código, múltiples tiendas independientes.

## 🏢 Arquitectura Multi-Tenant

Este proyecto implementa un sistema multi-tenant donde cada tienda tiene su propia configuración, servicios y administración.

### Cómo funciona

| URL | Tienda cargada |
|-----|----------------|
| `tudominio.com/?v=micromercado` | Tienda "micromercado" |
| `tudominio.com/?v=otienda` | Tienda "otienda" |
| `micromercado.tudominio.com` | Por subdominio (futuro) |

Cada tienda tiene:
- ✅ Nombre, logo, colores personalizados
- ✅ Servicios propios (Netflix, IPTV, etc.)
- ✅ Banners promocionales
- ✅ Términos y condiciones
- ✅ WhatsApp de contacto propio
- ✅ Panel de administración separado

---

## 🚀 Características

### Para Usuarios
- ✨ Catálogo de servicios moderno con animaciones
- 🎨 Diseño glassmorphism personalizado por tienda
- 📱 Totalmente responsive
- 🎯 Filtrado por categorías
- 💳 Selección de métodos de pago
- 📋 Términos y condiciones
- 📱 Redirección a WhatsApp con mensaje personalizado

### Para Administradores
- 🔐 Autenticación con Firebase Auth (sesión aislada del cliente)
- 📊 Dashboard con estadísticas y clientes registrados
- 🛍️ CRUD completo de servicios
- 🖼️ Gestión de banners
- 📝 Editor de términos y condiciones
- ⚙️ Configuración de tienda (colores, logo, WhatsApp)
- 📤 Subida de imágenes a Firebase Storage
- 👥 Gestión de administradores (superadmin)
- 💰 Administración de recargas de saldo
- 🎡 Configuración de ruleta de premios
- 🏪 Gestión de tenants (superadmin)
- 🔔 Notificaciones por Discord via Webhook

---

## 🛠️ Tecnologías

- **React 18** con Vite 5
- **Firebase** (Auth, Firestore, Storage, Functions)
- **TailwindCSS**
- **Framer Motion**
- **React Router**
- **Zustand** (State Management)
- **TanStack Query** (Data Fetching)
- **Lucide React**
- **Discord Webhooks** (Notificaciones por tenant)

---

## 📦 Instalación

```bash
git clone <repo-url>
cd ejstore-web
npm install
cp .env.example .env
```

Edita `.env` con tus credenciales de Firebase:
```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain
VITE_FIREBASE_PROJECT_ID=tu_project_id
VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
```

```bash
npm run dev
```

---

## 🔥 Configuración de Firebase

### 1. Habilitar servicios en Firebase Console

1. **Authentication**: Habilitar Email/Password
2. **Firestore**: Crear base de datos
3. **Storage**: Habilitar almacenamiento

### 2. Estructura de Firestore

```
📂 ejstore-web (Proyecto Firebase)
├── 📂 tenants/
│   ├── 📄 micromercado
│   │   ├── name: "Mi Tienda"
│   │   ├── logoUrl: "https://..."
│   │   ├── primaryColor: "#E50914"
│   │   ├── secondaryColor: "#1A1A1A"
│   │   ├── whatsappNumber: "5491112345678"
│   │   ├── contactEmail: "info@mitienda.com"
│   │   ├── isActive: true
│   │   └── terms: "Términos y condiciones..."
│   │
│   └── 📄 otratienda
│       └── (misma estructura)
│
├── 📂 services/
│   ├── 📄 doc1
│   │   ├── name: "Netflix Premium"
│   │   ├── tenantId: "micromercado"  ← clave para filtrar
│   │   ├── price: 1500
│   │   ├── active: true
│   │   └── ...
│   │
│   └── 📄 doc2
│       ├── name: "Spotify Premium"
│       ├── tenantId: "otratienda"  ← solo para esa tienda
│       └── ...
│
├── 📂 banners/
│   ├── 📄 doc1
│   │   ├── tenantId: "micromercado"
│   │   ├── imageUrl: "https://..."
│   │   ├── active: true
│   │   └── order: 1
│   └── ...
│
├── 📂 customers/
│   ├── 📄 uid-cliente-1
│   │   ├── email: "cliente@email.com"
│   │   ├── firstName, lastName, phone
│   │   ├── balance: 1000
│   │   └── tenantId: "micromercado"
│   └── ...
│
├── 📂 recharges/
│   ├── 📄 recharge-id
│   │   ├── tenantId, customerId, customerName
│   │   ├── amount: 10000
│   │   ├── status: "pending" | "approved" | "rejected"
│   │   └── createdAt, processedAt
│   └── ...
│
├── 📂 balanceTransactions/
│   └── 📄 tx-id
│       ├── customerId, amount, type
│       └── processedBy, createdAt
│
├── 📂 prizes/
│   └── 📄 prize-id
│       ├── customerId, prize, tenantId
│       └── claimed, wonAt
│
├── 📂 rouletteConfig/
│   └── 📄 tenant-id
│       ├── isEnabled, pricePerSpin
│       ├── spinsForFreeSpin
│       └── prizes: [...]
│
└── 📂 users/
    ├── 📄 uid-del-admin-1
    │   ├── email: "admin@micromercado.com"
    │   ├── tenantId: "micromercado"
    │   └── role: "admin" | "superadmin"
    │
    └── 📄 uid-del-admin-2
        ├── email: "admin@otratienda.com"
        ├── tenantId: "otratienda"
        └── role: "admin"
```

### 3. Modelo de Datos

#### Tenant (`tenants/{tenantId}`)
```javascript
{
  name: string,              // Nombre de la tienda
  logoUrl: string,           // URL del logo
  primaryColor: string,      // Color primario (#E50914)
  secondaryColor: string,    // Color secundario (#1A1A1A)
  whatsappNumber: string,    // Número con código de país
  contactEmail: string,      // Email de contacto
  isActive: boolean,         // Si la tienda está activa
  terms: string,             // Términos y condiciones
  subdomain: string,         // (futuro) subdominio
  qrImage: string,           // QR para recargas
  brebKey: string,           // Clave BRE-B
  brebBankName: string,      // Banco BRE-B
  discordWebhookUrl: string, // Webhook Discord notificaciones
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Servicio (`services/{serviceId}`)
```javascript
{
  name: string,
  description: string,
  price: number,
  promotionalPrice: number,
  category: string,       // pantallas, cuentas, musica, tv-deportes, combos
  image: string,          // URL de imagen
  active: boolean,
  benefits: string[],     // lista de beneficios
  pricing: [              // planes con precios custom
    { months: 1, price: 1000 },
    { months: 3, price: 2500 }
  ],
  tenantId: string,       // IMPORTANTE: vincula a tenant
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Banner (`banners/{bannerId}`)
```javascript
{
  title: string,
  description: string,
  imageUrl: string,
  link: string,
  active: boolean,
  order: number,
  tenantId: string,       // IMPORTANTE: vincula a tenant
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Usuario (`users/{uid}`)
```javascript
{
  email: string,
  tenantId: string,       // IMPORTANTE: tienda que administra
  role: string,           // "admin" o "superadmin"
  createdAt: timestamp
}
```

#### Cliente (`customers/{uid}`)
```javascript
{
  email: string,
  firstName: string,
  lastName: string,
  phone: string,
  balance: number,         // Saldo actual en COP
  tenantId: string,        // Tienda a la que pertenece
  createdAt: timestamp
}
```

#### Recarga (`recharges/{id}`)
```javascript
{
  tenantId: string,
  customerId: string,
  customerName: string,
  customerPhone: string,
  amount: number,
  status: "pending" | "approved" | "rejected",
  createdAt: timestamp,
  processedAt: timestamp,
  processedBy: string
}
```

#### Premio (`prizes/{id}`)
```javascript
{
  customerId: string,
  customerName: string,
  tenantId: string,
  prize: string,
  claimed: boolean,
  wonAt: timestamp,
  notifiedBy: string
}
```

#### Configuración Ruleta (`rouletteConfig/{tenantId}`)
```javascript
{
  tenantId: string,
  isEnabled: boolean,
  pricePerSpin: number,      // Precio por giro en COP
  spinsForFreeSpin: number,   // Giros pagos para 1 gratis
  prizes: [                   // Lista de premios
    { id: string, name: string, probability: number, cost: number, isActive: boolean }
  ]
}
```

---

## 🔐 Reglas de Firestore

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // TENANTS - lectura pública
    match /tenants/{tenantId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.token.tenantId == tenantId;
    }

    // SERVICES - lectura pública, escritura por tenant admin
    match /services/{serviceId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.auth.token.tenantId == request.resource.data.tenantId;
      allow update, delete: if request.auth != null 
        && request.auth.token.tenantId == resource.data.tenantId;
    }

    // BANNERS - lectura pública, escritura por tenant admin
    match /banners/{bannerId} {
      allow read: if true;
      allow create: if request.auth != null 
        && request.auth.token.tenantId == request.resource.data.tenantId;
      allow update, delete: if request.auth != null 
        && request.auth.token.tenantId == resource.data.tenantId;
    }

    // USERS - cada usuario solo ve su propio doc
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.token.role == 'superadmin';
      allow update: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

---

## ➕ Cómo crear una nueva tienda

### Paso 1: Crear Tenant en Firestore

```javascript
// Colección: tenants
// Documento: nueva-tienda

{
  name: "Nueva Tienda",
  logoUrl: "https://...",
  primaryColor: "#00FF00",
  whatsappNumber: "5499999999999",
  contactEmail: "info@nuevatienda.com",
  isActive: true,
  terms: "Términos y condiciones..."
}
```

### Paso 2: Crear usuario admin

```javascript
// Colección: users
// Documento: [tu UID de Firebase Auth]

{
  email: "admin@nuevatienda.com",
  tenantId: "nueva-tienda",
  role: "admin"
}
```

### Paso 3: Acceder

- **Tienda**: `http://localhost:5173/?v=nueva-tienda`
- **Admin**: `http://localhost:5173/admin` (logueate con el usuario creado)

---

## 📁 Estructura del Proyecto

```
ejstore-web/
├── src/
│   ├── components/            # Componentes reutilizables
│   │   ├── Roulette.tsx       # 🎡 Ruleta de premios
│   │   ├── Header.tsx         # Header público con auth + recargas
│   │   ├── Footer.tsx
│   │   └── ...
│   ├── pages/
│   │   ├── Home.jsx           # Catálogo público
│   │   ├── Product.jsx        # Detalle de servicio
│   │   └── admin/             # Panel de admin
│   │       ├── Dashboard.jsx  # Stats + clientes + recarga
│   │       ├── Services.jsx
│   │       ├── Banners.jsx
│   │       ├── Terms.jsx
│   │       ├── Settings.jsx   # Config + Discord webhook
│   │       ├── Admins.tsx     # 👥 Gestión admins (superadmin)
│   │       ├── Recharges.tsx  # 💰 Recargas de saldo
│   │       ├── RouletteSettings.tsx # 🎡 Config ruleta
│   │       ├── Tenants.tsx    # 🏪 Gestión tenants (superadmin)
│   │       └── Login.jsx
│   ├── layouts/
│   │   ├── MainLayout.tsx     # Layout público
│   │   └── AdminLayout.tsx    # Layout admin
│   ├── hooks/
│   │   ├── useAuth.ts        # Hook de autenticación
│   │   ├── useQueries.ts     # TanStack Query hooks
│   │   └── useRoulette.ts    # Hook de ruleta
│   ├── store/
│   │   ├── authStore.ts      # Zustand: auth (cliente + admin)
│   │   ├── tenantStore.ts    # Zustand: tenant actual
│   │   └── index.ts          # StoreProvider
│   ├── services/
│   │   ├── firebase.ts       # Config Firebase + adminAuth
│   │   ├── firestore.js      # CRUD Firestore
│   │   ├── auth.ts           # Autenticación (cliente + admin)
│   │   ├── tenant.js         # Detección de tenant
│   │   └── storage.js        # Upload de imágenes
│   └── utils/
│       ├── constants.js       # Constantes
│       ├── validation.js      # Validación URLs
│       ├── roulette.ts       # Utilidades ruleta
│       └── whatsapp.js       # Generador de mensajes
├── functions/
│   ├── index.js              # 12 Cloud Functions
│   └── package.json
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── package.json
```

---

## 🎨 Categorías

- 📺 **pantallas** - Streaming (Netflix, Disney+, etc.)
- 👤 **cuentas** - Cuentas Premium
- 🎵 **musica** - Spotify, Apple Music
- ⚽ **tv-deportes** - IPTV, Deportes
- 🎁 **combos** - Paquetes combinados

## 💳 Métodos de Pago

- 💚 Nequi
- 🏦 Bancolombia
- 💙 Daviplata
- 💵 Efectivo

---

---

## 🔔 Sistema de Notificaciones Multi-Tenant

### Discord Webhooks (por tenant)

Cada tienda puede configurar su propio webhook de Discord para recibir notificaciones:

| Evento | Embed Color | Descripción |
|--------|-------------|-------------|
| 💰 Recarga | `#3498DB` (Azul) | Nueva solicitud de recarga |
| 🎁 Premio | `#2ECC71` (Verde) | Cliente ganó premio en la ruleta |
| 💵 Carga Admin | `#9B59B6` (Morado) | Admin cargó saldo a cliente |

**Configuración:** Settings → Notificaciones por Discord → Ingresar URL → Probar (guarda automático)

### Telegram (feature flag deshabilitado)

El código de Telegram está intacto pero deshabilitado vía:
```bash
firebase functions:config:set notifications.enable_telegram="true"
firebase deploy --only functions
```

## ☁️ Cloud Functions (12 funciones)

| Función | Tipo | Descripción |
|---------|------|-------------|
| `createSuperadminBootstrap` | callable | Crear primer superadmin |
| `setTenantClaims` | callable | Asignar roles a usuarios |
| `createTenant` | callable | Crear nuevo tenant |
| `onUserCreated` | trigger | Crear documento al registrar usuario |
| `verifyTenantAccess` | callable | Verificar acceso a tenant |
| `migrateCustomersTenantId` | callable | Backfill tenantId en customers |
| `createRechargeRequest` | callable | Solicitar recarga de saldo |
| `loadCustomerBalance` | callable | Cargar saldo al cliente (admin) |
| `processRecharge` | callable | Aprobar/rechazar recarga |
| `notifyPrizeWon` | callable | Notificar premio de ruleta |
| `testDiscordWebhook` | callable | Probar webhook de Discord |
| `telegramWebhook` | onRequest | Webhook para bot de Telegram |

### Despliegue de Functions
```bash
firebase deploy --only functions
firebase deploy --only functions:notifyPrizeWon  # Función específica
```

## 🔐 Sesiones Aisladas (Admin vs Cliente)

El sistema usa **dos instancias de Firebase Auth** para mantener sesiones independientes:

- **`auth`** → Clientes (compartido entre tabs, localStorage)
- **`adminAuth`** → Administradores (sesión aislada, storage key separado)

Esto evita que al loguearte como admin se cierre la sesión del cliente en otras pestañas.

---

## 🔧 Scripts

```bash
npm run dev        # Desarrollo
npm run build     # Producción
npm run preview   # Preview build
```

---

## ⚠️ Notas Importantes

1. **Cada servicio/banner DEBE tener tenantId** - sin esto no se asocia a ninguna tienda

2. **El admin solo ve su tienda** - el sistema filtra automáticamente por el tenantId del usuario logueado

3. **Términos y condiciones** - se guardan en el documento del tenant, campo `terms`

4. **Favicon y título** - se actualizan dinámicamente según el tenant cargado

5. **Sesiones aisladas** - Admin y cliente usan instancias de Firebase Auth separadas. No se afectan entre sí.

6. **Discord Webhook** - Configurar en Settings → Notificaciones por Discord. El botón "Probar" guarda automáticamente.

7. **Dominios personalizados** - Agregar el dominio en Firebase Console > Authentication > Settings > Authorized domains

8. **Teléfono obligatorio** - Los clientes deben tener teléfono registrado para solicitar recargas

---

## 📄 Licencia

Privado - Uso exclusivo

---

Desarrollado con ❤️
