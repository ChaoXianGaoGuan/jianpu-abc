# 播放与 Web Audio

播放模块分为两层：`scoreToPlaybackEvents` / `scoreToPlaybackPlan` 负责纯时间轴计算，`WebAudioPlayer` 负责浏览器发声和控制。它们均从 `src/index.ts` 导出。

## 生成播放事件

```ts
const events = scoreToPlaybackEvents(score, { velocity: 96 });
```

每个 `PlaybackEvent` 包含 MIDI 音高、以秒为单位的开始时间和持续时间、MIDI velocity，以及可用于高亮的 `sourceEventId`。

`scoreToPlaybackPlan` 还返回节拍事件、包含尾部休止的总时长，以及最终使用的拍号和速度。`M:` / `Q:` 优先于 `defaultMeter` / `defaultTempo`。普通拍按分母单位点击；6/8、9/8、12/8 分别按每小节 2、3、4 个附点四分音符主拍点击，每小节首拍标记为重音。反复展开和非完整小节均按实际小节边界重新重音。

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
- `!D.C.!` / `!dacapo!` 会在第一次到达该标记所在小节后回到开头；若存在 `!fine!`，第二遍播放到 Fine 后停止；若存在两个 `!coda!`，第二遍播放到第一个 Coda 处跳到第二个 Coda。
- `!D.S.!` 会在第一次到达该标记所在小节后回到 `!segno!`；Fine 和 Coda 的处理方式与 D.C. 相同。
- 反复导航标记按结构声部生成全局小节顺序，其他声部按同一小节顺序并行调度；D.C./D.S. 后的第二遍不再次展开局部 `|:` / `:|`。
- 共享小节末尾的 tie 只在所进入的房子以 `tieEnd` 开头时继续；跳到不带 `tieEnd` 的另一房子时，该分支按普通音符结束。

`PlaybackBuildError.code` 包括 `MISSING_KEY`、`INVALID_TEMPO`、`INVALID_DURATION`、`ORPHAN_EXTENSION`、`UNMATCHED_TIE`、`TIE_PITCH_MISMATCH` 和 `UNSUPPORTED_PITCH`。

## 浏览器播放器

```ts
const player = new WebAudioPlayer(undefined, {
  instrument: "guitar",
  masterGain: 0.2,
  metronomeGain: 0.3,
  metronomeEnabled: true,
  oscillatorType: "sine",
  masterGain: 0.2,
  onEventStart: (event) => highlight(event?.sourceEventId),
  onStateChange: (state) => updateControls(state),
});

player.play(plan.events, {
  metronomeEvents: plan.metronomeEvents,
  totalDuration: plan.duration,
});
player.setInstrumentVolume(0.5);
player.setMetronomeVolume(0.25);
player.setMetronomeEnabled(false);
player.pause();
player.resume();
player.stop();
await player.dispose();
```

浏览器通常要求音频由用户交互启动，因此应在播放按钮的点击处理函数中首次创建 `WebAudioPlayer`。`dispose` 会停止播放；播放器自行创建的 `AudioContext` 也会被关闭。

`instrument` 可选 `"guitar"`、`"piano"` 或 `"synth"`，默认是 `"guitar"`。`synth` 保留原有振荡器音色；`piano` 和 `guitar` 会优先从 `sampleBaseUrl` 加载真实 mp3 采样，默认使用 tonejs-instruments 的 `piano` 与 `guitar-acoustic` 目录。播放器会找最近的采样音并通过 `playbackRate` 变调；如果网络或解码失败，会退回多泛音 Web Audio 预设。运行时可调用 `player.setInstrument("piano")` 切换音源；切换会停止当前播放并使用新音源重新播放。

音源和节拍器使用独立 GainNode。`setInstrumentVolume`、`setMetronomeVolume` 和 `setMetronomeEnabled` 在播放过程中实时生效，不会重新排程时间轴。工作台默认开启节拍器；乐谱缺少 `M:` 或 `Q:` 时提供会话级 `4/4`、`120 BPM` 回退控件，不写入乐谱或本地存储。

播放器在采样加载和浏览器 `AudioContext.resume()` 完成之前会进入 `loading` 状态，不会调度音符或触发高亮回调；这可以避免音源延迟时光标先于声音移动。调度完成后，高亮计时还会补偿浏览器报告的 `outputLatency` / `baseLatency`，让视觉光标对齐实际输出到扬声器的声音。

当前支持多个声部的并行事件调度、基础反复、一二房子和常见 D.C./D.S. 到 Fine/Coda 的展开。声部分轨音色、离线打包采样、循环、复杂嵌套反复和精细 seek 属于后续扩展。

## 测试要求

调度测试必须断言 MIDI、开始时间、持续时间及休止/延音行为。新增 tie 或 tempo 规则时应覆盖成功和错误路径。Web Audio 测试使用 mock `AudioContext`，不得依赖真实音频设备。
