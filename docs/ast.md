# Score AST 说明

`Score` AST 是 JABC 输入与后续转换、渲染、播放之间的唯一数据边界。核心模块只解析一次文本；下游功能应读取 AST，不应重新解析 JABC。

## 顶层结构

```text
Score
├── header: ScoreHeader
├── voices: Voice[]
└── raw?: string
```

- `Score.type` 固定为 `"Score"`。
- `header` 保存曲目信息、拍号、默认时值、速度和简谱调号。
- `voices` 当前只生成一个 `id: "default"` 的声部，但保留数组结构供以后扩展。
- `raw` 可保存原始 JABC 文本，用于编辑器或诊断，不应作为下游音乐语义来源。

所有 AST 类型定义位于 `src/core/ast.ts`，并通过 `src/index.ts` 导出。

## Header

`ScoreHeader` 的已知字段对应 JABC 的 `X:`、`T:`、`C:`、`M:`、`L:`、`Q:` 和 `K:`。未知字段进入 `extraFields: Record<string, string[]>`，数组用于保留重复字段及其顺序。

`Fraction` 用 `{ numerator, denominator }` 表示并约分；`TimeSignature` 使用相同字段名但保留原拍号，例如 `4/4` 不会变为 `1/1`。`JianpuKey.notation` 固定为 `"jianpu"`。

## Voice、Measure 与 Event

每个 `Voice` 包含 `measures` 和原始 `lyricLines`。`Measure.events` 当前允许：

- `NoteEvent`：级数 `1`–`7`、可选变音、八度偏移、最终时值、附点数、tie 标记及可选歌词。
- `RestEvent`：休止符、最终时值及可选附点数。
- `ExtensionEvent`：尚未解析的 `-` 延音单位。

结束小节的单小节线存入 `Measure.barline`，不作为独立音乐事件。音乐源码行末的小节带有 `Measure.systemBreakAfter`；ABC、MusicXML 和渲染器必须使用该标记保持谱面系统结构。事件的 `sourceText` 和 `location` 用于错误定位、编辑器映射及未来播放高亮，不应影响音高或时值计算。

## 解析与规范化

```text
JABC text -> parseJabc -> raw Score -> normalizeScore -> Score
```

当前 `normalizeScore` 只执行 `attachLyrics`：复制 AST，并把每条 `w:` 歌词附着到同声部里前一条音乐源码行；若该源码行已有逐音歌词，额外 `w:` 只保留在 `Voice.lyricLines`。歌词按发音单元分配：普通 note、附点 note 和带时值修饰的 note 消耗一个音节；`-`、tie continuation、slur continuation、rest、key-change 和 repeat marker 不额外消耗音节。`*` 音节会消耗一个发音单元但不写入 `NoteEvent.lyric`。该转换应保持纯函数风格，不修改输入对象。

parser 在构建事件时已把 `/N`、`*N` 和附点折算进 `duration`；`dots` 仍保留原记谱信息，供简谱渲染使用。下游播放和导出必须读取最终 `duration`，不得再次应用附点。

后续时值合并、延音解析和小节校验应作为独立规范化步骤加入，而不是塞入 parser 或下游导出器。

`degreeToPitch` 位于 `src/core/pitch.ts`，将调号、音级、变音和八度偏移解析为音名、MIDI、ABC token 与 MusicXML pitch object。该函数当前只实现大调音程；其他调式会明确报错。

播放事件不写回 `Score`。`scoreToPlaybackEvents` 使用
`voiceId:measureIndex:eventIndex` 生成 `sourceEventId`，供播放器回调和未来
渲染高亮关联源事件。

## 兼容性规则

- 新增可选字段通常是向后兼容变更。
- 修改字段含义、删除字段或改变事件判别值属于破坏性变更。
- AST 必须保持可 JSON 序列化；不要存放 DOM、Web Audio 节点、类实例或循环引用。
- 每次 AST 变更必须更新本说明、类型定义和相关测试。
