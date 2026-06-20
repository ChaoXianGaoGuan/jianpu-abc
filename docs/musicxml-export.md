# MusicXML 导出

`toMusicXml(score)` 将统一 `Score` AST 转换为 MusicXML 4.0 `score-partwise` 文本。实现位于 `src/converters/to-musicxml.ts`，不重新解析 JABC 源文本。

## API

```ts
import { parseJabc, toMusicXml } from "../src/index";

const result = parseJabc(source);
if (result.success) {
  const xml = toMusicXml(result.value);
}
```

导出器要求 AST 包含 `header.key`。成功结果始终以换行符结束。多声部 AST 会导出为多个 MusicXML part。

## 当前转换内容

- 输出 MusicXML 4.0 `score-partwise` 文档。
- 保留标题为 `<work-title>`。
- 保留 `C:` 为 composer creator。
- 输出 `divisions`、大调 key fifths、拍号、G 谱号。
- 多声部时为每个声部输出独立 `<score-part>` 和 `<part>`。
- 输出复小节线、反复方向和 `[1` / `[2` ending 标记。
- 在下一小节输出 `<print new-system="yes" />`，保留 JABC 音乐行结构。
- 输出 slur 为 MusicXML `<slur>` notation。
- 输出 tie 为 MusicXML `<tie>` 和 `<tied>` 元素。
- 输出三连音为 `<time-modification>` 和 `<tuplet>` notation。
- 输出 `Q:` 为 metronome direction 和 sound tempo。
- 将简谱音级通过 `degreeToPitch` 转为 MusicXML `<pitch>`。
- 输出 `<alter>` 表示升降音。
- 将 `0` / `z` 输出为 `<rest />`。
- 将同一小节内的 `-` 合并进前一个音符的 `<duration>`。
- 输出基础 `<type>`、`<dot />`、`<accidental>` 和单音节歌词 `<lyric>`。

## divisions 规则

默认使用每四分音符 `480` divisions，并根据乐谱中出现的时值分母自动扩展，确保当前 AST 时值可以表示为整数 MusicXML duration。

例如在 `L:1/4` 下：

```abc
| 1 - 0/2 3. |
```

会导出：

- `1 -`：`960` divisions
- `0/2`：`240` divisions
- `3.`：`720` divisions

## 错误

失败时抛出 `MusicXmlExportError`，其 `code` 可用于 UI 提示：

| Code | 原因 |
| --- | --- |
| `MISSING_KEY` | AST 没有简谱调号 |
| `ORPHAN_EXTENSION` | `-` 前没有同小节音符 |
| `INVALID_DURATION` | 时值无法转换为正整数 MusicXML duration |
| `UNSUPPORTED_PITCH` | 调式、变音或 MIDI 范围暂不支持 |

## 当前限制

当前是原生基础 MusicXML 导出器，不依赖外部 ABC-to-MusicXML 工具。它支持多声部导出为多个 part，并保留反复/ending 符号，但只支持大调和基础音符/休止符/歌词。反复播放展开、复杂连线、连音、装饰音、同谱表多声部合并和 `jianpu` clef 尚未实现。新增语义时必须同步增加单元测试和文档。
