const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');

let secretManagerClient = null;

// Use Web Crypto API for secure random generation
const crypto = globalThis.crypto || require('crypto').webcrypto;

function getClient() {
  if (!secretManagerClient) {
    try {
      secretManagerClient = new SecretManagerServiceClient();
    } catch (error) {
      console.error('[SecretManager] Failed to initialize client:', error);
      throw error;
    }
  }
  return secretManagerClient;
}

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'ejstore-web';

function secretPath(secretId, version = 'latest') {
  return `projects/${PROJECT_ID}/secrets/${secretId}/versions/${version}`;
}

async function getSecret(secretId, version) {
  try {
    const client = getClient();
    const name = secretPath(secretId, version || 'latest');
    const [accessResponse] = await client.accessSecretVersion({ name });
    const payload = accessResponse.payload?.data?.toString('utf8');
    return payload || null;
  } catch (error) {
    const err = error;
    console.error(`[SecretManager] Error accessing secret ${secretId}:`, err.message);
    throw error;
  }
}

async function setSecret(secretId, payload) {
  try {
    const client = getClient();
    const parent = `projects/${PROJECT_ID}`;
    
    try {
      await client.getSecret({ name: `${parent}/secrets/${secretId}` });
    } catch (error) {
      const err = error;
      if (err.code === 5) {
        await client.createSecret({
          parent,
          secretId,
          secret: { replication: { automatic: {} } },
        });
      } else {
        throw error;
      }
    }

    await client.addSecretVersion({
      parent: `${parent}/secrets/${secretId}`,
      payload: { data: Buffer.from(payload, 'utf8') },
    });
  } catch (error) {
    console.error(`[SecretManager] Error setting secret ${secretId}:`, error);
    throw error;
  }
}

async function listSecrets(prefix = '') {
  try {
    const client = getClient();
    const parent = `projects/${PROJECT_ID}`;
    const [secrets] = await client.listSecrets({ parent });
    return secrets
      .filter((s) => s.name && s.name.includes(`secrets/${prefix}`))
      .map((s) => s.name.split('/').pop() || '');
  } catch (error) {
    console.error('[SecretManager] Error listing secrets:', error);
    throw error;
  }
}

async function deleteSecret(secretId) {
  try {
    const client = getClient();
    await client.deleteSecret({ name: `projects/${PROJECT_ID}/secrets/${secretId}` });
  } catch (error) {
    console.error(`[SecretManager] Error deleting secret ${secretId}:`, error);
    throw error;
  }
}

async function rotateIMAPSecret(tenantId, newPassword) {
  try {
    const secretId = `imap-${tenantId}`;
    const currentSecret = await getSecret(secretId);
    if (!currentSecret) {
      throw new Error(`No IMAP secret found for tenant ${tenantId}`);
    }

    const config = JSON.parse(currentSecret);
    config.password = newPassword;
    config.rotatedAt = new Date().toISOString();
    config.rotatedBy = 'system';

    await setSecret(secretId, JSON.stringify(config));

    // Lazy require: breaks the secretManager↔connectionPool cycle that left
    // connectionPool's getSecret undefined (SMTP/IMAP silently broken).
    const { imapPool } = require('./connectionPool');
    const poolKey = `imap-${tenantId}`;
    const pool = imapPool.pools.get(poolKey);
    if (pool) {
      for (const conn of pool.values()) {
        try {
          await conn.client.logout();
        } catch (e) {
          console.warn(`[SecretManager] Error closing IMAP connection ${conn.id}:`, e.message);
        }
      }
      pool.clear();
    }

    console.log(`[SecretManager] IMAP secret rotated for tenant ${tenantId}`);
    return { success: true };
  } catch (error) {
    console.error(`[SecretManager] Error rotating IMAP secret for tenant ${tenantId}:`, error);
    throw error;
  }
}

async function rotateSMTPSecret(tenantId, newPassword) {
  try {
    const secretId = `smtp-${tenantId}`;
    const currentSecret = await getSecret(secretId);
    if (!currentSecret) {
      throw new Error(`No SMTP secret found for tenant ${tenantId}`);
    }

    const config = JSON.parse(currentSecret);
    config.pass = newPassword;
    config.rotatedAt = new Date().toISOString();
    config.rotatedBy = 'system';

    await setSecret(secretId, JSON.stringify(config));

    // Lazy require: breaks the secretManager↔connectionPool cycle (see rotateIMAPSecret).
    const { smtpPool } = require('./connectionPool');
    const poolKey = `smtp-${tenantId}`;
    const transporter = smtpPool.transporters.get(poolKey);
    if (transporter) {
      try {
        transporter.close();
      } catch (e) {
        console.warn(`[SecretManager] Error closing SMTP transporter ${poolKey}:`, e.message);
      }
      smtpPool.transporters.delete(poolKey);
    }

    console.log(`[SecretManager] SMTP secret rotated for tenant ${tenantId}`);
    return { success: true };
  } catch (error) {
    console.error(`[SecretManager] Error rotating SMTP secret for tenant ${tenantId}:`, error);
    throw error;
  }
}

async function generateAndRotateSecret(tenantId, type = 'imap') {
  const newPassword = generateSecurePassword();
  
  if (type === 'imap') {
    await rotateIMAPSecret(tenantId, newPassword);
  } else if (type === 'smtp') {
    await rotateSMTPSecret(tenantId, newPassword);
  } else {
    throw new Error(`Unsupported secret type: ${type}`);
  }

  return newPassword;
}

function generateSecurePassword(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  const randomValues = new Uint32Array(length);
  crypto.getRandomValues(randomValues);
  
  for (let i = 0; i < length; i++) {
    password += chars[randomValues[i] % chars.length];
  }
  
  return password;
}

module.exports = { 
  getSecret, 
  setSecret, 
  listSecrets, 
  deleteSecret, 
  getClient,
  rotateIMAPSecret,
  rotateSMTPSecret,
  generateAndRotateSecret,
};