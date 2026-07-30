import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Store, Users, ChevronRight, Sparkles, Shield, Zap, TrendingUp, Globe, ArrowRight, Check } from 'lucide-react';
import { getAllActiveTenants } from '../services/tenant';
import type { Tenant } from '../types';

// ─── Sección Hero ───────────────────────────────────────────────────────────
const HeroSection = ({ onScrollToPlans, onScrollToTiendas }: { 
  onScrollToPlans: () => void; 
  onScrollToTiendas: () => void;
}) => (
  <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
    {/* Fondo animado */}
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-gradient-to-br from-black via-[#0A0A0A] to-[#1A0000]" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-600/20 rounded-full blur-[128px] animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-red-500/10 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute inset-0">
        <div className="absolute top-20 left-10 w-2 h-2 bg-red-400/50 rounded-full" />
        <div className="absolute top-40 right-20 w-1.5 h-1.5 bg-red-400/30 rounded-full" />
        <div className="absolute bottom-40 left-1/4 w-1.5 h-1.5 bg-red-400/40 rounded-full" />
        <div className="absolute bottom-20 right-1/3 w-2 h-2 bg-red-400/30 rounded-full" />
      </div>
    </div>

    <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-sm mb-8">
          <Sparkles size={14} />
          <span>Plataforma líder en servicios digitales</span>
        </div>

        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 leading-tight">
          Tu tienda de servicios
          <br />
          <span className="bg-gradient-to-r from-red-500 via-red-400 to-red-600 bg-clip-text text-transparent">
            digitales
          </span>
        </h1>

        <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
          La plataforma todo-en-uno para vender cuentas de streaming, recargas móviles, 
          diamantes de juegos y más. Crea tu tienda en minutos y empieza a vender.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={onScrollToPlans}
            className="group relative px-8 py-4 bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold rounded-xl text-lg transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/30 hover:scale-105"
          >
            <span className="relative z-10 flex items-center gap-2">
              Quiero mi tienda
              <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </span>
          </button>
          <button
            onClick={onScrollToTiendas}
            className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl text-lg border border-white/10 hover:border-red-500/50 transition-all duration-300"
          >
            Ver tiendas destacadas
          </button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.4 }}
        className="mt-20 grid grid-cols-2 md:grid-cols-3 gap-8 max-w-2xl mx-auto"
      >
        {[
          { value: '50+', label: 'Tiendas activas' },
          { value: '10K+', label: 'Clientes satisfechos' },
          { value: '99%', label: 'Servicio garantizado' },
        ].map((stat) => (
          <div key={stat.label} className="text-center">
            <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
              {stat.value}
            </div>
            <div className="text-white/50 text-sm mt-1">{stat.label}</div>
          </div>
        ))}
      </motion.div>
    </div>
  </section>
);

// ─── Sección Cómo Funciona ─────────────────────────────────────────────────
const ComoFuncionaSection = () => (
  <section className="relative py-24 px-4">
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
          ¿Cómo funciona?
        </h2>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          En tres pasos tenés tu tienda digital lista para vender
        </p>
      </motion.div>

      <div className="grid md:grid-cols-3 gap-8">
        {[
          {
            step: '01',
            icon: Store,
            title: 'Creás tu tienda',
            desc: 'Elegís tu plan, configurás tu marca, colores y servicios. Sin conocimientos técnicos.',
            color: 'from-red-500/20 to-red-600/10'
          },
          {
            step: '02',
            icon: Zap,
            title: 'Agregás productos',
            desc: 'Subís tus servicios: cuentas de streaming, recargas, pines o lo que quieras vender.',
            color: 'from-red-600/20 to-red-700/10'
          },
          {
            step: '03',
            icon: TrendingUp,
            title: 'Empezás a vender',
            desc: 'Tus clientes compran, reciben automáticamente y vos ganás. Nosotros nos encargamos de la tecnología.',
            color: 'from-red-700/20 to-red-800/10'
          }
        ].map((item, i) => (
          <motion.div
            key={item.step}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.15 }}
            className="relative group"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${item.color} rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
            <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:border-red-500/30 transition-all duration-300">
              <div className="text-6xl font-bold bg-gradient-to-r from-red-500/20 to-transparent bg-clip-text text-transparent absolute top-4 right-6">
                {item.step}
              </div>
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center mb-6 border border-red-500/20">
                <item.icon size={28} className="text-red-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
              <p className="text-white/60 leading-relaxed">{item.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Sección Tiendas Destacadas ─────────────────────────────────────────────
const TiendasSection = ({ tenants }: { tenants: Tenant[] }) => {
  if (tenants.length === 0) return null;

  return (
    <section id="tiendas" className="relative py-24 px-4">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-red-500/5 to-transparent" />
      
      <div className="max-w-6xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Tiendas destacadas
          </h2>
          <p className="text-white/60 text-lg max-w-2xl mx-auto">
            Conocé algunas de las tiendas que ya confían en nosotros
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {tenants.map((tenant, i) => (
            <motion.a
              key={tenant.id}
              href={`/?v=${tenant.id}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="group relative bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-all duration-300 overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="relative flex items-center gap-4 mb-4">
                {/* Avatar / Logo */}
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/20 overflow-hidden shrink-0">
                  {tenant.logoUrl ? (
                    <img src={tenant.logoUrl} alt={tenant.name} className="w-full h-full object-cover" />
                  ) : (
                    <Store size={24} className="text-red-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate">{tenant.name}</h3>
                  {tenant.subdomain && (
                    <p className="text-white/40 text-sm truncate">{tenant.subdomain}.ejstreaming.shop</p>
                  )}
                </div>
              </div>

              <div className="relative flex items-center justify-between">
                <span className="text-white/50 text-sm group-hover:text-red-400 transition-colors">
                  Visitar tienda
                </span>
                <ChevronRight size={18} className="text-white/30 group-hover:text-red-400 group-hover:translate-x-1 transition-all" />
              </div>
            </motion.a>
          ))}
        </div>
      </div>
    </section>
  );
};

// ─── Sección Planes ─────────────────────────────────────────────────────────
const PlanesSection = ({ onSelectPlan }: { onSelectPlan: (plan: string) => void }) => (
  <section id="planes" className="relative py-24 px-4">
    <div className="absolute inset-0 bg-gradient-to-t from-black via-red-500/5 to-transparent" />
    
    <div className="max-w-5xl mx-auto relative">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-sm mb-6">
          <Sparkles size={14} />
          <span>Planes flexibles</span>
        </div>
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Elegí tu plan
        </h2>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Sin compromisos. Elegí el plan que mejor se adapte a tus necesidades.
        </p>
      </motion.div>

      <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
        {/* Plan Dueño de Tienda */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="group relative"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl blur-lg opacity-40 group-hover:opacity-70 transition-opacity duration-500" />
          <div className="relative bg-[#0A0A0A] border border-red-500/20 rounded-2xl p-8">
            {/* Popular tag */}
            <div className="inline-flex items-center gap-1 px-3 py-1 bg-red-500/20 border border-red-500/30 rounded-full text-red-400 text-xs font-medium mb-6">
              <Sparkles size={12} />
              <span>Más popular</span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/20">
                <Store size={24} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Dueño de Tienda</h3>
                <p className="text-white/50 text-sm">Tienda virtual propia</p>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$20</span>
              <span className="text-white/50 text-lg"> USD</span>
              <span className="text-white/40"> /mes</span>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                'Tienda personalizada con tu marca',
                'Panel de administración completo',
                'Gestión de clientes y ventas',
                'Soporte técnico prioritario',
                'Hasta 20 servicios activos',
                'Sin comisión por venta',
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-white/70">
                  <Check size={18} className="text-green-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => onSelectPlan('tienda')}
              className="w-full py-4 bg-gradient-to-r from-red-600 to-red-500 text-white font-semibold rounded-xl transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/30 hover:scale-[1.02]"
            >
              Quiero mi tienda
            </button>
          </div>
        </motion.div>

        {/* Plan Distribuidor */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          className="group relative"
        >
          <div className="absolute -inset-0.5 bg-gradient-to-br from-red-400 to-red-600 rounded-2xl blur-lg opacity-20 group-hover:opacity-40 transition-opacity duration-500" />
          <div className="relative bg-[#0A0A0A] border border-white/10 rounded-2xl p-8 group-hover:border-red-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/20">
                <Users size={24} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">Distribuidor</h3>
                <p className="text-white/50 text-sm">Ganá vendiendo</p>
              </div>
            </div>

            <div className="mb-6">
              <span className="text-4xl font-bold text-white">$5</span>
              <span className="text-white/50 text-lg"> USD</span>
              <span className="text-white/40 text-sm"> (saldo consumible)</span>
            </div>

            <ul className="space-y-3 mb-8">
              {[
                'Registro gratuito',
                '$5 USD de saldo para empezar',
                'Catálogo mayorista de servicios',
                'Tus propios precios de venta',
                'Sin mensualidades',
                'Comisiones desde el día 1',
              ].map((f) => (
                <li key={f} className="flex items-start gap-3 text-white/70">
                  <Check size={18} className="text-green-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => onSelectPlan('distribuidor')}
              className="w-full py-4 bg-white/5 hover:bg-white/10 text-white font-semibold rounded-xl border border-white/20 hover:border-red-500/50 transition-all duration-300"
            >
              Quiero ser distribuidor
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  </section>
);

// ─── Sección Video (placeholder) ────────────────────────────────────────────
const VideoSection = () => (
  <section className="relative py-24 px-4">
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-10"
      >
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Mirá cómo funciona
        </h2>
        <p className="text-white/60">
          En menos de 2 minutos tenés tu tienda lista
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-red-500/10 via-black to-red-600/10 border border-white/10"
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <div className="w-0 h-0 border-t-[12px] border-t-transparent border-l-[20px] border-l-red-400 border-b-[12px] border-b-transparent ml-1" />
            </div>
            <p className="text-white/40 text-sm">Video próximamente</p>
          </div>
        </div>
      </motion.div>
    </div>
  </section>
);

// ─── Sección Features ───────────────────────────────────────────────────────
const FeaturesSection = () => (
  <section className="relative py-24 px-4">
    <div className="max-w-6xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
          ¿Por qué elegirnos?
        </h2>
        <p className="text-white/60 text-lg max-w-2xl mx-auto">
          Todo lo que necesitás para tener tu negocio digital funcionando
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[
          { icon: Shield, title: 'Pago seguro', desc: 'Tus clientes pagan con confianza. Múltiples métodos de pago disponibles.' },
          { icon: Zap, title: 'Entrega inmediata', desc: 'Cuando un cliente compra, el servicio se entrega al instante de forma automática.' },
          { icon: Globe, title: 'Multi-tienda', desc: 'Manejá varias tiendas desde un solo panel. Control total de tu negocio.' },
          { icon: TrendingUp, title: 'Sin límites', desc: 'Vendé todos los servicios que quieras. Sin restricciones de stock ni cuotas.' },
          { icon: Users, title: 'Equipo de soporte', desc: 'Te acompañamos en cada paso. Soporte técnico para vos y tus clientes.' },
          { icon: Sparkles, title: 'Personalizable', desc: 'Tu tienda con tus colores, tu logo, tu marca. Se ve como vos querés.' },
        ].map((feature, i) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="group bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-red-500/30 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center mb-4 border border-red-500/20">
              <feature.icon size={24} className="text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
            <p className="text-white/60 text-sm leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </div>
  </section>
);

// ─── Footer ─────────────────────────────────────────────────────────────────
const FooterSection = () => (
  <footer className="relative border-t border-white/10 py-12 px-4">
    <div className="max-w-6xl mx-auto">
      <div className="grid md:grid-cols-3 gap-8 mb-8">
        <div>
          <h3 className="text-lg font-bold text-white mb-3">EJ Streaming Shop</h3>
          <p className="text-white/50 text-sm leading-relaxed">
            La plataforma líder de servicios digitales. Creá tu tienda y empezá a vender hoy.
          </p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wider">Planes</h4>
          <ul className="space-y-2">
            <li><a href="#planes" className="text-white/50 hover:text-red-400 text-sm transition-colors">Dueño de Tienda</a></li>
            <li><a href="#planes" className="text-white/50 hover:text-red-400 text-sm transition-colors">Distribuidor</a></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-white/70 mb-3 uppercase tracking-wider">Contacto</h4>
          <ul className="space-y-2">
            <li className="text-white/50 text-sm">ventas@ejstreaming.shop</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 pt-6 text-center">
        <p className="text-white/30 text-sm">© {new Date().getFullYear()} EJ Streaming Shop. Todos los derechos reservados.</p>
      </div>
    </div>
  </footer>
);

// ─── Modal Forms ────────────────────────────────────────────────────────────
const FormModal = ({ plan, onClose }: { plan: string; onClose: () => void }) => {
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [nombreNegocio, setNombreNegocio] = useState('');

  const isTienda = plan === 'tienda';

  const getWhatsAppMessage = () => {
    const planName = isTienda ? 'Dueño de Tienda - $20 USD/mes' : 'Distribuidor - $5 USD';
    let msg = `Hola, quiero el plan *${planName}*%0A`;
    msg += `%0A📋 *Mis datos:*%0A`;
    msg += `👤 Nombre: ${nombre}%0A`;
    msg += `📧 Correo: ${email}%0A`;
    if (isTienda && nombreNegocio) {
      msg += `🏪 Negocio: ${nombreNegocio}`;
    }
    return msg;
  };

  const getEmailSubject = () => {
    const planName = isTienda ? 'Dueño de Tienda - $20 USD/mes' : 'Distribuidor - $5 USD';
    return `Solicitud: ${planName}`;
  };

  const getEmailBody = () => {
    let msg = `Hola, quiero el plan: ${isTienda ? 'Dueño de Tienda - $20 USD/mes' : 'Distribuidor - $5 USD'}\n\n`;
    msg += `Mis datos:\n`;
    msg += `Nombre: ${nombre}\n`;
    msg += `Correo: ${email}\n`;
    if (isTienda && nombreNegocio) {
      msg += `Nombre del negocio: ${nombreNegocio}\n`;
    }
    return encodeURIComponent(msg);
  };

  const handleWhatsApp = () => {
    if (!nombre || !email || (isTienda && !nombreNegocio)) return;
    window.open(`https://wa.me/573101234567?text=${getWhatsAppMessage()}`, '_blank');
  };

  const handleEmail = () => {
    if (!nombre || !email) return;
    window.location.href = `mailto:ventas@ejstreaming.shop?subject=${getEmailSubject()}&body=${getEmailBody()}`;
  };

  const isValid = nombre && email && (isTienda ? true : true);
  const canSendWA = nombre && email;
  const canSendEmail = nombre && email;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-[#0A0A0A] border border-white/10 rounded-2xl w-full max-w-md p-8"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/20 flex items-center justify-center border border-red-500/20`}>
            {isTienda ? <Store size={24} className="text-red-400" /> : <Users size={24} className="text-red-400" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">
              {isTienda ? 'Quiero mi Tienda' : 'Ser Distribuidor'}
            </h2>
            <p className="text-white/50 text-sm">
              {isTienda ? '$20 USD / mes' : '$5 USD (saldo consumible)'}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-white/70 mb-1.5">Nombre completo</label>
            <input
              type="text"
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="Ej: Juan Pérez"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1.5">Correo electrónico</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
              placeholder="ejemplo@correo.com"
            />
          </div>

          {isTienda && (
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Nombre de tu negocio (opcional)</label>
              <input
                type="text"
                value={nombreNegocio}
                onChange={e => setNombreNegocio(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="Ej: StreamZone"
              />
            </div>
          )}

          <div className="pt-4">
            <p className="text-white/50 text-sm mb-4 text-center">
              Elegí cómo enviar tu solicitud. Sin compromiso.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleWhatsApp}
                disabled={!canSendWA}
                className="w-full py-3.5 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-700 hover:to-green-600 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.195.194 1.666.179.47-.015 1.725-.652 1.972-1.469.247-.817.347-1.732.372-1.817.025-.085.025-.16.05-.248.025-.098.05-.198.075-.298.049-.099.124-.199.199-.347.074-.149.124-.298.174-.447.05-.149.025-.298-.025-.447-.049-.149-.174-.298-.347-.447-.174-.149-.347-.223-.52-.298-.174-.074-.347-.149-.52-.223-.174-.074-.298-.124-.447-.174-.149-.05-.223-.124-.298-.174-.074-.05-.124-.074-.174-.099-.149-.025-.223-.074-.298-.124-.074-.049-.149-.099-.223-.149z"/></svg>
                Enviar por WhatsApp
              </button>
              <button
                onClick={handleEmail}
                disabled={!canSendEmail}
                className="w-full py-3.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed text-white font-semibold rounded-xl flex items-center justify-center gap-2 border border-white/20 hover:border-red-500/50 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                Enviar por Correo
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ─── Componente Principal ──────────────────────────────────────────────────
const LandingPage = () => {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const planesRef = useRef<HTMLDivElement>(null);
  const tiendasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAllActiveTenants()
      .then(setTenants)
      .finally(() => setLoading(false));
  }, []);

  const scrollToPlans = () => {
    document.getElementById('planes')?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToTiendas = () => {
    document.getElementById('tiendas')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-black">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <a href="/" className="text-xl font-bold">
            <span className="bg-gradient-to-r from-red-500 to-red-400 bg-clip-text text-transparent">
              EJ Streaming Shop
            </span>
          </a>
          <div className="hidden md:flex items-center gap-6">
            <a href="#tiendas" className="text-white/70 hover:text-white text-sm transition-colors">Tiendas</a>
            <a href="#planes" className="text-white/70 hover:text-white text-sm transition-colors">Planes</a>
            <a
              href="/login"
              className="text-white/50 hover:text-white text-sm transition-colors"
            >
              Login
            </a>
            <button
              onClick={scrollToPlans}
              className="px-4 py-2 bg-gradient-to-r from-red-600 to-red-500 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-red-500/30 transition-all"
            >
              Quiero mi tienda
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <HeroSection onScrollToPlans={scrollToPlans} onScrollToTiendas={scrollToTiendas} />

      {/* Features */}
      <FeaturesSection />

      {/* Cómo funciona */}
      <ComoFuncionaSection />

      {/* Tiendas destacadas */}
      <div ref={tiendasRef}>
        {!loading && <TiendasSection tenants={tenants} />}
      </div>

      {/* Video placeholder */}
      <VideoSection />

      {/* Planes */}
      <div ref={planesRef}>
        <PlanesSection onSelectPlan={setSelectedPlan} />
      </div>

      {/* Footer */}
      <FooterSection />

      {/* Modal de formulario */}
      <AnimatePresence>
        {selectedPlan && (
          <FormModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default LandingPage;
