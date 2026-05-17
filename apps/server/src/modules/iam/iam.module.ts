/**
 * IAM Module
 *
 * Handles:
 * - Authentication (login, refresh, logout)
 * - Staff management (admin operations)
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
import { StaffAdminController } from "./controllers/staff-admin.controller";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { RolesGuard } from "./guards/roles.guard";
import { WorkshopScopeGuard } from "./guards/workshop-scope.guard";
import { CheckinStaffAssignmentsRepository } from "./repositories/checkin-staff-assignments.repository";
import { DeviceTokensRepository } from "./repositories/device-tokens.repository";
import { StaffRepository } from "./repositories/staff.repository";
import { StudentsRepository } from "./repositories/students.repository";
import { AuthService } from "./services/auth.service";
import { CheckinStaffAssignmentService } from "./services/checkin-staff-assignment.service";
import { DeviceTokensService } from "./services/device-tokens.service";
import { StaffAdminService } from "./services/staff-admin.service";
import { StudentProfileService } from "./services/student-profile.service";
import { TokenService } from "./services/token.service";

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [
    AuthController,
    StaffAdminController,
    CheckinStaffAdminController,
    DeviceTokensController,
  ],
  providers: [
    // Services
    AuthService,
    TokenService,
    StaffAdminService,
    StudentProfileService,
    CheckinStaffAssignmentService,
    DeviceTokensService,
    // Repositories
    StaffRepository,
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
    StaffAdminService,
    StaffRepository,
    StudentsRepository,
    // Guards
    JwtAuthGuard,
    RolesGuard,
    WorkshopScopeGuard,
  ],
})
export class IamModule {}
