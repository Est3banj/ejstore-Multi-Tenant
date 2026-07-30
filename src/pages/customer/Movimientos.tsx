import { motion } from 'framer-motion';
import { ShoppingBag, Wallet, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import type { Purchase } from '../../types/marketplace';

interface MovimientosProps {
  purchases: Purchase[];
}

const Movimientos = ({ purchases }: MovimientosProps) => {
  const movements = purchases
    .map((p) => ({
      id: p.id,
      date: p.createdAt,
      description: `Compra ${p.serviceName}`,
      amount: -p.price,
      type: 'purchase' as const,
      status: p.status,
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (movements.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 rounded-xl border border-gray-700 p-12 text-center"
      >
        <Wallet size={40} className="mx-auto text-gray-600 mb-4" />
        <p className="text-gray-400">No hay movimientos registrados.</p>
        <p className="text-gray-500 text-sm mt-1">Los movimientos aparecerán cuando compres servicios.</p>
      </motion.div>
    );
  }

  const totalGastado = purchases.reduce((sum, p) => sum + p.price, 0);

  return (
    <div className="space-y-4">
      {/* Resumen */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-red-500/20">
              <ArrowUpRight size={16} className="text-red-400" />
            </div>
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Total Gastado</p>
              <p className="text-white font-bold text-lg">${totalGastado.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-green-500/20">
              <ArrowDownLeft size={16} className="text-green-400" />
            </div>
            <div className="text-right">
              <p className="text-gray-400 text-xs uppercase tracking-wider font-medium">Compras</p>
              <p className="text-white font-bold text-lg">{movements.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-700">
          <h3 className="text-white font-bold text-sm">Historial de movimientos</h3>
        </div>
        <div className="divide-y divide-gray-700">
          {movements.map((mov, idx) => (
            <motion.div
              key={mov.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="flex items-center justify-between px-5 py-4 hover:bg-gray-700/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
                  <ShoppingBag size={16} className="text-red-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-white font-medium text-sm truncate">{mov.description}</p>
                  <p className="text-gray-500 text-xs">
                    {new Date(mov.date).toLocaleDateString('es-CO', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 ml-4">
                <p className="text-red-400 font-semibold text-sm">
                  -${Math.abs(mov.amount).toLocaleString()}
                </p>
                <span className={`text-[10px] ${
                  mov.status === 'active' ? 'text-green-400' : 'text-gray-500'
                }`}>
                  {mov.status === 'active' ? 'Activo' : mov.status}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Movimientos;
