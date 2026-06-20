# SVG 简谱渲染

`renderJianpu(score, options)` 从统一 `Score` AST 生成 SVG 字符串，不访问 DOM，也不重新解析 JABC。实现位于 `src/renderers/jianpu-renderer.ts`。

## API

```ts
const svg = renderJianpu(score, {
  width: 900,
  fontSize: 32,
  showLyrics: true,
  highlightEventId: "default:0:2",
});
```

`width` 最小为 320，决定 viewBox 宽度。源码音乐行决定系统换行；同一源码行会整体缩放以保持小节列数。没有显式系统断点的 AST 才按宽度自动换行。`fontSize` 最小为 18。返回值可以直接设置为网页容器的 SVG 内容，也可以保存为 `.svg` 文件。

## 当前渲染内容

- 标题、作者、`1=C` 调号、拍号和速度。
- 数字音符、休止符 `0` 和延音 `−`。
- 升降号、还原号及双升降号。
- 高低八度点、单双附点。
- 以拍号分母为一拍：长时值展开为延音横线，短时值使用底线，同一拍内相同时值的底线相连。
- SVG 粗细竖线与圆点形式的反复/终止线，以及带水平括号的编号 ending。
- 单小节线、复小节线、歌词、声部标签和按小节自动换行。
- SVG 曲线路径形式的圆滑线、从数字边缘起止并避让小节线的延音线，以及中间带数字的三连音弧线。

每个事件组包含 `data-event-id="voiceId:measureIndex:eventIndex"`。传入相同的 `highlightEventId` 会添加 `is-highlighted` class；该 ID 与 `PlaybackEvent.sourceEventId` 一致，因此播放层无需维护第二套映射。

标题、作者、歌词和属性均经过 XML 转义。调用方可以插入完整的渲染结果，但不应将任意未转义的片段拼入 SVG。

## 当前限制

支持多个声部按块垂直排列，并显示基础复小节线、反复线和 ending 标记。布局以清晰预览为目标，不是出版级排版；嵌套或跨声部连线、装饰音、同小节跨声部对齐和交互式编辑尚未实现。后续规则必须保持渲染器纯函数，并增加字符串或 snapshot 测试。
