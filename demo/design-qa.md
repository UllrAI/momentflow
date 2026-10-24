# MomentFlow · Real pipeline acceptance

Date: 2026-10-24. Local app: http://localhost:4173 . This report supersedes the [frontend-only demo report](../docs/archive/frontend-only-demo-qa.md).

## Scope and evidence

Real local file import → YuNet detection → SFace features → conservative clustering → human identity/authorization review → source-time selection → actual MP4 encoding → review → delivery → browser download.

| Surface | Evidence | State / viewport |
|---|---|---|
| Kindergarten teacher workbench | `qa/real-pipeline/kindergarten-complete.png` | Three fictional children, three generated/reviewed/delivered films, first selected; 1440×1024 |
| Identity review | `qa/real-pipeline/kindergarten-review.png` | Actual model face crops and source times; 1440×1024 |
| Mobile recipient | `qa/real-pipeline/parent-mobile.png` | Current delivered film, download visible; 390×844 |
| Mobile teacher | `qa/real-pipeline/teacher-mobile.png` | Responsive workbench; 390×844 |
| Real media library | `qa/real-pipeline/media-import.png` | Native chooser uploaded real webcam video, extracted photo, no-face forest photo; 1440×1024 |
| Real video result | `qa/real-pipeline/real-motion-workbench.png` | Manually reviewed/merged groups from the licensed webcam example; 1440×1024 |

Visual direction: `../design/archive/kindergarten/concepts/concept-01.png` (1487×1058). The full source and browser implementation were viewed together in `qa/real-pipeline/comparison-kindergarten.jpg`, normalized to equal 1440×1024 viewports. The implementation retains the dark green teacher rail, warm workspace, person list, selected video and review hierarchy. Intentional differences are three actual inferred people, source face crops, processing controls and explicit review/delivery states instead of illustrative classroom counts. System Chinese fonts, spacing, selected states, face crop quality, video controls and first-screen actions were visually checked. Additional content below the fold contains source segments and the teacher note.

## End-to-end checks

- Kindergarten example imported two generated photos and one synthetic pan/zoom video. Three fictional reference profiles were enrolled, actual model inference produced three groups, and each group was manually confirmed. Each film was generated, played, approved, delivered and downloaded through the visible UI.
- Three independent H.264 files are retained: `lin-xiaoman.mp4`, `zhou-yuan.mp4`, `chen-yinuo.mp4` in `qa/real-pipeline/`. Each is 1280×720 at 12 fps, 11.583333 seconds, silent. Actual decoded first frames are shown in `three-person-results.jpg`: each keeps its target and pixels the other detected faces.
- Native file chooser imported the licensed real webcam video and photo, plus a no-face image. Real head turns caused conservative fragments; these were inspected and manually merged, without lowering the matching threshold. Actual source motion and photo insertion appear in the downloaded `real-motion.mp4` (1280×720, 12 fps, 10.416667 seconds, silent).
- `media-verification.json` records all four delivered file hashes and ffprobe metadata. Fixtures, licenses, synthetic labels and image prompts are documented in `public/samples/README.md`. No precomputed groups or personal films are used by the app.
- Server/browser restarts preserved projects, review states and current exports. Other local browser sessions cannot read the project. Public project data contains no embeddings or private source paths.
- Mobile teacher and recipient pages measured document width 390 at a 390 px viewport. Recipient download is visible at y=617–670. No final horizontal page overflow. Browser console error/warning inspection returned an empty list.

## Corrected findings

1. **[P1, fixed] Video end-frame decoding failed near the source tail.** Clamp reads to the last decodable source-frame time and round output frame counts to the export frame rate. Both ordinary and 2 fps sources now render through the last selected segment; regression tests verify actual motion.
2. **[P1, fixed] JPG thumbnail creation could overwrite the original source filename.** Thumbnails now have a distinct `.thumb.jpg` suffix. Tests compare the original upload SHA-256 after analysis and rendering.
3. **[P2, fixed] Newly visible reference profiles initialized an empty segment selection while analysis was still running.** Initialize selection only once candidate segments exist; frontend regression covers it.
4. **[P2, fixed] Client quality counters interpreted stripped private embeddings as rejected faces.** Public data now exposes a non-sensitive usability flag. The real media library correctly shows zero unusable detected faces and preserves the no-face image separately.
5. **[P2, fixed] Recipient video briefly used an enlarged face-crop poster.** Removed that poster; the loaded real output frame shows the film and its masking. Final mobile capture records the corrected result.
6. **[P2, fixed] Regeneration could leave a previously delivered version actionable.** Every new render advances the person revision; server preview/approval/claim checks current content versions. Local note or selection edits hide old actions until regeneration.

No unresolved P0/P1/P2 finding remains in the stated local-demo scope.

## Automated verification

- 10 backend tests passed with actual installed models and FFmpeg, no skips or warnings. Coverage includes complete-link grouping, same-frame conflicts, ambiguity, time gaps, reference enrollment, original-file preservation, invalid-upload rollback, session isolation, persistence, split/merge, selected-person masking, cancellation, stale output rejection, review/delivery/download, real motion and low-frame-rate tail handling.
- 2 client boundary tests passed (candidate selection and stale export handling).
- 4 original Sites worker/package tests passed; protected hosting files remain intact.
- Ruff, Prettier and production frontend build passed. No GitHub workflow or cloud deployment was added.

## Limits

The kindergarten children are fictional, and its video is synthesized from a photo. It does not establish real-child recognition accuracy. The separate real webcam video establishes actual video processing and output motion only. Real camera/child datasets, occlusion, crowds and camera variation need field validation.

The exporter masks detected non-target/uncertain faces; missed detections can remain visible. Human review is required. The output is silent 720p/12 fps. Real-time surveillance, multimodal event ranking, automated developmental assessment, cloud processing, actual teacher/guardian accounts and cross-device delivery are not implemented. The parent view is a same-session local demonstration.

Final result: passed for the documented local processing demo.
