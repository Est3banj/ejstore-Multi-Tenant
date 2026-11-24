const { createModuleLogger } = require('../config');

const log = createModuleLogger('monitoring');

const NO_OP = process.env.SKIP_GCP_MONITORING === '1' || !!process.env.VERCEL;

let monitoringClient = null;
let projectId = null;

function getClient() {
  if (NO_OP) {
    return null;
  }
  if (!monitoringClient) {
    const { MonitoringClient } = require('@google-cloud/monitoring');
    monitoringClient = new MonitoringClient();
  }
  return monitoringClient;
}

function getProjectId() {
  if (!projectId) {
    projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || 'ejstore-web';
  }
  return projectId;
}

function getProjectPath() {
  return `projects/${getProjectId()}`;
}

const METRIC_TYPE_PREFIX = 'custom.googleapis.com/ejstore';

const METRICS = {
  PURCHASE_LATENCY_MS: `${METRIC_TYPE_PREFIX}/purchase_latency_ms`,
  PURCHASE_SUCCESS_TOTAL: `${METRIC_TYPE_PREFIX}/purchase_success_total`,
  PURCHASE_ERROR_TOTAL: `${METRIC_TYPE_PREFIX}/purchase_error_total`,
  RECHARGE_LATENCY_MS: `${METRIC_TYPE_PREFIX}/recharge_latency_ms`,
  RECHARGE_SUCCESS_TOTAL: `${METRIC_TYPE_PREFIX}/recharge_success_total`,
  WEBHOOK_LATENCY_MS: `${METRIC_TYPE_PREFIX}/webhook_latency_ms`,
  WEBHOOK_ERROR_TOTAL: `${METRIC_TYPE_PREFIX}/webhook_error_total`,
  ERROR_TOTAL: `${METRIC_TYPE_PREFIX}/error_total`,
  ERROR_BY_CODE_TOTAL: `${METRIC_TYPE_PREFIX}/error_by_code_total`,
  ERROR_BY_FUNCTION_TOTAL: `${METRIC_TYPE_PREFIX}/error_by_function_total`,
};

async function createMetricDescriptor(metricType, metricKind, valueType, description, labels = []) {
  const client = getClient();
  const projectPath = getProjectPath();

  const descriptor = {
    type: metricType,
    metricKind,
    valueType,
    description,
    labels: labels.map(label => ({
      key: label.key,
      valueType: label.valueType || 'STRING',
      description: label.description || '',
    })),
  };

  try {
    await client.createMetricDescriptor({ name: projectPath, metricDescriptor: descriptor });
    log.info({ metricType }, 'Metric descriptor created');
  } catch (error) {
    if (error.code === 6) {
      log.debug({ metricType }, 'Metric descriptor already exists');
    } else {
      log.error({ err: error, metricType }, 'Failed to create metric descriptor');
      throw error;
    }
  }
}

async function registerAllMetricDescriptors() {
  if (NO_OP) return;
  const descriptors = [
    {
      type: METRICS.PURCHASE_LATENCY_MS,
      metricKind: 'GAUGE',
      valueType: 'DISTRIBUTION',
      description: 'Purchase operation latency in milliseconds',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Operation type (purchase, bulk_purchase)' },
        { key: 'status', description: 'Operation status (success, error)' },
      ],
    },
    {
      type: METRICS.PURCHASE_SUCCESS_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total successful purchases',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Operation type (purchase, bulk_purchase)' },
      ],
    },
    {
      type: METRICS.PURCHASE_ERROR_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total purchase errors',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Operation type (purchase, bulk_purchase)' },
        { key: 'error_code', description: 'Error code' },
      ],
    },
    {
      type: METRICS.RECHARGE_LATENCY_MS,
      metricKind: 'GAUGE',
      valueType: 'DISTRIBUTION',
      description: 'Recharge operation latency in milliseconds',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Operation type (create, process, check_payment)' },
        { key: 'status', description: 'Operation status (success, error)' },
      ],
    },
    {
      type: METRICS.RECHARGE_SUCCESS_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total successful recharges',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Operation type (create, process, check_payment)' },
      ],
    },
    {
      type: METRICS.WEBHOOK_LATENCY_MS,
      metricKind: 'GAUGE',
      valueType: 'DISTRIBUTION',
      description: 'Webhook processing latency in milliseconds',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Webhook type (telegram, email)' },
        { key: 'status', description: 'Operation status (success, error)' },
      ],
    },
    {
      type: METRICS.WEBHOOK_ERROR_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total webhook errors',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'operation', description: 'Webhook type (telegram, email)' },
        { key: 'error_code', description: 'Error code' },
      ],
    },
    {
      type: METRICS.ERROR_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total errors across all functions',
      labels: [
        { key: 'tenantId', description: 'Tenant identifier' },
        { key: 'function', description: 'Function name' },
        { key: 'error_code', description: 'Error code' },
      ],
    },
    {
      type: METRICS.ERROR_BY_CODE_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total errors by error code',
      labels: [
        { key: 'error_code', description: 'Error code' },
        { key: 'function', description: 'Function name' },
      ],
    },
    {
      type: METRICS.ERROR_BY_FUNCTION_TOTAL,
      metricKind: 'CUMULATIVE',
      valueType: 'INT64',
      description: 'Total errors by function',
      labels: [
        { key: 'function', description: 'Function name' },
        { key: 'tenantId', description: 'Tenant identifier' },
      ],
    },
  ];

  for (const desc of descriptors) {
    await createMetricDescriptor(
      desc.type,
      desc.metricKind,
      desc.valueType,
      desc.description,
      desc.labels
    );
  }

  log.info('All metric descriptors registered');
}

function createTimeSeries(metricType, labels, value, timestamp = new Date()) {
  const client = getClient();

  const interval = {
    endTime: {
      seconds: Math.floor(timestamp.getTime() / 1000),
      nanos: (timestamp.getTime() % 1000) * 1e6,
    },
  };

  const point = {
    interval,
    value: {},
  };

  if (typeof value === 'object' && value.bucketCounts) {
    point.value.distributionValue = value;
  } else if (typeof value === 'number') {
    point.value.int64Value = value.toString();
  } else {
    point.value.int64Value = '1';
  }

  const timeSeries = {
    metric: {
      type: metricType,
      labels,
    },
    points: [point],
  };

  return timeSeries;
}

async function recordPurchaseLatency(tenantId, operation, status, latencyMs) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
      status,
    };

    const distribution = {
      bucketOptions: {
        exponentialBuckets: {
          numFiniteBuckets: 20,
          growthFactor: 2.0,
          scale: 10.0,
        },
      },
      bucketCounts: [],
      exemplar: [],
    };

    const bucketIndex = Math.min(
      Math.floor(Math.log2(latencyMs / 10)) + 10,
      distribution.bucketOptions.exponentialBuckets.numFiniteBuckets - 1
    );
    distribution.bucketCounts[bucketIndex] = (distribution.bucketCounts[bucketIndex] || 0) + 1;

    const timeSeries = createTimeSeries(METRICS.PURCHASE_LATENCY_MS, labels, distribution);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record purchase latency');
  }
}

async function recordPurchaseSuccess(tenantId, operation) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
    };

    const timeSeries = createTimeSeries(METRICS.PURCHASE_SUCCESS_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record purchase success');
  }
}

async function recordPurchaseError(tenantId, operation, errorCode) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
      error_code: errorCode || 'unknown',
    };

    const timeSeries = createTimeSeries(METRICS.PURCHASE_ERROR_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record purchase error');
  }
}

async function recordRechargeLatency(tenantId, operation, status, latencyMs) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
      status,
    };

    const distribution = {
      bucketOptions: {
        exponentialBuckets: {
          numFiniteBuckets: 20,
          growthFactor: 2.0,
          scale: 10.0,
        },
      },
      bucketCounts: [],
      exemplar: [],
    };

    const bucketIndex = Math.min(
      Math.floor(Math.log2(latencyMs / 10)) + 10,
      distribution.bucketOptions.exponentialBuckets.numFiniteBuckets - 1
    );
    distribution.bucketCounts[bucketIndex] = (distribution.bucketCounts[bucketIndex] || 0) + 1;

    const timeSeries = createTimeSeries(METRICS.RECHARGE_LATENCY_MS, labels, distribution);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record recharge latency');
  }
}

async function recordRechargeSuccess(tenantId, operation) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
    };

    const timeSeries = createTimeSeries(METRICS.RECHARGE_SUCCESS_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record recharge success');
  }
}

async function recordWebhookLatency(tenantId, operation, status, latencyMs) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
      status,
    };

    const distribution = {
      bucketOptions: {
        exponentialBuckets: {
          numFiniteBuckets: 20,
          growthFactor: 2.0,
          scale: 10.0,
        },
      },
      bucketCounts: [],
      exemplar: [],
    };

    const bucketIndex = Math.min(
      Math.floor(Math.log2(latencyMs / 10)) + 10,
      distribution.bucketOptions.exponentialBuckets.numFiniteBuckets - 1
    );
    distribution.bucketCounts[bucketIndex] = (distribution.bucketCounts[bucketIndex] || 0) + 1;

    const timeSeries = createTimeSeries(METRICS.WEBHOOK_LATENCY_MS, labels, distribution);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record webhook latency');
  }
}

async function recordWebhookError(tenantId, operation, errorCode) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      operation,
      error_code: errorCode || 'unknown',
    };

    const timeSeries = createTimeSeries(METRICS.WEBHOOK_ERROR_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, operation }, 'Failed to record webhook error');
  }
}

async function recordError(tenantId, functionName, errorCode) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      tenantId: tenantId || 'unknown',
      function: functionName,
      error_code: errorCode || 'unknown',
    };

    const timeSeries = createTimeSeries(METRICS.ERROR_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, tenantId, function: functionName }, 'Failed to record error');
  }
}

async function recordErrorByCode(errorCode, functionName) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      error_code: errorCode || 'unknown',
      function: functionName,
    };

    const timeSeries = createTimeSeries(METRICS.ERROR_BY_CODE_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, function: functionName }, 'Failed to record error by code');
  }
}

async function recordErrorByFunction(functionName, tenantId) {
  if (NO_OP) return;
  try {
    const client = getClient();
    const labels = {
      function: functionName,
      tenantId: tenantId || 'unknown',
    };

    const timeSeries = createTimeSeries(METRICS.ERROR_BY_FUNCTION_TOTAL, labels, 1);
    await client.createTimeSeries({ name: getProjectPath(), timeSeries: [timeSeries] });
  } catch (error) {
    log.error({ err: error, function: functionName }, 'Failed to record error by function');
  }
}

function measureLatency(fn, metricRecorder, tenantId, operation) {
  return async (...args) => {
    const startTime = Date.now();
    let status = 'success';
    try {
      const result = await fn(...args);
      return result;
    } catch (error) {
      status = 'error';
      throw error;
    } finally {
      const latencyMs = Date.now() - startTime;
      await metricRecorder(tenantId, operation, status, latencyMs);
    }
  };
}

module.exports = {
  getClient,
  getProjectId,
  getProjectPath,
  METRICS,
  registerAllMetricDescriptors,
  recordPurchaseLatency,
  recordPurchaseSuccess,
  recordPurchaseError,
  recordRechargeLatency,
  recordRechargeSuccess,
  recordWebhookLatency,
  recordWebhookError,
  recordError,
  recordErrorByCode,
  recordErrorByFunction,
  measureLatency,
};