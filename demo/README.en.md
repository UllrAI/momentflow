# MomentFlow application guide

[简体中文](README.md) · [English](README.en.md) · [Project and results](../README.en.md)

Turn photos and videos into personal films with their original sound. Includes kindergarten and activity workspaces, plus completed real-classroom examples.

## Install and run

Requirements: Node.js 20.19+, Python 3.11–3.13, uv, FFmpeg and ffprobe.

```bash
cd demo
npm ci
npm run setup
npm run dev -- --port 4173
```

Open http://localhost:4173. Choose 简体中文 or English at the top right; the preference survives refresh. `setup` installs backend dependencies and verified OpenCV models. `dev` starts the frontend and API at 127.0.0.1:8766 together; Ctrl+C stops both.

`npm run build` packages the frontend and existing static worker only. It does not package Python, FFmpeg or accounts. Static hosting can show saved examples; processing new files requires the local API.

## Watch real results first

Open **Story examples**:

- **Classroom:** a complete 60-second multi-person source, separate educator and child films in Chinese and English, notes, chapter seeking and downloads.
- **Handmade pasta:** an actual long-video analysis, eight chapters and a 27-second film with original sound. English is a faithful human translation of the Chinese draft, using the same selected clips.

Viewing examples needs no key, inference or paid requests. Saved examples never replace failed processing of new uploads. See [media credits](public/examples/README.md).

## Create your story

| Step | Action |
| --- | --- |
| Add media | Create a collection, confirm permission, add photos and videos |
| Confirm people | Find people and review each group. Use People to inspect originals, combine groups or separate incorrect photos |
| Create a story | Request AI suggestions in Story, edit the title, chapters and note, then apply the story. Or manually choose/reorder clips and write a note in Clips |
| Review and share | Keep or mute original sound, create the film, watch it fully, approve it, then open the local collection page and download |

You can add a clear reference photo before importing media. Names come from your input; no external identity database is searched. Blur, side views and occlusion may cause missed faces or fragmented groups. Detection confidence is not the probability of a correct identity.

Supported formats: JPG/JPEG, PNG, WebP, MP4, MOV, WebM, M4V and AVI, subject to installed decoders. Limits: 100 MB/file, 5 minutes/video, up to 4K; 30 files and 500 MB/collection. Films can contain up to 12 clips and 60 seconds, exported as 1280×720, 12 fps H.264/AAC MP4.

## Connect the story assistant

1. Open Settings, select a Luna model and save your OpenRouter key. You can then verify the connection.
2. Confirm the person and permissions. In Story, consent to sending selected frames to OpenRouter / OpenAI before requesting suggestions.
3. Review and apply the draft. Source or person changes require a new analysis; newly generated films require another review.

New stories follow the interface language. Switching language does not translate saved user content. Without a key, you can still detect people, select clips, write notes and create films locally.

Analysis uses up to 36 candidates dispersed across sources and time, with up to 3 frames/video segment or 1/photo. It does not hear the soundtrack or guarantee understanding of a complete action. Target marking and detected-other-face masking happen locally. Names, reference photos, embeddings and audio are not sent. Missed faces remain possible; use media you have permission to process. Requests may incur provider charges.

## Storage and delivery

- Data persists under the Git-ignored repository-root `.momentflow-data/`. Model weights live under `backend/models/`; setup checks fixed hashes and weights are not committed.
- Keys are saved per signed browser session in local files with mode 0600. The API does not return keys and frontend storage does not hold them. Deleting a collection does not delete the key; remove it separately in Settings.
- Browser sessions have separate collections. Only the current approved and delivered film can be downloaded from the collection page. Relevant changes invalidate previous versions.
- Collection pages currently work on this computer and browser. Real guardian/guest accounts, cross-device invitations, cloud storage and payments are not provided.
- Original sound includes all recorded voices; other speakers cannot automatically be removed. Cuts can interrupt speech. Per-frame masking only covers detected faces. Review every film fully.
- Settings can permanently delete a collection, including source files, features, groups and films. Downloads stored elsewhere must be managed separately.

## Verify and troubleshoot

```bash
npm test
npm run check:backend
npm run check:format
npm run build
npm run test:sites
```

Tests cover local recognition, moving video, audio timing, grounded stories, permission/version boundaries, browser isolation, cancellation and bilingual messages. Model-interface tests use an explicit double. Actual model results are documented in the [classroom evaluation](qa/classroom/README.md) and [long-video evaluation](qa/real-activity/README.md).

If the workspace cannot connect, start the complete app with `npm run dev`. If models are missing, rerun `npm run setup`. For unreadable video, try H.264 MP4; for rejected uploads, check size and duration. Failed analysis preserves existing results and never substitutes a saved example.

[UI verification](design-qa.md) · [Processing implementation](../docs/implementation-v3.md) · [Stories and original audio](../docs/implementation-v4-story.md)
