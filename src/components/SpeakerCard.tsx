import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import type { SpeakerProfile } from '../lib/types';
import { CONFIDENCE_STYLES } from '../lib/utils';

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'
];

export default function SpeakerCard({
  name, profile, onUpdate, onDelete
}: {
  name: string;
  profile: SpeakerProfile;
  onUpdate: (newName: string, updated: Partial<SpeakerProfile>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(name);
  const [eRole, setERole] = useState(profile.role || '');
  const [ePatterns, setEPatterns] = useState(profile.speechPatterns || '');
  const [eAliases, setEAliases] = useState((profile.aliases || []).join(', '));
  const [eTopics, setETopics] = useState((profile.topics || []).join(', '));
  const [eNotes, setENotes] = useState(profile.notes || '');
  const [eConf, setEConf] = useState<SpeakerProfile['confidence']>(profile.confidence || 'learning');

  const color = AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const save = () => {
    onUpdate(eName, {
      fullName: eName, role: eRole, speechPatterns: ePatterns, notes: eNotes,
      aliases: eAliases.split(',').map(s => s.trim()).filter(Boolean),
      topics: eTopics.split(',').map(s => s.trim()).filter(Boolean),
      confidence: eConf,
    });
    setEditing(false);
  };

  if (editing) return (
    <div className="bg-white border border-blue-200 p-3 rounded-xl shadow-sm space-y-2">
      <input value={eName} onChange={e => setEName(e.target.value)} className="w-full text-xs font-bold p-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400" placeholder="Full name" />
      <input value={eRole} onChange={e => setERole(e.target.value)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none" placeholder="Role (lawyer, journalist, witness...)" />
      <input value={eAliases} onChange={e => setEAliases(e.target.value)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none" placeholder="Aliases, comma-separated" />
      <input value={eTopics} onChange={e => setETopics(e.target.value)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none" placeholder="Topics, comma-separated" />
      <textarea value={ePatterns} onChange={e => setEPatterns(e.target.value)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none resize-none" rows={2} placeholder="Speech patterns, vocabulary, cadence..." />
      <textarea value={eNotes} onChange={e => setENotes(e.target.value)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none resize-none" rows={2} placeholder="Extra identification notes..." />
      <select value={eConf} onChange={e => setEConf(e.target.value as any)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg bg-white outline-none">
        <option value="learning">Learning</option>
        <option value="confirmed">Confirmed</option>
        <option value="verified">Verified</option>
      </select>
      <div className="flex gap-1.5">
        <button onClick={save} className="flex-1 text-[11px] font-bold bg-blue-600 text-white py-1 rounded-lg hover:bg-blue-700">Save</button>
        <button onClick={() => setEditing(false)} className="px-2 text-[11px] bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200">Cancel</button>
      </div>
    </div>
  );

  return (
    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl group hover:border-blue-200 hover:bg-blue-50/20 transition-all">
      <div className="flex items-start gap-2.5">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-extrabold ${color}`}>{initials}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-xs font-bold text-slate-800">{name}</p>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${CONFIDENCE_STYLES[profile.confidence || 'learning']}`}>
              {profile.confidence || 'learning'}
            </span>
            {(profile.appearances || 0) > 0 && (
              <span className="text-[9px] text-slate-400 font-medium">{profile.appearances}× seen</span>
            )}
          </div>
          {profile.role && <p className="text-[10px] text-slate-500 mt-0.5">{profile.role}</p>}
          {profile.topics?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {profile.topics.slice(0, 3).map(t => (
                <span key={t} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200">{t}</span>
              ))}
            </div>
          )}
          {profile.speechPatterns && (
            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 italic">"{profile.speechPatterns}"</p>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={() => setEditing(true)} className="p-1 hover:bg-blue-100 rounded text-slate-400 hover:text-blue-600"><Pencil className="w-3 h-3" /></button>
          <button onClick={onDelete} className="p-1 hover:bg-red-100 rounded text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
        </div>
      </div>
    </div>
  );
}
