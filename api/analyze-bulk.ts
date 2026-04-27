import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Supadata } from '@supadata/js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Missing 'urls' array in request body" });
  }

  const apiKey = process.env.SUPADATA_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server missing SUPADATA_API_KEY environment variable' });
  }

  const supadata = new Supadata({ apiKey });

  const results = await Promise.all(
    urls.map(async (url: string) => {
      try {
        const videoResult = await supadata.youtube.video({ id: url });
        const transcriptResult: any = await supadata.transcript({ url, text: true });

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

        return {
          url,
          success: true,
          title: videoResult.title,
          description: videoResult.description,
          transcript: transcriptText,
        };
      } catch (err: any) {
        return {
          url,
          success: false,
          error: err.message || 'Unknown error',
        };
      }
    })
  );

  return res.json({ results });
}
