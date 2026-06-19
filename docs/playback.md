# 播放与 Web Audio

播放模块分为两层：`scoreToPlaybackEvents` 负责纯时间轴计算，`WebAudioPlayer` 负责浏览器发声和控制。两者均从 `src/index.ts` 导出。

## 生成播放事件

```ts
const events = scoreToPlaybackEvents(score, { velocity: 96 });
```

每个 `PlaybackEvent` 包含 MIDI 音高、以秒为单位的开始时间和持续时间、MIDI velocity，以及可用于高亮的 `sourceEventId`。

时间换算以 `Q:` 的 beat 和 bpm 为准。例如 `Q:1/8=60` 下，一个 `1/4` 音符持续 2 秒。未声明 `Q:` 时使用 `1/4=120`。

调度规则：

- note 生成一个播放事件。
- rest 不生成事件，但推进时间。
- `-` 延长同一小节内最近的 note，并推进时间。
- `1~` 解析为 `tieStart`，`~1` 解析为 `tieEnd`；同音高 tie 会合并为一个事件，不重新触发声音。
- `(3` 三连音会将后续三个音符/休止符按 `2/3` 缩放时值。
- 圆滑线 `(1 ... 3)` 不改变当前播放时值；后续可用于 legato 细节。
- tie 可以跨小节；未闭合或音高不一致会报错。
- 每个声部使用独立时间轴调度，最终合并为并行播放事件。
- 简单反复 `|:` / `:|` 会展开播放。
- 标准一二房子 `[1 ... :| [2 ...` 会在第二遍跳过第一房子并进入第二房子。

`PlaybackBuildError.code` 包括 `MISSING_KEY`、`INVALID_TEMPO`、`INVALID_DURATION`、`ORPHAN_EXTENSION`、`UNMATCHED_TIE`、`TIE_PITCH_MISMATCH` 和 `UNSUPPORTED_PITCH`。

## 浏览器播放器

```ts
const player = new WebAudioPlayer(undefined, {
  oscillatorType: "sine",
  masterGain: 0.2,
  onEventStart: (event) => highlight(event?.sourceEventId),
  onStateChange: (state) => updateControls(state),
});

player.play(events);
player.pause();
player.resume();
player.stop();
await player.dispose();
```

浏览器通常要求音频由用户交互启动，因此应在播放按钮的点击处理函数中首次创建 `WebAudioPlayer`。`dispose` 会停止播放；播放器自行创建的 `AudioContext` 也会被关闭。

当前使用振荡器合成音色，支持多个声部的并行事件调度和基础反复展开。音源采样、声部分轨音色、循环、复杂嵌套反复和精细 seek 属于后续扩展。

## 测试要求

调度测试必须断言 MIDI、开始时间、持续时间及休止/延音行为。新增 tie 或 tempo 规则时应覆盖成功和错误路径。Web Audio 测试使用 mock `AudioContext`，不得依赖真实音频设备。
