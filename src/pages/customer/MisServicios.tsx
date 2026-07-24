import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Copy, Loader, MoreVertical, Ticket, Flag, X, Search,
  ShoppingBag, Clock, MessageSquare,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { getPurchases } from '../../services/marketplace';
import type { Purchase } from '../../types/marketplace';
import Movimientos from './Movimientos';
import Reportar from './Reportar';
import Codigos from './Codigos';
import MisReportesCliente from './MisReportesCliente';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountRow {
  rowId: string;
  purchaseId: string;
  idx: number;
  nombre: string;
  plataforma: string;
  correo: string;
  contrasena: string;
  perfil: string;
  pinPerfil: string;
  fechaEntrega: Date;
  diasServicio: number;
  fechaVencimiento: Date;
  diasRestantes: number;
  credential: Record<string, string>;
  linkToken?: string;
  purchase: Purchase;
}

const buildTicketId = (purchaseId: string, idx: number): string => {
  const shortId = purchaseId.slice(0, 6).toUpperCase();
  return `TKT-${shortId}-${idx + 1}`;
};

const TEMPLATE_RULES = `⚠ REGLAS ⚠
✅ NO EDITAR SOBRE EL MISMO PERFIL // NO CAMBIAR CONTRASEÑA, DE LO CONTRARIO NO SE DARÁ GARANTÍA
USAR EN UN SOLO DISPOSITIVO.
✅ SI LLEGA A PRESENTAR ALGUNA FALLA TU CUENTA, POR FAVOR ENVIAR EN ORDEN: CORREO, CONTRASEÑA Y EVIDENCIA DEL PROBLEMA`;

const buildTemplate = (serviceName: string, row: AccountRow): string => {
  const ticketId = buildTicketId(row.purchaseId, row.idx);
  const lines = [
    `⭕️📺 SERVICIO DE ${serviceName} 📽️`,
    '',
    `*Ticket:* ${ticketId}`,
    `*Correo:* ${row.correo}`,
    `*Clave:* ${row.contrasena}`,
    `*Perfil:* ${row.perfil}`,
    `*Pin:* ${row.pinPerfil}`,
    '',
    `*Vence:* ${row.fechaVencimiento.toLocaleDateString()}`,
    '',
    TEMPLATE_RULES,
  ];
  return lines.join('\n');
};

// ─── Component ────────────────────────────────────────────────────────────────

const MisServicios = (): JSX.Element => {
  const { customer } = useAuthStore();
  const uid = customer?.uid || '';
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'servicios' | 'movimientos' | 'codigos' | 'reportar' | 'mis-reportes'>('servicios');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [modalRow, setModalRow] = useState<AccountRow | null>(null);
  const [reportServiceId, setReportServiceId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' } | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string, type: 'error' | 'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (uid) loadPurchases();
    else setLoading(false);
  }, [uid]);

  // Cerrar menú al hacer clic fuera
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    if (openMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [openMenu]);

  const loadData = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const data = await getPurchases(uid);
      data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setPurchases(data);
    } catch (err) {
      console.error('Error loading purchases:', err);
      showToast('Error al cargar servicios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPurchases = loadData;

  // ─── Construir filas ──────────────────────────────────────────────────
  const rows = useMemo<AccountRow[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const allRows: AccountRow[] = [];

    for (const purchase of purchases) {
      const durationDays = (purchase as any).durationDays || 30;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const entrega = new Date(purchase.createdAt);
      const vencimiento = new Date(entrega.getTime() + durationDays * 24 * 60 * 60 * 1000);
      const diffTime = vencimiento.getTime() - today.getTime();
      const diasRestantes = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      let accounts: { accountId: string; credential: Record<string, string> }[];
      if (purchase.profiles && purchase.profiles.length > 0) {
        accounts = purchase.profiles.map((p, i) => ({
          accountId: p.profileId || `row-${i}`,
          credential: {
            email: p.credential?.email || '',
            password: p.credential?.password || '',
            profileName: p.profileName,
            ...(p.profilePin ? { profilePin: p.profilePin } : {}),
          },
        }));
      } else {
        // Single account per purchase
        accounts = [{
          accountId: purchase.accountId || purchase.id,
          credential: {
            email: (purchase as any).credential?.email || '',
            password: (purchase as any).credential?.password || '',
            profileName: purchase.profileName || '',
            ...(purchase.profilePin ? { profilePin: purchase.profilePin } : {}),
          },
        }];
      }

      accounts.forEach((acct, idx) => {
        const cred = acct.credential;
        const rowId = `${purchase.id}_${idx}`;
        allRows.push({
          rowId,
          purchaseId: purchase.id,
          idx,
          nombre: customer?.email || '-',
          plataforma: purchase.serviceName || '-',
          correo: cred.email || cred.correo || cred.usuario || '-',
          contrasena: cred.password || cred.clave || cred.pass || '-',
          perfil: cred.profileName || '-',
          pinPerfil: cred.profilePin || '-',
          fechaEntrega: entrega,
          diasServicio: durationDays,
          fechaVencimiento: vencimiento,
          diasRestantes,
          credential: cred,
          linkToken: purchase.linkTokens?.[idx],
          purchase,
        });
      });
    }
    return allRows;
  }, [purchases, customer]);

  // ─── Filtro de búsqueda ───────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.plataforma.toLowerCase().includes(q) ||
        r.correo.toLowerCase().includes(q) ||
        r.perfil.toLowerCase().includes(q) ||
        buildTicketId(r.purchaseId, r.idx).toLowerCase().includes(q),
    );
  }, [rows, search]);

  // ─── Copiar credenciales ──────────────────────────────────────────────
  const handleCopyCredentials = async (row: AccountRow) => {
    const text = [
      `Plataforma: ${row.plataforma}`,
      `Correo: ${row.correo}`,
      `Contraseña: ${row.contrasena}`,
      row.perfil !== '-' ? `Perfil: ${row.perfil}` : '',
      row.pinPerfil !== '-' ? `PIN: ${row.pinPerfil}` : '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(text);
      showToast('Credenciales copiadas', 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast('Credenciales copiadas', 'success');
    }
  };

  // ─── Copiar template ──────────────────────────────────────────────────
  const handleCopyTemplate = async (row: AccountRow) => {
    const template = buildTemplate(row.plataforma, row);
    try {
      await navigator.clipboard.writeText(template);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = template;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  // ─── Tabs config ──────────────────────────────────────────────────────
  const tabs = [
    { key: 'servicios' as const, label: 'Mis Servicios', icon: Server },
    { key: 'movimientos' as const, label: 'Movimientos', icon: Clock },
    { key: 'codigos' as const, label: 'Códigos', icon: Search },
    { key: 'reportar' as const, label: 'Reportar', icon: Flag },
    { key: 'mis-reportes' as const, label: 'Mis Reportes', icon: MessageSquare },
  ];

  // ─── Render ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 text-center text-gray-400">
        <Loader size={24} className="animate-spin inline-block" />
        <p className="mt-2">Cargando servicios...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white">Mis Servicios</h1>
        <p className="text-gray-400 text-sm mt-1">Gestioná tus servicios comprados</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg whitespace-nowrap transition-all text-sm ${
              activeTab === key
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-500/30'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {/* ─── TAB: SERVICIOS (igual que MisClientes) ─────────────────────── */}
      {activeTab === 'servicios' && (
        <>
          {/* Buscador */}
          <div className="relative max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por plataforma, correo, perfil, ticket..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>

          {/* Tabla */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden"
          >
            <div className="p-5 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Server className="w-5 h-5 text-primary-400" />
                Servicios
                {search && (
                  <span className="text-sm font-normal text-gray-400 ml-2">
                    ({filteredRows.length} resultado{filteredRows.length !== 1 ? 's' : ''})
                  </span>
                )}
              </h2>
            </div>

            {rows.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <ShoppingBag size={32} className="mx-auto mb-2 text-gray-600" />
                <p>Todavía no tenés servicios comprados.</p>
                <p className="text-sm mt-1">Visitá la tienda para adquirir servicios.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-gray-800/80">
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">#</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Plataforma</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Correo</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Contraseña</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Perfil</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">PIN Perfil</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Fecha Entrega</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Días Svc.</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Fecha Venc.</th>
                      <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">Días Rest.</th>
                      <th className="px-3 py-3 text-center text-gray-400 font-medium text-xs uppercase tracking-wider">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700/50">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                          No hay resultados para "{search}"
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => (
                        <tr key={row.rowId} className="hover:bg-gray-700/20 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="text-gray-500 font-mono text-xs">{row.idx + 1}</div>
                            <div className="text-primary-400 font-mono text-[10px] leading-tight mt-0.5">
                              {buildTicketId(row.purchaseId, row.idx)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-gray-300">{row.plataforma}</td>
                          <td className="px-3 py-2.5">
                            <span className="text-gray-200 font-mono text-xs">{row.correo}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-gray-200 font-mono text-xs">{row.contrasena}</span>
                          </td>
                          <td className="px-3 py-2.5 text-gray-300">{row.perfil}</td>
                          <td className="px-3 py-2.5 text-gray-300">{row.pinPerfil}</td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                            {row.fechaEntrega.toLocaleDateString()}
                          </td>
                          <td className="px-3 py-2.5 text-gray-400 text-xs">{row.diasServicio}</td>
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                            <span className={row.diasRestantes <= 0 ? 'text-red-400' : 'text-gray-200'}>
                              {row.fechaVencimiento.toLocaleDateString()}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            <span className={
                              row.diasRestantes <= 0
                                ? 'text-red-400 font-medium'
                                : row.diasRestantes <= 5
                                ? 'text-yellow-400 font-medium'
                                : 'text-green-400'
                            }>
                              {row.diasRestantes <= 0 ? 'Vencido' : `${row.diasRestantes}d`}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="relative flex items-center justify-center gap-1">
                              {/* Copy */}
                              <button
                                onClick={() => handleCopyCredentials(row)}
                                className="p-1.5 hover:bg-gray-600/40 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Copiar credenciales"
                              >
                                <Copy size={14} />
                              </button>

                              {/* 3-dot menu */}
                              <div className="relative">
                                <button
                                  onClick={() => setOpenMenu(openMenu === row.rowId ? null : row.rowId)}
                                  className="p-1.5 hover:bg-gray-600/40 rounded-lg transition-colors text-gray-400 hover:text-white"
                                >
                                  <MoreVertical size={14} />
                                </button>

                                {openMenu === row.rowId && (
                                  <div ref={menuRef} className="absolute right-0 top-full mt-1 z-50 w-48 bg-gray-700 border border-gray-600 rounded-lg shadow-xl overflow-hidden">
                                    <button
                                      onClick={() => { setOpenMenu(null); setModalRow(row); }}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-gray-200 hover:bg-gray-600 transition-colors text-xs"
                                    >
                                      <Ticket size={14} />
                                      Ver ticket
                                    </button>
                                    <button
                                      onClick={() => {
                                        setOpenMenu(null);
                                        setReportServiceId(row.purchase.serviceId);
                                        setActiveTab('reportar');
                                      }}
                                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-gray-200 hover:bg-gray-600 transition-colors text-xs"
                                    >
                                      <Flag size={14} />
                                      Reportar
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </>
      )}

      {/* ─── TAB: MOVIMIENTOS ────────────────────────────────────────────── */}
      {activeTab === 'movimientos' && <Movimientos purchases={purchases} />}

      {/* ─── TAB: CÓDIGOS ────────────────────────────────────────────────── */}
      {activeTab === 'codigos' && <Codigos purchases={purchases} />}

      {/* ─── TAB: REPORTAR ───────────────────────────────────────────────── */}
      {activeTab === 'reportar' && (
        <Reportar purchases={purchases} selectedServiceId={reportServiceId} />
      )}

      {activeTab === 'mis-reportes' && <MisReportesCliente />}

      {/* ─── Modal de Ticket ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {modalRow && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setModalRow(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-800 rounded-2xl w-full max-w-lg p-6 border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/20 mb-4">
                  <Ticket size={36} className="text-primary-400" />
                </div>
                <h2 className="text-2xl font-bold text-white">Ticket de Acceso</h2>
                <p className="text-gray-400 mt-1">
                  {modalRow.plataforma} —{' '}
                  <span className="text-primary-400 font-mono font-medium">
                    {buildTicketId(modalRow.purchaseId, modalRow.idx)}
                  </span>
                </p>
              </div>

              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mb-4">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {buildTemplate(modalRow.plataforma, modalRow)}
                </pre>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-700">
                  <p className="text-gray-500 text-xs">Entrega</p>
                  <p className="text-white text-sm font-medium mt-0.5">{modalRow.fechaEntrega.toLocaleDateString()}</p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-700">
                  <p className="text-gray-500 text-xs">Vence</p>
                  <p className="text-white text-sm font-medium mt-0.5">{modalRow.fechaVencimiento.toLocaleDateString()}</p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-700">
                  <p className="text-gray-500 text-xs">Restan</p>
                  <p className={`text-sm font-medium mt-0.5 ${
                    modalRow.diasRestantes <= 0
                      ? 'text-red-400'
                      : modalRow.diasRestantes <= 5
                      ? 'text-yellow-400'
                      : 'text-green-400'
                  }`}>
                    {modalRow.diasRestantes <= 0 ? 'Vencido' : `${modalRow.diasRestantes} días`}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { handleCopyTemplate(modalRow); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
                >
                  <Copy size={14} />
                  {copiedTemplate ? '¡Copiado!' : 'Copiar plantilla'}
                </button>
                <button onClick={() => setModalRow(null)} className="w-full text-gray-400 hover:text-white font-medium py-2 transition-colors text-sm">
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className={`fixed top-20 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-2xl z-50 ${
            toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-green-500/90 text-white'
          }`}
        >
          <p className="font-medium text-sm">{toast.msg}</p>
        </motion.div>
      )}
    </div>
  );
};

export default MisServicios;
