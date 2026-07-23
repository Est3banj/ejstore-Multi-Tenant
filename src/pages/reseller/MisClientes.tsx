import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuthStore } from '../../store/authStore';
import { getResellerById, extraerCodigo } from '../../services/marketplace';
import type { ExtraerCodigoResponse } from '../../types/marketplace';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../services/firebase';
import {
  Plus, Copy, ShoppingBag,
  ChevronDown, ChevronRight, CheckCircle2,
  Mail, Loader2,
} from 'lucide-react';

interface PublicLink {
  id: string;
  token: string;
  accountInfo: Record<string, string>;
  serviceName: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'active' | 'expired';
}

interface PurchaseAccount {
  accountId: string;
  credential: Record<string, string>;
}

interface Purchase {
  id: string;
  customerEmail: string;
  serviceName: string;
  serviceId: string;
  createdAt: Date;
  quantity: number;
  total: number;
  accountIds: string[];
  credentials: Record<string, string>[];
  status: string;
  linkTokens?: string[];
}

const generateToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const MisClientes = (): JSX.Element => {
  const { user } = useAuthStore();
  const uid = user?.uid || '';
  const [publicLinks, setPublicLinks] = useState<PublicLink[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [resellerName, setResellerName] = useState('');
  const [expandedPurchase, setExpandedPurchase] = useState<string | null>(null);
  const [extractingCode, setExtractingCode] = useState<string | null>(null);
  const [codeResults, setCodeResults] = useState<Record<string, ExtraerCodigoResponse>>({});

  const loadData = async () => {
    if (!uid) return;
    try {
      const resellerData = await getResellerById(uid);
      if (resellerData) {
        setResellerName(resellerData.name || '');
      }

      // Load public links (from the global collection)
      const linksQuery = query(
        collection(db, 'public_links'),
        where('resellerId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      const linksSnapshot = await getDocs(linksQuery);
      const links: PublicLink[] = linksSnapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          token: d.id,
          accountInfo: data.credential || {},
          serviceName: data.serviceName || '',
          createdAt: data.createdAt?.toDate?.() || new Date(),
          expiresAt: data.expiresAt?.toDate?.() || new Date(),
          status: data.status || 'expired',
        };
      });
      setPublicLinks(links);

      // Load purchases (usando resellerId ahora)
      const purchasesQuery = query(
        collection(db, 'purchases'),
        where('resellerId', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(50)
      );
      try {
        const purchasesSnapshot = await getDocs(purchasesQuery);
        const purchasesList: Purchase[] = purchasesSnapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            customerEmail: data.customerEmail || 'Reseller',
            serviceName: data.serviceName || '',
            serviceId: data.serviceId || '',
            createdAt: data.createdAt?.toDate?.() || new Date(),
            quantity: data.quantity || 1,
            total: data.price || 0,
            accountIds: data.accountIds || [],
            credentials: data.credentials || [],
            status: data.status || 'active',
            linkTokens: data.linkTokens || undefined,
          };
        });
        setPurchases(purchasesList);
      } catch (err) {
        // try without orderBy
        const fallbackQuery = query(
          collection(db, 'purchases'),
          where('resellerId', '==', uid)
        );
        const fallbackSnapshot = await getDocs(fallbackQuery);
        const purchasesList: Purchase[] = fallbackSnapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            customerEmail: data.customerEmail || 'Reseller',
            serviceName: data.serviceName || '',
            serviceId: data.serviceId || '',
            createdAt: data.createdAt?.toDate?.() || new Date(),
            quantity: data.quantity || 1,
            total: data.price || 0,
            accountIds: data.accountIds || [],
            credentials: data.credentials || [],
            status: data.status || 'active',
            linkTokens: data.linkTokens || undefined,
          };
        });
        setPurchases(purchasesList);
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (uid) loadData();
  }, [uid]);

  const handleCreateLink = async (purchase: Purchase, accountIndex: number) => {
    if (!uid) return;
    const accountId = purchase.accountIds[accountIndex];
    const credential = purchase.credentials[accountIndex] || {};
    if (!accountId) return;

    const linkKey = `${purchase.id}_${accountIndex}`;
    setGeneratingFor(linkKey);

    try {
      const token = generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await setDoc(doc(db, 'public_links', token), {
        token,
        resellerId: uid,
        accountId,
        serviceId: purchase.serviceId,
        serviceName: purchase.serviceName,
        purchaseId: purchase.id,
        accountIndex,
        credential,
        createdAt: serverTimestamp(),
        expiresAt,
        status: 'active',
      });

      await loadData();
    } catch (err) {
      console.error('Error creating link:', err);
    } finally {
      setGeneratingFor(null);
    }
  };

  const handleCopyLink = async (token: string) => {
    const link = `${window.location.origin}/?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyFeedback(token);
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = link;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopyFeedback(token);
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  const handleExtractCode = async (purchaseId: string, accountIdx: number) => {
    const key = `${purchaseId}_${accountIdx}`;
    setExtractingCode(key);
    try {
      const result = await extraerCodigo({ purchaseId });
      setCodeResults((prev) => ({ ...prev, [key]: result }));
    } catch (err) {
      console.error('Error extracting code:', err);
    } finally {
      setExtractingCode(null);
    }
  };

  const handleCopyCode = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
  };

  const formatCredential = (cred: Record<string, string>): string => {
    return Object.entries(cred)
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ');
  };

  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">Cargando...</div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Mis Clientes</h1>
        {resellerName && (
          <span className="text-gray-400 text-sm">{resellerName}</span>
        )}
      </div>

      {/* ===== COMPRAS (con links por cuenta) ===== */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
      >
        <div className="p-5 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-400" />
            Compras
          </h2>
          <p className="text-gray-400 text-sm mt-1">
            Expandí una compra para ver las cuentas, copiar credenciales o generar links de acceso
          </p>
        </div>

        {purchases.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No tenés compras. Andá al <a href="/r/catalogo" className="text-primary-400 hover:underline">Catálogo</a> para comprar cuentas al por mayor.
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {purchases.map((purchase) => {
              const isExpanded = expandedPurchase === purchase.id;
              const accounts: PurchaseAccount[] = purchase.accountIds.map((id, i) => ({
                accountId: id,
                credential: purchase.credentials[i] || {},
              }));

              return (
                <div key={purchase.id}>
                  {/* Purchase row */}
                  <button
                    onClick={() =>
                      setExpandedPurchase(isExpanded ? null : purchase.id)
                    }
                    className="w-full flex items-center justify-between p-5 hover:bg-gray-700/30 transition-colors text-left"
                  >
                    <div className="flex items-center gap-4">
                      {isExpanded ? (
                        <ChevronDown size={18} className="text-gray-400" />
                      ) : (
                        <ChevronRight size={18} className="text-gray-400" />
                      )}
                      <div>
                        <span className="text-white font-medium">
                          {purchase.serviceName}
                        </span>
                        <span className="text-gray-400 text-sm ml-3">
                          {purchase.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-gray-300">
                        {purchase.quantity} cuenta{purchase.quantity !== 1 ? 's' : ''}
                      </span>
                      <span className="text-white font-medium">
                        ${purchase.total.toLocaleString()}
                      </span>
                      {purchase.status === 'active' ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/20 text-gray-400">
                          {purchase.status}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Expanded accounts */}
                  {isExpanded && (
                    <div className="bg-gray-900/30 border-t border-gray-700">
                      {accounts.length === 0 ? (
                        <div className="px-5 py-4 text-gray-500 text-sm">
                          No hay cuentas asociadas a esta compra.
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-700/50">
                          {accounts.map((acct, idx) => {
                            const linkKey = `${purchase.id}_${idx}`;
                            const existingLink = publicLinks.find(
                              (l) =>
                                l.id === linkKey ||
                                (l.id.startsWith(purchase.id) && l.id.endsWith(`_${idx}`))
                            );

                            const codeKey = `${purchase.id}_${idx}`;
                            const codeResult = codeResults[codeKey];
                            const isExtracting = extractingCode === codeKey;

                            return (
                              <div key={acct.accountId}>
                                {/* Account row */}
                                <div className="flex items-center justify-between px-5 py-3 hover:bg-gray-700/20">
                                  <div className="flex items-center gap-4">
                                    <span className="text-gray-500 text-sm w-6">
                                      #{idx + 1}
                                    </span>
                                    <span className="text-gray-300 text-sm font-mono">
                                      {formatCredential(acct.credential)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {/* Extraer código */}
                                    <button
                                      onClick={() =>
                                        handleExtractCode(purchase.id, idx)
                                      }
                                      disabled={isExtracting}
                                      className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                                    >
                                      {isExtracting ? (
                                        <><Loader2 size={14} className="animate-spin" /> Extrayendo...</>
                                      ) : codeResult ? (
                                        <><Mail size={14} /> Ver correo</>
                                      ) : (
                                        <><Mail size={14} /> Extraer código</>
                                      )}
                                    </button>

                                    {/* Link público (auto-generado o manual) */}
                                    {(() => {
                                      // 1) Link auto-generado (purchase tiene linkTokens)
                                      if (purchase.linkTokens && purchase.linkTokens.length > 0) {
                                        const autoToken = purchase.linkTokens[idx];
                                        if (autoToken) {
                                          return (
                                            <div className="flex items-center gap-2">
                                              <code className="text-xs text-primary-400 hidden sm:inline max-w-[120px] truncate">
                                                ?token={autoToken}
                                              </code>
                                              <button
                                                onClick={() => handleCopyLink(autoToken)}
                                                className="flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs font-medium"
                                              >
                                                {copyFeedback === autoToken
                                                  ? 'Copiado!'
                                                  : <><Copy size={12} /> Copiar link</>}
                                              </button>
                                            </div>
                                          );
                                        }
                                        // LinkTokens existe pero esta cuenta no tiene → no aplica
                                        return (
                                          <span className="text-xs text-gray-500 italic">
                                            URL: no aplica
                                          </span>
                                        );
                                      }

                                      // 2) Link manual (purchase vieja sin linkTokens)
                                      if (existingLink) {
                                        return (
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-green-400 flex items-center gap-1">
                                              <CheckCircle2 size={12} />
                                              Link creado
                                            </span>
                                            <button
                                              onClick={() => handleCopyLink(existingLink.token)}
                                              className="flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs font-medium"
                                            >
                                              {copyFeedback === existingLink.token
                                                ? 'Copiado!'
                                                : <><Copy size={12} /> Copiar</>}
                                            </button>
                                          </div>
                                        );
                                      }

                                      // 3) Sin link — solo mostrar "Generar" para compras viejas
                                      return (
                                        <button
                                          onClick={() => handleCreateLink(purchase, idx)}
                                          disabled={generatingFor === linkKey}
                                          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                                        >
                                          {generatingFor === linkKey ? (
                                            'Creando...'
                                          ) : (
                                            <><Plus size={14} /> Generar Link</>
                                          )}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                </div>

                                {/* Code result (collapsible) */}
                                {codeResult && (
                                  <div className="px-5 pb-3">
                                    <div className="bg-gray-900/50 rounded-lg border border-gray-700/50 overflow-hidden">
                                      <div className="px-4 py-2 border-b border-gray-700/50 flex items-center gap-2">
                                        <Mail className="w-3.5 h-3.5 text-primary-400" />
                                        <span className="text-xs text-gray-300">
                                          {codeResult.subject}
                                        </span>
                                        <span className="text-xs text-gray-600 ml-auto">
                                          {new Date(codeResult.extractedAt).toLocaleString()}
                                        </span>
                                      </div>
                                      <pre className="p-4 text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                                        {codeResult.bodyText}
                                      </pre>
                                      <div className="px-4 py-2 border-t border-gray-700/50 flex items-center gap-2 text-xs">
                                        <span className="text-gray-500">De:</span>
                                        <span className="text-gray-400">{codeResult.from}</span>
                                        <span className="text-gray-500 ml-2">Código:</span>
                                        <span className="text-primary-400 font-mono font-bold">
                                          {codeResult.code}
                                        </span>
                                        <button
                                          onClick={() => handleCopyCode(codeResult.code)}
                                          className="ml-auto text-primary-400 hover:text-primary-300"
                                          title="Copiar código"
                                        >
                                          <Copy size={12} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default MisClientes;
