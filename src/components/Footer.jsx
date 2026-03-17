import { useApp } from '../context/AppContext';

const Footer = () => {
  const { settings } = useApp();

  return (
    <footer className="glass-dark border-t border-white/10 mt-20">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="text-xl font-bold gradient-text mb-4">
              {settings.siteName || 'EJStore'}
            </h3>
            <p className="text-white/70">
              Tu plataforma de confianza para servicios digitales y streaming.
            </p>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Enlaces</h4>
            <ul className="space-y-2 text-white/70">
              <li>
                <a href="/#categorias" className="hover:text-white transition-colors">
                  Categorías
                </a>
              </li>
              <li>
                <a href="/#servicios" className="hover:text-white transition-colors">
                  Servicios
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-lg font-semibold mb-4">Contacto</h4>
            {settings.contactEmail && (
              <p className="text-white/70 mb-2">
                Email: <a href={`mailto:${settings.contactEmail}`} className="hover:text-white">{settings.contactEmail}</a>
              </p>
            )}
            {settings.whatsappNumber && (
              <p className="text-white/70">
                WhatsApp: <a href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, '')}`} className="hover:text-white" target="_blank" rel="noopener noreferrer">{settings.whatsappNumber}</a>
              </p>
            )}
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-white/10 text-center text-white/50">
          <p>&copy; {new Date().getFullYear()} {settings.siteName || 'EJStore'}. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;

