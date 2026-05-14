import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  Loader2, Youtube, Sparkles, AlertCircle, Copy, CheckCircle,
  Trash2, Search, Zap, Save, MessageSquare, X, Plus, Pencil,
  Calendar, FileText, Tag, Users, BarChart2, ExternalLink,
  Download, Clock, BookOpen, GitCompare, Quote, AlignLeft,
  User
} from 'lucide-react';
import Markdown from 'react-markdown';

import type { Video, VideoMeta, SpeakerProfile, ChatMessage } from './lib/types';
import {
  getYoutubeId, wordCount, readTime, defaultMeta,
  migrateLegacyProfiles, profileToPromptString, CONFIDENCE_STYLES,
  mergeProfile, exportProfilesToJSON, importProfilesFromJSON
} from './lib/utils';
import QuickDatePicker from './components/QuickDatePicker';
import SpeakerCard from './components/SpeakerCard';
import ChatPanel from './components/ChatPanel';
import TimelineView from './components/TimelineView';
import CrossSearch from './components/CrossSearch';
import ContradictionDetector from './components/ContradictionDetector';
import QuoteExtractor from './components/QuoteExtractor';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── Highlight helpers ────────────────────────────────────────────────────────
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query.trim() || !text) return text;
  const parts = String(text).split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-300 text-yellow-900 font-medium rounded-sm px-0.5">{p}</mark>
      : p
  );
};

const highlightChildren = (children: React.ReactNode, query: string): React.ReactNode => {
  if (!query.trim()) return children;
  return React.Children.map(children, child => {
    if (typeof child === 'string') return highlightText(child, query);
    if (React.isValidElement(child)) {
      const el = child as React.ReactElement<{ children?: React.ReactNode }>;
      return React.cloneElement(el, el.props, highlightChildren(el.props.children, query));
    }
    return child;
  });
};

// ─── Tab config ───────────────────────────────────────────────────────────────
type Tab = 'research' | 'timeline' | 'search' | 'contradictions' | 'quotes';

const TABS: { id: Tab; label: string; icon: React.ElementType; requiresVideos?: boolean }[] = [
  { id: 'research',       label: 'Research',       icon: AlignLeft },
  { id: 'timeline',       label: 'Timeline',        icon: Clock,        requiresVideos: true },
  { id: 'search',         label: 'Cross-Search',    icon: Search,       requiresVideos: true },
  { id: 'contradictions', label: 'Contradictions',  icon: GitCompare,   requiresVideos: true },
  { id: 'quotes',         label: 'Quotes',          icon: Quote,        requiresVideos: true },
];

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [urlsInput, setUrlsInput]   = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [videos, setVideos]         = useState<Video[]>([]);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [metaFields, setMetaFields] = useState<Record<string, VideoMeta>>({});
  const [generatingBreakdown, setGeneratingBreakdown] = useState(false);
  const [bookBreakdowns, setBookBreakdowns] = useState<Record<string, string>>({});
  const [polishError, setPolishError] = useState('');
  const [copied, setCopied]         = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerProfiles, setSpeakerProfiles] = useState<Record<string, SpeakerProfile>>({});
  const [chatOpen, setChatOpen]     = useState(false);
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [newSpeakerDesc, setNewSpeakerDesc] = useState('');
  const [activeTab, setActiveTab]   = useState<Tab>('research');

  // ── Load from localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const sv = localStorage.getItem('ytAnalyzer_videos');
      const sb = localStorage.getItem('ytAnalyzer_breakdowns');
      const sm = localStorage.getItem('ytAnalyzer_meta');
      const ss = localStorage.getItem('ytAnalyzer_speakers');
      if (sv) setVideos(JSON.parse(sv));
      if (sb) setBookBreakdowns(JSON.parse(sb));
      if (sm) setMetaFields(JSON.parse(sm));
      if (ss) setSpeakerProfiles(migrateLegacyProfiles(JSON.parse(ss)));
    } catch (e) { console.error('localStorage load', e); }
  }, []);

  useEffect(() => { if (videos.length) localStorage.setItem('ytAnalyzer_videos', JSON.stringify(videos)); }, [videos]);
  useEffect(() => { if (Object.keys(bookBreakdowns).length) localStorage.setItem('ytAnalyzer_breakdowns', JSON.stringify(bookBreakdowns)); }, [bookBreakdowns]);
  useEffect(() => { if (Object.keys(metaFields).length) localStorage.setItem('ytAnalyzer_meta', JSON.stringify(metaFields)); }, [metaFields]);
  useEffect(() => { localStorage.setItem('ytAnalyzer_speakers', JSON.stringify(speakerProfiles)); }, [speakerProfiles]);

  const clearAllData = () => {
    if (!confirm('Clear all saved videos, notes, and speaker profiles?')) return;
    ['ytAnalyzer_videos','ytAnalyzer_breakdowns','ytAnalyzer_meta','ytAnalyzer_speakers']
      .forEach(k => localStorage.removeItem(k));
    setVideos([]); setBookBreakdowns({}); setMetaFields({}); setSpeakerProfiles({});
    setActiveVideoIndex(0); setUrlsInput(''); setChatOpen(false); setActiveTab('research');
  };

  // ── Fetch videos ───────────────────────────────────────────────────────────
  const fetchVideoInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const urls = urlsInput.split(/[\s,]+/).filter(u => u.trim());
    if (!urls.length) return;
    setLoading(true); setError(''); setActiveVideoIndex(0); setPolishError('');
    try {
      const res = await fetch('/api/analyze-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      const successful: Video[] = data.results.filter((r: any) => r.success);
      // Merge with existing, dedup by URL
      setVideos(prev => {
        const existing = new Map(prev.map(v => [v.url, v]));
        successful.forEach(v => existing.set(v.url, v));
        return Array.from(existing.values());
      });
      if (data.results.some((r: any) => !r.success)) {
        setError(`${data.results.filter((r:any)=>!r.success).length} video(s) failed to load.`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeVideo   = videos[activeVideoIndex] || null;
  const currentBreakdown = activeVideo ? bookBreakdowns[activeVideo.url] || '' : '';
  const activeVideoId = activeVideo ? getYoutubeId(activeVideo.url) : null;
  const activeMeta    = activeVideo ? metaFields[activeVideo.url] || defaultMeta() : defaultMeta();

  const updateMeta = (field: keyof VideoMeta, val: string) => {
    if (!activeVideo) return;
    setMetaFields(prev => ({ ...prev, [activeVideo.url]: { ...(prev[activeVideo.url] || defaultMeta()), [field]: val } }));
  };

  // ── Generate breakdown ─────────────────────────────────────────────────────
  const generateBreakdown = async () => {
    if (!activeVideo?.transcript) return;
    setGeneratingBreakdown(true); setPolishError('');
    try {
      const today = new Date().toISOString().split('T')[0];
      const knownSpeakersText = Object.keys(speakerProfiles).length
        ? Object.entries(speakerProfiles).map(([n, p]) => profileToPromptString(n, p)).join('\n')
        : 'None yet.';

      const prompt = `You are an expert forensic transcript analyst and diarizer helping a book author reconstruct events from years ago.

=== VIDEO CONTEXT ===
Title: ${activeVideo.title}
Date of Event: ${activeMeta.date || 'Unknown'}
Participants hint: ${activeMeta.participants || 'None'}
Tags: ${activeMeta.tags || 'None'}
Chapter/Theme: ${activeMeta.chapter || 'None'}
URL: ${activeVideo.url}

=== KNOWN SPEAKER DATABASE ===
${knownSpeakersText}

=== SPEAKER IDENTIFICATION RULES ===
CRITICAL: You have a Known Speaker Database above. USE IT AGGRESSIVELY.

STEP 1 — PRE-MATCH FIRST: Before reading the transcript, list every known speaker who is LIKELY in this video based on: title keywords, date, participant hints, topics they're known to discuss, their roles. Be liberal — if there's any chance they appear, list them.

STEP 2 — ANCHOR then DIARIZE: Find the first clear name mention or role reference for each speaker. Use that as your anchor. Then attribute all surrounding speech to the same speaker unless there's an explicit handoff. Never reset to "Unknown" mid-paragraph.

STEP 3 — ALIAS MATCHING: If the transcript says "John", "Mr. Smith", "the congressman", "the host" — cross-reference these against ALL known aliases, roles, and topic expertise. A known speaker with 3+ appearances should almost always be identified.

STEP 4 — ONLY TRUE UNKNOWNS: Only create a new "Unknown [descriptor]" speaker if they genuinely don't match any known profile. Assign a rich descriptor ("Unknown Female Journalist", "Unidentified Caller") and note distinguishing speech patterns.

STEP 5 — CONFIDENCE: 
  - "verified" = explicitly named + matches known profile
  - "confirmed" = strongly matches patterns/role/context 
  - "learning" = plausible match but uncertain

=== OUTPUT FORMAT (Markdown) ===

## Speaker Identification
For each speaker: who they are, HOW you identified them (exact quote or reasoning), confidence level.

## Summary
Concise summary.

## Key Themes & Entities
Bullet points: topics, people mentioned, locations, facts, key dates.

## Speaker Breakdown
Per speaker: what they said, their position/contribution.

## Diarized & Polished Transcript
Full cleaned transcript. Every paragraph: **Speaker Name (verified/confirmed/inferred):** 
Fix transcription errors. Preserve meaning. Never leave a paragraph without a speaker label.

=== AFTER MARKDOWN — OUTPUT JSON ===
\`\`\`json
{
  "profiles": [
    {
      "fullName": "string — use the CANONICAL name from Known Speaker Database if matched, else a descriptive name",
      "aliases": ["any name variants seen in THIS transcript"],
      "role": "string",
      "topics": ["specific topics discussed in this transcript"],
      "speechPatterns": "distinctive vocabulary, phrases, cadence observed in this transcript",
      "confidence": "learning|confirmed|verified",
      "notes": "how you identified them in this specific video"
    }
  ]
}
\`\`\`
IMPORTANT: Include ALL speakers. If you matched to a known profile, use that profile's exact fullName. Do NOT create a new entry for someone already in the database.

=== TRANSCRIPT ===
${activeVideo.transcript}`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      if (!response.text) throw new Error('No response from Gemini.');

      let textResult = response.text;
      const jsonMatch = textResult.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch?.[1]) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          const profilesArray: any[] = parsed.profiles || (Array.isArray(parsed) ? parsed : []);
          setSpeakerProfiles(prev => {
            let updated = { ...prev };
            for (const p of profilesArray) {
              // Uses fuzzy matching + auto-confidence progression
              updated = mergeProfile(updated, p, today);
            }
            return updated;
          });
          textResult = textResult.replace(/```json\n[\s\S]*?\n```/, '').trim();
        } catch (e) { console.error('Speaker profile parse error', e); }
      }

      const meta = activeMeta;
      const header = [
        `**URL:** ${activeVideo.url}`,
        `**Date:** ${meta.date || 'Not specified'}`,
        `**Participants:** ${meta.participants || 'Not specified'}`,
        meta.chapter ? `**Chapter:** ${meta.chapter}` : null,
        meta.tags ? `**Tags:** ${meta.tags}` : null,
      ].filter(Boolean).join('\n');

      setBookBreakdowns(prev => ({ ...prev, [activeVideo.url]: `${header}\n\n---\n\n${textResult}` }));
    } catch (err: any) {
      setPolishError(err.message || 'Error generating breakdown');
    } finally {
      setGeneratingBreakdown(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentBreakdown);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const exportAllData = () => {
    if (!videos.length) return;
    let out = `# Book Research Export\n\nGenerated: ${new Date().toLocaleDateString()}\n\n---\n\n`;
    videos.forEach(v => {
      const m = metaFields[v.url] || defaultMeta();
      out += `## ${v.title || v.url}\n- **URL:** ${v.url}\n- **Date:** ${m.date||'N/A'}\n- **Participants:** ${m.participants||'N/A'}\n`;
      if (m.chapter) out += `- **Chapter:** ${m.chapter}\n`;
      if (m.tags) out += `- **Tags:** ${m.tags}\n`;
      out += `\n### Notes\n\n${bookBreakdowns[v.url] || '*No notes yet.*'}\n\n---\n\n`;
    });
    if (Object.keys(speakerProfiles).length) {
      out += `## Speaker Registry\n\n`;
      Object.entries(speakerProfiles).forEach(([n, p]) => {
        out += `### ${n}\n`;
        out += `- **Role:** ${p.role||'Unknown'} | **Confidence:** ${p.confidence} | **Appearances:** ${p.appearances}\n`;
        if (p.aliases?.length) out += `- **Aliases:** ${p.aliases.join(', ')}\n`;
        if (p.topics?.length) out += `- **Topics:** ${p.topics.join(', ')}\n`;
        if (p.speechPatterns) out += `- **Speech patterns:** ${p.speechPatterns}\n`;
        if (p.notes) out += `- **Notes:** ${p.notes}\n`;
        out += `\n`;
      });
    }
    const blob = new Blob([out], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `research-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ── Speaker CRUD ───────────────────────────────────────────────────────────
  const addSpeaker = () => {
    if (!newSpeakerName.trim()) return;
    const today = new Date().toISOString().split('T')[0];
    const name = newSpeakerName.trim();
    setSpeakerProfiles(prev => ({
      ...prev,
      [name]: { fullName: name, aliases: [], role: '', topics: [], speechPatterns: newSpeakerDesc.trim(),
        firstSeen: today, lastSeen: today, appearances: 0, confidence: 'learning', notes: newSpeakerDesc.trim() }
    }));
    setNewSpeakerName(''); setNewSpeakerDesc(''); setAddingSpeaker(false);
  };

  const updateSpeaker = (oldName: string, newName: string, updated: Partial<SpeakerProfile>) => {
    setSpeakerProfiles(prev => {
      const u = { ...prev };
      const ex = u[oldName] || {} as SpeakerProfile;
      if (oldName !== newName) delete u[oldName];
      const merged = { ...ex, ...updated, fullName: newName };
      // Auto-compute confidence from appearances unless user manually set to verified
      if (merged.confidence !== 'verified') {
        const apps = merged.appearances || 1;
        merged.confidence = apps >= 10 ? 'verified' : apps >= 3 ? 'confirmed' : 'learning';
      }
      u[newName] = merged;
      return u;
    });
  };

  const deleteSpeaker = (name: string) => {
    setSpeakerProfiles(prev => { const u = { ...prev }; delete u[name]; return u; });
  };

  const txWords = activeVideo ? wordCount(activeVideo.transcript) : 0;
  const txTime  = activeVideo ? readTime(activeVideo.transcript) : 0;

  // ── Sidebar: shared for research tab ──────────────────────────────────────
  const Sidebar = (
    <aside className="w-72 xl:w-80 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0 hidden md:flex">
      {/* Video list */}
      {videos.length > 1 && (
        <div className="p-3 border-b border-slate-100 bg-slate-50">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{videos.length} Videos</p>
          <div className="space-y-1 max-h-36 overflow-y-auto">
            {videos.map((v, i) => (
              <button key={i} onClick={() => { setActiveVideoIndex(i); setActiveTab('research'); }}
                className={`text-left w-full px-2.5 py-1.5 rounded-lg text-xs font-medium truncate transition-colors ${i === activeVideoIndex ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 text-slate-600'}`}>
                {v.title || v.url}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-y-auto flex-1 p-4 space-y-5">
        {/* Thumbnail */}
        <div>
          {activeVideoId && (
            <div className="w-full aspect-video bg-slate-900 rounded-xl overflow-hidden mb-3 shadow-sm border border-slate-200">
              <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideoId}`}
                title="YouTube video" frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen />
            </div>
          )}
          {activeVideo && (
            <>
              <h1 className="text-sm font-bold leading-snug mb-1">{activeVideo.title}</h1>
              <a href={activeVideo.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 truncate">
                <ExternalLink className="w-3 h-3 shrink-0" />{activeVideo.url}
              </a>
            </>
          )}
        </div>

        {/* Stats */}
        {txWords > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
              <p className="text-base font-extrabold text-slate-800">{txWords.toLocaleString()}</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Words</p>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
              <p className="text-base font-extrabold text-slate-800">{txTime} min</p>
              <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Read Time</p>
            </div>
          </div>
        )}

        {/* Description */}
        {activeVideo?.description && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Description</p>
            <p className="text-xs text-slate-500 leading-relaxed line-clamp-4">{activeVideo.description}</p>
          </div>
        )}

        {/* Metadata */}
        <div className="space-y-3 pt-4 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
            <BarChart2 className="w-3 h-3" /> Research Metadata
          </p>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Event Date</label>
            <QuickDatePicker value={activeMeta.date} onChange={v => updateMeta('date', v)} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> Participants</label>
            <textarea value={activeMeta.participants} onChange={e => updateMeta('participants', e.target.value)}
              placeholder="Who is in this video?" rows={2}
              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-300" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><BookOpen className="w-3 h-3" /> Chapter / Theme</label>
            <input type="text" value={activeMeta.chapter} onChange={e => updateMeta('chapter', e.target.value)}
              placeholder="e.g. Chapter 3 - The Cover-Up"
              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</label>
            <input type="text" value={activeMeta.tags} onChange={e => updateMeta('tags', e.target.value)}
              placeholder="e.g. interview, 2020, court"
              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><FileText className="w-3 h-3" /> Your Notes</label>
            <textarea value={activeMeta.notes} onChange={e => updateMeta('notes', e.target.value)}
              placeholder="Your own annotations, questions, reminders..." rows={3}
              className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none placeholder:text-slate-300" />
          </div>
        </div>

        {/* Speaker profiles */}
        <div className="pt-4 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <User className="w-3 h-3" /> Learned Voices
              {Object.keys(speakerProfiles).length > 0 && (
                <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded text-[9px]">
                  {Object.keys(speakerProfiles).length}
                </span>
              )}
            </p>
            <div className="flex items-center gap-0.5">
              {Object.keys(speakerProfiles).length > 0 && (
                <button onClick={() => exportProfilesToJSON(speakerProfiles)}
                  className="p-1 hover:bg-emerald-50 rounded-lg text-slate-400 hover:text-emerald-600 transition-colors" title="Export profiles as JSON backup">
                  <Download className="w-3 h-3" />
                </button>
              )}
              <label className="p-1 hover:bg-violet-50 rounded-lg text-slate-400 hover:text-violet-600 transition-colors cursor-pointer" title="Import profiles from JSON">
                <AlignLeft className="w-3 h-3" />
                <input type="file" accept=".json" className="hidden" onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  importProfilesFromJSON(file,
                    imported => setSpeakerProfiles(prev => ({ ...prev, ...imported })),
                    msg => alert(msg)
                  );
                  e.target.value = '';
                }} />
              </label>
              <button onClick={() => setAddingSpeaker(a => !a)}
                className="p-1 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors" title="Add speaker manually">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {addingSpeaker && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 space-y-2">
              <input value={newSpeakerName} onChange={e => setNewSpeakerName(e.target.value)}
                placeholder="Speaker name"
                className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 bg-white" />
              <textarea value={newSpeakerDesc} onChange={e => setNewSpeakerDesc(e.target.value)}
                placeholder="Role, speech patterns, topics..." rows={2}
                className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none resize-none focus:ring-2 focus:ring-blue-400 bg-white" />
              <div className="flex gap-1.5">
                <button onClick={addSpeaker} className="flex-1 text-[11px] font-bold bg-blue-600 text-white py-1 rounded-lg hover:bg-blue-700">Add</button>
                <button onClick={() => setAddingSpeaker(false)} className="px-2 text-[11px] bg-white text-slate-600 rounded-lg border border-slate-200">Cancel</button>
              </div>
            </div>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
            {Object.keys(speakerProfiles).length === 0 && !addingSpeaker && (
              <p className="text-[11px] text-slate-400 italic text-center py-3">No voices learned yet.</p>
            )}
            {Object.entries(speakerProfiles).map(([name, profile]) => (
              <SpeakerCard key={name} name={name} profile={profile}
                onUpdate={(n, u) => updateSpeaker(name, n, u)}
                onDelete={() => deleteSpeaker(name)} />
            ))}
          </div>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <Youtube className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-base tracking-tight hidden md:inline">
            Transcriber<span className="text-blue-600">AI</span>
          </span>
        </div>

        <form onSubmit={fetchVideoInfo} className="flex-1 flex items-center gap-2 max-w-3xl">
          <div className="relative flex-1">
            <Youtube className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={urlsInput} onChange={e => setUrlsInput(e.target.value)}
              placeholder="Paste YouTube URL(s) — space or comma separated..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all" />
          </div>
          <button type="submit" disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap">
            {loading ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            {loading ? 'Analyzing...' : 'Analyze'}
          </button>
        </form>

        <div className="flex items-center gap-2 ml-auto shrink-0">
          {videos.length > 0 && (
            <>
              <button onClick={exportAllData} className="hidden sm:flex items-center gap-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              <button onClick={clearAllData} className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </>
          )}
          <button onClick={() => setChatOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${chatOpen ? 'bg-blue-600 text-white' : 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700'}`}>
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Chat</span>
          </button>
        </div>
      </header>

      {/* ── Tab Bar ────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-200 px-6 flex items-center gap-1 shrink-0">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const disabled = tab.requiresVideos && videos.length === 0;
          return (
            <button key={tab.id}
              onClick={() => !disabled && setActiveTab(tab.id)}
              disabled={disabled}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : disabled
                    ? 'border-transparent text-slate-300 cursor-not-allowed'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
        {videos.length > 0 && (
          <span className="ml-auto text-[10px] text-slate-400 font-medium pb-1">
            {videos.length} video{videos.length !== 1 ? 's' : ''} · {Object.keys(speakerProfiles).length} speaker{Object.keys(speakerProfiles).length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex overflow-hidden">

          {/* ── RESEARCH TAB ─────────────────────────────────────── */}
          {activeTab === 'research' && (
            <>
              {error && videos.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="bg-red-50 text-red-800 p-4 rounded-xl flex items-start gap-3 border border-red-200 max-w-lg shadow-sm">
                    <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                    <p className="text-sm font-medium">{error}</p>
                  </div>
                </div>
              ) : videos.length > 0 ? (
                <>
                  {Sidebar}
                  <section className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                    {/* Toolbar */}
                    <div className="px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
                      {error && (
                        <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                          <AlertCircle className="w-3.5 h-3.5" />{error}
                        </div>
                      )}
                      <div className="relative flex-1 max-w-xs">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Search transcript & notes..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {currentBreakdown && (
                          <button onClick={() => setBookBreakdowns(prev => { const u = {...prev}; if (activeVideo) delete u[activeVideo.url]; return u; })}
                            className="text-xs text-slate-400 hover:text-red-600 px-2 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                            Regenerate
                          </button>
                        )}
                        <button onClick={generateBreakdown}
                          disabled={generatingBreakdown || !!currentBreakdown}
                          className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm">
                          {generatingBreakdown ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {generatingBreakdown ? 'Generating...' : currentBreakdown ? '✓ Notes Ready' : 'Generate Notes'}
                        </button>
                      </div>
                    </div>

                    {polishError && (
                      <div className="mx-4 mt-3 bg-red-50 text-red-800 p-3 rounded-xl text-xs border border-red-200 flex items-start gap-2 shrink-0">
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{polishError}</span>
                      </div>
                    )}

                    {/* Panels */}
                    <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
                      {/* Transcript */}
                      <div className={`flex-1 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm ${currentBreakdown ? 'hidden lg:flex' : ''}`}>
                        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                          <div className="flex items-center gap-2">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Source Transcript</span>
                          </div>
                          {txWords > 0 && <span className="text-[10px] text-slate-400">{txWords.toLocaleString()} words · ~{txTime} min</span>}
                        </div>
                        <div className="flex-1 overflow-y-auto p-5">
                          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {highlightText(activeVideo?.transcript || 'No transcript available.', searchQuery)}
                          </p>
                        </div>
                      </div>

                      {/* Notes */}
                      {currentBreakdown && (
                        <div className="flex-1 bg-white border border-blue-100 rounded-2xl flex flex-col overflow-hidden shadow-[0_4px_24px_rgba(37,99,235,0.08)]">
                          <div className="px-5 py-3 border-b border-blue-100 flex items-center justify-between shrink-0 bg-gradient-to-r from-blue-50 to-indigo-50">
                            <div className="flex items-center gap-2">
                              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                              <span className="text-xs font-bold uppercase tracking-wider text-blue-700">Book Notes & Analysis</span>
                            </div>
                            <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-white border border-slate-200 hover:border-blue-300 px-2.5 py-1 rounded-lg transition-all shadow-sm">
                              {copied ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                              {copied ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-5">
                            <div className="prose prose-sm max-w-none prose-headings:text-slate-800 prose-headings:font-bold prose-a:text-blue-600 prose-strong:text-slate-800">
                              <Markdown components={{
                                p: ({node,...props}) => <p>{highlightChildren(props.children, searchQuery)}</p>,
                                li: ({node,...props}) => <li>{highlightChildren(props.children, searchQuery)}</li>,
                                h1: ({node,...props}) => <h1>{highlightChildren(props.children, searchQuery)}</h1>,
                                h2: ({node,...props}) => <h2>{highlightChildren(props.children, searchQuery)}</h2>,
                                h3: ({node,...props}) => <h3>{highlightChildren(props.children, searchQuery)}</h3>,
                                strong: ({node,...props}) => <strong>{highlightChildren(props.children, searchQuery)}</strong>,
                              }}>
                                {currentBreakdown}
                              </Markdown>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              ) : (
                // ── Landing ────────────────────────────────────────
                <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-blue-50/30">
                  <div className="max-w-5xl mx-auto px-6 py-14 flex flex-col items-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs mb-7 border border-blue-200 uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5" /> Book Research Assistant
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight text-center mb-5 leading-tight">
                      Reconstruct Events.<br />
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Write the Book.</span>
                    </h1>
                    <p className="text-lg text-slate-500 text-center max-w-2xl mb-12 leading-relaxed">
                      Analyze YouTube videos from years ago — extract transcripts, identify speakers, find contradictions, pull quotes, and build a chronological timeline. Everything you need for investigative non-fiction.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 w-full max-w-4xl">
                      {[
                        { icon: AlignLeft, color: 'blue', title: 'Research & Transcripts', desc: 'Extract full transcripts and let Gemini generate structured research notes with speaker diarization.' },
                        { icon: Clock, color: 'indigo', title: 'Event Timeline', desc: 'Automatically sort all videos by event date into a visual chronological timeline.' },
                        { icon: Search, color: 'violet', title: 'Cross-Video Search', desc: 'Search any name, place, or phrase across all transcripts and notes at once.' },
                        { icon: GitCompare, color: 'amber', title: 'Contradiction Detector', desc: 'Compare two videos and let AI flag where accounts diverge or contradict.' },
                        { icon: Quote, color: 'emerald', title: 'Quote Extractor', desc: 'Pull citation-ready quotes by speaker or topic across any or all videos.' },
                        { icon: Users, color: 'rose', title: 'Speaker Learning', desc: 'AI builds speaker profiles across transcripts — the more you process, the smarter it gets.' },
                      ].map(({ icon: Icon, color, title, desc }) => (
                        <div key={title} className={`bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow group`}>
                          <div className={`w-10 h-10 bg-${color}-50 rounded-xl flex items-center justify-center shrink-0 border border-${color}-100 group-hover:scale-105 transition-transform`}>
                            <Icon className={`w-5 h-5 text-${color}-600`} />
                          </div>
                          <div>
                            <h3 className="font-bold text-slate-900 text-sm mb-1">{title}</h3>
                            <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── TIMELINE TAB ─────────────────────────────────────── */}
          {activeTab === 'timeline' && (
            <TimelineView videos={videos} metaFields={metaFields} bookBreakdowns={bookBreakdowns}
              onSelectVideo={i => { setActiveVideoIndex(i); setActiveTab('research'); }} />
          )}

          {/* ── CROSS-SEARCH TAB ─────────────────────────────────── */}
          {activeTab === 'search' && (
            <CrossSearch videos={videos} metaFields={metaFields} bookBreakdowns={bookBreakdowns}
              onSelectVideo={i => { setActiveVideoIndex(i); setActiveTab('research'); }} />
          )}

          {/* ── CONTRADICTIONS TAB ───────────────────────────────── */}
          {activeTab === 'contradictions' && (
            <ContradictionDetector videos={videos} metaFields={metaFields} bookBreakdowns={bookBreakdowns} />
          )}

          {/* ── QUOTES TAB ───────────────────────────────────────── */}
          {activeTab === 'quotes' && (
            <QuoteExtractor videos={videos} metaFields={metaFields} speakerProfiles={speakerProfiles} />
          )}

        </div>

        {/* ── Chat Panel ──────────────────────────────────────────── */}
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)}
          activeVideo={activeVideo} currentBreakdown={currentBreakdown}
          speakerProfiles={speakerProfiles} />
      </div>
    </div>
  );
}
