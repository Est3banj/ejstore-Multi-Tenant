import { useState, useEffect } from 'react';
import Modal from '../Modal';
import type { ServiceAccount } from '../../types';
import { Loader, Plus, Trash2, Eye, EyeOff } from 'lucide-react';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '../../services/firebase';

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

const AccountFormModal = ({ isOpen, onClose, onSave, serviceId, account }: AccountFormModalProps) => {
  const [formData, setFormData] = useState<FormData>({
    label: '',
    email: '',
    password: '',
    extras: '',
    notes: '',
    status: 'available',
  });
  const [saving, setSaving] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ name: string; pin: string; _id?: string; status?: string }>>([
    { name: 'Perfil 1', pin: '' }
  ]);

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
        const loadProfiles = async () => {
          try {
            const profilesRef = collection(db, 'services', serviceId, 'accounts', account.id, 'profiles');
            const snapshot = await getDocs(query(profilesRef));
            const existingProfiles = snapshot.docs.map(d => ({
              _id: d.id,
              name: (d.data() as any).name || '',
              pin: (d.data() as any).pin || '',
              status: (d.data() as any).status,
            }));
            if (existingProfiles.length > 0) {
              setProfiles(existingProfiles);
            }
          } catch (error) {
            console.error('Error loading profiles:', error);
          }
        };
        loadProfiles();
      } else {
        setFormData({ label: '', email: '', password: '', extras: '', notes: '', status: 'available' });
        setProfiles([{ name: 'Perfil 1', pin: '' }]);
      }
    }
  }, [account, isOpen, serviceId]);

  const updateProfile = (index: number, field: 'name' | 'pin', value: string) => {
    setProfiles(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const addProfile = () => {
    setProfiles(prev => [...prev, { name: '', pin: '' }]);
  };

  const removeProfile = (index: number) => {
    setProfiles(prev => prev.filter((_, i) => i !== index));
  };

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

      const validProfiles = profiles
        .filter(p => p.name.trim())
        .filter(p => !(p._id && p.status === 'sold'))
        .map(p => ({ name: p.name.trim(), ...(p.pin ? { pin: p.pin.trim() } : {}), ...(p._id ? { _id: p._id } : {}) }));

      if (validProfiles.length > 0) {
        data.profiles = validProfiles;
      }

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
          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
              required={!isEditing}
              className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 pr-10 focus:outline-none focus:border-primary-500"
              placeholder={isEditing ? 'Dejar vacio para mantener' : '********'}
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
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

        <div>
          <label className="block text-sm text-white/60 mb-1">
            Perfiles <span className="text-white/40 text-xs font-normal">({profiles.length} {profiles.length === 1 ? 'perfil' : 'perfiles'})</span>
          </label>
          <div className="space-y-2">
            {profiles.map((p, index) => (
              <div key={index} className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    type="text"
                    value={p.name}
                    onChange={(e) => updateProfile(index, 'name', e.target.value)}
                    className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
                    placeholder="Nombre del perfil"
                  />
                </div>
                <div className="flex-1">
                  <input
                    type="text"
                    value={p.pin}
                    onChange={(e) => updateProfile(index, 'pin', e.target.value)}
                    className="w-full bg-white/10 border border-white/20 text-white rounded-lg px-4 py-3 focus:outline-none focus:border-primary-500"
                    placeholder="PIN (opcional)"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeProfile(index)}
                  disabled={!!(p._id && p.status === 'sold')}
                  className="p-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors disabled:opacity-30"
                  title={p._id && p.status === 'sold' ? 'No se puede eliminar un perfil vendido' : 'Eliminar perfil'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addProfile}
            className="mt-2 px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors text-sm flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar Perfil
          </button>
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
