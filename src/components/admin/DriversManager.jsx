import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useLanguage } from '@/lib/useLanguage';
import { CheckCircle2, XCircle, User } from 'lucide-react';
import { toast } from 'sonner';

export default function DriversManager() {
  const { t } = useLanguage();
  const [drivers, setDrivers] = useState([]);

  const load = () => {
    base44.entities.User.list().then(users => {
      setDrivers(users.filter(u => u.driver_status && ['pending', 'approved', 'blocked'].includes(u.driver_status)));
    });
  };
  useEffect(() => { load(); }, []);

  const updateStatus = async (id, status) => {
    await base44.entities.User.update(id, { driver_status: status });
    load();
    toast.success(status === 'approved' ? t('approved') : t('blocked'));
  };

  const statusConfig = {
    pending: { label: t('pending'), cls: 'bg-amber-100 text-amber-800' },
    approved: { label: t('approved'), cls: 'bg-green-100 text-green-800' },
    blocked: { label: t('blocked'), cls: 'bg-red-100 text-red-800' },
  };

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900">{t('drivers')}</h3>

      <div className="space-y-3">
        {drivers.map(driver => {
          const status = driver.driver_status || 'pending';
          const cfg = statusConfig[status] || statusConfig.pending;
          return (
            <div key={driver.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <User size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-gray-900">
                      {driver.full_name || driver.email}
                    </p>
                    <p className="text-xs text-gray-500">{driver.email}</p>
                    {driver.vehicle_number && (
                      <p className="text-xs text-gray-500">№ {driver.vehicle_number}</p>
                    )}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => updateStatus(driver.id, 'approved')}
                  disabled={status === 'approved'}
                  className="flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-opacity"
                >
                  <CheckCircle2 size={13} /> {t('approve')}
                </button>
                <button
                  onClick={() => updateStatus(driver.id, 'blocked')}
                  disabled={status === 'blocked'}
                  className="flex items-center gap-1.5 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-medium disabled:opacity-40 transition-opacity"
                >
                  <XCircle size={13} /> {t('block')}
                </button>
              </div>
            </div>
          );
        })}
        {drivers.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">{t('drivers')}: 0</p>
        )}
      </div>
    </div>
  );
}