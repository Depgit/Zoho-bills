import { httpError } from '../../utils/httpError.js';

// Every error goes back as { error } so the app can show it in a popup
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err.code === 'LIMIT_FILE_SIZE') err = httpError(400, 'That file is too large — the limit is 10 MB');
  // Message + stack only: a whole error object (e.g. from axios) can carry request details and secrets
  if (!err.status || err.status >= 500) console.error(err.stack || err.message);
  res
    .status(err.status || 500)
    .json({ error: err.status ? err.message : 'Something went wrong on the server: ' + err.message });
}
