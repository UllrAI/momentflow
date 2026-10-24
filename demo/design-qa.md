# MomentFlow Demo · Design and workflow QA

Date: 2026-10-24. Local implementation: http://localhost:4173 . This acceptance applies to the documented frontend demo, not a production recognition/payment service.

## Source, state and evidence

| Touchpoint | Source visual truth | Implementation screenshot | State / CSS viewport |
|---|---|---|---|
| Delivery | `../design/concepts/operations.png` | `qa/operations.png` | SX-1024-018, party pending, initial three zipline sessions; 1440×1024 |
| Studio | `../design/concepts/studio.png` | `qa/studio.png` | K-1024-027, party verified, current render ready for approval; 1440×1024 |
| Guest | `../design/concepts/guest.png` | `qa/guest.png` | Delivered zipline session, not purchased; 390×844 |
| Mobile operations | Operations concept, responsive adaptation | `qa/operations-mobile.png` | 390×844; table scrolls within its region |
| Tablet operations | Operations concept, responsive adaptation | `qa/operations-tablet.png` | 768×1024 |

Source pixels: desktop concepts 1487×1058; guest 853×1844. Browser captures use devicePixelRatio 1 and equal their stated CSS viewport. Comparison boards normalize desktop sources to 1440×1024 and guest to 390×844, without a device bezel or browser chrome.

Full-view combined source + implementation inputs were opened and visually reviewed:

- `qa/comparison-operations.jpg`
- `qa/comparison-studio.jpg`
- `qa/comparison-guest.jpg`

Focused combined inputs: `qa/focus-operations.jpg` (inspector text, controls and media), `qa/focus-studio.jpg` (review panel), `qa/focus-guest.jpg` (package and primary action). Separate views were not treated as a combined comparison.

## Findings and comparison history

1. **[P2, fixed] Desktop hierarchy was too small and the heading sat too low.** Early browser capture had 12 px table text and an extra eyebrow above the title. Increased the desktop table, tabs and inspector type; removed the desktop eyebrow; aligned the title and date rhythm. Post-fix evidence: `qa/comparison-operations.jpg` and `qa/focus-operations.jpg`. The earlier exploratory screenshot was replaced by the final capture; the observation and corrective changes are recorded here.
2. **[P2, fixed] Studio initially reused the delivery navigation and a narrow timeline.** Replaced its sidebar with session selection, placed the preview and review panel side by side, expanded the filmstrip across the editor, and removed a duplicate session heading. Post-fix evidence: `qa/comparison-studio.jpg`.
3. **[P2, fixed] Guest purchase action fell below the 844 px first screen.** Initial primary button began at y=886. Moved the album line into the brand row and reduced excess vertical spacing. Final button bounds: y=779–831 at 390×844. Post-fix evidence: `qa/comparison-guest.jpg` and `qa/focus-guest.jpg`.
4. **[P2, fixed] A visually hidden table heading escaped its mobile scroll region.** Document scrollWidth was 613 at a 390 px viewport. Made the table scroll wrapper the positioning context. Final measured document width is 390, with no horizontal page overflow. Added explicit accessible names to icon-only mobile navigation. Post-fix evidence: `qa/operations-mobile.png` plus browser DOM measurements.
5. **[P2, fixed] Newly imported media displayed an empty native video error before rendering.** Now shows the imported cover and “等待生成影片” without mounting a source-less video element. Confirmed with a real local file import.

No actionable P0/P1/P2 findings remain within the demo scope.

## Required fidelity surfaces

- **Fonts and typography:** system Chinese sans-serif (`PingFang SC` on the tested Mac), clear page/section/body hierarchy; guest headline uses system Chinese calligraphic/serif fallback. Checked heading wrapping, selected-state weight, metadata and buttons in focused comparisons. No external font dependency remains.
- **Spacing and layout:** warm workspace, 244 px desktop navigation, session table + right inspector; studio session rail + wide media canvas + review column + filmstrip; guest portrait cover, photos, package and CTA. At narrower widths operations stack vertically and the table scrolls internally. Primary controls remain reachable.
- **Colors and tokens:** deep teal `#08645d`, ink `#12343d`, warm background `#fdfcf9`, pale green review surfaces, amber pending, blue rendering, green approved, terracotta studio delivery action. Contrast and focus rings checked visually.
- **Image quality and assets:** standalone generated photography replaces the photographic subjects, with helmets/harnesses and consistent pine-forest art direction. The original conceptual brand/venue marks were extracted as raster assets. Lucide is used for interface icons. No CSS illustrations, emoji assets, fake motion images, or a full-screen mockup masquerading as the application.
- **Copy and content:** readable standalone Chinese; status labels distinguish party verification, render version, approval, delivery and purchase. “演示” and simulated price/payment are explicit. Invalid links and empty filters have useful copy.

Expected adaptations: the working demo uses three 4-second photo clips instead of the concept's 46/48-second multi-camera videos; package photo counts reflect the real selected clips. Guest evidence uses delivered SX-1024-019 rather than the concept's illustrative SX-1024-018. The studio uses the shared product brand and explicit separate generate/approve/deliver controls, without unsupported original-video replacement or chapter inference. Different fictional photographic subjects, native video controls and system font rasterization are expected.

## Functional verification

Browser-driven checks completed through visible UI:

- Unverified party: approval and delivery disabled; participant checks alone do not suffice without the authorization-scope check.
- Real JPG file selection through native file chooser; imported media becomes a new unverified, unrendered session.
- Caption edit invalidates old rendering/approval; local generation produces a playable video.
- Approved current version can be delivered; delivered content is locked against editing.
- Batch delivery lists only eligible approved sessions.
- Guest playback runs; simulated checkout requires acknowledgment; purchase creates a visible order and enables download.
- Downloaded the actual generated result: `qa/generated-demo.webm`, VP9, 1280×720, 3.953787 seconds, 661112 bytes. Input was one local kart photo with custom caption “把风留在今天”. `qa/generated-frame.jpg` confirms the caption is encoded into the video rather than overlaid only by the page.
- Previous three-clip generation was also downloaded and decoded, duration 11.961926 seconds.
- Invalid/unreleased guest route shows “这份影像还未开放” and no media.
- Reset restores the initial sessions. Unknown/empty status filters remain usable.
- Checked 390, 768 and 1440 px widths. Guest CTA visible at 390×844; no final document-level horizontal overflow. Modal labels, keyboard focus, checkbox labels, disabled states and focus rings reviewed.
- Browser console error/warning inspection returned an empty list during the exercised flows.

Automated checks: five model boundary tests passed; four original static-worker/package checks passed; production build passed; Prettier check passed. No workflow or live deployment was added.

## Open questions and limitations

No design blocker. Production functionality remains explicitly outside this demo: identity authentication, face recognition, source video input, surveillance ingestion, cloud media processing, signed delivery access, durable orders/storage and real payments. Client-side guards are business-flow demonstrations, not security controls. Browser recording was exercised on the in-app Chromium browser; Safari/mobile hardware encoding has not been tested.

## Implementation checklist

- [x] Core operation → studio → guest journey works.
- [x] Source and implementation compared in combined full and focused views.
- [x] P0/P1/P2 findings corrected and recaptured.
- [x] Real generated file inspected and downloaded.
- [x] Test, build and formatting checks passed.
- [x] Scope and reproducible run instructions documented.

## Follow-up polish

P3: validate platform font rendering and hardware recording on Windows, Android and iOS devices before extending the demo to those environments. Further photographic shot diversity can improve storytelling when source video ingestion is implemented.

final result: passed
