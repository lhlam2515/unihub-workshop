/// <reference types="multer" />
import type { JwtPayload } from "./jwt-payload";

declare global {
  namespace Express {
    interface Request {
      /** JWT payload attached by JwtAuthGuard after successful verification. */
      user?: JwtPayload;
    }
  }
}
