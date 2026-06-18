import { Capacitor } from '@capacitor/core'

// 生物認證 + 安全憑證儲存封裝（Face ID / 指紋 → Keychain / Keystore）
//
// 用途：升級驗證流程（step-up）會喺原生 App 上，用生物認證解鎖一個
// 安全儲存嘅登入密碼，再轉交俾 verify-stepup-password edge function。
// 呢個檔案只負責「封裝」，唔包 StepUpContext 嘅串接。
//
// 底層用 @capgo/capacitor-native-biometric（Capacitor 8 相容分支）：
//   - verifyIdentity()        彈出生物認證提示
//   - setCredentials()        以 BIOMETRY_ANY 存取控制寫入硬件保護憑證
//   - getSecureCredentials()  先做生物認證，成功先讀返憑證
//   - deleteCredentials()     清除已儲存憑證
//
// 跟 src/lib/offline.ts 同一套「動態載入 + catch」做法：
// 即使原生模組唔存在，都只會降級為「不可用」，唔會令 build / runtime 爆。
// Web 上一律返回不可用 / false。

// keychain server id —— 所有憑證讀寫都用呢個 id 做命名空間
const SERVER_ID = 'com.kwanchunkit.constructionapp.stepup'
// 配合密碼一齊儲存嘅佔位 username（呢個流程只關心密碼）
const CREDENTIAL_USERNAME = 'stepup'

// 動態 import 嘅型別（只取我哋用到嘅部分，避免 web build 硬連原生模組）
type AccessControlEnum = { BIOMETRY_ANY: number }
type NativeBiometricModule = {
  NativeBiometric: {
    isAvailable: () => Promise<{ isAvailable: boolean; strongBiometryIsAvailable?: boolean }>
    verifyIdentity: (options?: { reason?: string; title?: string; subtitle?: string }) => Promise<void>
    setCredentials: (options: {
      username: string
      password: string
      server: string
      accessControl?: number
    }) => Promise<void>
    getSecureCredentials: (options: { server: string; reason?: string; title?: string }) => Promise<{
      username: string
      password: string
    }>
    deleteCredentials: (options: { server: string }) => Promise<void>
  }
  AccessControl: AccessControlEnum
}

// 動態載入原生模組。Web 或模組缺失時返回 null（降級為不可用）。
async function loadPlugin(): Promise<NativeBiometricModule | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    return (await import('@capgo/capacitor-native-biometric')) as unknown as NativeBiometricModule
  } catch {
    // 模組缺失 —— 降級為不可用
    return null
  }
}

/**
 * 裝置上是否支援生物認證（有硬件 + 已登記）。
 * Web / 無硬件 / 無插件 → false。
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const mod = await loadPlugin()
  if (!mod) return false
  try {
    const result = await mod.NativeBiometric.isAvailable()
    return result.isAvailable === true
  } catch {
    return false
  }
}

/**
 * 將登入密碼存入硬件保護（生物認證鎖定）嘅 Keychain / Keystore。
 * 用 BIOMETRY_ANY 存取控制：之後讀取必須先通過生物認證，
 * 但加新指紋／Face ID 唔會令憑證失效。
 * 成功返回 true；不可用或失敗返回 false。
 */
export async function saveBiometricCredential(password: string): Promise<boolean> {
  const mod = await loadPlugin()
  if (!mod) return false
  try {
    await mod.NativeBiometric.setCredentials({
      username: CREDENTIAL_USERNAME,
      password,
      server: SERVER_ID,
      accessControl: mod.AccessControl.BIOMETRY_ANY,
    })
    return true
  } catch {
    return false
  }
}

/**
 * 彈出生物認證 → 成功後返回已儲存嘅密碼。
 * 用戶取消、認證失敗、無憑證或不可用 → 返回 null。
 */
export async function verifyAndGetCredential(): Promise<string | null> {
  const mod = await loadPlugin()
  if (!mod) return null
  try {
    const creds = await mod.NativeBiometric.getSecureCredentials({
      server: SERVER_ID,
      reason: '確認你的身分以進行高風險操作',
      title: '生物認證',
    })
    return creds.password ?? null
  } catch {
    // 取消 / 認證失敗 / 無憑證
    return null
  }
}

/**
 * 清除已儲存嘅生物認證憑證（例如登出或停用 step-up 時）。
 * 不可用或無憑證時靜默返回。
 */
export async function clearBiometricCredential(): Promise<void> {
  const mod = await loadPlugin()
  if (!mod) return
  try {
    await mod.NativeBiometric.deleteCredentials({ server: SERVER_ID })
  } catch {
    // 無憑證或不可用 —— 靜默忽略
  }
}
