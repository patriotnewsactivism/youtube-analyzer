import type { VercelRequest, VercelResponse } from '@vercel/node';

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

async function fetchTranscript(videoId: string): Promise<string> {
  const { YoutubeTranscript } = await import('youtube-transcript');
  const segments = await YoutubeTranscript.fetchTranscript(videoId);
  if (!segments || segments.length === 0) return '';
  return segments.map((s: any) => s.text).join(' ');
}

async function trySupadata(url: string, apiKey: string) {
  const { Supadata } = await import('@supadata/js');
  const supadata = new Supadata({ apiKey });
  const [metaResult, transcriptResult]: [any, any] = await Promise.all([
    supadata.metadata({ url }),
    supadata.transcript({ url, text: true }),
  ]);
  let transcriptText = '';
  if (typeof transcriptResult === 'string') transcriptText = transcriptResult;
  else if (transcriptResult?.content) transcriptText = transcriptResult.content;
  else if (transcriptResult?.text) transcriptText = transcriptResult.text;
  else if (transcriptResult?.jobId) transcriptText = `[Batch job: ${transcriptResult.jobId}]`;
  return { title: metaResult.title || 'Unknown', description: metaResult.description || '', transcript: transcriptText, source: 'supadata' };
}

async function analyzeOne(url: string, apiKey: string | undefined) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Invalid YouTube URL');

  if (apiKey) {
    try {
      return await trySupadata(url, apiKey);
    } catch (err: any) {
      console.warn(`Supadata failed for ${videoId}, falling back:`, err?.message);
    }
  }

  // Free fallback
  const [meta, transcript] = await Promise.allSettled([
    fetchMetadata(url),
    fetchTranscript(videoId),
  ]);

  const metaData = meta.status === 'fulfilled' ? meta.value : {
    title: `YouTube Video (${videoId})`, description: '', thumbnail: '', channel: '',
  };
  const transcriptText = transcript.status === 'fulfilled' ? transcript.value :
    (transcript.status === 'rejected' ? `[Transcript unavailable: ${(transcript as any).reason?.message}]` : '');

  return {
    title: metaData.title,
    description: metaData.description,
    channel: metaData.channel,
    thumbnail: metaData.thumbnail,
    transcript: transcriptText,
    source: 'free',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body || {};
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Missing 'urls' array in request body" });
  }

  const apiKey = process.env.SUPADATA_API_KEY;

  const results = await Promise.all(
    urls.map(async (url: string) => {
      try {
        const data = await analyzeOne(url, apiKey);
        return { url, success: true, ...data };
      } catch (err: any) {
        return { url, success: false, error: err?.message || 'Unknown error' };
      }
    })
  );

  return res.json({ results });
}
