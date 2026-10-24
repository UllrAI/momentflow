import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultSelection,
  initialSelection,
  latestExport,
  seconds,
} from "../src/api.js";
test("default selection stays within duration and clip bounds", () => {
  const s = Array.from({ length: 15 }, (_, i) => ({
    id: String(i),
    duration: 5,
  }));
  assert.deepEqual(defaultSelection(s), ["0", "1", "2", "3", "4", "5"]);
});
test("stale exports cannot replace the current delivered result", () => {
  const p = {
    exports: [
      { id: "a", person_id: "child", current: true },
      { id: "b", person_id: "child", current: false },
      { id: "c", person_id: "other", current: true },
    ],
  };
  assert.equal(latestExport(p, "child").id, "a");
  assert.equal(seconds(125), "02:05");
});

test("adopted story selection survives refresh without a rendered export", () => {
  const p = {
    people: [
      {
        id: "a",
        applied_story_id: "story",
        story: {
          id: "story",
          current: true,
          applied: true,
          selected_ids: ["second", "first"],
        },
      },
    ],
    exports: [],
  };
  const segments = [
    { id: "first", duration: 3 },
    { id: "second", duration: 4 },
  ];
  assert.deepEqual(initialSelection(p, "a", segments), ["second", "first"]);
  p.people[0].story.current = false;
  assert.deepEqual(initialSelection(p, "a", segments), ["first", "second"]);
});

test("English messages cover UI keys and preserve interpolated values", async () => {
  const { readFileSync, readdirSync } = await import("node:fs");
  const { translate, quantity } = await import("../src/i18n.js");
  const source = new URL("../src/", import.meta.url);
  const english = JSON.parse(readFileSync(new URL("messages.en.json", source)));
  for (const file of readdirSync(source).filter((name) =>
    name.endsWith(".jsx"),
  )) {
    const code = readFileSync(new URL(file, source), "utf8");
    for (const [, key] of code.matchAll(/\bt\(\s*"([^"\n]*)"/g)) {
      if (/[\u4e00-\u9fff]/u.test(key)) {
        assert.ok(
          english[key]?.trim(),
          `${file}: missing English message: ${key}`,
        );
        assert.ok(
          !/[\u4e00-\u9fff]/u.test(english[key]),
          `${file}: untranslated message: ${key}`,
        );
      }
    }
  }
  assert.equal(quantity(1, "段视频", "en"), "1 video");
  assert.equal(quantity(2, "个出镜切片", "en"), "2 appearances");
  assert.equal(translate("待命名人物 03", "en"), "Person 03");
  assert.equal(
    translate("{count} 个章节 · {duration}", "en", {
      count: 2,
      duration: "00:07",
    }),
    "2 chapters · 00:07",
  );
  assert.equal(
    translate("OpenRouter：账户额度不足（402）。", "en"),
    "OpenRouter: Insufficient credits (402).",
  );
  assert.equal(
    translate("A saved personal title", "zh"),
    "A saved personal title",
  );
});

test("curated examples include distinct people, bilingual films and valid chapter timing", async () => {
  const { readFileSync, existsSync } = await import("node:fs");
  const root = new URL("../public/", import.meta.url);
  const catalog = JSON.parse(
    readFileSync(new URL("examples/catalog.json", root)),
  );
  const classroom = catalog.find((item) => item.id === "classroom");
  assert.ok(classroom.people.length >= 2);
  assert.ok(existsSync(new URL(classroom.source.slice(1), root)));
  const movies = new Set();
  for (const activity of catalog) {
    for (const person of activity.people) {
      for (const locale of ["zh", "en"]) {
        const version = person.versions[locale];
        assert.ok(version.title && version.note && version.chapters.length);
        assert.ok(existsSync(new URL(version.movie.slice(1), root)));
        assert.ok(
          !movies.has(version.movie),
          "Each person and language has its own film",
        );
        movies.add(version.movie);
        let previous = -1;
        for (const chapter of version.chapters) {
          assert.ok(
            chapter.start > previous && chapter.start < version.duration,
          );
          assert.ok(
            chapter.source_start >= 0 &&
              chapter.source_end > chapter.source_start,
          );
          previous = chapter.start;
        }
      }
    }
  }
});
