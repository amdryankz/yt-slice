"use client";

import { useState, useRef } from "react";
import ReactPlayer from "react-player";
import Link from "next/link";
import { ArrowLeft, Trash2, Loader2 } from "lucide-react";
import ClipCard from "./ClipCard";

export default function PodcastDetailClient({ podcast, generatedClips }: { podcast: any, generatedClips: any[] }) {
  const playerRef = useRef<ReactPlayer>(null);
  const [playedSeconds, setPlayedSeconds] = useState(0);
  const [localClips, setLocalClips] = useState(generatedClips);
  const [isAdding, setIsAdding] = useState(false);
  const [isDeletingPodcast, setIsDeletingPodcast] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [previewEndTime, setPreviewEndTime] = useState<number | null>(null);

  function handlePreviewClip(start: number, end: number) {
    if (playerRef.current) {
      const player = playerRef.current as any;
      if (typeof player.seekTo === 'function') {
        player.seekTo(start, 'seconds');
      } else if (player.getInternalPlayer && player.getInternalPlayer()) {
        player.getInternalPlayer().currentTime = start;
      } else {
        player.currentTime = start;
      }
      
      setIsPlaying(true);
      setPreviewEndTime(end);
      document.getElementById('master-player')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function handleDeletePodcast() {
    if (!confirm("Yakin ingin menghapus podcast ini beserta semua klipnya? Tindakan ini tidak dapat dibatalkan.")) return;
    setIsDeletingPodcast(true);
    try {
      const res = await fetch(`/api/podcasts/${podcast.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete podcast');
      window.location.href = '/';
    } catch (error) {
      console.error(error);
      alert('Gagal menghapus podcast');
      setIsDeletingPodcast(false);
    }
  }

  async function handleAddManualClip() {
    setIsAdding(true);
    try {
      const start = Math.floor(playedSeconds);
      const end = start + 60; // default 60 seconds

      const res = await fetch(`/api/podcasts/${podcast.id}/clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime: start, endTime: end }),
      });

      if (!res.ok) throw new Error('Failed to add clip');
      const data = await res.json();
      
      // Append new clip to the end of the list
      setLocalClips((prev) => [...prev, data.clip]);
      
      // Scroll smoothly to bottom to see new clip
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error(error);
      alert('Gagal menambahkan klip manual');
    } finally {
      setIsAdding(false);
    }
  }
  const totalProcessing = localClips.filter(c => c.status === 'processing').length;
  const totalCompleted = localClips.filter(c => c.status === 'completed').length;
  const totalClips = localClips.length;
  const progressPercentage = totalClips > 0 ? (totalCompleted / totalClips) * 100 : 0;

  return (
    <main className="max-w-7xl mx-auto relative z-10 pt-8">
      <Link href="/" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors mb-6 font-medium">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </Link>
      
      <div className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-100 tracking-tight">{podcast.title}</h1>
          <div className="flex items-center gap-3 mt-4">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
              podcast.status === 'completed' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : podcast.status === 'processing'
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
            }`}>
              {podcast.status.toUpperCase()}
            </span>
            <span className="text-slate-400 text-sm font-medium">
              Added on {new Date(podcast.createdAt).toLocaleDateString()}
            </span>
          </div>
        </div>
        
        <button 
          onClick={handleDeletePodcast}
          disabled={isDeletingPodcast}
          className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 rounded-xl font-semibold transition-colors disabled:opacity-50"
        >
          {isDeletingPodcast ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Hapus Podcast
        </button>
      </div>

      <div className="flex flex-col gap-10">
        {/* Queue Status Board */}
        <div className="bg-slate-900/50 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-slate-200">Render Queue Status</h3>
            {totalProcessing > 0 ? (
              <span className="text-sm font-semibold text-amber-400 animate-pulse bg-amber-400/10 px-3 py-1 rounded-full border border-amber-400/20">
                Processing {totalProcessing} clips...
              </span>
            ) : totalProcessing === 0 && totalCompleted > 0 ? (
              <span className="text-sm font-semibold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20">
                All requested clips rendered successfully!
              </span>
            ) : (
              <span className="text-sm font-medium text-slate-500">
                Ready to render clips
              </span>
            )}
          </div>
          
          <div className="w-full bg-slate-800 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full transition-all duration-500 shadow-lg shadow-purple-500/50"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-3 text-xs font-medium text-slate-400">
            <span>{Math.round(progressPercentage)}% Complete</span>
            <span>{totalCompleted} / {totalClips} Rendered</span>
          </div>
        </div>

        {/* Video Source (Top) */}
        <div 
          id="master-player" 
          className="flex flex-col gap-5 max-w-4xl mx-auto w-full"
        >
          <div className="aspect-video w-full rounded-3xl overflow-hidden bg-black shadow-2xl border border-white/10 relative">
            <ReactPlayer 
              ref={playerRef}
              src={podcast.sourceUrl} 
              width="100%" 
              height="100%" 
              controls 
              playing={isPlaying}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={(e: React.SyntheticEvent<HTMLVideoElement>) => {
                const current = e.currentTarget.currentTime;
                setPlayedSeconds(current);
                if (previewEndTime !== null && current >= previewEndTime) {
                  setIsPlaying(false);
                  setPreviewEndTime(null);
                }
              }}
            />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-slate-400 text-center font-mono">
            Current Playback: {Math.floor(playedSeconds / 60).toString().padStart(2, '0')}:{(Math.floor(playedSeconds) % 60).toString().padStart(2, '0')}
          </div>
          
          <button 
            onClick={handleAddManualClip} 
            disabled={isAdding}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {isAdding ? "Menambahkan..." : "+ Tambah Klip Manual"}
          </button>
        </div>

        {/* Bottom Carousel: AI Clips */}
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-slate-200">Viral Clips Generated</h2>
            <span className="text-sm font-medium text-slate-400 bg-white/5 px-3 py-1 rounded-full">{localClips.length} clips</span>
          </div>
          
          {localClips.length === 0 ? (
            <div className="bg-white/5 border border-white/10 backdrop-blur-xl rounded-3xl p-12 text-center flex flex-col items-center shadow-xl">
              {podcast.status === 'processing' ? (
                <>
                  <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-6" />
                  <p className="text-lg font-medium text-slate-200">AI is currently analyzing the transcript...</p>
                  <p className="text-slate-500 mt-2">This may take a few moments. Grab a coffee!</p>
                </>
              ) : (
                <p className="text-slate-400">No clips were generated for this podcast.</p>
              )}
            </div>
          ) : (
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-6 pb-8 pt-4 custom-scrollbar hide-scrollbar w-full px-2 items-start">
              {localClips.map((clip, index) => (
                <ClipCard 
                  key={clip.id} 
                  clip={clip} 
                  index={index} 
                  playerRef={playerRef} 
                  playedSeconds={playedSeconds} 
                  onDelete={(id) => setLocalClips(prev => prev.filter(c => c.id !== id))}
                  onPreview={handlePreviewClip}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
