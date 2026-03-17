# Guía de Configuración de Firebase

Esta guía te ayudará a configurar Firebase para el proyecto EJStore.

## Paso 1: Crear Proyecto en Firebase

1. Ve a [Firebase Console](https://console.firebase.google.com/)
2. Haz clic en "Agregar proyecto"
3. Ingresa un nombre para tu proyecto (ej: "ejstore-web")
4. Desactiva Google Analytics (opcional) o actívalo si lo necesitas
5. Haz clic en "Crear proyecto"

## Paso 2: Configurar Authentication

1. En el menú lateral, ve a **Authentication**
2. Haz clic en "Comenzar"
3. Habilita el proveedor **Email/Password**
4. Guarda los cambios

### Crear Usuario Administrador

1. En Authentication, ve a la pestaña "Users"
2. Haz clic en "Add user"
3. Ingresa un email y contraseña
4. Guarda las credenciales (las necesitarás para iniciar sesión en el panel admin)

## Paso 3: Configurar Firestore Database

1. En el menú lateral, ve a **Firestore Database**
2. Haz clic en "Crear base de datos"
3. Selecciona "Iniciar en modo de prueba" (luego configuraremos las reglas)
4. Elige una ubicación para tu base de datos
5. Haz clic en "Habilitar"

### Configurar Reglas de Firestore

1. Ve a la pestaña "Reglas"
2. Reemplaza las reglas con:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Servicios: lectura pública, escritura solo autenticados
    match /services/{serviceId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Banners: lectura pública, escritura solo autenticados
    match /banners/{bannerId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    
    // Settings: lectura pública, escritura solo autenticados
    match /settings/{settingId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

3. Haz clic en "Publicar"

## Paso 4: Configurar Storage

1. En el menú lateral, ve a **Storage**
2. Haz clic en "Comenzar"
3. Lee y acepta los términos
4. Elige "Iniciar en modo de prueba" (luego configuraremos las reglas)
5. Selecciona la misma ubicación que Firestore
6. Haz clic en "Listo"

### Configurar Reglas de Storage

1. Ve a la pestaña "Reglas"
2. Reemplaza las reglas con:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

3. Haz clic en "Publicar"

## Paso 5: Obtener Credenciales

1. En el menú lateral, ve a **Configuración del proyecto** (ícono de engranaje)
2. Desplázate hacia abajo hasta "Tus aplicaciones"
3. Haz clic en el ícono de web (`</>`)
4. Registra tu app con un nombre (ej: "EJStore Web")
5. Copia las credenciales que aparecen

## Paso 6: Configurar Variables de Entorno

1. Copia el archivo `.env.example` a `.env`
2. Pega las credenciales de Firebase en el archivo `.env`:

```env
VITE_FIREBASE_API_KEY=tu_api_key_aqui
VITE_FIREBASE_AUTH_DOMAIN=tu_auth_domain_aqui
VITE_FIREBASE_PROJECT_ID=tu_project_id_aqui
VITE_FIREBASE_STORAGE_BUCKET=tu_storage_bucket_aqui
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id_aqui
VITE_FIREBASE_APP_ID=tu_app_id_aqui
VITE_WHATSAPP_NUMBER=+573001234567
```

## Paso 7: Crear Datos Iniciales (Opcional)

Puedes crear algunos datos de ejemplo desde el panel de administración después de iniciar sesión, o crear documentos manualmente en Firestore:

### Documento de Configuración General

1. Ve a Firestore Database
2. Crea una colección llamada `settings`
3. Crea un documento con ID `general`:
   ```json
   {
     "siteName": "EJStore",
     "logo": "",
     "whatsappNumber": "+573001234567",
     "contactEmail": "contacto@ejstore.com"
   }
   ```

### Documento de Términos y Condiciones

1. En la colección `settings`, crea un documento con ID `terms`:
   ```json
   {
     "content": "<p>Términos y condiciones de uso...</p>"
   }
   ```

## Paso 8: Probar la Aplicación

1. Ejecuta `npm run dev`
2. Ve a `http://localhost:3000`
3. Deberías ver la página principal
4. Ve a `http://localhost:3000/admin/login`
5. Inicia sesión con las credenciales del usuario administrador que creaste
6. ¡Listo! Ya puedes gestionar servicios, banners y configuración desde el panel admin

## Notas Importantes

- **Seguridad**: Las reglas de Firestore y Storage permiten lectura pública pero escritura solo para usuarios autenticados. Esto es adecuado para este proyecto, pero puedes ajustarlas según tus necesidades.

- **Producción**: Antes de desplegar a producción, considera:
  - Ajustar las reglas de seguridad según tus necesidades
  - Configurar dominios autorizados en Authentication
  - Configurar CORS si es necesario
  - Revisar los límites de uso de Firebase

- **Backup**: Considera hacer backups regulares de tu base de datos Firestore.

## Solución de Problemas

### Error: "Firebase: Error (auth/unauthorized-domain)"
- Ve a Authentication > Configuración > Dominios autorizados
- Agrega tu dominio (localhost para desarrollo)

### Error: "Permission denied"
- Verifica que las reglas de Firestore y Storage estén configuradas correctamente
- Asegúrate de estar autenticado cuando intentas escribir datos

### Error: "Storage bucket not found"
- Verifica que el nombre del bucket en `.env` sea correcto
- Debe ser: `tu-proyecto.appspot.com`

