# Audio-2-Features Developer Documentation

## Project Overview

**Audio-2-Features** is a Cloudflare Workers application that transforms audio recordings into structured feature requests using AI. The system transcribes audio files, extracts actionable feature requests using large language models, and stores both the audio files and extracted data in Cloudflare's infrastructure.

### Key Features

- 🎤 **Audio Upload & Processing**: Accept audio files up to 25MB
- 🤖 **AI-Powered Transcription**: Automatic speech-to-text using Cloudflare Workers AI (Whisper)
- 📝 **Feature Request Extraction**: Intelligent parsing of transcriptions into structured feature requests
- 💾 **Persistent Storage**: Audio files stored in R2, metadata in D1 database
- 🎨 **Modern UI**: Interactive web interface with real-time progress indicators
- ⚡ **Edge Computing**: Low-latency processing at Cloudflare's edge

---

## Architecture

### Technology Stack

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (HTML/JS)                    │
│  - Drag & drop upload                                   │
│  - Real-time progress tracking                          │
│  - Feature request visualization                        │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              Cloudflare Workers (Hono)                   │
│  - POST /upload: Audio processing endpoint              │
│  - POST /extract-features: Feature extraction           │
│  - GET /audio/:id/feature-requests: Retrieve data       │
└─────────┬───────────────┬───────────────┬───────────────┘
          │               │               │
          ▼               ▼               ▼
    ┌─────────┐    ┌──────────┐    ┌──────────┐
    │ R2      │    │ D1       │    │ Workers  │
    │ Storage │    │ Database │    │ AI       │
    └─────────┘    └──────────┘    └──────────┘
```

### Data Flow

1. **Upload Phase**
   - User uploads audio file via web interface
   - File validated (type, size)
   - Assigned unique UUID

2. **Storage Phase**
   - Audio stored in R2 bucket
   - Metadata stored in D1 `audio_files` table

3. **AI Processing Phase**
   - Audio transcribed using Whisper-tiny (*customizable*) model
   - Transcription analyzed using Mistral (*customizable*) LLM
   - Feature requests extracted and structured

4. **Persistence Phase**
   - Feature requests stored in D1 `feature_requests` table
   - Linked to original audio file via foreign key

---

## Setup & Installation

### Prerequisites

- Node.js (v18+)
- npm
- Cloudflare account
- Wrangler CLI (`npm install -g wrangler`)

### Environment Setup

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Cloudflare Authentication**
   ```bash
   wrangler login
   ```

3. **Create Resources**

   **R2 Bucket:**
   ```bash
   wrangler r2 bucket create audio-uploads
   ```

   **D1 Database:**
   ```bash
   wrangler d1 create audio2features
   ```

4. **Update Configuration**
   
   Edit `wrangler.jsonc` with your resource IDs:
   ```jsonc
   {
     "account_id": "YOUR_ACCOUNT_ID",
     "d1_databases": [{
       "database_id": "YOUR_D1_DATABASE_ID"
     }]
   }
   ```

5. **Initialize Database Schema**
   ```bash
   wrangler d1 execute audio2features --remote --file=./schema.sql
   ```

   Create `schema.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS audio_files (
     id TEXT PRIMARY KEY,
     file_name TEXT NOT NULL,
     file_size INTEGER NOT NULL,
     file_type TEXT NOT NULL,
     r2_key TEXT,
     created_at TEXT NOT NULL
   );

   CREATE TABLE IF NOT EXISTS feature_requests (
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
   );
   ```

---

## Development

### Local Development

```bash
npm run dev
```

Access at: `http://localhost:8787`

### Project Structure

```
audio-2-features/
├── src/
│   └── index.ts          # Main Worker logic
├── public/
│   └── index.html        # Frontend interface
├── wrangler.jsonc        # Cloudflare configuration
├── package.json
├── tsconfig.json
└── worker-configuration.d.ts  # Auto-generated types
```

### Key Files

#### `src/index.ts`

**Main Endpoints:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/upload` | POST | Upload and process audio files |
| `/extract-features` | POST | Extract features from transcription |
| `/audio/:id/feature-requests` | GET | Retrieve stored feature requests |

**Core Functions:**

```typescript
// Process audio with Workers AI
async function processAudioWithAI(
  audioBuffer: ArrayBuffer, 
  ai: any
): Promise<AiFeatures>

// Extract structured feature requests
async function extractFeatureRequests(
  transcription: string, 
  ai: any
): Promise<FeatureRequests>
```

#### `public/index.html`

**Features:**
- Drag-and-drop file upload
- Real-time progress display
- Animated starfield background
- Responsive feature request cards

---

## API Reference

### POST `/upload`

Upload an audio file for processing.

**Request:**
- Content-Type: `multipart/form-data`
- Body: FormData with `audio` field

**Response:**
```typescript
{
  success: true,
  audioInfo: {
    fileName: string,
    fileSize: number,
    fileType: string,
    fileId: string,
    r2Key?: string
  },
  aiFeatures: {
    transcription: string,
    language: { detected: string, confidence: number },
    processingTimeMs: number,
    model: string,
    featureRequests: {
      requests: FeatureRequest[],
      summary: string,
      extractionTimeMs: number,
      model: string
    }
  }
}
```

**Feature Request Structure:**
```typescript
interface FeatureRequest {
  id: string,
  title: string,
  description: string,
  priority: "high" | "medium" | "low",
  category: "enhancement" | "bug-fix" | "new-feature" | "improvement",
  confidence: number,  // 0.0 - 1.0
  potentialRecommendation: string
}
```

**Error Responses:**
- `400`: No file provided / Invalid file type / File too large
- `500`: Processing error

### POST `/extract-features`

Extract features from existing transcription.

**Request:**
```json
{
  "transcription": "string"
}
```

**Response:**
```typescript
{
  success: true,
  featureRequests: {
    requests: FeatureRequest[],
    summary: string,
    extractionTimeMs: number,
    model: string
  }
}
```

### GET `/audio/:id/feature-requests`

Retrieve feature requests for a specific audio file.

**Response:**
```typescript
{
  success: true,
  featureRequests: FeatureRequest[]
}
```

---

## AI Models Used *(Customizeable)*

### Whisper Tiny EN
- **Model ID**: `@cf/openai/whisper-tiny-en`
- **Purpose**: Speech-to-text transcription
- **Input**: Audio bytes (8-bit unsigned integers)
- **Output**: Text transcription with word timestamps

### Mistral 7B Instruct
- **Model ID**: `@cf/mistral/mistral-7b-instruct-v0.2-lora`
- **Purpose**: Feature request extraction
- **Temperature**: 0.2 (low randomness for consistency)
- **Max Tokens**: 900
- **Prompt**: Structured to extract feature requests from first responder feedback

---

## Database Schema

### `audio_files` Table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID for the audio file |
| file_name | TEXT | Original filename |
| file_size | INTEGER | Size in bytes |
| file_type | TEXT | MIME type |
| r2_key | TEXT | R2 storage key |
| created_at | TEXT | ISO 8601 timestamp |

### `feature_requests` Table

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT (PK) | UUID for the feature request |
| audio_file_id | TEXT (FK) | Reference to audio_files |
| title | TEXT | Feature request title |
| description | TEXT | Detailed description |
| priority | TEXT | high/medium/low |
| category | TEXT | Type of request |
| confidence | REAL | AI confidence score (0-1) |
| potential_recommendation | TEXT | Suggested solutions (AI-gen) |
| summary | TEXT | Overall summary |
| created_at | TEXT | ISO 8601 timestamp |

---

## Deployment

### Deploy to Production

```bash
npm run deploy
```

### Deployment Checklist

- [ ] Update `account_id` in `wrangler.jsonc`
- [ ] Create production R2 bucket
- [ ] Create production D1 database
- [ ] Run schema migrations
- [ ] Update database bindings
- [ ] Test upload functionality
- [ ] Test feature extraction
- [ ] Verify R2 storage
- [ ] Check D1 data persistence

### Post-Deployment

```bash
# View logs
wrangler tail

# Check deployment status
wrangler deployments list

# Test endpoint
curl -X POST https://audio-2-features.YOUR_SUBDOMAIN.workers.dev/upload \
  -F "audio=@test-audio.mp3"
```

---

## Configuration

### File Size Limits

Default: **25MB** maximum

Modify in `src/index.ts`:
```typescript
const maxSize = 25 * 1024 * 1024; // 25MB
```

### Supported Audio Formats

- MP3
- WAV
- M4A
- OGG
- FLAC
- Any format with MIME type `audio/*`

### AI Model Configuration 
*Customizable according to **Cloudflare's account model's choice + rate limit***

**Whisper Tiny Model (ASR):**
```typescript
const modelId = "@cf/openai/whisper-tiny-en";
```

**Feature Extraction Model (Text Generation):**
```typescript
const modelId = "@cf/mistral/mistral-7b-instruct-v0.2-lora";
```

---

## Troubleshooting

### Common Issues

**1. "AI binding not available"**
- Ensure Workers AI is enabled in your Cloudflare account
- Verify `ai` binding in `wrangler.jsonc`
- Check account has AI Workers quota

**2. "R2 put failed"**
- Verify R2 bucket exists
- Check bucket name matches binding
- Ensure account has R2 permissions

**3. "D1 insert failed"**
- Run database migrations
- Verify table schema
- Check database binding configuration

**4. "Feature extraction returns empty results"**
- Review transcription quality
- Check AI model token limits
- Verify prompt engineering

### Debug Mode

Enable verbose logging:
```typescript
console.log("Raw AI response:", result);
console.log("Backend response:", data);
```

---

## Performance Optimization

### Best Practices

1. **Audio Preprocessing**
   - Compress audio before upload
   - Use appropriate sample rates (16kHz recommended)
   - Trim silence from recordings


2. **Error Handling**
   - Implement retry logic for AI failures
   - Provide fallback responses
   - Log errors for debugging

---

## Security Considerations

### Input Validation

```typescript
// Validate file type
if (!audioFile.type.startsWith("audio/")) {
  return c.json({ error: "File must be an audio file" }, 400);
}

// Validate file size
if (audioFile.size > maxSize) {
  return c.json({ error: "File size must be less than 25MB" }, 400);
}
```

### Data Privacy

- Audio files stored in private R2 bucket
- No audio data shared with external services
- Transcriptions processed on Cloudflare infrastructure
- Consider adding authentication for production use

### Rate Limiting

Implement rate limiting for abuse prevention:
```typescript
// Example using Cloudflare Workers rate limiting
const { success } = await env.RATE_LIMITER.limit({ key: clientId });
if (!success) {
  return new Response("Too many requests", { status: 429 });
}
```

---

## Potential Future Enhancements

### Planned Features

- [ ] User authentication (Cloudflare Access)
- [ ] Bulk audio processing
- [ ] Export feature requests (JSON, CSV)
- [ ] Audio playback in UI
- [ ] Search and filter feature requests
- [ ] Priority queue for processing
- [ ] WebSocket for real-time updates
- [ ] Multi-language support
- [ ] Custom AI model training
- [ ] Analytics dashboard

### Integration Ideas

- Jira/Linear ticket creation
- Email notifications
- GitHub Issues integration
- CSV export for spreadsheets

---

## Contributing

### Development Workflow

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Make changes and test locally
4. Commit changes (`git commit -m 'Add amazing feature'`)
5. Push to branch (`git push origin feature/amazing-feature`)
6. Open Pull Request

### Code Style

- Use TypeScript strict mode
- Follow Hono framework patterns
- Add JSDoc comments for functions
- Handle errors gracefully
- Write descriptive commit messages

---

## Resources

### Documentation

- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Workers AI](https://developers.cloudflare.com/workers-ai/)
- [R2 Storage](https://developers.cloudflare.com/r2/)
- [D1 Database](https://developers.cloudflare.com/d1/)
- [Hono Framework](https://hono.dev/)

### Support

- **GitHub Issues**: Report bugs and request features
- **Cloudflare Community**: https://community.cloudflare.com/

---

## License

This project is part of an academic semester project. Please respect academic integrity policies when using or referencing this work.

---

## Acknowledgments

Built with:
- **Cloudflare Workers** - Edge computing platform
- **Hono** - Lightweight web framework
- **Workers AI** - AI inference at the edge
- **OpenAI Whisper** - Speech recognition (`tiny` for cost saving)
- **Mistral AI** - Language understanding(`beta` for cost saving)

---

**Last Updated**: November 2025  
**Version**: 1.0.0  
**Maintainer**: Flynn Huynh