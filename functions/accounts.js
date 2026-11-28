const { admin, db, createModuleLogger } = require('./config');
const { HttpsError } = require('./services/httpsError');
const { generateVerificationCode } = require('./utils/crypto');
const { notifyTicketResolvedOnce } = require('./services/notificationTriggers');
const { getUserRole } = require('./auth');
const { createPublicLinkHandlers } = require('./services/publicLinks');
const { resolvePublicLink, createPublicLink } = createPublicLinkHandlers(db);

const log = createModuleLogger('accounts');

async function getPublicAccount(data, context) {
  try {
    const link = await resolvePublicLink(data);

    const svcName = (link.serviceName || '').toLowerCase();
    const codigo = generateVerificationCode(6);
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
        status: 'active',
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
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
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'Error al obtener la cuenta');
  }
}

async function createAccountWithProfiles(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const claims = context.auth.token;
  if (claims.role !== 'superadmin' && claims.role !== 'admin') {
    throw new HttpsError('permission-denied', 'No tiene permisos de admin');
  }

  const { serviceId, tenantId, accounts } = data;

  if (!serviceId || !tenantId || !accounts || !Array.isArray(accounts) || accounts.length === 0) {
    throw new HttpsError('invalid-argument',
      'serviceId, tenantId y accounts (array no vacío) son requeridos'
    );
  }

  if (claims.role !== 'superadmin' && claims.tenantId !== tenantId) {
    throw new HttpsError('permission-denied', 'No tiene acceso a este tenant');
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
}

async function updateTicketCredentials(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }

  const { ticketId, purchaseDocId, accountIndex, newEmail, newPassword, newProfileName, newProfilePin } = data;
  if (!ticketId) {
    throw new HttpsError('invalid-argument', 'ticketId es requerido');
  }

  const { role, tenantId: callerTenantId } = await getUserRole(context.auth.uid);
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo administradores pueden actualizar credenciales');
  }

  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketDoc = await ticketRef.get();
  if (!ticketDoc.exists) {
    throw new HttpsError('not-found', 'Ticket no encontrado', { code: 'TICKET_NO_ENCONTRADO' });
  }
  const ticketData = ticketDoc.data();
  if (role !== 'superadmin' && ticketData.tenantId !== callerTenantId) {
    throw new HttpsError('permission-denied', 'No autorizado para esta operación', { code: 'NO_AUTORIZADO' });
  }

  // Si tiene purchaseDocId y accountIndex, actualizar la compra real
  if (purchaseDocId && accountIndex !== undefined && accountIndex !== null) {
    const purchaseRef = db.collection('purchases').doc(purchaseDocId);
    const purchaseDoc = await purchaseRef.get();

    if (!purchaseDoc.exists) {
      throw new HttpsError('not-found', 'Venta no encontrada');
    }

    const purchaseData = purchaseDoc.data();
    if (role !== 'superadmin' && purchaseData.tenantId !== callerTenantId) {
      throw new HttpsError('permission-denied', 'No autorizado para esta operación', { code: 'NO_AUTORIZADO' });
    }
    const profiles = purchaseData.profiles || [];

    if (profiles.length > 0) {
      // Bulk: actualizar profiles[accountIndex]
      if (accountIndex >= profiles.length) {
        throw new HttpsError('invalid-argument', `Índice ${accountIndex} fuera de rango. Solo hay ${profiles.length} perfiles`);
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
}

async function adminUpdateTicket(data, context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'Debe iniciar sesión');
  }
  const { role, tenantId: callerTenantId } = await getUserRole(context.auth.uid);
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Solo administradores');
  }
  const { ticketId, status, adminNotes } = data;
  if (!ticketId) {
    throw new HttpsError('invalid-argument', 'ticketId es requerido');
  }

  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketDoc = await ticketRef.get();
  if (!ticketDoc.exists) {
    throw new HttpsError('not-found', 'Ticket no encontrado', { code: 'TICKET_NO_ENCONTRADO' });
  }
  const ticketData = ticketDoc.data();
  if (role !== 'superadmin' && ticketData.tenantId !== callerTenantId) {
    throw new HttpsError('permission-denied', 'No autorizado para esta operación', { code: 'NO_AUTORIZADO' });
  }

  const updateData = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
  if (status !== undefined) updateData.status = status;
  if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
  await ticketRef.update(updateData);

  // T4-gap fold (T5.4 pattern): the admin UI resolves tickets through this
  // callable, not updateTicket — without this call the T4 notification
  // (telegram reseller+admin + email) would never fire on the real flow.
  if (status === 'resolved') {
    notifyTicketResolvedOnce(ticketId).catch((err) => {
      log.warn({ err, ticketId }, 'Post-write ticket resolution notification failed');
    });
  }

  return { success: true };
}

module.exports = { getPublicAccount, createPublicLink, createAccountWithProfiles, updateTicketCredentials, adminUpdateTicket };
