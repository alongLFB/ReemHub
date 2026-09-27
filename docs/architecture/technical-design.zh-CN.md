# ReemHub 技术架构设计

| 项目 | 内容 |
| --- | --- |
| 版本 | v0.14.0（实施基线） |
| 更新日期 | 2026-09-27 |
| 对应产品文档 | [ReemHub PRD](../product/prd.zh-CN.md) |
| 架构风格 | 模块化单体（Modular Monolith） |

## 1. 文档目的

将 PRD 中已确认的产品能力落实为可实现、可维护且保护敏感资料的技术方案。本文件记录推荐技术基线、模块边界、访问控制、数据模型、接口、安全、部署和测试策略。

## 2. 设计目标与约束

### 2.1 设计目标

- 为小型、多圈子生活社群提供严格的圈子级数据隔离。
- 同时支持邮箱密码和 Google OAuth 登录，并可按邮箱安全合并身份。
- 让用户的资料字段可按圈子精细授权，尤其保护手机号和 IBAN。
- 支持活动多笔支出、精确金额计算和可追溯结算。
- 以自建、可备份、低运维复杂度为首期优先级。

### 2.2 首期约束

- 用户规模小，优先采用单个 Web 应用与单个关系型数据库，不拆分微服务。
- 支付只生成线下转账建议，不处理资金、不保存银行卡密码或支付令牌。
- 公开圈子仅在广场被发现；未加入用户只能查看圈子简介和提交申请，所有圈内内容均需要成员身份。

## 3. 总体架构

~~~text
浏览器 / 微信内置浏览器
          │ HTTPS
          ▼
Next.js App Router
  ├── 页面与 Server Actions / Route Handlers
  ├── Auth.js 身份认证
  ├── Circle / Membership / Profile Visibility 模块
  ├── Directory / Restaurant / Event / Settlement 模块
  └── Audit / Notification 模块
          │
          ▼
PostgreSQL 16+
  ├── 业务数据与认证数据
  └── 自动备份

SMTP（邮箱验证、密码重置和通知邮件）
~~~

### 3.1 推荐技术栈

| 层级 | 选择 | 理由 |
| --- | --- | --- |
| Web | Next.js App Router + React + TypeScript | 统一页面、服务端逻辑和受保护路由。 |
| UI | Tailwind CSS + shadcn/ui + Lucide | 移动端开发效率和组件一致性。 |
| 身份认证 | Auth.js v5，Credentials 与 Google Provider | 支持邮箱密码、OAuth 和账户关联。 |
| 数据库 | PostgreSQL 16+ | 强事务、约束、备份和后续查询扩展能力。 |
| ORM | Prisma | 与 Auth.js 适配成熟，迁移和类型安全清晰。 |
| 校验 | Zod | 服务端与客户端复用输入约束。 |
| 部署 | Docker Compose + Caddy/Nginx + Linux VPS | 自建、可重复部署并由反向代理终止 TLS。 |
| 邮件 | SMTP Provider | 邮箱验证、密码重置与站内通知的邮件投递。 |

项目初始化前应固化为上述单一组合，不再保留“PostgreSQL 或 MySQL”“Prisma 或 Drizzle”的二选一描述。

### 3.2 已选实施基线与参考来源

| 领域 | 最终选择 | 参考来源与采用方式 |
| --- | --- | --- |
| Web 与样式 | Next.js 16.3.5、React 19、TypeScript、Tailwind CSS 4 | 采用 lol-me-portal 的 App Router、可复用布局和移动优先页面组织。 |
| 数据与迁移 | PostgreSQL 16、Prisma 6.19 | 采用 compass_solution 的 Prisma、关系约束、事务边界和 Worker 分层。 |
| 身份认证 | Auth.js v5、Prisma Adapter、Argon2、Google OAuth | 采用 compass_solution 的 Auth.js 服务端守卫与会话失效策略，并采用 league-dashboard 的 Google 身份与既有邮箱自动关联体验。 |
| 安全 | Zod、服务端授权、AES-256-GCM、限流、AuditEvent | 参考 compass_solution 的输入校验、审计和限流；敏感字段在应用层加密。 |
| 异步通知 | 数据库通知投递记录 + Worker + SMTP / Telegram | 参考 compass_solution 的可靠异步处理模式，避免外部投递失败回滚业务事务。 |

当前已实现工程基础、Prisma Schema、邮箱验证码注册、密码与 Google 登录入口、圈子创建/发现/申请、按圈子资料可见性、服务端脱敏群友录及 AA 计算内核。餐厅、活动、账单持久化与通知 Worker 将在后续实现阶段接入同一模块边界。

### 3.3 模块边界

| 模块 | 责任 |
| --- | --- |
| Identity | 用户、密码、OAuth 身份、会话、邮箱验证与找回密码。 |
| Circle | 圈子、公开/私密可见性、邀请码、邀请链接和管理员配置。 |
| Membership | 入圈申请、审批、成员状态、角色和成员资格校验。 |
| Profile | 全局资料值与按圈子字段可见性。 |
| Directory | 仅返回当前圈子中可见的成员资料和生日聚合。 |
| Restaurant | 圈子餐厅目录、筛选与随机选择。 |
| Event Ledger | 活动、报名、候补名单、独立或活动关联的 AA 账单、Guest、支出、分摊、结算和已转账标记。 |
| Audit | 关键管理、隐私和账本操作的不可变审计事件。 |
| Notification | 站内通知、SMTP 邮件投递和失败重试。 |

模块不得直接绕过服务层访问其他模块的数据；所有圈子资源查询必须显式携带并验证 circleId。

## 4. 身份认证与访问控制

### 4.1 账户与会话

- Credentials 注册必须先完成邮箱验证码验证；密码使用 Argon2id 哈希，不存储明文。
- Google OAuth 请求 openid、email、profile 范围，并验证 ID Token 的签发者、受众、有效期及 email_verified。
- Google 身份优先按 providerAccountId 匹配；找不到时，仅在 Google 已验证邮箱与现有账户邮箱完全一致时绑定。
- 使用数据库会话或带可撤销版本号的短生命周期 JWT；会话 Cookie 必须为 HttpOnly、Secure、SameSite=Lax。
- 改密、解绑认证方式、管理员强制登出等操作应使旧会话失效。

### 4.2 圈子授权判定

每次读取或修改圈子资源时，由服务端按以下顺序判定：

1. 当前请求是否有有效平台会话；
2. 资源是否属于请求的 circleId；
3. 当前用户是否为该圈子的 ACTIVE 成员；
4. 对管理员操作，是否具备 OWNER 或 ADMIN 角色，以及该角色是否拥有此项能力；
5. 对资料字段，资料所有者是否为该 circleId 显式授予对应字段可见性；
6. 对账本操作，是否满足活动状态和对象所有权规则。

页面隐藏按钮不能替代服务端授权校验。

### 4.3 建议状态与枚举

- CircleVisibility：PUBLIC、PRIVATE
- CircleStatus：ACTIVE、DISSOLVED
- MembershipStatus：PENDING、ACTIVE、REJECTED、LEFT、REMOVED
- MembershipRole：OWNER、ADMIN、MEMBER；每个 ACTIVE 圈子恰有一位 OWNER，可有多位 ADMIN
- InvitationType：LINK、CODE
- EventStatus：OPEN、CLOSED、CANCELLED
- EventRegistrationStatus：GOING、WAITLIST、CANCELLED
- BillStatus：DRAFT、OPEN、SETTLED
- BillParticipantType：MEMBER、GUEST
- SplitMethod：EQUAL、EXACT_AMOUNT、PERCENTAGE、SHARES
- ProfileField：DISPLAY_NAME、AVATAR、BUILDING、PHONE、BANK_NAME、IBAN、BIRTHDAY

资料可见性以 MembershipProfileVisibility 记录，而不是 User 上的全局布尔字段，确保同一用户可以在不同圈子做不同选择。

## 5. 数据模型

### 5.1 核心实体关系

~~~text
User ──< AuthAccount / Session / VerificationToken
User ──< Circle (creator)
User ──< CircleMembership >── Circle
CircleMembership ──< MembershipProfileVisibility
CircleMembership ──< MembershipApplication
Circle ──< CircleInvitation
Circle ──< Restaurant
Circle ──< Event ──< EventRegistration / EventReminder
Circle ──< Bill >── Event（可选关联）
Bill ──< BillParticipant
Bill ──< Expense ──< ExpenseSplit
Bill ──< SettlementTransfer
User ──< AuditEvent
User ──< Notification ──< NotificationDelivery
User ──< UserNotificationPreference / TelegramNotificationChannel
~~~

### 5.2 关键表与约束

| 实体 | 关键字段 | 关键约束 |
| --- | --- | --- |
| User | id、email、displayName、phone、ibanCiphertext | email 唯一；敏感字段不存明文。 |
| Circle | id、name、slug、visibility、creatorId、status、dissolvedAt、purgeAt | slug 唯一；私密圈子不参与公开搜索；保留 7 天模式写入 purgeAt。 |
| CircleDissolution | circleId、initiatedById、mode、dissolvedAt、purgeAt、restoredAt | mode 为 DELETE_NOW 或 RETAIN_7_DAYS；记录二次确认后的解散及恢复生命周期。 |
| CircleMembership | circleId、userId、status、role、approvedAt、leftAt、removedAt | circleId + userId 唯一；ACTIVE 才是成员；活跃圈子仅一位 OWNER。 |
| MembershipApplication | membershipId、circleId、userId、invitationId（可空）、status、submittedAt、reviewedAt、reviewedById | 每次申请保留独立记录；同一用户在同一圈子同一时刻至多一个 PENDING 申请。 |
| MembershipProfileVisibility | membershipId、field、isVisible | membershipId + field 唯一。 |
| CircleInvitation | circleId、createdById、type、tokenHash、expiresAt、maxUses、usedCount、revokedAt | 只保存邀请令牌哈希；OWNER/ADMIN 可设置 expiresAt、maxUses；撤销立即生效。 |
| Restaurant | circleId、createdById、名称、分类、区域、金额 | 创建后即对 ACTIVE 成员可见；所有读取均按 circleId 过滤；createdById 用于内容所有权校验。 |
| Event | circleId、creatorId、status、eventTime、maxParticipants、registrationDeadline、waitlistEnabled | 人数上限和截止时间可为空；waitlistEnabled 仅在有人数上限时为真。 |
| EventRegistration | eventId、userId、status、joinedAt、waitlistedAt | eventId + userId 唯一；只允许 ACTIVE 圈子成员报名；候补按 waitlistedAt、id 稳定排序。 |
| EventReminder | eventId、offsetMinutes、scheduledAt、sentAt、cancelledAt | eventId + offsetMinutes 唯一；修改活动时间或提醒配置时取消未发送旧记录并重建。 |
| EventRosterAdjustment | eventId、targetUserId、actorId（可空）、source、beforeStatus、afterStatus、reason、createdAt | 每次手动或自动名单变化均追加一条记录；SYSTEM 调整的 actorId 为空，reason 对手动调整可选。 |
| Bill | circleId、eventId（可空）、creatorId、status、title | 可独立存在或关联一个 Event；SETTLED 默认不可修改。 |
| BillParticipant | billId、type、userId（可空）、guestName（可空）、displayNameSnapshot | MEMBER 对应圈内用户；GUEST 只保存该账单内的名称，不创建账户或成员资格。 |
| Expense | billId、payerParticipantId、amountAed、title、splitMethod | 金额大于 0；付款人指向 BillParticipant。 |
| ExpenseSplit | expenseId、participantId、amountAed、inputPercentage、inputShares | expenseId + participantId 唯一；amountAed 是最终分摊金额，分摊总额等于支出。 |
| SettlementTransfer | billId、fromParticipantId、toParticipantId、amountAed、status | 金额大于 0；转账标记须记录操作者和时间。 |
| AuditEvent | actorId、circleId、action、targetType、targetId、metadata、createdAt | 仅追加写入。 |
| Notification | userId、type、title、body、targetUrl、readAt、createdAt | 站内通知；不得保存敏感资料原文。 |
| NotificationDelivery | notificationId、channel、recipient、status、attempts、nextAttemptAt、sentAt | 支持 EMAIL 与 TELEGRAM 投递状态，具备重试和幂等。 |
| UserNotificationPreference | userId、emailEventRemindersEnabled | 仅控制可选活动提醒邮件；认证邮件不受影响。 |
| TelegramNotificationChannel | userId、botTokenCiphertext、chatId、verifiedAt、enabledAt | Bot Token 使用应用层加密；仅在连通性测试成功后可启用。 |

金额使用 PostgreSQL NUMERIC(12,2)，禁止使用 JavaScript 浮点数直接计算。结算服务以最小货币单位（fils，整数）计算，最终再格式化为 AED。

分摊输入与持久化规则如下：

- EQUAL：仅保存最终 amountAed。
- EXACT_AMOUNT：保存用户指定的 amountAed，服务端要求所有金额总和等于支出。
- PERCENTAGE：保存输入百分比与计算后的 amountAed，服务端要求百分比总和为 100。
- SHARES：保存正整数 inputShares 与计算后的 amountAed。
- 对 EQUAL、PERCENTAGE 和 SHARES，先以高精度计算，再向下取整到 fils；剩余 fils 按小数余数从大到小分配，余数相同按稳定 BillParticipant ID 排序。提交前把最终金额回显给用户。

### 5.3 敏感资料保护

- phone 和 iban 采用应用层 AES-256-GCM 加密，密钥仅来自部署环境的密钥管理/环境变量，不写入数据库或日志。
- IBAN 标准化后才加密和校验；响应中仅在通过圈子和字段授权后解密。
- 日志、异常和审计 metadata 禁止写入完整 IBAN、手机号、密码、OAuth Token、邀请原文或会话 Token。
- 若需要展示掩码，使用末四位等不可逆展示值，而非存储副本。

## 6. 关键业务流程

### 6.1 加入公开/私密圈子

~~~text
公开：广场 → 圈子简介 → 提交申请 → PENDING → 管理员批准 → ACTIVE
私密：邀请链接/邀请码 → 最小圈子简介 → 提交申请 → PENDING → 管理员批准 → ACTIVE
~~~

邀请链接和邀请码只能用于定位允许申请的私密圈子；服务端仍必须创建 PENDING 申请，不能直接创建 ACTIVE 成员。

### 6.2 资料可见性更新

1. 验证当前用户是目标圈子的 ACTIVE 成员。
2. 校验字段枚举和用户所选集合。
3. 在事务内替换该 membership 下的可见性集合。
4. 写入 PROFILE_VISIBILITY_UPDATED 审计事件，metadata 只包含字段名而非字段值。
5. 后续目录和复制请求实时读取该授权。

### 6.3 退出、移除与重新申请

1. 用户退出或管理员移除成员时，在事务内将 CircleMembership 改为 LEFT 或 REMOVED、记录相应时间、撤销该 membership 的所有资料字段可见性，并写审计事件。
2. EventRegistration、BillParticipant、Expense、ExpenseSplit、SettlementTransfer 和 EventRosterAdjustment 均保留，确保活动和账目可追溯；非 ACTIVE 用户不再拥有任何圈子资源读取权限。
3. 再次申请时创建新的 MembershipApplication，并将既有 CircleMembership 设为 PENDING。私密圈子仍需有效邀请；公开圈子仍须从广场入口申请。
4. OWNER/ADMIN 批准最新申请后，将 membership 恢复为 ACTIVE；资料可见性保持为空，要求用户重新显式授权。

### 6.4 邀请创建与接受

1. 创建 CircleInvitation 要求创建者是 ACTIVE 成员。OWNER/ADMIN 可设置 expiresAt 和 maxUses；所有邀请均存储 createdById。
2. OWNER/ADMIN 可撤销圈内任意邀请；普通成员仅可撤销自己创建的邀请。创建者离开、被移除或圈子解散时，其未使用邀请自动失效。
3. 接受邀请时，服务端以 tokenHash、expiresAt、maxUses、usedCount、revokedAt 和创建者仍为 ACTIVE 成员为条件原子校验；成功后消耗一次使用次数，并写入关联 invitationId 的 MembershipApplication。
4. 创建 MembershipApplication 绝不直接创建 ACTIVE membership；OWNER/ADMIN 审批界面展示 invitationId 与 createdById。

### 6.5 结算计算

1. 在数据库事务中读取账单、账单参与者（成员或 Guest）、未删除支出及分摊项。
2. 将每笔金额转换为 fils；按 splitMethod 校验不等额总额、比例 100%、份数正整数，并校验最终 splits 之和等于 expense.amount。
3. 对每人累计 paid 与 owed，计算 balance = paid − owed。
4. 将债务人和债权人按余额匹配，逐笔取较小绝对值生成 SettlementTransfer。
5. 校验所有余额归零后，替换该账单未确认的结算建议并写审计事件。

账目变更必须使旧结算建议失效并重新计算。仅 Bill.creatorId 可以修改账目、将 SETTLED 账单重新开启或重新结算；每次操作写入 AuditEvent。Guest 永不触发站内或邮件通知，且没有可复制的个人资料。

### 6.6 活动报名与候补

1. 创建活动时，maxParticipants、registrationDeadline 和 waitlistEnabled 都可选；没有人数上限时禁止启用候补。
2. 报名请求在截止时间前处理。未满员时创建 GOING 记录；已满员且候补开启时创建 WAITLIST 记录；其他情况返回明确的不可报名原因。
3. 创建关联账单时，默认复制 GOING 成员为 MEMBER 类型账单参与者；账单创建者可以移除或追加成员和 Guest。
4. 有参与者取消时，在事务内选择最早的 WAITLIST 记录（waitlistedAt、id 升序）并转为 GOING，写入 source = SYSTEM_PROMOTION 的 EventRosterAdjustment；提交后向转正成员及活动创建者投递站内通知和邮件。
5. Event.creatorId、OWNER 或 ADMIN 可以在任何时间手动调整 GOING、WAITLIST 或 CANCELLED 状态。服务端写入 source = MANUAL、actorId、beforeStatus、afterStatus 与可选 reason，并向受影响成员投递站内通知和邮件。

### 6.7 活动提醒调度

1. 仅 Event.creatorId 可创建、编辑或删除 EventReminder。每个提醒以活动开始时间减 offsetMinutes 计算 scheduledAt。
2. 活动时间或提醒设置变更时，在同一事务中取消所有未发送旧提醒并按新时间重建；已发送提醒保留审计记录。
3. Worker 定期领取 due 的未取消提醒，查询当前 GOING 成员，为每人创建站内 Notification。
4. 若用户开启 emailEventRemindersEnabled，追加 EMAIL 投递；若其 TelegramNotificationChannel 已验证并启用，追加 TELEGRAM 投递。站内通知不受偏好影响。
5. Worker 使用 Telegram Bot API 向 channel.chatId 发送消息；Token 解密仅发生在投递进程内，且不得写入日志、错误信息或队列 payload。

### 6.8 创建者转让与圈子解散

- 转让仅允许目标用户是同一圈子的 ACTIVE 成员。使用数据库事务将目标设为 OWNER，并按用户选择将原 OWNER 保留为 ADMIN 或将其退出圈子；事务后必须仍恰有一位 OWNER。
- OWNER 发起退出时，服务端拒绝直接退出请求，要求先完成转让或解散。
- 解散操作仅允许 OWNER 执行，必须完成二次确认并选择 DELETE_NOW 或 RETAIN_7_DAYS。两种模式均将 Circle 标记为 DISSOLVED、撤销邀请，并写入 CircleDissolution 与审计事件。
- RETAIN_7_DAYS 模式设置 purgeAt = dissolvedAt + 7 天，保留成员关系、资料可见性和业务数据但因 Circle.status = DISSOLVED 而完全不可访问。在 purgeAt 前，仅发起解散的 OWNER 可恢复圈子；恢复操作将 Circle 恢复为 ACTIVE，原成员关系和资料授权随之恢复，并写入恢复审计事件。
- DELETE_NOW 模式不提供恢复窗口；确认后立即开始清理流程。若必须先异步清理，Circle.status 仍保持 DISSOLVED，直到资源清理完毕。
- 到期 Worker 查找 purgeAt 已到的 DISSOLVED 圈子，删除全部圈子范围的成员关系、资料可见性、邀请、餐厅、活动、账单、结算、通知内容和圈子级审计记录。DELETE_NOW 在确认事务完成后执行同一清理流程。
- 删除流程不得删除 User 平台账户；应先验证所有待删资源均隶属目标 circleId，并以可重试、幂等方式完成。所有圈子资源读取均要求 Circle.status = ACTIVE，因此解散后立即不可访问。

### 6.9 通知与多渠道投递

1. 在原业务操作的数据库事务内，写入 Notification 与待投递的 NotificationDelivery（channel = EMAIL）。
2. 提交事务后，由应用内 Worker 或独立 Worker 读取待投递记录并调用 SMTP。
3. 投递成功后记录 sentAt；临时失败按有限指数退避重试，永久失败标记失败并触发运维告警。
4. 重试必须使用稳定的 deliveryId 或 Message-ID，避免同一业务事件重复发送邮件。

审批、成员移除、报名、结算等业务结果以数据库事务为准；SMTP 不可用时仍保留站内通知和待重试邮件记录，不得回滚业务状态。

## 7. 页面与接口边界

### 7.1 主要页面

| 页面 | 访问条件 |
| --- | --- |
| 登录、注册、找回密码 | 未登录或已登录均可按流程访问。 |
| 广场 | 登录后浏览公开圈子；私密圈子不返回。 |
| 创建圈子、我的圈子 | 已登录。 |
| 圈子简介和申请 | 公开圈子可发现；私密圈子需有效邀请。 |
| 圈子主页、目录、餐厅、活动、AA 账单 | ACTIVE 成员。 |
| 成员审批、邀请管理、圈子设置 | OWNER 或 ADMIN。 |
| 管理员任命/撤销、创建者转让、圈子解散 | 仅 OWNER。 |
| 个人资料、按圈子可见性 | 资料所有者本人。 |

### 7.2 Route Handler / Server Action 原则

- 变更操作使用同源 POST 并启用 CSRF 防护；表单带幂等键以避免弱网重复提交。
- 所有资源 ID 查询先验证所属 circleId，随后验证成员资格，不可仅按资源 ID 返回数据。
- 列表接口采用白名单 DTO；Directory DTO 只能组装当前查看者有权看到的字段。
- 广场搜索只查 Circle.visibility = PUBLIC 的最小字段集合。
- 邀请链接令牌在服务端校验并映射到圈子，不将可枚举的 private circleId 暴露给未授权用户。
- 创建 Restaurant、Event、独立 Bill 或 CircleInvitation 均要求 ACTIVE 成员资格；更新或删除时，服务端仅允许内容 createdById/creatorId 等于当前用户，或当前用户角色为 OWNER/ADMIN。
- 账单内的支出、参与者、分摊和结算状态仅允许 Bill.creatorId 管理；OWNER/ADMIN 不具备覆盖权限。Guest 不能被解析为 User、Membership 或通知收件人。
- 手动调整活动名单仅允许 Event.creatorId 或 OWNER/ADMIN；调整后的 GOING 人数仍不得超过活动人数上限。需要增加名额时，应先修改人数上限并留下活动编辑审计记录。

## 8. 安全、可靠性与运维

### 8.1 Web 安全

- 使用 Zod 进行服务端输入校验，输出编码防范 XSS。
- 认证、验证码、邀请码、申请和复制操作设置按 IP 与账户的限流。
- 密码重置和邮箱验证码使用一次性、哈希化、过期令牌；响应避免泄露邮箱是否注册。
- 强制 HTTPS，设置 CSP、HSTS、X-Content-Type-Options、Referrer-Policy 等安全响应头。
- 管理员变更、成员审批、邀请撤销、敏感资料复制、账本编辑和结算状态变更写审计事件。
- Telegram Bot Token 与 IBAN 一样使用应用层 AES-256-GCM 加密；用户可随时禁用或删除 Telegram 通道，删除后立即停止后续投递。

### 8.2 SMTP 环境配置

生产环境通过受限的 .env 或部署平台 Secret 注入以下配置：

~~~dotenv
SMTP_HOST=
SMTP_PORT=
SMTP_SECURE=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
~~~

SMTP_PASS 不得提交到 Git、显示在错误页、输出至日志或进入审计记录。启动时校验必填配置；非生产环境可显式关闭真实邮件投递。

### 8.3 部署拓扑

~~~text
Internet
  │ HTTPS
  ▼
Caddy / Nginx（TLS、限流、反向代理）
  ▼
Docker: Next.js application
  ▼
Docker or managed PostgreSQL（私网，不暴露公网端口）
  └── 加密备份 → 独立受控存储
~~~

- 生产环境使用独立 PostgreSQL 卷、每日备份和定期恢复演练。
- 密钥通过部署平台 Secret/受限 .env 注入；不得提交到 Git。
- 提供 /api/health 健康检查，不返回版本、数据库凭证或用户信息。
- 运行定时清理 Worker，处理到期的 RETAIN_7_DAYS 圈子；清理任务需报告成功、失败和积压数量。

### 8.4 可观测性

- 结构化日志记录请求 ID、用户 ID（若有）、circleId（若有）、操作名、结果和错误码。
- 监控登录失败率、申请审批失败、数据库连接、通知未读积压、邮件投递失败、结算校验失败和备份状态。
- 错误追踪服务接收前必须过滤敏感资料。

## 9. 测试策略

| 层级 | 重点 |
| --- | --- |
| 单元测试 | IBAN/手机号校验、金额尾差、结算算法、容量/候补自动转正排序、提醒重排、邀请有效性、解散到期时间。 |
| 集成测试 | Prisma 事务、唯一约束、名单调整审计、退圈重申请、邀请原子使用次数、资料授权撤销、Guest 隔离、提醒调度、Telegram 加密通道、7 天恢复与到期清理、邮件投递重试。 |
| 授权测试 | 跨圈访问、PENDING/REMOVED 用户、私密圈子枚举、未公开字段、成员邀请撤销边界、账单创建者、活动创建者、提醒创建者及管理员越权。 |
| 端到端测试 | 邮箱注册、Google 绑定、成员邀请与审批通知、退圈重申请、资料公开、报名候补转正、活动提醒、独立账单、Guest、解散恢复和到期清理。 |
| 安全回归 | 限流、CSRF、会话失效、错误响应脱敏和审计日志。 |

## 10. 分阶段实施建议

1. 工程基础：Next.js、PostgreSQL、Prisma、Docker、环境校验和基础监控。
2. Identity：邮箱验证、密码、找回密码、Google OAuth 与会话管理。
3. Circle / Membership：创建、广场、私密邀请、申请审批和成员隔离。
4. Profile / Directory：资料、按圈子字段授权、目录和敏感字段复制。
5. Restaurant / Event：餐厅、活动、报名、候补名单和独立/关联 AA 账单。
6. Settlement / Audit：Guest、支出分摊、结算、转账标记、状态锁定、审计与验收测试。

## 11. 实施前待确认

暂无实施前必须确认的技术决策。

## 12. 修订记录

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| v0.1.0 | 2026-09-27 | 从原 PRD 中拆分技术设计，并依据多圈子、公开/私密和资料字段授权需求建立首版方案。 |
| v0.2.0 | 2026-09-27 | 明确公开内容边界，以及 OWNER、ADMIN、转让和解散的状态与事务设计。 |
| v0.3.0 | 2026-09-27 | 明确餐厅推荐与活动的成员创建、内容所有权和管理员覆盖权限。 |
| v0.4.0 | 2026-09-27 | 为四种分摊模式定义枚举、输入校验、金额持久化和尾差分配算法。 |
| v0.5.0 | 2026-09-27 | 新增站内通知、SMTP 投递队列、重试机制及环境变量安全规范。 |
| v0.6.0 | 2026-09-27 | 将 AA 账单抽象为可独立或关联活动的实体，新增 Guest、报名上限、截止时间和候补模型。 |
| v0.7.0 | 2026-09-27 | 新增按候补时间自动转正、手动名单调整的授权、审计记录和通知事务设计。 |
| v0.8.0 | 2026-09-27 | 新增退圈/移除后的历史保留、再次申请审批和资料可见性撤销设计。 |
| v0.9.0 | 2026-09-27 | 新增圈子立即删除、7 天可恢复保留和到期清理的生命周期设计。 |
| v0.10.0 | 2026-09-27 | 明确餐厅推荐即时发布，不引入审核或重复合并状态机。 |
| v0.11.0 | 2026-09-27 | 新增成员邀请、管理员配置、原子消费和邀请来源审批追溯设计。 |
| v0.12.0 | 2026-09-27 | 明确账单创建者独占编辑、重新开启与结算权限，并在重算时保留审计。 |
| v0.13.0 | 2026-09-27 | 新增可编辑活动提醒、通知偏好和个人 Telegram Bot 加密投递设计。 |
| v0.14.0 | 2026-09-27 | 基于 league-dashboard、compass_solution、lol-me-portal 确认技术基线并记录已编码模块。 |
