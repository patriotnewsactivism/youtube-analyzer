export interface SpeakerProfile {
  fullName: string;
  aliases: string[];
  role: string;
  topics: string[];
  speechPatterns: string;
  firstSeen: string;
  lastSeen: string;
  appearances: number;
  confidence: 'learning' | 'confirmed' | 'verified';
  notes: string;
}

export interface VideoMeta {
  date: string;
  participants: string;
  tags: string;
  chapter: string;   // book chapter / theme grouping
  notes: string;     // user's own scratch-pad annotations
}

export interface Video {
  url: string;
  title: string;
  description: string;
  transcript: string;
  success: boolean;
  error?: string;
}

export type ConfidenceLevel = 'learning' | 'confirmed' | 'verified';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
