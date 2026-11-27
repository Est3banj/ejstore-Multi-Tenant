import type { WompiFeeQuote } from '../types/wompi';
export type { WompiFeeQuote } from '../types/wompi';
export const formatWompiAmount = (amount: number) => `$${amount.toLocaleString('es-CO')} COP`;

export function WompiAmounts({ amount, feeQuote, status, environment, label = 'Detalle de importes Wompi' }: {
  amount: number; feeQuote?: WompiFeeQuote; status?: string; environment?: string | null; label?: string;
}) {
  const total = feeQuote?.totalAmount ?? amount;
  const fee = feeQuote?.processingFee ?? 0;
  return <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm tabular-nums" aria-label={label}>
    <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-white/70"><span>Saldo de recarga: </span><strong className="text-white">{formatWompiAmount(amount)}</strong></p>
    <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-white/70"><span>Cargo de procesamiento: </span><strong className={fee > 0 ? 'text-amber-300' : 'text-emerald-300'}>{formatWompiAmount(fee)}</strong></p>
    <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t border-white/10 pt-3 font-semibold text-white"><span>{environment === 'test' || status === 'sandbox_approved' ? 'Total de prueba' : status === 'approved' ? 'Total pagado' : 'Total a pagar'}: </span><strong>{formatWompiAmount(total)}</strong></p>
  </div>;
}
