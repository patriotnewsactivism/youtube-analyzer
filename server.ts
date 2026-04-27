import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Supadata } from "@supadata/js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: analyze-video
  app.post("/api/analyze-video", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: "Missing 'url' in request body" });
      }

      const apiKey = process.env.SUPADATA_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Server missing SUPADATA_API_KEY environment variable" });
      }

      const supadata = new Supadata({ apiKey });

      // Fetch video metadata
      const videoResult = await supadata.youtube.video({ id: url });
      
      // Fetch transcript
      const transcriptResult: any = await supadata.transcript({ 
        url, 
        text: true 
      });

      // Simple handling in case it gives a direct string or object
      let transcriptText = "";
      if (transcriptResult && transcriptResult.jobId) {
        transcriptText = "This video requires batch processing (jobId: " + transcriptResult.jobId + ") which is not covered in this quick app.";
      } else if (typeof transcriptResult === "string") {
        transcriptText = transcriptResult;
      } else if (transcriptResult && transcriptResult.content) {
        transcriptText = transcriptResult.content;
      } else if (transcriptResult && transcriptResult.text) {
        transcriptText = transcriptResult.text;
      } else {
        transcriptText = JSON.stringify(transcriptResult);
      }

      res.json({
        title: videoResult.title,
        description: videoResult.description,
        transcript: transcriptText
      });
    } catch (err: any) {
      console.error("Error analyzing video:", err);
      res.status(500).json({ 
        error: err.message || "Unknown error occurred while fetching video info" 
      });
    }
  });

  // API Route: analyze-bulk
  app.post("/api/analyze-bulk", async (req, res) => {
    try {
      const { urls } = req.body;
      if (!urls || !Array.isArray(urls)) {
        return res.status(400).json({ error: "Missing 'urls' array in request body" });
      }

      const apiKey = process.env.SUPADATA_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "Server missing SUPADATA_API_KEY environment variable" });
      }

      const supadata = new Supadata({ apiKey });

      const results = await Promise.all(urls.map(async (url) => {
        try {
          // Fetch video metadata
          const videoResult = await supadata.youtube.video({ id: url });
          
          // Fetch transcript
          const transcriptResult: any = await supadata.transcript({ 
            url, 
            text: true 
          });

          let transcriptText = "";
          if (transcriptResult && transcriptResult.jobId) {
            transcriptText = "This video requires batch processing (jobId: " + transcriptResult.jobId + ") which is not covered in this quick app.";
          } else if (typeof transcriptResult === "string") {
            transcriptText = transcriptResult;
          } else if (transcriptResult && transcriptResult.content) {
            transcriptText = transcriptResult.content;
          } else if (transcriptResult && transcriptResult.text) {
            transcriptText = transcriptResult.text;
          } else {
            transcriptText = JSON.stringify(transcriptResult);
          }

          return {
            url,
            success: true,
            title: videoResult.title,
            description: videoResult.description,
            transcript: transcriptText
          };
        } catch (err: any) {
          console.error(`Error analyzing video ${url}:`, err);
          return {
            url,
            success: false,
            error: err.message || "Unknown error"
          };
        }
      }));

      res.json({ results });
    } catch (err: any) {
      console.error("Error analyzing bulk:", err);
      res.status(500).json({ 
        error: err.message || "Unknown error occurred while processing bulk" 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
