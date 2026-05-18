export function enforceAdminToken(request: Request, adminToken: string | undefined): Response | undefined {
  if (!adminToken) return json({ ok: false, error: 'ERR_ADMIN_NOT_CONFIGURED' }, 503);

  const token = tokenFromRequest(request);
  if (token !== adminToken) return json({ ok: false, error: 'ERR_ADMIN_FORBIDDEN' }, 403);
  return undefined;
}

function tokenFromRequest(request: Request): string | undefined {
  const header = request.headers.get('x-admin-token');
  if (header) return header;

  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) return authorization.slice('Bearer '.length);

  const url = new URL(request.url);
  return url.searchParams.get('token') ?? undefined;
}

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
