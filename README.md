# CubeArk（立方仓）

综合机房 & 楼宇 IT 资产运维平台 —— 3D 机房可视化、资产出入库、设备台账、楼层点位、网络拓扑、
VLAN/IP 规划、硬件维修记录与设备健康监控大屏。

前端为 **Vue 3 + TypeScript + Vite + Three.js** 的单页应用，后端为纯静态托管（Nginx）；
当前版本业务数据保存在浏览器 `localStorage`（键 `cubeark_db_v1`），后续版本将接入 Go + MySQL。

## 功能模块

| 模块 | 说明 |
| --- | --- |
| 平台首页 | 独立全屏设备健康监控大屏：站点健康、温度 Top、异常设备、设备环境明细（30s 自动刷新） |
| 站点管理 | 多站点、机房/机柜统计、站点设备环境总览（进/排风温度、CPU、内存、电源、风扇、系统健康） |
| 机房管理 | 机房与机柜管理、任意排数、3D 机房视图（U 位可视化、设备拖拽上架/换 U） |
| 资产出入库 | 机房资产入库/出库/报废、IT 仓库领用/归还、出入库流水 |
| 设备台账 | 在用与在库设备统一台账、全字段编辑、定位 3D、SNMP 采集配置 |
| 硬件维修记录 | 设备编号/SN 可从台账带入或手录，登记故障现象、外出维修、完成时间、结果与报废 |
| IT 信息统计 | 一个站点多张信息表（服务器账号/交换机/监控等），Excel 导入、列名与分组自定义 |
| 网络拓扑 | 基于 AntV X6 的多图拓扑、拖拽加节点、端口连线、SN 绑定、PNG/JSON 导出 |
| 楼层点位 | PDF 底图打点（网口/电话/监控/显示器/主机/笔记本/打印机/无线AP），跨图纸迁移与 CSV 导出 |
| VLAN 规划 | VLAN 规划表、IP 池一键生成、IP 分配/释放、Excel 导入与 CSV 导出 |
| 用户管理 | 三种角色：超级管理员 / 站点管理员 / 普通用户（只读） |

## 本地开发

```bash
cd cubeark-3d-demo
npm install
npm run dev      # 开发服务器（默认 http://localhost:5173）
npm run build    # 产出 dist/（含 vue-tsc 类型检查）
```

初始账号：`admin / admin123`（超级管理员）、`siteadmin / site123`（站点管理员）、`viewer / view123`（只读）。

> 本仓库默认 **不内置演示数据**（`cubeark-3d-demo/src/api/mock.ts` 中 `SEED_DEMO = false`），
> 首次使用请登录后到「站点管理」新增站点，再逐步添加机房、机柜与设备。
> 需要本地演示数据时把 `SEED_DEMO` 改为 `true` 即可。

## 部署

目标环境为内网 RHEL 8.10 x86_64 离线服务器：Nginx 静态托管 `dist/`，无需数据库。
仓库不包含离线安装包（Nginx 及其依赖 RPM，单文件超过 GitHub 限制），
可另行构建；安装脚本与 Nginx 站点模板参见离线包内的 `install.sh` 与 `conf/cubeark.conf.tpl`。

## 目录结构

```
cubeark-3d-demo/          前端工程（Vue3 + TS + Vite）
  src/api/mock.ts         前端数据层（对齐后端 REST 契约，可替换为真实接口）
  src/store/              轻量状态（当前站点、登录态与权限）
  src/three/              Three.js 场景（机房总览 / 机柜 U 位 / 设备贴图）
  src/views/              业务页面
  src/components/         通用组件（弹窗、分段仪表、SNMP 配置等）
开发01_数据库建表SQL_MySQL8.sql   后端建表脚本（MySQL 8）
开发02_REST接口文档.md            REST 接口契约
阶段一_开源方案调研报告.md
阶段二_自研方案整体规划.md
REDME.md                  需求原文
```

## 文档

- 后端设计：`开发01_数据库建表SQL_MySQL8.sql`、`开发02_REST接口文档.md`
- 方案与调研：`阶段一_开源方案调研报告.md`、`阶段二_自研方案整体规划.md`
- 需求：`REDME.md`
