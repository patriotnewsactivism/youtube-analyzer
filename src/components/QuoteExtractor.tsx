import React, { useState, useMemo } from 'react';
import { Quote, Loader2, Sparkles, Copy, CheckCircle, Filter, Download } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import type { Video, VideoMeta, SpeakerProfile } from '../lib/types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

interface ExtractedQuote {
  speaker: string;
  quote: string;
  context: string;
  significance: string;
  videoTitle: string;
  videoUrl: string;
  date: string;
}

export default function QuoteExtractor({
  videos, metaFields, speakerProfiles
}: {
  videos: Video[];
  metaFields: Record<string, VideoMeta>;
  speakerProfiles: Record<string, SpeakerProfile>;
}) {
  const [selectedVideo, setSelectedVideo] = useState<'all' | string>('all');
  const [targetSpeaker, setTargetSpeaker] = useState('');
  const [topic, setTopic] = useState('');
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState<ExtractedQuote[]>([]);
  const [error, setError] = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [filterSpeaker, setFilterSpeaker] = useState('');

  const speakerNames = Object.keys(speakerProfiles);

  const extract = async () => {
    setLoading(true); setError(''); setQuotes([]);
    try {
      const targetVideos = selectedVideo === 'all' ? videos : videos.filter(v => v.url === selectedVideo);
      const allQuotes: ExtractedQuote[] = [];

      for (const video of targetVideos) {
        const meta = metaFields[video.url] || {} as VideoMeta;
        const prompt = `You are a research assistant extracting notable quotes for a book author.

Video: "${video.title}"
Date: ${meta.date || 'Unknown'}
Participants: ${meta.participants || 'Unknown'}
${targetSpeaker ? `Focus on quotes from: ${targetSpeaker}` : ''}
${topic ? `Focus on topic: ${topic}` : ''}

Known speakers:
${Object.entries(speakerProfiles).map(([n,p]) => `${n}: ${p.role}`).join('\n') || 'None'}

Transcript:
${video.transcript?.slice(0, 8000) || ''}

Extract the most significant, quotable statements. For a book, focus on:
- Admissions or revelations
- Strong opinions or allegations  
- Contradictions or notable claims
- Emotional or impactful statements
- Key facts stated directly

Return ONLY valid JSON — an array of objects with this structure:
[
  {
    "speaker": "Full name or Unknown",
    "quote": "Exact verbatim quote",
    "context": "1-2 sentence context for what's happening here",
    "significance": "Why this quote matters for the book"
  }
]
Return 5-15 of the most notable quotes. No markdown, no explanation — just the JSON array.`;

        const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
        const text = response.text || '';
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          parsed.forEach((q: any) => allQuotes.push({
            ...q,
            videoTitle: video.title,
            videoUrl: video.url,
            date: meta.date || '',
          }));
        }
      }
      setQuotes(allQuotes);
    } catch (err: any) {
      setError(err.message || 'Extraction failed.');
    } finally {
      setLoading(false);
    }
  };

  const copyQuote = (q: ExtractedQuote, idx: number) => {
    const text = `"${q.quote}" — ${q.speaker}${q.date ? ` (${q.date})` : ''}\nSource: ${q.videoTitle}\n${q.videoUrl}`;
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const exportAll = () => {
    let out = `# Extracted Quotes\n\nGenerated: ${new Date().toLocaleDateString()}\n\n---\n\n`;
    filtered.forEach(q => {
      out += `> "${q.quote}"\n\n— **${q.speaker}** | ${q.date || 'Date unknown'} | *${q.videoTitle}*\n\n`;
      out += `**Context:** ${q.context}\n\n**Significance:** ${q.significance}\n\nSource: ${q.videoUrl}\n\n---\n\n`;
    });
    const blob = new Blob([out], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'quotes.md';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const filtered = filterSpeaker
    ? quotes.filter(q => q.speaker.toLowerCase().includes(filterSpeaker.toLowerCase()))
    : quotes;

  const speakersInResults = [...new Set(quotes.map(q => q.speaker))].sort();

  if (!videos.length) return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <div>
        <Quote className="w-12 h-12 text-slate-200 mx-auto mb-4" />
        <p className="text-slate-500 text-sm">No videos loaded yet.</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-1">
          <Quote className="w-5 h-5 text-blue-500" />
          <h2 className="text-lg font-extrabold text-slate-900">Quote Extractor</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">Pull citation-ready quotes from any video or across all of them. Filter by speaker or topic.</p>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Source</label>
            <select value={selectedVideo} onChange={e => setSelectedVideo(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All videos</option>
              {videos.map(v => <option key={v.url} value={v.url}>{v.title || v.url}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Speaker (optional)</label>
            {speakerNames.length > 0 ? (
              <select value={targetSpeaker} onChange={e => setTargetSpeaker(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none">
                <option value="">Any speaker</option>
                {speakerNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            ) : (
              <input value={targetSpeaker} onChange={e => setTargetSpeaker(e.target.value)}
                placeholder="e.g. John Smith" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            )}
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Topic (optional)</label>
            <input value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. election fraud, cover-up" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={extract} disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Extracting...' : 'Extract Quotes'}
          </button>
          {quotes.length > 0 && (
            <div className="flex items-center gap-3">
              {speakersInResults.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-slate-400" />
                  <select value={filterSpeaker} onChange={e => setFilterSpeaker(e.target.value)}
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white outline-none">
                    <option value="">All speakers</option>
                    {speakersInResults.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <button onClick={exportAll} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-slate-200 transition-colors">
                <Download className="w-3.5 h-3.5" /> Export ({filtered.length})
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-sm mb-4">{error}</div>}

        {!quotes.length && !loading && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <Quote className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Configure your search and click Extract Quotes</p>
              <p className="text-slate-400 text-xs mt-1">Each quote comes with context, significance, and citation info for your book.</p>
            </div>
          </div>
        )}

        <div className="space-y-4 max-w-3xl">
          {filtered.map((q, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md hover:border-blue-200 transition-all group">
              <div className="flex items-start justify-between gap-3 mb-3">
                <blockquote className="flex-1 text-sm text-slate-800 font-medium leading-relaxed italic border-l-4 border-blue-400 pl-4">
                  "{q.quote}"
                </blockquote>
                <button onClick={() => copyQuote(q, i)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 px-2 py-1 rounded-lg transition-all shrink-0 opacity-0 group-hover:opacity-100">
                  {copiedIdx === i ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
                  {copiedIdx === i ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800">— {q.speaker}</span>
                {q.date && <span className="text-[10px] text-slate-400 font-medium">{q.date}</span>}
                <span className="text-[10px] text-blue-600 font-medium truncate max-w-xs">{q.videoTitle}</span>
              </div>
              {q.context && (
                <p className="text-xs text-slate-500 mb-1.5"><span className="font-semibold">Context:</span> {q.context}</p>
              )}
              {q.significance && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2">
                  <span className="font-semibold">Why it matters:</span> {q.significance}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
