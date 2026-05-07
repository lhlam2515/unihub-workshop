import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { SharedQueueModule } from "@/infra/messaging/queue.module";

import { AppChannel } from "./channels/app.channel";
import { EmailChannel } from "./channels/email.channel";
import { TelegramChannel } from "./channels/telegram.channel";
import { NotificationsAdminController } from "./controllers/notifications-admin.controller";
import { NotificationChannelConfigsRepository } from "./repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "./repositories/notification-logs.repository";
import { NotificationDispatchService } from "./services/notification-dispatch.service";
import { NotificationsService } from "./services/notifications.service";

@Module({
  imports: [DatabaseModule, SharedQueueModule],
  controllers: [NotificationsAdminController],
  providers: [
    // Services
    NotificationsService,
    NotificationDispatchService,
    // Repositories
    NotificationLogsRepository,
    NotificationChannelConfigsRepository,
    // Channels
    EmailChannel,
    TelegramChannel,
    AppChannel,
  ],
  exports: [NotificationsService, NotificationDispatchService],
})
export class NotificationModule {}
