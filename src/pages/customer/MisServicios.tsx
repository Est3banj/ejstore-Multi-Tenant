import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Server, Copy, RefreshCw, AlertTriangle, Loader,
  Check, X, ClipboardCheck, History, ShoppingBag, Ticket,
  Sparkles
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useApp } from '../../context/AppContext';
import {
  getPurchases,
  processPurchase,
  extraerCodigo,
} from '../../services/marketplace';
import type { Purchase, ExtraerCodigoResponse } from '../../types/marketplace';
import Movimientos from './Movimientos';
import Reportar from './Reportar';

interface PurchaseItem extends Purchase {
  credential?: {
    email: string;
    password: string;
    extra?: Record<string, string>;
  };
}

const MisServicios = () => {
  const { customer, refreshCustomer } = useAuthStore();
  const { tenant, userTenantId } = useApp();
  const tenantId = tenant?.id || userTenantId;

  const [purchases, setPurchases] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'servicios' | 'movimientos' | 'reportar'>('servicios');
  const [processing, setProcessing] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [codeResult, setCodeResult] = useState<{ purchaseId: string; data: ExtraerCodigoResponse } | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);
  const [reportServiceId, setReportServiceId] = useState<string | null>(null);

  const showToast = (msg: string, type: 'error' | 'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (customer?.uid) loadPurchases();
    else setLoading(false);
  }, [customer?.uid]);

  const loadPurchases = async () => {
    if (!customer?.uid) return;
    setLoading(true);
    try {
      const data = await getPurchases(customer.uid);
      data.sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1;
        if (b.status === 'active' && a.status !== 'active') return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      setPurchases(data as PurchaseItem[]);
    } catch (error) {
      console.error('Error loading purchases:', error);
      showToast('Error al cargar servicios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleExtraerCodigo = async (purchaseId: string) => {
    setProcessing(purchaseId);
    try {
      const result = await extraerCodigo({ purchaseId });
      setCodeResult({ purchaseId, data: result });
    } catch (error) {
      console.error('Error extracting code:', error);
      showToast('Error al extraer código', 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleRenovar = async (serviceId: string, purchaseId: string) => {
    if (!tenantId) return;
    setProcessing(purchaseId);
    try {
      await processPurchase({ serviceId, tenantId });
      await loadPurchases();
      await refreshCustomer();
      showToast('¡Servicio renovado exitosamente!', 'success');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error al renovar';
      showToast(msg, 'error');
    } finally {
      setProcessing(null);
    }
  };

  const handleReportar = (serviceId: string) => {
    setReportServiceId(serviceId);
    setActiveTab('reportar');
  };

  const formatCredential = (c: { email: string; password: string; extra?: Record<string, string> }) => {
    let text = `Correo: ${c.email}\nClave: ${c.password}`;
    if (c.extra) {
      Object.entries(c.extra).forEach(([k, v]) => { text += `\n${k}: ${v}`; });
    }
    return text;
  };

  const tabs = [
    { key: 'servicios' as const, label: 'Mis Servicios', icon: Server },
    { key: 'movimientos' as const, label: 'Movimientos', icon: History },
    { key: 'reportar' as const, label: 'Reportar', icon: Ticket },
  ];

  return (
    <div className="p-4 md:p-6">
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-white">Mis Servicios</h1>
        <p className="text-white/60 text-sm">Gestioná tus servicios comprados</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all ${
              activeTab === key
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                : 'bg-white/10 text-white/60 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'servicios' && (
        <>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-8 h-8 animate-spin text-primary-400" />
            </div>
          ) : purchases.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass p-12 text-center"
            >
              <ShoppingBag size={48} className="mx-auto text-white/20 mb-4" />
              <p className="text-white/50">Todavía no tenés servicios comprados.</p>
              <p className="text-white/30 text-sm mt-1">Visitá la tienda para adquirir servicios.</p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {purchases.map((purchase, idx) => (
                <motion.div
                  key={purchase.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`glass p-4 rounded-xl border ${
                    purchase.status === 'active'
                      ? 'border-green-500/30'
                      : purchase.status === 'expired'
                      ? 'border-yellow-500/30'
                      : 'border-red-500/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-white font-semibold truncate">{purchase.serviceName}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          purchase.status === 'active'
                            ? 'bg-green-500/20 text-green-400'
                            : purchase.status === 'expired'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}>
                          {purchase.status === 'active' ? 'Activo' : purchase.status === 'expired' ? 'Vencido' : purchase.status}
                        </span>
                      </div>

                      {purchase.credential && (
                        <div className="glass-dark p-3 rounded-lg mt-2">
                          <pre className="text-white/70 text-xs whitespace-pre-wrap font-mono">
                            {formatCredential(purchase.credential)}
                          </pre>
                        </div>
                      )}

                      {/* Link público auto-generado */}
                      {purchase.linkTokens && purchase.linkTokens.length > 0 && (
                        <div className="mt-2 flex items-center justify-between bg-primary-500/10 border border-primary-500/20 rounded-lg px-3 py-2">
                          <code className="text-xs text-primary-400 truncate max-w-[200px]">
                            ?token={purchase.linkTokens[0]}
                          </code>
                          <button
                            onClick={() => {
                              const link = `${window.location.origin}/?token=${purchase.linkTokens![0]}`;
                              navigator.clipboard.writeText(link).catch(() => {});
                            }}
                            className="text-xs text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1"
                          >
                            <Copy size={12} />
                            Copiar link
                          </button>
                        </div>
                      )}

                      {!purchase.linkTokens && purchase.credential && (
                        <div className="mt-2 text-xs text-gray-600 italic">URL: no aplica</div>
                      )}

                      <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                        <span>${purchase.price.toLocaleString()}</span>
                        <span>{new Date(purchase.createdAt).toLocaleDateString('es-CO')}</span>
                        {purchase.expiresAt && (
                          <span>Expira: {new Date(purchase.expiresAt).toLocaleDateString('es-CO')}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 shrink-0">
                      {purchase.credential && (
                        <button
                          onClick={() => handleCopy(purchase.id, formatCredential(purchase.credential!))}
                          className="p-2 rounded-lg bg-white/10 text-white/60 hover:text-white hover:bg-white/20 transition-all"
                          title="Copiar credenciales"
                        >
                          {copiedId === purchase.id ? (
                            <ClipboardCheck size={16} className="text-green-400" />
                          ) : (
                            <Copy size={16} />
                          )}
                        </button>
                      )}
                      {purchase.status === 'active' && (
                        <>
                          <button
                            onClick={() => handleExtraerCodigo(purchase.id)}
                            disabled={processing === purchase.id}
                            className="p-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30 disabled:opacity-50 transition-all"
                            title="Extraer código"
                          >
                            {processing === purchase.id ? (
                              <Loader className="w-4 h-4 animate-spin" />
                            ) : (
                              <RefreshCw size={16} />
                            )}
                          </button>
                          <button
                            onClick={() => handleRenovar(purchase.serviceId, purchase.id)}
                            disabled={processing === purchase.id}
                            className="p-2 rounded-lg bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 disabled:opacity-50 transition-all"
                            title="Renovar"
                          >
                            <Sparkles size={16} />
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleReportar(purchase.serviceId)}
                        className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                        title="Reportar problema"
                      >
                        <AlertTriangle size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Code extraction result */}
                  {codeResult?.purchaseId === purchase.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 p-3 bg-green-500/10 border border-green-500/30 rounded-lg"
                    >
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-green-400 font-medium text-sm mb-1">Código extraído</p>
                          <p className="text-white font-mono text-lg break-all">{codeResult.data.code}</p>
                          {codeResult.data.from && (
                            <p className="text-white/50 text-xs mt-1">De: {codeResult.data.from}</p>
                          )}
                          {codeResult.data.subject && (
                            <p className="text-white/50 text-xs">Asunto: {codeResult.data.subject}</p>
                          )}
                          {codeResult.data.extractedAt && (
                            <p className="text-white/30 text-xs mt-1">
                              {new Date(codeResult.data.extractedAt).toLocaleString('es-CO')}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setCodeResult(null)}
                          className="text-white/40 hover:text-white shrink-0"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      <button
                        onClick={() => handleCopy(purchase.id + '-code', codeResult.data.code)}
                        className="mt-2 flex items-center gap-1 text-xs text-white/60 hover:text-white transition-all"
                      >
                        {copiedId === purchase.id + '-code' ? (
                          <><Check size={12} className="text-green-400" /> Copiado</>
                        ) : (
                          <><Copy size={12} /> Copiar código</>
                        )}
                      </button>
                    </motion.div>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {activeTab === 'movimientos' && (
        <Movimientos purchases={purchases} />
      )}

      {activeTab === 'reportar' && (
        <Reportar purchases={purchases} selectedServiceId={reportServiceId} />
      )}

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className={`fixed top-20 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl z-50 ${
            toast.type === 'error'
              ? 'bg-red-500/90 text-white'
              : 'bg-green-500/90 text-white'
          }`}
        >
          <p className="font-medium text-sm">{toast.msg}</p>
        </motion.div>
      )}
    </div>
  );
};

export default MisServicios;
