import * as path from "path";
import { inspect } from "util";

import { WinstonModule } from "nest-winston";
import * as winston from "winston";

const { combine, timestamp, errors, json, printf, colorize } = winston.format;

const formatLogValue = (value: unknown, fallback = ""): string => {
  if (value == null) {
    return fallback;
  }

  if (typeof value === "string") {
    return value;
  }

  return inspect(value, { depth: null, breakLength: Infinity });
};

const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  printf(({ timestamp, level, message, context, stack }) => {
    const contextText = formatLogValue(context, "Application");
    const messageText = formatLogValue(message);
    const stackText = formatLogValue(stack);

    return `[${formatLogValue(timestamp)}] ${formatLogValue(level)} [${contextText}]: ${messageText} ${stackText}`;
  })
);

export const winstonLogger = WinstonModule.createLogger({
  level: process.env.LOG_LEVEL || "info",
  defaultMeta: { service: "unihub-api" },
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    ...(process.env.NODE_ENV !== "production"
      ? [
          new winston.transports.File({
            filename: path.join("logs", "error.log"),
            level: "error",
            format: combine(timestamp(), errors({ stack: true }), json()),
          }),
        ]
      : []),
  ],
});
