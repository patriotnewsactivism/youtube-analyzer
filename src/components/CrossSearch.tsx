import React, { useState, useMemo } from 'react';
import { Search, FileText, Youtube, ChevronRight } from 'lucide-react';
import type { Video, VideoMeta } from '../lib/types';

interface Hit {
  videoTitle: string;
  videoUrl: string;
  videoIndex: number;
  source: 'transcript' | 'notes';
  snippets: string[];
}

function extractSnippets(text: string, query: string, maxSnippets = 3): string[] {
  if (!text || !query.trim()) return [];
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const snippets: string[] = [];
  let pos = 0;
  while (snippets.length < maxSnippets) {
    const idx = lower.indexOf(qLower, pos);
    if (idx === -1) break;
    const start = Math.max(0, idx - 80);
    const end = Math.min(text.length, idx + query.length + 80);
    snippets.push(text.slice(start, end));
    pos = idx + query.length;
  }
  return snippets;
}

function highlight(text: string, query: string): React.ReactNode[] {
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((p, i) =>
    p.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded-sm px-0.5 font-semibold">{p}</mark>
      : <span key={i}>{p}</span>
  );
}

export default function CrossSearch({
  videos, metaFields, bookBreakdowns, onSelectVideo
}: {
  videos: Video[];
  metaFields: Record<string, VideoMeta>;
  bookBreakdowns: Record<string, string>;
  onSelectVideo: (index: number) => void;
}) {
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [filterSource, setFilterSource] = useState<'all'|'transcript'|'notes'>('all');

  const results: Hit[] = useMemo(() => {
    if (!submitted.trim()) return [];
    const hits: Hit[] = [];
    videos.forEach((v, idx) => {
      const tSnippets = filterSource !== 'notes' ? extractSnippets(v.transcript || '', submitted) : [];
      const nSnippets = filterSource !== 'transcript' ? extractSnippets(bookBreakdowns[v.url] || '', submitted) : [];
      if (tSnippets.length) hits.push({ videoTitle: v.title, videoUrl: v.url, videoIndex: idx, source: 'transcript', snippets: tSnippets });
      if (nSnippets.length) hits.push({ videoTitle: v.title, videoUrl: v.url, videoIndex: idx, source: 'notes', snippets: nSnippets });
    });
    return hits;
  }, [submitted, videos, bookBreakdowns, filterSource]);

  const totalMentions = results.reduce((s, h) => s + h.snippets.length, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Search bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-extrabold text-slate-900 mb-3">Cross-Video Search</h2>
        <form onSubmit={e => { e.preventDefault(); setSubmitted(query); }} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search a name, place, quote, or topic across all transcripts..."
              className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
            />
          </div>
          <select value={filterSource} onChange={e => setFilterSource(e.target.value as any)}
            className="text-sm border border-slate-200 rounded-xl px-3 bg-white outline-none">
            <option value="all">All sources</option>
            <option value="transcript">Transcripts only</option>
            <option value="notes">Notes only</option>
          </select>
          <button type="submit" className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            Search
          </button>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {submitted && (
          <p className="text-xs text-slate-500 mb-4 font-medium">
            {results.length === 0 ? `No results for "${submitted}"` : `${results.length} video${results.length !== 1 ? 's' : ''} · ${totalMentions} mention${totalMentions !== 1 ? 's' : ''} found for "${submitted}"`}
          </p>
        )}

        {!submitted && (
          <div className="flex items-center justify-center h-full text-center">
            <div className="max-w-sm">
              <Search className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-sm font-medium">Search across all {videos.length} loaded video{videos.length !== 1 ? 's' : ''}</p>
              <p className="text-slate-400 text-xs mt-1">Find any name, place, quote, or topic in all transcripts and generated notes at once.</p>
            </div>
          </div>
        )}

        <div className="space-y-4 max-w-3xl">
          {results.map((hit, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:border-blue-200 transition-all">
              {/* Video header */}
              <div
                className="px-4 py-3 border-b border-slate-100 flex items-center gap-3 cursor-pointer group hover:bg-blue-50/50 transition-colors"
                onClick={() => onSelectVideo(hit.videoIndex)}
              >
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${hit.source === 'transcript' ? 'bg-slate-100' : 'bg-blue-100'}`}>
                  {hit.source === 'transcript' ? <Youtube className="w-3.5 h-3.5 text-slate-600" /> : <FileText className="w-3.5 h-3.5 text-blue-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate group-hover:text-blue-700 transition-colors">{hit.videoTitle}</p>
                  <p className="text-[10px] text-slate-400">{hit.source === 'transcript' ? 'Source transcript' : 'Generated notes'} · {hit.snippets.length} mention{hit.snippets.length !== 1 ? 's' : ''}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0 transition-colors" />
              </div>
              {/* Snippets */}
              <div className="divide-y divide-slate-50">
                {hit.snippets.map((snippet, si) => (
                  <div key={si} className="px-4 py-2.5">
                    <p className="text-xs text-slate-700 leading-relaxed">
                      …{highlight(snippet, submitted)}…
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
