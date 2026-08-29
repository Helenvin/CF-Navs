import type { LoginResp } from '../../shared/types'
import { cacheValidatedSession } from '../middleware/auth'
import type { Env, SessionValue } from '../types'
import { getJwtSecret, signJwt } from './jwt'

const FALLBACK_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

export function getSessionTtlSeconds(raw: string | undefined): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FALLBACK_SESSION_TTL_SECONDS
}

export async function createSession(env: Env, username: string): Promise<LoginResp> {
  const ttlSeconds = getSessionTtlSeconds(env.SESSION_TTL)
  const expires_at = Date.now() + ttlSeconds * 1000

  const secret = await getJwtSecret(env.DB)
  const session: SessionValue = { username, exp: expires_at }
  // jti 让每个会话都是唯一的 token。没有它时 payload 只有 {username, exp}，
  // 同一毫秒内的两次登录会签出逐字节相同的 token —— 撤销其中一个就等于把两个
  // 都撤销了，「退出这台设备」的语义根本不成立。
  const token = await signJwt({ ...session, jti: crypto.randomUUID() }, secret)

  cacheValidatedSession(token, session)

  return { token, expires_at, username }
}
