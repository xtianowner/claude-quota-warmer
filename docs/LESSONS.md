<!-- purpose: 项目设计教训记录，避免重复犯错 -->
创建时间 2026-05-13 10:25:00
更新时间 2026-05-13 10:25:00

# 设计教训

## L1 (2026-05-13) — 弃用 interval-based 调度

**尝试**：用户配置一个 `interval_seconds`（默认 4h50min），daemon 按固定周期循环触发 healthcheck。

**为什么不行**：
- 用户真实意图不是"匀速心跳"，而是"在某些具体时刻触发"——例如想让明早 05:30（无人值守时段）跑一次，而不是无差别 24h 持续轰炸。
- interval 模型不能表达"绝对日期"。用户举例"2026-05-14 05:30"是一次性时间点，不是周期。
- 反复刷新 5h 配额窗口本身也不需要全天候持续——很多用户只想覆盖关键时段。

**替代方案**：`schedule_points: list[SchedulePoint]` —— 用户增删多个绝对 datetime（带时区），daemon 用 APScheduler `DateTrigger` 在每个点触发一次，触发后该点 status 变 `done` / `failed`。
