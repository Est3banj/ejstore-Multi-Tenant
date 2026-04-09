import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getAllServices,
  createService,
  updateService,
  deleteService
} from '../../services/firestore';
import { uploadImage } from '../../services/storage';
import { CATEGORIES } from '../../utils/constants';
import { validateImageUrl } from '../../utils/validation';
import Modal from '../../components/Modal';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';

const Services = () => {
  const { refreshServices, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const tenantId = effectiveTenantId;
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    promotionalPrice: '',
    category: 'pantallas',
    image: null,
    imageUrl: '',
    imageUrlInput: '',
    active: true,
    isPopular: false,
    benefits: [],
    pricing: []
  });
  const [pricingInput, setPricingInput] = useState({ months: '', price: '' });
  const [uploading, setUploading] = useState(false);
  const [benefitInput, setBenefitInput] = useState('');
  const [urlValidation, setUrlValidation] = useState({ isValid: true, error: '', warning: '' });

  const loadServices = async () => {
    if (!tenantId) return;
    try {
      const data = await getAllServices(tenantId);
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
        category: service.category || 'pantallas',
        image: null,
        imageUrl: service.image || '',
        imageUrlInput: '',
        active: service.active !== undefined ? service.active : true,
        isPopular: service.isPopular || false,
        benefits: service.benefits || [],
        pricing: service.pricing || []
      });
    } else {
      setEditingService(null);
      setFormData({
        name: '',
        description: '',
        price: '',
        promotionalPrice: '',
        category: 'pantallas',
        image: null,
        imageUrl: '',
        imageUrlInput: '',
        active: true,
        isPopular: false,
        benefits: [],
        pricing: []
      });
    }
    setUrlValidation({ isValid: true, error: '', warning: '' });
    setShowModal(true);
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
        category: formData.category,
        image: imageUrl,
        active: formData.active,
        isPopular: formData.isPopular,
        benefits: formData.benefits,
        pricing: formData.pricing
      };

      if (editingService) {
        await updateService(editingService.id, serviceData, tenantId);
      } else {
        await createService(serviceData, tenantId);
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
        await deleteService(id, tenantId);
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
      await updateService(service.id, { active: !service.active }, tenantId);
      await loadServices();
      await refreshServices();
    } catch (error) {
      console.error('Error updating service:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold gradient-text">Gestión de Servicios</h1>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Nuevo Servicio</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {services.map((service) => (
          <motion.div
            key={service.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass rounded-xl overflow-hidden ${!service.active ? 'opacity-50' : ''}`}
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
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${service.active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                  {service.active ? 'Activo' : 'Inactivo'}
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
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${service.active
                    ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                    : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                    }`}
                >
                  {service.active ? 'Desactivar' : 'Activar'}
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
            <label className="block text-white/70 mb-2">Nombre</label>
            <input
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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-white/70 mb-2">Precio</label>
              <input
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
    </div>
  );
};

export default Services;

