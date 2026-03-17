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
- 🔐 Autenticación con Firebase Auth
- 📊 Dashboard con estadísticas
- 🛍️ CRUD completo de servicios
- 🖼️ Gestión de banners
- 📝 Editor de términos y condiciones
- ⚙️ Configuración de tienda (colores, logo, WhatsApp)
- 📤 Subida de imágenes a Firebase Storage

---

## 🛠️ Tecnologías

- **React 18** con Vite
- **Firebase** (Auth, Firestore, Storage)
- **TailwindCSS**
- **Framer Motion**
- **React Router**
- **Context API**
- **Lucide React**

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
└── 📂 users/
    ├── 📄 uid-del-usuario-1
    │   ├── email: "admin@micromercado.com"
    │   ├── tenantId: "micromercado"  ← asocia admin a tienda
    │   └── role: "admin"
    │
    └── 📄 uid-del-usuario-2
        ├── email: "admin@otratienda.com"
        ├── tenantId: "otratienda"
        └── role: "admin"
```

### 3. Modelo de Datos

#### Tenant (`tenants/{tenantId}`)
```javascript
{
  name: string,           // Nombre de la tienda
  logoUrl: string,        // URL del logo
  primaryColor: string,   // Color primario (#E50914)
  secondaryColor: string, // Color secundario (#1A1A1A)
  whatsappNumber: string, // Número con código de país
  contactEmail: string,   // Email de contacto
  isActive: boolean,      // Si la tienda está activa
  terms: string,          // Términos y condiciones
  subdomain: string        // (futuro) subdominio
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
│   ├── components/         # Componentes reutilizables
│   │   ├── BannerSlider.jsx
│   │   ├── ServiceCard.jsx
│   │   ├── Header.jsx
│   │   ├── Footer.jsx
│   │   ├── Modal.jsx
│   │   └── ...
│   ├── pages/
│   │   ├── Home.jsx        # Catálogo público
│   │   ├── Product.jsx     # Detalle de servicio
│   │   └── admin/          # Panel de admin
│   │       ├── Dashboard.jsx
│   │       ├── Services.jsx
│   │       ├── Banners.jsx
│   │       ├── Terms.jsx
│   │       ├── Settings.jsx
│   │       └── Login.jsx
│   ├── layouts/
│   │   ├── MainLayout.jsx  # Layout público
│   │   └── AdminLayout.jsx # Layout admin
│   ├── context/
│   │   ├── TenantContext.jsx  # Carga tenant desde URL
│   │   └── AppContext.jsx     # Estado global + datos
│   ├── services/
│   │   ├── firebase.js     # Config Firebase
│   │   ├── firestore.js    # CRUD Firestore
│   │   ├── auth.js         # Autenticación
│   │   ├── tenant.js       # Detección de tenant
│   │   └── storage.js      # Upload de imágenes
│   └── utils/
│       ├── constants.js     # Constantes (categorías, métodos pago)
│       ├── validation.js   # Utilidades de validación
│       └── whatsapp.js     # Generador de mensajes
├── public/
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

---

## 📄 Licencia

Privado - Uso exclusivo

---

Desarrollado con ❤️
