export function RechargeConditions() {
  return <details className="text-xs text-white/60">
    <summary className="min-h-[44px] touch-manipulation cursor-pointer select-none py-3 font-medium text-white/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-400">
      Condiciones
    </summary>
    <p className="pb-3 leading-relaxed">El saldo se acredita al verificar el pago; los cargos no se suman al saldo. Consultar el total no realiza cobros y los pagos de prueba no acreditan saldo real.</p>
  </details>;
}
