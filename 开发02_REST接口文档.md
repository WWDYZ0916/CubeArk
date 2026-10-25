# CubeArk（立方仓）REST 接口文档

> 版本：v1.0（2026-10-22） | Base URL：`http://192.168.8.68:8080/api/v1`（Nginx → cubeark-server:18080）
> 数据契约对齐：[开发01_数据库建表SQL_MySQL8.sql](开发01_数据库建表SQL_MySQL8.sql)
> 约定：全部 JSON（除文件上传/下载）；时间 `YYYY-MM-DD HH:mm:ss`（UTC+8）

---

## 一、通用约定

### 1.1 认证
- 登录获取 JWT：`Authorization: Bearer <token>`（有效期 2h，Refresh 7d）
- 权限校验按权限点（`system:user:create` 等），无权限返回 `403 FORBIDDEN`
- 机房数据范围：角色 `data_scope=2` 时，所有 idc/asset/flow/scene 接口自动注入 `room_id IN (授权机房)` 过滤

### 1.2 统一响应体

```json
{ "code": 0, "message": "ok", "data": { } }
```

### 1.3 分页请求/响应

请求：`?page=1&page_size=20&sort=created_at&order=desc`
响应 data：`{ "list": [...], "total": 123, "page": 1, "page_size": 20 }`

### 1.4 错误码表

| code | HTTP | 含义 |
|------|------|------|
| 0 | 200 | 成功 |
| 1001 | 400 | 参数错误（message 含字段明细） |
| 1002 | 401 | 未登录/令牌过期 |
| 1003 | 403 | 无权限 |
| 1004 | 404 | 资源不存在 |
| 1005 | 409 | 业务冲突（SN重复/U位冲突/状态机非法流转，见 message） |
| 1006 | 423 | 账号锁定 |
| 5000 | 500 | 服务端错误 |

### 1.5 审计
所有非 GET 请求自动写入 `sys_operation_log`（用户、模块、动作、对象、参数摘要、IP、结果），业务代码无感知。

---

## 二、认证模块 /auth

### 2.1 登录
`POST /auth/login` （免鉴权；验证码 MVP 可关）
```json
{ "username": "admin", "password": "******" }
```
```json
{ "code": 0, "data": {
  "token": "eyJhbGci...", "refresh_token": "eyJhbGci...",
  "expire_in": 7200,
  "user": { "id": 1, "username": "admin", "real_name": "超级管理员",
            "roles": ["ROLE_ADMIN"],
            "permissions": ["system:user:list", "..."] }
}}
```
> 连续失败 5 次锁定 15 分钟（`1006`）。

### 2.2 登出 `POST /auth/logout`（令牌加入黑名单）
### 2.3 刷新令牌 `POST /auth/refresh` `{ "refresh_token": "..." }`
### 2.4 当前用户信息 `GET /auth/profile`
### 2.5 修改自己的密码 `PUT /auth/password` `{ "old_password": "", "new_password": "" }`（首次登录强制修改）

---

## 三、系统管理 /system

### 3.1 用户（权限点：system:user:*）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /system/users | user:list | 分页；过滤 `username/real_name/dept_id/status` |
| POST | /system/users | user:create | 建用户并初始角色 |
| PUT | /system/users/{id} | user:update | 修改资料/状态 |
| DELETE | /system/users/{id} | user:delete | 软删 |
| PUT | /system/users/{id}/password | user:reset-pwd | 管理员重置密码 |

创建示例：
```json
{ "username": "zhangsan", "real_name": "张三", "dept_id": 2,
  "mobile": "138...", "email": "z@x.com", "role_ids": [2] }
```
> 创建时可不传密码，系统生成随机密码返回一次（`data.init_password`）。

### 3.2 角色（system:role:*）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /system/roles | 列表（含权限码、数据范围、授权机房） |
| POST / PUT / DELETE | /system/roles[/{id}] | CRUD |
| PUT | /system/roles/{id}/permissions | `{ "permission_codes": ["idc:room:list", ...] }` |
| PUT | /system/roles/{id}/rooms | `{ "room_ids": [1,2] }`（data_scope=2 生效） |

### 3.3 部门（system:dept:*）：GET/POST/PUT/DELETE `/system/depts`（树形返回）
### 3.4 操作日志

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /system/logs | log:list；过滤 `username/module/action/target_id/时间范围/result` |
| GET | /system/logs/export | log:export；异步导出，返回 `task_id`（见 §9） |

---

## 四、机房管理 /idc

### 4.1 机房（idc:room:*）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /idc/rooms | 列表；含机柜数/设备数统计 |
| POST | /idc/rooms | `{ "code": "HF-IDC-01", "name": "合肥一号机房", "floor": "3F", "address": "..." }` |
| PUT / DELETE | /idc/rooms/{id} | 删除前校验：机房下有机柜则 `1005` |

### 4.2 机柜（idc:rack:*）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /idc/racks | 分页；过滤 `room_id/row_no/keyword`；含 `usage_pct`（取自 v_rack_usage） |
| POST | /idc/racks | **创建后自动批量生成 U 位记录** |
| PUT | /idc/racks/{id} | 修改信息/**3D 坐标**（拖拽保存位调用） |
| DELETE | /idc/racks/{id} | 校验：U 位有占用则 `1005` |
| GET | /idc/racks/{id}/u-slots | 全部 U 位（U号/状态/占用设备摘要）——2D 机柜视图数据源 |

创建示例：
```json
{ "room_id": 1, "code": "A01", "row_no": 1, "col_no": 1,
  "u_total": 42, "pos_x": -6.0, "pos_y": 0, "pos_z": -2.0, "rotation_y": 0,
  "power_kw": 6.0 }
```

---

## 五、资产管理 /asset

### 5.1 设备型号（asset:model:*）：GET/POST/PUT/DELETE `/asset/models[/{id}]`
字段与建表一致；`face_port_json` 示例（3D 面板渲染）：
```json
{ "front": [ {"port":"eth0","type":"rj45","x":1,"y":0}, {"port":"eth1","type":"rj45","x":2,"y":0} ],
  "rear":  [ {"port":"psu1","type":"c13","x":0,"y":0} ] }
```

### 5.2 设备台账（asset:device:*）

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /asset/devices | device:list | 分页；过滤 `sn/keyword(名称·SN·IP)/category/status/rack_id/room_id/dept_id/维保到期<=今天` |
| GET | /asset/devices/{id} | device:detail | 全字段+型号+位置+最新快照摘要+在途流转单 |
| POST | /asset/devices | device:create | SN 唯一校验（重复→1005） |
| PUT | /asset/devices/{id} | device:update | 台账字段；**位置/状态只允许经流转单变更**（直接改返回1005） |
| DELETE | /asset/devices/{id} | device:delete | 软删；在用设备禁止（1005） |
| POST | /asset/devices/import | device:import | Excel 上传→创建异步任务，返回 `task_id` |
| GET | /asset/devices/export | device:export | 按当前过滤条件异步导出，返回 `task_id` |
| GET | /asset/devices/{id}/timeline | device:detail | 设备履历：流转记录+配置变更时间轴 |

创建示例：
```json
{ "sn": "SN20260101001", "name": "虚拟化节点01", "hostname": "node01",
  "model_id": 1, "manage_ip": "192.168.10.11",
  "owner_dept_id": 2, "owner_user": "张三",
  "warranty_start": "2026-01-01", "warranty_end": "2029-01-01",
  "storage_location": "库房A-01", "ext_json": {"用途":"虚拟化"} }
```

### 5.3 配置快照（asset:snapshot:*）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /asset/devices/{id}/snapshots | 快照版本列表（版本号/来源/哈希/时间/录入人） |
| POST | /asset/devices/{id}/snapshots | `{ "source": 1, "content": "JSON或文本" }`；自动 version+1，与上一版 hash 相同则 1005"无变化"；差异自动写 `asset_config_change` |
| GET | /asset/devices/{id}/snapshots/{version} | 单版全文（大文本走 file_path 下载） |
| DELETE | /asset/devices/{id}/snapshots/{version} | 软删（管理员） |
| GET | /asset/devices/{id}/snapshots/diff?from=2&to=3 | 结构化 diff（键级增删改） |
| GET | /asset/devices/{id}/config-changes | 变更历史列表 |

---

## 六、出入流转 /flow（核心状态机）

### 6.1 单据生命周期
```
草稿(0) --submit--> 待审批(1) --approve--> 已完成(4)[事务执行]
                        --reject--> 已驳回(3)
草稿/待审批 --cancel--> 已取消(5)
（多级审批预留：1 -> 审批中(2) -> 4）
```

### 6.2 接口

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| GET | /flow/orders | order:list | 分页；过滤 `order_type/status/applicant_id/时间范围/keyword(单号·SN)` |
| GET | /flow/orders/{id} | order:detail | 主单+明细（设备、前后位置、执行结果）+审批记录+附件 |
| POST | /flow/orders | order:create | 按类型创建（见 6.3） |
| POST | /flow/orders/{id}/submit | order:submit | 提交审批（校验明细设备状态合法） |
| POST | /flow/orders/{id}/approve | order:approve | `{ "action": 1, "comment": "同意" }`；action=1 通过→自动执行；2 驳回 |
| POST | /flow/orders/{id}/execute | order:execute | 重试失败明细（审批通过但个别冲突跳过后补执行） |
| POST | /flow/orders/{id}/cancel | order:cancel | 申请人/管理员取消 |
| GET | /flow/orders/export | order:export | 异步导出 |

### 6.3 创建单据（按 order_type 的差异字段）

**入库（order_type=1）**——设备可现场新建或选在途：
```json
{ "order_type": 1, "expect_date": "2026-10-25", "reason": "新采购到货",
  "items": [ { "device_id": 101, "to_location": "库房A-02" } ],
  "new_devices": [ { "sn": "SN...", "model_id": 1, "storage_location": "库房A-02" } ] }
```

**上架（4）**——3D 拖拽落单与表单落单同接口：
```json
{ "order_type": 4, "reason": "业务扩容上架",
  "items": [ { "device_id": 101, "rack_id": 1, "u_start": 20, "u_end": 21 } ] }
```
> 服务端预检：设备须为"在库"；U 段在界内且空闲；型号 U 高度匹配。审批通过后事务执行：锁机柜行→写 `idc_rack_u.device_id`（u_start..u_end）→ 设备 status=2 在用、回写 rack/room/U 段。

**下架（5）**：items 仅 `device_id` + `to_location`(库房架位)；执行=释放 U 位、status=1 在库。
**调拨（3）**：`from_room_id/to_room_id` + items（源机柜 U 段可选）；执行=下架+目标上架两阶段，任一失败整单回滚。
**出库（2）**：执行= status=5 已出库（记录去向 reason）。
**报废（6）**：附件必须；执行= status=6 报废、释放 U 位、台账只读。

### 6.4 审批待办
`GET /flow/orders?status=1`（工作台轮询）；MVP 单级审批（node_seq=1）。

---

## 七、3D 场景 /scene（独立于列表接口，整包返回+Redis缓存60s，写操作主动失效）

### 7.1 机房总览（L1）
`GET /scene/rooms/{id}` （scene:view）
```json
{ "code": 0, "data": {
  "room": { "id": 1, "name": "合肥一号机房", "floor": "3F" },
  "racks": [
    { "id": 1, "code": "A01", "row_no": 1, "col_no": 1, "u_total": 42,
      "pos": { "x": -6.0, "y": 0, "z": -2.0 }, "rotation_y": 0,
      "used_u": 30, "usage_pct": 71.4,
      "health": 1,            // 1正常 2告警(有故障设备)
      "alarm_count": 0 } ],
  "meta": { "generated_at": "2026-10-22 10:00:00", "cache": "hit" }
}}
```

### 7.2 单机柜 U 位（L2，点击机柜进入）
`GET /scene/racks/{id}` （scene:view）
```json
{ "code": 0, "data": {
  "rack": { "id": 1, "code": "A01", "u_total": 42 },
  "u_slots": [
    { "u_no": 42, "status": 1, "device": {
        "id": 101, "sn": "SN...", "name": "核心交换", "category": 2,
        "model": { "vendor": "华为", "model": "CE6865", "u_height": 1,
                   "model3d_key": null, "face_port": { "front": [], "rear": [] } },
        "status": 2, "manage_ip": "192.168.10.1", "health": 1 } },
    { "u_no": 41, "status": 0, "device": null } ] }}
```

### 7.3 拖拽上架预检（前端拖入时调用，轻量）
`POST /scene/racks/{id}/check-u`
```json
{ "device_id": 101, "u_start": 20 }
→ { "code": 0, "data": { "ok": true, "u_end": 21, "conflicts": [] } }
→ { "code": 1005, "message": "U20-U21 与 SN2026... 冲突" }
```

---

## 八、附件 /attachments

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /attachments | multipart `file + biz_type + biz_id`；限 20MB/个；白名单后缀（jpg/png/pdf/xlsx/xlsx/txt/conf/glb/gltf） |
| GET | /attachments/{id}/file | 下载（鉴权） |
| GET | /attachments?biz_type=flow_order&biz_id=11 | 列表 |
| DELETE | /attachments/{id} | 上传者/管理员 |

---

## 九、异步任务 /tasks（Excel导入导出、日志导出等）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /tasks | 我的任务列表（task:list） |
| GET | /tasks/{id} | `{ "status": 1, "progress": 60, "error_msg": null }` 前端轮询 |
| GET | /tasks/{id}/file | 成功后下载产物（结果 Excel） |

导入结果示例（任务完成后 result_file 内含错误行明细）：
```
第3行: SN重复 SN20260101001；第7行: model_id 不存在
```

---

## 十、附录：枚举字典（与建表 SQL COMMENT 一致）

| 枚举 | 取值 |
|------|------|
| 设备分类 category | 1服务器 2交换机 3PDU 4存储 5其他 |
| 设备状态 status | 1在库 2在用 3维修 4备用 5已出库 6报废 |
| 单据类型 order_type | 1入库 2出库 3调拨 4上架 5下架 6报废 |
| 单据状态 status | 0草稿 1待审批 2审批中 3已驳回 4已完成 5已取消 |
| U位状态 | 0空闲 1占用 2预留 |
| 数据范围 data_scope | 1全部机房 2授权机房 3本部门 |
| 审批动作 action | 1同意 2驳回 3撤回 |
| 快照来源 source | 1手工 2批量导入 3自动采集 |
| 明细执行结果 exec_result | 0待执行 1成功 2失败 3冲突跳过 |
| 任务状态 | 0排队 1执行中 2成功 3失败 |

---

*下一交付物：前端 3D Demo 代码（Three.js 场景：L1 机房总览 + L2 机柜 U 位 + 拖拽预检）。*
