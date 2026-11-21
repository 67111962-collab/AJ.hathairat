// An error with an HTTP status; the error handler sends `message` to the client.
class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const badRequest = msg => new HttpError(400, msg);

module.exports = { HttpError, badRequest };
