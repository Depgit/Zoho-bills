// Error with an HTTP status; the error handler turns it into { error: message }.
// Usage: throw httpError(400, 'Fill in the vendor')
export const httpError = (status, message) => Object.assign(new Error(message), { status });
