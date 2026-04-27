import React, { useMemo, useState } from 'react';
import { Calendar, ExternalLink, FileText, Tag, Users, BookOpen, ChevronRight } from 'lucide-react';
import type { Video, VideoMeta } from '../lib/types';

function parseApproxDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Try month year
  const my = dateStr.match(/(\w+)\s+(\d{4})/);
  if (my) { const t = new Date(`${my[1]} 1, ${my[2]}`); if (!isNaN(t.getTime())) return t; }
  // Try season + year
  const seasons: Record<string,number> = { spring: 3, summer: 6, fall: 9, autumn: 9, winter: 12 };
  const sy = dateStr.toLowerCase().match(/(spring|summer|fall|autumn|winter)\s+(\d{4})/);
  if (sy) return new Date(parseInt(sy[2]), seasons[sy[1]], 1);
  // Just a year
  const yr = dateStr.match(/\b(\d{4})\b/);
  if (yr) return new Date(parseInt(yr[1]), 0, 1);
  return null;
}

interface TimelineEntry {
  video: Video;
  meta: VideoMeta;
  date: Date | null;
  breakdown: string;
}

export default function TimelineView({
  videos, metaFields, bookBreakdowns, onSelectVideo
}: {
  videos: Video[];
  metaFields: Record<string, VideoMeta>;
  bookBreakdowns: Record<string, string>;
  onSelectVideo: (index: number) => void;
}) {
  const [filterChapter, setFilterChapter] = useState('');

  const entries: TimelineEntry[] = useMemo(() => {
    return videos.map(v => ({
      video: v,
      meta: metaFields[v.url] || { date: '', participants: '', tags: '', chapter: '', notes: '' },
      date: parseApproxDate(metaFields[v.url]?.date || ''),
      breakdown: bookBreakdowns[v.url] || '',
    })).sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.getTime() - b.date.getTime();
    });
  }, [videos, metaFields, bookBreakdowns]);

  const chapters = useMemo(() => {
    const s = new Set<string>();
    Object.values(metaFields).forEach(m => { if (m.chapter) s.add(m.chapter); });
    return Array.from(s).sort();
  }, [metaFields]);

  const filtered = filterChapter ? entries.filter(e => e.meta.chapter === filterChapter) : entries;

  // Group by year
  const byYear = useMemo(() => {
    const map: Record<string, TimelineEntry[]> = {};
    filtered.forEach(e => {
      const yr = e.date ? e.date.getFullYear().toString() : 'Undated';
      (map[yr] = map[yr] || []).push(e);
    });
    return map;
  }, [filtered]);

  const years = Object.keys(byYear).sort((a, b) => {
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;
    return parseInt(a) - parseInt(b);
  });

  if (!videos.length) return (
    <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
      No videos loaded yet. Analyze some URLs to build your timeline.
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-extrabold text-slate-900">Event Timeline</h2>
            <p className="text-sm text-slate-500 mt-1">{videos.length} video{videos.length !== 1 ? 's' : ''} · sorted by event date</p>
          </div>
          {chapters.length > 0 && (
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-slate-400" />
              <select value={filterChapter} onChange={e => setFilterChapter(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">All chapters</option>
                {chapters.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-24 top-0 bottom-0 w-0.5 bg-slate-200" />

          {years.map(yr => (
            <div key={yr} className="mb-10">
              {/* Year marker */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-24 text-right">
                  <span className="text-2xl font-extrabold text-blue-600">{yr}</span>
                </div>
                <div className="w-4 h-4 rounded-full bg-blue-600 border-4 border-white shadow-md relative z-10" />
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              {/* Events in this year */}
              <div className="space-y-4">
                {byYear[yr].map((entry, i) => {
                  const vidIndex = videos.indexOf(entry.video);
                  const tags = entry.meta.tags ? entry.meta.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
                  const hasBreakdown = !!entry.breakdown;
                  return (
                    <div key={i} className="flex gap-4 items-start">
                      {/* Date label */}
                      <div className="w-24 text-right shrink-0 pt-3">
                        <p className="text-[11px] font-semibold text-slate-500 leading-tight">{entry.meta.date || '—'}</p>
                      </div>
                      {/* Dot */}
                      <div className={`w-3 h-3 rounded-full border-2 mt-4 shrink-0 relative z-10 ${hasBreakdown ? 'bg-emerald-500 border-emerald-600' : 'bg-slate-300 border-slate-400'}`} />
                      {/* Card */}
                      <div className="flex-1 bg-white border border-slate-200 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-blue-200 transition-all cursor-pointer group"
                        onClick={() => onSelectVideo(vidIndex)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 leading-snug group-hover:text-blue-700 transition-colors">{entry.video.title}</p>
                            {entry.meta.chapter && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-full mt-1">
                                <BookOpen className="w-2.5 h-2.5" />{entry.meta.chapter}
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0 mt-0.5 transition-colors" />
                        </div>

                        <div className="flex flex-wrap gap-3 mt-2.5 text-[10px] text-slate-500">
                          {entry.meta.participants && (
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{entry.meta.participants.slice(0,60)}{entry.meta.participants.length > 60 ? '…' : ''}</span>
                          )}
                          {entry.video.url && (
                            <a href={entry.video.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 hover:text-blue-600 transition-colors">
                              <ExternalLink className="w-3 h-3" />Watch
                            </a>
                          )}
                        </div>

                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {tags.map(t => (
                              <span key={t} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full border border-slate-200 flex items-center gap-1">
                                <Tag className="w-2.5 h-2.5" />{t}
                              </span>
                            ))}
                          </div>
                        )}

                        {entry.breakdown && (
                          <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                            <div className="flex items-center gap-1.5 mb-1">
                              <FileText className="w-3 h-3 text-emerald-500" />
                              <span className="text-[10px] font-semibold text-emerald-700">Notes generated</span>
                            </div>
                            <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                              {entry.breakdown.replace(/\*\*/g,'').replace(/#{1,4} /g,'').slice(0,180)}…
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
