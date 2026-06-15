import { db, podcasts, clips } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import PodcastDetailClient from "../../../components/PodcastDetailClient";

export default async function PodcastDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch specific podcast
  const podcast = await db.query.podcasts.findFirst({
    where: eq(podcasts.id, id),
  });

  if (!podcast) {
    notFound();
  }

  // Fetch associated clips
  const generatedClips = await db.query.clips.findMany({
    where: eq(clips.podcastId, id),
    orderBy: [asc(clips.startTime)],
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 p-6 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 left-1/4 w-[400px] h-[400px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />

      <PodcastDetailClient podcast={podcast} generatedClips={generatedClips} />
    </div>
  );
}
