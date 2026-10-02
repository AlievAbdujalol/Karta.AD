import { useState } from 'react';
import { Star, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/api/supabase';

export default function RouteFeedback({ tripId, onClose }) {
  const [rating, setRating] = useState(0);
  const [discrepancy, setDiscrepancy] = useState(0); // minutes
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await supabase.from('route_feedback').insert({
        trip_id: tripId,
        rating,
        time_discrepancy_min: discrepancy
      });
      toast.success("Спасибо за отзыв!");
      onClose();
    } catch {
      toast.error("Не удалось отправить отзыв");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex justify-between items-center">
            <h3 className="font-bold text-lg">Оцените поездку</h3>
            <button onClick={onClose}><X size={20}/></button>
        </div>
        
        <div className="flex justify-center gap-2">
            {[1,2,3,4,5].map(r => (
                <button key={r} onClick={() => setRating(r)}>
                    <Star size={32} className={rating >= r ? "fill-yellow-500 text-yellow-500" : "text-slate-300"} />
                </button>
            ))}
        </div>

        <div className="space-y-1">
            <label className="text-xs text-slate-500 font-bold">Отклонение от прогноза (мин)</label>
            <input type="number" className="w-full p-2 bg-slate-100 rounded-lg text-sm" value={discrepancy} onChange={e => setDiscrepancy(parseInt(e.target.value) || 0)} />
        </div>

        <button onClick={handleSubmit} disabled={submitting || rating === 0} className="w-full py-2 bg-blue-600 text-white rounded-lg font-bold">
            {submitting ? "Отправка..." : "Отправить"}
        </button>
      </div>
    </div>
  );
}
