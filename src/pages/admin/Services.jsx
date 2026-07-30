import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getAllServices,
  createService,
  updateService,
  deleteService
} from '../../services/firestore';
import { adminDb } from '../../services/firebase';
import { uploadImage } from '../../services/storage';
import { CATEGORIES } from '../../utils/constants';
import { validateImageUrl } from '../../utils/validation';
import Modal from '../../components/Modal';
import AccountFormModal from '../../components/admin/AccountFormModal';
import BatchImportModal from '../../components/admin/BatchImportModal';
import { motion } from 'framer-motion';
import {
  Plus, Edit, Trash2, X, AlertCircle, CheckCircle2,
  ChevronDown, ChevronRight, Upload, Users, Eye, EyeOff
} from 'lucide-react';
import {
  getAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  getServiceStock
} from '../../services/marketplace';

const Services = () => {
  const { refreshServices, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const tenantId = effectiveTenantId;
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    promotionalPrice: '',
    wholesalePrice: '',
    category: 'pantallas',
    image: null,
    imageUrl: '',
    imageUrlInput: '',
    active: true,
    isPopular: false,
    hasCodeExtraction: false,
    benefits: [],
    pricing: [],
    terms: ''
  });
  const [pricingInput, setPricingInput] = useState({ months: '', price: '' });
  const [uploading, setUploading] = useState(false);
  const [benefitInput, setBenefitInput] = useState('');
  const [urlValidation, setUrlValidation] = useState({ isValid: true, error: '', warning: '' });

  // Accounts & Profiles state
  const [accounts, setAccounts] = useState([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [expandedAccountId, setExpandedAccountId] = useState(null);
  const [accountStock, setAccountStock] = useState({ total: 0, available: 0, sold: 0 });
  const [showPinMap, setShowPinMap] = useState({});

  const loadAccounts = async (serviceId) => {
    if (!serviceId) return;
    setAccountsLoading(true);
    try {
      const data = await getAccounts(serviceId, adminDb);
      setAccounts(data);
      const stock = await getServiceStock(serviceId, adminDb);
      setAccountStock(stock);
    } catch (error) {
      console.error('Error loading accounts:', error);
    } finally {
      setAccountsLoading(false);
    }
  };

  const loadServices = async () => {
    if (!tenantId) return;
    try {
      const data = await getAllServices(tenantId, adminDb);
      setServices(data);
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tenantId) {
      loadServices();
    }
  }, [tenantId]);

  const handleOpenModal = (service = null) => {
    if (service) {
      setEditingService(service);
      setFormData({
        name: service.name || '',
        description: service.description || '',
        price: service.price || '',
        promotionalPrice: service.promotionalPrice || '',
        wholesalePrice: service.wholesalePrice || '',
        category: service.category || 'pantallas',
        image: null,
        imageUrl: service.image || '',
        imageUrlInput: '',
        active: service.isActive !== undefined ? service.isActive : true,
        isPopular: service.isPopular || false,
        hasCodeExtraction: service.hasCodeExtraction || false,
        durationDays: service.durationDays || '',
        benefits: service.benefits || [],
        pricing: service.pricing || [],
        terms: service.terms || ''
      });
    } else {
      setEditingService(null);
      setFormData({
        name: '',
        description: '',
        price: '',
        promotionalPrice: '',
        wholesalePrice: '',
        category: 'pantallas',
        image: null,
        imageUrl: '',
        imageUrlInput: '',
        active: true,
        isPopular: false,
        hasCodeExtraction: false,
        durationDays: '',
        benefits: [],
        pricing: [],
        terms: ''
      });
    }
    setUrlValidation({ isValid: true, error: '', warning: '' });
    setShowModal(true);

    // Load accounts when editing
    if (service) {
      loadAccounts(service.id);
    } else {
      setAccounts([]);
      setAccountStock({ total: 0, available: 0, sold: 0 });
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData({ ...formData, image: file });
    }
  };

  const handleUrlChange = (e) => {
    const url = e.target.value;
    setFormData({ ...formData, imageUrlInput: url });

    if (url.trim()) {
      const validation = validateImageUrl(url);
      setUrlValidation(validation);
    } else {
      setUrlValidation({ isValid: true, error: '', warning: '' });
    }
  };

  const handleAddBenefit = () => {
    if (benefitInput.trim()) {
      setFormData({
        ...formData,
        benefits: [...formData.benefits, benefitInput.trim()]
      });
      setBenefitInput('');
    }
  };

  const handleRemoveBenefit = (index) => {
    setFormData({
      ...formData,
      benefits: formData.benefits.filter((_, i) => i !== index)
    });
  };

  const handleAddPricing = () => {
    if (pricingInput.months && pricingInput.price) {
      setFormData({
        ...formData,
        pricing: [...formData.pricing, {
          months: parseInt(pricingInput.months),
          price: parseFloat(pricingInput.price)
        }].sort((a, b) => a.months - b.months)
      });
      setPricingInput({ months: '', price: '' });
    }
  };

  const handleRemovePricing = (index) => {
    setFormData({
      ...formData,
      pricing: formData.pricing.filter((_, i) => i !== index)
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate URL if provided
    if (formData.imageUrlInput && !urlValidation.isValid) {
      alert('Por favor, corrija la URL de la imagen antes de continuar');
      return;
    }

    setUploading(true);

    try {
      let imageUrl = formData.imageUrl;

      // Priority: URL input > File upload > Existing URL
      if (formData.imageUrlInput && formData.imageUrlInput.trim()) {
        // Use URL directly (no Firebase upload needed)
        imageUrl = formData.imageUrlInput.trim();
      } else if (formData.image) {
        // Upload file to Firebase Storage
        const path = `services/${Date.now()}_${formData.image.name}`;
        imageUrl = await uploadImage(formData.image, path);
      }
      // else: keep existing imageUrl

      const serviceData = {
        name: formData.name,
        description: formData.description,
        price: parseFloat(formData.price),
        promotionalPrice: formData.promotionalPrice ? parseFloat(formData.promotionalPrice) : null,
        wholesalePrice: formData.wholesalePrice ? parseFloat(formData.wholesalePrice) : null,
        category: formData.category,
        image: imageUrl,
        active: formData.active,
        isPopular: formData.isPopular,
        hasCodeExtraction: formData.hasCodeExtraction,
        durationDays: formData.durationDays ? parseInt(formData.durationDays) : null,
        benefits: formData.benefits,
        pricing: formData.pricing,
        terms: formData.terms || null
      };

      if (editingService) {
        await updateService(editingService.id, serviceData, tenantId, adminDb);
      } else {
        await createService(serviceData, tenantId, adminDb);
      }

      await loadServices();
      await refreshServices();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving service:', error);
      alert('Error al guardar el servicio');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este servicio?')) {
      try {
        await deleteService(id, tenantId, adminDb);
        await loadServices();
        await refreshServices();
      } catch (error) {
        console.error('Error deleting service:', error);
        alert('Error al eliminar el servicio');
      }
    }
  };

  const toggleActive = async (service) => {
    try {
      await updateService(service.id, { active: !service.isActive }, tenantId, adminDb);
      await loadServices();
      await refreshServices();
    } catch (error) {
      console.error('Error updating service:', error);
    }
  };

  // Filtro inteligente
  const filteredServices = useMemo(() => {
    if (!search.trim()) return services;
    const q = search.toLowerCase().trim();
    return services.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q) ||
      `$${s.price}`.includes(q)
    );
  }, [services, search]);

  const activeCount = services.filter(s => s.isActive).length;

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-4xl font-bold gradient-text">Gestión de Servicios</h1>
          <p className="text-gray-400 text-sm mt-1">
            {services.length} servicio{services.length !== 1 ? 's' : ''} &middot; {activeCount} activo{activeCount !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center space-x-2 shrink-0">
          <Plus size={20} />
          <span>Nuevo Servicio</span>
        </button>
      </div>

      {/* Buscador */}
      <div className="relative mb-6">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, descripción, categoría o precio..."
          className="w-full bg-gray-800 border border-gray-700 rounded-xl py-2.5 pl-10 pr-10 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-primary-500 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredServices.map((service) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`rounded-xl border overflow-hidden transition-all ${
              service.isActive 
                ? 'bg-gray-800 border-gray-700' 
                : 'bg-gray-800/50 border-red-900/30 opacity-60'
            }`}
          >
            <div className="h-48 bg-gradient-to-br from-primary-500/10 to-red-600/5 flex items-center justify-center overflow-hidden">
              {service.image ? (
                <img src={service.image} alt={service.name} className="w-full h-full object-cover" />
              ) : (
                <div className="text-6xl opacity-50">📺</div>
              )}
            </div>
            <div className="p-5">
              <h3 className="text-xl font-bold mb-2 text-white">{service.name}</h3>
              <p className="text-white/70 text-sm mb-4 line-clamp-2">{service.description}</p>
              <div className="flex items-center justify-between mb-4">
                <div>
                  {service.promotionalPrice ? (
                    <>
                      <p className="text-xl font-bold text-white">${service.promotionalPrice.toLocaleString()}</p>
                      <p className="text-sm text-white/50 line-through">${service.price.toLocaleString()}</p>
                    </>
                  ) : (
                    <p className="text-xl font-bold text-white">${service.price.toLocaleString()}</p>
                  )}
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  service.isActive 
                    ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {service.isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleOpenModal(service)}
                  className="flex-1 btn-secondary flex items-center justify-center space-x-2"
                >
                  <Edit size={16} />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => toggleActive(service)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${service.isActive
                    ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                    : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                    }`}
                >
                  {service.isActive ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => handleDelete(service.id)}
                  className="px-4 py-2 bg-red-500/20 text-red-300 rounded-lg hover:bg-red-500/30 transition-all"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-white/70 mb-2">Nombre</label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input-field"
              required
            />
          </div>

          <div>
            <label className="block text-white/70 mb-2">Descripción</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field"
              rows="3"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="price" className="block text-white/70 mb-2">Precio</label>
              <input
                id="price"
                type="number"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                className="input-field"
                required
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-white/70 mb-2">Precio Promocional (opcional)</label>
              <input
                type="number"
                value={formData.promotionalPrice}
                onChange={(e) => setFormData({ ...formData, promotionalPrice: e.target.value })}
                className="input-field"
                min="0"
                step="0.01"
              />
            </div>
            <div>
              <label className="block text-white/70 mb-2">Precio Mayorista (para subdistribuidores)</label>
              <input
                type="number"
                value={formData.wholesalePrice}
                onChange={(e) => setFormData({ ...formData, wholesalePrice: e.target.value })}
                className="input-field"
                min="0"
                step="0.01"
                placeholder="Ej: 15999"
              />
            </div>
            <div>
              <label className="block text-white/70 mb-2">Días de Servicio</label>
              <input
                type="number"
                value={formData.durationDays}
                onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                className="input-field"
                min="1"
                placeholder="Ej: 30 (mensual)"
              />
              <p className="text-gray-500 text-xs mt-1">Días que dura el servicio desde la compra. Se usa para calcular fechas de vencimiento.</p>
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Categoría</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="input-field"
              required
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Imagen</label>

            {/* URL Input */}
            <div className="mb-4">
              <label className="block text-white/50 text-sm mb-2">URL de Imagen (Recomendado)</label>
              <input
                type="url"
                value={formData.imageUrlInput}
                onChange={handleUrlChange}
                className="input-field"
                placeholder="https://ejemplo.com/imagen.jpg"
              />
              {formData.imageUrlInput && (
                <div className="mt-2">
                  {urlValidation.isValid ? (
                    <div className="flex items-center space-x-2 text-green-400 text-sm">
                      <CheckCircle2 size={16} />
                      <span>URL válida</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-red-400 text-sm">
                      <AlertCircle size={16} />
                      <span>{urlValidation.error}</span>
                    </div>
                  )}
                  {urlValidation.warning && (
                    <div className="flex items-center space-x-2 text-yellow-400 text-sm mt-1">
                      <AlertCircle size={16} />
                      <span>{urlValidation.warning}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Preview */}
            {(formData.imageUrlInput || formData.imageUrl) && !formData.image && (
              <div className="mb-4">
                <p className="text-white/50 text-sm mb-2">Vista previa:</p>
                <img
                  src={formData.imageUrlInput || formData.imageUrl}
                  alt="Preview"
                  className="w-32 h-32 object-cover rounded-lg"
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* File Upload */}
            <div>
              <label className="block text-white/50 text-sm mb-2">O subir desde dispositivo</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="input-field"
              />
              {formData.imageUrlInput && formData.image && (
                <p className="text-yellow-400 text-xs mt-2">
                  ⚠️ La URL tiene prioridad sobre el archivo
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-2">Beneficios</label>
            <div className="flex space-x-2 mb-2">
              <input
                type="text"
                value={benefitInput}
                onChange={(e) => setBenefitInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddBenefit())}
                className="input-field flex-1"
                placeholder="Agregar beneficio"
              />
              <button
                type="button"
                onClick={handleAddBenefit}
                className="btn-secondary"
              >
                Agregar
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {formData.benefits.map((benefit, index) => (
                <span
                  key={index}
                  className="bg-primary-500/20 text-primary-300 px-3 py-1 rounded-full text-sm flex items-center space-x-2"
                >
                  <span>{benefit}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveBenefit(index)}
                    className="hover:text-red-300"
                  >
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-white/70 mb-2">
              Términos y Condiciones del Servicio
              <span className="text-gray-500 text-sm ml-2">(se muestra al comprador antes de confirmar)</span>
            </label>
            <textarea
              value={formData.terms}
              onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
              className="input-field font-mono text-sm"
              rows="6"
              placeholder={`Ej: ✔️ Catálogo completo incluido\n✔️ Perfil personalizable\n❌ Prohibido cambiar clave\n☠️ No cumplir condiciones anula garantía`}
            />
          </div>

          {/* Precios Manuales */}
          <div className="glass p-4 rounded-lg bg-white/5">
            <label className="block text-white/70 mb-2 font-semibold">Precios Manuales (Opcional)</label>
            <p className="text-sm text-white/50 mb-3">
              Define precios específicos por meses. Si se agregan, estos reemplazarán el cálculo automático.
            </p>

            <div className="flex space-x-2 mb-3">
              <input
                type="number"
                value={pricingInput.months}
                onChange={(e) => setPricingInput({ ...pricingInput, months: e.target.value })}
                className="input-field w-24"
                placeholder="Meses"
                min="1"
              />
              <input
                type="number"
                value={pricingInput.price}
                onChange={(e) => setPricingInput({ ...pricingInput, price: e.target.value })}
                className="input-field flex-1"
                placeholder="Precio"
                min="0"
              />
              <button
                type="button"
                onClick={handleAddPricing}
                className="btn-secondary whitespace-nowrap"
              >
                Agregar Precio
              </button>
            </div>

            <div className="space-y-2">
              {formData.pricing.length === 0 && (
                <p className="text-white/30 text-sm italic text-center py-2">No hay precios manuales configurados (se usará el precio base).</p>
              )}
              {formData.pricing.map((item, index) => (
                <div key={index} className="flex items-center justify-between bg-primary-500/10 p-2 rounded">
                  <span className="text-white">
                    {item.months} {item.months === 1 ? 'Mes' : 'Meses'}:
                    <span className="font-bold ml-2">${item.price.toLocaleString()}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemovePricing(index)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cuentas y Perfiles — solo en edición */}
          {editingService && (
            <>
              <hr className="border-white/10 my-6" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Users size={20} />
                  Cuentas y Perfiles
                </h3>
                {accountsLoading && <span className="text-white/40 text-sm">Cargando...</span>}
              </div>

              {/* Stock summary */}
              {accountStock.total > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="glass p-3 rounded-lg text-center bg-white/5">
                    <p className="text-2xl font-bold text-white">{accountStock.total}</p>
                    <p className="text-xs text-white/50">Total Cuentas</p>
                  </div>
                  <div className="glass p-3 rounded-lg text-center bg-green-500/10">
                    <p className="text-2xl font-bold text-green-400">{accountStock.available}</p>
                    <p className="text-xs text-white/50">Perfiles Disponibles</p>
                  </div>
                  <div className="glass p-3 rounded-lg text-center bg-red-500/10">
                    <p className="text-2xl font-bold text-red-400">{accountStock.sold}</p>
                    <p className="text-xs text-white/50">Perfiles Vendidos</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 mb-4">
                <button
                  type="button"
                  onClick={() => { setEditingAccount(null); setShowAccountModal(true); }}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Plus size={16} />
                  Agregar Cuenta
                </button>
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="btn-secondary flex items-center gap-2 text-sm"
                >
                  <Upload size={16} />
                  Carga por lote
                </button>
              </div>

              {/* Expandable accounts table */}
              {accounts.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {accounts.map((account) => (
                    <div key={account.id} className="glass rounded-lg bg-white/5 overflow-hidden">
                      <div
                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-white/5 transition-colors"
                        onClick={() => setExpandedAccountId(expandedAccountId === account.id ? null : account.id)}
                      >
                        <div className="flex items-center gap-3">
                          {expandedAccountId === account.id ? (
                            <ChevronDown size={16} className="text-white/40" />
                          ) : (
                            <ChevronRight size={16} className="text-white/40" />
                          )}
                          <span className="text-white text-sm">{account.credential?.email}</span>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            (account.availableProfiles || (account.status === 'available' ? 1 : 0)) > 0
                              ? 'bg-green-500/20 text-green-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}>
                            {(account.availableProfiles || (account.status === 'available' ? 1 : 0))} disp.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('¿Eliminar esta cuenta y todos sus perfiles?')) {
                              deleteAccount(editingService.id, account.id, adminDb).then(() => {
                                loadAccounts(editingService.id);
                              });
                            }
                          }}
                          className="text-red-400 hover:text-red-300 p-1"
                          title="Eliminar cuenta"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {expandedAccountId === account.id && (
                        <div className="px-3 pb-3 border-t border-white/10 pt-2">
                          <p className="text-xs text-white/40 mb-2">Perfiles</p>
                          {/* Show virtual profile for legacy accounts */}
                          {!account.availableProfiles && account.status && (
                            <div className="flex items-center justify-between py-1 px-2 bg-white/5 rounded text-sm">
                              <span className="text-white/70">Perfil 1</span>
                              <span className={`px-2 py-0.5 rounded-full text-xs ${
                                account.status === 'available' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                              }`}>
                                {account.status === 'available' ? 'Disponible' : 'Vendido'}
                              </span>
                            </div>
                          )}
                          {account.availableProfiles !== undefined && (
                            <div className="flex items-center justify-between py-1 px-2 bg-white/5 rounded text-sm">
                              <span className="text-white/50 italic">Perfiles en subcolección</span>
                              <span className="text-white/40 text-xs">{account.availableProfiles} disponibles de {account.totalProfiles || '?'}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                !accountsLoading && (
                  <p className="text-white/30 text-sm italic text-center py-4">No hay cuentas cargadas para este servicio.</p>
                )
              )}
            </>
          )}

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <label htmlFor="active" className="text-white/70">Servicio activo</label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isPopular"
              checked={formData.isPopular}
              onChange={(e) => setFormData({ ...formData, isPopular: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <label htmlFor="isPopular" className="text-white/70">Mostrar en "Servicios Populares"</label>
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="btn-secondary"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="btn-primary"
            >
              {uploading ? 'Guardando...' : editingService ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Account Form Modal */}
      <AccountFormModal
        isOpen={showAccountModal}
        onClose={() => setShowAccountModal(false)}
        onSave={async (data) => {
          if (editingAccount) {
            await updateAccount(editingService.id, editingAccount.id, data, adminDb);
          } else {
            await createAccount(editingService.id, { ...data, label: data.label || data.credential?.email }, adminDb);
          }
          if (editingService) loadAccounts(editingService.id);
        }}
        serviceId={editingService?.id || ''}
        account={editingAccount}
      />

      {/* Batch Import Modal */}
      <BatchImportModal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        serviceId={editingService?.id || ''}
        tenantId={tenantId}
      />
    </div>
  );
};

export default Services;

