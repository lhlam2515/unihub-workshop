/**
 * Auth Service
 *
 * Orchestrate luồng đăng nhập:
 * 1. Xác thực credential với bcrypt
 * 2. Sinh Dual-Token (Access + Refresh)
 * 3. Xử lý platform-specific expiry:
 *    - WEB: Access token 15 phút
 *    - MOBILE: Access token 8 giờ
 *
 * Gọi TokenService để sinh token và UsersRepository để lấy user.
 * Trả INVALID_CREDENTIALS chung (không tiết lộ field sai).
 *
 * @see TokenService
 * @see UsersRepository
 */

import { Injectable } from "@nestjs/common";

import { TokenService } from "./token.service";
import { UsersRepository } from "../repositories/users.repository";

@Injectable()
export class AuthService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly tokenService: TokenService
  ) {}

  /**
   * login(email: string, password: string, platform: 'WEB' | 'MOBILE')
   *
   * TODO: Implement login flow
   * 1. Find user by email in UsersRepository
   * 2. If not found or status != ACTIVE -> return Err(INVALID_CREDENTIALS)
   * 3. Compare password with bcrypt
   * 4. If mismatch -> return Err(INVALID_CREDENTIALS)
   * 5. Generate Access token (platform-specific expiry)
   * 6. Generate Refresh token
   * 7. Return Ok({ access_token, refresh_token?, user })
   */
  async login(email: string, password: string, platform: "WEB" | "MOBILE") {
    // TODO: Implement
  }

  /**
   * refreshToken(refreshToken: string)
   *
   * TODO: Implement refresh flow
   * 1. Verify refresh token via TokenService
   * 2. Extract userId from payload
   * 3. Generate new Access token
   * 4. Optionally rotate Refresh token
   * 5. Return Ok({ access_token, refresh_token?, expires_in })
   */
  async refreshToken(refreshToken: string) {
    // TODO: Implement
  }

  /**
   * logout(userId: string, jti: string)
   *
   * TODO: Implement logout flow
   * 1. Blacklist current token in Redis
   * 2. Return Ok()
   */
  async logout(userId: string, jti: string) {
    // TODO: Implement
  }

  /**
   * getMe(userId: string)
   *
   * TODO: Implement get current user flow
   * 1. Find user by ID
   * 2. If STUDENT: also fetch student profile
   * 3. Return user info with role-specific fields
   */
  async getMe(userId: string) {
    // TODO: Implement
  }
}
