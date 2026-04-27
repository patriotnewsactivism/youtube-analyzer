import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Loader2, Youtube, Sparkles, AlertCircle, Copy, CheckCircle, Trash2, Search, Zap, Layers, BookOpen, Save } from 'lucide-react';
import Markdown from 'react-markdown';

const getYoutubeId = (url: string) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Highlighting Helpers
const highlightText = (text: string, query: string) => {
  if (!query.trim() || !text) return text;
  const parts = String(text).split(new RegExp(`(${query})`, 'gi'));
  return parts.map((p, i) => 
    p.toLowerCase() === query.toLowerCase() 
      ? <span key={i} className="bg-yellow-300 text-yellow-900 font-medium rounded-sm px-0.5 shadow-sm">{p}</span>
      : p
  );
};

const highlightChildren = (children: React.ReactNode, query: string): React.ReactNode => {
  if (!query.trim()) return children;
  return React.Children.map(children, (child) => {
    if (typeof child === 'string') {
      return highlightText(child, query);
    }
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

export default function App() {
  const [urlsInput, setUrlsInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [videos, setVideos] = useState<any[]>([]);
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);

  // Track metadata per video URL
  const [metaFields, setMetaFields] = useState<Record<string, {date: string, participants: string}>>({});

  const [generatingBreakdown, setGeneratingBreakdown] = useState(false);
  
  // Track breakdowns per video URL
  const [bookBreakdowns, setBookBreakdowns] = useState<Record<string, string>>({});
  const [polishError, setPolishError] = useState('');
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Global Learned Speakers Profiles
  const [speakerProfiles, setSpeakerProfiles] = useState<Record<string, string>>({});

  // Auto-save: Load on mount
  useEffect(() => {
    try {
      const savedVideos = localStorage.getItem('ytAnalyzer_videos');
      const savedBreakdowns = localStorage.getItem('ytAnalyzer_breakdowns');
      const savedMeta = localStorage.getItem('ytAnalyzer_meta');
      const savedSpeakers = localStorage.getItem('ytAnalyzer_speakers');
      
      if (savedVideos) setVideos(JSON.parse(savedVideos));
      if (savedBreakdowns) setBookBreakdowns(JSON.parse(savedBreakdowns));
      if (savedMeta) setMetaFields(JSON.parse(savedMeta));
      if (savedSpeakers) setSpeakerProfiles(JSON.parse(savedSpeakers));
    } catch (e) {
      console.error("Failed to load local storage", e);
    }
  }, []);

  // Auto-save: Save on changes
  useEffect(() => {
    if (videos.length > 0) localStorage.setItem('ytAnalyzer_videos', JSON.stringify(videos));
  }, [videos]);

  useEffect(() => {
    if (Object.keys(bookBreakdowns).length > 0) localStorage.setItem('ytAnalyzer_breakdowns', JSON.stringify(bookBreakdowns));
  }, [bookBreakdowns]);

  useEffect(() => {
    if (Object.keys(metaFields).length > 0) localStorage.setItem('ytAnalyzer_meta', JSON.stringify(metaFields));
  }, [metaFields]);

  useEffect(() => {
    if (Object.keys(speakerProfiles).length > 0) localStorage.setItem('ytAnalyzer_speakers', JSON.stringify(speakerProfiles));
  }, [speakerProfiles]);

  const clearAllData = () => {
    if (!confirm('Are you sure you want to clear all saved videos, notes, and learned voices?')) return;
    localStorage.removeItem('ytAnalyzer_videos');
    localStorage.removeItem('ytAnalyzer_breakdowns');
    localStorage.removeItem('ytAnalyzer_meta');
    localStorage.removeItem('ytAnalyzer_speakers');
    setVideos([]);
    setBookBreakdowns({});
    setMetaFields({});
    setSpeakerProfiles({});
    setActiveVideoIndex(0);
    setUrlsInput('');
  };

  const fetchVideoInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlsInput) return;

    const urls = urlsInput.split(/[\s,]+/).filter(u => u.trim() !== '');
    if (urls.length === 0) return;

    setLoading(true);
    setError('');
    setVideos([]);
    setActiveVideoIndex(0);
    setPolishError('');

    try {
      const res = await fetch('/api/analyze-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch video information');
      }

      setVideos(data.results.filter((r: any) => r.success));
      if (data.results.some((r: any) => !r.success)) {
        setError('Some videos failed to analyze.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const activeVideo = videos[activeVideoIndex];
  const currentBreakdown = activeVideo ? bookBreakdowns[activeVideo.url] : '';
  const activeVideoId = activeVideo ? getYoutubeId(activeVideo.url) : null;
  const activeMeta = activeVideo ? metaFields[activeVideo.url] || {date: '', participants: ''} : {date: '', participants: ''};

  const updateMeta = (field: 'date'|'participants', val: string) => {
    if (!activeVideo) return;
    setMetaFields(prev => ({
      ...prev,
      [activeVideo.url]: {
        ...(prev[activeVideo.url] || {date: '', participants: ''}),
        [field]: val
      }
    }));
  };

  const generateBreakdown = async () => {
    if (!activeVideo?.transcript) return;
    
    setGeneratingBreakdown(true);
    setPolishError('');
    
    try {
      const prompt = `You are an expert research assistant and transcript diarizer helping an author gather information for a book. 
      
      Context for this media:
      - Apparent Date of Event: ${activeMeta.date || 'Not specified by author'}
      - Participants/Speakers Hints: ${activeMeta.participants || 'Not specified by author'}
      
      Global Known Speakers (learned from previous videos):
      ${JSON.stringify(speakerProfiles, null, 2)}

      Instructions:
      1. Analyze the transcript text. It may lack speaker labels.
      2. Use the "Participants" hints and the "Global Known Speakers" profiles to identify who is speaking. Try to assign every paragraph to a speaker. Look for contextual clues like introductions, topics of expertise, and speech patterns.
      3. Provide a comprehensive breakdown in Markdown format.

      Required Sections in Markdown:
      ## Summary
      (A concise summary of the video/call's contents)

      ## Key Themes & Entities
      (Bullet points of main topics, people mentioned, locations, facts)

      ## Speaker Breakdown
      (Identify who spoke in this video. Summarize what each person contributed)

      ## Diarized & Polished Transcript
      (Provide a cleaned-up, highly readable version of the transcript with paragraphs. PREPEND EACH PARAGRAPH WITH THE IDENTIFIED SPEAKER'S NAME in bold, like **John Doe:**. Fix obvious errors without changing the meaning.)

      4. IMPORTANT: After your Markdown output, provide a JSON block enclosed in \`\`\`json ... \`\`\` that contains an updated dictionary of speaker profiles. 
      - Keys should be speaker names.
      - Values should be a short string describing their role, unique speech patterns, and common topics (to help identify them in future unlabeled transcripts).
      - Include both newly discovered speakers from this video and existing ones with updated context.
      
      Transcript text:
      ${activeVideo.transcript}`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      if (response.text) {
        let textResult = response.text;
        
        // Extract JSON profiles if present
        const jsonMatch = textResult.match(/```json\n([\s\S]*?)\n```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            const newProfiles = JSON.parse(jsonMatch[1]);
            setSpeakerProfiles(prev => ({...prev, ...newProfiles}));
            textResult = textResult.replace(/```json\n[\s\S]*?\n```/, '').trim();
          } catch (e) {
            console.error("Failed to parse speaker profiles JSON", e);
          }
        }

        const finalBreakdown = 
`**Reference URL:** ${activeVideo.url}
**Event Date:** ${activeMeta.date || 'Not specified'}
**Participants:** ${activeMeta.participants || 'Not specified'}

---

${textResult}`;
        setBookBreakdowns(prev => ({
          ...prev,
          [activeVideo.url]: finalBreakdown
        }));
      } else {
        throw new Error('No text returned from Gemini API.');
      }
    } catch (err: any) {
      setPolishError(err.message || 'Error occurred while generating breakdown');
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
    if (videos.length === 0) return;
    
    let fullExport = `# Book Research: Video Transcripts and Notes\n\n`;
    fullExport += `*Generated on: ${new Date().toLocaleDateString()}*\n\n---\n\n`;

    videos.forEach((v) => {
      fullExport += `## Video: ${v.title || v.url}\n`;
      fullExport += `- **URL:** ${v.url}\n`;
      const meta = metaFields[v.url];
      if (meta) {
        fullExport += `- **Date:** ${meta.date || 'Not specified'}\n`;
        fullExport += `- **Participants:** ${meta.participants || 'Not specified'}\n`;
      }
      fullExport += `\n### Notes & Analysis\n\n`;
      const breakdown = bookBreakdowns[v.url];
      if (breakdown) {
        fullExport += `${breakdown}\n\n`;
      } else {
        fullExport += `*No notes generated for this video yet.*\n\n`;
      }
      fullExport += `---\n\n`;
    });

    if (Object.keys(speakerProfiles).length > 0) {
       fullExport += `## Master Speaker Profiles Registry\n\n`;
       Object.entries(speakerProfiles).forEach(([name, desc]) => {
         fullExport += `- **${name}:** ${desc}\n`;
       });
    }

    const blob = new Blob([fullExport], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `book-research-export-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans text-slate-900 overflow-hidden">
      {/* Header */}
      <header className="h-20 bg-white border-b border-slate-200 px-4 md:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shrink-0">
            <Youtube className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight hidden md:inline shrink-0">Transcriber<span className="text-blue-600">AI</span></span>
        </div>
        
        <div className="flex-1 max-w-3xl px-4 md:px-12 h-full py-3">
          <form onSubmit={fetchVideoInfo} className="relative flex items-center h-full">
            <textarea 
              value={urlsInput}
              onChange={(e) => setUrlsInput(e.target.value)}
              placeholder="Paste one or multiple YouTube URLs here (separated by space or newline)..."
              required
              className="w-full h-full bg-slate-100 border border-slate-200 rounded-xl py-2 px-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none" 
            />
            <Youtube className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <button 
              type="submit"
              disabled={loading}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-blue-600 text-white px-4 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1 transition-colors"
            >
              {loading ? <Loader2 className="animate-spin w-3 h-3" /> : null}
              {loading ? 'Analyzing' : 'Analyze'}
            </button>
          </form>
        </div>

        <div className="flex items-center gap-4 hidden sm:flex shrink-0">
          {videos.length > 0 && (
            <>
              <button 
                onClick={exportAllData}
                className="text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 px-3 py-1.5 rounded flex items-center gap-1.5 transition-colors"
                title="Download all generated notes as a single Markdown file"
              >
                <Save className="w-4 h-4" /> Export All
              </button>
              <button 
                onClick={clearAllData}
                className="text-xs font-medium text-slate-500 hover:text-red-600 flex items-center gap-1.5 transition-colors"
                title="Clear all saved videos and transcripts"
              >
                <Trash2 className="w-4 h-4" /> Clear Data
              </button>
            </>
          )}
          <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full border border-green-100">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-xs font-medium text-green-700">Supadata Ready</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {error && videos.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
            <div className="bg-red-50 text-red-800 p-4 rounded-lg flex items-start space-x-3 border border-red-100 max-w-lg shadow-sm">
              <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
              <p className="text-sm font-medium">{error}</p>
            </div>
          </div>
        ) : videos.length > 0 ? (
          <>
            {/* Sidebar: Video Info & Metadata Forms */}
            <aside className="w-80 bg-white border-r border-slate-200 flex flex-col overflow-hidden shrink-0 hidden md:flex">
              {videos.length > 1 && (
                 <div className="p-4 border-b border-slate-100 bg-slate-50">
                   <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">Found {videos.length} Videos</label>
                   <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
                     {videos.map((v, i) => (
                       <button
                         key={i}
                         onClick={() => setActiveVideoIndex(i)}
                         className={`text-left w-full px-3 py-2 rounded-lg text-xs font-medium truncate transition-colors ${i === activeVideoIndex ? 'bg-blue-100 text-blue-700' : 'hover:bg-slate-200 text-slate-600'}`}
                       >
                         {v.title || v.url}
                       </button>
                     ))}
                   </div>
                 </div>
              )}
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                <div>
                  {activeVideoId && (
                    <div className="w-full aspect-video bg-slate-900 rounded-lg overflow-hidden mb-4 shrink-0 shadow-sm border border-slate-200">
                      <iframe
                        width="100%"
                        height="100%"
                        src={`https://www.youtube.com/embed/${activeVideoId}`}
                        title="YouTube video player"
                        frameBorder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  )}
                  <h1 className="text-lg font-bold leading-tight mb-2">{activeVideo?.title}</h1>
                  <div className="space-y-2 mt-4">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Description Snippet</label>
                    <p className="text-sm text-slate-600 leading-relaxed max-h-40 overflow-y-auto pr-2 whitespace-pre-wrap">
                      {activeVideo?.description || 'No description provided.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 pt-6 border-t border-slate-100 flex-1">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800">Book Research Metadata</h3>
                  
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-500">Event Date / Roundabout Date</label>
                    <input 
                      type="text" 
                      value={activeMeta.date} 
                      onChange={(e) => updateMeta('date', e.target.value)} 
                      placeholder="e.g. Fall 2023, or YYYY-MM-DD" 
                      className="w-full text-sm p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none placeholder:text-slate-300 transition-shadow" 
                    />
                  </div>

                  <div className="space-y-1.5 flex-1 flex flex-col">
                    <label className="text-xs font-semibold text-slate-500">Participants / Speakers</label>
                    <textarea 
                      value={activeMeta.participants} 
                      onChange={(e) => updateMeta('participants', e.target.value)} 
                      placeholder="Who is in this call/video?" 
                      className="w-full text-sm p-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none flex-1 min-h-[60px] max-h-[100px] placeholder:text-slate-300 transition-shadow" 
                    />
                  </div>
                </div>

                {Object.keys(speakerProfiles).length > 0 && (
                  <div className="pt-6 border-t border-slate-100">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 mb-3 flex items-center justify-between">
                      Learned Voices
                      <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded text-[10px]">{Object.keys(speakerProfiles).length}</span>
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {Object.entries(speakerProfiles).map(([name, desc]) => (
                        <div key={name} className="bg-slate-50 border border-slate-200 p-2.5 rounded-lg">
                          <p className="text-xs font-bold text-slate-700">{name}</p>
                          <p className="text-[10px] text-slate-500 mt-1 line-clamp-3 leading-relaxed">{desc}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </aside>

            {/* Transcript Area */}
            <section className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden bg-slate-50/50">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4 shrink-0">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-bold">Transcript & Analysis</h2>
                  <span className="bg-slate-200 text-slate-700 text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider border border-slate-300">
                    {currentBreakdown ? 'Book Notes Ready' : 'Raw Output'}
                  </span>
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search transcript & notes..."
                      className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                    />
                  </div>
                  
                  <button 
                    onClick={generateBreakdown}
                    disabled={generatingBreakdown || !!currentBreakdown}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors w-full sm:w-auto justify-center shadow-sm whitespace-nowrap"
                  >
                    {generatingBreakdown ? (
                      <Loader2 className="animate-spin w-4 h-4" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generatingBreakdown ? 'Generating...' : currentBreakdown ? 'Notes Generated' : 'Generate Book Breakdown'}
                  </button>
                </div>
              </div>

              {polishError && (
                 <div className="mb-4 shrink-0 bg-red-50 text-red-800 p-3 rounded-lg text-sm border border-red-100 shadow-sm flex items-start gap-2">
                   <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                   <span>{polishError}</span>
                 </div>
              )}

              <div className="flex-1 flex flex-col lg:flex-row gap-6 overflow-hidden min-h-0">
                {/* Raw Transcript Block */}
                <div className={`flex-1 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 overflow-hidden relative flex flex-col shadow-sm transition-all duration-500 ease-in-out ${currentBreakdown ? 'hidden lg:flex opacity-60 grayscale-[15%]' : ''}`}>
                  <div className="absolute top-0 right-0 w-1.5 h-full bg-slate-100/50 pointer-events-none"></div>
                  
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 border-b border-slate-100 pb-3 shrink-0 flex items-center">
                    Source Transcript
                  </div>
                  
                  <div className="flex-1 overflow-y-auto pb-24 relative z-10 pr-2">
                    <p className="text-slate-800 text-base leading-relaxed whitespace-pre-wrap font-sans">
                      {highlightText(activeVideo?.transcript || 'No transcript available.', searchQuery)}
                    </p>
                  </div>
                  
                  {/* Bottom Fade Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent z-20 pointer-events-none"></div>
                </div>

                {/* Book Breakdown Block */}
                {currentBreakdown && (
                  <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 md:p-8 overflow-hidden relative flex flex-col shadow-[0_4px_40px_rgba(37,99,235,0.08)] border-blue-100 transition-all duration-500 ease-in-out animate-in fade-in slide-in-from-bottom-4">
                    <div className="absolute top-0 right-0 w-1.5 h-full bg-slate-100/50 pointer-events-none"></div>
                    
                    <div className="mb-4 border-b border-blue-100 pb-3 shrink-0 flex items-center justify-between">
                      <div className="text-xs font-bold uppercase tracking-wider text-blue-600">
                        Book Notes & Analysis
                      </div>
                      <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 bg-slate-50 border border-slate-200 hover:border-blue-200 px-3 py-1.5 rounded-md transition-all shadow-sm">
                        {copied ? <CheckCircle className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? 'Copied to Clipboard' : 'Copy Full Notes'}
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pb-24 relative z-10 pr-2">
                      <div className="markdown-body">
                        <Markdown
                          components={{
                            p: ({node, ...props}) => <p>{highlightChildren(props.children, searchQuery)}</p>,
                            li: ({node, ...props}) => <li>{highlightChildren(props.children, searchQuery)}</li>,
                            h1: ({node, ...props}) => <h1>{highlightChildren(props.children, searchQuery)}</h1>,
                            h2: ({node, ...props}) => <h2>{highlightChildren(props.children, searchQuery)}</h2>,
                            h3: ({node, ...props}) => <h3>{highlightChildren(props.children, searchQuery)}</h3>,
                            h4: ({node, ...props}) => <h4>{highlightChildren(props.children, searchQuery)}</h4>,
                            strong: ({node, ...props}) => <strong>{highlightChildren(props.children, searchQuery)}</strong>,
                            em: ({node, ...props}) => <em>{highlightChildren(props.children, searchQuery)}</em>,
                          }}
                        >
                          {currentBreakdown}
                        </Markdown>
                      </div>
                    </div>
                    
                    {/* Bottom Fade Overlay */}
                    <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-white to-transparent z-20 pointer-events-none"></div>
                  </div>
                )}
              </div>
            </section>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto bg-slate-50 relative">
            <div className="max-w-5xl mx-auto px-6 py-12 md:py-20 flex flex-col items-center relative z-10">
              {/* Banner Label */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-100/50 text-blue-700 font-bold text-xs mb-8 border border-blue-200 shadow-sm uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5" /> Book Research Assistant
              </div>
              
              {/* Title */}
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight text-center mb-6 max-w-4xl leading-tight">
                Transform YouTube Videos into <br className="hidden md:block"/>
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Actionable Book Notes</span>
              </h1>
              
              {/* Description */}
              <p className="text-lg md:text-xl text-slate-600 text-center max-w-2xl mb-16 leading-relaxed">
                Extract metadata and transcripts from multiple YouTube videos at once, and let Gemini AI automatically weave them into structured research material.
              </p>
              
              {/* Feature Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                {/* Feature 1 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-5 hover:shadow-md transition-shadow group">
                  <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 border border-blue-100 group-hover:scale-105 transition-transform">
                    <Layers className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2 font-sans tracking-tight">Bulk URL Processing</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Paste multiple YouTube URLs in the header and analyze them sequentially. Perfect for gathering research from whole seminars or playlists.</p>
                  </div>
                </div>
                
                {/* Feature 2 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-5 hover:shadow-md transition-shadow group">
                  <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center shrink-0 border border-indigo-100 group-hover:scale-105 transition-transform">
                    <Sparkles className="w-6 h-6 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2 font-sans tracking-tight">AI-Powered Extraction</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Identify deep themes, isolate specific participants, and clean messy, raw video captions into highly readable Markdown copy.</p>
                  </div>
                </div>
                
                {/* Feature 3 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-5 hover:shadow-md transition-shadow group">
                  <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center shrink-0 border border-emerald-100 group-hover:scale-105 transition-transform">
                    <BookOpen className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2 font-sans tracking-tight">Book Metadata Integration</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Enhance your transcripts with custom facts and manual timeline events so the AI has maximum context to assist your creative writing.</p>
                  </div>
                </div>
                
                {/* Feature 4 */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-5 hover:shadow-md transition-shadow group">
                  <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center shrink-0 border border-amber-100 group-hover:scale-105 transition-transform">
                    <Save className="w-6 h-6 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2 font-sans tracking-tight">Persistent Auto-Saving</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">Your researched videos, metadata blocks, and generated UI notes are automatically saved locally. Zero risk of losing unsaved progress.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

