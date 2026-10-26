import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webSrcDir = path.resolve(import.meta.dirname);
const exemptComponentDir = path.join(webSrcDir, "components", "ui");

const NATIVE_CONTROL_TAGS = ["select", "input", "button"] as const;

type NativeControlTag = (typeof NATIVE_CONTROL_TAGS)[number];

type NativeControlHit = {
  tag: NativeControlTag;
  line: number;
};

const NATIVE_CONTROL_PATTERN = new RegExp(`<(${NATIVE_CONTROL_TAGS.join("|")})\\b`, "g");

const nativeControlSnippet = ["<sel", "ect>", "<inp", "ut>", "<but", "ton>"].join("");

function findNativeControls(source: string): NativeControlHit[] {
  const hits: NativeControlHit[] = [];
  for (const match of source.matchAll(NATIVE_CONTROL_PATTERN)) {
    const tag = match[1] as NativeControlTag | undefined;
    if (tag === undefined) {
      continue;
    }
    hits.push({ tag, line: source.slice(0, match.index).split("\n").length });
  }
  return hits;
}

function collectGuardedFiles(dir: string): Array<string> {
  const files: Array<string> = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (fullPath === exemptComponentDir) {
        continue;
      }
      files.push(...collectGuardedFiles(fullPath));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("零原生控件守卫", () => {
  it("纯函数报出源码片段里的原生下拉、原生输入与原生按钮", () => {
    const hits = findNativeControls(nativeControlSnippet);

    expect(hits.map((hit) => hit.tag)).toEqual(["select", "input", "button"]);
  });

  it("纯函数不把大写的组件名当成原生控件", () => {
    const hits = findNativeControls("<Button></Button><Input></Input><Label></Label>");

    expect(hits).toEqual([]);
  });

  it("这条检查自身的测试文件也在扫描范围内", () => {
    expect(collectGuardedFiles(webSrcDir)).toContain(
      path.join(webSrcDir, "native-control-guard.test.ts"),
    );
  });

  it("前端源码里没有原生下拉、原生输入或原生按钮", () => {
    const offenders: Array<string> = [];

    for (const file of collectGuardedFiles(webSrcDir)) {
      const source = readFileSync(file, "utf8");
      for (const hit of findNativeControls(source)) {
        offenders.push(`${path.relative(webSrcDir, file)}:${hit.line} 出现原生 <${hit.tag}>`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
