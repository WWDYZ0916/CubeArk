-- =====================================================================
-- CubeArk（立方仓）3D机房设备资产管理平台
-- 数据库建表 SQL（MySQL 8.0 / InnoDB / utf8mb4）
-- 交付物编号：开发01   依据：《阶段二_自研方案整体规划.md》§3 ER设计
-- 日期：2026-10-22
--
-- 使用方式（目标机或部署机执行）：
--   mysql --default-character-set=utf8mb4 -h127.0.0.1 -uroot -p < 本文件
--
-- 约定：
--   1. 无物理外键（逻辑外键 + 索引），关联一致性由后端事务（机柜行锁）保证，
--      便于备份迁移与批量导入；如需物理外键可参考文末附注。
--   2. 公共字段：id BIGINT UNSIGNED PK / created_at / updated_at / deleted_at(软删)。
--   3. 状态类字段统一 TINYINT，取值见每列 COMMENT。
--   4. 密码不硬编码：sys_user 初始口令占位符由安装脚本/管理命令替换（见文末说明）。
-- =====================================================================

SET NAMES utf8mb4;
SET TIME_ZONE = '+08:00';

CREATE DATABASE IF NOT EXISTS `cubeark`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `cubeark`;

-- =====================================================================
-- 一、系统权限域 sys_*
-- =====================================================================

-- 1. 部门/分组（树形）
CREATE TABLE `sys_dept` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `parent_id`  BIGINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '父部门ID,0=根',
  `name`       VARCHAR(64)  NOT NULL COMMENT '部门名称',
  `sort`       INT          NOT NULL DEFAULT 0 COMMENT '排序',
  `status`     TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `remark`     VARCHAR(255) DEFAULT NULL COMMENT '备注',
  `created_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3)  DEFAULT NULL COMMENT '软删时间',
  PRIMARY KEY (`id`),
  KEY `idx_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='部门/分组';

-- 2. 用户
CREATE TABLE `sys_user` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `username`      VARCHAR(64)  NOT NULL COMMENT '登录名',
  `password_hash` VARCHAR(100) NOT NULL COMMENT 'bcrypt口令哈希(安装时替换占位符)',
  `real_name`     VARCHAR(64)  DEFAULT NULL COMMENT '姓名',
  `mobile`        VARCHAR(20)  DEFAULT NULL COMMENT '手机号',
  `email`         VARCHAR(128) DEFAULT NULL COMMENT '邮箱',
  `dept_id`       BIGINT UNSIGNED DEFAULT NULL COMMENT '部门ID→sys_dept.id',
  `status`        TINYINT      NOT NULL DEFAULT 1 COMMENT '1启用 2锁定 0禁用',
  `fail_count`    INT          NOT NULL DEFAULT 0 COMMENT '连续登录失败次数',
  `locked_until`  DATETIME(3)  DEFAULT NULL COMMENT '锁定截止时间',
  `last_login_at` DATETIME(3)  DEFAULT NULL COMMENT '最后登录时间',
  `last_login_ip` VARCHAR(64)  DEFAULT NULL COMMENT '最后登录IP',
  `created_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at`    DATETIME(3)  DEFAULT NULL COMMENT '软删时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_dept` (`dept_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户';

-- 3. 角色
CREATE TABLE `sys_role` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `code`       VARCHAR(32) NOT NULL COMMENT '角色编码',
  `name`       VARCHAR(64) NOT NULL COMMENT '角色名称',
  `data_scope` TINYINT     NOT NULL DEFAULT 1 COMMENT '数据范围:1全部机房 2授权机房 3本部门',
  `remark`     VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色';

-- 4. 用户-角色
CREATE TABLE `sys_user_role` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '→sys_user.id',
  `role_id`    BIGINT UNSIGNED NOT NULL COMMENT '→sys_role.id',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_role` (`user_id`, `role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户角色关联';

-- 5. 权限点
CREATE TABLE `sys_permission` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(64) NOT NULL COMMENT '权限点:模块:动作 如 device:create',
  `name`       VARCHAR(64) NOT NULL COMMENT '名称',
  `module`     VARCHAR(32) NOT NULL COMMENT '所属模块 system/idc/asset/flow/scene/task',
  `sort`       INT NOT NULL DEFAULT 0,
  `remark`     VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_module` (`module`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='权限点';

-- 6. 角色-权限
CREATE TABLE `sys_role_permission` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id`       BIGINT UNSIGNED NOT NULL COMMENT '→sys_role.id',
  `permission_id` BIGINT UNSIGNED NOT NULL COMMENT '→sys_permission.id',
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_perm` (`role_id`, `permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色权限关联';

-- 7. 角色-机房数据范围
CREATE TABLE `sys_role_room` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `role_id`    BIGINT UNSIGNED NOT NULL COMMENT '→sys_role.id',
  `room_id`    BIGINT UNSIGNED NOT NULL COMMENT '→idc_room.id',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_room` (`role_id`, `room_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='角色机房数据范围(data_scope=2时生效)';

-- 8. 操作日志（全量审计,只增不改,按月归档）
CREATE TABLE `sys_operation_log` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL COMMENT '操作人ID',
  `username`   VARCHAR(64) NOT NULL COMMENT '操作人名(冗余,防删号失义)',
  `module`     VARCHAR(32) NOT NULL COMMENT 'system/idc/asset/flow/common',
  `action`     VARCHAR(64) NOT NULL COMMENT '如 device:create / order:approve',
  `target_type` VARCHAR(32) DEFAULT NULL COMMENT '对象类型 device/order/rack/user...',
  `target_id`  VARCHAR(64) DEFAULT NULL COMMENT '对象ID(字符串兼容单号)',
  `detail`     JSON DEFAULT NULL COMMENT '关键参数与变更前后摘要',
  `ip`         VARCHAR(64)  DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `result`     TINYINT NOT NULL DEFAULT 1 COMMENT '1成功 0失败',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_user_time` (`user_id`, `created_at`),
  KEY `idx_module_action` (`module`, `action`),
  KEY `idx_target` (`target_type`, `target_id`),
  KEY `idx_time` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='操作日志(审计)';

-- =====================================================================
-- 二、机房物理域 idc_*
-- =====================================================================

-- 9. 机房
CREATE TABLE `idc_room` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `code`       VARCHAR(32) NOT NULL COMMENT '机房编码',
  `name`       VARCHAR(64) NOT NULL COMMENT '机房名称',
  `floor`      VARCHAR(16) DEFAULT NULL COMMENT '楼层',
  `address`    VARCHAR(255) DEFAULT NULL COMMENT '位置',
  `status`     TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `remark`     VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机房';

-- 10. 机柜（含3D坐标）
CREATE TABLE `idc_rack` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_id`    BIGINT UNSIGNED NOT NULL COMMENT '→idc_room.id',
  `code`       VARCHAR(32) NOT NULL COMMENT '机柜编号(机房内唯一)',
  `row_no`     INT NOT NULL DEFAULT 1 COMMENT '排(1..n,对应A/B/C列)',
  `col_no`     INT NOT NULL DEFAULT 1 COMMENT '列',
  `u_total`    SMALLINT NOT NULL DEFAULT 42 COMMENT 'U高度(42/47等)',
  `pos_x`      DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '3D场景X坐标',
  `pos_y`      DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '3D场景Y坐标',
  `pos_z`      DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '3D场景Z坐标',
  `rotation_y` DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '朝向角(度)',
  `power_kw`   DECIMAL(8,2) DEFAULT NULL COMMENT '额定功率kW',
  `status`     TINYINT NOT NULL DEFAULT 1 COMMENT '1启用 0停用',
  `remark`     VARCHAR(255) DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_room_code` (`room_id`, `code`),
  KEY `idx_room` (`room_id`),
  KEY `idx_rowcol` (`room_id`, `row_no`, `col_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='机柜';

-- 11. U位（机柜创建时批量生成；上架=占用device_id,下架=置NULL）
CREATE TABLE `idc_rack_u` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `rack_id`    BIGINT UNSIGNED NOT NULL COMMENT '→idc_rack.id',
  `u_no`       SMALLINT NOT NULL COMMENT 'U位号,从下往上1..u_total',
  `device_id`  BIGINT UNSIGNED DEFAULT NULL COMMENT '占用设备→asset_device.id,NULL=空闲',
  `status`     TINYINT NOT NULL DEFAULT 0 COMMENT '0空闲 1占用 2预留',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_rack_u` (`rack_id`, `u_no`),
  KEY `idx_device` (`device_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='U位(派生数据,无软删)';

-- =====================================================================
-- 三、资产配置域 asset_*
-- =====================================================================

-- 12. 设备型号（NetBox DeviceType 思路）
CREATE TABLE `asset_device_model` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `vendor`        VARCHAR(64) NOT NULL COMMENT '厂商',
  `model`         VARCHAR(64) NOT NULL COMMENT '型号',
  `category`      TINYINT NOT NULL DEFAULT 1 COMMENT '1服务器 2交换机 3PDU 4存储 5其他',
  `u_height`      SMALLINT NOT NULL DEFAULT 1 COMMENT '占用U高度',
  `depth_mm`      INT DEFAULT NULL COMMENT '深度mm',
  `power_w`       INT DEFAULT NULL COMMENT '额定功率W',
  `face_port_json` JSON DEFAULT NULL COMMENT '前/后面板端口模板(3D面板渲染)',
  `model3d_key`   VARCHAR(64) DEFAULT NULL COMMENT '3D模型库键→文件存储models目录',
  `remark`        VARCHAR(255) DEFAULT NULL,
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at`    DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_vendor_model` (`vendor`, `model`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='设备型号';

-- 13. 资产设备台账（核心表）
CREATE TABLE `asset_device` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `sn`             VARCHAR(64) NOT NULL COMMENT '序列号,全库唯一',
  `name`           VARCHAR(64) DEFAULT NULL COMMENT '资产名称',
  `hostname`       VARCHAR(64) DEFAULT NULL COMMENT '主机名',
  `model_id`       BIGINT UNSIGNED NOT NULL COMMENT '→asset_device_model.id',
  `category`       TINYINT NOT NULL DEFAULT 1 COMMENT '冗余型号分类:1服务器 2交换机 3PDU 4存储 5其他',
  `status`         TINYINT NOT NULL DEFAULT 1 COMMENT '1在库 2在用 3维修 4备用 5已出库 6报废',
  `rack_id`        BIGINT UNSIGNED DEFAULT NULL COMMENT '所在机柜→idc_rack.id,在库为NULL',
  `u_start`        SMALLINT DEFAULT NULL COMMENT '起始U(含),在库为NULL',
  `u_end`          SMALLINT DEFAULT NULL COMMENT '结束U(含)',
  `room_id`        BIGINT UNSIGNED DEFAULT NULL COMMENT '冗余机房→idc_room.id',
  `storage_location` VARCHAR(128) DEFAULT NULL COMMENT '库房架位(在库时使用)',
  `manage_ip`      VARCHAR(64) DEFAULT NULL COMMENT '管理IP',
  `owner_dept_id`  BIGINT UNSIGNED DEFAULT NULL COMMENT '责任部门→sys_dept.id',
  `owner_user`     VARCHAR(64) DEFAULT NULL COMMENT '责任人姓名/账号',
  `warranty_start` DATE DEFAULT NULL COMMENT '维保开始',
  `warranty_end`   DATE DEFAULT NULL COMMENT '维保结束(到期提醒)',
  `purchase_date`  DATE DEFAULT NULL COMMENT '采购日期',
  `price`          DECIMAL(12,2) DEFAULT NULL COMMENT '价格(元)',
  `ext_json`       JSON DEFAULT NULL COMMENT '自定义扩展属性',
  `remark`         VARCHAR(255) DEFAULT NULL,
  `created_at`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `deleted_at`     DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_sn` (`sn`),
  KEY `idx_status_cat` (`status`, `category`),
  KEY `idx_rack_u` (`rack_id`, `u_start`),
  KEY `idx_room` (`room_id`),
  KEY `idx_dept` (`owner_dept_id`),
  KEY `idx_warranty` (`warranty_end`),
  KEY `idx_ip` (`manage_ip`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='资产设备台账';

-- 14. 配置快照（版本化,只增）
CREATE TABLE `asset_config_snapshot` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_id`  BIGINT UNSIGNED NOT NULL COMMENT '→asset_device.id',
  `version`    INT NOT NULL COMMENT '设备内版本号,自增',
  `source`     TINYINT NOT NULL DEFAULT 1 COMMENT '1手工 2批量导入 3自动采集',
  `content`    LONGTEXT DEFAULT NULL COMMENT '快照原文(JSON/文本,>64KB建议落盘)',
  `file_path`  VARCHAR(255) DEFAULT NULL COMMENT '快照文件路径(大快照落盘时)',
  `hash`       CHAR(32) DEFAULT NULL COMMENT '内容MD5(去重/变更判断)',
  `created_by` BIGINT UNSIGNED DEFAULT NULL COMMENT '录入人',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_ver` (`device_id`, `version`),
  KEY `idx_hash` (`hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='配置快照';

-- 15. 配置变更历史（只增）
CREATE TABLE `asset_config_change` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `device_id`        BIGINT UNSIGNED NOT NULL COMMENT '→asset_device.id',
  `from_version`     INT NOT NULL COMMENT '旧版本',
  `to_version`       INT NOT NULL COMMENT '新版本',
  `diff_summary`     TEXT DEFAULT NULL COMMENT '差异摘要(结构化diff)',
  `related_order_no` VARCHAR(32) DEFAULT NULL COMMENT '关联流转单号(谁在何时因何变更)',
  `created_by`       BIGINT UNSIGNED DEFAULT NULL,
  `created_at`       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_device_ver` (`device_id`, `to_version`),
  KEY `idx_order` (`related_order_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='配置变更历史';

-- =====================================================================
-- 四、出入流转域 flow_*
-- =====================================================================

-- 16. 出入库流转单
CREATE TABLE `flow_order` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_no`     VARCHAR(32) NOT NULL COMMENT '单号 RK/CK/DB/SJ/XJ/BF+yyyyMMdd+4位序号',
  `order_type`   TINYINT NOT NULL COMMENT '1入库 2出库 3调拨 4上架 5下架 6报废',
  `status`       TINYINT NOT NULL DEFAULT 0 COMMENT '0草稿 1待审批 2审批中 3已驳回 4已完成 5已取消',
  `applicant_id` BIGINT UNSIGNED NOT NULL COMMENT '申请人→sys_user.id',
  `from_room_id` BIGINT UNSIGNED DEFAULT NULL COMMENT '源机房(调拨/下架用)',
  `to_room_id`   BIGINT UNSIGNED DEFAULT NULL COMMENT '目标机房(调拨/上架用)',
  `expect_date`  DATETIME(3) DEFAULT NULL COMMENT '期望执行日期',
  `finish_time`  DATETIME(3) DEFAULT NULL COMMENT '实际完成时间',
  `reason`       VARCHAR(512) DEFAULT NULL COMMENT '事由',
  `remark`       VARCHAR(512) DEFAULT NULL,
  `created_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_type_status` (`order_type`, `status`),
  KEY `idx_applicant` (`applicant_id`, `created_at`),
  KEY `idx_status_time` (`status`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='出入流转单';

-- 17. 流转明细
CREATE TABLE `flow_order_item` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`      BIGINT UNSIGNED NOT NULL COMMENT '→flow_order.id',
  `device_id`     BIGINT UNSIGNED NOT NULL COMMENT '→asset_device.id',
  `from_location` VARCHAR(128) DEFAULT NULL COMMENT '变更前位置(机房-机柜-U段/库房架位)',
  `to_location`   VARCHAR(128) DEFAULT NULL COMMENT '变更后位置',
  `before_status` TINYINT DEFAULT NULL COMMENT '设备状态变迁前(1在库2在用...)',
  `after_status`  TINYINT DEFAULT NULL COMMENT '变迁后',
  `exec_result`   TINYINT NOT NULL DEFAULT 0 COMMENT '0待执行 1成功 2失败 3冲突跳过',
  `exec_note`     VARCHAR(255) DEFAULT NULL COMMENT '执行备注(失败原因等)',
  `created_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_device` (`order_id`, `device_id`),
  KEY `idx_device` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='流转明细';

-- 18. 审批记录（按node_seq支持多级,MVP单级）
CREATE TABLE `flow_approval` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id`    BIGINT UNSIGNED NOT NULL COMMENT '→flow_order.id',
  `node_seq`    SMALLINT NOT NULL DEFAULT 1 COMMENT '审批节点序号',
  `approver_id` BIGINT UNSIGNED NOT NULL COMMENT '审批人→sys_user.id',
  `action`      TINYINT NOT NULL COMMENT '1同意 2驳回 3撤回',
  `comment`     VARCHAR(512) DEFAULT NULL COMMENT '审批意见',
  `acted_at`    DATETIME(3) DEFAULT NULL COMMENT '操作时间',
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_node` (`order_id`, `node_seq`),
  KEY `idx_approver` (`approver_id`, `acted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='审批记录';

-- =====================================================================
-- 五、通用域 common_*
-- =====================================================================

-- 19. 附件
CREATE TABLE `common_attachment` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `biz_type`    VARCHAR(32) NOT NULL COMMENT '业务类型 flow_order/device/snapshot/model3d',
  `biz_id`      BIGINT UNSIGNED NOT NULL COMMENT '业务ID',
  `file_name`   VARCHAR(255) NOT NULL COMMENT '原始文件名',
  `file_path`   VARCHAR(255) NOT NULL COMMENT '存储相对路径 data/attach/...',
  `file_size`   BIGINT NOT NULL DEFAULT 0 COMMENT '字节',
  `file_hash`   CHAR(32) DEFAULT NULL COMMENT 'SHA256/32位哈希(秒传去重可选)',
  `uploader_id` BIGINT UNSIGNED DEFAULT NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deleted_at`  DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_biz` (`biz_type`, `biz_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='附件';

-- 20. 异步任务（Excel导入导出/快照比对/归档）
CREATE TABLE `biz_task` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `task_type`   VARCHAR(32) NOT NULL COMMENT 'excel_import/excel_export/snapshot_diff/log_archive',
  `status`      TINYINT NOT NULL DEFAULT 0 COMMENT '0排队 1执行中 2成功 3失败',
  `progress`    TINYINT NOT NULL DEFAULT 0 COMMENT '进度0-100',
  `param_json`  JSON DEFAULT NULL COMMENT '任务参数',
  `result_file` VARCHAR(255) DEFAULT NULL COMMENT '产物文件(导出xlsx路径等)',
  `error_msg`   VARCHAR(512) DEFAULT NULL,
  `requested_by` BIGINT UNSIGNED DEFAULT NULL,
  `started_at`  DATETIME(3) DEFAULT NULL,
  `finished_at` DATETIME(3) DEFAULT NULL,
  `created_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_user` (`requested_by`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='异步任务';

-- =====================================================================
-- 六、视图（列表/大屏提速）
-- =====================================================================

CREATE OR REPLACE VIEW `v_rack_usage` AS
SELECT r.id AS rack_id, rm.id AS room_id, rm.name AS room_name,
       r.code AS rack_code, r.u_total,
       COUNT(CASE WHEN u.status = 1 THEN 1 END) AS used_u,
       ROUND(COUNT(CASE WHEN u.status = 1 THEN 1 END) / r.u_total * 100, 1) AS usage_pct
FROM idc_rack r
JOIN idc_room rm ON rm.id = r.room_id AND rm.deleted_at IS NULL
LEFT JOIN idc_rack_u u ON u.rack_id = r.id
WHERE r.deleted_at IS NULL
GROUP BY r.id, rm.id, rm.name, r.code, r.u_total;

CREATE OR REPLACE VIEW `v_device_full` AS
SELECT d.id, d.sn, d.name, d.hostname, d.category, d.status,
       m.vendor, m.model AS model_name, m.u_height,
       rm.name AS room_name, rk.code AS rack_code,
       d.u_start, d.u_end, d.manage_ip, d.owner_user,
       d.warranty_start, d.warranty_end, d.updated_at
FROM asset_device d
LEFT JOIN asset_device_model m ON m.id = d.model_id
LEFT JOIN idc_room rm ON rm.id = d.room_id
LEFT JOIN idc_rack rk ON rk.id = d.rack_id
WHERE d.deleted_at IS NULL;

-- =====================================================================
-- 七、初始化数据
-- =====================================================================

-- 7.1 部门
INSERT INTO `sys_dept` (`id`, `parent_id`, `name`, `sort`) VALUES
(1, 0, '总部', 1),
(2, 1, '运维部', 1);

-- 7.2 超级管理员（口令占位符,安装脚本必须替换,见文末"初始口令说明"）
INSERT INTO `sys_user` (`id`, `username`, `password_hash`, `real_name`, `dept_id`, `status`) VALUES
(1, 'admin', '__ADMIN_PASSWORD_HASH__', '超级管理员', 2, 1);

-- 7.3 角色
INSERT INTO `sys_role` (`id`, `code`, `name`, `data_scope`, `remark`) VALUES
(1, 'ROLE_ADMIN',   '超级管理员', 1, '全部权限,全部机房'),
(2, 'ROLE_MANAGER', '机房管理员', 2, '业务权限,授权机房范围'),
(3, 'ROLE_VIEWER',  '只读用户',   2, '仅查询与3D查看,授权机房范围');

INSERT INTO `sys_user_role` (`user_id`, `role_id`) VALUES (1, 1);

-- 7.4 权限点
INSERT INTO `sys_permission` (`code`, `name`, `module`, `sort`) VALUES
-- system
('system:user:list',      '用户查询',   'system', 101),
('system:user:create',    '用户新增',   'system', 102),
('system:user:update',    '用户修改',   'system', 103),
('system:user:delete',    '用户删除',   'system', 104),
('system:user:reset-pwd', '重置密码',   'system', 105),
('system:role:list',      '角色查询',   'system', 111),
('system:role:create',    '角色新增',   'system', 112),
('system:role:update',    '角色修改',   'system', 113),
('system:role:delete',    '角色删除',   'system', 114),
('system:dept:list',      '部门查询',   'system', 121),
('system:dept:create',    '部门新增',   'system', 122),
('system:dept:update',    '部门修改',   'system', 123),
('system:dept:delete',    '部门删除',   'system', 124),
('system:log:list',       '日志查询',   'system', 131),
('system:log:export',     '日志导出',   'system', 132),
-- idc
('idc:room:list',         '机房查询',   'idc', 201),
('idc:room:create',       '机房新增',   'idc', 202),
('idc:room:update',       '机房修改',   'idc', 203),
('idc:room:delete',       '机房删除',   'idc', 204),
('idc:rack:list',         '机柜查询',   'idc', 211),
('idc:rack:create',       '机柜新增',   'idc', 212),
('idc:rack:update',       '机柜修改',   'idc', 213),
('idc:rack:delete',       '机柜删除',   'idc', 214),
-- asset
('asset:model:list',      '型号查询',   'asset', 301),
('asset:model:create',    '型号新增',   'asset', 302),
('asset:model:update',    '型号修改',   'asset', 303),
('asset:model:delete',    '型号删除',   'asset', 304),
('asset:device:list',     '设备查询',   'asset', 311),
('asset:device:detail',   '设备详情',   'asset', 312),
('asset:device:create',   '设备新增',   'asset', 313),
('asset:device:update',   '设备修改',   'asset', 314),
('asset:device:delete',   '设备删除',   'asset', 315),
('asset:device:import',   '设备导入',   'asset', 316),
('asset:device:export',   '设备导出',   'asset', 317),
('asset:snapshot:list',   '快照查询',   'asset', 321),
('asset:snapshot:create', '快照录入',   'asset', 322),
('asset:snapshot:delete', '快照删除',   'asset', 323),
-- flow
('flow:order:list',       '流转单查询', 'flow', 401),
('flow:order:detail',     '流转单详情', 'flow', 402),
('flow:order:create',     '流转单创建', 'flow', 403),
('flow:order:submit',     '流转单提交', 'flow', 404),
('flow:order:approve',    '流转单审批', 'flow', 405),
('flow:order:execute',    '流转单执行', 'flow', 406),
('flow:order:cancel',     '流转单取消', 'flow', 407),
('flow:order:export',     '流转单导出', 'flow', 408),
-- scene / task
('scene:view',            '3D场景查看', 'scene', 501),
('task:list',             '任务查询',   'task',  601);

-- 7.5 角色授权
-- 超级管理员 = 全部权限
INSERT INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT 1, id FROM `sys_permission`;

-- 机房管理员 = 业务权限（无系统管理/无用户角色权限，含日志查询）
INSERT INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT 2, id FROM `sys_permission`
WHERE `module` IN ('idc', 'asset', 'flow', 'scene', 'task')
   OR `code` = 'system:log:list';

-- 只读用户 = 各模块 list/detail + 3D查看
INSERT INTO `sys_role_permission` (`role_id`, `permission_id`)
SELECT 3, id FROM `sys_permission`
WHERE `code` LIKE '%:list' OR `code` LIKE '%:detail' OR `code` = 'scene:view';

-- 7.6 常用设备型号示例（可删除）
INSERT INTO `asset_device_model` (`vendor`, `model`, `category`, `u_height`, `depth_mm`, `power_w`) VALUES
('Dell',  'R740',        1, 2, 710, 750),
('HPE',   'DL380G10',    1, 2, 700, 800),
('华为',   '2288H V5',    1, 2, 708, 550),
('华为',   'CE6865',      2, 1, 420, 350),
('Cisco', 'N9K-C93180YC',2, 1, 438, 385),
('APC',   'AP8959EU3',   3, 1, 432, 340),
('浪潮',   'AS5300G2',    4, 4, 830, 1200);

-- =====================================================================
-- 八、演示数据（默认注释,联调/演示时打开）
-- =====================================================================
-- INSERT INTO `idc_room` (`id`,`code`,`name`,`floor`,`address`) VALUES
-- (1,'HF-IDC-01','合肥一号机房','3F','合肥市xx园区');
-- INSERT INTO `idc_rack` (`id`,`room_id`,`code`,`row_no`,`col_no`,`u_total`,`pos_x`,`pos_z`) VALUES
-- (1,1,'A01',1,1,42,-6.0,-2.0),
-- (2,1,'A02',1,2,42,-3.0,-2.0);
-- U位批量生成（递归CTE,按u_total铺开）
-- INSERT INTO `idc_rack_u` (`rack_id`,`u_no`,`status`)
-- WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n < 64)
-- SELECT r.id, s.n, 0 FROM `idc_rack` r JOIN seq s ON s.n <= r.u_total;

-- =====================================================================
-- 附一：初始口令说明（不硬编码约束的落实方式）
--   方式A（推荐）：安装脚本执行管理命令生成并回写
--     /opt/cubeark/app/cubeark-server admin set-password admin '<新口令>'
--     或等价SQL：UPDATE sys_user SET password_hash='<bcrypt哈希>' WHERE username='admin';
--   方式B：部署前用工具生成bcrypt哈希替换占位符
--     htpasswd -bnBC 10 "" '你的口令' | tr -d ':\n'
--   应用侧强制：首次登录必须修改密码。
--
-- 附二：如需物理外键（可选,影响批量导入速度,默认不加）
--   ALTER TABLE asset_device ADD CONSTRAINT fk_device_rack
--     FOREIGN KEY (rack_id) REFERENCES idc_rack(id);
--   ALTER TABLE idc_rack_u ADD CONSTRAINT fk_u_device
--     FOREIGN KEY (device_id) REFERENCES asset_device(id);
--   （其余逻辑外键同理,按需追加）
--
-- 附三：日志归档策略（M5交付的cron任务）
--   每月1日将上季度 sys_operation_log 迁入 sys_operation_log_YYYYMM 归档表。
-- =====================================================================
-- SQL EOF —— 共 20 张表 + 2 视图 + 初始化数据
