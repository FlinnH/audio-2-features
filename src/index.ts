import { Hono } from "hono";

const app = new Hono<{ Bindings: CloudflareBindings }>();

app.get("/message", (c) => {
  return c.text("Hello Hono!");
});

// Handle audio file upload and processing
app.post("/upload", async (c) => {
  try {
    const formData = await c.req.formData();
    const audioFile = formData.get("audio") as File;
    
    if (!audioFile) {
      return c.json({ error: "No audio file provided" }, 400);
    }
    
    // Validate file type
    if (!audioFile.type.startsWith("audio/")) {
      return c.json({ error: "File must be an audio file" }, 400);
    }
    
    // Validate file size (max 25MB)
    const maxSize = 25 * 1024 * 1024; // 25MB
    if (audioFile.size > maxSize) {
      return c.json({ error: "File size must be less than 25MB" }, 400);
    }
    
    // Convert file to array buffer for processing
    const audioBuffer = await audioFile.arrayBuffer();
    
    // Optional storage: R2 and D1 (if bindings exist)
    const fileId = crypto.randomUUID();
    const safeName = audioFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `uploads/${fileId}-${safeName}`;

    let r2Stored = false;
    try {
      const r2 = (c.env as any).AUDIO_BUCKET;
      console.log("R2 binding available:", !!r2);
      if (r2 && typeof r2.put === "function") {
        console.log("Uploading to R2:", r2Key);
        await r2.put(r2Key, audioBuffer, {
          httpMetadata: { contentType: audioFile.type }
        });
        r2Stored = true;
        console.log("R2 upload successful");
      } else {
        console.log("R2 binding not available or missing put method");
      }
    } catch (e) {
      console.error("R2 put failed:", e);
    }

    let d1Inserted = false;
    let db = (c.env as any).audio2features;
    try {
      console.log("D1 binding available:", !!db);
      if (db && typeof db.prepare === "function") {
        console.log("Creating audio_files table if not exists");
        // Ensure table exists
        await db
          .prepare(
            `CREATE TABLE IF NOT EXISTS audio_files (
              id TEXT PRIMARY KEY,
              file_name TEXT NOT NULL,
              file_size INTEGER NOT NULL,
              file_type TEXT NOT NULL,
              r2_key TEXT,
              created_at TEXT NOT NULL
            )`
          )
          .run();

        console.log("Creating feature_requests table if not exists");
        // Ensure feature_requests table exists
        await ensureFeatureRequestsTable(db);

        console.log("Inserting metadata into D1");
        await db
          .prepare(
            `INSERT INTO audio_files (id, file_name, file_size, file_type, r2_key, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))`
          )
          .bind(fileId, audioFile.name, audioFile.size, audioFile.type, r2Stored ? r2Key : null)
          .run();
        d1Inserted = true;
        console.log("D1 insert successful");
      } else {
        console.log("D1 binding not available or missing prepare method");
      }
    } catch (e) {
      console.error("D1 insert failed:", e);
    }

    // Basic audio file analysis
    const audioInfo = {
      fileName: audioFile.name,
      fileSize: audioFile.size,
      fileType: audioFile.type,
      lastModified: audioFile.lastModified,
      duration: "Unknown", // Would need audio processing library to get actual duration
      sampleRate: "Unknown", // Would need audio processing library to get actual sample rate
      channels: "Unknown", // Would need audio processing library to get actual channels
      fileId,
      r2Key: r2Stored ? r2Key : undefined,
    };
    
    // Simulate AI processing (replace with actual AI model calls)
    const aiFeatures = await processAudioWithAI(audioBuffer, c.env.AI);
    
    // --- Store feature requests in D1 ---
    try {
      if (db && typeof db.prepare === "function" && aiFeatures.featureRequests && Array.isArray(aiFeatures.featureRequests.requests)) {
        await ensureFeatureRequestsTable(db);
        const summary = aiFeatures.featureRequests.summary || null;
        const requests = aiFeatures.featureRequests.requests || [];
        // Filter out parse error and fallback requests
        const actionableRequests = requests.filter(
          (req: any) => req.title &&
            !req.title.toLowerCase().includes('parse error') &&
            !req.title.toLowerCase().includes('fallback')
        );
        if (actionableRequests.length > 0) {
          for (const req of actionableRequests) {
            await db.prepare(
              `INSERT INTO feature_requests (
                id, audio_file_id, title, description, priority, category, confidence, potential_recommendation, summary, created_at
              ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, datetime('now'))`
            ).bind(
              crypto.randomUUID(),
              fileId,
              req.title || '',
              req.description || '',
              req.priority || null,
              req.category || null,
              req.confidence ?? null,
              typeof req.potentialRecommendation === 'string' ? req.potentialRecommendation : (Array.isArray(req.potentialRecommendation) ? JSON.stringify(req.potentialRecommendation) : null),
              summary
            ).run();
          }
        } else {
          // No actionable feature requests, store the summary for traceability
          await db.prepare(
            `INSERT INTO feature_requests (
              id, audio_file_id, title, description, priority, category, confidence, potential_recommendation, summary, created_at
            ) VALUES (?1, ?2, NULL, NULL, NULL, NULL, NULL, NULL, ?3, datetime('now'))`
          ).bind(
            crypto.randomUUID(),
            fileId,
            summary
          ).run();
        }
      }
    } catch (e) {
      console.error("Feature requests insert failed:", e);
    }
    
    return c.json({
      success: true,
      audioInfo,
      aiFeatures,
      message: "Audio processed successfully"
    });
    
  } catch (error) {
    console.error("Error processing audio:", error);
    return c.json({ 
      error: "Failed to process audio file",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// Extract feature requests from transcription using LLM
app.post("/extract-features", async (c) => {
  try {
    const body = await c.req.json();
    const transcription = body.transcription;
    
    if (!transcription) {
      return c.json({ error: "No transcription provided" }, 400);
    }
    
    const featureRequests = await extractFeatureRequests(transcription, c.env.AI);
    
    return c.json({
      success: true,
      featureRequests,
      message: "Feature requests extracted successfully"
    });
    
  } catch (error) {
    console.error("Error extracting features:", error);
    return c.json({ 
      error: "Failed to extract feature requests",
      details: error instanceof Error ? error.message : "Unknown error"
    }, 500);
  }
});

// --- D1 Table Creation for Feature Requests ---
async function ensureFeatureRequestsTable(db: any) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS feature_requests (
    id TEXT PRIMARY KEY,
    audio_file_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT,
    category TEXT,
    confidence REAL,
    potential_recommendation TEXT,
    summary TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (audio_file_id) REFERENCES audio_files(id)
  )`).run();
}

// Simulate AI processing function
async function processAudioWithAI(audioBuffer: ArrayBuffer, ai: any) {
  // Prefer real transcription via Workers AI Whisper Tiny, fallback to mock if unavailable
  const modelId = "@cf/openai/whisper-tiny-en";
  try {
    if (!ai) {
      throw new Error("AI binding not available");
    }

    // Convert ArrayBuffer to a JSON-serializable array of bytes
    const uint8 = new Uint8Array(audioBuffer);
    const startedAt = Date.now();
    const result: any = await ai.run(modelId, {
      audio: [...uint8]
    });

    const processingMs = Date.now() - startedAt;
    const transcriptionText = result?.text || result?.transcription || "";

    // Extract feature requests from transcription
    const featureRequests = await extractFeatureRequests(transcriptionText, ai);

    // Minimal, real output structure
    return {
      transcription: transcriptionText,
      language: result?.language ? { detected: result.language, confidence: result?.language_confidence ?? undefined } : undefined,
      processingTimeMs: processingMs,
      model: modelId,
      featureRequests
    };
  } catch (err) {
    // Fallback mock to keep the UI working during development
    await new Promise(resolve => setTimeout(resolve, 500));
    return {
      transcription: "[mock] This is a mock transcription. Workers AI call failed or is not configured yet.",
      language: {
        detected: "en",
        confidence: 0.9
      },
      processingTimeMs: 500,
      model: modelId,
      featureRequests: {
        requests: [
          {
            id: "mock-1",
            title: "[Mock] Feature Request Example",
            description: "This is a mock feature request extracted from the transcription.",
            priority: "medium",
            category: "enhancement",
            confidence: 0.8,
            potentialRecommendation: "• Implement user feedback collection system\n• Add feature request tracking dashboard"
          }
        ],
        extractionTimeMs: 500,
        model: "@cf/mistral/mistral-7b-instruct-v0.2-lora",
        error: err instanceof Error ? err.message : "Unknown error"
      },
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}

// Extract feature requests using Cloudflare Workers AI
async function extractFeatureRequests(transcription: string, ai: any) {
  const modelId = "@cf/mistral/mistral-7b-instruct-v0.2-lora"; 
  
  try {
    if (!ai) {
      throw new Error("AI binding not available");
    }

    const prompt = `You are a developer for first responders analyzing user feedback from audio transcriptions. Extract feature requests from the following transcription and format them as structured data.

TRANSCRIPTION:
"${transcription}"

Please analyze this transcription and extract any feature requests, suggestions, or product improvements mentioned. For each feature request, provide:
1. A clear, concise title
2. A detailed description of what the user is addressing
3. Priority level (high/medium/low)
4. Category (enhancement/bug-fix/new-feature/improvement)
5. Confidence score (0.0-1.0)
6. Potential recommendation: 1-2 possible solutions nicely formatted (could be bullet points)

Format your response as a JSON object with this structure:
{
  "requests": [
    {
      "id": "unique-id",
      "title": "Feature request title",
      "description": "Detailed description",
      "priority": "high|medium|low",
      "category": "enhancement|bug-fix|new-feature|improvement",
      "confidence": 0.8,
      "potentialRecommendation": "1-2 possible solutions nicely formatted (could be bullet points)"
    }
  ],
  "summary": "Brief summary of all extracted requests"
}

If no clear feature requests are found, return an empty requests array but still provide a summary of the transcription content.`;

    const startedAt = Date.now();
    const result: any = await ai.run(modelId, {
      messages: [
        {
          role: "system",
          content: "You are a developer manager for first responders who extracts actionable feature requests from user feedback. Always respond with valid JSON."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      max_tokens: 900,
      temperature: 0.2
    });
    // // Error handling
    // console.log("Raw AI response:", result);
    // const responseText = result.response || result.text || "";
    // console.log("Raw response text:", responseText);


    const processingMs = Date.now() - startedAt;
    
    // Parse the AI response
    let parsedResult;
    try {
      // Extract JSON from the response
      const responseText = result.response || result.text || "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No valid JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback response structure
      parsedResult = {
        requests: [
          {
            id: "parse-error-1",
            title: "Unable to parse AI response",
            description: "The AI model returned a response that couldn't be parsed as structured feature requests.",
            priority: "low",
            category: "improvement",
            confidence: 0.1,
            potentialRecommendation: "• Check AI model configuration\n• Implement better error handling"
          }
        ],
        summary: "Error in processing AI response"
      };
    }

    return {
      ...parsedResult,
      extractionTimeMs: processingMs,
      model: modelId,
      originalTranscription: transcription
    };

  } catch (err) {
    console.error("Feature extraction failed:", err);
    
    // Fallback mock response
    await new Promise(resolve => setTimeout(resolve, 300));
    return {
      requests: [
        {
          id: "fallback-1",
          title: "[Fallback] Feature extraction failed",
          description: "The AI model failed to process the transcription. This could be due to network issues, model unavailability, or configuration problems.",
          priority: "medium",
          category: "improvement", 
          confidence: 0.3,
          potentialRecommendation: "• Verify Cloudflare Workers AI configuration\n• Check network connectivity and model availability"
        }
      ],
      summary: "Feature extraction failed - using fallback response",
      extractionTimeMs: 300,
      model: modelId,
      error: err instanceof Error ? err.message : "Unknown error"
    };
  }
}

// --- Endpoint to fetch feature requests for an audio file ---
app.get("/audio/:id/feature-requests", async (c) => {
  const audioId = c.req.param("id");
  const db = (c.env as any).audio2features;
  try {
    if (db && typeof db.prepare === "function") {
      await ensureFeatureRequestsTable(db);
      const { results } = await db.prepare(
        `SELECT * FROM feature_requests WHERE audio_file_id = ?1`
      ).bind(audioId).all();
      return c.json({ success: true, featureRequests: results });
    } else {
      return c.json({ error: "D1 binding not available" }, 500);
    }
  } catch (e) {
    return c.json({ error: "Failed to fetch feature requests", details: e instanceof Error ? e.message : String(e) }, 500);
  }
});

export default app;
