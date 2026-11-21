"use client";

import { useState, useEffect } from "react";
import { Flame, Edit2, Download, Copy, Check, Loader2, Play, MousePointer2, Trash2, ImageIcon, X } from "lucide-react";
import type { clips } from "@workspace/db/schema";
import toast from "react-hot-toast";
import { formatCaptionWithUrl, type CaptionLanguage } from "@/lib/caption";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (Math.floor(seconds) % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const captionLanguages = [
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'en', label: 'English' },
] as const;

type Clip = typeof clips.$inferSelect;

export default function ClipCard({ 
  clip: initialClip, 
  sourceUrl,
  index, 
  playerRef, 
  playedSeconds, 
  onDelete, 
  onPreview,
  onClipUpdated,
}: { 
  clip: Clip,
  sourceUrl?: string,
  index: number, 
  playerRef: any, 
  playedSeconds: number, 
  onDelete?: (id: string) => void, 
  onPreview?: (start: number, end: number) => void,
  onClipUpdated?: () => void,
}) {
  const [localClip, setLocalClip] = useState(initialClip);
  const [isCutting, setIsCutting] = useState(false);
  const [captionLanguage, setCaptionLanguage] = useState<CaptionLanguage>('id');
  const [copiedLanguage, setCopiedLanguage] = useState<CaptionLanguage | null>(null);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [captionError, setCaptionError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editSession, setEditSession] = useState<{
    mode: 'clip' | 'caption';
    originalTitle: string;
    originalCaption: string | null;
  } | null>(null);
  const [confirmCut, setConfirmCut] = useState(false);
  const [videoFormat, setVideoFormat] = useState<'original' | 'crop' | 'blur'>('original');
  const [editTitle, setEditTitle] = useState(initialClip.title);
  const [editCaption, setEditCaption] = useState('');
  const [watermarkText, setWatermarkText] = useState("");

  // Editable timings
  const [editStartTime, setEditStartTime] = useState(initialClip.startTime);
  const [editEndTime, setEditEndTime] = useState(initialClip.endTime);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEditingClip = editSession?.mode === 'clip';
  const selectedCaption = captionLanguage === 'id' ? localClip.caption : localClip.captionEn;
  const captionText = captionLanguage === 'en' && selectedCaption == null
    ? null
    : formatCaptionWithUrl(selectedCaption, sourceUrl, captionLanguage);

  // Sync with parent SSE updates
  useEffect(() => {
    setLocalClip(initialClip);
    if (initialClip.status === 'completed' || initialClip.status === 'failed') {
      setIsCutting(false);
    }
  }, [initialClip]);

  async function handleCut() {
    setIsCutting(true);
    setLocalClip((prev) => ({ ...prev, status: 'processing' }));
    
    try {
      // Send the edited start and end times to the API
      const res = await fetch(`/api/clips/${localClip.id}/cut`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          startTime: editStartTime,
          endTime: editEndTime,
          format: videoFormat,
          watermarkText
        })
      });
      if (!res.ok) {
        throw new Error('Failed to trigger cut');
      }
      toast.success('Proses pemotongan video dimulai!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal memproses klip');
      setLocalClip((prev) => ({ ...prev, status: 'failed' }));
      setIsCutting(false);
    }
  }

  async function handleCopyCaption() {
    if (!captionText) return;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(captionText);
      } else {
        // Fallback for HTTP environments
        const textArea = document.createElement("textarea");
        textArea.value = captionText;
        textArea.style.position = "absolute";
        textArea.style.left = "-999999px";
        document.body.prepend(textArea);
        textArea.select();
        try {
          if (!document.execCommand('copy')) throw new Error('Clipboard copy failed');
        } finally {
          textArea.remove();
        }
      }
      setCopiedLanguage(captionLanguage);
      toast.success('Caption disalin ke clipboard');
      setTimeout(() => setCopiedLanguage((current) => current === captionLanguage ? null : current), 2000);
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyalin caption');
    }
  }

  async function selectCaptionLanguage(language: CaptionLanguage) {
    setCaptionLanguage(language);
    if (language !== 'en' || localClip.captionEn != null || isGeneratingCaption) return;

    setIsGeneratingCaption(true);
    setCaptionError(false);
    try {
      const res = await fetch(`/api/clips/${localClip.id}/caption`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to generate English caption');
      const { captionEn } = await res.json() as { captionEn: string };
      setLocalClip((prev) => ({ ...prev, captionEn }));
      onClipUpdated?.();
    } catch (error) {
      console.error(error);
      setCaptionError(true);
    } finally {
      setIsGeneratingCaption(false);
    }
  }

  function startEditing(mode: 'clip' | 'caption') {
    setEditSession({ mode, originalTitle: localClip.title, originalCaption: captionText });
    setEditTitle(localClip.title);
    setEditCaption(captionText ?? '');
  }

  async function handleSaveEdits() {
    if (!editSession) return;

    const updates: Partial<Pick<Clip, 'title' | 'caption' | 'captionEn'>> = {};
    if (isEditingClip && editTitle !== editSession.originalTitle) updates.title = editTitle;
    if (editSession.originalCaption !== null && editCaption !== editSession.originalCaption) {
      if (captionLanguage === 'en') {
        if (!editCaption.trim()) {
          toast.error('Enter an English caption before saving.');
          return;
        }
        updates.captionEn = editCaption;
      } else {
        updates.caption = editCaption;
      }
    }
    if (!Object.keys(updates).length) {
      setEditSession(null);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/clips/${localClip.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update');
      setLocalClip((prev) => ({ ...prev, ...updates }));
      setEditSession(null);
      onClipUpdated?.();
      toast.success('Perubahan disimpan!');
    } catch (err) {
      console.error(err);
      toast.error('Gagal menyimpan perubahan');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/clips/${localClip.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Klip berhasil dihapus');
      if (onDelete) onDelete(localClip.id);
    } catch (error) {
      console.error(error);
      toast.error('Gagal menghapus klip');
      setIsDeleting(false);
    }
  }

  function handlePreview() {
    if (onPreview) {
      onPreview(editStartTime, editEndTime);
    }
  }

  return (
    <div className="w-[85vw] sm:w-[400px] flex-shrink-0 snap-center flex flex-col bg-white/5 border border-white/10 p-6 rounded-3xl hover:bg-white/10 transition-colors shadow-lg">
      <div className="flex justify-between items-start gap-4">
        {isEditingClip ? (
          <input 
            type="text" 
            value={editTitle} 
            disabled={isSaving}
            onChange={(e) => setEditTitle(e.target.value)}
            className="font-bold text-xl text-slate-100 flex-1 bg-slate-900/50 border border-slate-700 rounded-lg px-2 py-1 focus:outline-none focus:border-purple-500 min-w-0"
          />
        ) : (
          <h3 className="font-bold text-xl text-slate-100 flex-1 break-words min-w-0">{index + 1}. {localClip.title}</h3>
        )}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-1.5 bg-gradient-to-r from-rose-500/20 to-orange-500/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-xl shadow-inner">
            <Flame className="w-4 h-4" />
            <span className="text-sm font-extrabold">{localClip.viralityScore}/100</span>
          </div>
          <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialogTrigger
                disabled={isDeleting}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 px-2 py-1 rounded-lg transition-colors border border-red-500/20 cursor-pointer disabled:cursor-not-allowed"
              >
                {isDeleting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} Hapus
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-slate-900 border-slate-700 text-slate-200">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-white">Hapus Klip?</AlertDialogTitle>
                <AlertDialogDescription className="text-slate-400">
                  Yakin ingin menghapus klip ini? Tindakan ini tidak dapat dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700 hover:text-white">Batal</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-red-600 text-white hover:bg-red-700">Hapus</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {localClip.status === 'failed' && localClip.errorMessage && (
        <div className="mt-3 bg-red-500/10 border border-red-500/30 rounded-xl p-3 flex flex-col shadow-inner">
          <span className="text-red-400 font-bold text-xs uppercase tracking-wider mb-1">Gagal Diproses</span>
          <span className="text-red-300 text-xs font-medium leading-relaxed">{localClip.errorMessage}</span>
        </div>
      )}
      
      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="inline-flex items-center gap-2 bg-slate-900/80 text-slate-300 px-3 py-1.5 rounded-lg text-sm font-mono border border-slate-700 shadow-inner">
          <span>{formatTime(editStartTime)}</span>
          <span className="text-slate-600">-</span>
          <span>{formatTime(editEndTime)}</span>
        </div>
        
        <button 
          onClick={handlePreview}
          className="flex items-center gap-1.5 text-xs font-semibold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-colors"
        >
          <Play className="w-3 h-3" /> Preview
        </button>
      </div>

      {isEditingClip && localClip.status !== 'completed' && localClip.status !== 'processing' && (
        <div className="mt-4 bg-slate-900/50 border border-purple-500/30 p-4 rounded-xl flex flex-col gap-3">
          <p className="text-xs text-purple-400 font-semibold mb-1 uppercase tracking-wider">Smart Editor</p>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setEditStartTime(Math.floor(playedSeconds))}
              className="flex-1 flex items-center justify-center gap-2 bg-purple-500/20 hover:bg-purple-500/40 text-purple-200 border border-purple-500/30 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <MousePointer2 className="w-4 h-4" /> Set Start to Current
            </button>
            <button 
              onClick={() => setEditEndTime(Math.floor(playedSeconds))}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-500/20 hover:bg-blue-500/40 text-blue-200 border border-blue-500/30 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <MousePointer2 className="w-4 h-4" /> Set End to Current
            </button>
          </div>
          <p className="text-xs text-slate-400 text-center mt-1">Play the video to the desired spot and click to set the markers.</p>
        </div>
      )}

      <div className="mt-5 space-y-4 flex-grow flex flex-col">
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex-1 max-h-32 overflow-y-auto custom-scrollbar">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Why it's viral</h4>
          <p className="text-sm text-slate-300 leading-relaxed">{localClip.explanation}</p>
        </div>
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Suggested Caption</h4>
            {!editSession && captionText !== null && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => startEditing('caption')}
                  className="text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
                {captionText && (
                  <button
                    type="button"
                    onClick={handleCopyCaption}
                    className="text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300"
                  >
                    {copiedLanguage === captionLanguage ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedLanguage === captionLanguage ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
            )}
          </div>
          <div role="group" aria-label="Caption language" className="mb-3 flex w-fit gap-1 rounded-lg bg-slate-950/60 p-1">
            {captionLanguages.map(({ code, label }) => (
              <button
                key={code}
                type="button"
                lang={code}
                aria-pressed={captionLanguage === code}
                disabled={Boolean(editSession) || (code === 'en' && isGeneratingCaption)}
                onClick={() => selectCaptionLanguage(code)}
                className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default ${captionLanguage === code ? 'bg-purple-500/25 text-purple-200' : 'text-slate-400 enabled:hover:text-slate-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {editSession && editSession.originalCaption !== null ? (
            <textarea
              aria-label={`${captionLanguage === 'en' ? 'English' : 'Indonesian'} caption`}
              lang={captionLanguage}
              value={editCaption}
              disabled={isSaving}
              onChange={(e) => setEditCaption(e.target.value)}
              className="w-full flex-1 text-sm text-slate-300 leading-relaxed font-medium bg-slate-900/50 border border-slate-700 rounded-lg p-2 focus:outline-none focus:border-purple-500 resize-none min-h-[110px]"
              rows={5}
            />
          ) : captionText !== null ? (
            <p lang={captionLanguage} className="text-sm text-slate-300 leading-relaxed font-medium whitespace-pre-wrap break-words max-h-36 overflow-y-auto custom-scrollbar">{captionText}</p>
          ) : !editSession && (
            <div aria-live="polite" className="text-sm text-slate-400">
              {isGeneratingCaption ? 'Generating English caption…' : (
                <>
                  {captionError && <p>Could not generate the English caption.</p>}
                  <button type="button" onClick={() => selectCaptionLanguage('en')} className="mt-1 text-purple-400 hover:text-purple-300">
                    {captionError ? 'Try again' : 'Generate English caption'}
                  </button>
                </>
              )}
            </div>
          )}
          {editSession && (
            <div className="mt-2 flex justify-end gap-3 text-xs font-semibold">
              <button type="button" disabled={isSaving} onClick={() => setEditSession(null)} className="px-2 py-1 text-slate-300 hover:text-white">Cancel</button>
              <button type="button" disabled={isSaving} onClick={handleSaveEdits} className="rounded-md bg-purple-600 px-2 py-1 text-white hover:bg-purple-500 disabled:opacity-50">
                {isSaving ? 'Saving…' : isEditingClip ? 'Save Changes' : 'Save caption'}
              </button>
            </div>
          )}
        </div>
      </div>

      {localClip.status === 'completed' && localClip.clipPath ? (
        <div className="mt-6 flex flex-col gap-4">
          <video controls className="w-full rounded-2xl border border-white/10" src={`/api/clips/${localClip.id}/video`} />
          <div className="flex flex-col sm:flex-row gap-3">
            <a 
              href={`/api/clips/${localClip.id}/video?download=1`} 
              target="_blank" 
              className="flex-1 text-center bg-blue-600/80 hover:bg-blue-600 text-white py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 text-sm"
            >
              <Download className="w-4 h-4" /> Download Video
            </a>
            {localClip.thumbnailPath && (
              <a 
                href={`/api/clips/${localClip.id}/thumb?download=1`} 
                target="_blank" 
                className="flex-1 text-center bg-yellow-500/80 hover:bg-yellow-500 text-slate-900 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm"
              >
                <ImageIcon className="w-4 h-4" /> Download Thumb
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-3 mt-auto pt-2">
          
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Watermark Text (Optional)</label>
            <input 
              type="text" 
              placeholder="@MyPodcast"
              value={watermarkText}
              onChange={(e) => setWatermarkText(e.target.value)}
              disabled={localClip.status === 'processing' || isCutting}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
            />
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Video Format</label>
            <select 
              value={videoFormat} 
              onChange={(e) => setVideoFormat(e.target.value as any)}
              disabled={localClip.status === 'processing' || isCutting}
              className="bg-slate-900 text-slate-200 border border-slate-700 rounded-lg p-2 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
            >
              <option value="original">Original (16:9)</option>
              <option value="crop">Vertical Fill (9:16 Crop)</option>
              <option value="blur">Vertical Fit (9:16 Blur Background)</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            {confirmCut ? (
              <>
                <button 
                  onClick={() => setConfirmCut(false)}
                  disabled={localClip.status === 'processing' || isCutting}
                  className="flex items-center justify-center gap-2 flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-3 rounded-xl text-sm font-semibold transition-all animate-in fade-in zoom-in duration-200"
                >
                  <X className="w-4 h-4" /> Batal
                </button>
                <button 
                  onClick={() => {
                    setConfirmCut(false);
                    handleCut();
                  }}
                  disabled={localClip.status === 'processing' || isCutting}
                  className="flex items-center justify-center gap-2 flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-emerald-500/25 animate-in fade-in zoom-in duration-200"
                >
                  {localClip.status === 'processing' || isCutting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                  ) : (
                    <><Check className="w-4 h-4" /> Proses Sekarang</>
                  )}
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={() => isEditingClip ? setEditSession(null) : startEditing('clip')}
                  disabled={localClip.status === 'processing' || isCutting || isSaving || editSession?.mode === 'caption'}
                  className={`flex items-center justify-center gap-2 flex-1 border py-3 rounded-xl text-sm font-semibold transition-all ${
                    isEditingClip ? "bg-white/20 border-white/30 text-white" : "bg-white/5 border-white/10 hover:bg-white/10 text-slate-200"
                  }`}
                >
                  <Edit2 className="w-4 h-4" /> {isEditingClip ? "Selesai Edit" : "Edit Klip"}
                </button>
                
                <button 
                  onClick={() => setConfirmCut(true)}
                  disabled={localClip.status === 'processing' || isCutting}
                  className="flex items-center justify-center gap-2 flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-purple-500/25"
                >
                  {localClip.status === 'processing' || isCutting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                  ) : (
                    <><Download className="w-4 h-4" /> Cut Video</>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
