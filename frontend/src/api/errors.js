// Every error in the app is shown in the popup rendered by <ErrorModal/>.
// Pass an axios error, an Error, or a plain message.
export const errMsg = (e) =>
  typeof e === 'string' ? e : e?.response?.data?.error || e?.message || 'Something went wrong';

export const showError = (e) => window.dispatchEvent(new CustomEvent('app-error', { detail: errMsg(e) }));
