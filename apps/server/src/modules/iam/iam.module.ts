/**
 * IAM Module
 *
 * Handles:
 * - Authentication (login, refresh, logout)
 * - User management (admin operations)
 * - Token lifecycle management
 * - Device token management
 * - Checkin staff assignments
 */

import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { RedisModule } from "@/infra/redis/redis.module";

import { AuthController } from "./controllers/auth.controller";
import { CheckinStaffAdminController } from "./controllers/checkin-staff-admin.controller";
import { DeviceTokensController } from "./controllers/device-tokens.controller";
import { UsersAdminController } from "./controllers/users-admin.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { WorkshopScopeGuard } from "./guards/workshop-scope.guard";
import { CheckinStaffAssignmentsRepository } from "./repositories/checkin-staff-assignments.repository";
import { DeviceTokensRepository } from "./repositories/device-tokens.repository";
import { StudentsRepository } from "./repositories/students.repository";
import { UsersRepository } from "./repositories/users.repository";
import { AuthService } from "./services/auth.service";
import { CheckinStaffAssignmentService } from "./services/checkin-staff-assignment.service";
import { DeviceTokensService } from "./services/device-tokens.service";
import { StudentProfileService } from "./services/student-profile.service";
import { TokenService } from "./services/token.service";
import { UsersService } from "./services/users.service";

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [
    AuthController,
    UsersAdminController,
    CheckinStaffAdminController,
    DeviceTokensController,
  ],
  providers: [
    // Services
    AuthService,
    TokenService,
    UsersService,
    StudentProfileService,
    CheckinStaffAssignmentService,
    DeviceTokensService,
    // Repositories
    UsersRepository,
    StudentsRepository,
    CheckinStaffAssignmentsRepository,
    DeviceTokensRepository,
    // Guards
    JwtAuthGuard,
    RolesGuard,
    WorkshopScopeGuard,
  ],
  exports: [
    AuthService,
    TokenService,
    UsersService,
    StudentsRepository,
    UsersRepository,
    // Guards
    JwtAuthGuard,
    RolesGuard,
    WorkshopScopeGuard,
  ],
})
export class IamModule {}
