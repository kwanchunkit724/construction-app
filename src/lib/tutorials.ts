// AUTO-GENERATED tutorial content (教學) — RLS-accurate per-function workflows.
// Source: tutorial-content-gen workflow. Regenerate rather than hand-edit large blocks.

export interface TutorialRole { role: string; can: string }
export interface TutorialStep { actor: string; action: string; result: string }
export interface TutorialFlowNode { actor: string; action: string; seenBy: string[]; note?: string }
export interface Tutorial {
  key: string
  title: string
  icon: string
  summary: string
  roles: TutorialRole[]
  steps: TutorialStep[]
  flow: TutorialFlowNode[]
  visibility: string
  confusions: string[]
}

export const TUTORIALS: Tutorial[] = [
  {
    "key": "auth-register-login",
    "title": "帳號註冊 / 登入（手機號 + 密碼）",
    "icon": "LogIn",
    "summary": "用手機號碼加密碼開帳號同登入，系統內部會把手機號轉成隱藏電郵做認證，用戶只會見到手機號。",
    "roles": [
      {
        "role": "所有人（未登入訪客）",
        "can": "在註冊頁填姓名、手機號、密碼、揀職位類別（PM／總承建商＋工程師·管工·安全／判頭／判頭工人／業主）、公司名，完成開帳號；之後在登入頁用同一手機號＋密碼登入。"
      },
      {
        "role": "系統管理員 (admin)",
        "can": "唔經註冊頁開 admin 帳號（職位選項冇 admin）；admin 由後台 seed／提升。可在用戶管理用 RPC 改其他人嘅 global_role／sub_role。"
      }
    ],
    "steps": [
      {
        "actor": "所有人（未登入訪客）",
        "action": "開「申請帳號」頁，填姓名、8 位香港手機號（5/6/7/9 開頭）、密碼（至少 6 位）兼確認、揀職位類別；總承建商要再揀工程師／管工／安全。",
        "result": "前端先驗證手機號格式同密碼一致。"
      },
      {
        "actor": "所有人（未登入訪客）",
        "action": "撳「註冊」。",
        "result": "系統先查 user_profiles 有冇同一手機號（已註冊就提示「請改用登入」）；冇就用 phoneToEmail 合成電郵呼叫 Supabase Auth signUp。"
      },
      {
        "actor": "系統",
        "action": "建立 auth.users 後，向 user_profiles insert 自己嘅 profile（id = auth.uid()，帶手機、姓名、global_role、sub_role、公司）。",
        "result": "insert 受 RLS「Users can insert own profile（with check auth.uid()=id）」限制，只可開自己嗰行；成功即自動登入並跳去 /home。"
      },
      {
        "actor": "所有人（已登入）",
        "action": "下次喺登入頁輸入手機號＋密碼。",
        "result": "系統 phoneToEmail 後呼叫 signInWithPassword；錯就一律顯示「手機號或密碼錯誤」（防止猜帳號）。"
      },
      {
        "actor": "系統",
        "action": "登入後讀取自己嘅 user_profiles（.eq id = 自己）攞身份同角色，並把 OneSignal 推送綁定到 auth user id。",
        "result": "角色載入後決定可入邊啲頁（admin 路由要 global_role='admin'）。"
      }
    ],
    "flow": [
      {
        "actor": "訪客",
        "action": "填表撳註冊（手機號→合成電郵）",
        "seenBy": [
          "註冊嗰位用戶自己"
        ],
        "note": "手機號用戶可見；合成電郵 <digits>@phone.local 用戶睇唔到。"
      },
      {
        "actor": "系統",
        "action": "Supabase Auth 建 auth.users + insert user_profiles（自己嗰行）",
        "seenBy": [
          "註冊嗰位用戶自己"
        ],
        "note": "RLS insert with check auth.uid()=id：只可開自己；profile insert 失敗會自動登出避免孤兒帳號。"
      },
      {
        "actor": "用戶",
        "action": "登入（手機號+密碼）並載入自己 profile",
        "seenBy": [
          "登入嗰位用戶自己",
          "同一已批准項目嘅隊友",
          "申請項目嘅指派 PM",
          "系統管理員（經 admin RPC）"
        ],
        "note": "user_profiles SELECT 經 v17 收窄：只有自己／同項目已批准隊友／申請人嘅 PM 可直接 SELECT 到佢嘅 profile；admin 要行 admin_list_user_profiles RPC 先睇到全部。"
      },
      {
        "actor": "用戶",
        "action": "嘗試改自己 global_role / phone",
        "seenBy": [
          "（被攔截）"
        ],
        "note": "分支：write-gate 觸發器（v17）會把非 admin 嘅 global_role／sub_role／phone／id 改動還原；只有 name／company／onesignal_id 改得到。改角色要 admin 行 admin_update_user_role RPC。"
      }
    ],
    "visibility": "註冊／登入產生嘅係用戶自己嘅 user_profiles 行。邊個睇到呢個 profile？根據 v17 收窄後嘅 user_profiles SELECT policy：(1) 自己（id=auth.uid()）、(2) 同你有同一個『已批准』項目嘅隊友（shares_project_with）、(3) 你申請緊嘅項目嗰個指派 PM（is_pm_of_applicant）。系統管理員唔行普通 policy，要經 admin_list_user_profiles／admin_get_user_profile RPC 先讀到所有人。即係話：一個啱啱註冊、未加入任何工地嘅新人，除咗自己同（申請時）相關 PR 之外，其他人係睇唔到佢嘅電話／角色嘅。",
    "confusions": [
      "以為要填電郵——其實只需手機號，系統內部自動轉成隱藏電郵，呢個係鎖死嘅認證方式（冇 magic link／SSO）。",
      "註冊時揀唔到『系統管理員』——故意嘅，admin 只可由後台開或提升，前端註冊冇呢個選項。",
      "以為註冊完就入到工地——唔係，註冊只係開帳號；要再去『申請加入工地』俾人審批先有項目內容睇。",
      "想自己改成 admin／改手機號——做唔到，v17 觸發器會即時還原非 admin 嘅角色／手機改動；改角色要搵 admin。",
      "登入錯誤永遠寫『手機號或密碼錯誤』——係刻意唔分開講邊樣錯，防止有人試出邊個手機號已註冊。"
    ]
  },
  {
    "key": "apply-join-project",
    "title": "申請加入工地",
    "icon": "UserPlus",
    "summary": "已註冊用戶喺工地列表揀一個項目、揀自己喺嗰個項目嘅角色，提交『待審核』申請，等審批人批准先正式入隊。",
    "roles": [
      {
        "role": "已註冊用戶（PM／總承建商／判頭／判頭工人／業主等）",
        "can": "睇到所有項目名（用嚟揀邊個工地申請），對未申請過嘅項目提交一個 status='pending' 嘅 membership；只可以自己身份申請。"
      },
      {
        "role": "系統",
        "can": "防止重複申請（user_id+project_id 唯一鍵；重複會回『你已申請過此工地』）。"
      }
    ],
    "steps": [
      {
        "actor": "已註冊用戶",
        "action": "撳「申請加入工地」，喺彈窗揀一個項目。",
        "result": "可揀項目列表 = 所有項目（v26 discovery policy 容許任何已登入者 SELECT 項目名）減去自己已申請過嗰啲。"
      },
      {
        "actor": "已註冊用戶",
        "action": "揀自己喺呢個項目嘅角色（例如判頭、判頭工人、總承建商）並提交。",
        "result": "向 project_members insert 一行：user_id=自己、project_id、role、status='pending'。"
      },
      {
        "actor": "系統",
        "action": "驗證 INSERT。",
        "result": "RLS「User can apply to projects（with check user_id=auth.uid() 且 status='pending'）」只准你以自己身份、以 pending 狀態申請；撞唯一鍵就提示已申請過。"
      },
      {
        "actor": "已註冊用戶",
        "action": "喺「我的工地」睇自己申請狀態。",
        "result": "卡片顯示『待審核 / 已加入 / 已拒絕』；realtime 訂閱 project_members，審批一改即時更新。"
      }
    ],
    "flow": [
      {
        "actor": "已註冊用戶",
        "action": "揀項目＋角色，提交 pending membership",
        "seenBy": [
          "申請人自己",
          "該項目指派 PM",
          "系統管理員",
          "（若申請做判頭工人）同項目已批准判頭"
        ],
        "note": "INSERT 受『user_id=auth.uid() 且 status=pending』限制——唔可以幫人申請、唔可以一開就 approved。"
      },
      {
        "actor": "系統",
        "action": "寫入 project_members（pending）並 realtime 廣播",
        "seenBy": [
          "申請人自己",
          "該項目指派 PM",
          "系統管理員",
          "同項目已批准判頭（只限 worker 行）"
        ],
        "note": "分支：撞 user_id+project_id 唯一鍵 → 回『你已申請過此工地』。"
      },
      {
        "actor": "審批人",
        "action": "喺『待審核申請』睇到呢個 pending 行",
        "seenBy": [
          "該項目指派 PM",
          "系統管理員",
          "同項目已批准判頭（worker 申請）"
        ],
        "note": "申請人嘅姓名／電話／公司因 v17 收窄唔可以直接 SELECT，前端改用 admin_or_pm_list_applicants RPC 攞，RPC 內部驗證『你係 admin／本項目 PM／本項目已批准判頭』先回 PII，唔係就顯示『無法載入申請人資料』。"
      }
    ],
    "visibility": "申請產生嘅係一行 project_members（status=pending）。邊個睇到呢個申請？(1) 申請人自己（『User reads own memberships』user_id=auth.uid()）；(2) 系統管理員（『Admin reads all memberships』）；(3) 該項目嘅指派 PM（『PM reads project memberships』auth.uid()=any(assigned_pm_ids)）；(4) 如果係判頭工人申請，同項目已批准嘅判頭都睇到（『Subcontractor reads workers in own project』）。注意申請人嘅個人資料（姓名／電話／公司）唔喺呢條 policy 內——v17 收窄咗 user_profiles，所以審批人要靠 admin_or_pm_list_applicants RPC（v30）先睇到申請人係邊個，否則會『盲批』。",
    "confusions": [
      "以為見到項目就已經加入咗——其實見到項目只係 discovery（v26 容許任何登入者睇項目名），真正入隊要提交申請兼俾人批准。",
      "想幫同事一齊申請——做唔到，RLS 限定只可以自己身份申請（user_id 必須等於自己）。",
      "申請後即刻想睇項目內進度／日誌——睇唔到，要 status 變 approved 先解鎖項目內容；pending 期間只見到自己嘅申請卡。",
      "審批人見到『載入中…／?』批唔到——通常係申請人 PII 未經 RPC 攞到（v17 收窄），要靠 admin_or_pm_list_applicants；亦解釋點解新申請人未批准時審批人未必直接 SELECT 到佢 profile。",
      "重複撳申請冇反應／報錯——user_id+project_id 係唯一鍵，第二次會回『你已申請過此工地』。"
    ]
  },
  {
    "key": "multi-tier-approval",
    "title": "多層審核（PM 審總承建商／業主，判頭審工人，admin 審所有）",
    "icon": "ClipboardCheck",
    "summary": "唔同身份嘅人由唔同審批人把關：指派 PM 批本項目嘅總承建商／業主等成員，判頭批自己手下嘅判頭工人，系統管理員可批所有；批咗先正式成為已批准成員。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "審批／拒絕任何項目嘅任何 pending 申請（包括 PM、判頭等所有角色）。"
      },
      {
        "role": "項目經理 (PM)",
        "can": "審批／拒絕自己被指派嘅項目（assigned_pm_ids 內）嘅 pending 申請——例如總承建商員工、判頭、業主、判頭工人。"
      },
      {
        "role": "判頭 (subcontractor)",
        "can": "只可審批自己所在項目入面、角色係『判頭工人』嘅 pending 申請（批自己手下）。"
      },
      {
        "role": "申請人",
        "can": "睇唔到審批按鈕，只見自己申請卡狀態由待審核變成已加入／已拒絕。"
      }
    ],
    "steps": [
      {
        "actor": "審批人（admin／PM／判頭）",
        "action": "去『工地』頁，系統喺『待審核申請』列出我有權批嘅 pending 行。",
        "result": "前端 pendingForMe 判斷：admin 見全部；PM 見 assigned_pm_ids 含自己嘅項目；判頭只見自己項目內 role='subcontractor_worker' 嘅申請。"
      },
      {
        "actor": "審批人",
        "action": "睇申請人姓名／電話／公司（經 admin_or_pm_list_applicants RPC 載入）。",
        "result": "RPC 鏡像同一審批人條件先回 PII，避免盲批。"
      },
      {
        "actor": "審批人",
        "action": "撳『批准』或『拒絕』。",
        "result": "對 project_members UPDATE：status 改 approved／rejected，並寫 approved_by=自己、approved_at=now()。"
      },
      {
        "actor": "系統",
        "action": "驗證 UPDATE 權限。",
        "result": "RLS：admin（『Admin updates memberships』）／指派 PM（『PM approves memberships』）／或判頭（『Subcontractor approves workers』，且 row.role 必須係 subcontractor_worker）先准更新。"
      },
      {
        "actor": "申請人 + 隊友",
        "action": "realtime 收到更新。",
        "result": "批准後申請人 status=approved，正式成為項目成員，解鎖項目內容；同時成為其他已批准隊友可見嘅 peer。"
      }
    ],
    "flow": [
      {
        "actor": "審批人",
        "action": "喺『待審核申請』撳批准／拒絕",
        "seenBy": [
          "審批人自己",
          "申請人",
          "系統管理員",
          "該項目指派 PM",
          "同項目已批准成員"
        ],
        "note": "三條 UPDATE policy 對應三種審批人：admin 任何項目；PM 限 assigned_pm_ids；判頭限 row.role='subcontractor_worker' 且自己係該項目已批准判頭。"
      },
      {
        "actor": "系統",
        "action": "UPDATE project_members → approved/rejected + approved_by/at",
        "seenBy": [
          "申請人",
          "審批人",
          "系統管理員",
          "該項目 PM"
        ],
        "note": "分支（批准）：申請人變已批准成員，之後同項目所有已批准成員（v21 peers policy）互相睇到對方 membership。"
      },
      {
        "actor": "系統",
        "action": "批准後申請人成為已批准成員",
        "seenBy": [
          "申請人",
          "同項目所有已批准成員",
          "該項目 PM",
          "系統管理員"
        ],
        "note": "分支（拒絕）：status=rejected，申請人卡顯示『已拒絕』，唔解鎖項目內容；申請人可重新申請前要先清走舊行（撞唯一鍵）。"
      },
      {
        "actor": "判頭",
        "action": "嘗試批一個『判頭』或『PM』申請",
        "seenBy": [
          "（被攔截）"
        ],
        "note": "分支：判頭嘅 UPDATE policy 限定 row.role='subcontractor_worker'，批其他角色會被 RLS 擋；嗰啲要 PM／admin 處理。"
      }
    ],
    "visibility": "審批動作改嘅係 project_members 行嘅 status／approved_by／approved_at。邊個睇到結果？同申請可見性一致：申請人自己、系統管理員、該項目指派 PM；若係判頭工人行，仲有同項目已批准判頭。批准之後多咗一層——v21『Approved members read project peers』令同一項目所有已批准成員互相睇到對方嘅 membership 行（用於指派／點名）。誰可以做審批（UPDATE）由三條獨立 policy 決定：admin 全部、PM 限自己被指派項目、判頭只限 role='subcontractor_worker' 嘅行。呢個三層設計＝判頭自己管手下工人，PM 管項目級成員，admin 兜底。",
    "confusions": [
      "判頭以為可以批所有人入自己工地——只可以批『判頭工人』；總承建商、業主、其他判頭要 PM 或 admin 批。",
      "PM 以為可以批任何項目——只可以批自己被 admin 指派（assigned_pm_ids 含自己）嗰啲項目。",
      "審批人見到卡但姓名係『載入中…』批唔到——申請人 PII 要經 admin_or_pm_list_applicants RPC 攞（v17 收窄咗直接 SELECT）；載入失敗會顯示『無法載入申請人資料』，批准掣會 disable。",
      "拒絕咗想再申請——要留意 user_id+project_id 唯一鍵，rejected 行仲喺度會擋住新申請，需要清理。",
      "以為批准只係改個狀態——批准會即時解鎖申請人對成個項目內容嘅可見性，並令佢成為其他已批准隊友可見嘅 peer（v21），影響範圍比表面大。"
    ]
  },
  {
    "key": "project-management",
    "title": "項目管理（admin 開項目 + 分區 + 指派 PM）",
    "icon": "Building2",
    "summary": "系統管理員開立工地項目、設定分區（zones），再指派一個或多個 PM 去管理；之後 PM 先有權審批成員同管理該項目。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "新增／刪除項目，設定 zones，指派／更改項目嘅 assigned_pm_ids，匯出項目 Excel，切換 PTW 功能；對 projects 表有完整 CRUD。"
      },
      {
        "role": "項目經理 (PM)",
        "can": "唔可以開項目；只可讀自己被指派嘅項目（assigned_pm_ids 含自己），並憑此審批該項目成員。"
      },
      {
        "role": "其他角色 / 任何已登入者",
        "can": "可讀到項目名（discovery，用嚟申請加入）；已批准成員額外讀到自己加入嗰個項目。"
      }
    ],
    "steps": [
      {
        "actor": "系統管理員",
        "action": "喺『管理』頁撳『新增工地項目』，輸入項目名同分區。",
        "result": "向 projects insert（name、zones、assigned_pm_ids 起始空陣列、created_by=自己）。"
      },
      {
        "actor": "系統",
        "action": "驗證 INSERT。",
        "result": "RLS『Admin full access on projects』要求 caller 係 global_role='admin' 先准 all（含 insert/update/delete）。"
      },
      {
        "actor": "系統管理員",
        "action": "喺項目卡撳『指派 PM』，喺彈窗揀 PM。",
        "result": "對 projects UPDATE assigned_pm_ids；候選 PM 名單由 admin_list_user_profiles RPC（v17）攞，因為 admin 唔行普通收窄後嘅 user_profiles SELECT。"
      },
      {
        "actor": "系統管理員",
        "action": "（可選）設定簽核流程、切 PTW、匯出 Excel、刪除項目。",
        "result": "刪除係 projects DELETE（admin policy），會連帶 cascade 相關 project_members 等。"
      },
      {
        "actor": "被指派 PM",
        "action": "登入後喺『工地』睇到呢個項目並開始審批成員。",
        "result": "PM 因 auth.uid()=any(assigned_pm_ids) 取得讀項目、讀／批該項目 membership 嘅權限。"
      }
    ],
    "flow": [
      {
        "actor": "系統管理員",
        "action": "新增項目（name+zones，assigned_pm_ids 起初空）",
        "seenBy": [
          "系統管理員",
          "任何已登入用戶（只見項目名，用嚟申請）"
        ],
        "note": "INSERT 受『Admin full access on projects』限制，只有 admin 開得；created_by 記錄係邊個 admin 開。"
      },
      {
        "actor": "系統管理員",
        "action": "指派 PM（UPDATE assigned_pm_ids）",
        "seenBy": [
          "系統管理員",
          "被指派嘅 PM",
          "該項目已批准成員（讀加入項目）"
        ],
        "note": "候選 PM 名單經 admin_list_user_profiles RPC（v17 收窄令 admin 唔可直接全表 SELECT user_profiles）。"
      },
      {
        "actor": "被指派 PM",
        "action": "讀到項目並可審批／管理該項目成員",
        "seenBy": [
          "被指派 PM",
          "系統管理員",
          "該項目已批准成員"
        ],
        "note": "分支：PM 唯有對 assigned_pm_ids 含自己嘅項目有此權；冇被指派嘅 PM 只能像普通人睇到項目名（discovery），審批唔到。"
      },
      {
        "actor": "系統管理員",
        "action": "刪除項目（DELETE）",
        "seenBy": [
          "系統管理員"
        ],
        "note": "分支：cascade 刪除依賴呢個項目嘅 project_members 等；屬破壞性操作，前端有二次『確認刪除』。"
      }
    ],
    "visibility": "項目（projects 行）嘅可見性係多層疊加：(1) discovery——v26『Authenticated can read all projects (name discovery)』令任何已登入用戶都讀到項目名（純粹為咗『申請加入工地』揀得到）；(2) 指派 PM——『PM reads assigned projects』(auth.uid()=any(assigned_pm_ids))；(3) 已批准成員——『Approved members read joined projects』(該項目有自己一行 status='approved')；(4) admin——『Admin full access on projects』讀晒所有並可寫。注意：assigned_pm_ids 同 zones 等項目欄位對所有登入者可見（因 discovery=true），但項目內嘅進度／日誌／文件等敏感內容係各自表嘅 RLS 把關，唔會因為睇到項目名就睇到內容。指派 PM 用嘅 PM 候選名單，admin 要經 admin_list_user_profiles RPC（因 v17 收窄咗 user_profiles 直接 SELECT）。",
    "confusions": [
      "PM 以為自己可以開項目／加分區——唔可以，開項目、設 zones、指派 PM 全部係 admin 專屬（projects 寫入只得 admin policy）。",
      "PM 登入後搵唔到要管嘅項目——因為 admin 未指派（assigned_pm_ids 未加佢）；未指派前 PM 只當普通用戶睇到項目名，批唔到人。",
      "以為任何人睇到項目名＝睇到項目內容——唔係，discovery 只開放項目名／分區呢層；進度、日誌、SI/VO、PTW 等各有自己 RLS，要做已批准成員兼符合該功能可見性先睇到。",
      "admin 想喺普通用戶列表揀 PM 但列表空——admin 唔行收窄後嘅 user_profiles SELECT policy，要靠 admin_list_user_profiles RPC（v17）攞全名單，前端已用此 RPC。",
      "刪項目以為只係隱藏——係真刪除兼 cascade 連帶成員等資料，破壞性操作，務必確認。"
    ]
  },
  {
    "key": "progress-tracking",
    "title": "進度追蹤（大項／中項／細項）",
    "icon": "ListChecks",
    "summary": "用三層樹狀結構（大項→中項→細項）拆解工程，由監督層搭骨架、指派負責人或委派判頭／工人，前線在細項上更新百分比或樓層完成，系統自動由細項向上匯總，並保留每次更新的進度歷史。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "任何項目都可加／刪大中細項、指派、更新、查看全樹及歷史（系統級繞過）。"
      },
      {
        "role": "項目經理 (pm，本項目)",
        "can": "若被列入本項目 assigned_pm_ids，或以 pm 會員身份獲批，可加／刪結構、指派負責人、委派判頭、更新任何細項、查看全樹。"
      },
      {
        "role": "老總／工地主任 (general_foreman)",
        "can": "以 general_foreman 會員身份獲批時，等同監督層：可建結構、指派、更新、看全樹。"
      },
      {
        "role": "總承建商 (main_contractor，含 工程師／管工／安全 sub_role)",
        "can": "以 main_contractor 會員身份獲批時屬監督層，可加／刪結構、指派、更新、看全樹（v27 起；舊版曾被擋）。亦可被選為細項負責人。"
      },
      {
        "role": "判頭 (subcontractor)",
        "can": "不能建結構、不能看全樹；只可被指派為負責人或被委派，僅能更新及查看指派／委派給自己的細項（連祖先樹）。"
      },
      {
        "role": "判頭工人 (subcontractor_worker)",
        "can": "不能建結構；只可被委派，僅能更新及查看委派給自己的細項（連祖先樹）。"
      },
      {
        "role": "業主 (owner)",
        "can": "唯讀，且不在指派／委派候選名單內，故除非被指派否則看不到任何進度項目。"
      }
    ],
    "steps": [
      {
        "actor": "項目經理／老總／總承建商",
        "action": "在項目「進度」分頁按「加大項」輸入編號(code)、名稱、可選計劃起訖日期與追蹤模式（百分比或樓層）。",
        "result": "建立 level 1 大項；DB 以 can_manage_project_progress 驗證 INSERT。"
      },
      {
        "actor": "項目經理／老總／總承建商",
        "action": "在大項的⋯選單按「加細項」逐層往下加中項、細項；最底層（無子項）即為可更新的細項。",
        "result": "形成大項→中項→細項樹，code 排序顯示。"
      },
      {
        "actor": "項目經理／老總／總承建商",
        "action": "在某細項⋯選單按「指派」，於『負責人』分頁選總承建商員工或判頭，於『委派判頭／工人』分頁選判頭或工人。",
        "result": "寫入該細項 assigned_to／delegated_to，被選者即時取得該行更新權。"
      },
      {
        "actor": "判頭／工人／負責人",
        "action": "在被指派的細項按橙色「更新」鍵，輸入新百分比（或剔選已完成樓層）加備註。",
        "result": "actual_progress／floors_completed 更新、status 由計劃進度推算，並寫一筆 progress_history。"
      },
      {
        "actor": "系統",
        "action": "自動把細項進度向上平均匯總到中項、大項（前端 computeRollup）。",
        "result": "上層顯示子細項的平均完成度與落後／超前；無需人手填上層。"
      },
      {
        "actor": "監督層",
        "action": "在細項⋯選單按「歷史」查看每次更新的時間、人、數值、備註。",
        "result": "顯示 progress_history 時間線，作為審計依據。"
      }
    ],
    "flow": [
      {
        "actor": "項目經理／老總／總承建商",
        "action": "建立大項／中項／細項結構",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "INSERT 受 can_manage_project_progress 限制：admin／本項目PM／會員角色為 pm·general_foreman·main_contractor 才可建。判頭／工人／業主無此鍵。"
      },
      {
        "actor": "項目經理／老總／總承建商",
        "action": "在細項指派負責人／委派判頭工人",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "只有監督層能開啟指派視窗。候選人＝本項目已批准會員：負責人選 main_contractor／subcontractor；委派選 subcontractor／subcontractor_worker。"
      },
      {
        "actor": "被指派的判頭／工人／負責人",
        "action": "更新該細項進度（%或樓層）並自動記一筆歷史",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商",
          "被指派／委派的判頭",
          "被委派的判頭工人"
        ],
        "note": "UPDATE 受 can_update_progress_item：監督層 OR auth.uid() 在 assigned_to／delegated_to。判頭／工人只能更新派給自己的行。"
      },
      {
        "actor": "系統",
        "action": "由細項向上平均匯總到中項／大項",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "匯總在前端計算（computeRollup 取後代細項平均）；落後／超前由計劃日期推算的 plannedProgress 比對。"
      },
      {
        "actor": "監督層",
        "action": "查看全項目進度樹與每項進度歷史",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "全樹可見性 = get_visible_progress_items 監督分支（v27 = can_manage_project_progress）。判頭／工人只經 RPC 取得派給自己的細項＋祖先鏈，看不到整棵樹。"
      }
    ],
    "visibility": "誰看到進度，由 get_visible_progress_items RPC 決定（不是普通 SELECT）。監督層——系統管理員、本項目PM(assigned_pm_ids)、以及會員角色為 pm／general_foreman／main_contractor 的已批准會員——看到整個項目的進度樹。判頭、判頭工人、業主等其他已批准會員只看到指派／委派給自己的細項，加上其祖先鏈（令樹能繞著他們渲染），看不到別人的工作。非本項目成員完全看不到。進度歷史(progress_history)則放寬：任何能看本項目的已批准成員(can_view_project)都可讀歷史，但只有可編輯者(can_edit_project_progress)能寫入。",
    "confusions": [
      "「我是 PM 為何加唔到大項？」——結構權看『本項目會員角色』而非帳號全域角色；要被批准為本項目的 pm／general_foreman／main_contractor 會員，或被列入 assigned_pm_ids，全域是 pm 但本項目未獲批仍然唔得（v27 修正版）。",
      "「判頭睇唔到成個工程進度？」——正常。判頭／工人只看到派給自己的細項＋祖先，全樹只限監督層；想佢更新就要先喺指派視窗委派該細項俾佢。",
      "「上層大項點解我冇填都有 %？」——上層唔使人手填，系統自動取所有後代細項的平均；改細項，上層會跟住變。",
      "「負責人(指派) vs 委派 有咩分別？」——負責人多用總承建商員工或判頭(main_contractor／subcontractor)，委派用判頭或工人(subcontractor／subcontractor_worker)；兩者都令對方取得該細項更新權，分別只在標籤與候選名單。",
      "「落後／超前點計？」——『計劃進度』由 planned_start→planned_end 對今日線性推算，唔係人手填；未設日期會顯示『未排期』而唔當 0% 拖低。"
    ]
  },
  {
    "key": "planned-progress",
    "title": "計劃進度（按日程自動計算）",
    "icon": "CalendarClock",
    "summary": "為每個進度項目設定計劃開工日同完工日，系統就會自動算出「今日照計劃應該做到幾多 %」，再同實際進度比較，得出落後／超前同狀態（未開始／進行中／落後／完成）。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "可在任何項目設定／修改項目嘅 planned_start／planned_end，並睇到全棵樹嘅計劃進度。"
      },
      {
        "role": "項目經理 (pm，該盤 assigned PM 或會員角色=pm)",
        "can": "可為大項／中項／細項設定計劃日期，睇到全盤計劃 vs 實際同落後分析。"
      },
      {
        "role": "老總／工地主任 (general_foreman)",
        "can": "若係該盤已批准會員(角色=general_foreman)，可設定計劃日期並睇全樹計劃進度。"
      },
      {
        "role": "總承建商 (main_contractor)",
        "can": "已批准會員(角色=main_contractor)可建立結構同設定計劃日期，並睇全盤計劃進度（v27 將管理權交由 per-project 會員角色決定）。"
      },
      {
        "role": "判頭 (subcontractor)",
        "can": "唔可以設定計劃日期；只可在被指派／轉派(assigned_to／delegated_to)嘅細項上更新實際進度，並只睇到嗰啲項目同其上層，計劃 % 只反映自己嗰啲項目。"
      },
      {
        "role": "判頭工人 (subcontractor_worker) / 業主 (owner)",
        "can": "唯讀；只睇到指派／轉派俾自己嘅項目及上層，業主多數係睇進度，唔能改計劃。"
      }
    ],
    "steps": [
      {
        "actor": "項目經理／老總／總承建商",
        "action": "在項目嘅「進度」分頁建立大項→中項→細項，新增項目時喺彈窗填「計劃開工日」同「計劃完工日」。",
        "result": "彈窗即時顯示「計劃進度（自動）」預覽 %，由 plannedProgressOf 用 開工→完工 對比今日線性計算。"
      },
      {
        "actor": "系統",
        "action": "儲存 planned_start／planned_end（及預覽 planned_progress）入 progress_items。",
        "result": "之後每次開頁，計劃 % 都係以「今日」即時重算（唔係靠舊存值），確保隨日子推進自動行前。"
      },
      {
        "actor": "判頭／被指派者",
        "action": "喺被指派嘅細項打勾或填實際進度 %（actual_progress）。",
        "result": "系統用 scheduleVariance = 實際 − 計劃 得出差距：< −5% 顯示『落後 X%』(紅)，> +5% 顯示『超前 X%』(綠)，中間為貼近計劃。"
      },
      {
        "actor": "系統",
        "action": "用 deriveStatus 由 實際 vs 計劃 自動定狀態。",
        "result": "actual≥100→完成；actual=0→未開始；actual < 計劃−5→落後；其餘→進行中。父項／分區用 computeRollup 滙總子細項(只計有排期嘅項目嘅計劃%)。"
      },
      {
        "actor": "項目經理／老總",
        "action": "喺進度頁／儀表板睇整體計劃 vs 實際同落後項目數，或匯出報表(例外版只睇落後/阻塞)。",
        "result": "一眼睇到邊區紅咗、落後幾多 %，作為追數同開會依據。"
      }
    ],
    "flow": [
      {
        "actor": "項目經理／老總／總承建商",
        "action": "設定項目嘅計劃開工／完工日（需 can_manage_project_progress 權限：admin／該盤 PM／會員角色 pm·general_foreman·main_contractor）",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "INSERT/UPDATE 受 progress_items RLS + can_manage_project_progress 把關；判頭/工人/業主唔能設定計劃日期。"
      },
      {
        "actor": "系統",
        "action": "用 plannedProgressOf(開工→完工 vs 今日) 即時算出『今日應做到幾多%』",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "純前端計算，隨日子推進自動更新；無設日期則當『未排期』。"
      },
      {
        "actor": "判頭／被指派者",
        "action": "更新被指派細項嘅實際進度",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商",
          "該細項被指派／轉派嘅判頭"
        ],
        "note": "判頭只可改 assigned_to／delegated_to 嘅項目(v15/v27)；佢只睇到自己嗰啲項目同上層。"
      },
      {
        "actor": "系統",
        "action": "scheduleVariance + deriveStatus 得出 落後／超前 + 狀態(未開始/進行中/落後/完成)",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商",
          "該項目被指派嘅判頭"
        ],
        "note": "落後門檻：實際 < 計劃 − 5%。"
      },
      {
        "actor": "項目經理／老總",
        "action": "睇全盤計劃 vs 實際滙總、紅色落後項目、匯出報表",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總／工地主任",
          "總承建商"
        ],
        "note": "供應商視角(get_visible_progress_items)：主管睇全樹；判頭/工人/業主只睇自己被指派項目+上層。"
      }
    ],
    "visibility": "計劃進度本身唔係獨立資料，係由項目嘅 planned_start／planned_end 即時計出，所以『睇唔睇到』等同『睇唔睇到嗰個進度項目』。底層 progress_items SELECT 政策要求 can_view_project(=admin／該盤 PM／已批准會員)；而實際渲染用 get_visible_progress_items RPC 再分層：主管(admin／assigned PM／會員角色 pm·general_foreman·main_contractor，即 can_manage_project_progress)睇到全棵樹同所有項目嘅計劃%；判頭／判頭工人／業主只睇到指派或轉派俾自己(assigned_to／delegated_to)嘅項目同佢哋嘅上層鏈，計劃% 亦只反映嗰啲項目。未獲批准會員乜都睇唔到。",
    "confusions": [
      "「計劃進度」唔係人手填嘅 %——你只填開工日同完工日，個 % 係系統按今日喺呢段日子之間嘅位置自動計(例如 15 日工期到第 3 日 = 20%)。",
      "唔設計劃開工／完工日就會顯示『未排期』，唔會當落後；落後比較只對有排期嘅項目先成立。",
      "落後唔係實際 < 計劃就即刻紅，要相差超過 5% 先標『落後』(deriveStatus／差距顯示用 5% 緩衝)。",
      "判頭睇到嘅計劃進度淨係自己被指派嘅細項，唔代表成個盤；要睇全盤計劃 vs 實際要 PM／老總／總承建商身分。",
      "父項／大項嘅計劃% 係由有排期嘅子細項平均出嚟(未排期子項唔計入計劃，但實際仍計全部)，所以父項個計劃%同你逐項加埋未必一樣。"
    ]
  },
  {
    "key": "progress-report-export",
    "title": "進度報告匯出（業主版 / 內部版 / 例外版）",
    "icon": "FileDown",
    "summary": "將工地進度一鍵匯出成 PDF 或 Excel，業主版係一頁紙白話總覽、內部版多埋每區逐項細表，仲會自動計「本期變化」同寫一句白話總結，方便 WhatsApp 直接 send 畀老闆或業主。",
    "roles": [
      {
        "role": "系統管理員 admin",
        "can": "可開任何項目嘅匯出，三種範本全部可出，PDF/Excel 都得"
      },
      {
        "role": "項目經理 pm（已指派此項目）",
        "can": "可開匯出視窗、揀範本（業主版/內部版/例外版）、調分區/深度/狀態/期數，出 PDF 或 Excel；出 PDF/Excel 時會寫低本期快照做下次嘅比較基準"
      },
      {
        "role": "總承建商 main_contractor",
        "can": "同 PM 一樣可出報告；屬進度編輯角色，匯出時亦會寫低本期快照"
      },
      {
        "role": "判頭 subcontractor",
        "can": "可出報告；屬進度編輯角色，匯出時亦會寫低本期快照"
      },
      {
        "role": "判頭工人 subcontractor_worker",
        "can": "可開匯出視窗、出 PDF/Excel（介面冇 canEdit 限制），但報告只會包含佢本身睇得到嘅進度行；佢唔係編輯角色，所以匯出時寫快照會被 RLS 擋住（出報告本身唔受影響）"
      },
      {
        "role": "業主 owner",
        "can": "可開匯出視窗、出業主一頁紙 PDF 畀自己睇；同樣只睇到自己權限範圍內嘅進度，且唔會寫快照基準"
      }
    ],
    "steps": [
      {
        "actor": "項目經理 / 任何已批准成員",
        "action": "入項目 → 進度（progress）分頁 → 撳右上角下載圖示 → 揀「匯出進度報告…」",
        "result": "彈出「匯出進度報告」視窗，預設記住上次用過嘅範本（內部版）"
      },
      {
        "actor": "項目經理",
        "action": "揀範本：業主版（一頁紙，10 秒睇得明）/ 內部版（一頁紙 + 每區詳細）/ 例外版（只睇延誤+阻塞+落後）",
        "result": "下方即時顯示 scope 計數：整體 X%、落後幾項，未撳匯出已知會出咩內容"
      },
      {
        "actor": "項目經理",
        "action": "（選填）展開「進階設定」揀分區、層級深度（只大項/到中項/到細項）、狀態、報告期數（例 2026-W23）",
        "result": "預覽計數即時更新；範本被改動會變「自訂」，可撳「還原範本」"
      },
      {
        "actor": "項目經理",
        "action": "撳「匯出 Excel」或「匯出 PDF」",
        "result": "系統先抓上一期快照計『本期 Δ』，buildReportModel 計算總覽+各分區+需關注清單+白話總結句"
      },
      {
        "actor": "系統",
        "action": "PDF：用 html2canvas 整 A4 一頁紙（業主版）或一頁紙+每區細表（內部版），按區塊邊界分頁；Excel：分區小計+可摺疊大綱+百分比格式",
        "result": "產生檔案 Blob"
      },
      {
        "actor": "系統",
        "action": "原生 App：寫去 Cache 再彈分享視窗（WhatsApp/電郵）；網頁：用 Web Share 或直接下載",
        "result": "用戶可即刻 send 份報告，唔使搵檔案"
      },
      {
        "actor": "系統",
        "action": "匯出完成後 captureSnapshot 把今期每個細項 actual_progress 寫入 progress_snapshots（同期 upsert）",
        "result": "下次匯出就有基準計『本期 +X%』；只有編輯角色寫得入，唯讀角色會被 RLS 靜靜擋住"
      }
    ],
    "flow": [
      {
        "actor": "項目經理 / 已批准成員",
        "action": "進度分頁撳下載圖示 → 揀匯出進度報告",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "匯出選單係 ProjectDetail 頭部，唔受 canEdit 限制，任何打開到進度分頁嘅已批准成員都見到"
      },
      {
        "actor": "項目經理",
        "action": "揀範本 + 進階篩選（分區/深度/狀態/期數）",
        "seenBy": [
          "項目經理"
        ],
        "note": "業主版=audience owner 一頁紙；內部版=owner 一頁紙+internal 附錄細表；例外版=只 delayed/blocked 且落後>10%"
      },
      {
        "actor": "系統",
        "action": "fetchPrevSnapshot 抓上期基準 → buildReportModel 算總覽/分區/需關注/白話總結",
        "seenBy": [
          "項目經理"
        ],
        "note": "報告只含匯出者 SELECT 得到嘅 progress_items（policy: can_view_project）；唯讀角色出嘅報告同樣只有佢權限內嘅行"
      },
      {
        "actor": "系統",
        "action": "產生 PDF（html2canvas 區塊分頁）或 Excel（分區小計+大綱）",
        "seenBy": [
          "項目經理"
        ],
        "note": "PDF owner 版淨係一頁紙；internal 版多每區逐項表（編號/名稱/實際/計劃/差距/本期/狀態/說明/計劃完成）"
      },
      {
        "actor": "系統",
        "action": "分享 / 下載份檔案",
        "seenBy": [
          "收件人（由匯出者自行揀，例如業主、老闆、客戶）"
        ],
        "note": "份檔案一旦 send 出去就脫離系統 RLS——分享後邊個收到邊個睇到，由匯出者控制"
      },
      {
        "actor": "系統",
        "action": "captureSnapshot 寫今期快照入 progress_snapshots",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "快照 SELECT policy=can_view_project（同項目已批准成員可見）；INSERT/UPDATE policy=can_edit_project_progress（只 admin/指派PM/已批准 pm·總承建商·判頭），故唯讀角色匯出唔會寫到基準"
      }
    ],
    "visibility": "份匯出檔案本身唔受 RLS 管——係由匯出者主動分享/下載再 send 畀人（業主版就係專登俾業主、老闆睇），所以『邊個睇到份報告』= 匯出者 send 畀邊個。但報告入面嘅進度數據，只會包含匯出者自己 SELECT 得到嘅行：progress_items 嘅 SELECT policy 係 can_view_project（系統管理員、指派咗呢個項目嘅 PM、或同項目 status='approved' 嘅成員先見到），所以唯讀角色（業主/判頭工人）出嘅報告只有佢權限範圍內嘅資料。『本期變化』用嘅 progress_snapshots：SELECT 同樣係 can_view_project（同項目已批准成員可見），但 INSERT/UPDATE 係 can_edit_project_progress（只 admin、指派 PM、已批准嘅 pm/總承建商/判頭），所以只有編輯角色匯出時先會寫低今期基準，唯讀角色匯出唔會更新基準。",
    "confusions": [
      "「業主版同內部版差咩？」——業主版係一頁紙白話總覽（總結句+三大數+各分區進度條+需關注清單），業主 10 秒睇得明；內部版係嗰張一頁紙再加每個分區逐項細表（編號/實際/計劃/差距/本期/狀態/備註）。",
      "「點解份報告冇晒『未開始』嘅項目？」——預設範本剔走未開始，因為成版 0% 會浸冇咗真正要跟進嘅項目；想睇晒可入進階設定撳『全部』。",
      "「『本期 +X%』邊度嚟？」——系統將每次匯出時嘅進度存做快照（progress_snapshots），下次匯出同上一期比就計到本期變化；第一次匯出未有基準，所以唔會顯示本期。要記得用同一個『報告期數』先比得準。",
      "「我係工人/業主都按到匯出，咁係咪可以攞晒全部資料？」——唔係。介面冇擋你開匯出視窗，但份報告只包含你本身權限內睇到嘅進度行（RLS can_view_project），睇唔到嘅項目根本唔會出現喺檔案。",
      "「點解我（工人）出完報告，PM 話本期變化唔啱?」——唯讀角色匯出時寫快照基準會被 RLS 擋（can_edit_project_progress），所以基準要靠編輯角色（PM/總承建商/判頭）匯出先會更新，建議由 PM 出正式報告。",
      "「匯出咗份 PDF 喺手機搵唔到？」——原生 App 唔會淨係靜靜存落『文件』夾，而係彈分享視窗，你可以直接揀 WhatsApp / 電郵 send 出去；想留底先至會落『文件』夾。"
    ]
  },
  {
    "key": "report-issue",
    "title": "報告問題（附相）",
    "icon": "AlertTriangle",
    "summary": "工地任何已批准成員影相、寫標題同描述去開一張問題單，系統按報告者角色自動指派第一個處理人。",
    "roles": [
      {
        "role": "判頭工人 / 判頭 / 總承建商 / 業主 / PM / 系統管理員",
        "can": "任何此工地嘅已批准成員都可以開問題單；INSERT RLS 要求 can_view_project 成立兼 reporter_id = 自己。"
      },
      {
        "role": "唔係此工地成員嘅人",
        "can": "見唔到亦開唔到（被 RLS 擋住）。"
      }
    ],
    "steps": [
      {
        "actor": "判頭工人（或任何成員）",
        "action": "入工地 → 問題分頁 → 撳「報告問題」，影相/揀相、填標題同描述。",
        "result": "相經 issue-photos bucket 上傳，攞到 public URL 放入 photos 欄。"
      },
      {
        "actor": "判頭工人",
        "action": "提交。",
        "result": "issues 新增一行，current_handler_role 由 getInitialHandler(報告者角色) 自動計（工人→判頭、判頭→總承建商、總承建商/業主/PM→PM）；status='open'（顯示為「處理中」）。"
      },
      {
        "actor": "系統",
        "action": "自動寫低一條 reported 活動記錄（to_role = 首位處理人）。",
        "result": "問題單即時出現喺工地所有成員嘅問題列表（realtime channel issues-{projectId}）。"
      }
    ],
    "flow": [
      {
        "actor": "判頭工人",
        "action": "影相 + 填寫 + 提交問題單",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "INSERT 需 can_view_project 且 reporter_id=自己。"
      },
      {
        "actor": "系統",
        "action": "按報告者角色指派首位 handler（工人→判頭）",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "handler 只決定邊個有權處理，唔影響邊個睇得到。"
      }
    ],
    "visibility": "同一工地嘅所有已批准成員都睇到（issues SELECT policy = can_view_project：系統管理員、該 project 嘅 assigned PM、或 project_members 入面 status='approved' 嘅任何角色）。即係話判頭工人開嘅單，連業主、其他判頭、PM 全部都見到 —— 唔限於報告者或處理人。未獲批准嘅申請者同非成員一律見唔到。",
    "confusions": [
      "「我報告咗，但點解未見處理人嘅老闆覆我？」—— 開單只係指派咗負責角色（handler），唔會即刻有人覆；要對方主動入嚟處理或留言。",
      "「係咪淨係我同處理人睇到？」—— 唔係。全工地已批成員都睇到同一張單，連業主都見到，係刻意設計做共享審計記錄。",
      "報告者角色係開單嗰刻嘅快照（reporter_role），就算之後改咗職位，舊單嘅升級路線唔會變。"
    ]
  },
  {
    "key": "escalation-chain",
    "title": "升級鏈（工人→判頭→總承建商→PM）",
    "icon": "ArrowUp",
    "summary": "當前處理人覺得搞唔掂，可以「上呈」畀上一層，直到去到 PM（最高層，唔可以再上）。",
    "roles": [
      {
        "role": "當前處理角色（判頭 / 總承建商 / PM）",
        "can": "可以將問題上呈畀下一層；UPDATE RLS = has_role_in_project(current_handler_role)。"
      },
      {
        "role": "報告者本人",
        "can": "就算唔係處理角色，都可以推自己嘅單上呈（RLS 有 reporter_id=auth.uid() 條款，防止無對應角色成員時卡死）。"
      },
      {
        "role": "系統管理員",
        "can": "任何時候都可以上呈（admin 全權）。"
      },
      {
        "role": "PM",
        "can": "已係鏈頂，getNextHandler('pm')=null，無「上呈」掣。"
      }
    ],
    "steps": [
      {
        "actor": "判頭（當前處理人）",
        "action": "入問題詳情 → 撳「上呈到 總承建商」→ 填上呈原因 → 確認。",
        "result": "issues.current_handler_role 由 subcontractor 改成 main_contractor，updated_at 更新。"
      },
      {
        "actor": "系統",
        "action": "寫低 escalated 活動記錄（from_role=判頭, to_role=總承建商）。",
        "result": "活動時間線顯示「上呈到 總承建商」，全工地成員都睇到。"
      },
      {
        "actor": "總承建商",
        "action": "再搞唔掂可再「上呈到 PM」。",
        "result": "handler 變 pm；到 PM 後再無上呈選項（終點）。"
      }
    ],
    "flow": [
      {
        "actor": "判頭",
        "action": "上呈：subcontractor → main_contractor",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "UPDATE 需 has_role_in_project(舊 handler) 或係報告者或 admin。"
      },
      {
        "actor": "總承建商",
        "action": "上呈：main_contractor → pm",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": ""
      },
      {
        "actor": "PM",
        "action": "鏈頂，無得再上呈（getNextHandler('pm')=null）",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "終點：只可解決，唔可再上呈。"
      }
    ],
    "visibility": "升級嘅結果（handler 變咗、時間線多咗一條 escalated 記錄）對全工地已批成員可見，因為睇問題同睇活動記錄都係用 can_view_project（issue_comments SELECT 經 issues.project_id 判斷）。升級只係改變「邊個有權處理」，並無收窄「邊個睇得到」。",
    "confusions": [
      "上呈唔等於通知所有人去做，只係將處理責任交畀上一層；下一層要主動入嚟跟。",
      "「PM 之後仲可以上呈畀邊個？」—— 無，PM 已係終點，淨係可以解決或交返落嚟（重開/留言），唔會再向上。",
      "如果某工地根本無對應嘅「判頭」角色成員，張單唔會卡死 —— 報告者本人可憑 reporter_id 條款自己推上去，admin 亦可。"
    ]
  },
  {
    "key": "handle-resolve-reopen",
    "title": "處理 / 解決 / 重開",
    "icon": "CheckCircle2",
    "summary": "處理人可留言跟進、標記問題「已解決」，之後任何成員若發現未真正解決可再「重開」。",
    "roles": [
      {
        "role": "當前處理角色 / 報告者 / 系統管理員",
        "can": "可標記已解決或重開（同上呈一樣行 issues UPDATE policy）。"
      },
      {
        "role": "任何已批准成員",
        "can": "可在問題下留言（issue_comments INSERT 只需 can_view_project + author_id=自己），毋須係處理人。"
      },
      {
        "role": "判頭工人 / 業主",
        "can": "通常只能留言；除非佢哋係報告者，否則無權改 status。"
      }
    ],
    "steps": [
      {
        "actor": "處理人（或報告者/admin）",
        "action": "入問題詳情 → 撳「標記為已解決」→ 填解決方法 → 確認。",
        "result": "status='resolved'（顯示「已解決」）、resolved_by/resolved_at 記低，並寫 resolved 活動記錄。"
      },
      {
        "actor": "任何成員",
        "action": "喺問題下打字留言。",
        "result": "issue_comments 新增 commented 記錄，全工地成員可見。"
      },
      {
        "actor": "發現問題未掂嘅成員",
        "action": "撳「重新開啟」→ 填原因 → 確認。",
        "result": "status 改返 'open'、清空 resolved_by/at，寫 reopened 記錄；單重新計做處理中。"
      }
    ],
    "flow": [
      {
        "actor": "處理人",
        "action": "留言跟進（commented）",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "任何成員都可留言，唔限處理人。"
      },
      {
        "actor": "處理人 / 報告者 / admin",
        "action": "標記已解決（status→resolved）",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "UPDATE 需符合 issues UPDATE policy（handler/reporter/admin）。"
      },
      {
        "actor": "任何有權成員",
        "action": "重新開啟（status→open）",
        "seenBy": [
          "系統管理員",
          "項目經理(已派/已批)",
          "老總/工地主任(已批)",
          "總承建商(已批)",
          "判頭(已批)",
          "判頭工人(已批)",
          "業主(已批)"
        ],
        "note": "重開保留之前全部時間線，做到完整審計鏈。"
      }
    ],
    "visibility": "解決/重開後嘅狀態同每條留言都對全工地已批成員可見：issues 經 can_view_project SELECT，issue_comments 經其 issue 嘅 project_id + can_view_project SELECT。所以連業主、判頭工人都見到「邊個喺幾時解決咗、寫咗咩、之後又被邊個重開」嘅完整記錄。",
    "confusions": [
      "「解決咗係咪就刪咗？」—— 唔係，只係狀態變「已解決」，成張單同時間線都留低，方便日後翻查/出爭議時做證據。",
      "「邊個可以撳解決？」—— 當前處理人、報告者本人、或 admin；普通旁觀成員只可以留言。",
      "重開唔會洗走舊記錄；解決同重開都一條條疊喺活動時間線度，係刻意保留嘅審計軌跡。"
    ]
  },
  {
    "key": "site-instruction",
    "title": "工地指令 SI",
    "icon": "ClipboardList",
    "summary": "把口頭工地指示變成有版本、有審批鏈、鎖定後不可改的正式記錄，作為日後爭議嘅鐵證。",
    "roles": [
      {
        "role": "系統管理員 admin",
        "can": "可建立、可在任何步驟用 admin_override 批准、可配置審批鏈；睇晒全部 SI。"
      },
      {
        "role": "項目經理 pm（已分派到此項目）",
        "can": "可建立 SI、配置/修改此項目嘅工地指令審批鏈（approval_chain_steps）；通常係審批鏈最後一關。"
      },
      {
        "role": "總承建商 main_contractor",
        "can": "可建立 SI（屬可編輯角色）；多數作為審批鏈中間關卡批准/退回/拒絕。"
      },
      {
        "role": "判頭 subcontractor",
        "can": "可建立 SI 草稿並提交；如審批鏈包含其角色亦可批。"
      },
      {
        "role": "判頭工人 subcontractor_worker",
        "can": "唯讀：可睇 SI、版本同審批記錄，但唔可以建立或批准。"
      },
      {
        "role": "業主 owner",
        "can": "唯讀：可睇 SI 內容、版本同進度，唔參與建立或審批。"
      },
      {
        "role": "工地主任 general_foreman / 老總",
        "can": "視乎其項目成員角色；一般可睇，若被列入審批鏈步驟則可批。"
      }
    ],
    "steps": [
      {
        "actor": "判頭 / 總承建商 / 項目經理 / 系統管理員",
        "action": "喺項目內按「新增工地指令」，系統用 next_si_number 自動派 SI-001 等編號，建立 status=draft 草稿（createDraftSi）。",
        "result": "SI 草稿出現，只係提交人自己可改標題、描述、相片、圖則版本等內容。"
      },
      {
        "actor": "提交人（建立者）",
        "action": "填寫內容並儲存做第一個版本（si_versions version 1）。",
        "result": "版本 1 鎖定為當時內容快照；之後每次修訂都加新版本，舊版本永遠保留。"
      },
      {
        "actor": "提交人",
        "action": "確認後按「提交」(submit_si)。",
        "result": "系統凍結該項目嘅工地指令審批鏈做 chain_snapshot，status 轉 in_review，current_step=0，並推送通知畀第一關審批人。"
      },
      {
        "actor": "審批鏈第一關角色持有人（如總承建商）",
        "action": "收到推送，打開 SI 揀「批准 / 連修訂批准 / 退回修訂 / 拒絕」(submit_approval)。",
        "result": "系統先核實佢屬 active_role_holders 先准寫入；每個動作都寫入 append-only 嘅 approvals 記錄，無法刪改。"
      },
      {
        "actor": "審批鏈後續角色（如項目經理）",
        "action": "逐關批准。",
        "result": "每批一關 current_step +1 並推送下一關；批到最後一關。"
      },
      {
        "actor": "系統（最後一關批准後）",
        "action": "自動把 SI 鎖定。",
        "result": "status=locked、locked_at 設定；si_lock_guard 觸發器封鎖任何新版本，SI 永久定型。"
      },
      {
        "actor": "任何項目成員",
        "action": "鎖定後如有異議，按「抗議」加 protest_comment。",
        "result": "抗議只可喺鎖定後加（不能改原文），作為審計附註保留。"
      }
    ],
    "flow": [
      {
        "actor": "提交人（判頭/總承建商/PM/admin）",
        "action": "建立草稿並寫第一版內容",
        "seenBy": [
          "同項目所有已批准成員（admin、已分派PM、總承建商、判頭、判頭工人、業主、工地主任）"
        ],
        "note": "INSERT 受 can_edit_project_progress 限制：只有 admin、已分派 PM、或角色為 pm/main_contractor/subcontractor 嘅已批准成員可建立。"
      },
      {
        "actor": "提交人",
        "action": "提交 submit_si：凍結審批鏈快照、status→in_review、推送第一關",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "審批鏈由 admin 或已分派 PM 預先喺 approval_chain_steps（doc_type='si'）配置；提交時即時 snapshot，之後改鏈唔影響呢張 SI。"
      },
      {
        "actor": "審批鏈當前步驟持有人",
        "action": "submit_approval：批准 / 連修訂批准 / 退回 / 拒絕",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "RPC 核實 caller ∈ active_role_holders（該角色已批准成員＋已分派PM＋admin＋有效代理人）先准；admin 可 admin_override。退回→status=revision_requested 重置 current_step=0 並通知提交人；拒絕→status=rejected 終止。"
      },
      {
        "actor": "系統",
        "action": "最後一關批准後 status→locked、封鎖新版本",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "locked 後 si_lock_guard 拒絕任何 si_versions 寫入；approvals 全程 append-only。"
      },
      {
        "actor": "任何項目成員",
        "action": "鎖定後加抗議 protest_comment",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "抗議只可喺 status='locked' 且 can_view_project 通過時插入；不可改原 SI，只作審計記錄。"
      }
    ],
    "visibility": "同項目所有已批准成員都睇到呢張 SI、佢嘅全部版本、成條審批記錄同抗議——唔分角色。原因：site_instructions、si_versions、protest_comments、approvals 嘅 SELECT RLS 全部用 can_view_project(auth.uid(), project_id)，即 admin、已分派到此項目嘅 PM、或 project_members 入面 status='approved' 嘅人。換言之判頭寫嘅 SI，工地主任、總承建商、PM、業主、甚至判頭工人（只要係已批准項目成員）都即時睇到；但唔同項目嘅人完全睇唔到。",
    "confusions": [
      "「邊個睇到」≠「邊個可以建立／批准」：睇得到係全項目成員（can_view_project），但建立要 can_edit_project_progress（admin/PM/總承建商/判頭），批准要係該步驟嘅 active_role_holders。判頭工人同業主只係唯讀。",
      "審批鏈唔係建立 SI 嗰陣揀，而係由 admin 或已分派 PM 預先喺項目層級配置（approval_chain_steps，doc_type='si'）；提交一刻先 snapshot 凍結，之後改鏈唔會改到已提交嘅 SI。",
      "提交後唔可以直接改內容：草稿階段先改得，提交後唯一改法係審批人「退回修訂」(request_revision)，SI 退回提交人並重置到第一關，或審批人「連修訂批准」由系統服務端寫新版本。",
      "鎖定 = 終局：locked 之後唔可以再加版本（si_lock_guard 會擋），唯一可做係加「抗議」comment，但抗議改唔到原文，只係留低審計記錄。",
      "「抗議」唔等於推翻 SI：protest_comments 只可喺鎖定後加，係審計用途，唔會令 SI 重開或失效。",
      "approvals 係 append-only：批錯都刪唔到、改唔到，所有批准/退回/拒絕/override 永久留底，正正係用嚟打官司同對數嘅鐵證。"
    ]
  },
  {
    "key": "variation-order",
    "title": "變更指令 (VO)",
    "icon": "FileText",
    "summary": "就工程範圍或合約金額嘅有價變更，逐項列出加項/扣項估價(港幣)，經審批鏈逐級批核、業主終批後鎖定，成為可追溯嘅合約變更紀錄。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "可建立、編輯草稿、提交、於任何步驟批核(含 admin_override 強制過關，須填≥10字原因)；可改項目嘅 VO 審批鏈。"
      },
      {
        "role": "項目經理 (pm)",
        "can": "作為本項目 assigned PM 或審批鏈一員：可建立及提交 VO；輪到「項目經理」步驟時批核/退回/拒絕；可編輯本項目審批鏈。"
      },
      {
        "role": "總承建商 (main_contractor)",
        "can": "可建立及提交 VO(已批准成員身分)；作為審批鏈第一關，輪到時批核/退回/拒絕。"
      },
      {
        "role": "判頭 (subcontractor)",
        "can": "可建立草稿、加減項目估價、提交自己嘅 VO；只有提交人本人先可提交。預設唔喺審批鏈內，所以唔批核。"
      },
      {
        "role": "業主 (owner)",
        "can": "審批鏈終批人：輪到「業主」步驟時批准(批准後即鎖定)、退回修訂或拒絕。一般唔建立 VO。"
      },
      {
        "role": "老總/工地主任 (general_foreman)",
        "can": "可查看本項目所有 VO 及估價，但唔屬於 can_edit_project_progress 角色，所以介面唔顯示「新增 VO」，亦唔喺預設審批鏈。"
      },
      {
        "role": "判頭工人 (subcontractor_worker)",
        "can": "如獲批准加入項目則可查看 VO，唯讀；唔可建立、唔可批核。"
      }
    ],
    "steps": [
      {
        "actor": "判頭 / 總承建商 / 項目經理",
        "action": "喺項目入面開新 VO：可選擇引用一張「已鎖定」嘅工地指令(SI)，或唔引用而獨立建立(例如圖則修訂、口頭指示後補)。系統自動編號 VO-001。",
        "result": "建立 draft 狀態 VO；伺服器經 next_vo_number 派號。"
      },
      {
        "actor": "判頭 / 總承建商 / 項目經理",
        "action": "加入估價項目(類別、說明、數量、單位、單價港幣分)，可逐項加項或扣項；按儲存。",
        "result": "寫入 vo_versions；BEFORE INSERT 觸發器 recompute_vo_totals 用「數量×單價」重算每項小計同總額，覆蓋任何客戶端數字，總額由伺服器話事。"
      },
      {
        "actor": "提交人本人",
        "action": "確認無誤後按「提交」。",
        "result": "submit_vo 檢查只有提交人可交、(如有引用 SI 須已鎖定)，凍結審批鏈快照(總承建商→項目經理→業主)，狀態轉 in_review，推播通知第一關批核人。"
      },
      {
        "actor": "總承建商 (第一關)",
        "action": "查看估價，批准 / 修訂後批准 / 退回要求修訂 / 拒絕(退回及拒絕須填≥10字原因)。",
        "result": "submit_approval 寫入 approvals 紀錄；批准則 current_step 前進並推播下一關。"
      },
      {
        "actor": "項目經理 (第二關)",
        "action": "覆核並批准 / 退回 / 拒絕。",
        "result": "再前進一步，推播業主。"
      },
      {
        "actor": "業主 (終批)",
        "action": "最終批准。",
        "result": "審批鏈完成，狀態轉 locked、寫入 locked_at；VO 鎖定不可再改版，全項目成員收到「已鎖定」通知。"
      }
    ],
    "flow": [
      {
        "actor": "判頭/總承建商/項目經理",
        "action": "建立 VO 草稿(可引用已鎖定 SI 或獨立)",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "業主",
          "老總/工地主任",
          "已批准項目成員"
        ],
        "note": "INSERT RLS：created_by=自己 + status=draft +(獨立 VO 需 can_edit_project_progress；引用 SI 則該 SI 須 locked 且同項目)。"
      },
      {
        "actor": "提交人",
        "action": "加估價項目並儲存版本",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "業主",
          "已批准項目成員"
        ],
        "note": "recompute_vo_totals 伺服器重算總額(防客戶端篡改);只有 draft/revision_requested 且未鎖定先可加版。"
      },
      {
        "actor": "提交人",
        "action": "提交 submit_vo",
        "seenBy": [
          "總承建商"
        ],
        "note": "凍結審批鏈快照;推播只去第一關(總承建商)持有人。引用 SI 未鎖定會被拒。"
      },
      {
        "actor": "總承建商",
        "action": "批核 / 退回 / 拒絕",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "業主",
          "已批准項目成員"
        ],
        "note": "分支：退回→狀態 revision_requested 並通知提交人改;拒絕→終止 rejected;批准→推播項目經理。"
      },
      {
        "actor": "項目經理",
        "action": "覆核批核",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "業主",
          "已批准項目成員"
        ],
        "note": "批准→推播業主。"
      },
      {
        "actor": "業主",
        "action": "終批",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商",
          "判頭",
          "業主",
          "已批准項目成員"
        ],
        "note": "最後一步批准→狀態 locked、寫 locked_at、全成員收『已鎖定』通知。admin 可用 admin_override 在任何步驟強制過關(須原因)。"
      }
    ],
    "visibility": "同一項目所有「已批准」成員都睇到 VO、佢嘅估價總額同完整審批紀錄。理由：variation_orders、vo_versions 同 approvals(doc_type='vo') 三張表嘅 SELECT RLS 都係 can_view_project(auth.uid(), project_id)，即 admin、該項目 assigned PM、或 project_members 內 status='approved' 嘅任何角色(總承建商/判頭/業主/老總/工人等)。VO 故意全項目透明，金額同批核軌跡公開可審計;非本項目成員一行都睇唔到。",
    "confusions": [
      "以為 VO 一定要綁住一張 SI：其實 v28 之後可以獨立建立(圖則修訂、口頭指示後補等),引用 SI 只係其中一種情況,而且一張 SI 可以開多張 VO。",
      "以為自己填嘅總額會照用：唔會。伺服器用『數量×單價』重新計每項小計同總額(recompute_vo_totals),客戶端嘅總額一律被覆蓋。",
      "以為任何人都可以提交：只有 VO 嘅建立人(提交人)本人先可以 submit_vo,別人(連 PM)都唔得。",
      "以為提交咗仲改得：一旦進入 in_review 就唔可以再加版,要等批核人『退回要求修訂』(狀態變 revision_requested)先可以再改再交。",
      "以為判頭/老總都係審批鏈一員：預設審批鏈淨係 總承建商→項目經理→業主;判頭通常係建立/提交方,老總連『新增』掣都見唔到(唔屬 can_edit_project_progress)。",
      "以為業主批咗仲可以調整金額：業主係終批,一批就 locked,VO 永久鎖定不可再改版,只能靠審計紀錄追溯。",
      "以為 VO 只係內部數:其實同項目所有已批准成員(包括判頭、工人、業主)都睇到金額同批核進度,設計上係透明可審計。"
    ]
  },
  {
    "key": "ptw-permit-to-work",
    "title": "工作許可證 (PTW)",
    "icon": "ClipboardCheck",
    "summary": "高風險工序（動火、高空、吊運等）開工前的電子許可證：建立草稿→提交審批鏈→安全主任/總承建商簽署→生效並產生 QR 碼→（動火）30 分鐘火警監察→完工關閉；現場可掃 QR 即時核實許可證真偽同有效期。",
    "roles": [
      {
        "role": "判頭 / 總承建商 / 項目經理 / 系統管理員",
        "can": "建立 PTW 草稿、填寫工序內容同工人名單、提交審批；只有建立人本人先可以提交、開始火警監察、簽署完工關閉（close_out_ptw / start_ptw_fire_watch 都硬性檢查 created_by = 本人）"
      },
      {
        "role": "安全主任 (safety_officer)",
        "can": "作為審批鏈一環，喺輪到自己嗰步簽署批准 / 退回 / 拒絕（submit_approval 經 active_role_holders 核實佢係該步嘅角色持有人）"
      },
      {
        "role": "項目經理 / 總承建商（視乎鏈設定）",
        "can": "審批鏈內其他步驟嘅簽核人；鏈由系統管理員或項目經理用 save_chain_steps 自訂"
      },
      {
        "role": "系統管理員",
        "can": "配置 PTW 審批鏈；可用 admin_override 強制推進任何一步（須填 10 字以上原因）"
      },
      {
        "role": "判頭工人 / 業主",
        "can": "唯讀：可以睇到本項目所有 PTW、QR 碼、簽署同掃描紀錄，但唔可以建立或審批（INSERT 受 can_edit_project_progress 阻擋，已排除呢兩個角色）；登入後可掃 QR 核實"
      },
      {
        "role": "任何已批准項目成員",
        "can": "掃描 QR 核實許可證（verify_ptw_jwt 要求登入 + can_view_project，並記低每次掃描）"
      }
    ],
    "steps": [
      {
        "actor": "判頭 / 總承建商 / 項目經理",
        "action": "喺項目內 PTW 清單撳「新增」，揀工序類型（v1：動火 / 高空 / 吊運），系統用 next_ptw_number 自動派 PTW-001 編號，建立 status=draft 草稿",
        "result": "草稿建立，只有建立人睇到嘅編輯介面；DB 用 can_edit_project_progress 擋住無權角色"
      },
      {
        "actor": "建立人",
        "action": "填寫工序內容（permit_versions payload，每存一次開新版本號），加入工人名單同相片（permit_workers）",
        "result": "版本同工人資料寫入；趁未鎖定可不斷改"
      },
      {
        "actor": "建立人",
        "action": "撳「提交」，呼叫 submit_ptw",
        "result": "系統凍結該項目嘅 PTW 審批鏈做 chain_snapshot，status 轉 in_review，推送通知鏈中第一步嘅簽核人"
      },
      {
        "actor": "安全主任（鏈第一步，視設定）",
        "action": "收到推送，開 PTW 詳情，喺 PtwApproverBar 撳「批准」/「退回」/「拒絕」",
        "result": "submit_approval 核實佢係 active_role_holders 內先寫入 approvals；批准→推進下一步並通知；退回→status=已退回(step 0)通知建立人重交；拒絕→終結"
      },
      {
        "actor": "鏈中下一位簽核人（如總承建商）",
        "action": "同樣喺輪到自己時簽署",
        "result": "最後一步批准後，dispatch_after_approval 呼叫 activate_ptw"
      },
      {
        "actor": "系統",
        "action": "activate_ptw 將 status 設為 active、記 activated_at、計 expires_at＝今晚 23:59（香港時間）、並 locked_at 上鎖",
        "result": "PTW 生效；PtwQrCard 顯示 QR 碼（mint_ptw_jwt 簽發），推送通知建立人「已激活」"
      },
      {
        "actor": "現場任何已批准成員",
        "action": "用 app 掃 QR，導去 /verify/:token，呼叫 verify_ptw_jwt",
        "result": "核實簽名同有效期，顯示「簽核有效 / 已過期」+ 編號類型有效至；每次掃描寫入 permit_scans 審計"
      },
      {
        "actor": "建立人（動火工序）",
        "action": "完工前撳「開始火警監察」，呼叫 start_ptw_fire_watch",
        "result": "記 fire_watch_started_at；未夠 30 分鐘唔准關閉"
      },
      {
        "actor": "建立人",
        "action": "喺 PtwSignaturePad 簽名，撳「完工關閉」，呼叫 close_out_ptw",
        "result": "動火須已過 30 分鐘火警監察；寫入完工 approval + permit_signoffs 簽名，status=closed_out"
      },
      {
        "actor": "系統 (pg_cron ptw-expiry)",
        "action": "每日 16:00 UTC（＝香港 00:00）執行 drain_ptw_expiry",
        "result": "所有 active 且過咗 expires_at 嘅 PTW 自動轉 expired"
      }
    ],
    "flow": [
      {
        "actor": "建立人（判頭/總承建商/項目經理）",
        "action": "建立 draft PTW（next_ptw_number 派編號）",
        "seenBy": [
          "同項目所有已批准成員（含判頭工人、業主）",
          "系統管理員",
          "負責項目經理"
        ],
        "note": "INSERT 受 can_edit_project_progress 限制：admin / 指派 PM / 已批准 pm·main_contractor·subcontractor 先可建立；但 SELECT 用 can_view_project，所以一建立全項目成員即可見"
      },
      {
        "actor": "建立人",
        "action": "填工序版本 + 工人名單，提交 submit_ptw",
        "seenBy": [
          "同項目所有已批准成員",
          "系統管理員"
        ],
        "note": "submit_ptw 必須 created_by=本人；凍結 chain_snapshot；若項目未配置 PTW 鏈會報錯（PTW 鏈無自動 seed，須 admin/PM 用 save_chain_steps 設定）"
      },
      {
        "actor": "系統",
        "action": "推送通知第一步簽核人",
        "seenBy": [
          "第一步角色持有人（如安全主任）"
        ],
        "note": "收件人＝active_role_holders(project, 第一步 required_role)，或鏈內指定 optional_user_id；含 admin（永遠）及該角色已批准成員 + 受權代簽人"
      },
      {
        "actor": "安全主任 / 鏈中簽核人",
        "action": "批准（submit_approval approve）",
        "seenBy": [
          "同項目所有已批准成員",
          "系統管理員"
        ],
        "note": "approvals SELECT 用 doc_type=ptw + can_view_project，全項目成員睇到審批紀錄；submit_approval 只准 active_role_holders 內人寫，否則「你冇權批准呢個步驟」"
      },
      {
        "actor": "安全主任 / 簽核人",
        "action": "分支：退回 request_revision（須≥10字原因）",
        "seenBy": [
          "建立人（收推送）",
          "同項目所有已批准成員"
        ],
        "note": "status→revision_requested、current_step 重置為 0，通知建立人修訂後重交"
      },
      {
        "actor": "安全主任 / 簽核人",
        "action": "分支：拒絕 reject（須≥10字原因）",
        "seenBy": [
          "建立人（收推送）",
          "同項目所有已批准成員"
        ],
        "note": "status→rejected 終結，不能再提交"
      },
      {
        "actor": "系統管理員",
        "action": "分支：admin_override 強制推進（須≥10字原因）",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "只有 global_role=admin 可用，繞過角色檢查推進該步"
      },
      {
        "actor": "系統 (activate_ptw)",
        "action": "最後一步批准→生效 active + QR + expires_at 23:59 HKT + 上鎖",
        "seenBy": [
          "同項目所有已批准成員",
          "系統管理員"
        ],
        "note": "由 dispatch_after_approval 觸發；推送建立人「已激活」；QR 由 mint_ptw_jwt 簽發（密鑰存 app_config.ptw_qr_secret，永不外露）"
      },
      {
        "actor": "現場已批准成員",
        "action": "掃 QR 核實 verify_ptw_jwt",
        "seenBy": [
          "掃描者本人即時見結果",
          "同項目所有已批准成員（睇 permit_scans 審計）"
        ],
        "note": "未登入會被導去登入再返回；非本項目成員會被拒『你冇權查看呢張工作許可證』；每次掃描記低 scanned_by + 時間"
      },
      {
        "actor": "建立人（動火）",
        "action": "start_ptw_fire_watch 開始 30 分鐘火警監察",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "creator-only RPC；只限 hot_work + active；曾因直接 UPDATE 被 RLS 靜默擋住而改用 SECURITY DEFINER RPC（v32）"
      },
      {
        "actor": "建立人",
        "action": "close_out_ptw 簽名完工關閉",
        "seenBy": [
          "同項目所有已批准成員",
          "系統管理員"
        ],
        "note": "creator-only；動火須過 30 分鐘火警監察；簽名寫入 permit_signoffs，status→closed_out"
      },
      {
        "actor": "系統 (pg_cron)",
        "action": "每日掃描自動過期",
        "seenBy": [
          "同項目所有已批准成員"
        ],
        "note": "drain_ptw_expiry 將過咗 expires_at 嘅 active PTW 轉 expired"
      }
    ],
    "visibility": "同項目所有已批准成員都睇得到 PTW 全部內容、QR 碼、簽署同掃描紀錄——包括唯讀嘅判頭工人同業主。原因：permits_to_work / permit_versions / permit_workers / permit_signoffs / permit_scans 以及 PTW 相關 approvals 嘅 SELECT policy 全部以 can_view_project(auth.uid(), project_id) 為準（admin、指派 PM、或任何 status=approved 嘅項目成員）。建立同審批先有額外限制（建立＝can_edit_project_progress；審批＝active_role_holders），但「睇得到」一律係全項目成員。",
    "confusions": [
      "以為 PTW 一建立就生效——其實要行完整條審批鏈（如安全主任→總承建商）並簽署後，系統先會 activate_ptw 轉 active 並出 QR。",
      "新項目開咗都提交唔到 PTW——因為 PTW 審批鏈唔會自動 seed（只有 SI/VO 會），要先由系統管理員或項目經理喺簽核流程設定 PTW 鏈，否則 submit_ptw 報「此項目尚未配置工作許可證審批鏈」。",
      "動火工程關唔到——必須先撳「開始火警監察」並等夠 30 分鐘先可以完工關閉；而且只有建立人本人先做得到呢兩步。",
      "以為任何人都簽得到——只有輪到嗰一步嘅角色持有人（或鏈內指定嘅人、或 admin）先批得，否則會見到「你冇權批准呢個步驟」。",
      "掃 QR 提示要登入——QR 核實唔係匿名公開，掃描者必須登入而且係該項目已批准成員，每次掃描都會記低做審計。",
      "PTW 生效後仲改到內容？——唔得，activate_ptw 同時 locked_at 上鎖，之後新增版本會被 ptw_lock_guard 擋住。",
      "PTW 有效期幾耐？——生效當日香港時間 23:59 到期，並由每日 cron 自動轉 expired，唔係用足 24 小時。"
    ]
  },
  {
    "key": "daily-log",
    "title": "每日工地日誌",
    "icon": "ClipboardList",
    "summary": "由總承建商管工或工程師逐日記錄當日天氣、已處理嘅進度項目同工地事項，全項目成員可見，作為糾紛時嘅共同記錄。",
    "roles": [
      {
        "role": "總承建商(管工/工程師)",
        "can": "係唯一可以寫日誌嘅人。每人每日一份，揀天氣、剔返今日做咗嘅進度項目、加其他事項同備註。"
      },
      {
        "role": "系統管理員",
        "can": "可繞過角色限制讀寫所有日誌（v12 admin bypass）。"
      },
      {
        "role": "項目經理 / 老總(工地主任)",
        "can": "可以睇晒項目入面所有人嘅日誌，但本身唔可以寫（只有 main_contractor 管工/工程師先寫到）。"
      },
      {
        "role": "判頭 / 判頭工人",
        "can": "只能閱讀；介面會明確顯示「判頭/工人唔可以寫日誌 — 由總承建商管工或工程師代為填寫」。"
      },
      {
        "role": "業主",
        "can": "只能閱讀日誌。"
      }
    ],
    "steps": [
      {
        "actor": "總承建商(管工/工程師)",
        "action": "入項目 → 每日日誌，按右下角「填寫今日日誌」浮動掣（只有今日、有權限、未有今日日誌先見到）。",
        "result": "開啟今日填寫頁，頂部顯示今日香港日期。"
      },
      {
        "actor": "總承建商(管工/工程師)",
        "action": "揀今日天氣（晴/陰/雨/暴雨/熱/凍/大風其一，必揀）。",
        "result": "天氣 chip 變橙色選中。"
      },
      {
        "actor": "總承建商(管工/工程師)",
        "action": "喺「已處理進度項目」搜尋並剔選今日做咗嘅葉項目（只列出自己可見嘅項目）。",
        "result": "顯示「已選 N」。"
      },
      {
        "actor": "總承建商(管工/工程師)",
        "action": "加「其他事項」逐行輸入（例如吊機保養、安全會議）同填備註，按「儲存」。",
        "result": "INSERT 通過 dailies RLS（自己 user_id + main_contractor 管工/工程師 + 已批准成員），寫入一條 (project_id,user_id,date) 唯一記錄，跳返列表。"
      },
      {
        "actor": "全項目已批准成員",
        "action": "入每日日誌、揀日期，睇當日所有人提交嘅日誌卡（姓名、公司、天氣、進度項目、事項、備註）。",
        "result": "dailies_select 通過，列表即時顯示；realtime 令同事一提交就刷新。"
      },
      {
        "actor": "總承建商(管工/工程師)",
        "action": "想改就喺自己卡按「編輯我嘅日誌」（只限今日卡先出現）。",
        "result": "重新填寫並覆蓋；只有 date = 今日香港日期先改得到。"
      }
    ],
    "flow": [
      {
        "actor": "總承建商(管工/工程師)",
        "action": "撰寫並儲存當日日誌（自己一份，每日唯一）",
        "seenBy": [
          "撰寫人本人"
        ],
        "note": "INSERT RLS：user_id=自己 AND global_role=main_contractor AND sub_role∈(foreman,engineer) AND 已批准成員。其他角色連「填寫」掣都唔會出現。"
      },
      {
        "actor": "系統(RLS dailies_select)",
        "action": "日誌即時對全項目可見",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總(工地主任)",
          "總承建商(工程師/管工/安全)",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "SELECT 條件 = 該 project 嘅已批准成員(project_members.status='approved')。唔分角色，全部已批准成員都讀到 → 糾紛時嘅共同記錄。非成員一律睇唔到。"
      },
      {
        "actor": "撰寫人",
        "action": "當日內可重複編輯/刪除自己嗰份",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "UPDATE/DELETE RLS：user_id=自己 AND date=今日香港日期。過咗當日就鎖死，介面顯示「尋日嘅日誌已鎖，唔可以再改」。"
      }
    ],
    "visibility": "同一項目所有已批准成員都睇得到每一份日誌（dailies_select = 該 project_members 內 status='approved' 嘅人，唔分角色）。原因：日誌係糾紛時嘅共同審計記錄，所以連業主、判頭、判頭工人都讀得到，但只有總承建商管工/工程師寫得到。非項目成員完全睇唔到。",
    "confusions": [
      "判頭/判頭工人成日以為自己應該寫日誌 — 其實佢哋只可閱讀，要由總承建商管工或工程師代為填寫；介面有黃色提示講明原因。",
      "總承建商員工如果 sub_role 唔係「管工」或「工程師」（例如安全），都寫唔到日誌，只見得到唔見「填寫」掣。",
      "尋日嘅日誌改唔到 — 編輯只限當日香港時間，過咗就永久鎖死(RLS date 檢查)，唔係 bug。",
      "每人每日只可有一份日誌(project_id+user_id+date 唯一)，再開只會係編輯同一份，唔會新增多份。"
    ]
  },
  {
    "key": "material-request",
    "title": "物料申請 / 到貨",
    "icon": "Package",
    "summary": "由判頭或總承建商等申請工地物料、填預計到貨時間，到貨時逐次記低入貨數量；狀態（已申請/部分到貨/已齊料）自動計算，全項目成員可見。",
    "roles": [
      {
        "role": "判頭",
        "can": "可開物料申請（填名、單位、需求量、預計到貨、連結進度項目）；之後只可改/刪自己開嗰張。"
      },
      {
        "role": "總承建商(管工/工程師)",
        "can": "可開申請、入貨；非主管身份只可改/刪自己開嗰張。"
      },
      {
        "role": "項目經理 / 老總(工地主任) / 系統管理員 / 該項目指派 PM",
        "can": "物料主管：可改/刪/入貨任何一張物料(v16 is_material_supervisor)。"
      },
      {
        "role": "判頭工人",
        "can": "只能閱讀物料清單。"
      },
      {
        "role": "業主",
        "can": "只能閱讀物料清單。"
      }
    ],
    "steps": [
      {
        "actor": "判頭(或總承建商/PM)",
        "action": "入項目 → 物料，按右下「加物料」，填物料名、單位、需求量、預計到貨時間，可剔急件、可連結進度項目。",
        "result": "INSERT RLS 通過（已批准成員 + global_role∈admin/pm/main_contractor/subcontractor，requested_by=自己），新增一張「已申請」物料。"
      },
      {
        "actor": "全項目已批准成員",
        "action": "睇物料清單，可按全部/已申請/部分到貨/已齊料/逾期篩選；逾期(過咗預計到貨仍未到齊)以紅標顯示。",
        "result": "materials_select 通過，所有人見到同一份清單同自動狀態。"
      },
      {
        "actor": "申請人 或 物料主管",
        "action": "到貨時喺該物料按「入貨」，輸入今次收到嘅數量。",
        "result": "qty_arrived 累加；齊料時 trigger 自動 stamp arrived_at，狀態跳「已齊料」。"
      },
      {
        "actor": "申請人 或 物料主管",
        "action": "需要時按「編輯」改預計到貨/數量，或按「刪除」移除。",
        "result": "UPDATE/DELETE RLS：requested_by=自己 OR 物料主管，先做得到；其他人連按鈕都唔會見到。"
      }
    ],
    "flow": [
      {
        "actor": "判頭/總承建商/PM",
        "action": "建立物料申請(planned_arrival_at + 連結進度項目)",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "INSERT RLS：已批准成員 AND global_role∈(admin,pm,main_contractor,subcontractor) AND requested_by=自己。判頭工人/業主開唔到。"
      },
      {
        "actor": "系統(materials_select)",
        "action": "物料即時對全項目可見",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總(工地主任)",
          "總承建商(工程師/管工/安全)",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "SELECT = 該 project 已批准成員，唔分角色。狀態(已申請/部分/已齊)係 generated column，逾期喺前端同 get_timetable 計，全部人睇到一致結果。"
      },
      {
        "actor": "申請人 或 物料主管",
        "action": "記錄入貨數量 → 狀態自動更新",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "UPDATE RLS(v16)：requested_by=自己 OR is_material_supervisor(admin/pm/general_foreman/該項目指派PM)。修正咗 v11 bug：以前任何 main_contractor/subcontractor 可改人哋張單。"
      },
      {
        "actor": "系統",
        "action": "到貨日子自動上行事曆",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "get_timetable 用 arrived_at(無就 planned_arrival_at)把物料當「物料」事件 union 入統一行事曆。"
      }
    ],
    "visibility": "同一項目所有已批准成員都睇得到全部物料同其狀態(materials_select = 已批准成員，唔分角色)。但寫入受限：開單要係 admin/pm/main_contractor/subcontractor，改/刪/入貨只限開單人本人或物料主管(admin/pm/general_foreman/指派PM)。非項目成員睇唔到。",
    "confusions": [
      "判頭以為可以改其他人開嘅物料 — v16 之後唔得，非主管只可改自己開嗰張(早期係 bug，可改人哋張單)。",
      "狀態係自動計嘅：齊料前你只可一次次「入貨」累加數量，唔可以直接揀「已齊料」。",
      "「逾期」唔係儲存喺資料庫嘅狀態，係即時計（已申請+過咗預計到貨），所以唔會出現喺資料庫 status 欄。",
      "判頭工人同業主睇到物料但無任何編輯掣 — 屬正常唯讀，唔係載入失敗。"
    ]
  },
  {
    "key": "timetable",
    "title": "統一行事曆",
    "icon": "Calendar",
    "summary": "一個合併時間表，自動拉物料預計/實際到貨、進度項目嘅計劃完工日，再加 PM 手動加嘅會議/驗收/里程碑事件，全項目成員按日睇。",
    "roles": [
      {
        "role": "項目經理 / 老總(工地主任) / 系統管理員",
        "can": "睇行事曆，並可手動新增/編輯/刪除事件（會議、驗收、里程碑、其他）。"
      },
      {
        "role": "總承建商",
        "can": "睇行事曆，並可新增事件；但只可改/刪自己建立嗰個事件。"
      },
      {
        "role": "判頭 / 判頭工人 / 業主",
        "can": "只能閱讀整個行事曆（物料到貨 + 進度完工 + 事件），唔可以加事件。"
      }
    ],
    "steps": [
      {
        "actor": "任何已批准成員",
        "action": "入項目 → 行事曆，揀週/月範圍。",
        "result": "呼叫 get_timetable(project,from,to)，先驗證你係已批准成員，再回傳三類事件按日分組。"
      },
      {
        "actor": "系統",
        "action": "自動填入：物料到貨(藍)、進度完工(綠，用 planned_end)、手動事件(紫)。",
        "result": "三個來源 union 並按時間排序顯示，唔使人手輸入物料/進度。"
      },
      {
        "actor": "項目經理 / 老總 / 總承建商",
        "action": "按「＋」新增手動事件，填標題、類型(會議/驗收/里程碑/其他)、開始時間、地點等。",
        "result": "events_insert RLS 通過(已批准成員 + global_role∈admin/pm/main_contractor，created_by=自己)，事件即時上行事曆。"
      },
      {
        "actor": "事件建立人 或 PM/admin",
        "action": "需要時編輯或刪除事件。",
        "result": "events_update/delete RLS：created_by=自己 OR admin/pm。"
      }
    ],
    "flow": [
      {
        "actor": "已批准成員",
        "action": "開行事曆並選日期範圍",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "get_timetable 係 security definer RPC，入口先 check auth.uid() + project_members status='approved'，非成員直接 raise exception。"
      },
      {
        "actor": "系統(get_timetable)",
        "action": "union 物料到貨 + 進度完工 + 手動事件",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總(工地主任)",
          "總承建商",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "三個底層表(materials/progress_items/events)各自仍有 SELECT RLS = 已批准成員，RPC 再加一層成員 gate；所以行事曆內容對全項目已批准成員一致可見。"
      },
      {
        "actor": "項目經理/老總/總承建商",
        "action": "手動加事件(會議/驗收/里程碑)",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "events_insert：已批准成員 AND global_role∈(admin,pm,main_contractor)。刻意唔俾判頭/工人/業主加，避免行事曆被亂加。"
      }
    ],
    "visibility": "同一項目所有已批准成員都睇到完整行事曆(get_timetable 入口 gate = status='approved' 成員；底層 materials/events/progress_items SELECT 亦同樣係已批准成員)。手動事件嘅寫入則限 admin/pm/main_contractor。非成員連 RPC 都會被 raise exception 擋住。",
    "confusions": [
      "物料同進度嗰啲行事曆項目唔使人手加 — 系統自動由物料 planned_arrival_at/arrived_at 同進度 planned_end 拉出嚟。",
      "判頭/工人/業主見到行事曆但無「＋」加事件掣 — 因為只有 admin/pm/main_contractor 可以加手動事件。",
      "進度完工事件用「計劃完工日(planned_end)」嚟排，唔係實際完工，所以代表預計而非已完成。",
      "總承建商加咗事件後改唔到人哋加嘅事件 — 非 admin/pm 只可改自己 created_by 嗰啲。"
    ]
  },
  {
    "key": "contacts",
    "title": "聯絡人",
    "icon": "Contact",
    "summary": "每個項目嘅電話簿，記低分判/各行頭(電工、水喉、紮鐵、棚架等)嘅名、行頭同電話，方便工地即撳即打；只有管理員或項目經理可維護。",
    "roles": [
      {
        "role": "系統管理員 / 項目經理",
        "can": "新增、編輯、刪除聯絡人(名、行頭、電話、備註)。"
      },
      {
        "role": "老總(工地主任) / 總承建商 / 判頭 / 判頭工人 / 業主",
        "can": "只能閱讀及搜尋聯絡人、tap-to-call，唔可以改名單。"
      }
    ],
    "steps": [
      {
        "actor": "系統管理員 / 項目經理",
        "action": "入項目 → 聯絡人，按「新增」，填姓名、行頭、電話、備註。",
        "result": "contacts_insert RLS 通過(已批准成員 + global_role∈admin/pm，created_by=自己)，加入名單。"
      },
      {
        "actor": "任何已批准成員",
        "action": "用搜尋(名/行頭/電話)或行頭篩選搵聯絡人，喺工地直接撳電話打出。",
        "result": "contacts_select 通過，全項目成員都搵到同一份名單。"
      },
      {
        "actor": "系統管理員 / 項目經理",
        "action": "需要時按編輯或刪除維護名單。",
        "result": "contacts_update/delete RLS：只限 global_role∈admin/pm；其他角色見唔到「新增/編輯/刪除」掣。"
      }
    ],
    "flow": [
      {
        "actor": "系統管理員/項目經理",
        "action": "新增/編輯/刪除聯絡人",
        "seenBy": [
          "全項目已批准成員"
        ],
        "note": "INSERT 條件 = global_role∈(admin,pm) AND 已批准成員 AND created_by=自己；UPDATE/DELETE = global_role∈(admin,pm)。工人/判頭/業主寫唔到。"
      },
      {
        "actor": "系統(contacts_select)",
        "action": "名單對全項目可見",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "老總(工地主任)",
          "總承建商",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "SELECT = 該 project 已批准成員，唔分角色 → 工地任何人都可即撳即打。非成員睇唔到。"
      }
    ],
    "visibility": "同一項目所有已批准成員都睇到聯絡人名單(contacts_select = 已批准成員，唔分角色)，方便工地任何人 tap-to-call。但只有系統管理員或項目經理(global_role∈admin/pm)先可以新增/編輯/刪除。非項目成員完全睇唔到。",
    "confusions": [
      "工地師傅成日問點解加唔到聯絡人 — 因為只有 admin/pm 可維護名單，其餘角色得閱讀。",
      "聯絡人係逐個項目獨立嘅(project_id)，唔係全公司共用通訊錄。",
      "名單對判頭/工人/業主全部可見 — 係刻意設計方便現場撳電話，唔係權限漏洞。"
    ]
  },
  {
    "key": "drawing-version-control",
    "title": "圖則版本管理",
    "icon": "FileText",
    "summary": "將圖則 PDF/相片掛喺進度樹嘅 leaf 工序上，每次上傳新版會自動把舊版標記為「已取代」，保留完整版本歷史作存證。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "任何項目都可上傳新圖、上傳新版本、撤回版本（can_upload_drawing 永遠 true）"
      },
      {
        "role": "項目經理 (pm)",
        "can": "本項目（被指派或已批准成員）可上傳新圖則同新版本"
      },
      {
        "role": "總承建商員工 (main_contractor)",
        "can": "已批准成員可上傳新圖則同新版本（工程師/管工/安全皆可）"
      },
      {
        "role": "老總 (general_foreman)",
        "can": "前端 canUpload 容許上傳（DrawingsSection 將 general_foreman 列入可上傳名單）"
      },
      {
        "role": "判頭 (subcontractor)",
        "can": "只可瀏覽，唔可以上傳（D-25 明確將 subcontractor 排除出 can_upload_drawing）"
      },
      {
        "role": "判頭工人 / 業主 (subcontractor_worker / owner)",
        "can": "只可瀏覽，唔可以上傳或改動"
      }
    ],
    "steps": [
      {
        "actor": "項目經理 / 總承建商",
        "action": "喺某個 leaf 工序卡下面嘅「圖則」區，按「＋」開啟上傳介面（圖則只可掛喺最底層 leaf 工序，trigger drawings_leaf_only 會擋住非 leaf）",
        "result": "開啟 DrawingUploadSheet"
      },
      {
        "actor": "項目經理 / 總承建商",
        "action": "揀檔案（PDF/JPEG/PNG）、填標題同修訂編號，上傳",
        "result": "檔案存入私有 bucket project-drawings，新增 drawings + 第一個 drawing_versions（version_no=1, status=current）"
      },
      {
        "actor": "項目經理 / 總承建商",
        "action": "之後要更新時，喺同一張圖按「上傳新版本」",
        "result": "呼叫 supersede_drawing_version RPC：插入新版 status=current、舊版自動轉 superseded、drawings.current_version_id 指向新版（單一交易，原子操作）"
      },
      {
        "actor": "同項目成員",
        "action": "點開圖則縮圖檢視，或睇版本歷史",
        "result": "透過 signed URL 開啟（bucket 係 private），睇到現行版同所有舊版"
      }
    ],
    "flow": [
      {
        "actor": "PM / 總承建商",
        "action": "上傳圖則 / 新版本到 leaf 工序",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商員工",
          "老總",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "drawings/drawing_versions SELECT = can_view_project — 即同項目任何已批准成員都見到"
      },
      {
        "actor": "系統",
        "action": "supersede_drawing_version 把舊版標 superseded、指針指向新版",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商員工",
          "老總",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "版本歷史唔會刪除（v1 圖則 immortal，storage 無 delete policy）"
      },
      {
        "actor": "同項目成員",
        "action": "經 signed URL 開檔檢視",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商員工",
          "老總",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "storage policy「Members read drawings」= bucket project-drawings 且 can_view_project；非本項目人士攞唔到 signed URL"
      }
    ],
    "visibility": "同一項目嘅所有已批准成員（連業主、判頭工人）都可以睇到圖則同全部版本——SELECT policy「Members view drawings」/「Members view versions」都係 can_view_project(auth.uid(), project_id)。檔案本身放喺 private bucket，storage SELECT policy 同樣係 can_view_project，所以非本項目人士連 signed URL 都攞唔到。能唔能夠『上傳』就用另一條更窄嘅 can_upload_drawing（admin / 本項目 PM / 已批准 pm 或 main_contractor），明確唔包 subcontractor。",
    "confusions": [
      "判頭以為自己睇到圖就可以上傳：其實判頭係唯讀，可見 ≠ 可改，能上傳要 PM 或總承建商。",
      "以為可以掛喺任何一層工序：圖則只可掛喺最底 leaf 工序，掛喺有子項嘅工序會被 trigger 擋住。",
      "以為上傳新版會覆蓋舊版：舊版唔會消失，只係標記為『已取代』，永久保留作存證。",
      "以為改咗 RLS 嘅人睇唔到舊圖：圖則同 storage 都冇 delete policy，圖則係不可刪嘅證據。"
    ]
  },
  {
    "key": "user-role-management",
    "title": "用戶管理（管理員改角色）",
    "icon": "UserCog",
    "summary": "系統管理員喺一個總名單度搜尋所有用戶、查看每個人嘅待處理簽核工作，並更改其全域角色（同總承建商職位 sub_role）。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "經 admin_list_user_profiles 睇全部用戶、改任何人角色 / sub_role、查看待處理簽核；唔可以改自己（編輯掣 disabled）"
      },
      {
        "role": "其他所有角色",
        "can": "完全入唔到此頁（前端擋 + RLS 唔畀直接列舉用戶）；任何人都改唔到自己嘅 global_role（trigger 會還原）"
      }
    ],
    "steps": [
      {
        "actor": "系統管理員",
        "action": "入「用戶管理」頁，用搜尋框或角色 chip 篩選用戶",
        "result": "前端呼叫 admin_list_user_profiles RPC（security definer），返回全部用戶名單"
      },
      {
        "actor": "系統管理員",
        "action": "揀一個用戶按「編輯角色」，選新嘅全域角色（若選總承建商再揀工程師/管工/安全）",
        "result": "開啟 EditRoleModal"
      },
      {
        "actor": "系統管理員",
        "action": "按「儲存」",
        "result": "呼叫 admin_update_user_role RPC，更新該用戶 global_role / sub_role；非總承建商會清空 sub_role"
      },
      {
        "actor": "系統管理員",
        "action": "（可選）按「查看待處理簽核」",
        "result": "彈出 InFlightApprovalsModal，列出該用戶目前需要佢處理嘅 SI/VO 簽核"
      }
    ],
    "flow": [
      {
        "actor": "系統管理員",
        "action": "列舉全部用戶（admin_list_user_profiles，set row_security off）",
        "seenBy": [
          "系統管理員"
        ],
        "note": "v17 收窄咗 user_profiles 直接 SELECT，只有 admin RPC 先睇到全名單（含電話 PII）"
      },
      {
        "actor": "系統管理員",
        "action": "改某用戶角色（admin_update_user_role）",
        "seenBy": [
          "系統管理員",
          "被改嘅該用戶"
        ],
        "note": "RPC 入面 if not admin → raise exception 'admin only'；直接 PATCH 會被 enforce_user_profile_write_gate trigger 還原 global_role"
      },
      {
        "actor": "被改角色嘅用戶",
        "action": "下次登入 / 重新載入 profile",
        "seenBy": [
          "被改嘅該用戶",
          "同項目隊友（部分欄位）"
        ],
        "note": "新角色即時改變佢喺各項目嘅權限（如可否上傳圖則、可否簽核）"
      }
    ],
    "visibility": "呢個功能嘅輸出（全部用戶名單同電話）只有系統管理員睇到——v17 把 user_profiles SELECT policy 收窄成『自己 / 同項目隊友 / 申請者嘅 PM』三種情況，admin 嘅全名單係靠 admin_list_user_profiles（security definer + row_security off + 入面檢查 global_role='admin'）。改角色亦只能經 admin_update_user_role；普通用戶就算直接打 REST PATCH 改自己做 admin，BEFORE UPDATE trigger enforce_user_profile_write_gate 都會把 global_role 還原（修補咗自我升權漏洞）。",
    "confusions": [
      "以為普通用戶可以改自己角色：trigger 會即時還原 global_role / sub_role / phone / id，只有 admin 例外。",
      "以為 admin 改完角色要對方做啲嘢：唔使，下次對方載入 profile 權限就變，但 OneSignal/session 唔受影響。",
      "以為 admin 睇到嘅名單同普通用戶一樣：普通用戶只睇到自己同隊友，admin 經專用 RPC 先睇到全公司名單同電話。",
      "sub_role（工程師/管工/安全）只對總承建商有意義：改成其他角色時系統會自動清空 sub_role。"
    ]
  },
  {
    "key": "approval-chain-config",
    "title": "簽核流程設定（每項目 SI/VO/PTW 簽核鏈）",
    "icon": "ListChecks",
    "summary": "為每個項目分別設定工地指令(SI)、變更指令(VO)、工作許可證(PTW)嘅審批步驟順序同每步所需角色（可選擇指定特定人）；已提交文件會凍結舊流程，唔受改動影響。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "任何項目都可編輯 SI/VO/PTW 三條鏈嘅步驟、角色、排序（chain SELECT/INSERT/UPDATE/DELETE policy 容許 admin）"
      },
      {
        "role": "項目經理 (pm)（被指派 assigned_pm_ids）",
        "can": "本項目可編輯三條簽核鏈（canEdit = admin 或 assignedPmIds.includes(self)）"
      },
      {
        "role": "其他成員（總承建商/判頭/業主等）",
        "can": "只可唯讀檢視鏈設定（頁面顯示『唯讀模式』橫額）"
      }
    ],
    "steps": [
      {
        "actor": "系統管理員 / 項目PM",
        "action": "由項目管理入「簽核流程設定」，揀 SI / VO / PTW tab",
        "result": "載入該項目該文件類型現有步驟（approval_chain_steps）"
      },
      {
        "actor": "系統管理員 / 項目PM",
        "action": "加 / 移除步驟、上下移調整順序、每步揀所需角色（可選指定特定成員 optional_user）；亦可按「預設範本」載入內建鏈",
        "result": "本地 workingSteps 改動，按鈕變為可儲存（dirty）"
      },
      {
        "actor": "系統管理員 / 項目PM",
        "action": "按「儲存」",
        "result": "saveChain 寫入 approval_chain_steps（step_order 重新由 0 排序）；顯示『已儲存簽核流程』"
      },
      {
        "actor": "文件提交者（如總承建商提交 SI）",
        "action": "之後提交一份新 SI/VO/PTW",
        "result": "提交時把當時嘅鏈快照 chain_snapshot 凍結入文件；日後改鏈唔影響已提交文件"
      }
    ],
    "flow": [
      {
        "actor": "系統管理員 / 項目PM",
        "action": "儲存簽核鏈步驟到 approval_chain_steps",
        "seenBy": [
          "系統管理員",
          "項目經理",
          "總承建商員工",
          "老總",
          "判頭",
          "判頭工人",
          "業主"
        ],
        "note": "chain SELECT policy「Members view chain config」= can_view_project，全項目成員都見到鏈長成點"
      },
      {
        "actor": "文件提交者",
        "action": "提交 SI/VO/PTW，鏈快照寫入 chain_snapshot",
        "seenBy": [
          "系統管理員",
          "鏈上各步所需角色持有人"
        ],
        "note": "凍結後改鏈唔追溯；submit_approval 用 active_role_holders 判斷邊個有權批呢一步"
      },
      {
        "actor": "當前步驟角色持有人",
        "action": "批准 / 退回 / 拒絕（經 submit_approval RPC）",
        "seenBy": [
          "系統管理員",
          "提交者",
          "鏈上相關角色"
        ],
        "note": "分支：批准→advance 落一步；退回(request_revision)→回提交者修訂；拒絕→終止。admin 可 admin_override（但 PTW 安全主任步驟唔接受 override）"
      }
    ],
    "visibility": "簽核鏈嘅設定本身（每步要邊個角色）係全項目成員可見——approval_chain_steps SELECT policy 係 can_view_project，所以判頭、業主都睇到流程長成點、要經幾多關。但『編輯』就收窄到 INSERT/UPDATE/DELETE policy：只有 admin 或該項目 assigned_pm_ids 入面嘅 PM。前端 canEdit 同呢條 RLS 對齊。能唔能『執行某一步簽核』再由 active_role_holders 決定（該步 required_role 嘅已批准成員 + admin + 對該角色嘅有效授權人 delegate）。",
    "confusions": [
      "以為改咗鏈會影響緊處理緊嘅文件：唔會，已提交文件用提交當刻凍結嘅 chain_snapshot，改鏈只影響之後新提交嘅。",
      "以為總承建商/判頭可以改流程：佢哋只睇到流程唯讀，編輯權只限 admin 同本項目 PM。",
      "optional_user（指定特定人）同 required_role 嘅分別：指定咗特定人就只有嗰個人（或 admin）可以批嗰一步，否則係該角色全部持有人都得。",
      "PTW 嘅安全主任步驟唔可以畀 admin 一鍵 override 跳過——admin_override 係刻意唔滿足 safety_officer 步驟（安全把關)。"
    ]
  },
  {
    "key": "dashboard",
    "title": "儀表板（管理員 / PM 跨項目）",
    "icon": "LayoutDashboard",
    "summary": "管理員同 PM 一頁睇晒自己負責嘅多個工地總覽——工地總數、進度正常/落後、處理中問題，加上跨項目嘅最近動態（新問題、進度更新、入隊申請）。",
    "roles": [
      {
        "role": "系統管理員 (admin)",
        "can": "睇晒所有項目嘅進度滾算、問題統計同動態（visibleProjects = 全部 projects）"
      },
      {
        "role": "項目經理 (pm)（被指派）",
        "can": "只睇到自己被指派嘅項目（assigned_pm_ids 含自己）嘅統計同動態"
      },
      {
        "role": "其他角色（總承建商/判頭/業主/工人）",
        "can": "入唔到儀表板（前端：非 admin 又唔係任何項目 PM → 轉去 /home）"
      }
    ],
    "steps": [
      {
        "actor": "系統管理員 / 項目PM",
        "action": "登入後入「儀表板 Dashboard」",
        "result": "計出 visibleProjects（admin=全部；PM=被指派），組成 projectIdsKey"
      },
      {
        "actor": "系統",
        "action": "一次過抓呢批項目嘅 progress_items 同 issues",
        "result": "每個項目用 getZoneLeaves + computeRollup 計實際/計劃進度同狀態（正常/落後/完成）"
      },
      {
        "actor": "系統",
        "action": "由已抓資料 derive 動態（最近問題、進度更新、入隊申請）並抓相關用戶名",
        "result": "右側顯示最近 15 條動態，左側顯示每個工地進度條 + 狀態 chip"
      },
      {
        "actor": "系統管理員 / 項目PM",
        "action": "點某個工地卡 / 動態",
        "result": "跳去該項目詳情或對應問題頁"
      }
    ],
    "flow": [
      {
        "actor": "系統管理員 / 項目PM",
        "action": "抓多個項目 progress_items + issues 做跨項目滾算",
        "seenBy": [
          "系統管理員",
          "項目經理"
        ],
        "note": "前端 gating：非 admin 且唔係任何項目 PM 即 Navigate 去 /home；資料層仍受各表 RLS（progress/issues = can_view_project）約束"
      },
      {
        "actor": "系統",
        "action": "computeRollup 計每個工地實際 vs 計劃進度，分類正常/落後/完成",
        "seenBy": [
          "系統管理員",
          "項目經理"
        ],
        "note": "落後判定：actual < planned−5（deriveStatus）；planned 由排程日期線性推算"
      },
      {
        "actor": "系統管理員 / 項目PM",
        "action": "睇動態、點入工地",
        "seenBy": [
          "系統管理員",
          "項目經理"
        ],
        "note": "動態用戶名靠 user_profiles SELECT；admin 經隊友關係或自身可見，普通 PM 受 shares_project_with 約束"
      }
    ],
    "visibility": "儀表板嘅總覽只有 admin 同 PM 睇到——前端明確 gate：profile.global_role !== 'admin' 而且冇任何 project.assigned_pm_ids 含自己，就 Navigate 去 /home。admin 嘅 visibleProjects 係全部項目，PM 只係自己被指派嘅項目。背後資料仍然受表級 RLS 保護（progress_items / issues SELECT = can_view_project），所以就算前端 gate 被繞過，PM 都抓唔到唔屬於佢項目嘅資料。動態裏面顯示嘅人名靠 user_profiles SELECT policy（自己/隊友/申請者PM）。",
    "confusions": [
      "以為判頭/工人都有儀表板：冇，呢頁淨係 admin 同 PM；其他角色會被導去主頁。",
      "以為 PM 睇到全公司工地：PM 只睇到 assigned_pm_ids 包含自己嘅項目，admin 先睇到全部。",
      "『進度落後』點計：系統用排程日期推算『今日應該去到幾多 %』，actual 低過 planned 超過 5% 先當落後，唔係同 100% 比。",
      "動態唔係另外查一個 log 表：係由已抓嘅 issues / memberships / progress_items 即場 derive 出嚟。"
    ]
  },
  {
    "key": "push-notifications",
    "title": "推送通知",
    "icon": "Bell",
    "summary": "原生 App 經 Capacitor 攞 APNs/FCM token 註冊到 OneSignal，DB trigger 喺簽核事件（SI 提交、輪到你批、流程完成等）只推俾相關人，並設每人每日 3 條上限防滋擾，超額入 08:00 摘要。",
    "roles": [
      {
        "role": "所有角色（原生 App 用戶）",
        "can": "登入時被詢問推送權限，授權後收到同自己有關嘅推送；登出時清走自己嘅 onesignal_id"
      },
      {
        "role": "系統 / DB trigger（push_dispatcher）",
        "can": "唯一合法發送者（security definer），按事件鎖定目標 external_id 發送，並維護每日計數"
      },
      {
        "role": "Web 用戶",
        "can": "唔收原生推送（isNative()=false 直接 return，純網頁版唔註冊）"
      }
    ],
    "steps": [
      {
        "actor": "用戶（原生 App）",
        "action": "登入",
        "result": "pushLoginUser → requestPushPermission；授權後 PushNotifications.register() 攞 token"
      },
      {
        "actor": "系統",
        "action": "把 token 註冊到 OneSignal /players，external_user_id = Supabase user id，device_type iOS=0 / Android=1",
        "result": "把回傳 playerId 寫入 user_profiles.onesignal_id"
      },
      {
        "actor": "另一用戶 / 系統",
        "action": "觸發事件（例如總承建商提交 SI、輪到 PM 批准）",
        "result": "DB trigger 呼叫 push_dispatcher(目標user, payload)"
      },
      {
        "actor": "系統",
        "action": "原子遞增 notification_counters；count≤3 即經 pg_net POST 去 OneSignal 推送、含 deep_link；count>3 入 notification_digest",
        "result": "目標用戶收到 zh-Hant 推送，點開經 deep link 入對應頁；超額者翌日 08:00 HKT 收摘要"
      },
      {
        "actor": "用戶",
        "action": "登出",
        "result": "pushLogoutUser 先清 user_profiles.onesignal_id（要 live session），再 signOut，避免共用機收錯人推送"
      }
    ],
    "flow": [
      {
        "actor": "用戶 App",
        "action": "註冊 token 到 OneSignal，寫 onesignal_id 入自己 profile",
        "seenBy": [
          "該用戶自己"
        ],
        "note": "external_user_id = user.id；onesignal_id 寫入受 user_profiles UPDATE 約束（自己可改 onesignal_id 欄）"
      },
      {
        "actor": "事件 trigger",
        "action": "push_dispatcher 鎖定目標 external_id 發推",
        "seenBy": [
          "被通知嘅目標用戶"
        ],
        "note": "只推俾事件相關人（如該步 active_role_holders / 提交者），唔係廣播；函數對 authenticated/anon revoke，只能由 security definer trigger 叫"
      },
      {
        "actor": "系統",
        "action": "每人每日第4條起轉入摘要，08:00 HKT cron drain",
        "seenBy": [
          "被通知嘅目標用戶"
        ],
        "note": "防 OneSignal 免費額度耗盡 + 防滋擾（3/日硬上限）"
      }
    ],
    "visibility": "推送係點對點：push_dispatcher 用 include_aliases.external_id = 目標 user_id 發送，所以只有事件相關嘅嗰個人會收到（例如『輪到你簽核』只推俾當前步驟嘅 active_role_holders、SI 提交推俾下一關角色）。push_dispatcher 對 authenticated / anon 完全 revoke，唯一合法呼叫者係 security definer 嘅 trigger，普通用戶冇辦法自己亂發推。onesignal_id 存喺各人自己 profile，登出先清走，所以共用裝置唔會把推送送錯人。",
    "confusions": [
      "以為網頁版都會收推送：唔會，isNative() 為 false 就直接 return，推送只喺原生 App。",
      "以為通知無限：每人每日硬上限 3 條，第 4 條起入摘要，翌日 08:00 HKT 一次過送，係刻意防滋擾兼慳 OneSignal 免費額度。",
      "以為推送係廣播畀全項目：唔係，係按事件鎖定相關角色/人點對點發。",
      "登出次序好重要：要先清 onesignal_id 再 signOut（清走需要 live session），唔係咁共用機嘅下一個人會收到上一個人嘅推送。"
    ]
  },
  {
    "key": "offline-readonly-cache",
    "title": "離線唯讀快取",
    "icon": "WifiOff",
    "summary": "斷網時 App 進入唯讀模式：用最後一次同步嘅 localStorage 快取繼續顯示資料，但任何寫入（新增/修改/上傳）會即時被攔截並彈出一句清楚嘅 zh-HK 提示，唔會狂轉圈。",
    "roles": [
      {
        "role": "所有角色",
        "can": "離線時繼續睇返最後同步嘅資料（唯讀）；嘗試寫入會即時被擋並提示要連線"
      },
      {
        "role": "系統（supabase fetch 層）",
        "can": "離線時攔截 POST/PATCH/PUT/DELETE 嘅表寫入同 Storage 上傳，回一個 503 + OFFLINE_WRITE_MSG"
      }
    ],
    "steps": [
      {
        "actor": "系統",
        "action": "App 啟動偵測連線（Web online/offline 事件；原生加 Capacitor Network plugin）",
        "result": "維護一個模組級 _online 真相，contexts 可同步讀 getOnline 或用 useOnline 訂閱"
      },
      {
        "actor": "用戶",
        "action": "正常連線使用時，各 context 抓到資料",
        "result": "cacheSet 把最新資料寫入 localStorage（前綴 ckcon-cache-）"
      },
      {
        "actor": "用戶",
        "action": "斷網後繼續瀏覽",
        "result": "離線時 GET 自然失敗，context fallback 用 cacheGet 顯示最後同步資料；頂部顯示離線橫額"
      },
      {
        "actor": "用戶",
        "action": "離線時嘗試寫入（如更新進度、上傳圖、提交簽核）",
        "result": "fetchWithTimeout 喺打網絡前就攔截，回 503 + 訊息『離線中：此操作需要網絡連線，請連線後再試。』"
      }
    ],
    "flow": [
      {
        "actor": "用戶",
        "action": "離線中瀏覽",
        "seenBy": [
          "該用戶自己（裝置本機）"
        ],
        "note": "快取係該裝置 localStorage 嘅最後同步資料；唔涉及伺服器 RLS，純本機讀取"
      },
      {
        "actor": "系統 fetch 層",
        "action": "攔截離線寫入（REST 表 + Storage），唔攔 RPC（RPC POST 可能係讀）同 Auth/realtime",
        "seenBy": [
          "該用戶自己"
        ],
        "note": "回合成 PostgREST 形狀 error 令 supabase-js 解析出純 zh-HK 訊息"
      },
      {
        "actor": "用戶",
        "action": "重新連線後再操作",
        "seenBy": [
          "按各功能正常 RLS 受眾"
        ],
        "note": "Option A 唔排隊寫入；連線後用戶要自己重做，寫入結果嘅可見性回歸該功能原本 RLS（例如進度=can_view_project）"
      }
    ],
    "visibility": "離線快取嘅內容只係該裝置本機 localStorage 入面、用戶上次連線時已經（按正常 RLS）合法攞到嘅資料——所以快取無新增可見性，亦唔會洩漏佢本身睇唔到嘅嘢。寫入係刻意唔排隊（Option A 唯讀）：離線寫入喺 supabase fetch 層就被擋（POST/PATCH/PUT/DELETE 嘅 /rest/v1 表寫入同 /storage/v1 上傳），回 503 + OFFLINE_WRITE_MSG。RPC、Auth、realtime 唔攔（RPC POST 可能係讀，留返自然失敗好 fallback 快取）。",
    "confusions": [
      "以為離線時改嘅嘢會自動同步返：唔會，系統刻意唔排隊寫入，連線後要自己重做。",
      "以為離線見到資料即係已儲存：嗰啲只係上次同步嘅快取，離線下任何寫入都會被擋。",
      "以為快取會洩漏其他人資料：快取只係你上次合法攞到嘅資料，唔會多畀你睇你本身無權見嘅嘢。",
      "navigator.onLine 喺 iOS 有時會報錯誤『在線』：所以原生額外用 Capacitor Network plugin 做更可靠嘅偵測。"
    ]
  }
]

export const TUTORIAL_ORDER: string[] = ["auth-register-login","apply-join-project","project-management","user-role-management","approval-chain-config","progress-tracking","planned-progress","progress-report-export","drawing-version-control","report-issue","escalation-chain","handle-resolve-reopen","site-instruction","variation-order","multi-tier-approval","ptw-permit-to-work","daily-log","material-request","timetable","contacts","dashboard","push-notifications","offline-readonly-cache"]

// app screen/route → tutorial key for its 教學 button
export const SCREEN_TUTORIAL: Record<string, string> = {
  "progress": "progress-tracking",
  "issues": "report-issue",
  "si": "site-instruction",
  "vo": "variation-order",
  "ptw": "ptw-permit-to-work",
  "daily": "daily-log",
  "materials": "material-request",
  "timetable": "timetable",
  "contacts": "contacts",
  "drawings": "drawing-version-control",
  "admin": "project-management",
  "dashboard": "dashboard"
}

const BY_KEY: Record<string, Tutorial> = Object.fromEntries(TUTORIALS.map(t => [t.key, t]))
export function getTutorial(key: string): Tutorial | undefined { return BY_KEY[key] }
export function orderedTutorials(): Tutorial[] {
  const seen = new Set<string>()
  const out: Tutorial[] = []
  for (const k of TUTORIAL_ORDER) { const t = BY_KEY[k]; if (t) { out.push(t); seen.add(k) } }
  for (const t of TUTORIALS) if (!seen.has(t.key)) out.push(t)
  return out
}
