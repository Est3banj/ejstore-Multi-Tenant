const MeshBackground = (): JSX.Element => {
  return (
    <div className="fixed inset-0 overflow-hidden -z-10">
      <style>{`
        @keyframes mesh-float-1 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
          25% { transform: translate(60px, -40px) scale(1.1); opacity: 0.5; }
          50% { transform: translate(20px, 80px) scale(0.9); opacity: 0.3; }
          75% { transform: translate(-40px, 20px) scale(1.05); opacity: 0.45; }
        }
        @keyframes mesh-float-2 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.35; }
          25% { transform: translate(-50px, 60px) scale(1.15); opacity: 0.25; }
          50% { transform: translate(40px, -30px) scale(0.85); opacity: 0.4; }
          75% { transform: translate(-20px, -60px) scale(1.1); opacity: 0.3; }
        }
        @keyframes mesh-float-3 {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.25; }
          33% { transform: translate(30px, 50px) scale(1.2); opacity: 0.35; }
          66% { transform: translate(-60px, -20px) scale(0.8); opacity: 0.2; }
        }
        @keyframes mesh-rotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .mesh-blob-1 {
          width: 500px;
          height: 500px;
          background: radial-gradient(ellipse at center, rgba(255,255,255,0.15) 0%, transparent 70%);
          border-radius: 50%;
          animation: mesh-float-1 12s ease-in-out infinite;
          filter: blur(80px);
        }
        .mesh-blob-2 {
          width: 400px;
          height: 400px;
          background: radial-gradient(ellipse at center, rgba(150,150,150,0.12) 0%, transparent 70%);
          border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%;
          animation: mesh-float-2 15s ease-in-out infinite;
          filter: blur(60px);
        }
        .mesh-blob-3 {
          width: 300px;
          height: 300px;
          background: radial-gradient(ellipse at center, rgba(200,200,200,0.1) 0%, transparent 70%);
          border-radius: 60% 40% 30% 70% / 60% 30% 70% 40%;
          animation: mesh-float-3 18s ease-in-out infinite;
          filter: blur(50px);
        }
      `}</style>
      <div className="absolute inset-0 bg-black" />
      <div className="absolute top-1/4 left-1/4 mesh-blob-1" />
      <div className="absolute bottom-1/4 right-1/4 mesh-blob-2" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mesh-blob-3" />
    </div>
  );
};

export default MeshBackground;
