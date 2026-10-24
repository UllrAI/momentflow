# 真实示例素材 / Real example media

[项目效果展示](../../../README.md) · [Project showcase](../../../README.en.md)

## 素材清单

| 目录 | 来源与署名 | 许可与处理 |
| --- | --- | --- |
| `classroom/` | [Ramstein Child Development Center Expands Childcare Support](https://www.dvidshub.net/video/993791/ramstein-child-development-center-expands-childcare-support)，Cherise Vaught / AFN Kaiserslautern / Defense Media Activity，2026-01-18；经 [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ramstein_Child_Development_Center_Expands_Childcare_Support_(993791).webm) 获取 | 原发布页标注 Public Domain。保留完整 60 秒来源录音，转码为 H.264/AAC；成品经人脸分组复核、选片、剪辑、字幕及检测到的其他人脸遮盖 |
| `kitchen/` | [Cooking with Laura Homemade Pasta](https://commons.wikimedia.org/wiki/File:Cooking_with_Laura_Homemade_Pasta.webm)，Northampton Community Television；Laura Alpern 出镜、Julia Alpern 剪辑 | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)。来源为完整 669.55 秒课堂；保留原声，自动选出八段，添加章节字幕，输出 27 秒。仓库含完整低码率 H.264/AAC 观看副本；原始下载文件可通过来源链接获取 |

课堂来源的 [DVIDS 使用限制](https://www.dvidshub.net/about/copyright)适用，公开发布不等于放弃人物的隐私、肖像或其他权利。本目录不是商业代言素材包，不表明任何作者或机构认可产品。

**The appearance of U.S. Department of War (DoW) visual information does not imply or constitute DoW endorsement.**

## 文件与真实性

- `catalog.json` 是示例页使用的双语成品目录，包含人物、章节、源时间和影片地址；不含人物特征、密钥或会话信息。
- `classroom/source.mp4` 是实际上传识别的完整输入。`kitchen/source.mp4` 为完整原片的 640 像素宽 H.264/AAC 观看副本，实际推理使用三份连续分段，时间映射在 QA 报告中。封面与头像来自这份公开来源，不是生成的人物。
- `*-zh.mp4`、`*-en.mp4` 为实际渲染输出；对应 JSON 保留草稿、观察和证据引用。课堂照护者与孩子 A 的中文、英文草稿分别实际调用 Luna 生成。
- 孩子 B 的可用素材不足：首份中文成片仅 0.5 秒，不在产品示例中展示。英文分析两次未得到可用故事，未伪装为成功。后来对新的中文结果做人工英文翻译，经正常草稿编辑/渲染接口保存；JSON 含 `translation_method`。保留这些文件供验证边界。
- 烹饪中文选片与文案来自实际 Luna；`kitchen/story-en.json` 标注对同一中文草稿的人工忠实翻译，选片未改变。
- 这些保存的成品只用于示例浏览，不是新素材推理失败的回退路径。没有提交运行时人物向量、原始用户素材或凭证。

[课堂实测与哈希](../../qa/classroom/README.md) · [长视频实测与来源](../../qa/real-activity/README.md)。界面截图和演示 GIF 可能包含上述素材改编，同样保留对应署名。

## English

This directory contains deliberately curated public media and actual finished examples. The classroom source is a complete 60-second report credited to Cherise Vaught / AFN Kaiserslautern / Defense Media Activity. The publisher identifies it as Public Domain; its [use restrictions](https://www.dvidshub.net/about/copyright), including depicted-person rights and non-endorsement, still apply. The exact no-endorsement notice above accompanies the example.

The cooking source is **Cooking with Laura Homemade Pasta**, by Northampton Community Television, featuring Laura Alpern and edited by Julia Alpern, used under **CC BY 3.0**. Keep the source, credits, license link and adaptation notice when reusing its films, frames, screenshots or GIFs.

Adaptations include transcoding, reviewed person groups, selected cuts, chapter captions and detected-other-face masking. Recorded source sound is retained. No endorsement is implied.

`catalog.json` powers the bilingual gallery and contains no face vectors, keys or session data. The educator and Child A have actual separately generated Chinese and English drafts and films. Child B had insufficient usable footage: the first Chinese film is only 0.5 seconds and is not featured; two English analysis attempts failed. Its later English output is a marked human translation of a fresh Chinese draft, rendered through the normal editable-story API. The cooking English film is also a marked faithful translation, using the same automatic selection as the Chinese result.

Saved examples never substitute for inference on new uploads. Evaluation reports document manual corrections, unsuccessful cases, hashes and audio checks.
