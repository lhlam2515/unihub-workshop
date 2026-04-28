/**
 * Users Service
 *
 * Các thao tác quản lý người dùng dành cho Admin:
 * - listUsers(role?)
 * - getUserById(id)
 * - updateUserStatus(id, status)
 *
 * Khi SUSPENDED, tự động gọi TokenService.blacklistToken()
 */

import { Injectable } from '@nestjs/common';

import { TokenService } from './token.service';
import { UsersRepository } from '../repositories/users.repository';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepo: UsersRepository,
    private readonly tokenService: TokenService
  ) {}

  /**
   * listUsers(role?: string, pagination?)
   *
   * TODO: Get paginated list of users
   * - Query all users with optional role filter
   * - Return UserResponseDto array
   */
  async listUsers(role?: string, pagination?: any) {
    // TODO: Implement
  }

  /**
   * getUserById(id: string)
   *
   * TODO: Get single user by ID
   * - Find user in repository
   * - Return UserResponseDto
   */
  async getUserById(id: string) {
    // TODO: Implement
  }

  /**
   * updateUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED')
   *
   * TODO: Update user status and handle suspension
   * 1. Update user status in repository
   * 2. If status = SUSPENDED:
   *    - Get all active tokens for this user (need to track)
   *    - Blacklist all tokens in Redis
   * 3. Return updated UserResponseDto
   */
  async updateUserStatus(id: string, status: 'ACTIVE' | 'SUSPENDED') {
    // TODO: Implement
  }
}
