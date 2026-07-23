import { useState, useEffect } from 'react';
import Modal from '../Modal';
import type { ServiceAccount } from '../../types';
import { Loader } from 'lucide-react';

interface AccountFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSave: (data: any) => Promise<void>;
  serviceId: string;
  account?: ServiceAccount;
}

interface FormData {
  label: string;
  email: string;
  password: string;
  extras: string;
  notes: string;
  status: ServiceAccount['status'];
}

const AccountFormModal = ({ isOpen, onClose, onSave, account }: AccountFormModalProps) => {
  const [formData, setFormData] = useState<FormData>({
    label: '',
    email: '',
    password: '',
    extras: '',
    notes: '',
    status: 'available',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (account) {
        const extrasStr = account.extras?.join(', ') || '';
        const notesStr = account.notes || '';
        setFormData({
          label: account.label || '',
          email: account.credential?.email || '',
          password: account.credential?.password || '',
          extras: extrasStr,
          notes: notesStr,
          status: account.status,
        });
      } else {
        setFormData({ label: '', email: '', password: '', extras: '', notes: '', status: 'available' });
      }
    }
  }, [account, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const extrasArray = formData.extras
        ? formData.extras.split(',').map(s => s.trim()).filter(Boolean)
        : undefined;

      const data: Record<string, unknown> = {
        label: formData.label,
        credential: {
          email: formData.email,
          password: formData.password,
        },
        ...(extrasArray && extrasArray.length > 0 ? { extras: extrasArray } : {}),
        ...(formData.notes ? { notes: formData.notes } : {}),
        ...(account ? { status: formData.status } : {}),
      };

      await onSave(data);
      onClose();
    } catch (error) {
      console.error('Error saving account:', error);
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!account;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEditing ? 'Editar cuenta' : 'Agregar cuenta'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-white/60 mb-1">Label</label>
          <input
            type="text"
            value={formData.label}
            onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
            placeholder="Ej: Cuenta principal"
          />
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">
            Email <span className="text-red-400">*</span>
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            required
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
            placeholder="usuario@ejemplo.com"
          />
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">
            Contrasena <span className="text-red-400">*</span>
          </label>
          <input
            type="password"
            value={formData.password}
            onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            required={!isEditing}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
            placeholder={isEditing ? 'Dejar vacio para mantener' : '********'}
          />
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">Extras</label>
          <input
            type="text"
            value={formData.extras}
            onChange={(e) => setFormData(prev => ({ ...prev, extras: e.target.value }))}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
            placeholder="Separados por coma: perfil:1, pin:1234"
          />
          <p className="text-white/40 text-xs mt-1">Valores adicionales separados por coma</p>
        </div>

        <div>
          <label className="block text-sm text-white/60 mb-1">Notas</label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            rows={3}
            className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500 resize-none"
            placeholder="Notas internas (opcional)"
          />
        </div>

        {isEditing && (
          <div>
            <label className="block text-sm text-white/60 mb-1">Estado</label>
            <select
              value={formData.status}
              onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as ServiceAccount['status'] }))}
              className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
            >
              <option value="available">Disponible</option>
              <option value="sold">Vendida</option>
              <option value="suspended">Suspendida</option>
              <option value="expired">Expirada</option>
            </select>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors text-sm disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader className="w-4 h-4 animate-spin" />}
            {isEditing ? 'Guardar cambios' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AccountFormModal;
