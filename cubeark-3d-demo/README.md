# CubeArk 3D机房 Demo（前端 3D 方案验证）

阶段二规划的 3D 前端最小可运行验证：Vue 3 + TypeScript + Vite + **Three.js 原生 API**（无胶水框架）。

## 运行

```bash
npm install      # 已配置 npmmirror 源（.npmrc）
npm run dev      # http://<主机IP>:5173
npm run build    # vue-tsc 类型检查 + 产物构建（dist/）
```

## 功能对照（阶段二 §5 3D 场景分层）

| 层级 | 实现 | 文件 |
|------|------|------|
| L1 机房总览 | 地面网格 + 机柜 InstancedMesh（单 draw call，12 机柜）+ 使用率/告警着色 + 编号标签 + hover 高亮 | `src/three/RoomScene.ts` |
| L2 机柜 U 位 | 机架框架 + 空闲 U 位板 + 参数化设备盒体（按分类着色，告警红）+ U 位标尺 | `src/three/RackScene.ts` |
| 点击详情 | L1 点击机柜进 L2；L2 点击设备右侧面板展示台账字段 | `src/App.vue` |
| 拖拽上架 | 设备库按住拖入机柜 → 射线拾取透明面板 → U 位吸附 → 冲突红显 → 松手生成上架单（演示直接执行并刷新场景） | `RackScene.startDrag` + `api/mock.ts` |

## 数据契约

`src/api/mock.ts` 的数据结构与《开发02_REST接口文档.md》`/scene/rooms/{id}`、`/scene/racks/{id}`、`/scene/racks/{id}/check-u` 完全一致——接入真实后端时仅替换为 axios 调用，3D 场景代码零改动。

## 结构

```
cubeark-3d-demo/
├── src/
│   ├── App.vue              # 页面壳：模式切换/侧栏面板/拖拽联动/上架单提示
│   ├── api/mock.ts          # /scene/* 契约 mock（机房12柜、A01设备、在库设备库）
│   ├── three/
│   │   ├── three-app.ts     # ThreeApp：渲染器/相机/OrbitControls/射线拾取/自适应（只创建一次）
│   │   ├── RoomScene.ts     # L1 机房总览场景（Group 挂载，可 dispose）
│   │   └── RackScene.ts     # L2 机柜U位场景 + 拖拽落位交互
│   └── types.ts
└── vite.config.ts           # host 0.0.0.0（供局域网访问 VM）
```

## 说明

- Demo 用 mock 直接执行上架；真实环境为"生成上架单 → 审批 → 后端事务执行 → 场景接口缓存失效"。
- 性能基线：InstancedMesh 支撑百~千级机柜；L2 仅渲染单柜 42 U。大批量场景的降级策略见阶段二 §5.3。
