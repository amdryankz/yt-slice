# ✂️ Clipper - AI Video Podcasting & Clipping Tool

Clipper is an advanced, AI-powered web application that automates the extraction and creation of viral short-form video clips from long-form YouTube podcasts. 

Powered by Google Gemini for intelligent semantic chunking and Deepgram for lightning-fast transcriptions, Clipper analyzes hours of video, finds the most engaging moments, and automatically burns dynamic, TikTok-style karaoke subtitles into the video.

## 🚀 Features

- **Full Video Downloading**: Instantly downloads high-quality segments from YouTube via `yt-dlp`.
- **AI Transcription**: High-accuracy Indonesian speech-to-text powered by Deepgram Nova-2.
- **Smart Chunking**: Uses Google Gemini to find viral hooks, summarize content, and pinpoint the best moments.
- **Dynamic Subtitles**: Automatically burns viral, "Hormozi-style" bold highlighted subtitles using FFmpeg and libass.
- **Cloud Storage**: Securely uploads finished clips to Cloudflare R2 (S3 compatible) and streams them via secure signed URLs.
- **Asynchronous Processing**: Robust background job queue powered by Redis and BullMQ.

## 🛠 Tech Stack

- **Runtime & Package Manager**: [Bun](https://bun.sh/)
- **Monorepo**: Turborepo
- **Frontend**: Next.js 15 (App Router), TailwindCSS, shadcn/ui
- **Backend Worker**: TypeScript, BullMQ
- **Database**: PostgreSQL with Drizzle ORM
- **Queue**: Redis
- **Video Processing**: FFmpeg & yt-dlp
- **AI APIs**: Google Gemini & Deepgram

## 📁 Project Structure

This project is a Turborepo monorepo:

- `apps/web`: The Next.js frontend application.
- `apps/worker`: The background Node.js/Bun worker that processes video downloads, transcription, AI chunking, and FFmpeg rendering.
- `packages/db`: Shared PostgreSQL database schema and Drizzle client.
- `packages/jobs`: Shared BullMQ queue definitions.
- `packages/ui`: Shared shadcn/ui components.

## ⚙️ Prerequisites

To run this project locally or on a server, you must have the following installed on your system:
- [Bun](https://bun.sh/) (v1.x)
- [PostgreSQL](https://www.postgresql.org/)
- [Redis](https://redis.io/)
- [FFmpeg](https://ffmpeg.org/) (Ensure it's available in your system PATH)
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) (Ensure it's available in your system PATH)

## 💻 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/your-username/clipper.git
cd clipper
```

### 2. Install dependencies
```bash
bun install
```

### 3. Setup Environment Variables
Copy the example environment file and fill in your actual API keys and database credentials.
```bash
cp .env.example .env
```

### 4. Setup Database
Ensure your PostgreSQL server is running, then run the database migrations:
```bash
bun run migrate
```

### 5. Start the Development Server
This single command will spin up the Turborepo pipeline, starting both the Next.js web app and the background worker concurrently.
```bash
bun run dev
```

The web application will be available at [http://localhost:3000](http://localhost:3000).

## 🚀 Deployment

For a detailed step-by-step guide on how to deploy this application to a VPS (Ubuntu) using PM2 and Nginx, please refer to the `vps_deployment_guide.md` file (if available in your documentation artifacts).
