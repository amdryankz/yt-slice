export const dynamic = "force-dynamic";
import { db, podcasts } from "@workspace/db";
import { desc } from "drizzle-orm";
import Link from "next/link";
import PodcastForm from "../components/PodcastForm";

export default async function Dashboard() {
  const allPodcasts = await db.query.podcasts.findMany({
    orderBy: [desc(podcasts.createdAt)],
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-purple-600/30 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-600/20 rounded-full blur-[100px] pointer-events-none" />

      <main className="z-10 w-full max-w-5xl mt-6 sm:mt-12">
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
            Clip AI
          </h1>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg text-slate-400 max-w-xl mx-auto">
            Submit a podcast or video URL to automatically generate viral clips.
          </p>
        </div>

        <PodcastForm />

        <div className="w-full bg-white/5 border border-white/10 backdrop-blur-xl p-5 sm:p-8 rounded-3xl shadow-2xl">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 text-slate-100">Recent Projects</h2>
          
          {allPodcasts.length === 0 ? (
            <p className="text-slate-400 text-center py-8">No podcasts submitted yet.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {allPodcasts.map((podcast) => (
                <div key={podcast.id} className="bg-slate-900/50 border border-slate-700 p-5 rounded-2xl flex flex-col justify-between hover:border-purple-500/50 transition-colors min-w-0">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-lg text-slate-100 truncate" title={podcast.title}>
                      {podcast.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 text-sm">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${
                        podcast.status === 'completed' 
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : podcast.status === 'processing'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                            : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                      }`}>
                        {podcast.status.toUpperCase()}
                      </span>
                      <span className="text-slate-500">
                        {new Date(podcast.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  
                  <Link 
                    href={`/podcast/${podcast.id}`}
                    className="mt-4 w-full block text-center bg-white/10 hover:bg-white/20 text-slate-200 py-2 rounded-xl transition-colors text-sm font-medium"
                  >
                    View Details
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
