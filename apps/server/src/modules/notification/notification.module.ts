import { Module } from "@nestjs/common";

import { DatabaseModule } from "@/infra/database/database.module";
import { MessagingModule } from "@/infra/messaging/messaging.module";
import { IamModule } from "@/modules/iam/iam.module";

import { AppChannel } from "./channels/app.channel";
import { EmailChannel } from "./channels/email.channel";
import { TelegramChannel } from "./channels/telegram.channel";
import { NotificationsAdminController } from "./controllers/notifications-admin.controller";
import { NotificationChannelConfigsRepository } from "./repositories/notification-channel-configs.repository";
import { NotificationLogsRepository } from "./repositories/notification-logs.repository";
import { NotificationDispatchService } from "./services/notification-dispatch.service";
import { NotificationLogProducer } from "./services/notification-log-producer.service";
import { NotificationsService } from "./services/notifications.service";

@Module({
  imports: [DatabaseModule, MessagingModule, IamModule],
  controllers: [NotificationsAdminController],
  providers: [
    // Services
    NotificationsService,
    NotificationDispatchService,
    NotificationLogProducer,
    // Repositories
    NotificationLogsRepository,
    NotificationChannelConfigsRepository,
    // Channels
    EmailChannel,
    TelegramChannel,
    AppChannel,
  ],
  exports: [
    NotificationsService,
    NotificationDispatchService,
    NotificationLogProducer,
  ],
})
export class NotificationModule {}
