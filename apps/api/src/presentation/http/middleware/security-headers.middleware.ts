import { Request, Response, NextFunction } from "express";
export function securityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
) {
  response.set({
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
    "cache-control": "no-store",
  });
  next();
}
