# 真实活动 · 原声课堂实测

日期：2026-10-24。启动现有本地应用后，打开 [交互演示](http://localhost:4173/qa/real-activity/review.html)；可以播放实际 MP4、点击章节、查看源时间/评分/挑选理由，并对照原片。查看页面不会触发付费模型调用。该验收页由 Vite 开发服务提供，不包含在默认生产入口中。

## 输入与实际结果

素材为 Northampton Community Television 的 [Cooking with Laura Homemade Pasta](https://commons.wikimedia.org/wiki/File:Cooking_with_Laura_Homemade_Pasta.webm)，出镜 Laura Alpern，原片剪辑 Julia Alpern，授权 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。本目录的视频、解码帧和截图包含该素材及其改编，须保留这些署名、来源、授权链接和改动说明；不表示原作者认可或代言 MomentFlow。

完整原片 669.55 秒，保留其原录音，转为 H.264/AAC 并在 240 / 480 秒处分成三份连续文件，满足现有单视频五分钟的限制。没有预先挑选场景，没有添加音乐、配音或合成声音。完整下载和处理输入保留于被忽略的本地数据目录，没有提交运行时原片、特征向量、Key 或模型权重。来源、哈希、转码后元数据见 [source.json](source.json)。

实际流程为：三份完整视频上传 → YuNet/SFace 识别 → 切片复核与合并 → 已有 OpenRouter / `openai/gpt-6-luna` 配置 → 分散候选分析 → 自动挑选与故事编排 → 原样采用模型章节/文案 → 真实 FFmpeg 输出 → 复核、交付、领取下载。没有使用测试替身或人工指定最终选段。

- 365 张检测切片，其中 364 张有可匹配特征；自动聚类产生 **287 个碎片组**。经逐组及全部切片视觉复核，调用现有合并接口归为一位“课堂演示者”。这一步不是全自动成功，仍是当前最明显的产品问题。
- 合并后共 106 个候选片段，按来源和时间分散分析 36 个，每段最多三帧。
- 最终轮实际调用 Luna 七次：六批视觉观察，加一次故事草稿，合计 61,467 tokens。另保留第一轮七次实际请求的基线结果。
- 自动推荐八段、**27 秒**：打开面粉包装 → 揉压面团 → 撒粉 → 拉伸 → 切蔬菜 → 蔬菜入锅 → 意面入锅 → 品尝。选中角色为准备一段、操作六段、成果一段；四个重复候选被排除。
- 影片 1280×720、12 fps、H.264/AAC，章节字幕已编码进入文件，源视频保持动态。最终选段、标题、章节和记录均未手动改写。

模型原始活动手记：

> 这份记录中，TA打开面粉包装、揉压并拉伸面团，也切了绿色蔬菜，将蔬菜和意面倒入锅中，最后用勺子品尝碗中的食物。

这是单堂成人教学活动，不把它包装成幼儿园实拍或完整一周记录。

## 此次实测修正

第一轮将所有候选都标为 `action`，推荐约 26 秒并遗漏品尝，导致故事收尾较弱。补充阶段的明确含义，为有证据的新故事阶段增加选择权重，并让相似固定机位中的不同动作保留候选资格；没有强制生成缺乏证据的开场或成果。随后使用同一完整输入重新调用真实模型，得到上述八章。第一轮原始观察及草稿在 [baseline-story.json](baseline-story.json)，最终在 [story.json](story.json)。

真实八段拼接还暴露了逐段 AAC 编码的填充延迟：偏移从首段约 21.4ms 累积到末段约 85.4ms。现在每段音频按实际视频帧数转换为精确数量的 48kHz PCM 样本，PCM 拼接后只编码一次 AAC。修正前数据在 [audio-before-fix.json](audio-before-fix.json)。

最终八段分别与导入源对应时间的单声道 8kHz 解码波形比对，相关系数 **0.997963–0.999982**，该精度下相对偏移均为 0ms；这不代表无损编码或无限精度的零误差。与完整下载原片另行比较，相关系数 0.956252–0.999250，偏移绝对值不超过 23.25ms，包含输入转码/分段的时间基差异。最终音频流和视频流均为 27.0 秒，解码无警告。完整数值、源/成片时间映射见 [report.json](report.json)。

## 证据与复跑

| 文件 | 内容 |
|---|---|
| [kitchen-story.mp4](../../public/examples/kitchen/story-zh.mp4) | 从实际领取接口下载并核对哈希的最终影片 |
| [review.html](review.html) | 实际数据驱动的本地交互验收页，非新的推理路径 |
| [story.json](story.json) | 最终真实模型观察、草稿、证据帧时间/哈希和用量 |
| [report.json](report.json) | 识别、人工合并、自动选段、音频和文件检查 |
| [selected-evidence-1.jpg](selected-evidence-1.jpg)、[selected-evidence-2.jpg](selected-evidence-2.jpg) | 实际发送到模型的八个选中候选画面 |
| [chapters-decoded.jpg](chapters-decoded.jpg) | 从最终 MP4 解码的全部章节，含烧录字幕 |
| [workbench.png](workbench.png) | 已交付真实批次的产品工作台 |

复跑时按 `source.json` 的下载地址获取原文件，核对 SHA-256，然后完整转码分段：

```bash
ffmpeg -i original.webm -map 0:v:0 -map 0:a:0 \
  -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p \
  -force_key_frames 'expr:gte(t,n_forced*240)' -c:a aac -b:a 160k \
  -f segment -segment_time 240 -reset_timestamps 1 kitchen-part-%02d.mp4
```

在产品中新建体验批次，导入三份文件，以一秒间隔识别，复核/合并人物，然后授权候选画面分析、选择 60 秒预算、采用草稿、保留原声生成。模型结果可能随服务版本变化，复跑不保证相同选段。当前机器中已经保存“真实活动 · 手工意面课堂（原声）”完成批次，并在演示浏览器会话中保留同一实际结果的副本；没有复制模型 Key 到其他会话。

## 验证与边界

16 项后端、3 项客户端、4 项原有 worker/打包测试通过；Ruff、Prettier 与前端构建通过。新增回归覆盖同机位不同活动、准备/成果覆盖，以及带扫频信号的源音频对齐，避免仅测频率却漏过时间偏移。合成音只用于单元测试，不出现在本次真实影片中。没有新增 GitHub workflow。

仍然存在：聚类严重碎片化、只拍手部或人脸漏检的区间可能缺失、采样帧不能证明完整动作、模型可能误认物品、部分一秒片段过短，以及对白会被剪断。当前没有语音转写或按句子优化剪点；新增托育课堂示例也不构成真实多人儿童活动的准确率评测。此次结果证明真实链路能工作，不能据此宣称已达到无人审核的商用品质。


## English overview

The full 669.55-second CC BY 3.0 cooking class was imported in three consecutive parts. Actual YuNet/SFace processing produced 365 crops and 287 fragmented groups. After visual review and 286 merge operations, Luna analyzed 36 of 106 candidates and automatically selected eight chapters totaling 27 seconds. The Chinese final selection and draft were not manually rewritten. The English gallery film is a faithful human translation of that saved draft, rendered through the normal editable-story API.

The original recorded soundtrack is preserved. Per-segment 48 kHz PCM is joined before a single AAC encode, avoiding cumulative priming delay. All eight output/source waveform comparisons show correlation 0.997963–0.999982 and 0 ms relative offset at 8 kHz precision. This is not a claim of lossless audio. Full source comparisons and caveats are in `report.json`. Speech can still be cut mid-sentence. The results demonstrate a working pipeline, not unattended production quality. Credits and CC BY 3.0 attribution above apply to all derived media.
