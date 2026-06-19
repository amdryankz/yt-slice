"use client";

import { useState } from "react";
import { Loader2, PlusCircle, CheckCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function PodcastForm() {
  const [title, setTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSuccessId(null);
    setError(null);

    try {
      const res = await fetch("/api/podcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sourceUrl }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to submit podcast");
      }

      setSuccessId(data.id);
      toast.success("Podcast successfully added to the processing queue!");
      setTitle("");
      setSourceUrl("");
      
      // Refresh to show new list
      setTimeout(() => {
        window.location.reload();
      }, 1500);
      
    } catch (err: any) {
      toast.error(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/5 border border-white/10 backdrop-blur-xl p-5 sm:p-8 rounded-3xl shadow-2xl transition-all duration-300 hover:shadow-purple-500/10 w-full max-w-xl mx-auto mb-10 sm:mb-16">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:gap-6">
        <div className="flex flex-col gap-1.5 sm:gap-2">
          <label htmlFor="title" className="text-sm font-medium text-slate-300 ml-1">
            Project Title
          </label>
          <input
            id="title"
            type="text"
            placeholder="E.g., Lex Fridman Interview"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="bg-slate-900/50 border border-slate-700 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 transition-all outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="sourceUrl" className="text-sm font-medium text-slate-300 ml-1">
            Source URL
          </label>
          <input
            id="sourceUrl"
            type="url"
            placeholder="https://youtube.com/watch?v=..."
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            required
            className="bg-slate-900/50 border border-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 rounded-xl px-4 py-3 text-slate-100 placeholder:text-slate-500 transition-all outline-none"
          />
        </div>

        {error && (
          <div className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 p-3 rounded-xl">
            {error}
          </div>
        )}

        {successId && (
          <div className="flex items-center gap-3 text-emerald-400 text-sm bg-emerald-400/10 border border-emerald-400/20 p-4 rounded-xl animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle className="w-5 h-5" />
            <span>Podcast successfully added to the processing queue!</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-2 group relative flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-xl transition-all duration-300 active:scale-[0.98] shadow-lg shadow-purple-500/25"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <PlusCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Submit for Clipping</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
