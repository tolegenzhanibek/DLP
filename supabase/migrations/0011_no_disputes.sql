-- 0011_no_disputes: the dispute flow is removed (no admin review any more).
-- Users can only confirm a result; the dispute/resolve RPCs are closed to clients.
revoke execute on function public.dispute_scan(uuid, public.sensitivity, text) from authenticated;
revoke execute on function public.admin_resolve_scan(uuid, boolean, text) from authenticated;
