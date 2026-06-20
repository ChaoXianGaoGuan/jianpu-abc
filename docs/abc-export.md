# 标准 ABC 导出

`toStandardAbc(score)` 将统一 `Score` AST 转换为标准 ABC 文本。实现位于 `src/converters/to-abc.ts`，不重新解析 JABC 源文本。

## API

```ts
import { parseJabc, toStandardAbc } from "../src/index";

const result = parseJabc(source);
if (result.success) {
  const abc = toStandardAbc(result.value);
}
```

导出器要求 AST 包含 `header.key`。成功结果始终以换行符结束。多声部 AST 会导出为 ABC `V:` 声部定义和对应正文段落。

## 转换规则

- 缺少 `X:` 时输出 `X:1`。
- 保留 `T:`、`C:`、`M:`、`L:`、`Q:`，并把 `K:C jianpu` 转为 `K:C`。
- 多声部时在 header 中写出 `V:` 声明，并在正文中按声部输出 `V:` 段落。
- 保留复小节线、反复小节线和 `[1` / `[2` ending 标记。
- 按 `Measure.systemBreakAfter` 保留 JABC 音乐正文的物理行结构。
- 将 JABC slur marker `(1` / `3)` 导出为标准 ABC slur，例如 `(C D E)`。
- 将 JABC tie marker `1~` / `~1` 导出为标准 ABC tie，例如 `C- C`。
- 将 `(3` 三连音导出为标准 ABC tuplet 前缀，例如 `(3CDE`。
- 缺少 `L:` 时输出并采用 `L:1/4`。
- 音级按大调音程映射；例如 D 调的 `3` 是 `F#4`，ABC 正文写作 `F`，由 `K:D` 提供升号。
- 跨越 C 的音级使用 ABC 大小写八度规则，例如 D 调的 `7` 输出 `c`。
- `0` 和 `z` 均输出为 `z`。
- 每个 `-` 给同一小节内前一个音符增加一个自身时值；例如 `5 -` 输出 `G2`。
- 非默认时值输出相对 `L:` 的倍率，例如在 `L:1/4` 下，八分音符输出 `1/2` 后缀。
- 原始 `w:` 行按顺序输出；若 AST 只有 note lyric，则用 `*` 跳过没有歌词的音符。

AST 中的显式变音使用 `^`、`_`、`=` 生成 ABC token。JABC parser 已支持变音、八度、时值和附点组合，例如 `#4'/2.`；附点时值会转换为等价的 ABC 分数倍率。

## 错误

失败时抛出 `AbcExportError`，其 `code` 可用于 UI 提示：

| Code | 原因 |
| --- | --- |
| `MISSING_KEY` | AST 没有简谱调号 |
| `ORPHAN_EXTENSION` | `-` 前没有同小节音符 |
| `UNSUPPORTED_PITCH` | 调式、变音或 MIDI 范围暂不支持 |

## 当前限制

仅支持大调。多声部会导出为独立 `V:` 段落，但尚不处理 ABC `%%score` 分组或同谱表合并。ABC 导出保留反复和 ending 符号；播放层会展开简单反复，但导出器本身不改写乐谱结构。暂不处理跨小节延音，也不导出装饰音、连线或和弦。新增规则必须同时增加 golden 或单元测试。
