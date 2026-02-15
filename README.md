# Audio-2-Features Developer Documentation
*Note: This README.md is an excerpt from the **[DEVELOPER DOCUMENT](/developer_doc.md/)**, which contains more specific details regarding **developing** and **setting up** as well*

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
**Creator / Owner**: Flynn Huynh
