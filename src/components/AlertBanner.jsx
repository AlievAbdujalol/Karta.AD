import { useState, useEffect } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { supabase } from '@/api/supabase';

export default function AlertBanner() {
  const [alert, setAlert] = useState(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const fetchAlert = async () => {
      const { data } = await supabase
        .from('transit_alerts')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (data && data.length > 0) {
        setAlert(data[0]);
      }
    };
    
    fetchAlert();

    const channel = supabase.channel('transit_alerts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transit_alerts' }, fetchAlert)
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  if (!alert || !visible) return null;

  return (
    <div className={`absolute top-0 left-0 right-0 z-[1000] p-3 shadow-md flex items-center justify-between ${alert.type === 'emergency' ? 'bg-red-600 text-white' : 'bg-amber-500 text-white'}`}>
      <div className="flex items-center gap-2">
        <AlertCircle size={20} />
        <span className="text-sm font-bold">{alert.message}</span>
      </div>
      <button onClick={() => setVisible(false)}><X size={20} /></button>
    </div>
  );
}
