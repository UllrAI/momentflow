# v4 验收产物

- `openrouter-live-verification.json`：实际 OpenRouter / GPT-6 Luna 返回的观察与草稿，包括评分、重复来源、画面引用及用量；不是测试替身。
- 三份 `*-story.mp4`：从教师/家长流程实际下载，独立人物、故事标题和逐段字幕已经编码进文件。样例只有两类活动，因此各为六秒。
- `delivered-output-verification.json`：下载文件哈希、实际采用后的文字、章节、音轨状态与 ffprobe 元数据。
- `chapters-decoded.jpg`：第一位人物的两个章节实际解码帧；`three-person-story-results.jpg`：三份影片的目标/其他人脸遮盖对照。
- `audio-cut-verification.mp4`：MIT OpenCV 真人动态画面，加上用于检验的合成 440/880Hz 音轨作为输入，再乱序剪辑并插入照片。音轨不是课堂录音。来源许可证见 [样例说明](../../public/samples/README.md)。
- `audio-verification.json`：音轨顺序、静音片段、关闭原声、无解码警告与时长检查。
- PNG 文件：真实浏览器桌面、手机教师页及领取页截图。

儿童与姓名均为虚构，活动视频由照片推镜合成。Luna 实际分析了输入，并将重复的推镜片段排除，最终选择两张不同活动照片；这些故事影片本身无原声内容。真人动态视频与原声剪辑能力由独立测试覆盖。

完整范围和验证结果见 [验收记录](../../design-qa.md)。运行数据、脸特征、Key 和模型权重不在这些交付物中。
