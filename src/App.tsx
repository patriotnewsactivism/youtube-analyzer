import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import {
  Loader2, Youtube, Sparkles, AlertCircle, Copy, CheckCircle,
  Trash2, Search, Zap, Layers, BookOpen, Save, MessageSquare,
  X, Send, User, Bot, ChevronDown, Plus, Pencil, Calendar,
  FileText, Tag, Users, Clock, BarChart2, ExternalLink, Download
} from 'lucide-react';
import Markdown from 'react-markdown';

const getYoutubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Quick date helpers
const quickDates = [
  { label: 'Today', value: () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
  { label: 'Yesterday', value: () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } },
  { label: 'This Week', value: () => { const d = new Date(); return `Week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`; } },
  { label: 'Last Week', value: () => { const d = new Date(); d.setDate(d.getDate()-7); return `Week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`; } },
  { label: 'This Month', value: () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
  { label: 'Last Month', value: () => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } },
];

// Word count utility
const wordCount = (text: string) => text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
const readTime = (text: string) => Math.max(1, Math.ceil(wordCount(text) / 200));

// Highlighting Helpers
const highlightText = (text: string, query: string): React.ReactNode => {
  if (!query.trim() || !text) return text;
  const parts = String(text).split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <span key={i} className="bg-yellow-300 text-yellow-900 font-medium rounded-sm px-0.5">{p}</span>
      : p
  );
};

const highlightChildren = (children: React.ReactNode, query: string): React.ReactNode => {
  if (!query.trim()) return children;
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') return highlightText(child, query);
    if (React.isValidElement(child)) {
      return React.cloneElement(
        child as React.ReactElement,
        (child as React.ReactElement).props,
        highlightChildren((child as React.ReactElement).props.children, query)
      );
    }
    return child;
  });
};

// ─── Chat Types ───────────────────────────────────────────────────────────────
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// ─── Quick Date Picker ────────────────────────────────────────────────────────
function QuickDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [customYear, setCustomYear] = useState('');
  const [customMonth, setCustomMonth] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyCustom = () => {
    const parts = [customMonth, customYear].filter(Boolean);
    if (parts.length) { onChange(parts.join(' ')); setOpen(false); }
  };

  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  return (
    <div className="relative" ref={ref}>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. Fall 2023, March 15 2022"
          className="flex-1 text-sm p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300 transition-shadow"
        />
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="px-2 py-2 bg-blue-50 border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-100 transition-colors"
          title="Quick date picker"
        >
          <Calendar className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl p-3 space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {quickDates.map(qd => (
              <button
                key={qd.label}
                type="button"
                onClick={() => { onChange(qd.value()); setOpen(false); }}
                className="text-xs font-medium text-left px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-100 transition-colors"
              >
                {qd.label}
              </button>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Custom</p>
            <div className="flex gap-1.5">
              <select
                value={customMonth}
                onChange={e => setCustomMonth(e.target.value)}
                className="flex-1 text-xs p-1.5 border border-slate-200 rounded-lg bg-white outline-none"
              >
                <option value="">Month</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <input
                type="number"
                value={customYear}
                onChange={e => setCustomYear(e.target.value)}
                placeholder="Year"
                className="w-20 text-xs p-1.5 border border-slate-200 rounded-lg outline-none"
              />
              <button
                type="button"
                onClick={applyCustom}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Set
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Speaker Profile Card ─────────────────────────────────────────────────────
function SpeakerCard({
  name, desc, onUpdate, onDelete
}: { name: string; desc: string; onUpdate: (n: string, d: string) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [eName, setEName] = useState(name);
  const [eDesc, setEDesc] = useState(desc);
  const colors = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-violet-100 text-violet-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700'];
  const color = colors[name.charCodeAt(0) % colors.length];
  const initials = name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();

  if (editing) {
    return (
      <div className="bg-white border border-blue-200 p-2.5 rounded-xl shadow-sm space-y-2">
        <input value={eName} onChange={e => setEName(e.target.value)} className="w-full text-xs font-bold p-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400" placeholder="Speaker name" />
        <textarea value={eDesc} onChange={e => setEDesc(e.target.value)} className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none resize-none focus:ring-2 focus:ring-blue-400" rows={3} placeholder="Description, role, speech patterns..." />
        <div className="flex gap-1.5">
          <button onClick={() => { onUpdate(eName, eDesc); setEditing(false); }} className="flex-1 text-[11px] font-bold bg-blue-600 text-white py-1 rounded-lg hover:bg-blue-700 transition-colors">Save</button>
          <button onClick={() => setEditing(false)} className="px-2 text-[11px] bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-start gap-2.5 group hover:border-blue-200 hover:bg-blue-50/30 transition-all">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-extrabold ${color}`}>{initials}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-800 truncate">{name}</p>
        <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">{desc}</p>
      </div>
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => setEditing(true)} className="p-1 hover:bg-blue-100 rounded transition-colors text-slate-400 hover:text-blue-600"><Pencil className="w-3 h-3" /></button>
        <button onClick={onDelete} className="p-1 hover:bg-red-100 rounded transition-colors text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
      </div>
    </div>
  );
}

// ─── AI Chat Panel ────────────────────────────────────────────────────────────
function ChatPanel({
  open, onClose, activeVideo, currentBreakdown, speakerProfiles
}: {
  open: boolean;
  onClose: () => void;
  activeVideo: any;
  currentBreakdown: string;
  speakerProfiles: Record<string, string>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: "Hi! I'm your research assistant. I have full context of the current video, transcript, and notes. Ask me anything — clarify errors, get a quote, expand on a topic, or add a speaker profile.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const systemContext = `You are an expert research assistant embedded in a YouTube transcript analysis tool. 
      
Current video context:
- Title: ${activeVideo?.title || 'No video loaded'}
- URL: ${activeVideo?.url || ''}
- Transcript (first 8000 chars): ${(activeVideo?.transcript || '').slice(0, 8000)}

Generated notes/breakdown:
${currentBreakdown ? currentBreakdown.slice(0, 4000) : 'No breakdown generated yet.'}

Known speaker profiles:
${JSON.stringify(speakerProfiles, null, 2)}

You can help the user:
- Understand or clarify parts of the transcript
- Fix errors or inconsistencies in the notes
- Answer questions about the content
- Identify speakers
- Extract specific quotes or facts
- Suggest edits to speaker profiles
Be concise, direct, and helpful. Format responses with markdown when useful.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${systemContext}\n\nUser question: ${userMsg.content}`,
      });

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response.text || 'No response.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message || 'Something went wrong.'}`,
        timestamp: new Date()
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  if (!open) return null;

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-xl z-10">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-blue-600 to-indigo-600">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Research Assistant</p>
            <p className="text-[10px] text-blue-100">Powered by Gemini</p>
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Context banner */}
      {activeVideo && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-[10px] text-blue-700 font-medium truncate">Context: {activeVideo.title}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-200'}`}>
              {msg.role === 'user' ? <User className="w-3 h-3 text-white" /> : <Bot className="w-3 h-3 text-slate-600" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
              {msg.role === 'assistant' ? (
                <div className="markdown-chat prose prose-sm max-w-none">
                  <Markdown>{msg.content}</Markdown>
                </div>
              ) : msg.content}
              <p className={`text-[9px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
              <Bot className="w-3 h-3 text-slate-600" />
            </div>
            <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-3 py-2.5">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the transcript, errors, speakers..."
            className="flex-1 text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 transition-all max-h-32 min-h-[40px]"
            rows={1}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [urlsInput, setUrlsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [videos, setVideos] = useState<any[]>([]);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [metaFields, setMetaFields] = useState<Record<string, { date: string; participants: string; tags: string }>>({});
  const [generatingBreakdown, setGeneratingBreakdown] = useState(false);
  const [bookBreakdowns, setBookBreakdowns] = useState<Record<string, string>>({});
  const [polishError, setPolishError] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [speakerProfiles, setSpeakerProfiles] = useState<Record<string, string>>({});
  const [chatOpen, setChatOpen] = useState(false);
  const [addingSpeaker, setAddingSpeaker] = useState(false);
  const [newSpeakerName, setNewSpeakerName] = useState('');
  const [newSpeakerDesc, setNewSpeakerDesc] = useState('');

  // Load from localStorage
  useEffect(() => {
    try {
      const sv = localStorage.getItem('ytAnalyzer_videos');
      const sb = localStorage.getItem('ytAnalyzer_breakdowns');
      const sm = localStorage.getItem('ytAnalyzer_meta');
      const ss = localStorage.getItem('ytAnalyzer_speakers');
      if (sv) setVideos(JSON.parse(sv));
      if (sb) setBookBreakdowns(JSON.parse(sb));
      if (sm) setMetaFields(JSON.parse(sm));
      if (ss) setSpeakerProfiles(JSON.parse(ss));
    } catch (e) { console.error('localStorage load error', e); }
  }, []);

  useEffect(() => { if (videos.length > 0) localStorage.setItem('ytAnalyzer_videos', JSON.stringify(videos)); }, [videos]);
  useEffect(() => { if (Object.keys(bookBreakdowns).length > 0) localStorage.setItem('ytAnalyzer_breakdowns', JSON.stringify(bookBreakdowns)); }, [bookBreakdowns]);
  useEffect(() => { if (Object.keys(metaFields).length > 0) localStorage.setItem('ytAnalyzer_meta', JSON.stringify(metaFields)); }, [metaFields]);
  useEffect(() => { localStorage.setItem('ytAnalyzer_speakers', JSON.stringify(speakerProfiles)); }, [speakerProfiles]);

  const clearAllData = () => {
    if (!confirm('Clear all saved videos, notes, and speaker profiles?')) return;
    ['ytAnalyzer_videos','ytAnalyzer_breakdowns','ytAnalyzer_meta','ytAnalyzer_speakers'].forEach(k => localStorage.removeItem(k));
    setVideos([]); setBookBreakdowns({}); setMetaFields({}); setSpeakerProfiles({});
    setActiveVideoIndex(0); setUrlsInput(''); setChatOpen(false);
  };

  const fetchVideoInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlsInput.trim()) return;
    const urls = urlsInput.split(/[\s,]+/).filter(u => u.trim() !== '');
    if (!urls.length) return;

    setLoading(true); setError(''); setVideos([]); setActiveVideoIndex(0); setPolishError('');
    try {
      const res = await fetch('/api/analyze-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch video information');
      const successful = data.results.filter((r: any) => r.success);
      setVideos(successful);
      if (data.results.some((r: any) => !r.success)) {
        setError(`${data.results.filter((r:any)=>!r.success).length} video(s) failed to analyze. Successful ones are shown below.`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeVideo = videos[activeVideoIndex];
  const currentBreakdown = activeVideo ? bookBreakdowns[activeVideo.url] || '' : '';
  const activeVideoId = activeVideo ? getYoutubeId(activeVideo.url) : null;
  const activeMeta = activeVideo ? metaFields[activeVideo.url] || { date: '', participants: '', tags: '' } : { date: '', participants: '', tags: '' };

  const updateMeta = (field: 'date' | 'participants' | 'tags', val: string) => {
    if (!activeVideo) return;
    setMetaFields(prev => ({
      ...prev,
      [activeVideo.url]: { ...(prev[activeVideo.url] || { date: '', participants: '', tags: '' }), [field]: val }
    }));
  };

  const generateBreakdown = async () => {
    if (!activeVideo?.transcript) return;
    setGeneratingBreakdown(true); setPolishError('');
    try {
      const prompt = `You are an expert research assistant and transcript diarizer helping an author gather information for a book. 
      
Context for this media:
- Title: ${activeVideo.title}
- Apparent Date of Event: ${activeMeta.date || 'Not specified'}
- Participants/Speakers Hints: ${activeMeta.participants || 'Not specified'}
- Tags: ${activeMeta.tags || 'Not specified'}

Global Known Speakers (learned from previous videos):
${JSON.stringify(speakerProfiles, null, 2)}

Instructions:
1. Analyze the transcript. Use participants hints and known speaker profiles to identify speakers.
2. Provide a comprehensive breakdown in Markdown.

Required Sections:
## Summary
(Concise summary of the video/call)

## Key Themes & Entities
(Bullet points: main topics, people mentioned, locations, facts, dates)

## Speaker Breakdown
(Who spoke, what each person contributed)

## Diarized & Polished Transcript
(Cleaned-up, readable version with **Speaker Name:** prepended to each paragraph)

4. After the Markdown, provide a JSON block in \`\`\`json ... \`\`\` with updated speaker profiles dictionary.
Keys = speaker names, Values = short description of role, speech patterns, topics.

Transcript:
${activeVideo.transcript}`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });

      if (response.text) {
        let textResult = response.text;
        const jsonMatch = textResult.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch?.[1]) {
          try {
            const newProfiles = JSON.parse(jsonMatch[1]);
            setSpeakerProfiles(prev => ({ ...prev, ...newProfiles }));
            textResult = textResult.replace(/```json\n[\s\S]*?\n```/, '').trim();
          } catch (e) { console.error('Failed to parse speaker profiles', e); }
        }
        const finalBreakdown = `**Reference URL:** ${activeVideo.url}\n**Event Date:** ${activeMeta.date || 'Not specified'}\n**Participants:** ${activeMeta.participants || 'Not specified'}\n\n---\n\n${textResult}`;
        setBookBreakdowns(prev => ({ ...prev, [activeVideo.url]: finalBreakdown }));
      } else {
        throw new Error('No text returned from Gemini API.');
      }
    } catch (err: any) {
      setPolishError(err.message || 'Error generating breakdown');
    } finally {
      setGeneratingBreakdown(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentBreakdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportAllData = () => {
    if (!videos.length) return;
    let out = `# Book Research: Video Transcripts and Notes\n\n*Generated: ${new Date().toLocaleDateString()}*\n\n---\n\n`;
    videos.forEach(v => {
      out += `## ${v.title || v.url}\n- **URL:** ${v.url}\n`;
      const meta = metaFields[v.url];
      if (meta) { out += `- **Date:** ${meta.date||'N/A'}\n- **Participants:** ${meta.participants||'N/A'}\n- **Tags:** ${meta.tags||'N/A'}\n`; }
      out += `\n### Notes\n\n${bookBreakdowns[v.url] || '*No notes yet.*'}\n\n---\n\n`;
    });
    if (Object.keys(speakerProfiles).length > 0) {
      out += `## Speaker Profiles\n\n`;
      Object.entries(speakerProfiles).forEach(([n,d]) => { out += `- **${n}:** ${d}\n`; });
    }
    const blob = new Blob([out], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `research-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const addSpeaker = () => {
    if (!newSpeakerName.trim()) return;
    setSpeakerProfiles(prev => ({ ...prev, [newSpeakerName.trim()]: newSpeakerDesc.trim() }));
    setNewSpeakerName(''); setNewSpeakerDesc(''); setAddingSpeaker(false);
  };

  const updateSpeaker = (oldName: string, newName: string, newDesc: string) => {
    setSpeakerProfiles(prev => {
      const updated = { ...prev };
      if (oldName !== newName) delete updated[oldName];
      updated[newName] = newDesc;
      return updated;
    });
  };

  const deleteSpeaker = (name: string) => {
    setSpeakerProfiles(prev => { const u = { ...prev }; delete u[name]; return u; });
  };

  const transcriptWordCount = activeVideo ? wordCount(activeVideo.transcript) : 0;
  const transcriptReadTime = activeVideo ? readTime(activeVideo.transcript) : 0;

  return (
    <div className="h-screen bg-slate-100 flex flex-col font-sans text-slate-900 overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center gap-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center shadow-sm">
            <Youtube className="w-4 h-4 text-white" />
          </div>
          <span className="font-extrabold text-lg tracking-tight hidden md:inline">
            Transcriber<span className="text-blue-600">AI</span>
          </span>
        </div>

        <form onSubmit={fetchVideoInfo} className="flex-1 flex items-center gap-2 max-w-3xl">
          <div className="relative flex-1">
            <Youtube className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={urlsInput}
              onChange={e => setUrlsInput(e.target.value)}
              placeholder="Paste YouTube URL(s) — separate with space or comma..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Zap className="w-4 h-4" />}
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
          <button
            onClick={() => setChatOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${chatOpen ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700'}`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">AI Chat</span>
          </button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── Main area ───────────────────────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Error state / empty state */}
          {error && videos.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="bg-red-50 text-red-800 p-4 rounded-xl flex items-start gap-3 border border-red-200 max-w-lg shadow-sm">
                <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                <p className="text-sm font-medium">{error}</p>
              </div>
            </div>
          ) : videos.length > 0 ? (
            <>
              {/* ── Left Sidebar ──────────────────────────────────────── */}
              <aside className="w-72 xl:w-80 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0 hidden md:flex">
                {/* Video list */}
                {videos.length > 1 && (
                  <div className="p-3 border-b border-slate-100 bg-slate-50">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{videos.length} Videos Loaded</p>
                    <div className="space-y-1 max-h-28 overflow-y-auto">
                      {videos.map((v, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveVideoIndex(i)}
                          className={`text-left w-full px-2.5 py-1.5 rounded-lg text-xs font-medium truncate transition-colors ${i === activeVideoIndex ? 'bg-blue-600 text-white' : 'hover:bg-slate-200 text-slate-600'}`}
                        >
                          {v.title || v.url}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-y-auto flex-1 p-4 space-y-5">
                  {/* Thumbnail + title */}
                  <div>
                    {activeVideoId && (
                      <div className="w-full aspect-video bg-slate-900 rounded-xl overflow-hidden mb-3 shadow-sm border border-slate-200">
                        <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${activeVideoId}`}
                          title="YouTube video" frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen />
                      </div>
                    )}
                    <h1 className="text-sm font-bold leading-snug mb-1">{activeVideo?.title}</h1>
                    <a href={activeVideo?.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1 truncate">
                      <ExternalLink className="w-3 h-3 shrink-0" />{activeVideo?.url}
                    </a>
                  </div>

                  {/* Stats bar */}
                  {activeVideo?.transcript && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                        <p className="text-base font-extrabold text-slate-800">{transcriptWordCount.toLocaleString()}</p>
                        <p className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Words</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                        <p className="text-base font-extrabold text-slate-800">{transcriptReadTime} min</p>
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
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><BarChart2 className="w-3 h-3" />Research Metadata</p>

                    {/* Date with quick picker */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" /> Event Date</label>
                      <QuickDatePicker value={activeMeta.date} onChange={v => updateMeta('date', v)} />
                    </div>

                    {/* Participants */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> Participants</label>
                      <textarea
                        value={activeMeta.participants}
                        onChange={e => updateMeta('participants', e.target.value)}
                        placeholder="Who is in this video?"
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none min-h-[60px] placeholder:text-slate-300 transition-shadow"
                      />
                    </div>

                    {/* Tags */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 flex items-center gap-1"><Tag className="w-3 h-3" /> Tags</label>
                      <input
                        type="text"
                        value={activeMeta.tags}
                        onChange={e => updateMeta('tags', e.target.value)}
                        placeholder="e.g. interview, 2023, court case"
                        className="w-full text-xs p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300 transition-shadow"
                      />
                    </div>
                  </div>

                  {/* Speaker Profiles */}
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <User className="w-3 h-3" /> Learned Voices
                        {Object.keys(speakerProfiles).length > 0 && (
                          <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded text-[9px]">{Object.keys(speakerProfiles).length}</span>
                        )}
                      </p>
                      <button
                        onClick={() => setAddingSpeaker(a => !a)}
                        className="p-1 hover:bg-blue-50 rounded-lg text-slate-400 hover:text-blue-600 transition-colors"
                        title="Add speaker"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {addingSpeaker && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 space-y-2">
                        <input
                          value={newSpeakerName}
                          onChange={e => setNewSpeakerName(e.target.value)}
                          placeholder="Speaker name"
                          className="w-full text-xs p-1.5 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                        />
                        <textarea
                          value={newSpeakerDesc}
                          onChange={e => setNewSpeakerDesc(e.target.value)}
                          placeholder="Role, speech patterns, topics..."
                          className="w-full text-[11px] p-1.5 border border-slate-200 rounded-lg outline-none resize-none focus:ring-2 focus:ring-blue-400 bg-white"
                          rows={2}
                        />
                        <div className="flex gap-1.5">
                          <button onClick={addSpeaker} className="flex-1 text-[11px] font-bold bg-blue-600 text-white py-1 rounded-lg hover:bg-blue-700 transition-colors">Add</button>
                          <button onClick={() => setAddingSpeaker(false)} className="px-2 text-[11px] bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">Cancel</button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                      {Object.keys(speakerProfiles).length === 0 && !addingSpeaker && (
                        <p className="text-[11px] text-slate-400 italic text-center py-3">No voices learned yet. Generate a breakdown or add one manually.</p>
                      )}
                      {Object.entries(speakerProfiles).map(([name, desc]) => (
                        <SpeakerCard
                          key={name} name={name} desc={desc as string}
                          onUpdate={(n, d) => updateSpeaker(name, n, d)}
                          onDelete={() => deleteSpeaker(name)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

              {/* ── Main Content ─────────────────────────────────────── */}
              <section className="flex-1 flex flex-col overflow-hidden bg-slate-50">
                {/* Toolbar */}
                <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 shrink-0">
                  {error && (
                    <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg text-xs font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />{error}
                    </div>
                  )}
                  <div className="relative flex-1 max-w-xs">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search transcript & notes..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                    />
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      onClick={generateBreakdown}
                      disabled={generatingBreakdown || !!currentBreakdown}
                      className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                    >
                      {generatingBreakdown ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {generatingBreakdown ? 'Generating...' : currentBreakdown ? '✓ Notes Ready' : 'Generate Notes'}
                    </button>
                  </div>
                </div>

                {polishError && (
                  <div className="mx-4 mt-3 bg-red-50 text-red-800 p-3 rounded-xl text-xs border border-red-200 flex items-start gap-2 shrink-0">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{polishError}</span>
                  </div>
                )}

                {/* Transcript / Breakdown area */}
                <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
                  {/* Raw Transcript */}
                  <div className={`flex-1 bg-white border border-slate-200 rounded-2xl flex flex-col overflow-hidden shadow-sm ${currentBreakdown ? 'hidden lg:flex' : ''}`}>
                    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Source Transcript</span>
                      </div>
                      {transcriptWordCount > 0 && (
                        <span className="text-[10px] text-slate-400 font-medium">{transcriptWordCount.toLocaleString()} words · ~{transcriptReadTime} min read</span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto p-5">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {highlightText(activeVideo?.transcript || 'No transcript available.', searchQuery)}
                      </p>
                    </div>
                  </div>

                  {/* Book Breakdown */}
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
                          <Markdown
                            components={{
                              p: ({node, ...props}) => <p>{highlightChildren(props.children, searchQuery)}</p>,
                              li: ({node, ...props}) => <li>{highlightChildren(props.children, searchQuery)}</li>,
                              h1: ({node, ...props}) => <h1>{highlightChildren(props.children, searchQuery)}</h1>,
                              h2: ({node, ...props}) => <h2>{highlightChildren(props.children, searchQuery)}</h2>,
                              h3: ({node, ...props}) => <h3>{highlightChildren(props.children, searchQuery)}</h3>,
                              strong: ({node, ...props}) => <strong>{highlightChildren(props.children, searchQuery)}</strong>,
                            }}
                          >
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
            // ── Landing / Empty State ────────────────────────────────
            <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-blue-50/30">
              <div className="max-w-5xl mx-auto px-6 py-16 flex flex-col items-center">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100 text-blue-700 font-bold text-xs mb-8 border border-blue-200 shadow-sm uppercase tracking-wider">
                  <Zap className="w-3.5 h-3.5" /> Book Research Assistant
                </div>
                <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight text-center mb-5 leading-tight">
                  Transform YouTube Videos into<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Actionable Book Notes</span>
                </h1>
                <p className="text-lg text-slate-500 text-center max-w-2xl mb-14 leading-relaxed">
                  Extract transcripts from multiple YouTube videos, identify speakers, and let Gemini AI generate structured research material — all in one place.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 w-full max-w-3xl">
                  {[
                    { icon: Layers, color: 'blue', title: 'Bulk URL Processing', desc: 'Paste multiple YouTube URLs and analyze them all at once.' },
                    { icon: Sparkles, color: 'indigo', title: 'AI-Powered Notes', desc: 'Gemini identifies speakers and generates structured research breakdowns.' },
                    { icon: MessageSquare, color: 'violet', title: 'AI Chat Assistant', desc: 'Chat with AI about any video — clarify errors, extract quotes, ask questions.' },
                    { icon: Save, color: 'emerald', title: 'Auto-Save & Export', desc: 'Everything saves automatically. Export all notes to Markdown anytime.' },
                    { icon: Users, color: 'amber', title: 'Speaker Learning', desc: 'AI learns speaker voices across videos and builds persistent profiles.' },
                    { icon: Calendar, color: 'rose', title: 'Quick Date Entry', desc: 'Set event dates with one click — today, last week, custom month/year.' },
                  ].map(({ icon: Icon, color, title, desc }) => (
                    <div key={title} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-4 hover:shadow-md transition-shadow group">
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
        </div>

        {/* ── Chat Panel ──────────────────────────────────────────────── */}
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          activeVideo={activeVideo}
          currentBreakdown={currentBreakdown}
          speakerProfiles={speakerProfiles}
        />
      </div>
    </div>
  );
}
