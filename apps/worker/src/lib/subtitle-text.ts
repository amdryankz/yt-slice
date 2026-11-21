type TranscriptWord = {
  word: string
  punctuated_word?: string
  language?: string
}

export function formatSubtitleWord(word: TranscriptWord): string {
  const text = word.punctuated_word || word.word
  if (!/^id(?:-|$)/i.test(word.language ?? "")) return text

  // Limit corrections to known Indonesian forms because mixed clips can have mislabeled words.
  return text.replace(/^(kawan|sama)\1([.,!?]*)$/i, "$1-$1$2")
}
