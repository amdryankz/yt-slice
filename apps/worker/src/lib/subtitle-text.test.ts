import { expect, test } from "bun:test"
import { formatSubtitleWord } from "./subtitle-text"

test("restores the hyphen in known Indonesian words and keeps punctuation", () => {
  expect(formatSubtitleWord({ word: "kawankawan", language: "id" })).toBe("kawan-kawan")
  expect(formatSubtitleWord({
    word: "samasama",
    punctuated_word: "Samasama!",
    language: "id-ID",
  })).toBe("Sama-Sama!")
  expect(formatSubtitleWord({ word: "sama-sama", language: "id" })).toBe("sama-sama")
})

test("preserves English spelling when Deepgram tags an English word as Indonesian", () => {
  expect(formatSubtitleWord({ word: "froufrou", language: "id" })).toBe("froufrou")
})

test("preserves spelling when the language is unknown or non-Indonesian", () => {
  expect(formatSubtitleWord({ word: "samasama" })).toBe("samasama")
  expect(formatSubtitleWord({ word: "kawankawan", language: "en" })).toBe("kawankawan")
})
