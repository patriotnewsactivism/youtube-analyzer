import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Supadata } from '@supadata/js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "Missing 'url' in request body" });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing SUPADATA_API_KEY environment variable' });
  }

  const supadata = new Supadata({ apiKey });

  try {
    // Correct SDK methods per Supadata docs
    const [metaResult, transcriptResult]: [any, any] = await Promise.all([
      supadata.metadata({ url }),
      supadata.transcript({ url, text: true }),
    ]);

    let transcriptText = '';
    if (transcriptResult?.jobId) {
      transcriptText = `This video requires batch processing (jobId: ${transcriptResult.jobId}).`;
    } else if (typeof transcriptResult === 'string') {
      transcriptText = transcriptResult;
    } else if (transcriptResult?.content) {
      transcriptText = transcriptResult.content;
    } else if (transcriptResult?.text) {
      transcriptText = transcriptResult.text;
    } else {
      transcriptText = JSON.stringify(transcriptResult);
    }

    return res.json({
      title: metaResult.title,
      description: metaResult.description,
      transcript: transcriptText,
    });
  } catch (err: any) {
    console.error('Error analyzing video:', err);
    return res.status(500).json({ error: err.message || 'Unknown error occurred' });
  }
}
