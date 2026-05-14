import type { VercelRequest, VercelResponse } from '@vercel/node';

// Extract YouTube video ID from URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// Fetch metadata via YouTube oEmbed (free, no key)
async function fetchMetadata(url: string) {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const res = await fetch(oembedUrl);
  if (!res.ok) throw new Error(`oEmbed failed: ${res.status}`);
  const data = await res.json() as any;
  return {
    title: data.title || 'Unknown Title',
    description: `Channel: ${data.author_name || 'Unknown'}`,
    thumbnail: data.thumbnail_url || '',
    channel: data.author_name || '',
  };
}

// Fetch transcript via youtube-transcript (free, no key)
async function fetchTranscript(videoId: string): Promise<string> {
  const { YoutubeTranscript } = await import('youtube-transcript');
  const segments = await YoutubeTranscript.fetchTranscript(videoId);
  if (!segments || segments.length === 0) return '';
  return segments.map((s: any) => s.text).join(' ');
}

// Try Supadata as primary (if key available and no limit errors)
async function trySupadata(url: string, apiKey: string) {
  const { Supadata } = await import('@supadata/js');
  const supadata = new Supadata({ apiKey });
  const [metaResult, transcriptResult]: [any, any] = await Promise.all([
    supadata.metadata({ url }),
    supadata.transcript({ url, text: true }),
  ]);

  let transcriptText = '';
  if (typeof transcriptResult === 'string') {
    transcriptText = transcriptResult;
  } else if (transcriptResult?.content) {
    transcriptText = transcriptResult.content;
  } else if (transcriptResult?.text) {
    transcriptText = transcriptResult.text;
  } else if (transcriptResult?.jobId) {
    transcriptText = `[Batch job started: ${transcriptResult.jobId}]`;
  }

  return {
    title: metaResult.title || 'Unknown',
    description: metaResult.description || '',
    transcript: transcriptText,
    source: 'supadata',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: "Missing 'url' in request body" });
  }

  const videoId = extractVideoId(url);
  if (!videoId) {
    return res.status(400).json({ error: 'Could not extract YouTube video ID from URL' });
  }

  const apiKey = process.env.SUPADATA_API_KEY;

  // Try Supadata first if key is available
  if (apiKey) {
    try {
      const result = await trySupadata(url, apiKey);
      return res.json(result);
    } catch (err: any) {
      const msg = err?.message || '';
      // Fall through on quota/limit errors, not on auth errors
      if (msg.includes('Unauthorized') || msg.includes('unauthorized')) {
        console.error('Supadata auth error:', msg);
        // Fall through to free fallback
      } else if (msg.includes('Limit') || msg.includes('limit') || msg.includes('quota')) {
        console.warn('Supadata quota hit, falling back to free method');
        // Fall through to free fallback
      } else {
        console.error('Supadata error:', msg);
        // Fall through to free fallback anyway
      }
    }
  }

  // Free fallback: oEmbed for metadata + youtube-transcript for captions
  try {
    const [meta, transcript] = await Promise.allSettled([
      fetchMetadata(url),
      fetchTranscript(videoId),
    ]);

    const metaData = meta.status === 'fulfilled' ? meta.value : {
      title: `YouTube Video (${videoId})`,
      description: '',
      thumbnail: '',
      channel: '',
    };

    const transcriptText = transcript.status === 'fulfilled' ? transcript.value : 
      (transcript.status === 'rejected' ? `[Transcript unavailable: ${transcript.reason?.message}]` : '');

    return res.json({
      title: metaData.title,
      description: metaData.description,
      channel: metaData.channel,
      thumbnail: metaData.thumbnail,
      transcript: transcriptText,
      source: 'free',
    });
  } catch (err: any) {
    console.error('Free fallback also failed:', err);
    return res.status(500).json({
      error: err?.message || 'Failed to analyze video',
      videoId,
    });
  }
}
