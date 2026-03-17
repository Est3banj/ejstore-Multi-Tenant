import { useTenant } from '../context/TenantContext';

const NoTenantPage = () => {
  const { error } = useTenant();

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark px-4">
      <div className="text-center max-w-md">
        <div className="text-6xl mb-6">🏪</div>
        <h1 className="text-3xl font-bold text-white mb-4">
          Tienda no encontrada
        </h1>
        <p className="text-white/70 mb-6">
          {error || 'No se especificó una tienda en la URL'}
        </p>
        <div className="glass p-4 rounded-lg text-left">
          <p className="text-white/50 text-sm mb-2">Prueba alguna de estas URLs:</p>
          <ul className="text-white/70 text-sm space-y-1">
            <li>• <code className="bg-white/10 px-2 py-1 rounded">/?v=micromercado</code></li>
            <li>• <code className="bg-white/10 px-2 py-1 rounded">/?tenant=mitienda</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default NoTenantPage;