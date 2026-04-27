import type { SpeakerProfile, VideoMeta } from './types';

export const getYoutubeId = (url: string): string | null => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

export const wordCount = (text: string) =>
  text ? text.trim().split(/\s+/).filter(Boolean).length : 0;

export const readTime = (text: string) =>
  Math.max(1, Math.ceil(wordCount(text) / 200));

export const defaultMeta = (): VideoMeta => ({
  date: '', participants: '', tags: '', chapter: '', notes: ''
});

export function migrateLegacyProfiles(
  raw: Record<string, any>
): Record<string, SpeakerProfile> {
  const out: Record<string, SpeakerProfile> = {};
  const today = new Date().toISOString().split('T')[0];
  for (const [name, val] of Object.entries(raw)) {
    if (typeof val === 'string') {
      out[name] = {
        fullName: name, aliases: [], role: '', topics: [],
        speechPatterns: val, firstSeen: today, lastSeen: today,
        appearances: 1, confidence: 'learning', notes: ''
      };
    } else {
      out[name] = { fullName: name, aliases: [], role: '', topics: [],
        speechPatterns: '', firstSeen: today, lastSeen: today,
        appearances: 1, confidence: 'learning', notes: '', ...val };
    }
  }
  return out;
}

export function profileToPromptString(name: string, p: SpeakerProfile): string {
  return [
    `Name: ${name}`,
    p.aliases?.length ? `Also known as: ${p.aliases.join(', ')}` : null,
    p.role ? `Role: ${p.role}` : null,
    p.topics?.length ? `Topics: ${p.topics.join(', ')}` : null,
    p.speechPatterns ? `Speech patterns: ${p.speechPatterns}` : null,
    `Appearances: ${p.appearances} | Confidence: ${p.confidence}`,
    p.notes ? `Notes: ${p.notes}` : null,
  ].filter(Boolean).join(' | ');
}

export const CONFIDENCE_STYLES: Record<string, string> = {
  learning: 'bg-amber-100 text-amber-700 border-amber-200',
  confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
  verified: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export const quickDates = [
  { label: 'Today', value: () => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) },
  { label: 'Yesterday', value: () => { const d = new Date(); d.setDate(d.getDate()-1); return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); } },
  { label: 'This Week', value: () => { const d = new Date(); return `Week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`; } },
  { label: 'Last Week', value: () => { const d = new Date(); d.setDate(d.getDate()-7); return `Week of ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`; } },
  { label: 'This Month', value: () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) },
  { label: 'Last Month', value: () => { const d = new Date(); d.setMonth(d.getMonth()-1); return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); } },
];
