const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const { getMailConfig, resolveSmtpConfig } = require('./mailConfig');

const IMAP_POOL_MAX = 5;
const SMTP_POOL_MAX = 10;
const CONNECTION_TTL_MS = 60 * 1000;
const HEALTH_CHECK_INTERVAL_MS = 30 * 1000;

class IMAPConnectionPool {
  constructor() {
    this.pools = new Map();
    this.healthCheckTimers = new Map();
    this.shuttingDown = false;
    this.inFlightRequests = 0;
  }

  async drain(timeoutMs = 30000) {
    const startTime = Date.now();
    while (this.inFlightRequests > 0) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[IMAP Pool] Drain timeout after ${timeoutMs}ms, ${this.inFlightRequests} requests still in-flight`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  incrementInFlight() {
    this.inFlightRequests++;
  }

  decrementInFlight() {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
  }

  // Pool key incluye el docId de configuración: códigos (emailConfig) y pagos
  // (emailConfigPayments) son buzones separados — antes ambos pisaban el mismo
  // secret `imap-{tenantId}` (bug pre-cutover, corregido en este batch).
  getPoolKey(tenantId, docId = 'emailConfig') {
    return `imap-${tenantId}:${docId}`;
  }

  async getConnection(tenantId, docId = 'emailConfig') {
    const poolKey = this.getPoolKey(tenantId, docId);

    if (!this.pools.has(poolKey)) {
      await this.initializePool(tenantId, poolKey, docId);
    }

    const pool = this.pools.get(poolKey);
    if (!pool || pool.size === 0) {
      await this.initializePool(tenantId, poolKey, docId);
    }

    const available = Array.from(this.pools.get(poolKey).values())
      .find(c => c.status === 'idle' && c.isHealthy);
    
    if (available) {
      available.status = 'busy';
      available.lastUsed = Date.now();
      this.incrementInFlight();
      return available.client;
    }

    if (this.pools.get(poolKey).size < IMAP_POOL_MAX) {
      const conn = await this.createConnection(tenantId, poolKey, docId);
      this.incrementInFlight();
      return conn;
    }

    const oldest = Array.from(this.pools.get(poolKey).values())
      .sort((a, b) => a.lastUsed - b.lastUsed)[0];
    
    if (oldest && oldest.status === 'idle') {
      oldest.status = 'busy';
      oldest.lastUsed = Date.now();
      this.incrementInFlight();
      return oldest.client;
    }

    throw new Error('IMAP pool exhausted');
  }

  async initializePool(tenantId, poolKey, docId = 'emailConfig') {
    const config = await this.getIMAPConfig(tenantId, docId);
    if (!config) {
      throw new Error(`No IMAP config for tenant ${tenantId}`);
    }

    const pool = new Map();
    
    for (let i = 0; i < Math.min(2, IMAP_POOL_MAX); i++) {
      const conn = await this.createConnectionInternal(tenantId, config, poolKey);
      if (conn) {
        pool.set(conn.id, conn);
      }
    }

    this.pools.set(poolKey, pool);
    this.startHealthCheck(tenantId, poolKey, docId);
  }

  async createConnection(tenantId, poolKey, docId = 'emailConfig') {
    const config = await this.getIMAPConfig(tenantId, docId);
    if (!config) {
      throw new Error(`No IMAP config for tenant ${tenantId}`);
    }
    return await this.createConnectionInternal(tenantId, config, poolKey);
  }

  async createConnectionInternal(tenantId, config, poolKey = null) {
    const key = poolKey || this.getPoolKey(tenantId);
    const client = new ImapFlow({
      host: config.host || 'imap.gmail.com',
      port: config.port || 993,
      secure: true,
      auth: { user: config.email, pass: config.password },
      logger: false,
      timeout: 15000,
      tls: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true,
      },
    });

    await client.connect();
    
    const conn = {
      id: `${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      client,
      tenantId,
      status: 'idle',
      createdAt: Date.now(),
      lastUsed: Date.now(),
      isHealthy: true,
    };

    if (!this.pools.has(key)) {
      this.pools.set(key, new Map());
    }
    this.pools.get(key).set(conn.id, conn);
    
    return conn;
  }

  async getIMAPConfig(tenantId, docId = 'emailConfig') {
    const config = await getMailConfig(tenantId, docId);
    return config || null;
  }

  releaseConnection(tenantId, client) {
    // Localiza el pool que contiene el cliente entre todos los pools de este
    // proceso (claves imap-{tenant}:{docId}) — el docId correcto viaja en la
    // key del pool, no en la firma del release.
    for (const pool of this.pools.values()) {
      for (const conn of pool.values()) {
        if (conn.client === client) {
          conn.status = 'idle';
          conn.lastUsed = Date.now();
          this.decrementInFlight();
          return;
        }
      }
    }
  }

  startHealthCheck(tenantId, poolKey, docId = 'emailConfig') {
    if (process.env.VERCEL) return;
    if (this.healthCheckTimers.has(poolKey)) return;

    const timer = setInterval(async () => {
      if (this.shuttingDown) return;
      
      const pool = this.pools.get(poolKey);
      if (!pool) return;

      for (const [id, conn] of pool.entries()) {
        if (conn.status === 'busy') continue;
        
        try {
          await conn.client.mailboxOpen('INBOX');
          conn.isHealthy = true;
        } catch (e) {
          conn.isHealthy = false;
          console.warn(`[IMAP Pool] Health check failed for ${id}:`, e.message);
          
          try {
            await conn.client.logout();
          } catch {}
          pool.delete(id);
        }

        if (Date.now() - conn.lastUsed > CONNECTION_TTL_MS && conn.status === 'idle') {
          try {
            await conn.client.logout();
          } catch {}
          pool.delete(id);
        }
      }

      if (pool.size === 0) {
        try {
          await this.initializePool(tenantId, poolKey, docId);
        } catch (e) {
          console.error(`[IMAP Pool] Failed to reinitialize pool for ${tenantId}:`, e.message);
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);

    this.healthCheckTimers.set(poolKey, timer);
  }

  async shutdown() {
    this.shuttingDown = true;
    
    for (const [poolKey, timer] of this.healthCheckTimers.entries()) {
      clearInterval(timer);
    }
    this.healthCheckTimers.clear();

    for (const [poolKey, pool] of this.pools.entries()) {
      for (const conn of pool.values()) {
        try {
          await conn.client.logout();
        } catch (e) {
          console.error(`[IMAP Pool] Error closing connection ${conn.id}:`, e.message);
        }
      }
      pool.clear();
    }
    this.pools.clear();
  }
}

class SMTPConnectionPool {
  constructor() {
    this.transporters = new Map();
    this.shuttingDown = false;
    this.inFlightRequests = 0;
  }

  getPoolKey(tenantId) {
    return `smtp-${tenantId}`;
  }

  async getTransporter(tenantId) {
    const poolKey = this.getPoolKey(tenantId);
    
    if (!this.transporters.has(poolKey)) {
      await this.initializePool(tenantId, poolKey);
    }

    const transporter = this.transporters.get(poolKey);
    if (!transporter) {
      await this.initializePool(tenantId, poolKey);
    }

    this.incrementInFlight();
    return this.transporters.get(poolKey);
  }

  releaseTransporter() {
    this.decrementInFlight();
  }

  async drain(timeoutMs = 30000) {
    const startTime = Date.now();
    while (this.inFlightRequests > 0) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn(`[SMTP Pool] Drain timeout after ${timeoutMs}ms, ${this.inFlightRequests} requests still in-flight`);
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  incrementInFlight() {
    this.inFlightRequests++;
  }

  decrementInFlight() {
    this.inFlightRequests = Math.max(0, this.inFlightRequests - 1);
  }

  async initializePool(tenantId, poolKey) {
    const config = await this.getSMTPConfig(tenantId);
    if (!config) {
      throw new Error(`No SMTP config for tenant ${tenantId}`);
    }

    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port || 587,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      pool: true,
      maxConnections: SMTP_POOL_MAX,
      maxMessages: 100,
      rateDelta: 1000,
      rateLimit: 10,
    });

    transporter.verify((err) => {
      if (err) {
        console.error(`[SMTP Pool] Verification failed for ${tenantId}:`, err.message);
      } else {
        console.log(`[SMTP Pool] Transporter verified for ${tenantId}`);
      }
    });

    this.transporters.set(poolKey, transporter);
  }

  async getSMTPConfig(tenantId) {
    const config = await resolveSmtpConfig(tenantId);
    return config || null;
  }

  async shutdown() {
    this.shuttingDown = true;
    
    for (const [poolKey, transporter] of this.transporters.entries()) {
      try {
        transporter.close();
      } catch (e) {
        console.error(`[SMTP Pool] Error closing transporter ${poolKey}:`, e.message);
      }
    }
    this.transporters.clear();
  }
}

const imapPool = new IMAPConnectionPool();
const smtpPool = new SMTPConnectionPool();

async function shutdownAll() {
  console.log('[Connection Pool] Starting graceful shutdown...');
  await Promise.all([
    imapPool.drain(),
    smtpPool.drain(),
  ]);
  console.log('[Connection Pool] Drain complete, closing connections...');
  await Promise.all([
    imapPool.shutdown(),
    smtpPool.shutdown(),
  ]);
  console.log('[Connection Pool] Graceful shutdown complete');
}

process.on('SIGTERM', async () => {
  await shutdownAll();
  process.exit(0);
});
process.on('SIGINT', async () => {
  await shutdownAll();
  process.exit(0);
});

module.exports = {
  imapPool,
  smtpPool,
  shutdownAll,
};