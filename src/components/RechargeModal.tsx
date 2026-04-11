import { useState } from 'react';
import { X, Copy, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useApp } from '../context/AppContext';
import { useTenantStore } from '../store/tenantStore';
import { createRechargeRequest } from '../services/firestore';

// Configuración de Telegram
const TELEGRAM_BOT_TOKEN = '8597739575:AAFuw__aMizR6sSPfUx6bU9da_r4PlNjnuI';
const ADMIN_CHAT_ID = '1666952441';

// Función para enviar mensaje a Telegram
async function sendTelegramMessage(text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: ADMIN_CHAT_ID,
        text,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('Error sending to Telegram:', error);
  }
}

interface RechargeModalProps {
  onClose: () => void;
  showToast?: (msg: string, type: 'error'|'success') => void;
}

export const RechargeModal = ({ onClose, showToast }: RechargeModalProps) => {
  const { customer, refreshCustomer } = useAuthStore();
  const { settings } = useApp();
  const tenantId = useTenantStore((state: any) => state.tenant?.id || state.userTenantId);
  const [step, setStep] = useState<'select' | 'transfer' | 'confirm'>('select');
  const [amount, setAmount] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{msg: string; type: 'error'|'success'} | null>(null);
  const [copied, setCopied] = useState(false);

  // Toast helper
  const showToastLocal = (msg: string, type: 'error'|'success' = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
    showToast?.(msg, type);
  };

  // Configuración de BRE-B hardcodeada por ahora
  const BRE_B_KEY = '0035443571';
  const bankInfo = 'BRE-B - GIO TECH';

  const handleWhatsapp = () => {
    const message = encodeURIComponent('Hola, quiero recargar saldo en mi cuenta. ¿Me puedes ayudar?');
    const whatsappNumber = settings?.whatsappNumber || '3101234567';
    window.open(`https://wa.me/${whatsappNumber}?text=${message}`, '_blank');
  };

  const handleTransfer = () => {
    const monto = parseInt(amount);
    if (!monto || monto < 1000) {
      showToastLocal('Por favor ingresa un monto válido (mínimo $1,000)');
      return;
    }
    setStep('transfer');
  };

  const handleConfirmPayment = async () => {
    if (!fullName || !amount) {
      showToastLocal('Por favor completa todos los campos');
      return;
    }

    // Validar que tenga sesión
    if (!customer) {
      showToastLocal('Debes iniciar sesión para recargar');
      return;
    }

    if (!tenantId) {
      showToastLocal('Error de configuración. Intenta más tarde.');
      console.error('RechargeModal: tenantId es requerido pero está vacío');
      return;
    }

    setLoading(true);
    
    try {
      console.log('Creando recarga:', { tenantId, customerId: customer.uid, amount: parseInt(amount) });
      
      await createRechargeRequest({
        tenantId,
        customerId: customer.uid,
        customerName: `${customer.firstName} ${customer.lastName}`,
        customerPhone: customer.phone,
        amount: parseInt(amount),
      });
      
      // Notificar a Telegram
      const message = `
💰 *NUEVA RECARGA (RULETA)*
━━━━━━━━━━━━━━━━━━━━
👤 *Nombre:* ${customer.firstName} ${customer.lastName}
📱 *WhatsApp:* ${customer.phone}
💵 *Monto:* $${parseInt(amount).toLocaleString()} COP
🕐 *Fecha:* ${new Date().toLocaleString('America/Bogota', { timeZone: 'America/Bogota' })}
━━━━━━━━━━━━━━━━━━━━
`;
      await sendTelegramMessage(message);
      
      showToastLocal('✅ Tu recarga ha sido registrada. Será validada y cargada en minutos.', 'success');
      await refreshCustomer();
      
      onClose();
    } catch (error: any) {
      console.error('Error creating recharge:', error);
      // Mostrar mensaje más específico del error
      const errorMsg = error?.message || 'Error al procesar la recarga. Intenta de nuevo.';
      showToastLocal(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="glass w-full max-w-md p-6 relative" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 text-white/50 hover:text-white">
          <X size={20} />
        </button>

        <h2 className="text-2xl font-bold gradient-text mb-4">💰 Recargar Saldo</h2>
        
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-white/70 mb-4">Selecciona el monto a recargar:</p>
            
            <div className="grid grid-cols-2 gap-3">
              {[5000, 10000, 20000, 50000].map((monto) => (
                <button
                  key={monto}
                  onClick={() => setAmount(String(monto))}
                  className={`p-3 rounded-lg border transition-all ${
                    parseInt(amount) === monto 
                      ? 'border-primary-500 bg-primary-500/20 text-white' 
                      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'
                  }`}
                >
                  <span className="block text-xl font-bold">${monto.toLocaleString()}</span>
                </button>
              ))}
            </div>
            
            <div>
              <label className="block text-white/70 text-sm mb-2">Otro monto (mínimo $1,000)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="input-field"
                placeholder="50000"
                min="1000"
              />
            </div>
            
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mt-4">
              <p className="text-blue-400 text-sm font-medium mb-2">📱 ¿Prefieres hacer la transferencia por WhatsApp?</p>
              <button
                onClick={handleWhatsapp}
                className="text-blue-300 text-sm hover:text-blue-200 underline"
              >
                Click aquí para que te ayudemos →
              </button>
            </div>
            
            <button
              onClick={handleTransfer}
              disabled={!amount || parseInt(amount) < 1000}
              className="btn-primary w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continuar
            </button>
          </div>
        )}

        {step === 'transfer' && (
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <p className="text-yellow-400 font-medium">📋 Instrucciones de pago</p>
              <p className="text-white/60 text-sm mt-1">Envía ${parseInt(amount).toLocaleString()} al siguiente número:</p>
            </div>
            
            <div className="bg-white/5 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-white/50">Banco:</span>
                <span className="text-white font-medium">{bankInfo}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/50">Número:</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-bold text-lg">{BRE_B_KEY}</span>
                  <button 
                    onClick={() => copyToClipboard(BRE_B_KEY)}
                    className="text-primary-400 hover:text-primary-300"
                  >
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                  </button>
                </div>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-white/50">Monto:</span>
                <span className="text-white font-bold text-xl text-green-400">${parseInt(amount).toLocaleString()}</span>
              </div>
            </div>
            
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
              <p className="text-yellow-400 text-sm">⚠️ Importante: Usa la clave de pago <strong>{BRE_B_KEY}</strong> al hacer la transferencia</p>
            </div>
            
            <div className="pt-4 border-t border-white/10">
              <label className="block text-white/70 text-sm mb-2">Nombre completo (quien hizo la transferencia)</label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="input-field"
                placeholder="Juan Perez"
              />
            </div>
            
            <div className="flex gap-3 mt-4">
              <button onClick={() => setStep('select')} className="btn-secondary flex-1">
                Volver
              </button>
              <button 
                onClick={handleConfirmPayment}
                disabled={loading || !fullName}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                {loading ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {toast && (
          <div className={`mt-4 p-3 rounded-lg text-center ${
            toast.type === 'success' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {toast.msg}
          </div>
        )}
        
        <p className="text-white/30 text-xs text-center mt-4">
          💡 Tu recarga será verificada y confirmada manualmente
        </p>
      </div>
    </div>
  );
};

export default RechargeModal;