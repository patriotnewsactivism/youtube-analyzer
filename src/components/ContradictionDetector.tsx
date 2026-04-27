import React, { useState } from 'react';
import { AlertTriangle, Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import type { Video, VideoMeta } from '../lib/types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function ContradictionDetector({
  videos, metaFields, bookBreakdowns
}: {
  videos: Video[];
  metaFields: Record<string, VideoMeta>;
  bookBreakdowns: Record<string, string>;
}) {
  const [videoA, setVideoA] = useState('');
  const [videoB, setVideoB] = useState('');
  const [focus, setFocus] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const runAnalysis = async () => {
    if (!videoA || !videoB) return;
    setLoading(true); setResult(''); setError('');
    try {
      const vA = videos.find(v => v.url === videoA)!;
      const vB = videos.find(v => v.url === videoB)!;
      const metaA = metaFields[videoA];
      const metaB = metaFields[videoB];
      const prompt = `You are a forensic fact-checker assisting a book author. Compare these two video transcripts and find contradictions, inconsistencies, and notable agreements.

VIDEO A:
- Title: ${vA.title}
- Date: ${metaA?.date || 'Unknown'}
- Participants: ${metaA?.participants || 'Unknown'}
- Transcript: ${vA.transcript?.slice(0, 6000) || ''}
${bookBreakdowns[videoA] ? `- Existing notes: ${bookBreakdowns[videoA].slice(0, 2000)}` : ''}

VIDEO B:
- Title: ${vB.title}
- Date: ${metaB?.date || 'Unknown'}
- Participants: ${metaB?.participants || 'Unknown'}
- Transcript: ${vB.transcript?.slice(0, 6000) || ''}
${bookBreakdowns[videoB] ? `- Existing notes: ${bookBreakdowns[videoB].slice(0, 2000)}` : ''}

${focus ? `Focus area: ${focus}` : ''}

Provide a thorough comparison in Markdown with these sections:

## Key Contradictions
List every factual contradiction or inconsistency found. For each: quote both versions, name the speaker if known, and note which video it's from.

## Timeline Discrepancies
Any differences in dates, sequence of events, or timing.

## Speaker Inconsistencies
Where the same person said different or opposing things across both videos.

## Corroborating Evidence
Key facts or claims that BOTH videos agree on — useful as reliable sources.

## Analysis & Book Notes
Your assessment of which account appears more credible and why. Flag anything the author should investigate further.`;

      const response = await ai.models.generateContent({ model: 'gemini-2.5-flash', contents: prompt });
      setResult(response.text || 'No output.');
    } catch (err: any) {
      setError(err.message || 'Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  if (videos.length < 2) return (
    <div className="flex-1 flex items-center justify-center text-center px-6">
      <div>
        <AlertTriangle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
        <p className="text-slate-500 text-sm font-medium">Need at least 2 videos</p>
        <p className="text-slate-400 text-xs mt-1">Load and analyze at least 2 YouTube videos to compare them.</p>
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-extrabold text-slate-900">Contradiction Detector</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">Compare two videos side-by-side and let Gemini find where accounts diverge or contradict each other.</p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Video A</label>
            <select value={videoA} onChange={e => setVideoA(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select video...</option>
              {videos.map(v => <option key={v.url} value={v.url}>{v.title || v.url}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1 block">Video B</label>
            <select value={videoB} onChange={e => setVideoB(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select video...</option>
              {videos.filter(v => v.url !== videoA).map(v => <option key={v.url} value={v.url}>{v.title || v.url}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-3">
          <input value={focus} onChange={e => setFocus(e.target.value)}
            placeholder="Optional: focus on a specific topic, person, or event..."
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500/20" />
          <button onClick={runAnalysis} disabled={!videoA || !videoB || loading}
            className="flex items-center gap-2 px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {loading ? 'Analyzing...' : 'Detect Contradictions'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-xl text-sm mb-4">{error}</div>
        )}
        {!result && !loading && (
          <div className="flex items-center justify-center h-full text-center">
            <div>
              <AlertTriangle className="w-12 h-12 text-slate-200 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Select two videos and click Detect Contradictions</p>
              <p className="text-slate-400 text-xs mt-1">Great for catching when the same person tells different stories across different videos.</p>
            </div>
          </div>
        )}
        {result && (
          <div className="max-w-3xl bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="prose prose-sm max-w-none prose-headings:font-bold prose-headings:text-slate-900">
              <Markdown>{result}</Markdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
