// Social login providers (Google, LINE) (OAuth 2.0 authorization-code flow).
// Each provider knows how to build its login URL and turn a callback `code` into a profile:
//   { id, name, email, emailVerified, avatarUrl }
const config = require('./config');

async function readJson(res, what) {
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
        const detail = data?.error_description || data?.error?.message || data?.error || res.status;
        throw new Error(`${what} failed: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    }
    return data;
}

const form = obj => new URLSearchParams(obj).toString();

const providers = {
    google: {
        label: 'Google',
        authorizeUrl({ clientId, redirectUri, state }) {
            return 'https://accounts.google.com/o/oauth2/v2/auth?' + form({
                client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
                scope: 'openid email profile', state, prompt: 'select_account',
            });
        },
        async fetchProfile({ clientId, clientSecret, redirectUri, code }) {
            const token = await readJson(await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
            }), 'Google token');
            const p = await readJson(await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
                headers: { Authorization: `Bearer ${token.access_token}` },
            }), 'Google profile');
            return { id: p.sub, name: p.name, email: p.email, emailVerified: p.email_verified === true, avatarUrl: p.picture };
        },
    },


    line: {
        label: 'LINE',
        authorizeUrl({ clientId, redirectUri, state, scope }) {
            return 'https://access.line.me/oauth2/v2.1/authorize?' + form({
                response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state, scope,
            });
        },
        async fetchProfile({ clientId, clientSecret, redirectUri, code }) {
            const token = await readJson(await fetch('https://api.line.me/oauth2/v2.1/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: form({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
            }), 'LINE token');
            const p = await readJson(await fetch('https://api.line.me/v2/profile', {
                headers: { Authorization: `Bearer ${token.access_token}` },
            }), 'LINE profile');

            // Email is only available when the channel has email permission and the "email" scope was requested.
            let email = null;
            if (token.id_token && /\bemail\b/.test(config.oauth.line.scope)) {
                const v = await fetch('https://api.line.me/oauth2/v2.1/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: form({ id_token: token.id_token, client_id: clientId }),
                }).then(r => (r.ok ? r.json() : null)).catch(() => null);
                email = v?.email || null;
            }
            return { id: p.userId, name: p.displayName, email, emailVerified: !!email, avatarUrl: p.pictureUrl };
        },
    },
};

const settingsFor = name => ({
    ...config.oauth[name],
    redirectUri: `${config.publicUrl}/api/auth/oauth/${name}/callback`,
});

const isConfigured = name => !!(config.oauth[name]?.clientId && config.oauth[name]?.clientSecret);

module.exports = { providers, settingsFor, isConfigured };
