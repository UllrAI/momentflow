# Demo input media

## Kindergarten

`kindergarten/blocks.jpg` and `kindergarten/painting.jpg` are independently saved imagegen outputs made on 2026-10-24. All three children are fictional. The second prompt preserved the first image's faces, hair and clothing while changing the table activity to autumn-leaf painting.

Prompt 1: three entirely fictional East Asian children around age four, bob-haired girl in mustard cardigan, short-haired boy in blue overalls, pigtail girl in a cream floral top, building wooden blocks in a warm bright kindergarten classroom. Clear frontal unobstructed faces, horizontal educational photography, natural light, no UI, text or logos.

Prompt 2: preserve exactly the same fictional identities, clothes, framing and light, but change the table activity to painting autumn leaves. No identity changes, text or UI.

`references/` contains face-reference photos cropped from `blocks.jpg` using the actual detector. Fictional names are supplied by these explicit reference records, not inferred from appearance.

`kindergarten/classroom-synthetic.mp4` is a six-second pan/zoom video encoded from the painting image with FFmpeg. It tests video decoding, timestamps and mixed-media processing; it is **not** a real recording of children moving. Raw imported user video is decoded and clipped from its own frames by the same pipeline.

The example importer registers those references, then actually runs YuNet and SFace on all input photos and sampled video frames. There are no precomputed face clusters or pre-made personal highlights.

## Real motion test

`webcam.mp4` is converted from the actual webcam sequence in OpenCV Zoo's YuNet example, pinned source:
https://github.com/opencv/opencv_zoo/blob/48b10fa505aeb51fbd127fc60a5c660040e823b7/models/face_detection_yunet/example_outputs/yunet_demo.gif

`webcam-photo.jpg` is one extracted camera frame. The converted video retains the real person's movement and the source demonstration's detector annotation. The source directory is MIT licensed; see `OPENCV-YUNET-LICENSE.txt`. These files are used for local motion and cross-media matching tests, not to establish the person's real-world identity.

The adventure sample also uses the existing fictional adult AI photographs. All source types pass through the same real analysis API. Conservative pose-related clustering fragments can require human merging.
