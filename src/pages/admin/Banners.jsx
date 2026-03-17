import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getAllBanners,
  createBanner,
  updateBanner,
  deleteBanner
} from '../../services/firestore';
import { uploadImage } from '../../services/storage';
import { validateImageUrl } from '../../utils/validation';
import Modal from '../../components/Modal';
import { motion } from 'framer-motion';
import { Plus, Edit, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';

const Banners = () => {
  const { refreshBanners, tenant, userTenantId } = useApp();
  const effectiveTenantId = tenant?.id || userTenantId;
  const tenantId = effectiveTenantId;
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    image: null,
    imageUrl: '',
    imageUrlInput: '',
    active: true,
    order: 0
  });
  const [uploading, setUploading] = useState(false);
  const [urlValidation, setUrlValidation] = useState({ isValid: true, error: '', warning: '' });

  useEffect(() => {
    if (tenantId) {
      loadBanners();
    }
  }, [tenantId]);

  const loadBanners = async () => {
    if (!tenantId) return;
    try {
      const data = await getAllBanners(tenantId);
      setBanners(data);
    } catch (error) {
      console.error('Error loading banners:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (banner = null) => {
    if (banner) {
      setEditingBanner(banner);
      setFormData({
        title: banner.title || '',
        description: banner.description || '',
        image: null,
        imageUrl: banner.image || '',
        imageUrlInput: '',
        active: banner.active !== undefined ? banner.active : true,
        order: banner.order || 0
      });
    } else {
      setEditingBanner(null);
      setFormData({
        title: '',
        description: '',
        image: null,
        imageUrl: '',
        imageUrlInput: '',
        active: true,
        order: banners.length
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate URL if provided
    if (formData.imageUrlInput && !urlValidation.isValid) {
      alert('Por favor, corrija la URL de la imagen antes de continuar');
      return;
    }

    // Ensure either URL or file is provided for new banners
    if (!editingBanner && !formData.imageUrlInput && !formData.image && !formData.imageUrl) {
      alert('Por favor, proporcione una imagen mediante URL o archivo');
      return;
    }

    setUploading(true);

    try {
      let imageUrl = formData.imageUrl;

      // Priority: URL input > File upload > Existing URL
      if (formData.imageUrlInput && formData.imageUrlInput.trim()) {
        imageUrl = formData.imageUrlInput.trim();
      } else if (formData.image) {
        const path = `banners/${Date.now()}_${formData.image.name}`;
        imageUrl = await uploadImage(formData.image, path);
      }

      const bannerData = {
        title: formData.title,
        description: formData.description,
        image: imageUrl,
        active: formData.active,
        order: parseInt(formData.order)
      };

      if (editingBanner) {
        await updateBanner(editingBanner.id, bannerData, tenantId);
      } else {
        await createBanner(bannerData, tenantId);
      }

      await loadBanners();
      await refreshBanners();
      setShowModal(false);
    } catch (error) {
      console.error('Error saving banner:', error);
      alert('Error al guardar el banner');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este banner?')) {
      try {
        await deleteBanner(id, tenantId);
        await loadBanners();
        await refreshBanners();
      } catch (error) {
        console.error('Error deleting banner:', error);
        alert('Error al eliminar el banner');
      }
    }
  };

  const toggleActive = async (banner) => {
    try {
      await updateBanner(banner.id, { active: !banner.active }, tenantId);
      await loadBanners();
      await refreshBanners();
    } catch (error) {
      console.error('Error updating banner:', error);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><div className="loader"></div></div>;
  }

  return (
    <div className="min-h-screen p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold gradient-text">Gestión de Banners</h1>
        <button onClick={() => handleOpenModal()} className="btn-primary flex items-center space-x-2">
          <Plus size={20} />
          <span>Nuevo Banner</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {banners.map((banner) => (
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass rounded-xl overflow-hidden ${!banner.active ? 'opacity-50' : ''}`}
          >
            <div className="h-48 bg-gradient-to-br from-primary-500/10 to-red-600/5 flex items-center justify-center overflow-hidden">
              {banner.image ? (
                <img src={banner.image} alt={banner.title || 'Banner'} className="w-full h-full object-cover" />
              ) : (
                <div className="text-6xl opacity-50">🖼️</div>
              )}
            </div>
            <div className="p-5">
              <h3 className="text-xl font-bold mb-2 text-white">{banner.title || 'Sin título'}</h3>
              <p className="text-white/70 text-sm mb-4 line-clamp-2">{banner.description}</p>
              <div className="flex items-center justify-between mb-4">
                <span className="text-white/50 text-sm">Orden: {banner.order || 0}</span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${banner.active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                  }`}>
                  {banner.active ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleOpenModal(banner)}
                  className="flex-1 btn-secondary flex items-center justify-center space-x-2"
                >
                  <Edit size={16} />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => toggleActive(banner)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${banner.active
                    ? 'bg-yellow-500/20 text-yellow-300 hover:bg-yellow-500/30'
                    : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                    }`}
                >
                  {banner.active ? 'Desactivar' : 'Activar'}
                </button>
                <button
                  onClick={() => handleDelete(banner.id)}
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
        title={editingBanner ? 'Editar Banner' : 'Nuevo Banner'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/70 mb-2">Título (opcional)</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-white/70 mb-2">Descripción (opcional)</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input-field"
              rows="3"
            />
          </div>

          <div>
            <label className="block text-white/70 mb-2">Orden</label>
            <input
              type="number"
              value={formData.order}
              onChange={(e) => setFormData({ ...formData, order: e.target.value })}
              className="input-field"
              min="0"
            />
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
                placeholder="https://ejemplo.com/banner.jpg"
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
                  className="w-full h-64 object-cover rounded-lg"
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

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="active"
              checked={formData.active}
              onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
              className="w-5 h-5 rounded"
            />
            <label htmlFor="active" className="text-white/70">Banner activo</label>
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
              {uploading ? 'Guardando...' : editingBanner ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default Banners;

