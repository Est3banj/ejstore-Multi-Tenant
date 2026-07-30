const { functions, admin, db } = require('./config');

const getPublicAccount = functions.https.onCall(async (data, context) => {
  const { token } = data;
  if (!token) {
    throw new functions.https.HttpsError('invalid-argument', 'Token es requerido');
  }

  try {
    const linkDoc = await db.collection('public_links').doc(token).get();

    if (!linkDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Link no encontrado o inválido');
    }

    const link = linkDoc.data();
    const ahora = Date.now();
    const expira = link.expiresAt?.toMillis?.() || 0;

    if (link.status !== 'active' || (expira > 0 && ahora > expira)) {
      if (link.status === 'active') {
        await linkDoc.ref.update({ status: 'expired', updatedAt: new Date().toISOString() });
      }
      return {
        success: false,
        error: 'Este link ha expirado. Contactá a tu vendedor para obtener uno nuevo.',
        account: null,
      };
    }

    const svcName = (link.serviceName || '').toLowerCase();
    const codigo = String(Math.floor(100000 + Math.random() * 900000));
    const plantillas = {
      netflix: {
        from: 'Netflix <info@account.netflix.com>',
        subject: 'Tu código de verificación Netflix',
        bodyText: [
          '',
          `  Ingresa este código para iniciar sesión`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Ingresa este código en tu dispositivo para iniciar`,
          `  sesión en Netflix. El código vence en 15 minutos.`,
          '',
          `  Si no enviaste esta solicitud, ignora este email`,
          `  o revisa la actividad reciente de tus dispositivos.`,
          '',
          `  Por motivos de seguridad, no compartas este código`,
          `  con personas que no viven contigo.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de Netflix`,
          '',
          `  ¿Preguntas? Comunícate al 0800 591 8943`,
          `  Netflix Entretenimento Brasil, Ltda.`,
          `  Términos de uso • Privacidad • Centro de ayuda`,
          '',
          `  Netflix te envió este mensaje a`,
          `  [cuentamadre@gmail.com] como parte de tu membresía.`,
        ].join('\n'),
      },
      disney: {
        from: 'Disney+ <no-reply@accounts.disneyplus.com>',
        subject: 'Código de verificación Disney+',
        bodyText: [
          '',
          `  Tu código de verificación`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Ingresa este código en la pantalla de inicio de`,
          `  sesión de Disney+.`,
          '',
          `  Este código vence en 10 minutos.`,
          '',
          `  Si no solicitaste este código, puedes ignorar`,
          `  este mensaje de forma segura.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de Disney+`,
          '',
          `  Ayuda • Privacidad • Términos`,
          `  © Disney. Todos los derechos reservados.`,
        ].join('\n'),
      },
      hbo: {
        from: 'HBO Max <no-reply@hbomax.com>',
        subject: 'Código de verificación HBO Max',
        bodyText: [
          '',
          `  Código de verificación`,
          '',
          `        ╔══════════════════╗`,
          `        ║                  ║`,
          `        ║   ${codigo}  ║`,
          `        ║                  ║`,
          `        ╚══════════════════╝`,
          '',
          `  Usa este código para iniciar sesión en tu cuenta`,
          `  de HBO Max.`,
          '',
          `  El código expira en 15 minutos.`,
          '',
          `  Si no pediste este código, no reenvíes este`,
          `  mensaje.`,
          '',
          `  ───────────────────────────────────────────────`,
          `  El equipo de HBO Max`,
          `  Centro de ayuda`,
        ].join('\n'),
      },
    };
    let plantilla = plantillas.netflix;
    if (svcName.includes('disney')) plantilla = plantillas.disney;
    else if (svcName.includes('hbo') || svcName.includes('max')) plantilla = plantillas.hbo;

    return {
      success: true,
      account: {
        serviceName: link.serviceName || 'Servicio',
        credential: link.credential || {},
        status: 'active',
        createdAt: link.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        expiresAt: link.expiresAt?.toDate?.()?.toISOString() || new Date().toISOString(),
      },
      lastEmail: {
        subject: plantilla.subject,
        from: plantilla.from,
        bodyText: plantilla.bodyText,
        code: codigo,
        extractedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    if (error instanceof functions.https.HttpsError) throw error;
    console.error('Error en getPublicAccount:', error);
    throw new functions.https.HttpsError('internal', 'Error al obtener la cuenta');
  }
});

const createAccountWithProfiles = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { serviceId, tenantId, accounts } = data;

  if (!serviceId || !tenantId || !accounts || !Array.isArray(accounts) || accounts.length === 0) {
    throw new functions.https.HttpsError('invalid-argument',
      'serviceId, tenantId y accounts (array no vacío) son requeridos'
    );
  }

  if (claims.role !== 'superadmin' && claims.tenantId !== tenantId) {
    throw new functions.https.HttpsError('permission-denied', 'No tiene acceso a este tenant');
  }

  let accountsCreated = 0;
  let profilesCreated = 0;
  const failed = [];

  for (let lineIdx = 0; lineIdx < accounts.length; lineIdx++) {
    const accountInput = accounts[lineIdx];

    if (!accountInput.email || !accountInput.password) {
      failed.push({ line: lineIdx + 1, error: 'email y password requeridos' });
      continue;
    }

    if (!accountInput.profiles || !Array.isArray(accountInput.profiles) || accountInput.profiles.length === 0) {
      failed.push({ line: lineIdx + 1, error: 'Debe tener al menos 1 perfil' });
      continue;
    }

    const hasInvalidProfile = accountInput.profiles.some(p => !p.name || p.name.trim() === '');
    if (hasInvalidProfile) {
      failed.push({ line: lineIdx + 1, error: 'Todos los perfiles deben tener nombre' });
      continue;
    }

    try {
      const batch = db.batch();
      const accountRef = db.collection('services').doc(serviceId).collection('accounts').doc();
      const profileCount = accountInput.profiles.length;

      batch.set(accountRef, {
        serviceId,
        tenantId,
        email: accountInput.email,
        credential: {
          email: accountInput.email,
          password: accountInput.password,
        },
        label: accountInput.label || '',
        status: 'available',
        totalProfiles: profileCount,
        availableProfiles: profileCount,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      for (const profile of accountInput.profiles) {
        const profileRef = accountRef.collection('profiles').doc();
        batch.set(profileRef, {
          name: profile.name.trim(),
          pin: profile.pin || null,
          status: 'available',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        profilesCreated++;
      }

      await batch.commit();
      accountsCreated++;
    } catch (error) {
      console.error(`Error creating account at line ${lineIdx + 1}:`, error.message);
      failed.push({ line: lineIdx + 1, error: error.message });
    }
  }

  return {
    accountsCreated,
    profilesCreated,
    failed,
  };
});

const updateTicketCredentials = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { ticketId, purchaseDocId, accountIndex, newEmail, newPassword, newProfileName, newProfilePin } = data;
  if (!ticketId) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId es requerido');
  }

  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  const role = userData?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo administradores pueden actualizar credenciales');
  }

  // Si tiene purchaseDocId y accountIndex, actualizar la compra real
  if (purchaseDocId && accountIndex !== undefined && accountIndex !== null) {
    const purchaseRef = db.collection('purchases').doc(purchaseDocId);
    const purchaseDoc = await purchaseRef.get();

    if (!purchaseDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Venta no encontrada');
    }

    const purchaseData = purchaseDoc.data();
    const profiles = purchaseData.profiles || [];

    if (profiles.length > 0) {
      // Bulk: actualizar profiles[accountIndex]
      if (accountIndex >= profiles.length) {
        throw new functions.https.HttpsError('invalid-argument', `Índice ${accountIndex} fuera de rango. Solo hay ${profiles.length} perfiles`);
      }

      const credentials = purchaseData.credentials || [];
      const profileUpdate = { ...profiles[accountIndex] };
      if (newEmail !== undefined) profileUpdate.credential = { ...profileUpdate.credential, email: newEmail };
      if (newPassword !== undefined) profileUpdate.credential = { ...profileUpdate.credential, password: newPassword };
      if (newProfileName !== undefined) profileUpdate.profileName = newProfileName;
      if (newProfilePin !== undefined) profileUpdate.profilePin = newProfilePin;

      const updatedProfiles = [...profiles];
      updatedProfiles[accountIndex] = profileUpdate;

      const updatedCredentials = [...credentials];
      if (updatedCredentials[accountIndex]) {
        updatedCredentials[accountIndex] = { ...profileUpdate.credential };
      }

      await purchaseRef.update({
        profiles: updatedProfiles,
        credentials: updatedCredentials,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } else if (purchaseData.accountId && purchaseData.serviceId) {
      // Single: actualizar cuenta y guardar credenciales inline en el purchaseDoc
      const accountRef = db.collection('services').doc(purchaseData.serviceId).collection('accounts').doc(purchaseData.accountId);
      const accountUpdate = {};
      if (newEmail !== undefined || newPassword !== undefined) {
        accountUpdate.credential = {};
        if (newEmail !== undefined) accountUpdate.credential.email = newEmail;
        if (newPassword !== undefined) accountUpdate.credential.password = newPassword;
      }
      if (Object.keys(accountUpdate).length > 0) {
        await accountRef.update(accountUpdate);
      }

      // Guardar también inline en el purchaseDoc para que el cliente lo vea en MisServicios
      const purchaseUpdate = {};
      if (newEmail !== undefined || newPassword !== undefined) {
        purchaseUpdate.credential = {};
        if (newEmail !== undefined) purchaseUpdate.credential.email = newEmail;
        if (newPassword !== undefined) purchaseUpdate.credential.password = newPassword;
      }
      if (newProfileName !== undefined) purchaseUpdate.profileName = newProfileName;
      if (newProfilePin !== undefined) purchaseUpdate.profilePin = newProfilePin;
      if (Object.keys(purchaseUpdate).length > 0) {
        purchaseUpdate.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await purchaseRef.update(purchaseUpdate);
      }
    }
  }

  // Actualizar ticket siempre
  const newCreds = {};
  if (newEmail !== undefined) newCreds.email = newEmail;
  if (newPassword !== undefined) newCreds.password = newPassword;
  if (newProfileName !== undefined) newCreds.profileName = newProfileName;
  if (newProfilePin !== undefined) newCreds.profilePin = newProfilePin;

  await db.collection('tickets').doc(ticketId).update({
    newCredentials: newCreds,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true };
});

const adminUpdateTicket = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const userDoc = await db.collection('users').doc(context.auth.uid).get();
  const userData = userDoc.data();
  const role = userData?.role;
  if (role !== 'admin' && role !== 'superadmin') {
    throw new functions.https.HttpsError('permission-denied', 'Solo administradores');
  }
  const { ticketId, ...fields } = data;
  if (!ticketId) {
    throw new functions.https.HttpsError('invalid-argument', 'ticketId es requerido');
  }
  const updateData = { ...fields, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  await db.collection('tickets').doc(ticketId).update(updateData);
  return { success: true };
});

module.exports = { getPublicAccount, createAccountWithProfiles, updateTicketCredentials, adminUpdateTicket };
