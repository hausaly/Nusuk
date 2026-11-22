export const S = { user: null, cfg: null, cleanup: null };
export const isAdmin = () => S.user?.role === 'admin';
export const logoUrl = () => `api/asset/logo?v=${S.cfg?.assets?.logo || 0}`;
