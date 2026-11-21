// Logs every request to the terminal, e.g.
//   12:30:05  GET     /api/items?page=1      200   14 ms
const useColor = process.stdout.isTTY || !!process.env.FORCE_COLOR;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);

const METHOD_COLORS = { GET: 32, POST: 33, PUT: 34, PATCH: 36, DELETE: 31 };

function statusColor(status) {
    if (status >= 500) return 31;   // red
    if (status >= 400) return 33;   // yellow
    if (status >= 300) return 36;   // cyan
    return 32;                      // green
}

// Hide secrets that can appear in URLs (OAuth codes, tokens)
function safeUrl(url) {
    return url.replace(/([?&](?:code|state|token|access_token|id_token)=)[^&]*/gi, '$1***');
}

const isAsset = url => /\.(css|js|png|jpe?g|svg|ico|webp|gif|woff2?)(\?|$)/i.test(url) || url.startsWith('/api/images/');

function requestLogger(req, res, next) {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        const time = new Date().toLocaleTimeString('en-GB');
        const method = req.method.padEnd(7);
        const url = safeUrl(req.originalUrl);
        const line = [
            c(90, time),
            c(METHOD_COLORS[req.method] || 37, method),
            isAsset(url) ? c(90, url.padEnd(40)) : url.padEnd(40),
            c(statusColor(res.statusCode), String(res.statusCode)),
            c(90, `${ms.toFixed(0).padStart(4)} ms`),
        ].join('  ');
        console.log(line);
    });
    next();
}

module.exports = requestLogger;
