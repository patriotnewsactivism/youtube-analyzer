import React, { useState, useRef, useEffect } from 'react';
import { Calendar } from 'lucide-react';
import { quickDates } from '../lib/utils';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function QuickDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [customYear, setCustomYear] = useState('');
  const [customMonth, setCustomMonth] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const applyCustom = () => {
    const parts = [customMonth, customYear].filter(Boolean);
    if (parts.length) { onChange(parts.join(' ')); setOpen(false); }
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-1.5">
        <input
          type="text" value={value} onChange={e => onChange(e.target.value)}
          placeholder="e.g. Fall 2023, March 15 2022"
          className="flex-1 text-sm p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300"
        />
        <button type="button" onClick={() => setOpen(o => !o)}
          className="px-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors">
          <Calendar className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {quickDates.map(qd => (
              <button key={qd.label} type="button"
                onClick={() => { onChange(qd.value()); setOpen(false); }}
                className="text-xs font-medium text-left px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-100 transition-colors">
                {qd.label}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Custom</p>
            <div className="flex gap-1.5">
              <select value={customMonth} onChange={e => setCustomMonth(e.target.value)}
                className="flex-1 text-xs p-1.5 border border-slate-200 rounded-lg bg-white outline-none">
                <option value="">Month</option>
                {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input type="number" value={customYear} onChange={e => setCustomYear(e.target.value)}
                placeholder="Year" className="w-20 text-xs p-1.5 border border-slate-200 rounded-lg outline-none" />
              <button type="button" onClick={applyCustom}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 font-semibold">Set</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
