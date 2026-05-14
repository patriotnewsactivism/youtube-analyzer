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

// ── Confidence progression thresholds ──────────────────────────────────────
// learning: 0-2 appearances, confirmed: 3-9, verified: 10+
export function computeConfidence(
  appearances: number,
  manualOverride?: SpeakerProfile['confidence']
): SpeakerProfile['confidence'] {
  if (manualOverride === 'verified') return 'verified'; // user manually verified = never downgrade
  if (appearances >= 10) return 'verified';
  if (appearances >= 3) return 'confirmed';
  return 'learning';
}

// ── Fuzzy name matching ─────────────────────────────────────────────────────
// Returns the canonical profile name if any alias/part-name matches, else null
export function fuzzyMatchSpeaker(
  candidateName: string,
  profiles: Record<string, SpeakerProfile>
): string | null {
  const candidate = candidateName.toLowerCase().trim();
  if (!candidate || candidate === 'unknown') return null;

  // 1. Exact match
  if (profiles[candidateName]) return candidateName;

  // 2. Case-insensitive exact
  const lowerMap: Record<string, string> = {};
  for (const k of Object.keys(profiles)) lowerMap[k.toLowerCase()] = k;
  if (lowerMap[candidate]) return lowerMap[candidate];

  // 3. Alias match
  for (const [name, prof] of Object.entries(profiles)) {
    if ((prof.aliases || []).some(a => a.toLowerCase() === candidate)) return name;
    if ((prof.aliases || []).some(a => a.toLowerCase().includes(candidate) || candidate.includes(a.toLowerCase()))) return name;
  }

  // 4. Substring match (candidate is a first/last name of a full profile name)
  const candidateParts = candidate.split(/\s+/);
  for (const [name] of Object.entries(profiles)) {
    const nameParts = name.toLowerCase().split(/\s+/);
    // If ALL candidate parts appear in the profile name (e.g. "John" ⊂ "John Smith")
    if (candidateParts.every(cp => nameParts.includes(cp))) return name;
    // If profile name parts all appear in candidate (e.g. "Smith" ⊂ "Mr. John Smith")
    if (nameParts.every(np => candidate.includes(np))) return name;
  }

  // 5. First name only match (if only one profile has that first name)
  if (candidateParts.length === 1) {
    const matches = Object.keys(profiles).filter(
      name => name.toLowerCase().split(/\s+/)[0] === candidate
    );
    if (matches.length === 1) return matches[0];
  }

  return null;
}

// ── Merge a new AI profile into the existing profiles dict ──────────────────
export function mergeProfile(
  profiles: Record<string, SpeakerProfile>,
  newProfile: {
    fullName?: string; name?: string; aliases?: string[]; role?: string;
    topics?: string[]; speechPatterns?: string; confidence?: SpeakerProfile['confidence'];
    notes?: string;
  },
  today: string
): Record<string, SpeakerProfile> {
  const updated = { ...profiles };
  const rawName = (newProfile.fullName || newProfile.name || 'Unknown').trim();
  if (!rawName || rawName === 'Unknown') return updated;

  // Try fuzzy match to an existing profile
  const existingKey = fuzzyMatchSpeaker(rawName, updated);
  const canonicalName = existingKey || rawName;
  const ex = updated[canonicalName];

  const newAliases = [...new Set([
    ...(ex?.aliases || []),
    ...(newProfile.aliases || []),
    // If we fuzzy-matched, store the new name variant as an alias
    ...(existingKey && existingKey !== rawName ? [rawName] : []),
  ])];

  const newAppearances = (ex?.appearances || 0) + 1;

  // Confidence: auto-compute from appearances, but never downgrade a manually-verified profile
  const autoConf = computeConfidence(newAppearances, ex?.confidence === 'verified' ? 'verified' : undefined);
  // Use the higher of: AI-suggested confidence, auto-computed confidence
  const confRank = { learning: 0, confirmed: 1, verified: 2 };
  const aiConf = newProfile.confidence || 'learning';
  const finalConf = confRank[aiConf] > confRank[autoConf] ? aiConf : autoConf;

  updated[canonicalName] = {
    fullName: canonicalName,
    aliases: newAliases,
    role: newProfile.role || ex?.role || '',
    topics: [...new Set([...(ex?.topics || []), ...(newProfile.topics || [])])],
    speechPatterns: newProfile.speechPatterns || ex?.speechPatterns || '',
    firstSeen: ex?.firstSeen || today,
    lastSeen: today,
    appearances: newAppearances,
    confidence: finalConf,
    notes: [ex?.notes, newProfile.notes].filter(Boolean).join(' | ') || '',
  };

  return updated;
}

// ── Legacy migration ────────────────────────────────────────────────────────
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
      const apps = val.appearances || 1;
      const conf = computeConfidence(apps, val.confidence === 'verified' ? 'verified' : undefined);
      out[name] = {
        fullName: name, aliases: [], role: '', topics: [],
        speechPatterns: '', firstSeen: today, lastSeen: today,
        appearances: apps, confidence: conf, notes: '', ...val
      };
    }
  }
  return out;
}

export function profileToPromptString(name: string, p: SpeakerProfile): string {
  return [
    `Name: ${name}`,
    p.aliases?.length ? `Also known as: ${p.aliases.join(', ')}` : null,
    p.role ? `Role: ${p.role}` : null,
    p.topics?.length ? `Topics they discuss: ${p.topics.join(', ')}` : null,
    p.speechPatterns ? `Speech patterns/vocabulary: ${p.speechPatterns}` : null,
    `Seen ${p.appearances} time(s) | Confidence: ${p.confidence}`,
    p.notes ? `Extra notes: ${p.notes}` : null,
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

// ── Export / Import helpers ─────────────────────────────────────────────────
export function exportProfilesToJSON(profiles: Record<string, SpeakerProfile>): void {
  const blob = new Blob([JSON.stringify(profiles, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `speaker-profiles-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importProfilesFromJSON(
  file: File,
  onSuccess: (profiles: Record<string, SpeakerProfile>) => void,
  onError: (msg: string) => void
): void {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const parsed = JSON.parse(e.target?.result as string);
      onSuccess(migrateLegacyProfiles(parsed));
    } catch {
      onError('Invalid JSON file');
    }
  };
  reader.readAsText(file);
}
