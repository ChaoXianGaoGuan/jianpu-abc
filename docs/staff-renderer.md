# 五线谱渲染 Adapter

`renderStaffAsync(target, score, options)` 将统一 `Score` AST 转为标准 ABC，再交给 abcjs 渲染响应式五线谱 SVG。实现位于 `src/renderers/staff-renderer.ts`。

## 数据流

```text
Score AST -> toStandardAbc -> abcjs.renderAbc -> staff SVG
```

adapter 不读取原始 JABC，也不维护第二套音高或时值规则。简谱视图、五线谱视图、播放和导出因此共享同一 AST。

## API

```ts
const tunes = await renderStaffAsync(document.querySelector("#staff")!, score, {
  responsive: true,
  scale: 0.9,
  staffWidth: 760,
});
```

- `responsive` 默认为 `true`，映射到 abcjs 的 `responsive: "resize"`。
- `scale` 控制谱面缩放。
- `staffWidth` 映射到 abcjs 的 `staffwidth`。
- 返回 abcjs 的 `TuneObjectArray`，供后续光标或交互扩展使用。

`toStaffAbc(score)` 可单独取得 adapter 使用的 ABC 文本。`loadStaffRendererEngine()` 延迟加载 abcjs，避免它进入初始网页 chunk。底层 `renderStaff` 接受显式 `StaffRendererEngine`，测试借此注入 mock 验证调用契约，不依赖浏览器 DOM。

## 依赖与限制

当前固定使用 `abcjs 6.6.3`，其 npm 包自带 TypeScript 声明。abcjs 只存在于五线谱 adapter 和网页集成层，不进入 parser、AST、播放或简谱渲染逻辑。

当前支持标准 ABC 导出器能够表达的大调内容，包括 `V:` 多声部段落。复杂反复、连音、装饰音和同谱表声部合并需要先扩展 AST 与 ABC 导出，再由本 adapter 自动获得相同行为。五线谱播放高亮尚未实现。
