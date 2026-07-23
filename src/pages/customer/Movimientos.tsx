import { motion } from 'framer-motion';
import { ShoppingBag, Wallet } from 'lucide-react';
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
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (movements.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-12 text-center"
      >
        <Wallet size={48} className="mx-auto text-white/20 mb-4" />
        <p className="text-white/50">No hay movimientos registrados.</p>
        <p className="text-white/30 text-sm mt-1">Los movimientos aparecerán cuando compres servicios.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-2"
    >
      {movements.map((mov, idx) => (
        <motion.div
          key={mov.id}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.03 }}
          className="glass p-4 rounded-xl flex items-center justify-between"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-red-500/20 shrink-0">
              <ShoppingBag size={16} className="text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{mov.description}</p>
              <p className="text-white/40 text-xs">
                {new Date(mov.date).toLocaleDateString('es-CO', {
                  dateStyle: 'medium',
                })}
              </p>
            </div>
          </div>
          <span className="text-red-400 font-semibold shrink-0 ml-4">
            -${Math.abs(mov.amount).toLocaleString()}
          </span>
        </motion.div>
      ))}
    </motion.div>
  );
};

export default Movimientos;
