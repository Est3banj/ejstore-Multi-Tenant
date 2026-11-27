import type { ReactNode } from 'react';

// Shared with the QR result: keep its markup, icons and palette in one place.
export function RechargeResultContent({ success, pending = false, title, message, children }: {
  success: boolean; pending?: boolean; title: string; message?: string; children: ReactNode;
}) {
  return <div className={`text-center py-6 ${pending ? 'space-y-5' : 'space-y-4'}`}>
    <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${pending ? 'bg-yellow-500/20' : success ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
      <svg aria-hidden="true" className={`w-8 h-8 ${pending ? 'text-yellow-400' : success ? 'text-green-400' : 'text-red-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={pending ? 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' : success ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} />
      </svg>
    </div>
    <div>
      <h3 className={`text-white font-bold text-lg ${success ? 'text-green-400' : ''}`}>{title}</h3>
      <p className="text-gray-400 text-sm mt-1">{message}</p>
    </div>
    <div className="flex flex-col gap-2 pt-2">{children}</div>
  </div>;
}
