function getIp(req: any): string | undefined {
  const xf = req.headers?.["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return req.ip;
}

function getUserAgent(req: any): string | undefined {
  const ua = req.headers?.["user-agent"];
  return typeof ua === "string" ? ua : undefined;
}

export async function writeAudit(
  app: any,
  req: any,
  input: {
    action: string;
    userId?: string | null;
    entityType?: string | null;
    entityId?: string | null;
    meta?: any;
  }
) {
  const ip = getIp(req);
  const ua = getUserAgent(req);

  try {
    await app.prisma.auditLog.create({
      data: {
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        ip: ip ?? null,
        userAgent: ua ?? null,
        meta: input.meta ?? null,
      },
    });
  } catch {
    // audit must never break the request
  }
}
