# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Development workflow
- `npm install` - Install dependencies
- `npm run dev` - Start local development server using Wrangler
- `npm run deploy` - Deploy to Cloudflare Workers with minification
- `npm run cf-typegen` - Generate/sync TypeScript types from Worker configuration

### Type generation
After making changes to the Wrangler configuration or Cloudflare bindings, run `npm run cf-typegen` to update the `worker-configuration.d.ts` file with the latest type definitions.

## Architecture

This is a Cloudflare Workers project built with the Hono web framework for handling HTTP requests.

### Project Structure
- `src/index.ts` - Main application entry point with Hono app configuration
- `wrangler.jsonc` - Cloudflare Workers configuration with assets binding
- `worker-configuration.d.ts` - Generated TypeScript types for Cloudflare bindings (auto-generated)
- `public/` - Static assets served through Cloudflare Workers Assets binding

### Framework and Runtime
- **Hono**: Lightweight web framework designed for edge computing
- **Cloudflare Workers**: Serverless runtime environment
- **TypeScript**: Configured with strict mode and ESNext target

### Key Configuration
- The Hono app is instantiated with `CloudflareBindings` generic type for proper TypeScript support
- Assets are bound through the `ASSETS` binding defined in `wrangler.jsonc`
- Static files in `public/` directory are automatically served via the assets binding
- Observability is enabled for monitoring and debugging

### Current Implementation
The app currently has a single `/message` endpoint that returns "Hello Hono!" and a basic HTML frontend that fetches and displays this message.