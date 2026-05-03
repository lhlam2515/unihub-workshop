/**
 * IAM Module
 *
 * Handles:
 * - Authentication (login, refresh, logout)
 * - User management (admin operations)
 * - Token lifecycle management
 * - Checkin staff assignments
 */

import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/database/database.module";
import { RedisModule } from "@/shared/redis/redis.module";

import { AuthController } from "./controllers/auth.controller";
import { CheckinStaffAdminController } from "./controllers/checkin-staff-admin.controller";
import { UsersAdminController } from "./controllers/users-admin.controller";
import { CheckinStaffAssignmentsRepository } from "./repositories/checkin-staff-assignments.repository";
import { StudentsRepository } from "./repositories/students.repository";
import { UsersRepository } from "./repositories/users.repository";
import { AuthService } from "./services/auth.service";
import { CheckinStaffAssignmentService } from "./services/checkin-staff-assignment.service";
import { StudentProfileService } from "./services/student-profile.service";
import { TokenService } from "./services/token.service";
import { UsersService } from "./services/users.service";
@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [
    AuthController,
    UsersAdminController,
    CheckinStaffAdminController,
  ],
  providers: [
    // Services
    AuthService,
    TokenService,
    UsersService,
    StudentProfileService,
    CheckinStaffAssignmentService,
    // Repositories
    UsersRepository,
    StudentsRepository,
    CheckinStaffAssignmentsRepository,
  ],
  exports: [AuthService, TokenService, UsersService, StudentsRepository],
})
export class IamModule {}
