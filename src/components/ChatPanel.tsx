import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, X, Send, FileText } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import type { ChatMessage, Video, SpeakerProfile } from '../lib/types';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function ChatPanel({
  open, onClose, activeVideo, currentBreakdown, speakerProfiles
}: {
  open: boolean;
  onClose: () => void;
  activeVideo: Video | null;
  currentBreakdown: string;
  speakerProfiles: Record<string, SpeakerProfile>;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: 'assistant',
    content: "Hi! I have full context of the current video — transcript, notes, and speaker profiles. Ask me anything: clarify errors, find a quote, compare speakers, identify someone, or expand on a topic.",
    timestamp: new Date()
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: ChatMessage = { role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const ctx = `You are an expert research assistant embedded in a YouTube transcript analysis tool used by a book author.

Current video:
- Title: ${activeVideo?.title || 'None loaded'}
- URL: ${activeVideo?.url || ''}
- Transcript (first 10000 chars): ${(activeVideo?.transcript || '').slice(0, 10000)}

Generated breakdown/notes:
${currentBreakdown ? currentBreakdown.slice(0, 5000) : 'None yet.'}

Known speakers:
${Object.entries(speakerProfiles).map(([n, p]) => `${n}: role=${p.role}, topics=${p.topics?.join(',')}, patterns=${p.speechPatterns}`).join('\n') || 'None.'}

Help the user: clarify transcript content, fix errors, extract quotes, identify speakers, answer questions about events.
Be concise and use markdown when helpful.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `${ctx}\n\nUser: ${userMsg.content}`,
      });
      setMessages(prev => [...prev, { role: 'assistant', content: response.text || 'No response.', timestamp: new Date() }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message}`, timestamp: new Date() }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="w-96 bg-white border-l border-slate-200 flex flex-col shrink-0 shadow-xl z-10">
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
        <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><X className="w-4 h-4" /></button>
      </div>

      {activeVideo && (
        <div className="px-3 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-blue-500 shrink-0" />
          <p className="text-[10px] text-blue-700 font-medium truncate">Context: {activeVideo.title}</p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-blue-600' : 'bg-slate-200'}`}>
              {msg.role === 'user' ? <User className="w-3 h-3 text-white" /> : <Bot className="w-3 h-3 text-slate-600" />}
            </div>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'}`}>
              {msg.role === 'assistant'
                ? <div className="prose prose-sm max-w-none"><Markdown>{msg.content}</Markdown></div>
                : msg.content}
              <p className={`text-[9px] mt-1 ${msg.role === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0"><Bot className="w-3 h-3 text-slate-600" /></div>
            <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-3 py-2.5">
              <div className="flex gap-1">
                {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-slate-200">
        <div className="flex gap-2 items-end">
          <textarea
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Ask about transcript, speakers, errors..."
            className="flex-1 text-sm p-2.5 bg-slate-50 border border-slate-200 rounded-xl resize-none outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300 max-h-32 min-h-[40px]"
            rows={1} disabled={loading}
          />
          <button onClick={sendMessage} disabled={loading || !input.trim()}
            className="p-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-center">Enter to send · Shift+Enter for newline</p>
      </div>
    </div>
  );
}
