# Mandarin Study · Lessons 1–7

A static study site for *A Course in Contemporary Chinese 1* (lessons 1–7): dialogues, vocabulary,
listening practice and flashcards. No build step is needed to host it.

## Features
- **Audio for every sentence** (▶ next to each line) and **every word**.
- **Whole-conversation playback** with line highlighting, speed control (0.7×–1.2×),
  a downloadable mp3 of each dialogue, role-play mode (your lines are silent so you can speak them)
  and "pause to repeat" shadowing.
- **Conversation training (會話練習)** for every lesson: the teacher voice asks a question, you answer aloud
  during a timed pause, then a model answer plays. All questions and answers have pinyin, English and audio,
  plus a downloadable mp3 per set. Questions live in `../work/data/questions.txt`.
- **Writing (寫字)**: every new character of each lesson (278 in total) with animated stroke order and a
  handwriting pad that checks each stroke (mouse or finger), powered by [Hanzi Writer](https://hanziwriter.org)
  loaded from jsDelivr. Vocabulary rows link to each character (✍).
- Chinese / pinyin / English can each be hidden (blurred) and revealed on click; "Hide all hints" in the header.
- Listening quizzes, meaning → characters quiz, sentence-translation quiz and flashcards.
- Dark mode; progress ("listened") is kept in your browser's localStorage.

## Run locally
Audio needs http, so don't just double-click `index.html`:

```
cd site
python -m http.server 8000
```
then open http://localhost:8000.

## Publish on GitHub Pages
1. Create a repository and push the contents of this `site/` folder (or the whole repo).
2. Settings → Pages → deploy from the branch, folder `/ (root)` (or `/site` if you push the whole project).

## Regenerate content / audio
Lesson text lives in `../work/data/L1.txt … L7.txt`. After editing:

```
pip install pypinyin edge-tts
python -X utf8 ../work/build.py
```
This rewrites `data.js` and creates any missing mp3 files in `audio/` (needs internet for edge-tts voices).
Audio is machine-generated; single-character particles (e.g. 了, 得) may be read slightly differently than in context.
