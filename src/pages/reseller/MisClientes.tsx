import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuthStore } from "../../store/authStore";
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
} from "firebase/firestore";
import { adminDb } from "../../services/firebase";
import {
  ShoppingBag,
  Search,
  Copy,
  MoreVertical,
  Ticket,
  Flag,
  Loader2,
  X,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PurchasedProfile {
  profileId: string;
  profileName: string;
  profilePin?: string;
  credential: Record<string, string>;
}

interface Purchase {
  id: string;
  customerEmail: string;
  customerName?: string;
  serviceName: string;
  serviceId: string;
  createdAt: Date;
  quantity: number;
  total: number;
  accountIds: string[];
  credentials: Record<string, string>[];
  status: string;
  linkTokens?: string[];
  profileName?: string;
  profilePin?: string;
  profiles?: PurchasedProfile[];
  durationDays?: number;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_RULES = `⚠ REGLAS ⚠
✅ NO EDITAR SOBRE EL MISMO PERFIL // NO CAMBIAR CONTRASEÑA, DE LO CONTRARIO NO SE DARÁ GARANTÍA
USAR EN UN SOLO DISPOSITIVO.
✅ SI LLEGA A PRESENTAR ALGUNA FALLA TU CUENTA, POR FAVOR ENVIAR EN ORDEN: CORREO, CONTRASEÑA Y EVIDENCIA DEL PROBLEMA`;

const buildTicketId = (row: AccountRow): string => {
  const shortId = row.purchaseId.slice(0, 6).toUpperCase();
  return `TKT-${shortId}-${row.idx + 1}`;
};

const buildTemplate = (serviceName: string, row: AccountRow): string => {
  const ticketId = buildTicketId(row);
  const lines = [
    `⭕️📺 SERVICIO DE ${serviceName} 📽️`,
    "",
    `*Ticket:* ${ticketId}`,
    `*Correo:* ${row.correo}`,
    `*Clave:* ${row.contrasena}`,
    `*Perfil:* ${row.perfil}`,
    `*Pin:* ${row.pinPerfil}`,
    "",
    `*Vence:* ${row.fechaVencimiento.toLocaleDateString()}`,
    "",
    TEMPLATE_RULES,
  ];
  return lines.join("\n");
};

const generateToken = (): string => {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 20; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ─── Component ────────────────────────────────────────────────────────────────

const MisClientes = (): JSX.Element => {
  const { adminUser } = useAuthStore();
  const uid = adminUser?.uid || "";
  const navigate = useNavigate();
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);
  const [modalRow, setModalRow] = useState<AccountRow | null>(null);
  const [copiedTemplate, setCopiedTemplate] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // ─── Cerrar menú al hacer clic fuera ────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    if (openMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [openMenu]);

  // ─── Filtrar filas por búsqueda ────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) =>
        r.nombre.toLowerCase().includes(q) ||
        r.plataforma.toLowerCase().includes(q) ||
        r.correo.toLowerCase().includes(q) ||
        r.perfil.toLowerCase().includes(q) ||
        r.rowId.toLowerCase().includes(q) ||
        r.pinPerfil.toLowerCase().includes(q) ||
        String(r.idx + 1).includes(q) ||
        buildTicketId(r).toLowerCase().includes(q),
    );
  }, [rows, search]);

  // ─── Cargar datos ───────────────────────────────────────────────────────
  const loadData = async () => {
    if (!uid) return;

    let purchases: Purchase[] = [];
    try {
      purchases = await loadPurchases();
    } catch (err) {
      console.error("Error loading purchases:", err);
    }

    // Construir filas con fechas calculadas
    const allRows: AccountRow[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const purchase of purchases) {
      const durationDays = purchase.durationDays || 30;
      const entrega = purchase.createdAt;
      const vencimiento = new Date(
        entrega.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );
      const diffTime = vencimiento.getTime() - today.getTime();
      const diasRestantes = Math.max(
        0,
        Math.ceil(diffTime / (1000 * 60 * 60 * 24)),
      );

      let accounts: { accountId: string; credential: Record<string, string> }[];
      if (purchase.profiles && purchase.profiles.length > 0) {
        accounts = purchase.profiles.map((p, i) => ({
          accountId: p.profileId || purchase.accountIds[i] || `row-${i}`,
          credential: {
            ...p.credential,
            profileName: p.profileName,
            ...(p.profilePin ? { profilePin: p.profilePin } : {}),
          },
        }));
      } else if (purchase.profileName) {
        accounts = purchase.accountIds.map((id, i) => ({
          accountId: id,
          credential: {
            ...(purchase.credentials[i] || {}),
            profileName: purchase.profileName || "",
            ...(purchase.profilePin ? { profilePin: purchase.profilePin } : {}),
          },
        }));
      } else {
        accounts = purchase.accountIds.map((id, i) => ({
          accountId: id,
          credential: purchase.credentials[i] || {},
        }));
      }

      accounts.forEach((acct, idx) => {
        const cred = acct.credential;
        const rowId = `${purchase.id}_${idx}`;
        allRows.push({
          rowId,
          purchaseId: purchase.id,
          idx,
          nombre: purchase.customerName || purchase.customerEmail || "-",
          plataforma: purchase.serviceName || "-",
          correo: cred.email || cred.correo || cred.usuario || "-",
          contrasena: cred.password || cred.clave || cred.pass || "-",
          perfil: cred.profileName || "-",
          pinPerfil: cred.profilePin || "-",
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

    setRows(allRows);
    setLoading(false);
  };

  const loadPurchases = async (): Promise<Purchase[]> => {
    try {
      const purchasesQuery = query(
        collection(adminDb, "purchases"),
        where("customerId", "==", uid),
        orderBy("createdAt", "desc"),
        limit(50),
      );
      const snapshot = await getDocs(purchasesQuery);
      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          customerEmail: data.customerEmail || "Reseller",
          customerName: data.customerName || "",
          serviceName: data.serviceName || "",
          serviceId: data.serviceId || "",
          createdAt: data.createdAt?.toDate?.() || new Date(),
          quantity: data.quantity || 1,
          total: data.price || 0,
          accountIds: data.accountIds || [],
          credentials: data.credentials || [],
          status: data.status || "active",
          linkTokens: data.linkTokens || undefined,
          profiles: data.profiles || undefined,
          durationDays: data.durationDays || undefined,
        };
      });
    } catch {
      const fallbackQuery = query(
        collection(adminDb, "purchases"),
        where("customerId", "==", uid),
      );
      const snapshot = await getDocs(fallbackQuery);
      return snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          customerEmail: data.customerEmail || "Reseller",
          customerName: data.customerName || "",
          serviceName: data.serviceName || "",
          serviceId: data.serviceId || "",
          createdAt: data.createdAt?.toDate?.() || new Date(),
          quantity: data.quantity || 1,
          total: data.price || 0,
          accountIds: data.accountIds || [],
          credentials: data.credentials || [],
          status: data.status || "active",
          linkTokens: data.linkTokens || undefined,
          profiles: data.profiles || undefined,
          durationDays: data.durationDays || undefined,
        };
      });
    }
  };

  useEffect(() => {
    if (uid) loadData();
  }, [uid]);

  // ─── Generar Ticket (crea link público) ────────────────────────────────
  const handleGenerateTicket = async (row: AccountRow) => {
    const linkKey = row.rowId;
    setGeneratingFor(linkKey);

    try {
      const token = generateToken();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await setDoc(doc(adminDb, "public_links", token), {
        token,
        resellerId: uid,
        accountId: row.purchase.accountIds[row.idx] || "",
        serviceId: row.purchase.serviceId,
        serviceName: row.purchase.serviceName,
        purchaseId: row.purchase.id,
        accountIndex: row.idx,
        credential: row.credential,
        createdAt: serverTimestamp(),
        expiresAt,
        status: "active",
      });

      await loadData();
    } catch (err) {
      console.error("Error generando ticket:", err);
    } finally {
      setGeneratingFor(null);
    }
  };

  // ─── Copiar template al portapapeles ───────────────────────────────────
  const handleCopyTemplate = async (row: AccountRow) => {
    const template = buildTemplate(row.plataforma, row);
    try {
      await navigator.clipboard.writeText(template);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = template;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedTemplate(true);
    setTimeout(() => setCopiedTemplate(false), 2000);
  };

  // ─── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Mis Clientes</h1>
      </div>

      {/* Buscador inteligente */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, plataforma, correo, perfil, ticket..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
          >
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
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-green-400" />
            Clientes
            {search && (
              <span className="text-sm font-normal text-gray-400 ml-2">
                ({filteredRows.length} resultado
                {filteredRows.length !== 1 ? "s" : ""})
              </span>
            )}
          </h2>
        </div>

        {rows.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            No tenés compras. Andá al{" "}
            <a href="/r/catalogo" className="text-primary-400 hover:underline">
              Catálogo
            </a>{" "}
            para comprar cuentas al por mayor.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-gray-800/80">
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Plataforma
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Correo
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Contraseña
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Perfil
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    PIN Perfil
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Fecha Entrega
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Días Svc.
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Fecha Venc.
                  </th>
                  <th className="px-3 py-3 text-left text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Días Rest.
                  </th>
                  <th className="px-3 py-3 text-center text-gray-400 font-medium text-xs uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-3 py-8 text-center text-gray-500"
                    >
                      No hay resultados para "{search}"
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr
                      key={row.rowId}
                      className="hover:bg-gray-700/20 transition-colors"
                    >
                      <td className="px-3 py-2.5">
                        <div className="text-gray-500 font-mono text-xs">
                          {row.idx + 1}
                        </div>
                        <div className="text-primary-400 font-mono text-[10px] leading-tight mt-0.5">
                          {buildTicketId(row)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-white font-medium">
                        {row.nombre}
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">
                        {row.plataforma}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-200 font-mono text-xs">
                          {row.correo}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-gray-200 font-mono text-xs">
                          {row.contrasena}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">
                        {row.perfil}
                      </td>
                      <td className="px-3 py-2.5 text-gray-300">
                        {row.pinPerfil}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                        {row.fechaEntrega.toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2.5 text-gray-400 text-xs">
                        {row.diasServicio}
                      </td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                        <span
                          className={
                            row.diasRestantes <= 0
                              ? "text-red-400"
                              : "text-gray-200"
                          }
                        >
                          {row.fechaVencimiento.toLocaleDateString()}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <span
                          className={
                            row.diasRestantes <= 0
                              ? "text-red-400 font-medium"
                              : row.diasRestantes <= 5
                                ? "text-yellow-400 font-medium"
                                : "text-green-400"
                          }
                        >
                          {row.diasRestantes <= 0
                            ? "Vencido"
                            : `${row.diasRestantes}d`}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {/* Menú de 3 puntitos */}
                        <div className="relative flex items-center justify-center">
                          <button
                            onClick={() =>
                              setOpenMenu(
                                openMenu === row.rowId ? null : row.rowId,
                              )
                            }
                            className="p-1.5 hover:bg-gray-600/40 rounded-lg transition-colors text-gray-400 hover:text-white"
                            title="Acciones"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {/* Dropdown menu */}
                          {openMenu === row.rowId && (
                            <div
                              ref={menuRef}
                              className="absolute right-0 top-full mt-1 z-50 w-48 bg-gray-700 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
                            >
                              <button
                                onClick={() => {
                                  setOpenMenu(null);
                                  setModalRow(row);
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-gray-200 hover:bg-gray-600 transition-colors text-xs"
                              >
                                <Ticket size={14} />
                                Ver ticket
                              </button>
                              <button
                                onClick={() => {
                                  setOpenMenu(null);
                                  navigate(
                                    `/r/reportar?pid=${row.purchaseId}&idx=${row.idx}&tkt=${buildTicketId(row)}&correo=${encodeURIComponent(row.correo)}`
                                  );
                                }}
                                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-gray-200 hover:bg-gray-600 transition-colors text-xs"
                              >
                                <Flag size={14} />
                                Reportar
                              </button>
                            </div>
                          )}
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
                <h2 className="text-2xl font-bold text-white">
                  Ticket de Acceso
                </h2>
                <p className="text-gray-400 mt-1">
                  {modalRow.plataforma} —{" "}
                  <span className="text-primary-400 font-mono font-medium">
                    {buildTicketId(modalRow)}
                  </span>
                </p>
              </div>

              {/* Template */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-700 mb-4">
                <pre className="text-xs text-gray-300 font-mono whitespace-pre-wrap leading-relaxed">
                  {buildTemplate(modalRow.plataforma, modalRow)}
                </pre>
              </div>

              {/* Fechas */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-700">
                  <p className="text-gray-500 text-xs">Entrega</p>
                  <p className="text-white text-sm font-medium mt-0.5">
                    {modalRow.fechaEntrega.toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-700">
                  <p className="text-gray-500 text-xs">Vence</p>
                  <p className="text-white text-sm font-medium mt-0.5">
                    {modalRow.fechaVencimiento.toLocaleDateString()}
                  </p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 text-center border border-gray-700">
                  <p className="text-gray-500 text-xs">Restan</p>
                  <p
                    className={`text-sm font-medium mt-0.5 ${
                      modalRow.diasRestantes <= 0
                        ? "text-red-400"
                        : modalRow.diasRestantes <= 5
                          ? "text-yellow-400"
                          : "text-green-400"
                    }`}
                  >
                    {modalRow.diasRestantes <= 0
                      ? "Vencido"
                      : `${modalRow.diasRestantes} días`}
                  </p>
                </div>
              </div>

              {/* Acciones */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    handleGenerateTicket(modalRow);
                    handleCopyTemplate(modalRow);
                  }}
                  disabled={generatingFor === modalRow.rowId}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {generatingFor === modalRow.rowId ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <Copy size={14} />
                      {copiedTemplate ? "¡Copiado!" : "Copiar"}
                    </>
                  )}
                </button>
                <button
                  onClick={() => setModalRow(null)}
                  className="w-full text-gray-400 hover:text-white font-medium py-2 transition-colors text-sm"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MisClientes;
